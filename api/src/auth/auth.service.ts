import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { decode, sign, verify } from 'jsonwebtoken';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';
import { DatabaseService } from '../common/database.service';
import { hashPassword, verifyPassword } from './crypto.util';
import type {
  AuthTokenPayload,
  BootstrapAdminInput,
  LoginInput,
} from './auth.types';
import {
  loadJwtKeysFromEnv,
  resolveActiveJwtKey,
  resolveVerificationKeys,
} from './jwt-keys.util';
import { changeReason, expectedRevision } from '../common/management-input';

type UserRecord = {
  id: string;
  company_id: string;
  email: string;
  password_hash: string;
  full_name: string;
  is_active: boolean;
  session_version: number;
};

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async login(input: LoginInput, correlationId?: string) {
    if (
      typeof input.email !== 'string' ||
      typeof input.password !== 'string' ||
      !input.email.trim() ||
      !input.password
    ) {
      throw new BadRequestException('Email and password are required.');
    }

    const userResult = await this.db.query<UserRecord>(
      `SELECT u.id, u.company_id, u.email, u.password_hash, u.full_name, u.is_active, u.session_version
       FROM users u JOIN companies c ON c.id = u.company_id AND c.is_active = TRUE
       WHERE u.email = $1
       LIMIT 1`,
      [input.email.trim().toLowerCase()],
    );
    const user = userResult.rows[0];

    if (
      !user ||
      !user.is_active ||
      !verifyPassword(input.password, user.password_hash)
    ) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const mfa = await this.db.query<{
      secret_encrypted: string;
      enabled: boolean;
      last_used_step: string | null;
    }>(
      `SELECT secret_encrypted,enabled,last_used_step::text
       FROM user_mfa_totp WHERE user_id=$1`,
      [user.id],
    );
    if (mfa.rows[0]?.enabled) {
      if (typeof input.mfaCode !== 'string')
        throw new UnauthorizedException('MFA code required.');
      const secret = this.decryptMfaSecret(
        mfa.rows[0].secret_encrypted,
        user.id,
      );
      const step = this.verifyTotp(secret, input.mfaCode);
      if (!step) throw new UnauthorizedException('Invalid MFA code.');
      const lastStep = mfa.rows[0].last_used_step
        ? Number(mfa.rows[0].last_used_step)
        : 0;
      if (step <= lastStep)
        throw new UnauthorizedException('MFA code already used.');
      await this.db.query(
        `UPDATE user_mfa_totp SET last_used_step=$2,updated_at=NOW() WHERE user_id=$1`,
        [user.id, step],
      );
      await this.db.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'user.login_mfa.success','users',$2,'{}')`,
        [user.company_id, user.id],
      );
    }

    const rolesResult = await this.db.query<{ code: string }>(
      `SELECT r.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [user.id],
    );

    const payload: AuthTokenPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.company_id,
      roles: rolesResult.rows.map((row) => row.code),
      sessionVersion: user.session_version,
    };
    const activeKey = this.getActiveJwtKey();
    const token = sign(payload, activeKey.secret, {
      expiresIn: '8h',
      keyid: activeKey.kid,
    });
    await this.db.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, correlation_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        user.company_id,
        user.id,
        'user.login_success',
        'users',
        user.id,
        correlationId ?? null,
        JSON.stringify({ email: user.email }),
      ],
    );

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 8 * 60 * 60,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        companyId: user.company_id,
        roles: payload.roles,
        permissions: await this.getEffectivePermissions(user.id, user.company_id),
      },
    };
  }

  verifyAccessToken(token: string): AuthTokenPayload {
    const decoded = decode(token, { complete: true }) as {
      header?: { kid?: string };
    } | null;
    const candidateKeys = resolveVerificationKeys(
      this.getJwtKeys(),
      decoded?.header?.kid,
    );
    for (const key of candidateKeys) {
      try {
        return verify(token, key.secret) as AuthTokenPayload;
      } catch {
        // keep trying next key for secret rotation compatibility
      }
    }
    throw new UnauthorizedException('Invalid or expired token.');
  }

  async authenticateAccessToken(token: string): Promise<AuthTokenPayload> {
    const payload = this.verifyAccessToken(token);
    const result = await this.db.query<{ session_version: number }>(
      `SELECT u.session_version FROM users u
       JOIN companies c ON c.id = u.company_id AND c.is_active = TRUE
       WHERE u.id = $1 AND u.company_id = $2 AND u.is_active = TRUE`,
      [payload.sub, payload.companyId],
    );
    if (
      !result.rows[0] ||
      result.rows[0].session_version !== (payload.sessionVersion ?? 0)
    ) {
      throw new UnauthorizedException('Session revoked. Sign in again.');
    }
    const user = await this.getCurrentUser(payload.sub);
    const permissions = await this.getEffectivePermissions(
      user.id,
      user.companyId,
    );
    return { ...payload, roles: user.roles, permissions, email: user.email };
  }

  async getEffectivePermissions(
    userId: string,
    companyId: string,
  ): Promise<string[]> {
    const rolePermissions = await this.db.query<{ code: string }>(
      `SELECT DISTINCT p.code
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.code = rp.permission_code
       WHERE u.id = $1 AND u.company_id = $2 AND u.is_active = TRUE
       ORDER BY p.code`,
      [userId, companyId],
    );
    const base = rolePermissions.rows.map((row) => row.code);
    let effective = new Set<string>(base);
    if (effective.has('*')) {
      const catalog = await this.db.query<{ code: string }>(
        `SELECT code FROM permissions WHERE code <> '*'`,
      );
      effective = new Set(catalog.rows.map((row) => row.code));
    }
    const overrides = await this.db.query<{
      permission_code: string;
      effect: 'grant' | 'deny';
    }>(
      `SELECT permission_code,effect
       FROM company_permission_overrides
       WHERE company_id=$1`,
      [companyId],
    );
    for (const override of overrides.rows) {
      if (override.permission_code === '*' && override.effect === 'deny') {
        effective.clear();
        continue;
      }
      if (override.permission_code === '*' && override.effect === 'grant') {
        effective.add('*');
        continue;
      }
      if (override.effect === 'deny') effective.delete(override.permission_code);
      else effective.add(override.permission_code);
    }
    return [...effective].sort();
  }

  async getRbacState(user: AuthTokenPayload) {
    const permissions = await this.db.query<{
      code: string;
      resource: string;
      action: string;
      description: string;
    }>(
      `SELECT code,resource,action,description
       FROM permissions ORDER BY code`,
    );
    const roles = await this.db.query<{
      code: string;
      name: string;
      description: string;
    }>(
      `SELECT code,name,COALESCE(description,'') AS description
       FROM roles ORDER BY code`,
    );
    const overrides = await this.db.query<{
      permission_code: string;
      effect: 'grant' | 'deny';
    }>(
      `SELECT permission_code,effect
       FROM company_permission_overrides
       WHERE company_id=$1 ORDER BY permission_code`,
      [user.companyId],
    );
    const revision = await this.db.query<{ rbac_revision: number }>(
      `SELECT rbac_revision FROM companies WHERE id=$1`,
      [user.companyId],
    );
    return {
      revision: revision.rows[0]?.rbac_revision ?? 0,
      permissions: permissions.rows,
      roles: roles.rows,
      overrides: overrides.rows,
    };
  }

  async updateRbacOverrides(
    user: AuthTokenPayload,
    input: {
      expectedRevision: number;
      reason: string;
      overrides: Array<{ permissionCode: string; effect: 'grant' | 'deny' }>;
    },
  ) {
    const revision = expectedRevision(input.expectedRevision);
    const reason = changeReason(input.reason);
    if (!Array.isArray(input.overrides))
      throw new BadRequestException('overrides must be an array.');
    const normalized = new Map<string, 'grant' | 'deny'>();
    for (const override of input.overrides) {
      if (
        !override ||
        typeof override.permissionCode !== 'string' ||
        (override.effect !== 'grant' && override.effect !== 'deny')
      )
        throw new BadRequestException('Invalid permission override.');
      normalized.set(override.permissionCode, override.effect);
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [user.companyId]);
      const current = await client.query<{ rbac_revision: number }>(
        'SELECT rbac_revision FROM companies WHERE id=$1',
        [user.companyId],
      );
      if (current.rows[0]?.rbac_revision !== revision)
        throw new ConflictException('RBAC configuration changed. Reload before editing.');
      const before = await client.query<{
        permission_code: string;
        effect: 'grant' | 'deny';
      }>(
        'SELECT permission_code,effect FROM company_permission_overrides WHERE company_id=$1',
        [user.companyId],
      );
      if (normalized.size) {
        const permissionRows = await client.query<{ code: string }>(
          `SELECT code FROM permissions WHERE code = ANY($1::text[])`,
          [[...normalized.keys()]],
        );
        const valid = new Set(permissionRows.rows.map((row) => row.code));
        for (const code of normalized.keys()) {
          if (!valid.has(code))
            throw new BadRequestException(`Unknown permission: ${code}`);
        }
      }
      await client.query(
        'DELETE FROM company_permission_overrides WHERE company_id=$1',
        [user.companyId],
      );
      for (const [code, effect] of normalized) {
        await client.query(
          `INSERT INTO company_permission_overrides(company_id,permission_code,effect,updated_by)
           VALUES($1,$2,$3,$4)`,
          [user.companyId, code, effect, user.sub],
        );
      }
      await client.query(
        'UPDATE companies SET rbac_revision=rbac_revision+1,updated_at=NOW() WHERE id=$1',
        [user.companyId],
      );
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'rbac.overrides.update','company',$4,$3)`,
        [
          user.companyId,
          user.sub,
          JSON.stringify({
            before: before.rows,
            after: [...normalized].map(([permissionCode, effect]) => ({
              permissionCode,
              effect,
            })),
            reason,
            revision: revision + 1,
          }),
          user.companyId,
        ],
      );
      await client.query('COMMIT');
      return { revision: revision + 1 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getMfaStatus(user: AuthTokenPayload) {
    const result = await this.db.query<{ enabled: boolean }>(
      'SELECT enabled FROM user_mfa_totp WHERE user_id=$1',
      [user.sub],
    );
    return { enabled: result.rows[0]?.enabled === true, configured: Boolean(result.rows[0]) };
  }

  async setupMfa(user: AuthTokenPayload) {
    const existing = await this.db.query<{ enabled: boolean }>(
      'SELECT enabled FROM user_mfa_totp WHERE user_id=$1',
      [user.sub],
    );
    if (existing.rows[0]?.enabled) return { enabled: true, configured: true };
    const secret = this.randomBase32(20);
    const encrypted = this.encryptMfaSecret(secret, user.sub);
    await this.db.query(
      `INSERT INTO user_mfa_totp(user_id,secret_encrypted,enabled,revision)
       VALUES($1,$2,FALSE,0)
       ON CONFLICT(user_id) DO UPDATE SET
         secret_encrypted=EXCLUDED.secret_encrypted,enabled=FALSE,revision=user_mfa_totp.revision+1,updated_at=NOW()`,
      [user.sub, encrypted],
    );
    await this.auditIdentity(user, 'user.mfa.setup.created', user.sub);
    const issuer = encodeURIComponent(process.env.MFA_ISSUER_NAME || 'ERP360');
    const account = encodeURIComponent(user.email);
    return {
      enabled: false,
      configured: true,
      secret,
      otpauthUri: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    };
  }

  async verifyMfa(user: AuthTokenPayload, code: string) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      throw new BadRequestException('code must be a 6-digit MFA code.');
    }
    const row = await this.db.query<{
      secret_encrypted: string;
      last_used_step: string | null;
    }>(
      'SELECT secret_encrypted,last_used_step::text FROM user_mfa_totp WHERE user_id=$1',
      [user.sub],
    );
    if (!row.rows[0])
      throw new BadRequestException('MFA setup was not created.');
    const secret = this.decryptMfaSecret(
      row.rows[0].secret_encrypted,
      user.sub,
    );
    const step = this.verifyTotp(secret, code);
    if (!step) throw new UnauthorizedException('Invalid MFA code.');
    await this.db.query(
      `UPDATE user_mfa_totp SET enabled=TRUE,enabled_at=COALESCE(enabled_at,NOW()),last_used_step=$2,revision=revision+1,updated_at=NOW()
       WHERE user_id=$1`,
      [user.sub, step],
    );
    await this.db.query(
      `UPDATE users SET session_version=session_version+1,updated_at=NOW() WHERE id=$1 AND company_id=$2`,
      [user.sub, user.companyId],
    );
    await this.auditIdentity(user, 'user.mfa.enabled', user.sub);
    return { enabled: true };
  }

  async disableMfa(user: AuthTokenPayload, code: string) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      throw new BadRequestException('code must be a 6-digit MFA code.');
    }
    const row = await this.db.query<{ secret_encrypted: string }>(
      'SELECT secret_encrypted FROM user_mfa_totp WHERE user_id=$1 AND enabled=TRUE',
      [user.sub],
    );
    if (!row.rows[0]) return { enabled: false };
    const secret = this.decryptMfaSecret(
      row.rows[0].secret_encrypted,
      user.sub,
    );
    if (!this.verifyTotp(secret, code))
      throw new UnauthorizedException('Invalid MFA code.');
    await this.db.query(
      `UPDATE user_mfa_totp SET enabled=FALSE,last_used_step=NULL,revision=revision+1,updated_at=NOW() WHERE user_id=$1`,
      [user.sub],
    );
    await this.db.query(
      `UPDATE users SET session_version=session_version+1,updated_at=NOW() WHERE id=$1 AND company_id=$2`,
      [user.sub, user.companyId],
    );
    await this.auditIdentity(user, 'user.mfa.disabled', user.sub);
    return { enabled: false };
  }

  private mfaKey() {
    const source =
      process.env.MFA_CREDENTIAL_KEY || process.env.ASSISTANT_CREDENTIAL_KEY;
    if (!source || !/^[A-Za-z0-9+/]{43}=$/.test(source)) {
      throw new ServiceUnavailableException(
        'Falta MFA_CREDENTIAL_KEY o una clave de cifrado válida en el servidor.',
      );
    }
    const key = Buffer.from(source, 'base64');
    if (key.length !== 32)
      throw new ServiceUnavailableException('Clave MFA no válida.');
    return key;
  }

  private encryptMfaSecret(secret: string, userId: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.mfaKey(), iv);
    cipher.setAAD(Buffer.from(`erp360-mfa-v1:${userId.toLowerCase()}`));
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }

  private decryptMfaSecret(value: string, userId: string) {
    try {
      const [version, iv, tag, ciphertext, extra] = value.split('.');
      if (version !== 'v1' || !iv || !tag || !ciphertext || extra)
        throw new Error('Invalid MFA envelope');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.mfaKey(),
        Buffer.from(iv, 'base64'),
      );
      decipher.setAAD(Buffer.from(`erp360-mfa-v1:${userId.toLowerCase()}`));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new UnauthorizedException(
        'No se pudo descifrar el factor MFA. Solicita restablecerlo.',
      );
    }
  }

  private randomBase32(length: number) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = randomBytes(length);
    let bits = '';
    for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
    let result = '';
    for (let index = 0; index + 5 <= bits.length; index += 5) {
      result += alphabet[parseInt(bits.slice(index, index + 5), 2)];
    }
    return result;
  }

  private base32Decode(value: string) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const normalized = value.toUpperCase().replace(/=+$/, '');
    let bits = '';
    for (const char of normalized) {
      const index = alphabet.indexOf(char);
      if (index < 0) throw new BadRequestException('MFA secret inválido.');
      bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
  }

  private verifyTotp(secret: string, code: string) {
    const key = this.base32Decode(secret);
    const nowStep = Math.floor(Date.now() / 30000);
    for (let step = nowStep - 1; step <= nowStep + 1; step++) {
      const counter = Buffer.alloc(8);
      counter.writeBigUInt64BE(BigInt(step));
      const digest = createHmac('sha1', key).update(counter).digest();
      const offset = digest[digest.length - 1] & 0xf;
      const binary =
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff);
      const expected = (binary % 1000000).toString().padStart(6, '0');
      if (expected === code) return step;
    }
    return null;
  }

  async revokeSessions(user: AuthTokenPayload, userId = user.sub) {
    const result = await this.db.query(
      `UPDATE users SET session_version = session_version + 1, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 RETURNING id`,
      [userId, user.companyId],
    );
    if (!result.rows[0])
      throw new BadRequestException('User not found in current company.');
    await this.auditIdentity(user, 'user.sessions.revoke', userId);
    return { revoked: true };
  }

  async listUsers(user: AuthTokenPayload) {
    const result = await this.db.query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.management_revision,
             COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles,
             COALESCE(m.enabled,FALSE) AS mfa_enabled
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN user_mfa_totp m ON m.user_id=u.id
       WHERE u.company_id = $1 GROUP BY u.id,m.enabled ORDER BY u.full_name`,
      [user.companyId],
    );
    return result.rows;
  }

  async createUser(
    user: AuthTokenPayload,
    input: { email: string; fullName: string; roles: string[] },
  ) {
    this.validateIdentity(input);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const created = await client.query<{ id: string }>(
        `INSERT INTO users(company_id, email, full_name, password_hash)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [
          user.companyId,
          input.email.trim().toLowerCase(),
          input.fullName.trim(),
          hashPassword(randomBytes(32).toString('hex')),
        ],
      );
      for (const role of input.roles) {
        await client.query(
          `INSERT INTO user_roles(user_id, role_id)
                            SELECT $1,id FROM roles WHERE code = $2`,
          [created.rows[0].id, role],
        );
      }
      const token = randomBytes(32).toString('hex');
      await client.query(
        `INSERT INTO user_password_resets(company_id,user_id,token_hash,expires_at,created_by)
         VALUES($1,$2,$3,NOW() + INTERVAL '24 hours',$4)`,
        [
          user.companyId,
          created.rows[0].id,
          this.hashResetToken(token),
          user.sub,
        ],
      );
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id)
         VALUES($1,$2,'user.invite','users',$3)`,
        [user.companyId, user.sub, created.rows[0].id],
      );
      await client.query('COMMIT');
      return {
        id: created.rows[0].id,
        activationToken: token,
        expiresInHours: 24,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('Email already registered.');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateUser(
    user: AuthTokenPayload,
    id: string,
    input: {
      fullName: string;
      roles: string[];
      isActive: boolean;
      expectedRevision: number;
      reason: string;
    },
  ) {
    this.validateIdentity({ ...input, email: user.email });
    const revision = expectedRevision(input.expectedRevision);
    const reason = changeReason(input.reason);
    if (typeof input.isActive !== 'boolean')
      throw new BadRequestException('isActive must be boolean.');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // Serialize membership changes so two administrators cannot disable the last administrator.
      await client.query('SELECT id FROM companies WHERE id = $1 FOR UPDATE', [
        user.companyId,
      ]);
      const target = await client.query<{
        full_name: string;
        is_active: boolean;
        management_revision: number;
      }>(
        'SELECT full_name,is_active,management_revision FROM users WHERE id=$1 AND company_id=$2 FOR UPDATE',
        [id, user.companyId],
      );
      if (!target.rows[0])
        throw new BadRequestException('User not found in current company.');
      if (target.rows[0].management_revision !== revision)
        throw new ConflictException('User changed. Reload before editing.');
      const roles = await client.query<{ code: string }>(
        'SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 ORDER BY r.code',
        [id],
      );
      if (!input.isActive || !input.roles.includes('admin')) {
        const admins = await client.query(
          `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
           WHERE u.company_id=$1 AND u.is_active=TRUE AND r.code='admin' AND u.id<>$2`,
          [user.companyId, id],
        );
        if (!admins.rows.length)
          throw new BadRequestException(
            'At least one active administrator must remain.',
          );
      }
      await client.query(
        `UPDATE users SET full_name=$1,is_active=$2,session_version=session_version+1,management_revision=management_revision+1,updated_at=NOW()
         WHERE id=$3 AND company_id=$4`,
        [input.fullName.trim(), input.isActive, id, user.companyId],
      );
      await client.query('DELETE FROM user_roles WHERE user_id=$1', [id]);
      for (const role of input.roles) {
        await client.query(
          'INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code=$2',
          [id, role],
        );
      }
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'user.update','users',$3,$4)`,
        [
          user.companyId,
          user.sub,
          id,
          JSON.stringify({
            before: {
              ...target.rows[0],
              roles: roles.rows.map((row) => row.code),
            },
            after: {
              full_name: input.fullName.trim(),
              is_active: input.isActive,
              roles: [...input.roles].sort(),
              management_revision: revision + 1,
            },
            reason,
          }),
        ],
      );
      await client.query('COMMIT');
      return { id, revision: revision + 1 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async resetUserMfa(
    user: AuthTokenPayload,
    id: string,
    input: { expectedRevision: number; reason: string },
  ) {
    const revision = expectedRevision(input.expectedRevision);
    const reason = changeReason(input.reason);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<{ id: string; management_revision: number }>(
        `SELECT id, management_revision
         FROM users
         WHERE id=$1 AND company_id=$2 AND is_active=TRUE
         FOR UPDATE`,
        [id, user.companyId],
      );
      if (!target.rows[0])
        throw new BadRequestException('Active user not found in current company.');
      if (target.rows[0].management_revision !== revision)
        throw new ConflictException('User changed. Reload before resetting MFA.');

      const mfa = await client.query(
        'SELECT user_id,enabled FROM user_mfa_totp WHERE user_id=$1 AND enabled=TRUE FOR UPDATE',
        [id],
      );
      if (!mfa.rows[0])
        throw new BadRequestException('MFA is not enabled for this user.');

      await client.query(
        `UPDATE users
         SET management_revision=management_revision+1,
             session_version=session_version+1,
             updated_at=NOW()
         WHERE id=$1 AND company_id=$2`,
        [id, user.companyId],
      );
      await client.query('DELETE FROM user_mfa_totp WHERE user_id=$1', [id]);
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'user.mfa.reset','users',$3,$4)`,
        [
          user.companyId,
          user.sub,
          id,
          JSON.stringify({ enabled: true, reset: true, reason }),
        ],
      );
      await client.query('COMMIT');
      return { reset: true, revision: revision + 1 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async issuePasswordReset(user: AuthTokenPayload, id: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query(
        'SELECT id FROM users WHERE id=$1 AND company_id=$2 AND is_active=TRUE FOR UPDATE',
        [id, user.companyId],
      );
      if (!target.rows[0])
        throw new BadRequestException(
          'Active user not found in current company.',
        );
      await client.query(
        'UPDATE user_password_resets SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',
        [id],
      );
      const token = randomBytes(32).toString('hex');
      await client.query(
        `INSERT INTO user_password_resets(company_id,user_id,token_hash,expires_at,created_by)
         VALUES($1,$2,$3,NOW() + INTERVAL '1 hour',$4)`,
        [user.companyId, id, this.hashResetToken(token), user.sub],
      );
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id)
         VALUES($1,$2,'user.password_reset.issue','users',$3)`,
        [user.companyId, user.sub, id],
      );
      await client.query('COMMIT');
      return { resetToken: token, expiresInHours: 1 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async resetPassword(input: { token: string; password: string }) {
    if (
      typeof input.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.token) ||
      typeof input.password !== 'string' ||
      input.password.length < 12 ||
      input.password.length > 256
    ) {
      throw new BadRequestException(
        'Use a valid token and a password of 12 to 256 characters.',
      );
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const reset = await client.query<{ user_id: string; company_id: string }>(
        `UPDATE user_password_resets SET used_at=NOW()
         WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() RETURNING user_id,company_id`,
        [this.hashResetToken(input.token)],
      );
      if (!reset.rows[0])
        throw new BadRequestException('Reset token is invalid or expired.');
      const updated = await client.query(
        `UPDATE users SET password_hash=$1,session_version=session_version+1,updated_at=NOW()
         WHERE id=$2 AND company_id=$3 AND is_active=TRUE RETURNING id`,
        [
          hashPassword(input.password),
          reset.rows[0].user_id,
          reset.rows[0].company_id,
        ],
      );
      if (!updated.rows[0])
        throw new BadRequestException('Account is unavailable.');
      await client.query(
        `UPDATE user_password_resets SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL`,
        [reset.rows[0].user_id],
      );
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id)
         VALUES($1,$2::uuid,'user.password_reset.complete','users',($2::uuid)::text)`,
        [reset.rows[0].company_id, reset.rows[0].user_id],
      );
      await client.query('COMMIT');
      return { changed: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private validateIdentity(input: {
    email: string;
    fullName: string;
    roles: string[];
  }) {
    if (
      typeof input.email !== 'string' ||
      input.email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ||
      typeof input.fullName !== 'string' ||
      !input.fullName.trim() ||
      input.fullName.length > 180 ||
      !Array.isArray(input.roles) ||
      input.roles.length === 0 ||
      new Set(input.roles).size !== input.roles.length ||
      input.roles.some(
        (role) => !['admin', 'sales', 'purchases', 'employee'].includes(role),
      )
    ) {
      throw new BadRequestException(
        'Valid name, email and recognized unique roles are required.',
      );
    }
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async auditIdentity(
    user: AuthTokenPayload,
    event: string,
    id: string,
  ) {
    await this.db.query(
      `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id)
       VALUES($1,$2,$3,'users',$4)`,
      [user.companyId, user.sub, event, id],
    );
  }

  async getCurrentUser(userId: string) {
    const userResult = await this.db.query<{
      id: string;
      company_id: string;
      email: string;
      full_name: string;
      is_active: boolean;
    }>(
      `SELECT id, company_id, email, full_name, is_active
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId],
    );
    const user = userResult.rows[0];
    if (!user || !user.is_active) {
      throw new UnauthorizedException('User is not active.');
    }

    const rolesResult = await this.db.query<{ code: string }>(
      `SELECT r.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [user.id],
    );
    const permissions = await this.getEffectivePermissions(
      user.id,
      user.company_id,
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      companyId: user.company_id,
      roles: rolesResult.rows.map((row) => row.code),
      permissions,
    };
  }

  async bootstrapAdmin(input: BootstrapAdminInput, correlationId?: string) {
    if (
      process.env.BOOTSTRAP_ENABLED !== 'true' &&
      process.env.NODE_ENV !== 'test'
    ) {
      throw new ForbiddenException(
        'Company registration is disabled. Contact your administrator.',
      );
    }
    if (
      !input ||
      !input.email ||
      !input.password ||
      !input.companyCode ||
      typeof input.companyName !== 'string' ||
      !input.companyName.trim() ||
      typeof input.fullName !== 'string' ||
      !input.fullName.trim()
    ) {
      throw new BadRequestException(
        'Missing required fields for bootstrap admin.',
      );
    }
    if (
      typeof input.password !== 'string' ||
      input.password.length < 12 ||
      typeof input.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
      typeof input.companyCode !== 'string' ||
      !/^[A-Za-z0-9_-]{1,32}$/.test(input.companyCode)
    ) {
      throw new BadRequestException(
        'Use a valid email, company code and a password of at least 12 characters.',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('erp360.company.registration'))`,
      );

      const companyResult = await client.query<{ id: string }>(
        'SELECT id FROM companies WHERE code = $1 LIMIT 1',
        [input.companyCode],
      );
      if (companyResult.rows[0]) {
        throw new ConflictException(
          'Company already exists. Contact its administrator.',
        );
      }
      let companyId: string;
      {
        const createdCompany = await client.query<{ id: string }>(
          `INSERT INTO companies (code, name)
           VALUES ($1, $2)
           RETURNING id`,
          [input.companyCode, input.companyName],
        );
        companyId = createdCompany.rows[0].id;
      }

      const roleResult = await client.query<{ id: string }>(
        'SELECT id FROM roles WHERE code = $1 LIMIT 1',
        ['admin'],
      );
      let roleId = roleResult.rows[0]?.id;
      if (!roleId) {
        const createdRole = await client.query<{ id: string }>(
          `INSERT INTO roles (code, name, description)
           VALUES ('admin', 'Administrator', 'Full access role')
           RETURNING id`,
        );
        roleId = createdRole.rows[0].id;
      }

      const existingUser = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [input.email.toLowerCase()],
      );
      if (existingUser.rows.length > 0) {
        throw new ConflictException('User with this email already exists.');
      }

      const passwordHash = hashPassword(input.password);
      const insertedUser = await client.query<{ id: string }>(
        `INSERT INTO users (company_id, email, password_hash, full_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [companyId, input.email.toLowerCase(), passwordHash, input.fullName],
      );
      const userId = insertedUser.rows[0].id;

      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, roleId],
      );

      await client.query(
        `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, correlation_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          companyId,
          userId,
          'user.bootstrap_admin',
          'users',
          userId,
          correlationId ?? null,
          JSON.stringify({ email: input.email }),
        ],
      );

      await client.query('COMMIT');
      return { userId, companyId, roleId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private getJwtKeys() {
    return loadJwtKeysFromEnv(
      process.env.JWT_SECRETS_JSON,
      process.env.JWT_SECRET,
    );
  }

  private getActiveJwtKey() {
    return resolveActiveJwtKey(this.getJwtKeys(), process.env.JWT_ACTIVE_KID);
  }
}
