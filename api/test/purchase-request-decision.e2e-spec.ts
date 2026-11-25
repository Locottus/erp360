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

  it('separates manual and cross-location proposals from approved commitments and exports exact safe CSV', async () => {
    const product = (await post('/masters/products', { sku: 'PLAN-REQUESTS', name: '=SUM(1,1)', unitPrice: 1 }).expect(201)).body.id;
    const url = `/inventory/replenishment/${product}/purchase-planning`;
    expect((await request(app.getHttpServer()).get(url).auth(token, { type: 'bearer' }).expect(200)).body)
      .toMatchObject({ pending_quantity: '0.0000', open_request_quantity: '0.0000', groups: [], requests: [], orders: [] });
    const manual = (await post('/commerce/purchases/requests', { requestNumber: 'PLAN-MANUAL', supplierId,
      lines: [{ productId: product, quantity: 0.0001, unitCost: 1 }, { productId: product, quantity: 2, unitCost: 1 }] }).expect(201)).body.id;
    for (const locationCode of ['ORIGIN-A', 'ORIGIN-B']) {
      await request(app.getHttpServer()).patch(`/inventory/replenishment/${product}`).auth(token, { type: 'bearer' })
        .send({ locationCode, minimumQuantity: '1', targetQuantity: '3', expectedRevision: 0,
          reason: 'Configure separate source locations' }).expect(200);
      await post(`/inventory/replenishment/${product}/proposals`, {
        locationCode, expectedRevision: 1, supplierId, requestNumber: `PLAN-${locationCode}`,
        quantity: '1.0001', unitCost: '1', reason: 'Reviewed requests across both locations', reviewedCommitments: true,
        destinationLocationCode: 'DESTINATION', expectedReceiptDate: '2099-01-01',
      }).expect(201);
    }
    const plan = (await request(app.getHttpServer()).get(url).auth(token, { type: 'bearer' }).expect(200)).body;
    expect(plan).toMatchObject({ open_requests: 3, open_request_quantity: '4.0003', pending_quantity: '0.0000', orders: [] });
    expect(plan.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ request_number: 'PLAN-MANUAL', origin: 'manual', source_location_code: null,
        destination_location_code: null, quantity: '2.0001' }),
      expect.objectContaining({ origin: 'replenishment', source_location_code: 'ORIGIN-A', destination_location_code: 'DESTINATION' }),
      expect.objectContaining({ origin: 'replenishment', source_location_code: 'ORIGIN-B', destination_location_code: 'DESTINATION' }),
    ]));
    const approve = post(`/commerce/purchases/requests/${manual}/approve`, { orderNumber: 'PLAN-APPROVED' });
    const read = request(app.getHttpServer()).get(url).auth(token, { type: 'bearer' });
    const [approved, snapshot] = await Promise.all([approve, read]);
    expect(approved.status).toBe(201); expect(snapshot.status).toBe(200);
    expect([['4.0003', '0.0000'], ['2.0002', '2.0001']])
      .toContainEqual([snapshot.body.open_request_quantity, snapshot.body.pending_quantity]);
    const current = (await request(app.getHttpServer()).get(url).auth(token, { type: 'bearer' }).expect(200)).body;
    expect(current).toMatchObject({ open_requests: 2, open_request_quantity: '2.0002', pending_orders: 1, pending_quantity: '2.0001' });
    expect(current.requests.some((row: { request_id: string }) => row.request_id === manual)).toBe(false);
    const csv = await request(app.getHttpServer()).get(`${url}.csv`).auth(token, { type: 'bearer' })
      .expect(200).expect('Content-Type', /text\/csv/).expect('Cache-Control', 'no-store');
    expect(csv.text).toContain(`"'=SUM(1,1)"`);
    expect(csv.text).toContain('"2.0001"'); expect(csv.text).toContain('"1.0001"');
    expect(csv.text.trim().split('\r\n')).toHaveLength(4);
    expect(csv.text).toContain('"verifiable_pending_quantity","unapproved_request_quantity"');
    for (const path of [url, `${url}.csv`]) {
      await request(app.getHttpServer()).get(path).auth(otherToken, { type: 'bearer' }).expect(404);
      await request(app.getHttpServer()).get(path).auth(employeeToken, { type: 'bearer' }).expect(403);
      await request(app.getHttpServer()).get(path).auth(purchasesToken, { type: 'bearer' }).expect(403);
    }
    await post(`/commerce/purchases/requests/${current.requests[0].request_id}/reject`, { reason }).expect(201);
    expect((await request(app.getHttpServer()).get(url).auth(token, { type: 'bearer' }).expect(200)).body.open_requests).toBe(1);
  });

  it('inherits request planning per line, preserves overrides on approval, and reports similar requests without blocking', async () => {
    const secondProduct = (await post('/masters/products', {
      sku: `PLAN-LINE-${suffix}`, name: 'Line plan product', unitPrice: 1,
    }).expect(201)).body.id as string;
    const plan = { destinationLocationCode: 'WH-HEADER', expectedReceiptDate: '2099-02-01' };
    const firstId = (await post('/commerce/purchases/requests', {
      requestNumber: `LINE-PLAN-${suffix}`, supplierId, ...plan,
      lines: [
        { productId, quantity: 1, unitCost: 3 },
        { productId: secondProduct, quantity: 1, unitCost: 4,
          destinationLocationCode: 'WH-LINE', expectedReceiptDate: '2099-03-01' },
      ],
    }).expect(201)).body.id as string;
    const secondId = (await post('/commerce/purchases/requests', {
      requestNumber: `LINE-SIMILAR-${suffix}`, supplierId, ...plan,
      lines: [{ productId, quantity: 2, unitCost: 3 }],
    }).expect(201)).body.id as string;

    const details = (await request(app.getHttpServer()).get(`/commerce/purchases/requests/${firstId}`)
      .auth(token, { type: 'bearer' }).expect(200)).body;
    expect(details.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ product_id: productId, destination_location_code: 'WH-HEADER',
        expected_receipt_date: '2099-02-01' }),
      expect.objectContaining({ product_id: secondProduct, destination_location_code: 'WH-LINE',
        expected_receipt_date: '2099-03-01' }),
    ]));

    const planning = (await request(app.getHttpServer())
      .get(`/inventory/replenishment/${productId}/purchase-planning`)
      .auth(token, { type: 'bearer' }).expect(200)).body;
    expect(planning.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ request_id: firstId, similar_open_request_count: 2 }),
      expect.objectContaining({ request_id: secondId, similar_open_request_count: 2 }),
    ]));

    const approved = (await post(`/commerce/purchases/requests/${firstId}/approve`, {
      orderNumber: `LINE-PLAN-PO-${suffix}`,
    }).expect(201)).body;
    const orderLines = await db.query(
      `SELECT l.product_id,COALESCE(l.destination_location_code,po.destination_location_code) AS destination_location_code,
          COALESCE(l.expected_receipt_date,po.expected_receipt_date)::text AS expected_receipt_date
       FROM purchase_order_lines l JOIN purchase_orders po ON po.id=l.order_id WHERE l.order_id=$1`,
      [approved.purchaseOrderId],
    );
    expect(orderLines.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ product_id: productId, destination_location_code: 'WH-HEADER',
        expected_receipt_date: '2099-02-01' }),
      expect.objectContaining({ product_id: secondProduct, destination_location_code: 'WH-LINE',
        expected_receipt_date: '2099-03-01' }),
    ]));
    const productPlans = await Promise.all([productId, secondProduct].map(id =>
      request(app.getHttpServer()).get(`/inventory/replenishment/${id}/purchase-planning`)
        .auth(token, { type: 'bearer' }).expect(200)));
    expect(productPlans[0].body.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ order_number: `LINE-PLAN-PO-${suffix}`, destination_location_code: 'WH-HEADER',
        expected_receipt_date: '2099-02-01' }),
    ]));
    expect(productPlans[1].body.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ order_number: `LINE-PLAN-PO-${suffix}`, destination_location_code: 'WH-LINE',
        expected_receipt_date: '2099-03-01' }),
    ]));
  });

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
  it('requires explicit valid plans and serializes revisions with tenant-safe readable history', async () => {
    const id = await makeRequest('PLAN-REVISIONS');
    const url = `/commerce/purchases/requests/${id}/delivery-plan`;
    const patch = (data: object, bearer = token) => request(app.getHttpServer()).patch(url)
      .auth(bearer, { type: 'bearer' }).send(data);
    const get = (bearer = token) => request(app.getHttpServer()).get(url).auth(bearer, { type: 'bearer' });
    const input = { destinationLocationCode: ' wh-b ', expectedReceiptDate: '2000-01-01', expectedRevision: 0, reason };
    expect((await get().expect(200)).body).toMatchObject({ delivery_plan_revision: 0, history: [], history_has_more: false });
    await patch(input, purchasesToken).expect(403);
    await patch(input, employeeToken).expect(403);
    await patch(input, otherToken).expect(404);
    await get(employeeToken).expect(403);
    await get(otherToken).expect(404);
    await request(app.getHttpServer()).patch('/commerce/purchases/requests/not-a-uuid/delivery-plan')
      .auth(token, { type: 'bearer' }).send(input).expect(400);
    for (const invalid of [
      { destinationLocationCode: undefined }, { expectedReceiptDate: undefined }, { expectedRevision: undefined },
      { destinationLocationCode: '' }, { destinationLocationCode: 'x'.repeat(33) }, { destinationLocationCode: 'bad\ncode' },
      { expectedReceiptDate: '2026-02-30' }, { expectedReceiptDate: '' }, { expectedReceiptDate: 123 },
      { expectedRevision: '0' }, { expectedRevision: -1 }, { expectedRevision: 0.1 }, { reason: 'short' }, { reason: 'bad\nreason long' },
    ]) await patch({ ...input, ...invalid }).expect(400);
    await patch({ ...input, expectedRevision: 1 }).expect(409);
    await patch({ ...input, destinationLocationCode: null, expectedReceiptDate: null }).expect(409);
    const concurrent = await Promise.all([patch(input), patch({ ...input, destinationLocationCode: 'WH-C' })]);
    expect(concurrent.map(reply => reply.status).sort()).toEqual([200, 409]);
    const winner = concurrent.find(reply => reply.status === 200)!.body;
    const result = (await get(purchasesToken).expect(200)).body;
    expect(result).toMatchObject({ delivery_plan_revision: 1, destination_location_code: winner.destination_location_code,
      expected_receipt_date: input.expectedReceiptDate, history_has_more: false });
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toMatchObject({ reason,
      before: { destination_location_code: null, expected_receipt_date: null, revision: 0 },
      after: { destination_location_code: winner.destination_location_code, expected_receipt_date: input.expectedReceiptDate, revision: 1 } });
    expect(result.history[0].actor_user_id).toBeTruthy();
    await patch(input).expect(409);
    expect((await get().expect(200)).body).toEqual(result);
  });

  it('copies the latest request plan on approval, keeps order revisions independent and protects terminal states', async () => {
    const id = await makeRequest('PLAN-SNAPSHOT');
    const requestUrl = `/commerce/purchases/requests/${id}/delivery-plan`;
    const patch = (url: string, input: object, bearer = token) => request(app.getHttpServer()).patch(url)
      .auth(bearer, { type: 'bearer' }).send(input);
    const plan = { destinationLocationCode: 'WH-A', expectedReceiptDate: '2099-01-01', expectedRevision: 0, reason };
    await patch(requestUrl, plan).expect(200);
    await patch(requestUrl, { ...plan, destinationLocationCode: null, expectedRevision: 1 }).expect(200);
    const approved = (await post(`/commerce/purchases/requests/${id}/approve`, { orderNumber: 'PLAN-SNAPSHOT-PO' }).expect(201)).body;
    const orderUrl = `/commerce/purchases/orders/${approved.purchaseOrderId}/delivery-plan`;
    const get = (url: string, bearer = token) => request(app.getHttpServer()).get(url).auth(bearer, { type: 'bearer' });
    expect((await get(orderUrl).expect(200)).body).toMatchObject({
      delivery_plan_revision: 0, destination_location_code: null, expected_receipt_date: plan.expectedReceiptDate, history: [],
    });
    await patch(requestUrl, { ...plan, expectedRevision: 2 }).expect(409);
    await patch(orderUrl, plan, purchasesToken).expect(403);
    await patch(orderUrl, plan, otherToken).expect(404);
    await get(orderUrl, otherToken).expect(404);
    await get(orderUrl, employeeToken).expect(403);
    const edited = await patch(orderUrl, { ...plan, expectedReceiptDate: null }).expect(200);
    expect(edited.body).toMatchObject({ destination_location_code: 'WH-A', expected_receipt_date: null, revision: 1 });
    expect((await get(orderUrl, purchasesToken).expect(200)).body).toMatchObject({
      delivery_plan_revision: 1, destination_location_code: 'WH-A', expected_receipt_date: null, history: [{ reason }],
    });
    expect((await get(requestUrl).expect(200)).body).toMatchObject({
      delivery_plan_revision: 2, destination_location_code: null, expected_receipt_date: plan.expectedReceiptDate,
    });
    const audit = await db.query(`SELECT payload FROM audit_log
      WHERE entity_id=$1 AND event_name='commerce.purchase.request.approve'`, [id]);
    expect(audit.rows[0].payload).toMatchObject({ request_delivery_plan_revision: 2,
      destination_location_code: null, expected_receipt_date: plan.expectedReceiptDate });
    const amounts = await db.query(`SELECT po.grand_total::text,l.quantity::text,l.unit_cost::text
      FROM purchase_orders po JOIN purchase_order_lines l ON l.order_id=po.id WHERE po.id=$1`, [approved.purchaseOrderId]);
    expect(amounts.rows).toEqual([{ grand_total: '6.0000', quantity: '2.0000', unit_cost: '3.0000' }]);
    await post(`/commerce/purchases/orders/${approved.purchaseOrderId}/cancel`, { reason }).expect(201);
    await patch(orderUrl, { ...plan, expectedRevision: 1 }).expect(409);
    const rejected = await makeRequest('PLAN-REJECTED');
    await post(`/commerce/purchases/requests/${rejected}/reject`, { reason }).expect(201);
    await patch(`/commerce/purchases/requests/${rejected}/delivery-plan`, plan).expect(409);
  });

  it('serializes approval against request rescheduling without a stale order snapshot', async () => {
    const id = await makeRequest('PLAN-APPROVAL-RACE');
    const input = { destinationLocationCode: 'RACE-DEST', expectedReceiptDate: '2099-02-02', expectedRevision: 0, reason };
    const [revised, approved] = await Promise.all([
      request(app.getHttpServer()).patch(`/commerce/purchases/requests/${id}/delivery-plan`)
        .auth(token, { type: 'bearer' }).send(input),
      post(`/commerce/purchases/requests/${id}/approve`, { orderNumber: 'PLAN-APPROVAL-RACE-PO' }),
    ]);
    expect(approved.status).toBe(201);
    expect([200, 409]).toContain(revised.status);
    const order = await db.query(`SELECT po.destination_location_code,po.expected_receipt_date::text,
      pr.delivery_plan_revision AS request_revision,po.delivery_plan_revision AS order_revision
      FROM purchase_orders po JOIN purchase_requests pr ON pr.id=po.request_id WHERE po.id=$1`, [approved.body.purchaseOrderId]);
    expect(order.rows).toEqual([revised.status === 200
      ? { destination_location_code: 'RACE-DEST', expected_receipt_date: input.expectedReceiptDate, request_revision: 1, order_revision: 0 }
      : { destination_location_code: null, expected_receipt_date: null, request_revision: 0, order_revision: 0 }]);
  });

  it('returns the latest 50 revisions in order and explicitly indicates older history', async () => {
    const id = await makeRequest('PLAN-HISTORY-LIMIT');
    const url = `/commerce/purchases/requests/${id}/delivery-plan`;
    for (let revision = 0; revision < 51; revision++) {
      await request(app.getHttpServer()).patch(url).auth(token, { type: 'bearer' }).send({
        destinationLocationCode: `WH-${revision + 1}`, expectedReceiptDate: null, expectedRevision: revision, reason,
      }).expect(200);
    }
    const result = (await request(app.getHttpServer()).get(url).auth(token, { type: 'bearer' }).expect(200)).body;
    expect(result).toMatchObject({ delivery_plan_revision: 51, destination_location_code: 'WH-51', history_has_more: true });
    expect(result.history).toHaveLength(50);
    expect(result.history.map((entry: { after: { revision: number } }) => entry.after.revision))
      .toEqual(Array.from({ length: 50 }, (_, index) => 51 - index));
  });

  it('creates one audited exact proposal per rule while open, and supports rejection then approval', async () => {
    await request(app.getHttpServer()).patch(`/inventory/replenishment/${productId}`).auth(token, { type: 'bearer' })
      .send({ locationCode: 'MAIN', minimumQuantity: '2', targetQuantity: '5', expectedRevision: 0,
        reason: 'Configure proposal test policy' }).expect(200);
    const url = `/inventory/replenishment/${productId}/proposals`;
    const input = { locationCode: 'main', expectedRevision: 1, supplierId, requestNumber: 'PROP',
      quantity: '1.2345', unitCost: '2.0001', reason: 'Reviewed purchases and stock', reviewedCommitments: true,
      destinationLocationCode: ' wh-b ', expectedReceiptDate: '2099-01-01' };
    await post(url, input, employeeToken).expect(403);
    await post(url, input, otherToken).expect(404);
    await post(url, { ...input, reviewedCommitments: false }).expect(400);
    await post(url, { ...input, expectedRevision: 2 }).expect(409);
    await post(url, { ...input, quantity: '0' }).expect(400);
    await post(url, { ...input, destinationLocationCode: 'bad\nlocation' }).expect(400);
    await post(url, { ...input, expectedReceiptDate: '2026-02-30' }).expect(400);
    const replies = await Promise.all([post(url, input), post(url, { ...input, requestNumber: 'PROP-2' })]);
    expect(replies.map(r => r.status).sort()).toEqual([201, 409]);
    const created = replies.find(r => r.status === 201)!.body;
    const details = (await request(app.getHttpServer()).get(`/commerce/purchases/requests/${created.id}`)
      .auth(token, { type: 'bearer' }).expect(200)).body;
    expect(details).toMatchObject({ status: 'draft', replenishment_location: 'MAIN', replenishment_rule_revision: 1,
      replenishment_reason: input.reason, subtotal: '2.4691', tax_total: '0.0000', grand_total: '2.4691',
      destination_location_code: 'WH-B', expected_receipt_date: input.expectedReceiptDate,
      lines: [{ quantity: '1.2345', unit_cost: '2.0001', line_total: '2.4691' }] });
    const rows = (await request(app.getHttpServer()).get('/inventory/replenishment').auth(token, { type: 'bearer' }).expect(200)).body;
    expect(rows.find((r: { product_id: string }) => r.product_id === productId).open_proposal_number).toBe(created.requestNumber);
    expect((await db.query('SELECT id FROM purchase_orders WHERE request_id=$1', [created.id])).rows).toHaveLength(0);
    const audit = await db.query(`SELECT payload FROM audit_log WHERE entity_id=$1 AND event_name='inventory.replenishment.proposal.create'`, [created.id]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].payload).toMatchObject({ location_code: 'MAIN', destinationLocationCode: 'WH-B',
      expectedReceiptDate: input.expectedReceiptDate });
    await post(`/commerce/purchases/requests/${created.id}/reject`, { reason }).expect(201);
    const next = await post(url, { ...input, requestNumber: 'PROP-AFTER-REJECT' }).expect(201);
    await post(`/commerce/purchases/requests/${next.body.id}/approve`, { orderNumber: 'PROP-ORDER' }).expect(201);
    expect((await db.query(`SELECT destination_location_code,expected_receipt_date::text
      FROM purchase_orders WHERE request_id=$1`, [next.body.id])).rows).toEqual([
      { destination_location_code: 'WH-B', expected_receipt_date: input.expectedReceiptDate },
    ]);
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
    expect(proposal.body).toMatchObject({ destinationLocationCode: null, expectedReceiptDate: null });
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
