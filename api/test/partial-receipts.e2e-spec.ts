import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

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
  const details = async (): Promise<Details> => (await get(`/inventory/purchases/orders/${orderId}/receipts`).expect(200)).body as Details;
  const stock = async () => Number((await get('/inventory/stock?locationCode=DOCK').expect(200)).body[0]?.on_hand ?? 0);

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
  });
  afterAll(async () => { await app.close(); });

  it('rejects invalid quantities, duplicate lines and cross-tenant access without writes', async () => {
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

  it('serializes a repeated batch, snapshots cost and blocks legacy/full and premature accounting paths', async () => {
    const endpoint = `/inventory/purchases/orders/${orderId}/receipts`;
    const input = { reference: 'RCV-1', locationCode: 'dock', lines: [{ lineId, quantity: 2 }] };
    const concurrent = await Promise.all([post(endpoint, input), post(endpoint, input)]);
    expect(concurrent.map(row => row.status)).toEqual([201, 201]);
    expect(concurrent.map(row => row.body.replayed).sort()).toEqual([false, true]);
    expect(concurrent[0].body.receiptId).toBe(concurrent[1].body.receiptId);
    expect(await stock()).toBe(2);
    const current = await details();
    expect(current.order.status).toBe('partially_received');
    expect(Number(current.lines[0].remaining)).toBe(3);
    expect(current.receipts[0].unit_cost).toBe('3.3333');
    receiptLine = current.receipts[0].id;
    await post(endpoint, { ...input, lines: [{ lineId, quantity: 3 }] }).expect(409);
    await post(endpoint, { ...input, reference: 'EXCESS', lines: [{ lineId, quantity: 4 }] }).expect(409);
    await post(`/commerce/purchases/orders/${orderId}/receive`, { receiptNumber: 'LEGACY' }).expect(400);
    await post(`/inventory/purchases/orders/${orderId}/receive`, { locationCode: 'DOCK' }).expect(400);
    await post(`/accounting/purchase-orders/${orderId}/post`, {}).expect(400);
    await post(`/accounting/purchase-orders/${orderId}/returns`, { reference: 'EARLY', reason: 'Too early to return goods', lines: [{ lineId: receiptLine, quantity: 1 }] }).expect(400);
    const listed = (await get('/commerce/purchases/requests')).body;
    expect(listed[0].inventory_received).toBe(true);
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
    expect(Number((await get('/accounting/payables')).body[0].balance_due)).toBe(5.5998);
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
    const payable = (await get('/accounting/payables')).body[0];
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
