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

  it('restricts financial and fiscal reads to administrators', async () => {
    const paths = ['/accounting/reports/trial-balance', '/fiscal/documents',
      '/fiscal/documents/00000000-0000-0000-0000-000000000001'];
    for (const role of ['employee', 'sales', 'purchases']) {
      const email = `finance-${role}-${suffix}@example.test`;
      const invitation = await request(app.getHttpServer()).post('/auth/users').auth(token, { type: 'bearer' })
        .send({ email, fullName: role, roles: [role] }).expect(201);
      await request(app.getHttpServer()).post('/auth/reset-password').send({ token: invitation.body.activationToken, password }).expect(201);
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
      for (const path of paths) {
        await request(app.getHttpServer()).get(path).auth(login.body.access_token, { type: 'bearer' }).expect(403);
      }
    }
    await request(app.getHttpServer()).get(paths[0]).auth(token, { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).get(paths[1]).auth(token, { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).get(paths[2]).auth(token, { type: 'bearer' }).expect(404);
    for (const path of paths) await request(app.getHttpServer()).get(path).expect(401);
  });

  it('separates sales and purchase reads across HTTP and RPC', async () => {
    const salesPaths = ['/masters/customers', '/commerce/sales/quotations', '/commerce/sales/orders',
      '/commerce/sales/invoices', '/inventory/sales-orders'];
    const purchasePaths = ['/masters/suppliers', '/commerce/purchases/requests'];
    const pdf = '/commerce/sales/invoices/00000000-0000-0000-0000-000000000001/pdf';
    for (const role of ['employee', 'sales', 'purchases']) {
      const email = `commercial-${role}-${suffix}@example.test`;
      const invitation = await request(app.getHttpServer()).post('/auth/users').auth(token, { type: 'bearer' })
        .send({ email, fullName: role, roles: [role] }).expect(201);
      await request(app.getHttpServer()).post('/auth/reset-password').send({ token: invitation.body.activationToken, password }).expect(201);
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
      for (const path of salesPaths) {
        await request(app.getHttpServer()).get(path).auth(login.body.access_token, { type: 'bearer' }).expect(role === 'sales' ? 200 : 403);
      }
      for (const path of purchasePaths) {
        await request(app.getHttpServer()).get(path).auth(login.body.access_token, { type: 'bearer' }).expect(role === 'purchases' ? 200 : 403);
      }
      await request(app.getHttpServer()).get(pdf).auth(login.body.access_token, { type: 'bearer' }).expect(role === 'sales' ? 404 : 403);
      const xml = `<?xml version="1.0"?><methodCall><methodName>object.execute_kw</methodName><params>
        <param><value><string>${login.body.access_token}</string></value></param>
        <param><value><string>sale.order</string></value></param>
        <param><value><string>search_read</string></value></param></params></methodCall>`;
      const rpc = await request(app.getHttpServer()).post('/rpc/xmlrpc').send({ xml }).expect(200);
      expect(rpc.text.includes('<fault>')).toBe(role !== 'sales');
    }
    for (const path of [...salesPaths, ...purchasePaths]) {
      await request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' }).expect(200);
    }
  });

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
      .send({ fullName: 'Admin', roles: ['employee'], isActive: false,
        expectedRevision: admin.management_revision, reason: 'Attempt disabling last administrator' }).expect(400);
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
