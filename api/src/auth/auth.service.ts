import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { decode, sign, verify } from 'jsonwebtoken';
import { DatabaseService } from '../common/database.service';
import { hashPassword, verifyPassword } from './crypto.util';
import type { AuthTokenPayload, BootstrapAdminInput, LoginInput } from './auth.types';
import { loadJwtKeysFromEnv, resolveActiveJwtKey, resolveVerificationKeys } from './jwt-keys.util';

type UserRecord = {
  id: string;
  company_id: string;
  email: string;
  password_hash: string;
  full_name: string;
  is_active: boolean;
};

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async login(input: LoginInput, correlationId?: string) {
    if (typeof input.email !== 'string' || typeof input.password !== 'string' || !input.email.trim() || !input.password) {
      throw new BadRequestException('Email and password are required.');
    }

    const userResult = await this.db.query<UserRecord>(
      `SELECT id, company_id, email, password_hash, full_name, is_active
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [input.email.toLowerCase()],
    );
    const user = userResult.rows[0];

    if (!user || !user.is_active || !verifyPassword(input.password, user.password_hash)) {
      throw new UnauthorizedException('Invalid credentials.');
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
      },
    };
  }

  verifyAccessToken(token: string): AuthTokenPayload {
    const decoded = decode(token, { complete: true }) as { header?: { kid?: string } } | null;
    const candidateKeys = resolveVerificationKeys(this.getJwtKeys(), decoded?.header?.kid);
    for (const key of candidateKeys) {
      try {
        return verify(token, key.secret) as AuthTokenPayload;
      } catch {
        // keep trying next key for secret rotation compatibility
      }
    }
    throw new UnauthorizedException('Invalid or expired token.');
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

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      companyId: user.company_id,
      roles: rolesResult.rows.map((row) => row.code),
    };
  }

  async bootstrapAdmin(input: BootstrapAdminInput, correlationId?: string) {
    if (process.env.BOOTSTRAP_ENABLED !== 'true' && process.env.NODE_ENV !== 'test') {
      throw new ForbiddenException('Company registration is disabled. Contact your administrator.');
    }
    if (!input || !input.email || !input.password || !input.companyCode ||
        typeof input.companyName !== 'string' || !input.companyName.trim() ||
        typeof input.fullName !== 'string' || !input.fullName.trim()) {
      throw new BadRequestException('Missing required fields for bootstrap admin.');
    }
    if (typeof input.password !== 'string' || input.password.length < 12 ||
        typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
        typeof input.companyCode !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(input.companyCode)) {
      throw new BadRequestException('Use a valid email, company code and a password of at least 12 characters.');
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('erp360.company.registration'))`);

      const companyResult = await client.query<{ id: string }>(
        'SELECT id FROM companies WHERE code = $1 LIMIT 1',
        [input.companyCode],
      );
      if (companyResult.rows[0]) {
        throw new ConflictException('Company already exists. Contact its administrator.');
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
    return loadJwtKeysFromEnv(process.env.JWT_SECRETS_JSON, process.env.JWT_SECRET);
  }

  private getActiveJwtKey() {
    return resolveActiveJwtKey(this.getJwtKeys(), process.env.JWT_ACTIVE_KID);
  }
}
