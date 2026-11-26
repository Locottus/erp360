import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('Operational accounting completion', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let token: string;
  let customerId: string;
  let productId: string;
  let bankAccountId: string;
  const suffix = Date.now().toString();
  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }).send(body);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DatabaseService);
    const email = `accounting-${suffix}@example.test`;
    await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
      companyCode: `ACCT-${suffix}`, companyName: 'Accounting completion test', email,
      fullName: 'Accounting Administrator', password: 'AccountingTest123!',
    }).expect(201);
    token = (await request(app.getHttpServer()).post('/auth/login').send({
      email, password: 'AccountingTest123!',
    }).expect(201)).body.access_token;
    customerId = (await post('/masters/customers', {
      code: `CUSTOMER-${suffix}`, name: 'Accounting customer',
    }).expect(201)).body.id;
    productId = (await post('/masters/products', {
      sku: `ACCOUNTING-${suffix}`, name: 'Accounting product', unitPrice: 20,
    }).expect(201)).body.id;
    await post('/accounting/bootstrap-accounts', {}).expect(201);
    bankAccountId = (await post('/accounting/bank-accounts', {
      code: `BANK-${suffix}`, bankName: 'Validation Bank',
    }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('imports a balanced generic CSV idempotently and keeps lines pending reconciliation', async () => {
    const csv = [
      'reference,line_type,amount,booked_at,counterpart_reference',
      'TX-001,credit,20.0000,2026-11-18T10:00:00Z,INVOICE-001',
      'TX-002,debit,5.0000,2026-11-18T10:05:00Z,FEE-001',
    ].join('\r\n');
    const input = {
      statementReference: `STMT-${suffix}`, statementDate: '2026-11-18',
      openingBalance: '100.0000', closingBalance: '115.0000', csv,
    };
    const first = await post(`/accounting/bank-accounts/${bankAccountId}/statements/import`, input).expect(201);
    const replay = await post(`/accounting/bank-accounts/${bankAccountId}/statements/import`, input).expect(201);
    expect(first.body).toMatchObject({ importedLines: 2, replayed: false });
    expect(replay.body).toMatchObject({ id: first.body.id, importedLines: 2, replayed: true });
    await post(`/accounting/bank-accounts/${bankAccountId}/statements/import`, {
      ...input, statementReference: `STMT-DUP-${suffix}`,
    }).expect(409);
    await post(`/accounting/bank-accounts/${bankAccountId}/statements/import`, {
      ...input, statementReference: `STMT-BAD-${suffix}`, closingBalance: '116',
    }).expect(400);

    const lines = await db.query<{ count: string; statuses: string[] }>(
      `SELECT COUNT(*)::text AS count,ARRAY_AGG(reconciliation_status) AS statuses
       FROM bank_statement_lines WHERE statement_id=$1`,
      [first.body.id],
    );
    expect(lines.rows[0]).toEqual({ count: '2', statuses: ['pending', 'pending'] });

    const line = await db.query<{ id: string }>(
      'SELECT id FROM bank_statement_lines WHERE statement_id=$1 ORDER BY reference LIMIT 1',
      [first.body.id],
    );
    await post(`/accounting/bank-reconciliation-lines/${line.rows[0].id}/reconcile`, {
      status: 'difference',
      differenceAmount: 1,
      reason: 'Difference confirmed for isolated bank validation',
    }).expect(201);
    await post(`/accounting/bank-reconciliation-lines/${line.rows[0].id}/reverse`, {
      reason: 'Controlled reversal after isolated validation',
    }).expect(201);
    const reversed = await db.query<{ reconciliation_status: string; reconciliation_reason: string }>(
      `SELECT reconciliation_status,reconciliation_reason
       FROM bank_statement_lines WHERE id=$1`,
      [line.rows[0].id],
    );
    expect(reversed.rows[0]).toEqual({
      reconciliation_status: 'pending',
      reconciliation_reason: 'Controlled reversal after isolated validation',
    });
  });

  it('creates cumulative partial credits and restores only credited physical quantities with COGS', async () => {
    await post('/inventory/adjustments', {
      productId, direction: 'in', quantity: 2, unitCost: 5, locationCode: 'RETURN',
    }).expect(201);
    const quotation = await post('/commerce/sales/quotations', {
      quotationNumber: `Q-${suffix}`, customerId, lines: [{ productId, quantity: 2, unitPrice: 20 }],
    }).expect(201);
    const confirmed = await post(`/commerce/sales/quotations/${quotation.body.id}/confirm`, {
      orderNumber: `SO-${suffix}`,
    }).expect(201);
    const orderId = confirmed.body.orderId as string;
    const invoice = await post(`/commerce/sales/orders/${orderId}/invoice`, {
      invoiceNumber: `INV-${suffix}`,
    }).expect(201);
    await post(`/accounting/sales-invoices/${invoice.body.invoiceId}/post`, {}).expect(201);
    await post(`/inventory/sales/orders/${orderId}/reserve`, { locationCode: 'RETURN' }).expect(201);
    await post(`/inventory/sales/orders/${orderId}/dispatch`, {}).expect(201);
    const orderLine = await db.query<{ id: string }>(
      'SELECT id FROM sales_order_lines WHERE order_id=$1', [orderId],
    );

    const firstCredit = await post(`/accounting/sales-invoices/${invoice.body.invoiceId}/credit`, {
      reason: 'Partial quantity correction requested by the customer',
      returnStock: false, lines: [{ orderLineId: orderLine.rows[0].id, quantity: 0.5 }],
    }).expect(201);
    expect(firstCredit.body).toMatchObject({ subtotal: 10, taxTotal: 0, grandTotal: 10, fullyCredited: false });
    const secondCredit = await post(`/accounting/sales-invoices/${invoice.body.invoiceId}/credit`, {
      reason: 'Second partial quantity correction requested by the customer',
      returnStock: false, lines: [{ orderLineId: orderLine.rows[0].id, quantity: 0.5 }],
    }).expect(201);
    expect(secondCredit.body).toMatchObject({ subtotal: 10, grandTotal: 10, fullyCredited: false });
    await post(`/accounting/sales-invoices/${invoice.body.invoiceId}/credit`, {
      reason: 'Excess quantity should be rejected',
      returnStock: false, lines: [{ orderLineId: orderLine.rows[0].id, quantity: 1.0001 }],
    }).expect(400);

    const creditLine = await db.query<{ id: string }>(
      'SELECT id FROM sales_credit_note_lines WHERE credit_note_id=$1', [firstCredit.body.id],
    );
    const firstReturn = await post(`/accounting/credits/${firstCredit.body.id}/stock-return`, {
      reference: `RET-1-${suffix}`, reason: 'Return one quarter of credited goods',
      lines: [{ creditNoteLineId: creditLine.rows[0].id, quantity: 0.25 }],
    }).expect(201);
    await post(`/accounting/credits/${firstCredit.body.id}/stock-return`, {
      reference: `RET-2-${suffix}`, reason: 'Return the remaining quarter of credited goods',
    }).expect(201);
    const listed = (await request(app.getHttpServer()).get('/accounting/credits').auth(token, { type: 'bearer' }).expect(200))
      .body.find((credit: { id: string }) => credit.id === firstCredit.body.id);
    expect(listed.stock_returned).toBe(true);

    const returnTotals = await db.query<{ returned: string; reversed_cogs: string; inventory: string }>(
      `SELECT
         (SELECT COALESCE(SUM(quantity),0)::text FROM sales_credit_stock_return_lines WHERE return_id IN ($1,$2)) AS returned,
         (SELECT COALESCE(SUM(jl.credit),0)::text FROM accounting_journal_entries je
          JOIN accounting_journal_lines jl ON jl.journal_entry_id=je.id
          JOIN accounting_accounts a ON a.id=jl.account_id
          WHERE je.source_type='sales_credit_stock_return' AND je.source_id IN ($1,$2) AND a.code='5100') AS reversed_cogs,
         (SELECT on_hand::text FROM inventory_stock_balances
          WHERE company_id=(SELECT company_id FROM sales_orders WHERE id=$3) AND product_id=$4 AND location_code='RETURN') AS inventory`,
      [firstReturn.body.id, (await db.query<{ id: string }>(
        `SELECT id FROM sales_credit_stock_returns WHERE credit_note_id=$1 AND id<>$2`,
        [firstCredit.body.id, firstReturn.body.id],
      )).rows[0].id, orderId, productId],
    );
    expect(returnTotals.rows[0]).toEqual({ returned: '0.5000', reversed_cogs: '2.5000', inventory: '0.5000' });
  });
});
