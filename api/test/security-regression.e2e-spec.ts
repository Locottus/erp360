import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('Tenant onboarding security', () => {
  let app: INestApplication;
  let companyId: string;
  let accessToken: string;
  const suffix = Date.now().toString();
  const input = {
    companyCode: `SEC-${suffix}`,
    companyName: 'Security regression',
    email: `security.${suffix}@example.test`,
    password: 'Test-only-Password-123!',
    fullName: 'Test Admin',
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    if (companyId) {
      const db = app.get(DatabaseService);
      await db.query('DELETE FROM audit_log WHERE company_id = $1', [
        companyId,
      ]);
      await db.query('DELETE FROM user_password_resets WHERE company_id = $1', [
        companyId,
      ]);
      await db.query('DELETE FROM users WHERE company_id = $1', [companyId]);
      await db.query('DELETE FROM companies WHERE id = $1', [companyId]);
    }
    await app.close();
  });
  it('creates a new company but rejects takeover using its public code', async () => {
    const created = await request(app.getHttpServer())
      .post('/auth/bootstrap-admin')
      .send(input)
      .expect(201);
    companyId = created.body.companyId;
    await request(app.getHttpServer())
      .post('/auth/bootstrap-admin')
      .send({ ...input, email: `attacker.${suffix}@example.test` })
      .expect(409);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(201);
    accessToken = login.body.access_token;
    await request(app.getHttpServer())
      .get('/companies/00000000-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });
  it('disables public onboarding outside test when not explicitly enabled', async () => {
    const oldEnv = process.env.NODE_ENV;
    const oldEnabled = process.env.BOOTSTRAP_ENABLED;
    try {
      process.env.NODE_ENV = 'production';
      process.env.BOOTSTRAP_ENABLED = 'false';
      await request(app.getHttpServer())
        .post('/auth/bootstrap-admin')
        .send(input)
        .expect(403);
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = oldEnv;
      if (oldEnabled === undefined) delete process.env.BOOTSTRAP_ENABLED;
      else process.env.BOOTSTRAP_ENABLED = oldEnabled;
    }
  });
  it('rejects short passwords and malformed credentials', async () => {
    await request(app.getHttpServer())
      .post('/auth/bootstrap-admin')
      .send({ ...input, password: 'short' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: {}, password: [] })
      .expect(400);
  });
  it('applies role revocation to the next request without replacing the JWT', async () => {
    const email = `permission-revoked.${suffix}@example.test`;
    const invitation = await request(app.getHttpServer())
      .post('/auth/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email, fullName: 'Permission revocation', roles: ['sales'] })
      .expect(201);
    const password = 'Permission-Revocation-Only-123!';
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: invitation.body.activationToken, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    const employeeToken = login.body.access_token;
    await request(app.getHttpServer())
      .get('/masters/customers')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    await app
      .get(DatabaseService)
      .query('DELETE FROM user_roles WHERE user_id = $1', [invitation.body.id]);

    await request(app.getHttpServer())
      .get('/masters/customers')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
  });

  it('grants and denies a company permission with an audited revision', async () => {
    const email = `rbac-override.${suffix}@example.test`;
    const invitation = await request(app.getHttpServer())
      .post('/auth/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email, fullName: 'RBAC override', roles: ['employee'] })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        token: invitation.body.activationToken,
        password: 'RBAC-Override-Only-123!',
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'RBAC-Override-Only-123!' })
      .expect(201);
    const employeeToken = login.body.access_token;

    await request(app.getHttpServer())
      .get('/masters/customers')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);

    const state = await request(app.getHttpServer())
      .get('/auth/rbac')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch('/auth/rbac/overrides')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expectedRevision: state.body.revision,
        reason: 'Prueba controlada de otorgamiento del permiso',
        overrides: [
          { permissionCode: 'masters.customers.read', effect: 'grant' },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .get('/masters/customers')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch('/auth/rbac/overrides')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expectedRevision: state.body.revision + 1,
        reason: 'Prueba controlada de denegacion del permiso',
        overrides: [
          { permissionCode: 'masters.customers.read', effect: 'deny' },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .get('/masters/customers')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch('/auth/rbac/overrides')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expectedRevision: state.body.revision + 2,
        reason: 'Restaurar la configuracion RBAC de la empresa',
        overrides: [],
      })
      .expect(200);
  });

  it('rejects stale RBAC revisions', async () => {
    await request(app.getHttpServer())
      .patch('/auth/rbac/overrides')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expectedRevision: 999,
        reason: 'Intento de revision desactualizada',
        overrides: [],
      })
      .expect(409);
  });

  it('cannot deactivate or demote the last effective administrator', async () => {
    const users = await request(app.getHttpServer())
      .get('/auth/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const admin = users.body.find(
      (candidate: { roles: string[] }) => candidate.roles.includes('admin'),
    );
    expect(admin).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/auth/users/${admin.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fullName: admin.full_name,
        roles: ['employee'],
        isActive: false,
        expectedRevision: admin.management_revision,
        reason: 'Intento bloqueado de quitar el ultimo administrador',
      })
      .expect(400);
  });
});
