import { DatabaseService } from '../src/common/database.service';
import { AuthService } from '../src/auth/auth.service';
import { provisionDevAdmin } from '../src/auth/provision-dev-admin';

describe('Development admin provisioning (e2e)', () => {
  const db = new DatabaseService();
  const auth = new AuthService(db);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const env = {
    NODE_ENV: 'development',
    DEV_ADMIN_EMAIL: `dev-admin-${suffix}@example.test`,
    DEV_ADMIN_FULL_NAME: 'Development administrator test',
    DEV_ADMIN_COMPANY_CODE: `DEV${suffix}`,
    DEV_ADMIN_PASSWORD: 'Development-Test-Password-123!',
  };
  let companyId: string;

  beforeAll(async () => {
    const company = await db.query<{ id: string }>(
      'INSERT INTO companies(code,name) VALUES($1,$2) RETURNING id',
      [env.DEV_ADMIN_COMPANY_CODE, 'Development seed test'],
    );
    companyId = company.rows[0].id;
  });

  afterAll(async () => {
    try {
      if (companyId) {
        await db.query('DELETE FROM audit_log WHERE company_id=$1', [
          companyId,
        ]);
        await db.query('DELETE FROM user_password_resets WHERE company_id=$1', [
          companyId,
        ]);
        await db.query('DELETE FROM users WHERE company_id=$1', [companyId]);
        await db.query('DELETE FROM companies WHERE id=$1', [companyId]);
      }
    } finally {
      await db.onModuleDestroy();
    }
  });

  it('rejects production and invalid credentials before connecting', async () => {
    const connect = jest.spyOn(db, 'connect');
    await expect(
      provisionDevAdmin(db, { ...env, NODE_ENV: 'production' }),
    ).rejects.toThrow('NODE_ENV=development');
    await expect(
      provisionDevAdmin(db, { ...env, DEV_ADMIN_PASSWORD: 'short' }),
    ).rejects.toThrow('DEV_ADMIN_PASSWORD');
    expect(connect).not.toHaveBeenCalled();
    connect.mockRestore();
  });

  it('creates an administrator that can log in and is unchanged on repeat', async () => {
    const created = await provisionDevAdmin(db, env);
    expect(created).toMatchObject({ companyId, changed: true });
    const login = await auth.login({
      email: env.DEV_ADMIN_EMAIL,
      password: env.DEV_ADMIN_PASSWORD,
    });
    expect(login.user).toMatchObject({
      fullName: env.DEV_ADMIN_FULL_NAME,
      companyId,
      roles: ['admin'],
    });
    const repeated = await provisionDevAdmin(db, env);
    expect(repeated).toEqual({ ...created, changed: false });
    await expect(
      auth.authenticateAccessToken(login.access_token),
    ).resolves.toMatchObject({ roles: ['admin'] });
  });

  it('refuses to move an existing user to another tenant without changing credentials', async () => {
    await expect(
      provisionDevAdmin(db, {
        ...env,
        DEV_ADMIN_COMPANY_CODE: 'missing-company',
      }),
    ).rejects.toThrow('active development company');
    const other = await db.query<{ id: string }>(
      'INSERT INTO companies(code,name) VALUES($1,$2) RETURNING id',
      [`OTHER${suffix}`, 'Other development seed test'],
    );
    try {
      await expect(
        provisionDevAdmin(db, {
          ...env,
          DEV_ADMIN_COMPANY_CODE: `OTHER${suffix}`,
        }),
      ).rejects.toThrow('another company');
      const login = await auth.login({
        email: env.DEV_ADMIN_EMAIL,
        password: env.DEV_ADMIN_PASSWORD,
      });
      expect(login.user.companyId).toBe(companyId);
    } finally {
      await db.query('DELETE FROM companies WHERE id=$1', [other.rows[0].id]);
    }
  });

  it('rotates the password and revokes existing sessions and pending resets', async () => {
    const login = await auth.login({
      email: env.DEV_ADMIN_EMAIL,
      password: env.DEV_ADMIN_PASSWORD,
    });
    const identity = auth.verifyAccessToken(login.access_token);
    const reset = await auth.issuePasswordReset(identity, identity.sub);
    const nextPassword = 'Rotated-Development-Test-Password-123!';
    await provisionDevAdmin(db, { ...env, DEV_ADMIN_PASSWORD: nextPassword });
    await expect(
      auth.login({
        email: env.DEV_ADMIN_EMAIL,
        password: env.DEV_ADMIN_PASSWORD,
      }),
    ).rejects.toThrow('Invalid credentials');
    await expect(
      auth.authenticateAccessToken(login.access_token),
    ).rejects.toThrow('Session revoked');
    await expect(
      auth.resetPassword({
        token: reset.resetToken,
        password: env.DEV_ADMIN_PASSWORD,
      }),
    ).rejects.toThrow('invalid or expired');
    await expect(
      auth.login({ email: env.DEV_ADMIN_EMAIL, password: nextPassword }),
    ).resolves.toMatchObject({ user: { roles: ['admin'] } });
  });
});
