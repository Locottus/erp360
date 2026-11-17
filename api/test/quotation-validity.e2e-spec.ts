import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('Quotation validity adapted from observed sales workflow', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let token: string;
  let otherToken: string;
  let companyId: string;
  let customerId: string;
  let productId: string;
  let today: string;
  let yesterday: string;
  let future: string;
  let sequence = 0;
  const suffix = Date.now();
  const post = (url: string, data: object) => request(app.getHttpServer()).post(url).auth(token, { type: 'bearer' }).send(data);
  const patch = (id: string, data: object, bearer = token) => request(app.getHttpServer())
    .patch(`/commerce/sales/quotations/${id}/validity`).auth(bearer, { type: 'bearer' }).send(data);
  const list = () => request(app.getHttpServer()).get('/commerce/sales/quotations').auth(token, { type: 'bearer' });
  const create = (validUntil?: unknown) => post('/commerce/sales/quotations', {
    quotationNumber: `V-${++sequence}`, customerId, validUntil,
    lines: [{ productId, quantity: 2 }],
  });
  const expire = (id: string) => db.query('UPDATE sales_quotations SET valid_until=$2::date WHERE id=$1', [id, yesterday]);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init(); db = app.get(DatabaseService);
    for (const other of [false, true]) {
      const email = `validity-${other}-${suffix}@example.test`;
      await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
        companyCode: `VAL-${other}-${suffix}`, companyName: 'Validity fixture',
        fullName: 'Validity Admin', email, password: 'ValidityTest123!',
      }).expect(201);
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'ValidityTest123!' }).expect(201);
      if (other) otherToken = login.body.access_token;
      else { token = login.body.access_token; companyId = login.body.user.companyId; }
    }
    customerId = (await post('/masters/customers', { code: 'VAL', name: 'Validity customer' }).expect(201)).body.id;
    productId = (await post('/masters/products', { sku: 'VAL', name: 'Validity product', unitPrice: 12.3456 }).expect(201)).body.id;
    const dates = await db.query<{ today: string; yesterday: string; future: string }>(
      `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS today,
      ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date-1)::text AS yesterday,
      ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+30)::text AS future`,
    );
    ({ today, yesterday, future } = dates.rows[0]);
  });
  afterAll(async () => { await app.close(); });

  it('rejects malformed or past dates without creating quotations', async () => {
    for (const date of ['2026-02-30', '0000-01-01', '', '2026-1-01', 123, yesterday]) {
      await create(date).expect(400);
    }
    expect((await list().expect(200)).body).toHaveLength(0);
  });

  it('preserves unlimited legacy behavior and accepts the full expiration day UTC', async () => {
    for (const date of [undefined, null, today]) {
      const quote = await create(date).expect(201);
      const row = (await list().expect(200)).body.find((item: { id: string }) => item.id === quote.body.id);
      expect(row.valid_until).toBe(date ?? null);
      expect(row.is_expired).toBe(false);
      await post(`/commerce/sales/quotations/${row.id}/confirm`, { orderNumber: `SO-${sequence}` }).expect(201);
    }
  });

  it('blocks expired confirmation atomically without order, stock or financial side effects', async () => {
    const quote = await create(today).expect(201); await expire(quote.body.id);
    const row = (await list().expect(200)).body.find((item: { id: string }) => item.id === quote.body.id);
    expect(row.is_expired).toBe(true);
    await post(`/commerce/sales/quotations/${row.id}/confirm`, { orderNumber: 'EXPIRED' }).expect(409);
    const orders = await db.query('SELECT id FROM sales_orders WHERE quotation_id=$1', [row.id]);
    expect(orders.rows).toHaveLength(0);
    const unchanged = await db.query('SELECT status, revision FROM sales_quotations WHERE id=$1', [row.id]);
    expect(unchanged.rows[0]).toEqual({ status: 'draft', revision: 0 });
  });

  it('renews under revision lock, audits previous date and keeps exact original line values', async () => {
    const quote = await create(today).expect(201); await expire(quote.body.id);
    const payload = { validUntil: future, expectedRevision: 0, reason: 'Reviewed existing prices and offer conditions' };
    const responses = await Promise.all([patch(quote.body.id, payload), patch(quote.body.id, payload)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const row = (await list().expect(200)).body.find((item: { id: string }) => item.id === quote.body.id);
    expect(row).toMatchObject({ valid_until: future, revision: 1, is_expired: false });
    const audit = await db.query<{ payload: { before: { valid_until: string } } }>(
      `SELECT payload FROM audit_log WHERE company_id=$1 AND event_name='commerce.sales.quotation.validity' AND entity_id=$2`,
      [companyId, row.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].payload.before.valid_until).toBe(yesterday);
    const order = await post(`/commerce/sales/quotations/${row.id}/confirm`, { orderNumber: 'RENEWED' }).expect(201);
    const lines = await db.query('SELECT quantity::text,unit_price::text,line_total::text FROM sales_order_lines WHERE order_id=$1', [order.body.orderId]);
    expect(lines.rows[0]).toMatchObject({ quantity: '2.0000', unit_price: '12.3456', line_total: '24.6912' });
    await patch(row.id, { ...payload, expectedRevision: 2, validUntil: null }).expect(409);
  });

  it('revises the company default with audit, rejects invalid input and preserves tenant and historical offers', async () => {
    const getProfile = (bearer = token) => request(app.getHttpServer())
      .get('/companies/current').auth(bearer, { type: 'bearer' });
    const before = (await getProfile().expect(200)).body;
    const otherBefore = (await getProfile(otherToken).expect(200)).body;
    const existing = (await create().expect(201)).body;
    const data = { name: before.name, taxId: before.tax_id, expectedRevision: before.profile_revision,
      quotationValidityDays: 30, reason: 'Reviewed default validity for future offers' };
    const update = (extra: object) => request(app.getHttpServer()).patch('/companies/current')
      .auth(token, { type: 'bearer' }).send({ ...data, ...extra });
    for (const quotationValidityDays of [-1, 0.1, 3651, '30', null, true]) {
      await update({ quotationValidityDays }).expect(400);
    }
    const results = await Promise.all([update({}), update({})]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await getProfile().expect(200)).body).toMatchObject({
      quotation_validity_days: 30, profile_revision: before.profile_revision + 1,
    });
    expect((await getProfile(otherToken).expect(200)).body).toEqual(otherBefore);
    expect((await create().expect(201)).body.validUntil).toBe(future);
    expect((await create(null).expect(201)).body.validUntil).toBeNull();
    expect((await create(today).expect(201)).body.validUntil).toBe(today);
    const historical = (await list().expect(200)).body.find((row: { id: string }) => row.id === existing.id);
    expect(historical).toMatchObject({ valid_until: null, revision: 0 });
    const audit = await db.query(`SELECT payload FROM audit_log
      WHERE company_id=$1 AND event_name='company.profile.update'`, [companyId]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].payload).toMatchObject({
      before: { quotation_validity_days: 0 }, after: { quotation_validity_days: 30 }, reason: data.reason,
    });
    await update({ expectedRevision: before.profile_revision + 1, quotationValidityDays: undefined,
      name: 'Renamed without changing validity' }).expect(200);
    expect((await getProfile().expect(200)).body.quotation_validity_days).toBe(30);
    await update({ expectedRevision: before.profile_revision + 2, quotationValidityDays: 3650 }).expect(200);
    const limit = await db.query<{ date: string }>(
      `SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+3650)::text AS date`);
    expect((await create().expect(201)).body.validUntil).toBe(limit.rows[0].date);
    await update({ expectedRevision: before.profile_revision + 3, quotationValidityDays: 0 }).expect(200);
    expect((await create().expect(201)).body.validUntil).toBeNull();
  });

  it('uses the committed company policy when creation waits for a concurrent profile update', async () => {
    const client = await db.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      await client.query('BEGIN');
      await client.query('UPDATE companies SET quotation_validity_days=30 WHERE id=$1', [companyId]);
      pending = create().then(response => response);
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const activity = await db.query<{ blocked: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM pg_stat_activity
           WHERE datname=current_database() AND wait_event_type='Lock'
             AND query LIKE '%default_valid_until%') AS blocked`);
        if (activity.rows[0].blocked) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await client.query('COMMIT');
      const result = await pending;
      expect(result.status).toBe(201);
      expect(result.body.validUntil).toBe(future);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      if (pending) await pending;
      await db.query('UPDATE companies SET quotation_validity_days=0 WHERE id=$1', [companyId]);
    }
  });

  it('allows explicit removal with a reason, but rejects stale revisions and foreign tenants', async () => {
    const quote = await create(today).expect(201);
    const payload = { validUntil: null, expectedRevision: 0, reason: 'Authorized unlimited offer after commercial review' };
    await patch(quote.body.id, payload, otherToken).expect(404);
    await patch(quote.body.id, { ...payload, validUntil: 'invalid' }).expect(400);
    await patch(quote.body.id, { ...payload, reason: 'short' }).expect(400);
    await patch(quote.body.id, { ...payload, expectedRevision: -1 }).expect(400);
    await patch(quote.body.id, payload).expect(200);
    await patch(quote.body.id, { ...payload, validUntil: future }).expect(409);
    const row = (await list().expect(200)).body.find((item: { id: string }) => item.id === quote.body.id);
    expect(row).toMatchObject({ valid_until: null, revision: 1, is_expired: false });
    const user = await db.query<{ id: string }>('SELECT id FROM users WHERE company_id=$1', [companyId]);
    await db.query('DELETE FROM user_roles WHERE user_id=$1', [user.rows[0].id]);
    await patch(row.id, { ...payload, expectedRevision: 1, validUntil: future }).expect(403);
    await request(app.getHttpServer()).patch('/companies/current').auth(token, { type: 'bearer' }).send({
      name: 'Not authorized', taxId: null, expectedRevision: 0, quotationValidityDays: 30,
      reason: 'Trying to change company default without admin',
    }).expect(403);
  });
});
