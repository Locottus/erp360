import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Identity lifecycle and master catalogs (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let secondToken: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const password = 'Test-Only-Password-12345!';
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init();
    const bootstrap = async (code: string) => {
      const email = `${code}@example.test`;
      await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
        companyCode: code, companyName: code, email, password, fullName: 'Lifecycle test',
      }).expect(201);
      return (await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201)).body.access_token as string;
    };
    token = await bootstrap(`ID${suffix}`);
    secondToken = await bootstrap(`OT${suffix}`);
  });
  afterAll(async () => { await app.close(); });

  it('activates a user, rejects token reuse, enforces tenant and revokes sessions', async () => {
    const email = `invited-${suffix}@example.test`;
    const invitation = await request(app.getHttpServer()).post('/auth/users').auth(token, { type: 'bearer' })
      .send({ email, fullName: 'Invited', roles: ['employee'] }).expect(201);
    const reset = { token: invitation.body.activationToken, password };
    await request(app.getHttpServer()).post('/auth/reset-password').send(reset).expect(201);
    await request(app.getHttpServer()).post('/auth/reset-password').send(reset).expect(400);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
    await request(app.getHttpServer()).get('/auth/users').auth(login.body.access_token, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).post(`/auth/users/${invitation.body.id}/reset-password`)
      .auth(secondToken, { type: 'bearer' }).send({}).expect(400);
    await request(app.getHttpServer()).post(`/auth/users/${invitation.body.id}/revoke-sessions`)
      .auth(token, { type: 'bearer' }).send({}).expect(201);
    await request(app.getHttpServer()).get('/auth/me').auth(login.body.access_token, { type: 'bearer' }).expect(401);
    const listing = await request(app.getHttpServer()).get('/auth/users').auth(token, { type: 'bearer' }).expect(200);
    expect(listing.body.every((user: Record<string, unknown>) => !('password_hash' in user))).toBe(true);
    const admin = listing.body.find((user: { roles: string[] }) => user.roles.includes('admin'));
    await request(app.getHttpServer()).patch(`/auth/users/${admin.id}`).auth(token, { type: 'bearer' })
      .send({ fullName: 'Admin', roles: ['employee'], isActive: false }).expect(400);
  });

  it('edits without destroying historical keys and rolls back an entire duplicate import', async () => {
    const product = await request(app.getHttpServer()).post('/masters/products').auth(token, { type: 'bearer' })
      .send({ sku: 'FIXED', name: 'Before', unitPrice: 1 }).expect(201);
    await request(app.getHttpServer()).patch(`/masters/products/${product.body.id}`).auth(secondToken, { type: 'bearer' })
      .send({ sku: 'FIXED', name: 'Cross tenant', unitPrice: 2 }).expect(404);
    await request(app.getHttpServer()).patch(`/masters/products/${product.body.id}`).auth(token, { type: 'bearer' })
      .send({ sku: 'CHANGED', name: 'Wrong', unitPrice: 2 }).expect(400);
    await request(app.getHttpServer()).patch(`/masters/products/${product.body.id}`).auth(token, { type: 'bearer' })
      .send({ sku: 'FIXED', name: 'After', unitPrice: 2, isActive: false }).expect(200);
    await request(app.getHttpServer()).post('/masters/products/import').auth(token, { type: 'bearer' })
      .send({ records: [{ sku: 'ROLLBACK', name: 'Not persisted', unitPrice: 1 }, { sku: 'FIXED', name: 'Duplicate', unitPrice: 1 }] }).expect(409);
    const products = await request(app.getHttpServer()).get('/masters/products').auth(token, { type: 'bearer' }).expect(200);
    expect(products.body.some((row: { sku: string }) => row.sku === 'ROLLBACK')).toBe(false);
    expect(products.body.find((row: { sku: string }) => row.sku === 'FIXED').is_active).toBe(false);
    await request(app.getHttpServer()).post('/masters/products/import').auth(token, { type: 'bearer' })
      .send({ records: [{ sku: 'VALID', name: 'Imported', unitPrice: 5 }] }).expect(201);
  });
});
