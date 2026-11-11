import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('Users, company, replenishment and exact general ledger', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let token: string;
  let otherToken: string;
  let employeeToken: string;
  let companyId: string;
  let otherCompanyId: string;
  let adminId: string;
  let productId: string;
  let otherProductId: string;
  const suffix = Date.now();
  const password = 'Core-Management-Test-12345!';
  const reason = 'Reviewed core management configuration';
  const auth = { type: 'bearer' as const };
  const get = (url: string, bearer = token) => request(app.getHttpServer()).get(url).auth(bearer, auth);
  const post = (url: string, data: object, bearer = token) => request(app.getHttpServer()).post(url).auth(bearer, auth).send(data);
  const patch = (url: string, data: object, bearer = token) => request(app.getHttpServer()).patch(url).auth(bearer, auth).send(data);
  const policy = (extra: object = {}) => ({ locationCode: 'main', minimumQuantity: '2.0001', targetQuantity: '5.0002', expectedRevision: 0, reason, ...extra });
  const ledger = (extra: Record<string, string> = {}, bearer = token) =>
    get('/accounting/reports/general-ledger', bearer).query({ accountCode: '1100', fromDate: '2025-02-01', toDate: '2025-02-28', ...extra });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init(); db = app.get(DatabaseService);
    for (const other of [false, true]) {
      const email = `core-admin-${other}-${suffix}@example.test`;
      await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
        companyCode: `CORE-${other}-${suffix}`, companyName: 'Core fixture', email, password, fullName: 'Core admin',
      }).expect(201);
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
      if (other) { otherToken = login.body.access_token; otherCompanyId = login.body.user.companyId; }
      else { token = login.body.access_token; companyId = login.body.user.companyId; adminId = login.body.user.id; }
    }
    const email = `core-reader-${suffix}@example.test`;
    const invitation = await post('/auth/users', { email, fullName: 'Read only', roles: ['employee'] }).expect(201);
    await request(app.getHttpServer()).post('/auth/reset-password').send({ token: invitation.body.activationToken, password }).expect(201);
    employeeToken = (await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201)).body.access_token;
    productId = (await post('/masters/products', { sku: 'CORE', name: 'Core product', unitPrice: 1 }).expect(201)).body.id;
    otherProductId = (await post('/masters/products', { sku: 'CORE-OTHER', name: 'Other product', unitPrice: 1 }, otherToken).expect(201)).body.id;
    for (const bearer of [token, otherToken]) await post('/accounting/bootstrap-accounts', {}, bearer).expect(201);
  });
  afterAll(async () => { await app.close(); });

  it('updates users under revision lock, audits before/after and revokes their sessions', async () => {
    const email = `core-edited-${suffix}@example.test`;
    const invitation = await post('/auth/users', { email, fullName: 'Before editing', roles: ['employee'] }).expect(201);
    await request(app.getHttpServer()).post('/auth/reset-password').send({ token: invitation.body.activationToken, password }).expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
    const url = `/auth/users/${invitation.body.id}`;
    const data = { fullName: 'Reviewed user', roles: ['sales'], isActive: true, expectedRevision: 0, reason };
    const responses = await Promise.all([patch(url, data), patch(url, data)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    await get('/auth/me', login.body.access_token).expect(401);
    const users = (await get('/auth/users').expect(200)).body;
    expect(users.find((u: { id: string }) => u.id === invitation.body.id)).toMatchObject({
      full_name: 'Reviewed user', management_revision: 1, roles: ['sales'],
    });
    const audit = await db.query(`SELECT payload FROM audit_log WHERE entity_id=$1 AND event_name='user.update'`, [invitation.body.id]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].payload).toMatchObject({
      before: { full_name: 'Before editing', roles: ['employee'], management_revision: 0 },
      after: { full_name: 'Reviewed user', roles: ['sales'], management_revision: 1 }, reason,
    });
    await patch(url, { ...data, expectedRevision: 1, isActive: false }).expect(200);
    await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(401);
    await patch(url, { ...data, expectedRevision: 2 }, otherToken).expect(400);
    await patch(url, { ...data, expectedRevision: 2 }, employeeToken).expect(403);
  });

  it('requires explicit user revision/reason and preserves the last administrator', async () => {
    const url = `/auth/users/${adminId}`;
    const data = { fullName: 'Core admin', roles: ['employee'], isActive: false, expectedRevision: 0, reason };
    for (const expectedRevision of [undefined, -1, 0.1, '0', null]) {
      await patch(url, { ...data, expectedRevision }).expect(400);
    }
    await patch(url, { ...data, reason: 'short' }).expect(400);
    await patch(url, data).expect(400);
    await get('/auth/me').expect(200);
  });

  it('revises only current company profile with an exact conflict and immutable identity', async () => {
    const profile = (await get('/companies/current').expect(200)).body;
    const otherBefore = (await get('/companies/current', otherToken).expect(200)).body;
    const customer = await post('/masters/customers', { code: 'SNAPSHOT', name: 'Snapshot fixture' }).expect(201);
    const quote = await post('/commerce/sales/quotations', { quotationNumber: 'SNAPSHOT-Q', customerId: customer.body.id,
      lines: [{ productId, quantity: 1 }] }).expect(201);
    const order = await post(`/commerce/sales/quotations/${quote.body.id}/confirm`, { orderNumber: 'SNAPSHOT-SO' }).expect(201);
    const invoice = await post(`/commerce/sales/orders/${order.body.orderId}/invoice`, { invoiceNumber: 'SNAPSHOT-INVOICE' }).expect(201);
    const snapshotBefore = await db.query('SELECT document_snapshot FROM sales_invoices WHERE id=$1', [invoice.body.invoiceId]);
    const data = { name: 'Reviewed company', taxId: 'DEMO-TAX', expectedRevision: 0, reason,
      companyId: otherCompanyId, code: 'DO-NOT-CHANGE', isActive: false };
    const responses = await Promise.all([patch('/companies/current', data), patch('/companies/current', data)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await get('/companies/current').expect(200)).body).toMatchObject({
      id: companyId, code: profile.code, name: data.name, tax_id: data.taxId, is_active: true, profile_revision: 1,
    });
    expect((await get('/companies/current', otherToken).expect(200)).body).toEqual(otherBefore);
    await patch('/companies/current', { ...data, expectedRevision: 1, taxId: null }).expect(200);
    await get(`/companies/${otherCompanyId}`).expect(403);
    const audit = await db.query(`SELECT payload FROM audit_log WHERE company_id=$1 AND event_name='company.profile.update' ORDER BY created_at`, [companyId]);
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[0].payload.before.name).toBe('Core fixture');
    expect(audit.rows[1].payload.after.tax_id).toBeNull();
    const snapshotAfter = await db.query('SELECT document_snapshot FROM sales_invoices WHERE id=$1', [invoice.body.invoiceId]);
    expect(snapshotBefore.rows).toHaveLength(1);
    expect(snapshotAfter.rows).toEqual(snapshotBefore.rows);
    expect(snapshotAfter.rows[0].document_snapshot.companyName).toBe('Core fixture');
  });

  it('validates company profile and denies non-admin writes without changing revision', async () => {
    const data = { name: 'Reviewed company', taxId: null, expectedRevision: 2, reason };
    for (const extra of [{ name: '' }, { name: 'x'.repeat(161) }, { taxId: '' }, { taxId: 1 },
      { taxId: undefined }, { expectedRevision: undefined }, { reason: 'short' }]) {
      await patch('/companies/current', { ...data, ...extra }).expect(400);
    }
    await patch('/companies/current', data).expect(409);
    await patch('/companies/current', data, employeeToken).expect(403);
    expect((await get('/companies/current').expect(200)).body.profile_revision).toBe(2);
  });

  it('calculates exact replenishment without creating stock, orders or journal entries', async () => {
    const url = `/inventory/replenishment/${productId}`;
    const results = await Promise.all([patch(url, policy()), patch(url, policy())]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    let rows = (await get('/inventory/replenishment').expect(200)).body;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ location_code: 'MAIN', revision: 1, needs_replenishment: true,
      minimum_quantity: '2.0001', target_quantity: '5.0002', suggested_quantity: '5.0002' });
    expect((await get('/inventory/stock').expect(200)).body).toHaveLength(0);
    await post('/inventory/adjustments', { productId, direction: 'in', quantity: 2, locationCode: 'MAIN', notes: 'Replenishment fixture stock' }).expect(201);
    rows = (await get('/inventory/replenishment').query({ locationCode: 'main' }).expect(200)).body;
    expect(rows[0]).toMatchObject({ available: '2.0000', needs_replenishment: true, suggested_quantity: '3.0002' });
    await post('/inventory/adjustments', { productId, direction: 'in', quantity: 0.0001, locationCode: 'MAIN', notes: 'Reach exact minimum fixture' }).expect(201);
    rows = (await get('/inventory/replenishment').expect(200)).body;
    expect(rows[0]).toMatchObject({ available: '2.0001', needs_replenishment: false, suggested_quantity: '0' });
    const customer = await post('/masters/customers', { code: 'CORE', name: 'Reserved stock fixture' }).expect(201);
    const quote = await post('/commerce/sales/quotations', { quotationNumber: 'CORE-Q', customerId: customer.body.id,
      lines: [{ productId, quantity: 1 }] }).expect(201);
    const order = await post(`/commerce/sales/quotations/${quote.body.id}/confirm`, { orderNumber: 'CORE-SO' }).expect(201);
    await post(`/inventory/sales/orders/${order.body.orderId}/reserve`, { locationCode: 'MAIN' }).expect(201);
    rows = (await get('/inventory/replenishment').expect(200)).body;
    expect(rows[0]).toMatchObject({ reserved: '1.0000', available: '1.0001', needs_replenishment: true, suggested_quantity: '4.0001' });
    await patch(url, policy({ minimumQuantity: '0', targetQuantity: '0', expectedRevision: 1 })).expect(200);
    expect((await get('/inventory/replenishment').expect(200)).body[0].needs_replenishment).toBe(false);
    const writes = await db.query(
      `SELECT (SELECT COUNT(*) FROM purchase_orders WHERE company_id=$1)::integer AS orders,
       (SELECT COUNT(*) FROM accounting_journal_entries WHERE company_id=$1)::integer AS entries`, [companyId]);
    expect(writes.rows[0]).toEqual({ orders: 0, entries: 0 });
    const audit = await db.query(`SELECT payload FROM audit_log WHERE company_id=$1 AND event_name='inventory.replenishment.update'`, [companyId]);
    expect(audit.rows).toHaveLength(2);
  });

  it('validates quantities and isolates replenishment by product, tenant and role', async () => {
    const url = `/inventory/replenishment/${productId}`;
    for (const extra of [{ minimumQuantity: '-1' }, { minimumQuantity: 2 }, { minimumQuantity: '1.00001' },
      { targetQuantity: '1' }, { expectedRevision: -1 }, { reason: 'short' }, { locationCode: '' }]) {
      await patch(url, policy({ expectedRevision: 2, ...extra })).expect(400);
    }
    await patch(`/inventory/replenishment/${otherProductId}`, policy()).expect(404);
    await patch(url, policy(), employeeToken).expect(403);
    await get('/inventory/replenishment', employeeToken).expect(403);
    await get(`/inventory/replenishment/${productId}/purchase-commitments`, employeeToken).expect(403);
    expect((await get('/inventory/replenishment', otherToken).expect(200)).body).toEqual([]);
    await patch(url, policy()).expect(409);
    await patch(url, policy({ locationCode: 'SECOND', minimumQuantity: '0.0001', targetQuantity: '0.0002' })).expect(200);
    expect((await get('/inventory/replenishment').query({ locationCode: 'SECOND' }).expect(200)).body[0])
      .toMatchObject({ suggested_quantity: '0.0002', needs_replenishment: true, revision: 1 });
  });

  async function entry(company: string, number: string, date: string, amount: string, credit = false, status = 'posted') {
    const accounts = await db.query<{ id: string; code: string }>(
      `SELECT id,code FROM accounting_accounts WHERE company_id=$1 AND code IN ('1100','1110')`, [company]);
    const id = (await db.query<{ id: string }>(
      `INSERT INTO accounting_journal_entries(company_id,entry_number,entry_date,source_type,status,created_at)
       VALUES($1,$2,$3,'test_fixture',$4,$5::timestamptz) RETURNING id`,
      [company, number, date, status, `${date}T10:00:${number.endsWith('2') ? '02' : '01'}Z`])).rows[0].id;
    for (const account of accounts.rows) {
      const debit = (account.code === '1100') !== credit;
      await db.query(`INSERT INTO accounting_journal_lines(journal_entry_id,account_id,debit,credit)
        VALUES($1,$2,$3,$4)`, [id, account.id, debit ? amount : '0', debit ? '0' : amount]);
    }
  }

  it('includes exact opening and running balances before pagination while excluding drafts and other tenants', async () => {
    await entry(companyId, 'OPEN', '2025-01-31', '10000000000000.0001');
    await entry(companyId, 'MOVE1', '2025-02-01', '0.0001');
    await entry(companyId, 'MOVE2', '2025-02-01', '0.0001', true);
    await entry(companyId, 'FUTURE', '2025-03-01', '8');
    await entry(companyId, 'DRAFT', '2025-02-01', '9', false, 'draft');
    await entry(companyId, 'REVERSED', '2025-02-01', '10', false, 'reversed');
    await entry(otherCompanyId, 'OTHER', '2025-02-01', '11');
    const first = (await ledger({ pageSize: '1' }).expect(200)).body;
    expect(first.summary).toEqual({ opening: '10000000000000.0001', debit: '0.0001', credit: '0.0001', closing: '10000000000000.0001' });
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ entry_number: 'MOVE1', entry_date: '2025-02-01', running_balance: '10000000000000.0002' });
    const second = (await ledger({ pageSize: '1', page: '2' }).expect(200)).body;
    expect(second.summary).toEqual(first.summary);
    expect(second.items[0]).toMatchObject({ entry_number: 'MOVE2', running_balance: '10000000000000.0001' });
    const before = (await ledger({ fromDate: '2025-02-02' }).expect(200)).body;
    expect(before.items).toEqual([]);
    expect(before.summary.opening).toBe('10000000000000.0001');
    expect(before.summary.closing).toBe('10000000000000.0001');
    const other = (await ledger({}, otherToken).expect(200)).body;
    expect(other.total).toBe(1);
    expect(other.items[0].entry_number).toBe('OTHER');
  });

  it('validates ledger range, account and bounded pagination and requires accounting access', async () => {
    for (const extra of [{ fromDate: '2025-02-30' }, { fromDate: '0000-01-01' }, { toDate: '' },
      { fromDate: '2025-03-01' }, { page: '0' }, { page: '1.1' }, { pageSize: '101' }, { accountCode: '' }]) {
      await ledger(extra).expect(400);
    }
    await get('/accounting/reports/general-ledger').expect(400);
    await ledger({ accountCode: 'MISSING' }).expect(404);
    await ledger({}, employeeToken).expect(403);
    await get('/accounting/accounts', employeeToken).expect(403);
    const accounts = (await get('/accounting/accounts').expect(200)).body;
    expect(accounts.some((row: { account_code: string }) => row.account_code === '1100')).toBe(true);
    await request(app.getHttpServer()).get('/accounting/reports/general-ledger').expect(401);
    const empty = (await ledger({ accountCode: '2200' }).expect(200)).body;
    expect(empty).toMatchObject({ total: 0, items: [], summary: { opening: '0', debit: '0', credit: '0', closing: '0' } });
  });
});
