import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('Purchase request decisions', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let token: string;
  let otherToken: string;
  let employeeToken: string;
  let purchasesToken: string;
  let productId: string;
  let supplierId: string;
  const suffix = Date.now();
  const password = 'Decision-Test-12345!';
  const reason = 'Purchase no longer required';
  const post = (url: string, data: object, bearer = token) =>
    request(app.getHttpServer()).post(url).auth(bearer, { type: 'bearer' }).send(data);
  const makeRequest = async (number: string) => (await post('/commerce/purchases/requests', {
    requestNumber: number, supplierId, lines: [{ productId, quantity: 2, unitCost: 3 }],
  }).expect(201)).body.id as string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init(); db = app.get(DatabaseService);
    for (const other of [false, true]) {
      const email = `decision-${other}-${suffix}@example.test`;
      await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
        companyCode: `DEC-${other}-${suffix}`, companyName: 'Decision fixture', email, password, fullName: 'Admin',
      }).expect(201);
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
      if (other) otherToken = login.body.access_token; else token = login.body.access_token;
    }
    const email = `decision-employee-${suffix}@example.test`;
    const invite = await post('/auth/users', { email, fullName: 'Employee', roles: ['employee'] }).expect(201);
    await request(app.getHttpServer()).post('/auth/reset-password').send({ token: invite.body.activationToken, password }).expect(201);
    employeeToken = (await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201)).body.access_token;
    const buyerEmail = `decision-buyer-${suffix}@example.test`;
    const buyer = await post('/auth/users', { email: buyerEmail, fullName: 'Buyer', roles: ['purchases'] }).expect(201);
    await request(app.getHttpServer()).post('/auth/reset-password').send({ token: buyer.body.activationToken, password }).expect(201);
    purchasesToken = (await request(app.getHttpServer()).post('/auth/login').send({ email: buyerEmail, password }).expect(201)).body.access_token;
    supplierId = (await post('/masters/suppliers', { code: 'SUP', name: 'Supplier' }).expect(201)).body.id;
    productId = (await post('/masters/products', { sku: 'P', name: 'Product', unitPrice: 1 }).expect(201)).body.id;
  });
  afterAll(async () => { await app.close(); });

  it('rejects with audit, excludes other tenants and prevents approval', async () => {
    const id = await makeRequest('REJECT');
    const getDetails = (bearer: string) => request(app.getHttpServer()).get(`/commerce/purchases/requests/${id}`).auth(bearer, { type: 'bearer' });
    const details = (await getDetails(token).expect(200)).body;
    expect(details).toMatchObject({ id, request_number: 'REJECT', supplier_name: 'Supplier', status: 'draft',
      subtotal: '6.0000', tax_total: '0.0000', grand_total: '6.0000',
      lines: [{ product_id: productId, sku: 'P', product_name: 'Product',
        quantity: '2.0000', unit_cost: '3.0000', line_total: '6.0000' }] });
    expect((await getDetails(purchasesToken).expect(200)).body).toEqual(details);
    await getDetails(employeeToken).expect(403);
    await getDetails(otherToken).expect(404);
    await request(app.getHttpServer()).get('/commerce/purchases/requests/not-a-uuid').auth(token, { type: 'bearer' }).expect(400);
    const url = `/commerce/purchases/requests/${id}/reject`;
    await post(url, { reason }, employeeToken).expect(403);
    await post(url, { reason }, otherToken).expect(404);
    for (const invalid of ['', 'short', 'invalid\nreason', null]) await post(url, { reason: invalid }).expect(400);
    await post('/commerce/purchases/requests/not-a-uuid/reject', { reason }).expect(400);
    await post(url, { reason }).expect(201);
    expect((await getDetails(token).expect(200)).body.status).toBe('rejected');
    await post(url, { reason }).expect(409);
    await post(`/commerce/purchases/requests/${id}/approve`, { orderNumber: 'NEVER' }).expect(400);
    const list = (await request(app.getHttpServer()).get('/commerce/purchases/requests')
      .auth(token, { type: 'bearer' }).expect(200)).body;
    expect(list.find((item: { id: string }) => item.id === id)).toMatchObject({
      status: 'rejected', rejection_reason: reason, purchase_order_id: null,
    });
    const audit = await db.query(`SELECT payload,actor_user_id FROM audit_log
      WHERE entity_id=$1 AND event_name='commerce.purchase.request.reject'`, [id]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].payload).toMatchObject({ reason, previous_status: 'draft' });
    expect(audit.rows[0].actor_user_id).toBeTruthy();
  });

  it('serializes competing approval and rejection without an inconsistent order', async () => {
    const id = await makeRequest('RACE');
    const [approved, rejected] = await Promise.all([
      post(`/commerce/purchases/requests/${id}/approve`, { orderNumber: 'RACE-PO' }),
      post(`/commerce/purchases/requests/${id}/reject`, { reason }),
    ]);
    expect([approved.status, rejected.status].filter(code => code === 201)).toHaveLength(1);
    expect([approved.status, rejected.status]).toEqual(expect.arrayContaining(
      approved.status === 201 ? [201, 409] : [400, 201]));
    const result = await db.query<{ status: string; orders: number; audits: number }>(
      `SELECT pr.status,(SELECT COUNT(*)::int FROM purchase_orders WHERE request_id=pr.id) AS orders,
       (SELECT COUNT(*)::int FROM audit_log WHERE entity_id=pr.id::text AND event_name='commerce.purchase.request.reject') AS audits
       FROM purchase_requests pr WHERE pr.id=$1`, [id]);
    expect(result.rows[0]).toEqual(approved.status === 201
      ? { status: 'approved', orders: 1, audits: 0 }
      : { status: 'rejected', orders: 0, audits: 1 });
    if (approved.status === 201) await post(`/commerce/purchases/requests/${id}/reject`, { reason }).expect(409);
  });
  it('creates one audited exact proposal per rule while open, and supports rejection then approval', async () => {
    await request(app.getHttpServer()).patch(`/inventory/replenishment/${productId}`).auth(token, { type: 'bearer' })
      .send({ locationCode: 'MAIN', minimumQuantity: '2', targetQuantity: '5', expectedRevision: 0,
        reason: 'Configure proposal test policy' }).expect(200);
    const url = `/inventory/replenishment/${productId}/proposals`;
    const input = { locationCode: 'main', expectedRevision: 1, supplierId, requestNumber: 'PROP',
      quantity: '1.2345', unitCost: '2.0001', reason: 'Reviewed purchases and stock', reviewedCommitments: true };
    await post(url, input, employeeToken).expect(403);
    await post(url, input, otherToken).expect(404);
    await post(url, { ...input, reviewedCommitments: false }).expect(400);
    await post(url, { ...input, expectedRevision: 2 }).expect(409);
    await post(url, { ...input, quantity: '0' }).expect(400);
    const replies = await Promise.all([post(url, input), post(url, { ...input, requestNumber: 'PROP-2' })]);
    expect(replies.map(r => r.status).sort()).toEqual([201, 409]);
    const created = replies.find(r => r.status === 201)!.body;
    const details = (await request(app.getHttpServer()).get(`/commerce/purchases/requests/${created.id}`)
      .auth(token, { type: 'bearer' }).expect(200)).body;
    expect(details).toMatchObject({ status: 'draft', replenishment_location: 'MAIN', replenishment_rule_revision: 1,
      replenishment_reason: input.reason, subtotal: '2.4691', tax_total: '0.0000', grand_total: '2.4691',
      lines: [{ quantity: '1.2345', unit_cost: '2.0001', line_total: '2.4691' }] });
    const rows = (await request(app.getHttpServer()).get('/inventory/replenishment').auth(token, { type: 'bearer' }).expect(200)).body;
    expect(rows.find((r: { product_id: string }) => r.product_id === productId).open_proposal_number).toBe(created.requestNumber);
    expect((await db.query('SELECT id FROM purchase_orders WHERE request_id=$1', [created.id])).rows).toHaveLength(0);
    expect((await db.query(`SELECT id FROM audit_log WHERE entity_id=$1 AND event_name='inventory.replenishment.proposal.create'`, [created.id])).rows).toHaveLength(1);
    await post(`/commerce/purchases/requests/${created.id}/reject`, { reason }).expect(201);
    const next = await post(url, { ...input, requestNumber: 'PROP-AFTER-REJECT' }).expect(201);
    await post(`/commerce/purchases/requests/${next.body.id}/approve`, { orderNumber: 'PROP-ORDER' }).expect(201);
    expect((await db.query('SELECT id FROM purchase_orders WHERE request_id=$1', [next.body.id])).rows).toHaveLength(1);
  });
});
