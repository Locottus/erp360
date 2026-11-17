import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';
import type { PurchasePlanning } from '../src/inventory/inventory.types';

type Details = {
  order: { status: string };
  lines: { id: string; received: string; remaining: string }[];
  receipts: { id: string; quantity: string; unit_cost: string; returnable: string }[];
  returns: { grand_total: string; subtotal: string; tax_total: string }[];
};

describe('Partial purchase receipts and supplier returns', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let token: string;
  let otherToken: string;
  let companyId: string;
  let productId: string;
  let supplierId: string;
  let orderId: string;
  let lineId: string;
  let receiptLine: string;
  const suffix = Date.now().toString();
  const post = (path: string, body: object) => request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }).send(body);
  const get = (path: string) => request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });
  const commitmentPath = (product: string) => `/inventory/replenishment/${product}/purchase-commitments`;
  const details = async (): Promise<Details> => (await get(`/inventory/purchases/orders/${orderId}/receipts`).expect(200)).body as Details;
  const stock = async () => Number((await get('/inventory/stock?locationCode=DOCK').expect(200)).body[0]?.on_hand ?? 0);
  const replenishment = async () => (await get('/inventory/replenishment?locationCode=DOCK').expect(200)).body
    .find((row: { product_id: string }) => row.product_id === productId) as {
    pending_purchase_quantity: string; pending_purchase_orders: number; purchase_orders_requiring_review: number;
    on_hand: string; suggested_quantity: string;
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init(); db = app.get(DatabaseService);
    for (const other of [false, true]) {
      const email = `receipts-${other}-${suffix}@example.test`;
      await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
        companyCode: `RCV-${other}-${suffix}`, companyName: 'Receipt test company', email,
        fullName: 'Receipt Administrator', password: 'ReceiptsTest123!',
      }).expect(201);
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'ReceiptsTest123!' }).expect(201);
      if (other) otherToken = login.body.access_token; else token = login.body.access_token;
    }
    companyId = (await db.query<{ id: string }>('SELECT id FROM companies WHERE code=$1', [`RCV-false-${suffix}`])).rows[0].id;
    supplierId = (await post('/masters/suppliers', { code: 'SUP', name: 'Receipt supplier' }).expect(201)).body.id;
    productId = (await post('/masters/products', { sku: 'RCV', name: 'Receipt product', unitPrice: 20 }).expect(201)).body.id;
    await post('/masters/tax-rates', { code: 'VAT17', name: 'Test VAT', rate: 17, taxType: 'vat' }).expect(201);
    await post('/accounting/bootstrap-accounts', {}).expect(201);
    const pr = await post('/commerce/purchases/requests', {
      requestNumber: 'PR', supplierId, taxRateCode: 'VAT17', lines: [{ productId, quantity: 5, unitCost: 3.3333 }],
    }).expect(201);
    orderId = (await post(`/commerce/purchases/requests/${pr.body.id}/approve`, { orderNumber: 'PO' }).expect(201)).body.purchaseOrderId;
    lineId = (await details()).lines[0].id;
    await request(app.getHttpServer()).patch(`/inventory/replenishment/${productId}`).auth(token, { type: 'bearer' })
      .send({ locationCode: 'DOCK', minimumQuantity: '4', targetQuantity: '6', expectedRevision: 0,
        reason: 'Reviewed test replenishment policy' }).expect(200);
  });
  afterAll(async () => { await app.close(); });

  it('groups an exact planning snapshot without double counting repeated lines, unknown plans or anomalies', async () => {
    const product = (await post('/masters/products', { sku: 'PLANNING', name: 'Planning product', unitPrice: 1 }).expect(201)).body.id;
    const createOrder = async (number: string, quantity: number, destination?: string, date?: string) => {
      const pr = await post('/commerce/purchases/requests', {
        requestNumber: number, supplierId, destinationLocationCode: destination, expectedReceiptDate: date,
        lines: [{ productId: product, quantity, unitCost: 1 }, { productId: product, quantity: 0.0001, unitCost: 1 }],
      }).expect(201);
      return (await post(`/commerce/purchases/requests/${pr.body.id}/approve`, { orderNumber: number }).expect(201)).body.purchaseOrderId as string;
    };
    const dated = await createOrder('PLAN-GROUP-A', 2, 'WH-A', '2000-01-01');
    const cancellable = await createOrder('PLAN-GROUP-B', 1, 'WH-A', '2000-01-01');
    await createOrder('PLAN-GROUP-UNKNOWN', 3);
    const legacy = await createOrder('PLAN-GROUP-LEGACY', 8, 'WH-B');
    await db.query(`INSERT INTO purchase_receipts(company_id,purchase_order_id,receipt_number)
      VALUES($1,$2,'PLAN-GROUP-LEGACY')`, [companyId, legacy]);
    const currentLine = (await get(`/inventory/purchases/orders/${dated}/receipts`).expect(200)).body.lines
      .find((line: { quantity: string }) => line.quantity === '2.0000').id;
    await post(`/inventory/purchases/orders/${dated}/receipts`, {
      reference: 'PLAN-GROUP-PARTIAL', locationCode: 'ACTUAL', lines: [{ lineId: currentLine, quantity: 0.5 }],
    }).expect(201);
    const url = `/inventory/replenishment/${product}/purchase-planning`;
    const plan: PurchasePlanning = (await get(url).expect(200)).body;
    expect(plan).toMatchObject({ pending_quantity: '5.5003', pending_orders: 3, review_orders: 1,
      open_request_quantity: '0.0000', open_requests: 0 });
    expect(plan.groups).toEqual([
      { destination_location_code: 'WH-A', expected_receipt_date: '2000-01-01', is_receipt_overdue: true,
        pending_quantity: '2.5002', pending_orders: 2, review_orders: 0 },
      { destination_location_code: 'WH-B', expected_receipt_date: null, is_receipt_overdue: false,
        pending_quantity: '0.0000', pending_orders: 0, review_orders: 1 },
      { destination_location_code: null, expected_receipt_date: null, is_receipt_overdue: false,
        pending_quantity: '3.0001', pending_orders: 1, review_orders: 0 },
    ]);
    expect(plan.orders).toHaveLength(4);
    expect(plan.orders.find(row => row.order_id === legacy)?.pending_quantity).toBeNull();
    const csv = await get(`${url}.csv`).expect(200);
    const excludedRow = csv.text.split('\r\n').find((row: string) => row.includes('"PLAN-GROUP-LEGACY"'));
    expect(excludedRow).toContain('"","",\"true\",\"false\",\"true\"');
    await request(app.getHttpServer()).get(url).auth(otherToken, { type: 'bearer' }).expect(404);
    await request(app.getHttpServer()).get(url).expect(401);
    await get('/inventory/replenishment/not-a-uuid/purchase-planning').expect(400);
    await request(app.getHttpServer()).patch(`/commerce/purchases/orders/${dated}/delivery-plan`).auth(token, { type: 'bearer' })
      .send({ destinationLocationCode: 'WH-C', expectedReceiptDate: null, expectedRevision: 0,
        reason: 'Reviewed planning destination change' }).expect(200);
    const replanned: PurchasePlanning = (await get(url).expect(200)).body;
    expect(replanned.pending_quantity).toBe(plan.pending_quantity);
    expect(replanned.groups.find(row => row.destination_location_code === 'WH-C')).toMatchObject({ pending_quantity: '1.5001' });
    await post(`/commerce/purchases/orders/${cancellable}/cancel`, { reason: 'Cancel unreceived planned order' }).expect(201);
    expect((await get(url).expect(200)).body).toMatchObject({ pending_quantity: '4.5002', pending_orders: 2, review_orders: 1 });
  });

  it('rejects invalid quantities, duplicate lines and cross-tenant access without writes', async () => {
    expect(await replenishment()).toMatchObject({ pending_purchase_quantity: '5.0000', pending_purchase_orders: 1,
      purchase_orders_requiring_review: 0, on_hand: '0', suggested_quantity: '6.0000' });
    expect((await get(commitmentPath(productId)).expect(200)).body).toMatchObject([{
      order_id: orderId, order_number: 'PO', supplier_name: 'Receipt supplier',
      ordered_quantity: '5.0000', documented_received_quantity: '0', pending_quantity: '5.0000',
      has_legacy: false, over_received: false,
    }]);
    await request(app.getHttpServer()).get(commitmentPath(productId)).auth(otherToken, { type: 'bearer' }).expect(404);
    await get(commitmentPath('not-a-uuid')).expect(400);
    expect((await request(app.getHttpServer()).get('/inventory/replenishment').auth(otherToken, { type: 'bearer' }).expect(200)).body).toEqual([]);
    const endpoint = `/inventory/purchases/orders/${orderId}/receipts`;
    const base = { reference: 'BAD', locationCode: 'DOCK', lines: [{ lineId, quantity: 1 }] };
    for (const quantity of [0, -1, 0.00001, 1e10, '1']) {
      await post(endpoint, { ...base, lines: [{ lineId, quantity }] }).expect(400);
    }
    await post(endpoint, { ...base, lines: [...base.lines, ...base.lines] }).expect(400);
    await post(endpoint, { ...base, locationCode: '' }).expect(400);
    await post(endpoint, { ...base, lines: [{ lineId: productId, quantity: 1 }] }).expect(400);
    await request(app.getHttpServer()).post(endpoint).auth(otherToken, { type: 'bearer' }).send(base).expect(404);
    await request(app.getHttpServer()).get(endpoint).auth(otherToken, { type: 'bearer' }).expect(404);
    expect(await stock()).toBe(0);
    expect((await details()).receipts).toHaveLength(0);
  });

  it('counts multiple lines once per order and removes commitments on cancellation', async () => {
    const pr = await post('/commerce/purchases/requests', {
      requestNumber: 'PR-CANCEL', supplierId, destinationLocationCode: 'DOCK', expectedReceiptDate: '2000-01-01', lines: [
        { productId, quantity: 0.0001, unitCost: 1 },
        { productId, quantity: 1, unitCost: 1 },
      ],
    }).expect(201);
    const order = await post(`/commerce/purchases/requests/${pr.body.id}/approve`, { orderNumber: 'PO-CANCEL' }).expect(201);
    expect(await replenishment()).toMatchObject({ pending_purchase_quantity: '6.0001', pending_purchase_orders: 2 });
    expect((await get(commitmentPath(productId)).expect(200)).body).toHaveLength(2);
    await post(`/commerce/purchases/orders/${order.body.purchaseOrderId}/cancel`,
      { reason: 'Supplier order cancelled for fixture' }).expect(201);
    expect((await get(`/inventory/purchases/orders/${order.body.purchaseOrderId}/receipts`).expect(200)).body.order)
      .toMatchObject({ destination_location_code: 'DOCK', expected_receipt_date: '2000-01-01', is_receipt_overdue: false });
    expect(await replenishment()).toMatchObject({ pending_purchase_quantity: '5.0000', pending_purchase_orders: 1 });
    expect((await get(commitmentPath(productId)).expect(200)).body).toHaveLength(1);
  });

  it('flags legacy open receipts instead of treating an uncertain quantity as confirmed', async () => {
    const product = await post('/masters/products', { sku: 'LEGACY', name: 'Legacy fixture product', unitPrice: 1 }).expect(201);
    const pr = await post('/commerce/purchases/requests', {
      requestNumber: 'PR-LEGACY', supplierId, lines: [{ productId: product.body.id, quantity: 7, unitCost: 1 }],
    }).expect(201);
    const order = await post(`/commerce/purchases/requests/${pr.body.id}/approve`, { orderNumber: 'PO-LEGACY' }).expect(201);
    await request(app.getHttpServer()).patch(`/inventory/replenishment/${product.body.id}`).auth(token, { type: 'bearer' })
      .send({ locationCode: 'DOCK', minimumQuantity: '1', targetQuantity: '2', expectedRevision: 0,
        reason: 'Reviewed legacy test policy' }).expect(200);
    await db.query(`INSERT INTO purchase_receipts(company_id,purchase_order_id,receipt_number)
      VALUES($1,$2,'LEGACY-UNCERTAIN')`, [companyId, order.body.purchaseOrderId]);
    const rows = (await get('/inventory/replenishment?locationCode=DOCK').expect(200)).body as
      { product_id: string; pending_purchase_quantity: string; pending_purchase_orders: number; purchase_orders_requiring_review: number }[];
    expect(rows.find(row => row.product_id === product.body.id)).toMatchObject({
      pending_purchase_quantity: '0', pending_purchase_orders: 0, purchase_orders_requiring_review: 1,
    });
    const invalidRequest = await post('/commerce/purchases/requests', {
      requestNumber: 'PR-INCONSISTENT', supplierId,
      lines: [{ productId: product.body.id, quantity: 1, unitCost: 1 }, { productId: product.body.id, quantity: 3, unitCost: 1 }],
    }).expect(201);
    const invalidOrder = await post(`/commerce/purchases/requests/${invalidRequest.body.id}/approve`,
      { orderNumber: 'PO-INCONSISTENT' }).expect(201);
    const invalidLine = (await get(`/inventory/purchases/orders/${invalidOrder.body.purchaseOrderId}/receipts`).expect(200)).body.lines
      .find((line: { remaining: string }) => line.remaining === '1.0000');
    const receipt = await db.query<{ id: string }>(
      `INSERT INTO purchase_receipts(company_id,purchase_order_id,receipt_number,payload)
       VALUES($1,$2,'INCONSISTENT-FIXTURE','{}'::jsonb) RETURNING id`, [companyId, invalidOrder.body.purchaseOrderId]);
    await db.query(`INSERT INTO purchase_receipt_lines(receipt_id,order_line_id,location_code,quantity,unit_cost)
      VALUES($1,$2,'DOCK',2,1)`, [receipt.rows[0].id, invalidLine.id]);
    const after = (await get('/inventory/replenishment?locationCode=DOCK').expect(200)).body as typeof rows;
    expect(after.find(row => row.product_id === product.body.id)).toMatchObject({
      pending_purchase_quantity: '0', pending_purchase_orders: 0, purchase_orders_requiring_review: 2,
    });
    const breakdown = (await get(commitmentPath(product.body.id)).expect(200)).body;
    expect(breakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ order_number: 'PO-LEGACY', has_legacy: true, pending_quantity: null }),
      expect.objectContaining({ order_number: 'PO-INCONSISTENT', over_received: true, pending_quantity: null }),
    ]));
  });

  it('serializes a repeated batch, snapshots cost and blocks legacy/full and premature accounting paths', async () => {
    const endpoint = `/inventory/purchases/orders/${orderId}/receipts`;
    const input = { reference: 'RCV-1', locationCode: 'dock', lines: [{ lineId, quantity: 2 }] };
    const [concurrent, snapshot] = await Promise.all([Promise.all([post(endpoint, input), post(endpoint, input)]), replenishment()]);
    expect(Number(snapshot.on_hand) + Number(snapshot.pending_purchase_quantity)).toBe(5);
    expect(concurrent.map(row => row.status)).toEqual([201, 201]);
    expect(concurrent.map(row => row.body.replayed).sort()).toEqual([false, true]);
    expect(concurrent[0].body.receiptId).toBe(concurrent[1].body.receiptId);
    expect(await stock()).toBe(2);
    const current = await details();
    expect(current.order.status).toBe('partially_received');
    expect(Number(current.lines[0].remaining)).toBe(3);
    expect(await replenishment()).toMatchObject({ pending_purchase_quantity: '3.0000', pending_purchase_orders: 1,
      on_hand: '2.0000', suggested_quantity: '4.0000' });
    expect((await get(commitmentPath(productId)).expect(200)).body).toMatchObject([
      { order_id: orderId, documented_received_quantity: '2.0000', pending_quantity: '3.0000' },
    ]);
    const valuation = (await get('/inventory/reports/valuation-cogs').query({ locationCode: 'DOCK' }).expect(200)).body;
    const row = valuation.rows.find((item: { product_id: string }) => item.product_id === productId);
    expect(row).toMatchObject({
      location_code: 'DOCK',
      period_received_quantity: '2.0000',
      period_received_cost: '6.66660000',
      period_dispatched_quantity: '0',
      weighted_average_cost: '3.3333',
      provisional_stock_value: '6.6666',
      has_cost_gap: false,
    });
    expect(current.receipts[0].unit_cost).toBe('3.3333');
    receiptLine = current.receipts[0].id;
    await post(endpoint, { ...input, lines: [{ lineId, quantity: 3 }] }).expect(409);
    await post(endpoint, { ...input, reference: 'EXCESS', lines: [{ lineId, quantity: 4 }] }).expect(409);
    await post(`/commerce/purchases/orders/${orderId}/receive`, { receiptNumber: 'LEGACY' }).expect(400);
    await post(`/inventory/purchases/orders/${orderId}/receive`, { locationCode: 'DOCK' }).expect(400);
    await post(`/accounting/purchase-orders/${orderId}/post`, {}).expect(400);
    await post(`/accounting/purchase-orders/${orderId}/returns`, { reference: 'EARLY', reason: 'Too early to return goods', lines: [{ lineId: receiptLine, quantity: 1 }] }).expect(400);
    const listed = (await get('/commerce/purchases/requests')).body;
    expect(listed.find((row: { purchase_order_id: string }) => row.purchase_order_id === orderId).inventory_received).toBe(true);
  });

  it('finishes outstanding quantities once and prevents double application to inventory', async () => {
    const endpoint = `/inventory/purchases/orders/${orderId}/receipts`;
    const input = { locationCode: 'DOCK', lines: [{ lineId, quantity: 3 }] };
    const concurrent = await Promise.all([post(endpoint, { ...input, reference: 'RCV-2' }), post(endpoint, { ...input, reference: 'RCV-3' })]);
    expect(concurrent.map(row => row.status).sort()).toEqual([201, 400]);
    expect(await stock()).toBe(5);
    const current = await details();
    expect(current.order.status).toBe('received');
    expect(Number(current.lines[0].remaining)).toBe(0);
    expect(await replenishment()).toMatchObject({ pending_purchase_quantity: '0', pending_purchase_orders: 0,
      on_hand: '5.0000', suggested_quantity: '0' });
    expect((await get(commitmentPath(productId)).expect(200)).body).toEqual([]);
    await post(`/inventory/purchases/orders/${orderId}/receive`, { locationCode: 'DOCK' }).expect(400);
    await post(`/accounting/purchase-orders/${orderId}/post`, {}).expect(201);
    await post(`/accounting/purchase-orders/${orderId}/payments`, { paymentReference: 'PART-PAY', amount: 10 }).expect(201);
  });

  it('rolls back a return in a closed period and protects unavailable/reserved stock', async () => {
    const period = (await db.query<{ year: number; month: number }>(
      'SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS year,EXTRACT(MONTH FROM CURRENT_DATE)::int AS month',
    )).rows[0];
    const endpoint = `/accounting/purchase-orders/${orderId}/returns`;
    const input = { reference: 'RET-1', reason: 'Defective items returned and credited', lines: [{ lineId: receiptLine, quantity: 1 }] };
    await post('/accounting/periods/close', period).expect(201);
    await post(endpoint, input).expect(400);
    expect(await stock()).toBe(5);
    expect((await details()).returns).toHaveLength(0);
    await post('/accounting/periods/reopen', { ...period, reason: 'Authorized supplier correction' }).expect(201);
    await post('/inventory/transfers', { reference: 'MOVE', productId, locationCode: 'DOCK', destinationCode: 'OTHER', quantity: 5 }).expect(201);
    await post(endpoint, input).expect(400);
    expect((await details()).returns).toHaveLength(0);
    await post('/inventory/transfers', { reference: 'MOVE-BACK', productId, locationCode: 'OTHER', destinationCode: 'DOCK', quantity: 5 }).expect(201);
    await db.query('UPDATE inventory_stock_balances SET reserved=5 WHERE company_id=$1 AND product_id=$2 AND location_code=$3', [companyId, productId, 'DOCK']);
    await post(endpoint, input).expect(400);
    await db.query('UPDATE inventory_stock_balances SET reserved=0 WHERE company_id=$1 AND product_id=$2 AND location_code=$3', [companyId, productId, 'DOCK']);
  });

  it('returns a batch once, reverses exact amounts and reduces payment limits', async () => {
    const endpoint = `/accounting/purchase-orders/${orderId}/returns`;
    const input = { reference: 'RET-1', reason: 'Defective items returned and credited', lines: [{ lineId: receiptLine, quantity: 1 }] };
    await request(app.getHttpServer()).post(endpoint).auth(otherToken, { type: 'bearer' }).send(input).expect(404);
    const concurrent = await Promise.all([post(endpoint, input), post(endpoint, input)]);
    expect(concurrent.map(row => row.status)).toEqual([201, 201]);
    expect(concurrent.map(row => row.body.replayed).sort()).toEqual([false, true]);
    expect(await stock()).toBe(4);
    const current = await details();
    expect(current.returns[0]).toMatchObject({ subtotal: '3.3333', tax_total: '0.5667', grand_total: '3.9000' });
    await post(endpoint, { ...input, reason: 'Changed reason should conflict' }).expect(409);
    await post(endpoint, { ...input, reference: 'TOO-MUCH', lines: [{ lineId: receiptLine, quantity: 2 }] }).expect(409);
    await post(`/accounting/purchase-orders/${orderId}/payments`, { paymentReference: 'OVERPAY', amount: 6 }).expect(400);
    expect(Number((await get('/accounting/payables')).body.find((row: { id: string }) => row.id === orderId).balance_due)).toBe(5.5998);
  });

  it('allocates final rounding remainder exactly and preserves supplier credit instead of inventing a cash refund', async () => {
    const current = await details();
    const lines = current.receipts.map(row => ({ lineId: row.id, quantity: Number(row.returnable) })).filter(row => row.quantity > 0);
    await post(`/accounting/purchase-orders/${orderId}/returns`, { reference: 'RET-FINAL', reason: 'Remaining goods returned and credited', lines }).expect(201);
    expect(await stock()).toBe(0);
    const after = await details();
    expect(after.order.status).toBe('received');
    expect(after.receipts.every(row => Number(row.returnable) === 0)).toBe(true);
    const totals = await db.query<{ subtotal: string; tax: string; total: string }>(
      `SELECT SUM(subtotal)::text subtotal,SUM(tax_total)::text tax,SUM(grand_total)::text total
       FROM purchase_supplier_returns WHERE purchase_order_id=$1`, [orderId],
    );
    expect(totals.rows[0]).toEqual({ subtotal: '16.6665', tax: '2.8333', total: '19.4998' });
    const payable = (await get('/accounting/payables')).body.find((row: { id: string }) => row.id === orderId);
    expect(payable.balance_due).toBe('-10.0000');
    const journal = await db.query<{ debit: string; credit: string }>(
      `SELECT SUM(l.debit)::text debit,SUM(l.credit)::text credit FROM accounting_journal_lines l
       JOIN accounting_journal_entries e ON e.id=l.journal_entry_id
       WHERE e.company_id=$1 AND e.source_type='supplier_return'`, [companyId],
    );
    expect(journal.rows[0]).toEqual({ debit: '19.4998', credit: '19.4998' });
    await post(`/accounting/purchase-orders/${orderId}/payments`, { paymentReference: 'NO-MORE', amount: 0.0001 }).expect(400);
  });

  it('retains the legacy two-step receipt without fabricating historical batch information', async () => {
    const pr = await post('/commerce/purchases/requests', { requestNumber: 'LEGACY-PR', supplierId, lines: [{ productId, quantity: 1, unitCost: 1 }] }).expect(201);
    const id = (await post(`/commerce/purchases/requests/${pr.body.id}/approve`, { orderNumber: 'LEGACY-PO' })).body.purchaseOrderId;
    await post(`/commerce/purchases/orders/${id}/receive`, { receiptNumber: 'LEGACY-RCV' }).expect(201);
    await post(`/inventory/purchases/orders/${id}/receive`, { locationCode: 'DOCK' }).expect(201);
    await post(`/inventory/purchases/orders/${id}/receipts`, { reference: 'MIX', locationCode: 'DOCK', lines: [{ lineId, quantity: 1 }] }).expect(400);
    const legacy = (await get(`/inventory/purchases/orders/${id}/receipts`)).body;
    expect(legacy.legacyReceipts).toHaveLength(1);
    expect(legacy.receipts).toHaveLength(0);
    const email = `receipt-employee-${suffix}@example.test`;
    const invitation = await post('/auth/users', { email, fullName: 'Receipt employee', roles: ['employee'] }).expect(201);
    await request(app.getHttpServer()).post('/auth/reset-password').send({ token: invitation.body.activationToken, password: 'ReceiptsTest123!' }).expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'ReceiptsTest123!' }).expect(201);
    await request(app.getHttpServer()).post(`/inventory/purchases/orders/${id}/receipts`).auth(login.body.access_token, { type: 'bearer' }).send({}).expect(403);
    await request(app.getHttpServer()).post(`/accounting/purchase-orders/${id}/returns`).auth(login.body.access_token, { type: 'bearer' }).send({}).expect(403);
    await request(app.getHttpServer()).post(`/accounting/purchase-orders/${orderId}/refunds`).auth(login.body.access_token, { type: 'bearer' }).send({}).expect(403);
    await request(app.getHttpServer()).get(`/accounting/purchase-orders/${orderId}/refunds`).auth(login.body.access_token, { type: 'bearer' }).expect(403);
  });

  it('records only actual supplier credit recovery and rolls back money/history in closed periods', async () => {
    const endpoint = `/accounting/purchase-orders/${orderId}/refunds`;
    const input = { reference: 'SUP-REFUND-1', amount: 3.3333, reason: 'Actual bank receipt from supplier for returned goods' };
    for (const amount of [0, -1, '1', 0.00001, 1e10]) {
      await post(endpoint, { ...input, amount }).expect(400);
    }
    await post(endpoint, { ...input, reason: 'short' }).expect(400);
    await post(endpoint, { ...input, amount: 10.0001 }).expect(400);
    await request(app.getHttpServer()).post(endpoint).auth(otherToken, { type: 'bearer' }).send(input).expect(404);
    await request(app.getHttpServer()).get(endpoint).auth(otherToken, { type: 'bearer' }).expect(404);
    const period = (await db.query<{ year: number; month: number }>(
      'SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS year,EXTRACT(MONTH FROM CURRENT_DATE)::int AS month',
    )).rows[0];
    await post('/accounting/periods/close', period).expect(201);
    await post(endpoint, input).expect(400);
    expect((await get(endpoint)).body).toHaveLength(0);
    expect((await get('/accounting/payables')).body.find((row: { id: string }) => row.id === orderId).balance_due).toBe('-10.0000');
    await post('/accounting/periods/reopen', { ...period, reason: 'Authorized supplier refund posting' }).expect(201);
    const responses = await Promise.all([post(endpoint, input), post(endpoint, input)]);
    expect(responses.map(row => row.status)).toEqual([201, 201]);
    expect(responses.map(row => row.body.replayed).sort()).toEqual([false, true]);
    await post(endpoint, { ...input, reason: 'Different payload must conflict' }).expect(409);
    await post(endpoint, { ...input, amount: 3 }).expect(409);
    expect((await get(endpoint)).body).toHaveLength(1);
    const payable = (await get('/accounting/payables')).body.find((row: { id: string }) => row.id === orderId);
    expect(payable.balance_due).toBe('-6.6667');
    expect(payable.total_refunded).toBe('3.3333');
    await post(`/accounting/purchase-orders/${orderId}/payments`, { paymentReference: 'STILL-CREDIT', amount: 1 }).expect(400);
    expect(await stock()).toBe(1);
  });

  it('rejects invalid planning without writes and keeps missing planning explicitly unknown', async () => {
    const path = '/commerce/purchases/requests';
    const input = { requestNumber: 'PLAN-INVALID', supplierId, lines: [{ productId, quantity: 1, unitCost: 1 }] };
    for (const extra of [
      { destinationLocationCode: '' }, { destinationLocationCode: '   ' }, { destinationLocationCode: 123 },
      { destinationLocationCode: 'a'.repeat(33) }, { destinationLocationCode: 'WH\u007fB' },
      { expectedReceiptDate: '' }, { expectedReceiptDate: '2026-02-30' }, { expectedReceiptDate: 123 },
      { expectedReceiptDate: '2026-1-01' }, { expectedReceiptDate: '0000-01-01' },
    ]) await post(path, { ...input, ...extra }).expect(400);
    expect((await db.query(`SELECT id FROM purchase_requests WHERE company_id=$1 AND request_number='PLAN-INVALID'`, [companyId])).rows).toEqual([]);
    const unplanned = await post(path, { ...input, destinationLocationCode: null, expectedReceiptDate: null }).expect(201);
    expect(unplanned.body).toMatchObject({ destinationLocationCode: null, expectedReceiptDate: null });
    const original = (await get(`/inventory/purchases/orders/${orderId}/receipts`).expect(200)).body;
    expect(original.order).toMatchObject({ destination_location_code: null, expected_receipt_date: null, is_receipt_overdue: false });
  });

  it('snapshots planning through approval and receipts, but always records actual location and open overdue status', async () => {
    const product = (await post('/masters/products', { sku: 'PLAN', name: 'Planned receipt product', unitPrice: 1 }).expect(201)).body;
    const dates = (await db.query<{ today: string; yesterday: string }>(
      `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS today,
        ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date-1)::text AS yesterday`)).rows[0];
    const pr = await post('/commerce/purchases/requests', {
      requestNumber: 'PLAN-PR', supplierId, destinationLocationCode: ' wh-b ', expectedReceiptDate: dates.yesterday,
      lines: [{ productId: product.id, quantity: 2, unitCost: 3.1234 }],
    }).expect(201);
    expect(pr.body).toMatchObject({ destinationLocationCode: 'WH-B', expectedReceiptDate: dates.yesterday });
    const detailPath = `/commerce/purchases/requests/${pr.body.id}`;
    expect((await get(detailPath).expect(200)).body).toMatchObject({
      destination_location_code: 'WH-B', expected_receipt_date: dates.yesterday,
    });
    await request(app.getHttpServer()).get(detailPath).auth(otherToken, { type: 'bearer' }).expect(404);
    const email = `receipt-employee-${suffix}@example.test`;
    const employee = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'ReceiptsTest123!' }).expect(201);
    await request(app.getHttpServer()).post('/commerce/purchases/requests').auth(employee.body.access_token, { type: 'bearer' })
      .send({ requestNumber: 'FORBIDDEN-PLAN', supplierId, destinationLocationCode: 'OTHER', expectedReceiptDate: dates.today,
        lines: [{ productId: product.id, quantity: 1, unitCost: 1 }] }).expect(403);
    const ordered = await post(`/commerce/purchases/requests/${pr.body.id}/approve`, { orderNumber: 'PLAN-PO' }).expect(201);
    const id = ordered.body.purchaseOrderId;
    const endpoint = `/inventory/purchases/orders/${id}/receipts`;
    const before = (await get(endpoint).expect(200)).body;
    expect(before.order).toMatchObject({ destination_location_code: 'WH-B', expected_receipt_date: dates.yesterday, is_receipt_overdue: true });
    const commitment = () => get(commitmentPath(product.id));
    expect((await commitment().expect(200)).body).toMatchObject([{
      order_id: id, destination_location_code: 'WH-B', expected_receipt_date: dates.yesterday,
      is_receipt_overdue: true, pending_quantity: '2.0000',
    }]);
    const batch = { reference: 'PLAN-RCV-1', locationCode: 'actual dock', lines: [{ lineId: before.lines[0].id, quantity: 1 }] };
    const responses = await Promise.all([post(endpoint, batch), post(endpoint, batch)]);
    expect(responses.map(r => r.status)).toEqual([201, 201]);
    expect(responses.map(r => r.body.replayed).sort()).toEqual([false, true]);
    const partial = (await get(endpoint).expect(200)).body;
    expect(partial.order).toMatchObject({ destination_location_code: 'WH-B', is_receipt_overdue: true });
    expect(partial.receipts).toMatchObject([{ location_code: 'ACTUAL DOCK', quantity: '1.0000', unit_cost: '3.1234' }]);
    expect((await commitment().expect(200)).body).toMatchObject([{ pending_quantity: '1.0000', destination_location_code: 'WH-B' }]);
    const audit = await db.query(`SELECT payload FROM audit_log
      WHERE company_id=$1 AND entity_id=$2 AND event_name='inventory.purchase.partial.receive'`,
      [companyId, responses[0].body.receiptId]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].payload).toMatchObject({ locationCode: 'ACTUAL DOCK', planned_destination_location_code: 'WH-B', expected_receipt_date: dates.yesterday });
    const creationAudit = await db.query(`SELECT event_name,payload FROM audit_log
      WHERE company_id=$1 AND entity_id=$2 AND event_name IN ('commerce.purchase.request.create','commerce.purchase.request.approve')`,
      [companyId, pr.body.id]);
    expect(creationAudit.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_name: 'commerce.purchase.request.create', payload: expect.objectContaining({ destinationLocationCode: 'WH-B', expectedReceiptDate: dates.yesterday }) }),
      expect.objectContaining({ event_name: 'commerce.purchase.request.approve', payload: expect.objectContaining({ destination_location_code: 'WH-B', expected_receipt_date: dates.yesterday }) }),
    ]));
    const currentDay = await post('/commerce/purchases/requests', {
      requestNumber: 'PLAN-TODAY', supplierId, expectedReceiptDate: dates.today, lines: [{ productId: product.id, quantity: 1, unitCost: 1 }],
    }).expect(201);
    const currentOrder = await post(`/commerce/purchases/requests/${currentDay.body.id}/approve`, { orderNumber: 'PLAN-TODAY-PO' }).expect(201);
    expect((await get(`/inventory/purchases/orders/${currentOrder.body.purchaseOrderId}/receipts`).expect(200)).body.order.is_receipt_overdue).toBe(false);
    await post(endpoint, { ...batch, reference: 'PLAN-RCV-2' }).expect(201);
    expect((await get(endpoint).expect(200)).body.order).toMatchObject({
      status: 'received', destination_location_code: 'WH-B', expected_receipt_date: dates.yesterday, is_receipt_overdue: false,
    });
    const listed = (await get('/commerce/purchases/requests').expect(200)).body.find((row: { id: string }) => row.id === pr.body.id);
    expect(listed).toMatchObject({ destination_location_code: 'WH-B', order_destination_location_code: 'WH-B',
      order_expected_receipt_date: dates.yesterday, is_receipt_overdue: false });
    expect((await commitment().expect(200)).body.some((row: { order_id: string }) => row.order_id === id)).toBe(false);
    const stock = await db.query('SELECT location_code,on_hand::text FROM inventory_stock_balances WHERE company_id=$1 AND product_id=$2', [companyId, product.id]);
    expect(stock.rows).toEqual([{ location_code: 'ACTUAL DOCK', on_hand: '2.0000' }]);
  });

  it('reschedules a partial order without changing receipt replay, historical audit or physical stock', async () => {
    const product = (await post('/masters/products', { sku: 'REPLAN', name: 'Replanned product', unitPrice: 1 }).expect(201)).body;
    const pr = await post('/commerce/purchases/requests', {
      requestNumber: 'REPLAN-PR', supplierId, destinationLocationCode: 'PLAN-A', expectedReceiptDate: '2000-01-01',
      lines: [{ productId: product.id, quantity: 2, unitCost: 3 }],
    }).expect(201);
    const order = (await post(`/commerce/purchases/requests/${pr.body.id}/approve`, { orderNumber: 'REPLAN-PO' }).expect(201)).body.purchaseOrderId;
    const endpoint = `/inventory/purchases/orders/${order}/receipts`;
    const initial = (await get(endpoint).expect(200)).body;
    const batch = { reference: 'REPLAN-RCV-1', locationCode: 'ACTUAL-A', lines: [{ lineId: initial.lines[0].id, quantity: 1 }] };
    const receipt = (await post(endpoint, batch).expect(201)).body;
    const audit = async () => (await db.query(`SELECT payload FROM audit_log
      WHERE entity_id=$1 AND event_name='inventory.purchase.partial.receive'`, [receipt.receiptId])).rows[0].payload;
    const before = await audit();
    expect(before).toMatchObject({ delivery_plan_revision: 0, planned_destination_location_code: 'PLAN-A' });
    const revise = (expectedRevision: number) => request(app.getHttpServer()).patch(`/commerce/purchases/orders/${order}/delivery-plan`)
      .auth(token, { type: 'bearer' }).send({ destinationLocationCode: 'PLAN-B', expectedReceiptDate: '2099-01-01',
        expectedRevision, reason: 'New supplier delivery commitment' });
    await revise(0).expect(200);
    expect((await post(endpoint, batch).expect(201)).body).toEqual({ receiptId: receipt.receiptId, replayed: true });
    expect(await audit()).toEqual(before);
    const partial = (await get(endpoint).expect(200)).body;
    expect(partial.order).toMatchObject({ status: 'partially_received', destination_location_code: 'PLAN-B',
      expected_receipt_date: '2099-01-01', delivery_plan_revision: 1, is_receipt_overdue: false });
    expect(partial.receipts).toHaveLength(1);
    expect(partial.receipts[0]).toMatchObject({ quantity: '1.0000', location_code: 'ACTUAL-A' });
    const next = (await post(endpoint, { ...batch, reference: 'REPLAN-RCV-2', locationCode: 'ACTUAL-B' }).expect(201)).body;
    const nextAudit = await db.query(`SELECT payload FROM audit_log WHERE entity_id=$1
      AND event_name='inventory.purchase.partial.receive'`, [next.receiptId]);
    expect(nextAudit.rows[0].payload).toMatchObject({ delivery_plan_revision: 1,
      planned_destination_location_code: 'PLAN-B', expected_receipt_date: '2099-01-01', locationCode: 'ACTUAL-B' });
    await revise(1).expect(409);
    expect((await db.query(`SELECT location_code,on_hand::text FROM inventory_stock_balances
      WHERE company_id=$1 AND product_id=$2 ORDER BY location_code`, [companyId, product.id])).rows).toEqual([
      { location_code: 'ACTUAL-A', on_hand: '1.0000' }, { location_code: 'ACTUAL-B', on_hand: '1.0000' },
    ]);
  });

  it('serializes final receipt against rescheduling and audits the exact committed plan', async () => {
    const pr = await post('/commerce/purchases/requests', { requestNumber: 'REPLAN-RACE-PR', supplierId,
      destinationLocationCode: 'OLD', lines: [{ productId, quantity: 1, unitCost: 1 }] }).expect(201);
    const order = (await post(`/commerce/purchases/requests/${pr.body.id}/approve`,
      { orderNumber: 'REPLAN-RACE-PO' }).expect(201)).body.purchaseOrderId;
    const endpoint = `/inventory/purchases/orders/${order}/receipts`;
    const line = (await get(endpoint).expect(200)).body.lines[0].id;
    const [revised, receipt] = await Promise.all([
      request(app.getHttpServer()).patch(`/commerce/purchases/orders/${order}/delivery-plan`).auth(token, { type: 'bearer' })
        .send({ destinationLocationCode: 'NEW', expectedReceiptDate: null, expectedRevision: 0, reason: 'Concurrent supplier plan update' }),
      post(endpoint, { reference: 'REPLAN-RACE-RCV', locationCode: 'RACE-ACTUAL', lines: [{ lineId: line, quantity: 1 }] }),
    ]);
    expect(receipt.status).toBe(201);
    expect([200, 409]).toContain(revised.status);
    const audit = await db.query(`SELECT payload FROM audit_log WHERE entity_id=$1
      AND event_name='inventory.purchase.partial.receive'`, [receipt.body.receiptId]);
    expect(audit.rows[0].payload).toMatchObject({
      planned_destination_location_code: revised.status === 200 ? 'NEW' : 'OLD',
      delivery_plan_revision: revised.status === 200 ? 1 : 0, locationCode: 'RACE-ACTUAL',
    });
    expect((await get(endpoint).expect(200)).body.order.status).toBe('received');
  });

  it('serializes competing recoveries at the exact remaining credit and never alters original documents', async () => {
    const endpoint = `/accounting/purchase-orders/${orderId}/refunds`;
    const input = { amount: 6.6667, reason: 'Remaining credit actually received by bank' };
    const responses = await Promise.all([post(endpoint, { ...input, reference: 'RECOVER-LAST-A' }), post(endpoint, { ...input, reference: 'RECOVER-LAST-B' })]);
    expect(responses.map(row => row.status).sort()).toEqual([201, 400]);
    expect((await get(endpoint)).body).toHaveLength(2);
    const payable = (await get('/accounting/payables')).body.find((row: { id: string }) => row.id === orderId);
    expect(payable).toMatchObject({ total_paid: '10.0000', total_returned: '19.4998', total_refunded: '10.0000', balance_due: '0.0000' });
    await post(endpoint, { ...input, reference: 'NO-CREDIT', amount: 0.0001 }).expect(400);
    const entries = await db.query<{ total: string; debit: string; credit: string }>(
      `SELECT COUNT(DISTINCT e.id)::text total,SUM(l.debit)::text debit,SUM(l.credit)::text credit
       FROM accounting_journal_entries e JOIN accounting_journal_lines l ON l.journal_entry_id=e.id
       WHERE e.company_id=$1 AND e.source_type='supplier_refund'`, [companyId],
    );
    expect(entries.rows[0]).toEqual({ total: '2', debit: '10.0000', credit: '10.0000' });
    const audits = await db.query<{ total: string }>(
      `SELECT COUNT(*)::text total FROM audit_log WHERE company_id=$1 AND event_name='accounting.supplier.refund'`, [companyId],
    );
    expect(audits.rows[0].total).toBe('2');
  });
});
