import { DatabaseService } from '../common/database.service';
import { hashPassword, verifyPassword } from './crypto.util';

export async function provisionDevAdmin(
  db: DatabaseService,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.NODE_ENV !== 'development') {
    throw new Error(
      'Development admin provisioning requires NODE_ENV=development.',
    );
  }
  const email = env.DEV_ADMIN_EMAIL?.trim().toLowerCase();
  const fullName = env.DEV_ADMIN_FULL_NAME?.trim();
  const companyCode = env.DEV_ADMIN_COMPANY_CODE?.trim();
  const password = env.DEV_ADMIN_PASSWORD;
  if (
    !email ||
    email.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !fullName ||
    fullName.length > 180 ||
    !companyCode ||
    !/^[A-Za-z0-9_-]{1,32}$/.test(companyCode) ||
    !password ||
    password.length < 12 ||
    password.length > 256
  ) {
    throw new Error(
      'Set valid DEV_ADMIN_EMAIL, DEV_ADMIN_FULL_NAME, DEV_ADMIN_COMPANY_CODE and DEV_ADMIN_PASSWORD (12 to 256 characters).',
    );
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('erp360.company.registration'))",
    );
    const company = await client.query<{ id: string }>(
      'SELECT id FROM companies WHERE code=$1 AND is_active=TRUE FOR UPDATE',
      [companyCode],
    );
    const companyId = company.rows[0]?.id;
    if (!companyId)
      throw new Error('Select an existing active development company.');

    const existing = await client.query<{
      id: string;
      company_id: string;
      full_name: string;
      password_hash: string;
      is_active: boolean;
    }>(
      'SELECT id,company_id,full_name,password_hash,is_active FROM users WHERE lower(email)=$1 FOR UPDATE',
      [email],
    );
    const current = existing.rows[0];
    if (current && current.company_id !== companyId) {
      throw new Error(
        'That email belongs to another company; provisioning cannot move users.',
      );
    }

    await client.query(
      `INSERT INTO roles(code,name,description) VALUES('admin','Administrator','Full access role')
       ON CONFLICT (code) DO NOTHING`,
    );
    let userId: string;
    let changed = false;
    if (!current) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO users(company_id,email,password_hash,full_name)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [companyId, email, hashPassword(password), fullName],
      );
      userId = created.rows[0].id;
      changed = true;
    } else {
      userId = current.id;
      const passwordMatches = verifyPassword(password, current.password_hash);
      if (
        !passwordMatches ||
        current.full_name !== fullName ||
        !current.is_active
      ) {
        await client.query(
          `UPDATE users SET password_hash=$2,full_name=$3,is_active=TRUE,
           session_version=session_version+1,management_revision=management_revision+1,updated_at=NOW()
           WHERE id=$1`,
          [
            userId,
            passwordMatches ? current.password_hash : hashPassword(password),
            fullName,
          ],
        );
        await client.query(
          'UPDATE user_password_resets SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',
          [userId],
        );
        changed = true;
      }
    }
    const membership = await client.query(
      `INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='admin'
       ON CONFLICT (user_id,role_id) DO NOTHING RETURNING user_id`,
      [userId],
    );
    changed = changed || membership.rows.length > 0;
    if (changed) {
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2::uuid,'user.dev_admin.provision','users',($2::uuid)::text,$3::jsonb)`,
        [
          companyId,
          userId,
          JSON.stringify({ provisioning_source: 'explicit_development_cli' }),
        ],
      );
    }
    await client.query('COMMIT');
    return { userId, companyId, changed };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const db = new DatabaseService();
  try {
    if (process.argv.slice(2).join(' ') !== '--confirm-development-admin') {
      throw new Error(
        'Pass only --confirm-development-admin to explicitly provision a development account.',
      );
    }
    const result = await provisionDevAdmin(db);
    console.log(
      `Development administrator ${result.userId}: ${result.changed ? 'provisioned' : 'already configured'}.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Development admin provisioning failed.',
    );
    process.exitCode = 1;
  } finally {
    await db.onModuleDestroy();
  }
}

if (require.main === module) void main();
