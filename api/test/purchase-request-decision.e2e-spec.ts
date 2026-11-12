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
  it('opts into independent approval with revision/audit and enforces it for requests and replenishment', async () => {
    const profile = (await request(app.getHttpServer()).get('/companies/current').auth(token, { type: 'bearer' }).expect(200)).body;
    expect(profile.require_independent_purchase_approver).toBe(false);
    const id = await makeRequest('INDEPENDENT');
    const email = `decision-approver-${suffix}@example.test`;
    const invite = await post('/auth/users', { email, fullName: 'Independent approver', roles: ['admin'] }).expect(201);
    await request(app.getHttpServer()).post('/auth/reset-password').send({ token: invite.body.activationToken, password }).expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
    const approverToken = login.body.access_token;
    const data = { name: profile.name, taxId: profile.tax_id, expectedRevision: profile.profile_revision,
      requireIndependentPurchaseApprover: true, reason: 'Enable independent purchase approval' };
    const patchPolicy = (input: object, bearer = token) => request(app.getHttpServer()).patch('/companies/current')
      .auth(bearer, { type: 'bearer' }).send(input);
    await patchPolicy(data, purchasesToken).expect(403);
    await patchPolicy({ ...data, requireIndependentPurchaseApprover: 'true' }).expect(400);
    const updates = await Promise.all([patchPolicy(data), patchPolicy(data)]);
    expect(updates.map(reply => reply.status).sort()).toEqual([200, 409]);
    const approval = `/commerce/purchases/requests/${id}/approve`;
    await post(approval, { orderNumber: 'BLOCKED' }).expect(403);
    await post(approval, { orderNumber: 'BLOCKED' }, purchasesToken).expect(403);
    await post(approval, { orderNumber: 'BLOCKED' }, otherToken).expect(404);
    expect((await db.query('SELECT id FROM purchase_orders WHERE request_id=$1', [id])).rows).toHaveLength(0);
    const details = await request(app.getHttpServer()).get(`/commerce/purchases/requests/${id}`)
      .auth(token, { type: 'bearer' }).expect(200);
    expect(details.body.approval_block_reason).toBe('self_approval');
    const list = await request(app.getHttpServer()).get('/commerce/purchases/requests').auth(token, { type: 'bearer' }).expect(200);
    expect(list.body.find((row: { id: string }) => row.id === id).approval_block_reason).toBe('self_approval');
    const independentList = await request(app.getHttpServer()).get('/commerce/purchases/requests').auth(approverToken, { type: 'bearer' }).expect(200);
    expect(independentList.body.find((row: { id: string }) => row.id === id).approval_block_reason).toBeNull();

    const proposal = await post(`/inventory/replenishment/${productId}/proposals`, {
      locationCode: 'MAIN', expectedRevision: 1, supplierId, requestNumber: 'INDEPENDENT-PROP',
      quantity: '2.0001', unitCost: '3.0001', reason: 'Reviewed independent proposal', reviewedCommitments: true,
    }).expect(201);
    await post(`/commerce/purchases/requests/${proposal.body.id}/approve`, { orderNumber: 'PROP-BLOCKED' }).expect(403);
    await post(`/commerce/purchases/requests/${proposal.body.id}/reject`, { reason }).expect(201);

    const replies = await Promise.all([
      post(approval, { orderNumber: 'INDEPENDENT-ORDER' }, approverToken),
      post(approval, { orderNumber: 'INDEPENDENT-ORDER-2' }, approverToken),
    ]);
    expect(replies.map(reply => reply.status).sort()).toEqual([201, 400]);
    const order = await db.query('SELECT grand_total,created_by FROM purchase_orders WHERE request_id=$1', [id]);
    expect(order.rows).toEqual([{ grand_total: '6.0000', created_by: login.body.user.id }]);
    const audit = await db.query(`SELECT actor_user_id,payload FROM audit_log
      WHERE entity_id=$1 AND event_name='commerce.purchase.request.approve'`, [id]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ actor_user_id: login.body.user.id, payload: {
      independent_approval_required: true, request_created_by: details.body.created_by,
    } });
    const policyAudit = await db.query(`SELECT payload FROM audit_log
      WHERE company_id=$1 AND event_name='company.profile.update'`, [profile.id]);
    expect(policyAudit.rows).toHaveLength(1);
    expect(policyAudit.rows[0].payload).toMatchObject({
      before: { require_independent_purchase_approver: false },
      after: { require_independent_purchase_approver: true }, reason: data.reason,
    });
  });

  it('preserves an enabled policy for old profile clients, blocks unknown creators and explicitly disables it', async () => {
    const getProfile = async () => (await request(app.getHttpServer()).get('/companies/current')
      .auth(token, { type: 'bearer' }).expect(200)).body;
    const profile = await getProfile();
    const patchProfile = (input: object) => request(app.getHttpServer()).patch('/companies/current').auth(token, { type: 'bearer' }).send(input);
    const updated = await patchProfile({ name: 'Renamed decision fixture', taxId: profile.tax_id,
      expectedRevision: profile.profile_revision, reason: 'Change name without changing purchase policy' }).expect(200);
    expect(updated.body.require_independent_purchase_approver).toBe(true);
    const legacy = await makeRequest('LEGACY-CREATOR');
    await db.query('UPDATE purchase_requests SET created_by=NULL WHERE id=$1', [legacy]);
    const approval = `/commerce/purchases/requests/${legacy}/approve`;
    await post(approval, { orderNumber: 'LEGACY-BLOCKED' }).expect(409);
    const details = await request(app.getHttpServer()).get(`/commerce/purchases/requests/${legacy}`)
      .auth(token, { type: 'bearer' }).expect(200);
    expect(details.body.approval_block_reason).toBe('unknown_creator');
    const disabled = await patchProfile({ name: updated.body.name, taxId: updated.body.tax_id,
      expectedRevision: updated.body.profile_revision, reason: 'Disable policy after legacy review',
      requireIndependentPurchaseApprover: false }).expect(200);
    expect(disabled.body.require_independent_purchase_approver).toBe(false);
    await post(approval, { orderNumber: 'LEGACY-REVIEWED' }).expect(201);
    const self = await makeRequest('SELF-AFTER-DISABLE');
    await post(`/commerce/purchases/requests/${self}/approve`, { orderNumber: 'SELF-ORDER' }).expect(201);
    expect((await getProfile()).require_independent_purchase_approver).toBe(false);
  });

  it('waits for a concurrent policy change and applies its committed value before approval', async () => {
    const id = await makeRequest('POLICY-LOCK');
    const profile = (await request(app.getHttpServer()).get('/companies/current').auth(token, { type: 'bearer' }).expect(200)).body;
    const client = await db.connect();
    const backend = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    let approval: Promise<request.Response> | undefined;
    let committed = false;
    try {
      await client.query('BEGIN');
      await client.query('UPDATE companies SET require_independent_purchase_approver=TRUE WHERE id=$1', [profile.id]);
      approval = post(`/commerce/purchases/requests/${id}/approve`, { orderNumber: 'POLICY-LOCKED-ORDER' }).then(response => response);
      const deadline = Date.now() + 3000;
      let waiting = false;
      while (Date.now() < deadline && !waiting) {
        const locks = await db.query<{ waiting: boolean }>(
          `SELECT EXISTS(SELECT 1 FROM pg_stat_activity
           WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'
             AND query LIKE '%FOR SHARE%') AS waiting`, [backend.rows[0].pid]);
        waiting = locks.rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      await client.query('COMMIT');
      committed = true;
      expect((await approval).status).toBe(403);
      expect((await db.query('SELECT id FROM purchase_orders WHERE request_id=$1', [id])).rows).toHaveLength(0);
    } finally {
      try {
        if (!committed) await client.query('ROLLBACK');
        if (approval) await approval;
        await client.query('UPDATE companies SET require_independent_purchase_approver=FALSE WHERE id=$1', [profile.id]);
      } finally { client.release(); }
    }
  });
});
