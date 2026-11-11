import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('Operational controls and financial reversals', () => {
  let app: INestApplication;
  let token: string;
  let otherToken: string;
  let customerId: string;
  let productId: string;
  let supplierId: string;
  const suffix = Date.now().toString();
  let sequence = 0;
  const post = (path: string, body: object) => request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }).send(body);
  const get = (path: string) => request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });
  async function sale() {
    const quotation = await post('/commerce/sales/quotations', {
      quotationNumber: `Q-${suffix}-${++sequence}`, customerId, lines: [{ productId, quantity: 2 }],
    }).expect(201);
    return (await post(`/commerce/sales/quotations/${quotation.body.id}/confirm`, { orderNumber: `SO-${suffix}-${sequence}` }).expect(201)).body.orderId as string;
  }
  async function purchase() {
    const input = await post('/commerce/purchases/requests', {
      requestNumber: `PR-${suffix}-${++sequence}`, supplierId, lines: [{ productId, quantity: 3, unitCost: 20 }],
    }).expect(201);
    return (await post(`/commerce/purchases/requests/${input.body.id}/approve`, { orderNumber: `PO-${suffix}-${sequence}` }).expect(201)).body.purchaseOrderId as string;
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init();
    for (const other of [false, true]) {
      const email = `controls-${other}-${suffix}@example.test`;
      await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
        companyCode: `CTRL-${other}-${suffix}`, companyName: 'Control test company', email,
        fullName: 'Control Administrator', password: 'ControlsTest123!',
      }).expect(201);
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'ControlsTest123!' }).expect(201);
      if (other) otherToken = login.body.access_token; else token = login.body.access_token;
    }
    customerId = (await post('/masters/customers', { code: 'CUSTOMER', name: 'Customer' }).expect(201)).body.id;
    supplierId = (await post('/masters/suppliers', { code: 'SUPPLIER', name: 'Supplier' }).expect(201)).body.id;
    productId = (await post('/masters/products', { sku: 'CONTROL', name: 'Controlled product', unitPrice: 50 }).expect(201)).body.id;
    await post('/inventory/adjustments', { productId, quantity: 20, direction: 'in', locationCode: 'WH-A' }).expect(201);
    await post('/accounting/bootstrap-accounts', {}).expect(201);
  });
  afterAll(async () => { await app.close(); });

  it('keeps transfers idempotent, protects reservations, rejects stale counts and cancels safely', async () => {
    const transfer = { productId, locationCode: 'WH-A', destinationCode: 'WH-B', quantity: 3, reference: 'TRANSFER-1' };
    await post('/inventory/transfers', { ...transfer, productId: '-'.repeat(36) }).expect(400);
    await post('/inventory/transfers', { ...transfer, destinationCode: '' }).expect(400);
    const concurrent = await Promise.all([post('/inventory/transfers', transfer), post('/inventory/transfers', transfer)]);
    expect(concurrent.map(row => row.status)).toEqual([201, 201]);
    expect(concurrent.map(row => row.body.replayed).sort()).toEqual([false, true]);
    await post('/inventory/transfers', { ...transfer, quantity: 4 }).expect(409);
    const stocks = await get('/inventory/stock').expect(200);
    expect(stocks.body.reduce((total: number, row: { on_hand: string }) => total + Number(row.on_hand), 0)).toBe(20);
    await post('/inventory/counts', { productId, locationCode: 'WH-A', quantity: 16, expectedOnHand: 20, reference: 'STALE' }).expect(409);
    const id = await sale();
    await post(`/inventory/sales/orders/${id}/reserve`, { locationCode: 'WH-A' }).expect(201);
    await post('/inventory/transfers', { ...transfer, reference: 'RESERVED', quantity: 16 }).expect(400);
    await post('/inventory/counts', { productId, locationCode: 'WH-A', quantity: 1, expectedOnHand: 17, reference: 'BELOW-RESERVED' }).expect(400);
    await post('/inventory/adjustments', { productId, locationCode: 'WH-A', direction: 'out', quantity: 16 }).expect(400);
    await request(app.getHttpServer()).post(`/commerce/sales/orders/${id}/cancel`).auth(otherToken, { type: 'bearer' })
      .send({ reason: 'Wrong tenant cancellation' }).expect(404);
    await post(`/commerce/sales/orders/${id}/cancel`, { reason: 'Customer cancelled before shipment' }).expect(201);
    await post(`/inventory/sales/orders/${id}/reserve`, { locationCode: 'WH-A' }).expect(400);
    const after = await get('/inventory/stock?locationCode=WH-A').expect(200);
    expect(Number(after.body[0].on_hand)).toBe(17);
    expect(Number(after.body[0].reserved)).toBe(0);
    await post('/inventory/counts', { productId, locationCode: 'WH-A', quantity: 18, expectedOnHand: 17, reference: 'COUNT-1' }).expect(201);
  });

  it('generates a real PDF and atomically credits, returns stock and records bounded refunds across closed periods', async () => {
    const id = await sale();
    await post(`/inventory/sales/orders/${id}/reserve`, { locationCode: 'WH-A' }).expect(201);
    await post(`/inventory/sales/orders/${id}/dispatch`, {}).expect(201);
    await post(`/commerce/sales/orders/${id}/invoice`, { invoiceNumber: 'AUTO-INV-00000001' }).expect(400);
    const invoice = await post(`/commerce/sales/orders/${id}/invoice`, {}).expect(201);
    expect(invoice.body.invoiceNumber).toMatch(/^AUTO-INV-\d{8}$/);
    const invoiceId = invoice.body.invoiceId;
    const pdf = await get(`/commerce/sales/invoices/${invoiceId}/pdf`).expect('Content-Type', /application\/pdf/).expect(200);
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    const db = app.get(DatabaseService);
    await db.query('UPDATE products SET name=$1 WHERE id=$2', ['Renamed after invoice', productId]);
    const snapshot = await db.query<{ document_snapshot: { lines: { name: string }[] } }>(
      'SELECT document_snapshot FROM sales_invoices WHERE id=$1', [invoiceId],
    );
    expect(snapshot.rows[0].document_snapshot.lines[0].name).toBe('Controlled product');
    await request(app.getHttpServer()).get(`/commerce/sales/invoices/${invoiceId}/pdf`).auth(otherToken, { type: 'bearer' }).expect(404);
    const postings = await Promise.all([post(`/accounting/sales-invoices/${invoiceId}/post`, {}), post(`/accounting/sales-invoices/${invoiceId}/post`, {})]);
    expect(postings.map(row => row.status).sort()).toEqual([201, 400]);
    await post(`/accounting/sales-invoices/${invoiceId}/payments`, { paymentReference: 'CUSTOMER-PAYMENT', amount: 60 }).expect(201);
    await post(`/commerce/sales/orders/${id}/cancel`, { reason: 'Cannot silently cancel an invoice' }).expect(400);
    const current = await app.get(DatabaseService).query<{ year: number; month: number }>(
      'SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS year,EXTRACT(MONTH FROM CURRENT_DATE)::int AS month',
    );
    const period = current.rows[0];
    await post('/accounting/periods/close', period).expect(201);
    const credit = { reason: 'All goods returned by customer', returnStock: true };
    await post(`/accounting/sales-invoices/${invoiceId}/credit`, credit).expect(400);
    expect((await get('/accounting/credits')).body).toHaveLength(0);
    await post('/accounting/periods/reopen', { ...period, reason: 'Authorized credit correction' }).expect(201);
    const credits = await Promise.all([post(`/accounting/sales-invoices/${invoiceId}/credit`, credit), post(`/accounting/sales-invoices/${invoiceId}/credit`, credit)]);
    expect(credits.map(row => row.status).sort()).toEqual([201, 409]);
    const creditId = credits.find(row => row.status === 201)!.body.id;
    const stock = await get('/inventory/stock?locationCode=WH-A').expect(200);
    expect(Number(stock.body[0].on_hand)).toBe(18);
    const invoices = await get('/commerce/sales/invoices').expect(200);
    expect(invoices.body.find((row: { id: string }) => row.id === invoiceId)).toMatchObject({ status: 'void', balance_due: '0' });
    await post(`/accounting/credits/${creditId}/refunds`, { paymentReference: 'EXCESS', amount: 61 }).expect(400);
    const refunds = await Promise.all([
      post(`/accounting/credits/${creditId}/refunds`, { paymentReference: 'REFUND-1', amount: 40 }),
      post(`/accounting/credits/${creditId}/refunds`, { paymentReference: 'REFUND-2', amount: 40 }),
    ]);
    expect(refunds.map(row => row.status).sort()).toEqual([201, 400]);
    await post(`/accounting/credits/${creditId}/refunds`, { paymentReference: 'REFUND-REMAINDER', amount: 20 }).expect(201);
    const final = await get('/accounting/credits').expect(200);
    expect(Number(final.body[0].refund_due)).toBe(0);
    const balance = await get('/accounting/reports/trial-balance').expect(200);
    expect(balance.body.totals).toMatchObject({ isBalanced: true });
    await post('/accounting/periods/close', period).expect(201);
    await post(`/accounting/credits/${creditId}/refunds`, { paymentReference: 'EXTRA', amount: 1 }).expect(400);
    await post('/accounting/periods/reopen', { ...period, reason: 'Continue other isolated workflow tests' }).expect(201);
  });

  it('prevents duplicate purchase accrual, supplier overpayment and cancellation after receipt', async () => {
    const cancelled = await purchase();
    await post(`/commerce/purchases/orders/${cancelled}/cancel`, { reason: 'Supplier unable to provide the goods' }).expect(201);
    await post(`/commerce/purchases/orders/${cancelled}/receive`, { receiptNumber: 'NEVER' }).expect(400);
    const id = await purchase();
    await post(`/accounting/purchase-orders/${id}/payments`, { paymentReference: 'TOO-EARLY', amount: 1 }).expect(400);
    await post(`/commerce/purchases/orders/${id}/receive`, { receiptNumber: 'RECEIPT-1' }).expect(201);
    await post(`/inventory/purchases/orders/${id}/receive`, { locationCode: 'WH-A' }).expect(201);
    const postings = await Promise.all([post(`/accounting/purchase-orders/${id}/post`, {}), post(`/accounting/purchase-orders/${id}/post`, {})]);
    expect(postings.map(row => row.status).sort()).toEqual([201, 400]);
    await post(`/commerce/purchases/orders/${id}/cancel`, { reason: 'Already received and posted purchase' }).expect(400);
    await post(`/accounting/purchase-orders/${id}/payments`, { paymentReference: 'OVER', amount: 61 }).expect(400);
    const payments = await Promise.all([
      post(`/accounting/purchase-orders/${id}/payments`, { paymentReference: 'SUP-1', amount: 40 }),
      post(`/accounting/purchase-orders/${id}/payments`, { paymentReference: 'SUP-2', amount: 40 }),
    ]);
    expect(payments.map(row => row.status).sort()).toEqual([201, 400]);
    const payables = await get('/accounting/payables').expect(200);
    expect(Number(payables.body.find((row: { id: string }) => row.id === id).balance_due)).toBe(20);
  });

  it('receives all goods after an earlier credit once, without another credit, refund or accounting entry', async () => {
    const id = await sale();
    await post(`/inventory/sales/orders/${id}/reserve`, { locationCode: 'WH-A' }).expect(201);
    await post(`/inventory/sales/orders/${id}/dispatch`, {}).expect(201);
    const invoice = await post(`/commerce/sales/orders/${id}/invoice`, {}).expect(201);
    await post(`/accounting/sales-invoices/${invoice.body.invoiceId}/post`, {}).expect(201);
    const credit = await post(`/accounting/sales-invoices/${invoice.body.invoiceId}/credit`,
      { reason: 'Credit now while goods are still in transit', returnStock: false }).expect(201);
    const creditId = credit.body.id as string;
    const current = (await get('/accounting/credits')).body.find((row: { id: string }) => row.id === creditId);
    expect(current.can_return_stock).toBe(true);
    const stockBefore = Number((await get('/inventory/stock?locationCode=WH-A')).body[0].on_hand);
    const db = app.get(DatabaseService);
    const before = (await db.query<{ total: string }>('SELECT COUNT(*)::text total FROM accounting_journal_entries WHERE company_id=$1',
      [(await db.query<{ company_id: string }>('SELECT company_id FROM sales_credit_notes WHERE id=$1', [creditId])).rows[0].company_id])).rows[0].total;
    const endpoint = `/accounting/credits/${creditId}/stock-return`;
    const input = { reference: 'RETURN-LATER', reason: 'All dispatched goods physically received today' };
    await post(endpoint, { ...input, reason: 'short' }).expect(400);
    await request(app.getHttpServer()).post(endpoint).auth(otherToken, { type: 'bearer' }).send(input).expect(404);
    const responses = await Promise.all([post(endpoint, input), post(endpoint, input)]);
    expect(responses.map(row => row.status)).toEqual([201, 201]);
    expect(responses.map(row => row.body.replayed).sort()).toEqual([false, true]);
    expect(Number((await get('/inventory/stock?locationCode=WH-A')).body[0].on_hand)).toBe(stockBefore + 2);
    await post(endpoint, { ...input, reason: 'Different payload must not silently replay' }).expect(409);
    await post(endpoint, { ...input, reference: 'RETURN-AGAIN' }).expect(409);
    const after = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text total FROM accounting_journal_entries WHERE company_id=(SELECT company_id FROM sales_credit_notes WHERE id=$1)', [creditId],
    );
    expect(after.rows[0].total).toBe(before);
    const listing = (await get('/accounting/credits')).body.find((row: { id: string }) => row.id === creditId);
    expect(listing.stock_returned).toBe(true);
    expect(listing.can_return_stock).toBe(false);
    const immediate = (await get('/accounting/credits')).body.find((row: { id: string }) => row.id !== creditId);
    await post(`/accounting/credits/${immediate.id}/stock-return`, input).expect(409);
  });

  it('does not transmit a credited invoice or mistake its commercial credit for fiscal cancellation', async () => {
    await post('/fiscal/providers/config', { countryCode: 'GT', providerCode: 'sandbox-only', environment: 'sandbox', endpointUrl: 'https://sandbox.example.test' }).expect(201);
    for (const submitBeforeCredit of [false, true]) {
      const id = await sale();
      const invoiceId = (await post(`/commerce/sales/orders/${id}/invoice`, {}).expect(201)).body.invoiceId as string;
      await post(`/accounting/sales-invoices/${invoiceId}/post`, {}).expect(201);
      const doc = await post(`/fiscal/invoices/${invoiceId}/documents`, { countryCode: 'GT' }).expect(201);
      if (submitBeforeCredit) {
        await post(`/fiscal/documents/${doc.body.id}/submit`, {}).expect(201);
        await post(`/fiscal/documents/${doc.body.id}/submit`, {}).expect(409);
      }
      await post(`/accounting/sales-invoices/${invoiceId}/credit`, { reason: 'Commercial correction without legal cancellation', returnStock: false }).expect(201);
      await post(`/fiscal/documents/${doc.body.id}/submit`, {}).expect(400);
      await post(`/fiscal/invoices/${invoiceId}/documents`, { countryCode: 'GT' }).expect(400);
      const transmissions = await app.get(DatabaseService).query<{ total: string }>(
        'SELECT COUNT(*)::text total FROM fiscal_transmissions WHERE fiscal_document_id=$1', [doc.body.id],
      );
      expect(Number(transmissions.rows[0].total)).toBe(submitBeforeCredit ? 1 : 0);
      const status = await app.get(DatabaseService).query<{ status: string }>('SELECT status FROM fiscal_documents WHERE id=$1', [doc.body.id]);
      expect(status.rows[0].status).toBe(submitBeforeCredit ? 'accepted' : 'draft');
    }
  });
});
