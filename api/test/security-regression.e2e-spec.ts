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
    companyCode: `SEC-${suffix}`, companyName: 'Security regression',
    email: `security.${suffix}@example.test`, password: 'Test-only-Password-123!', fullName: 'Test Admin',
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    if (companyId) {
      const db = app.get(DatabaseService);
      await db.query('DELETE FROM audit_log WHERE company_id = $1', [companyId]);
      await db.query('DELETE FROM users WHERE company_id = $1', [companyId]);
      await db.query('DELETE FROM companies WHERE id = $1', [companyId]);
    }
    await app.close();
  });
  it('creates a new company but rejects takeover using its public code', async () => {
    const created = await request(app.getHttpServer()).post('/auth/bootstrap-admin').send(input).expect(201);
    companyId = created.body.companyId;
    await request(app.getHttpServer()).post('/auth/bootstrap-admin')
      .send({ ...input, email: `attacker.${suffix}@example.test` }).expect(409);
    const login = await request(app.getHttpServer()).post('/auth/login')
      .send({ email: input.email, password: input.password }).expect(201);
    accessToken = login.body.access_token;
    await request(app.getHttpServer()).get('/companies/00000000-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${accessToken}`).expect(403);
  });
  it('disables public onboarding outside test when not explicitly enabled', async () => {
    const oldEnv = process.env.NODE_ENV;
    const oldEnabled = process.env.BOOTSTRAP_ENABLED;
    try {
      process.env.NODE_ENV = 'production'; process.env.BOOTSTRAP_ENABLED = 'false';
      await request(app.getHttpServer()).post('/auth/bootstrap-admin').send(input).expect(403);
    } finally {
      if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
      if (oldEnabled === undefined) delete process.env.BOOTSTRAP_ENABLED; else process.env.BOOTSTRAP_ENABLED = oldEnabled;
    }
  });
  it('rejects short passwords and malformed credentials', async () => {
    await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({ ...input, password: 'short' }).expect(400);
    await request(app.getHttpServer()).post('/auth/login').send({ email: {}, password: [] }).expect(400);
  });
});
