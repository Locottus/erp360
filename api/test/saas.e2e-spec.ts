import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('SaaS billing and operator console (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let operatorToken: string;
  let viewerToken: string;
  let tenantToken: string;
  let otherTenantToken: string;
  let operatorId: string;
  let viewerId: string;
  let tenantCompanyId: string;
  let otherCompanyId: string;
  let accountId: string;
  let subscriptionId: string;
  let invoiceId: string;
  let secondInvoiceId: string;
  let paymentId: string;
  let followupId: string;
  let today: string;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const password = 'Test-SaaS-Only-Password-12345!';
  const email = (value: string) => `saas-${value}-${suffix}@example.test`;
  const day = (date: string, offset: number) => {
    const result = new Date(`${date}T00:00:00.000Z`);
    result.setUTCDate(result.getUTCDate() + offset);
    return result.toISOString().slice(0, 10);
  };
  const units = (amount: string) => {
    const [whole, fraction = ''] = amount.split('.');
    return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
  };
  const authorized = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function bootstrap(label: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/bootstrap-admin')
      .send({
        companyCode: `SAAS${label}${suffix}`.slice(0, 32),
        companyName: `SaaS e2e ${label} ${suffix}`,
        email: email(label),
        password,
        fullName: `SaaS ${label} ${suffix}`,
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email(label), password })
      .expect(201);
    return {
      token: login.body.access_token as string,
      userId: login.body.user.id as string,
      companyId: login.body.user.companyId as string,
      bootstrapId: response.body.user?.id as string | undefined,
    };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DatabaseService);
    const [operator, tenant, otherTenant] = await Promise.all([
      bootstrap('operator'),
      bootstrap('tenant'),
      bootstrap('other'),
    ]);
    operatorToken = operator.token;
    operatorId = operator.userId;
    tenantToken = tenant.token;
    tenantCompanyId = tenant.companyId;
    otherTenantToken = otherTenant.token;
    otherCompanyId = otherTenant.companyId;
    viewerId = otherTenant.userId;
    await db.query(
      `INSERT INTO platform_saas_operators(user_id, role, enabled, created_by, updated_by)
       VALUES ($1, 'owner', TRUE, $1, $1)`,
      [operatorId],
    );
    const date = await db.query<{ today: string }>(
      `SELECT (NOW() AT TIME ZONE 'UTC')::date::text AS today`,
    );
    today = date.rows[0].today;
  }, 60000);

  afterAll(async () => {
    try {
      if (db) {
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const users = await client.query<{ id: string; company_id: string }>(
            `SELECT id, company_id FROM users
             WHERE email LIKE 'saas-operator-%@example.test'
                OR email LIKE 'saas-tenant-%@example.test'
                OR email LIKE 'saas-other-%@example.test'`,
          );
          const userIds = users.rows.map((row) => row.id);
          const companyIds = users.rows.map((row) => row.company_id);
          const accounts = await client.query<{ id: string }>(
            `SELECT id FROM saas_accounts WHERE created_by = ANY($1::uuid[])`,
            [userIds],
          );
          const accountIds = accounts.rows.map((row) => row.id);
          const immutableTriggers = [
            ['saas_invoice_lines', 'saas_invoice_lines_immutable'],
            [
              'saas_subscription_revisions',
              'saas_subscription_revisions_immutable',
            ],
            [
              'saas_subscription_revision_modules',
              'saas_subscription_revision_modules_immutable',
            ],
            ['saas_payments', 'saas_payments_immutable'],
            ['saas_payment_allocations', 'saas_payment_allocations_immutable'],
            ['saas_payment_reversals', 'saas_payment_reversals_immutable'],
            ['saas_invoice_credits', 'saas_invoice_credits_immutable'],
            ['saas_audit_events', 'saas_audit_events_immutable'],
            ['saas_collection_runs', 'saas_collection_runs_immutable'],
          ];
          for (const [table, trigger] of immutableTriggers) {
            await client.query(
              `ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`,
            );
          }
          await client.query(
            `DELETE FROM saas_collection_runs WHERE created_by = ANY($1::uuid[])`,
            [userIds],
          );
          await client.query(
            `DELETE FROM saas_followups
             WHERE account_id = ANY($1::uuid[]) OR owner_id = ANY($2::uuid[])
                OR created_by = ANY($2::uuid[]) OR updated_by = ANY($2::uuid[])`,
            [accountIds, userIds],
          );
          await client.query(
            `DELETE FROM saas_payment_reversals WHERE payment_id IN (
               SELECT p.id FROM saas_payments p
               JOIN saas_invoices i ON i.id = p.invoice_id
               JOIN saas_subscriptions s ON s.id = i.subscription_id
               WHERE s.account_id = ANY($1::uuid[])
             )`,
            [accountIds],
          );
          await client.query(
            `DELETE FROM saas_payment_allocations WHERE payment_id IN (
               SELECT p.id FROM saas_payments p
               JOIN saas_invoices i ON i.id = p.invoice_id
               JOIN saas_subscriptions s ON s.id = i.subscription_id
               WHERE s.account_id = ANY($1::uuid[])
             )`,
            [accountIds],
          );
          await client.query(
            `DELETE FROM saas_invoice_credits WHERE invoice_id IN (
               SELECT i.id FROM saas_invoices i
               JOIN saas_subscriptions s ON s.id = i.subscription_id
               WHERE s.account_id = ANY($1::uuid[])
             )`,
            [accountIds],
          );
          await client.query(
            `DELETE FROM saas_payments WHERE invoice_id IN (
               SELECT i.id FROM saas_invoices i
               JOIN saas_subscriptions s ON s.id = i.subscription_id
               WHERE s.account_id = ANY($1::uuid[])
             )`,
            [accountIds],
          );
          await client.query(
            `DELETE FROM saas_invoice_lines WHERE invoice_id IN (
               SELECT i.id FROM saas_invoices i
               JOIN saas_subscriptions s ON s.id = i.subscription_id
               WHERE s.account_id = ANY($1::uuid[])
             )`,
            [accountIds],
          );
          await client.query(
            `DELETE FROM saas_invoices WHERE subscription_id IN (
               SELECT id FROM saas_subscriptions WHERE account_id = ANY($1::uuid[])
             )`,
            [accountIds],
          );
          await client.query(
            `DELETE FROM saas_subscription_revision_modules WHERE revision_id IN (
               SELECT r.id FROM saas_subscription_revisions r
               JOIN saas_subscriptions s ON s.id = r.subscription_id
               WHERE s.account_id = ANY($1::uuid[])
             )`,
            [accountIds],
          );
          await client.query(
            `DELETE FROM saas_subscription_revisions WHERE subscription_id IN (
               SELECT id FROM saas_subscriptions WHERE account_id = ANY($1::uuid[])
             )`,
            [accountIds],
          );
          await client.query(
            `DELETE FROM saas_audit_events
             WHERE account_id = ANY($1::uuid[]) OR company_id = ANY($2::uuid[])
                OR actor_user_id = ANY($3::uuid[])`,
            [accountIds, companyIds, userIds],
          );
          await client.query(
            `DELETE FROM saas_subscriptions WHERE account_id = ANY($1::uuid[])
               OR company_id = ANY($2::uuid[]) OR created_by = ANY($3::uuid[])`,
            [accountIds, companyIds, userIds],
          );
          await client.query(
            `DELETE FROM saas_accounts WHERE id = ANY($1::uuid[])`,
            [accountIds],
          );
          await client.query(
            `DELETE FROM platform_saas_operators WHERE user_id = ANY($1::uuid[])`,
            [userIds],
          );
          await client.query(
            `DELETE FROM audit_log WHERE actor_user_id = ANY($1::uuid[]) OR company_id = ANY($2::uuid[])`,
            [userIds, companyIds],
          );
          await client.query(
            `DELETE FROM user_password_resets WHERE user_id = ANY($1::uuid[]) OR created_by = ANY($1::uuid[])`,
            [userIds],
          );
          await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
            userIds,
          ]);
          await client.query(
            `DELETE FROM companies WHERE id = ANY($1::uuid[])`,
            [companyIds],
          );
          for (const [table, trigger] of immutableTriggers) {
            await client.query(
              `ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`,
            );
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('does not treat tenant admin JWT roles as platform membership', async () => {
    await request(app.getHttpServer())
      .get('/saas/operator')
      .set(authorized(operatorToken))
      .expect(200)
      .expect(({ body }) => {
        expect(body.role).toBe('owner');
        expect(body.integrations).toEqual({
          payments: 'not_configured',
          email: 'not_configured',
          enforcement: 'informational',
        });
      });
    await request(app.getHttpServer())
      .get('/saas/operator')
      .set(authorized(otherTenantToken))
      .expect(200)
      .expect(({ body }) => expect(body.role).toBeNull());
    await request(app.getHttpServer())
      .get('/saas/accounts')
      .set(authorized(otherTenantToken))
      .expect(403);
    await request(app.getHttpServer()).get('/saas/accounts').expect(401);
  });

  it('rejects invalid date, amount, module, and currency inputs explicitly', async () => {
    await request(app.getHttpServer())
      .post('/saas/accounts')
      .set(authorized(operatorToken))
      .send({ name: 'Invalid', billingEmail: 'not-an-email' })
      .expect(400);
    const account = await request(app.getHttpServer())
      .post('/saas/accounts')
      .set(authorized(operatorToken))
      .send({ name: `SaaS Account ${suffix}`, billingEmail: email('billing') })
      .expect(201);
    accountId = account.body.id;
    const invalid = await request(app.getHttpServer())
      .post('/saas/subscriptions')
      .set(authorized(operatorToken))
      .send({
        accountId,
        companyId: tenantCompanyId,
        currency: 'EUR',
        modules: [{ code: 'base', price: '1.0000' }],
        startsOn: today,
        renewsOn: day(today, 30),
      })
      .expect(400);
    expect(invalid.body.message).toContain('USD');
    await request(app.getHttpServer())
      .post('/saas/subscriptions')
      .set(authorized(operatorToken))
      .send({
        accountId,
        companyId: tenantCompanyId,
        currency: 'USD',
        modules: [{ code: 'base', price: 1 }],
        startsOn: today,
        renewsOn: day(today, 30),
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/saas/subscriptions')
      .set(authorized(operatorToken))
      .send({
        accountId,
        companyId: tenantCompanyId,
        currency: 'USD',
        modules: [
          { code: 'base', price: '1.0000' },
          { code: 'base', price: '2.0000' },
        ],
        startsOn: today,
        renewsOn: day(today, 30),
      })
      .expect(400);
    const invalidDate = await request(app.getHttpServer())
      .post('/saas/subscriptions')
      .set(authorized(operatorToken))
      .send({
        accountId,
        companyId: tenantCompanyId,
        currency: 'USD',
        modules: [{ code: 'base', price: '1.0000' }],
        startsOn: '2026-02-30',
        renewsOn: day(today, 30),
      })
      .expect(400);
    expect(invalidDate.body.message).toContain('YYYY-MM-DD');
  });

  it('creates a platform subscription with exact four-place price snapshots', async () => {
    const created = await request(app.getHttpServer())
      .post('/saas/subscriptions')
      .set(authorized(operatorToken))
      .send({
        accountId,
        companyId: tenantCompanyId,
        currency: 'USD',
        modules: [
          { code: 'base', price: '10.1234' },
          { code: 'sales', price: '1.2222' },
        ],
        startsOn: today,
        renewsOn: day(today, 30),
      })
      .expect(201);
    subscriptionId = created.body.id;
    expect(created.body.revision).toBe(1);
    expect(created.body.modules).toEqual([
      { code: 'base', price: '10.1234' },
      { code: 'sales', price: '1.2222' },
    ]);
    await request(app.getHttpServer())
      .post('/saas/subscriptions')
      .set(authorized(operatorToken))
      .send({
        accountId,
        companyId: tenantCompanyId,
        currency: 'USD',
        modules: [{ code: 'base', price: '1.0000' }],
        startsOn: today,
        renewsOn: day(today, 30),
      })
      .expect(409);
  });

  it('scopes tenant reads to the authenticated company and shows informational balance/users', async () => {
    const own = await request(app.getHttpServer())
      .get('/saas/subscription')
      .set(authorized(tenantToken))
      .expect(200);
    expect(own.body.subscription.company_id).toBe(tenantCompanyId);
    expect(own.body.subscription.access).toBe('informational');
    expect(own.body.company.id).toBe(tenantCompanyId);
    expect(own.body.users.total_count).toBeGreaterThan(0);
    expect(own.body.balance.currency).toBe('USD');
    const noOwnSubscription = await request(app.getHttpServer())
      .get('/saas/subscription')
      .set(authorized(otherTenantToken))
      .expect(200);
    expect(noOwnSubscription.body.subscription).toBeNull();
    expect(noOwnSubscription.body.company.id).toBe(otherCompanyId);
    const platformAdminDoesNotInheritTenantView = await request(
      app.getHttpServer(),
    )
      .get('/saas/subscription')
      .set(authorized(operatorToken))
      .expect(200);
    expect(platformAdminDoesNotInheritTenantView.body.subscription).toBeNull();
  });

  it('preserves revision history and snapshots invoice lines from the accepted contract revision', async () => {
    const issued = await request(app.getHttpServer())
      .post(`/saas/subscriptions/${subscriptionId}/invoices`)
      .set(authorized(operatorToken))
      .send({
        reference: `INV-${suffix}`,
        periodStart: day(today, -30),
        periodEnd: day(today, -1),
        dueOn: day(today, -7),
      })
      .expect(201);
    invoiceId = issued.body.id;
    expect(issued.body.subtotal).toBe('11.3456');
    expect(issued.body.document_kind).toBe('manual_saas');
    expect(issued.body.legal_invoice).toBe(false);
    expect(issued.body.tax_status).toBe('not_assessed');
    expect(
      issued.body.lines.map((line: { unit_price: string }) => line.unit_price),
    ).toEqual(['10.1234', '1.2222']);
    const replay = await request(app.getHttpServer())
      .post(`/saas/subscriptions/${subscriptionId}/invoices`)
      .set(authorized(operatorToken))
      .send({
        reference: `INV-${suffix}`,
        periodStart: day(today, -30),
        periodEnd: day(today, -1),
        dueOn: day(today, -7),
      })
      .expect(201);
    expect(replay.body.id).toBe(invoiceId);
    const changed = await request(app.getHttpServer())
      .patch(`/saas/subscriptions/${subscriptionId}`)
      .set(authorized(operatorToken))
      .send({
        expectedRevision: 1,
        modules: [{ code: 'base', price: '12.3456' }],
        renewsOn: day(today, 45),
        reason: 'Approved contractual price revision',
      })
      .expect(200);
    expect(changed.body.revision).toBe(2);
    expect(changed.body.revisions).toHaveLength(2);
    expect(changed.body.modules).toEqual([{ code: 'base', price: '12.3456' }]);
    await request(app.getHttpServer())
      .patch(`/saas/subscriptions/${subscriptionId}`)
      .set(authorized(operatorToken))
      .send({
        expectedRevision: 1,
        modules: [{ code: 'base', price: '14.0000' }],
        renewsOn: day(today, 50),
        reason: 'Stale contractual price revision',
      })
      .expect(409);
    const invoice = await request(app.getHttpServer())
      .get(`/saas/accounts/${accountId}`)
      .set(authorized(operatorToken))
      .expect(200);
    expect(
      invoice.body.invoices.find((row: { id: string }) => row.id === invoiceId)
        .lines[0].unit_price,
    ).toBe('10.1234');
  });

  it('records partial exact payments and makes reference replay idempotent', async () => {
    const payment = await request(app.getHttpServer())
      .post(`/saas/invoices/${invoiceId}/payments`)
      .set(authorized(operatorToken))
      .send({
        reference: `PAY-${suffix}`,
        amount: '5.0001',
        paidOn: day(today, -1),
        method: 'transfer',
        reason: 'Bank transfer received and reconciled',
      })
      .expect(201);
    paymentId = payment.body.id;
    expect(payment.body.amount).toBe('5.0001');
    expect(payment.body.allocation_amount).toBe('5.0001');
    const replay = await request(app.getHttpServer())
      .post(`/saas/invoices/${invoiceId}/payments`)
      .set(authorized(operatorToken))
      .send({
        reference: `PAY-${suffix}`,
        amount: '5.0001',
        paidOn: day(today, -1),
        method: 'transfer',
        reason: 'Bank transfer received and reconciled',
      })
      .expect(201);
    expect(replay.body.id).toBe(paymentId);
  });

  it('rejects overpayment and serializes concurrent allocation attempts', async () => {
    await request(app.getHttpServer())
      .post(`/saas/invoices/${invoiceId}/payments`)
      .set(authorized(operatorToken))
      .send({
        reference: `PAY-OVER-${suffix}`,
        amount: '6.3456',
        paidOn: today,
        method: 'other',
        reason: 'Overpayment must not be accepted',
      })
      .expect(409);
    const concurrent = await Promise.all([
      request(app.getHttpServer())
        .post(`/saas/invoices/${invoiceId}/payments`)
        .set(authorized(operatorToken))
        .send({
          reference: `PAY-CONCURRENT-A-${suffix}`,
          amount: '4.0000',
          paidOn: today,
          method: 'cash',
          reason: 'Concurrent payment request A',
        }),
      request(app.getHttpServer())
        .post(`/saas/invoices/${invoiceId}/payments`)
        .set(authorized(operatorToken))
        .send({
          reference: `PAY-CONCURRENT-B-${suffix}`,
          amount: '4.0000',
          paidOn: today,
          method: 'cash',
          reason: 'Concurrent payment request B',
        }),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
  });

  it('rejects credits beyond the open balance and preserves valid credit ledger entries', async () => {
    await request(app.getHttpServer())
      .post(`/saas/invoices/${invoiceId}/credits`)
      .set(authorized(operatorToken))
      .send({
        reference: `CREDIT-OVER-${suffix}`,
        amount: '2.3456',
        reason: 'Credit must not exceed the invoice balance',
        issuedOn: today,
      })
      .expect(409);
    const credit = await request(app.getHttpServer())
      .post(`/saas/invoices/${invoiceId}/credits`)
      .set(authorized(operatorToken))
      .send({
        reference: `CREDIT-${suffix}`,
        amount: '1.0001',
        reason: 'Approved commercial credit adjustment',
        issuedOn: today,
      })
      .expect(201);
    expect(credit.body.amount).toBe('1.0001');
    const replay = await request(app.getHttpServer())
      .post(`/saas/invoices/${invoiceId}/credits`)
      .set(authorized(operatorToken))
      .send({
        reference: `CREDIT-${suffix}`,
        amount: '1.0001',
        reason: 'Approved commercial credit adjustment',
        issuedOn: today,
      })
      .expect(201);
    expect(replay.body.id).toBe(credit.body.id);
  });

  it('reverses a payment exactly once and restores the allocated balance', async () => {
    const reversal = await request(app.getHttpServer())
      .post(`/saas/payments/${paymentId}/reverse`)
      .set(authorized(operatorToken))
      .send({
        reference: `REV-${suffix}`,
        reason: 'Original payment was entered against the wrong account',
      })
      .expect(201);
    expect(reversal.body.amount).toBe('5.0001');
    const replay = await request(app.getHttpServer())
      .post(`/saas/payments/${paymentId}/reverse`)
      .set(authorized(operatorToken))
      .send({
        reference: `REV-${suffix}`,
        reason: 'Original payment was entered against the wrong account',
      })
      .expect(201);
    expect(replay.body.id).toBe(reversal.body.id);
    await request(app.getHttpServer())
      .post(`/saas/payments/${paymentId}/reverse`)
      .set(authorized(operatorToken))
      .send({
        reference: `REV-SECOND-${suffix}`,
        reason: 'A second reversal is not allowed',
      })
      .expect(409);
  });

  it('uses cutoff dates for aging and excludes collections recorded after the cutoff', async () => {
    const baseline = await request(app.getHttpServer())
      .get(`/saas/portfolio?asOf=${today}`)
      .set(authorized(operatorToken))
      .expect(200);
    const invoice = await request(app.getHttpServer())
      .post(`/saas/subscriptions/${subscriptionId}/invoices`)
      .set(authorized(operatorToken))
      .send({
        reference: `INV-AGING-${suffix}`,
        periodStart: day(today, -60),
        periodEnd: day(today, -35),
        dueOn: day(today, -31),
      })
      .expect(201);
    secondInvoiceId = invoice.body.id;
    await request(app.getHttpServer())
      .post(`/saas/invoices/${secondInvoiceId}/payments`)
      .set(authorized(operatorToken))
      .send({
        reference: `PAY-FUTURE-${suffix}`,
        amount: '1.0000',
        paidOn: today,
        method: 'other',
        reason: 'Payment date follows the report cutoff',
      })
      .expect(201);
    await db.query(
      `UPDATE saas_invoices SET issued_on = $2::date WHERE id = $1`,
      [secondInvoiceId, day(today, -2)],
    );
    const past = await request(app.getHttpServer())
      .get(`/saas/portfolio?asOf=${day(today, -1)}`)
      .set(authorized(operatorToken))
      .expect(200);
    expect(
      past.body.clients.find((row: { id: string }) => row.id === accountId)
        .open_balance,
    ).toBe('12.3456');
    const current = await request(app.getHttpServer())
      .get(`/saas/portfolio?asOf=${today}`)
      .set(authorized(operatorToken))
      .expect(200);
    const client = current.body.clients.find(
      (row: { id: string }) => row.id === accountId,
    );
    expect(client.open_balance).toBe('17.6911');
    expect(client.overdue_balance).toBe('17.6911');
    expect(
      units(current.body.totals[0].bucket_31_60) -
        units(baseline.body.totals[0].bucket_31_60),
    ).toBe(units('11.3456'));
    expect(current.body.totals[0].bucket_1_30).toBe(
      baseline.body.totals[0].bucket_1_30,
    );
    await request(app.getHttpServer())
      .get('/saas/portfolio?asOf=2026-02-30')
      .set(authorized(operatorToken))
      .expect(400);
  });

  it('uses reversal occurrence time, not paidOn, for historical balances', async () => {
    await db.query(
      `UPDATE saas_invoices SET issued_on = $2::date WHERE id = $1`,
      [invoiceId, day(today, -2)],
    );
    const cutoff = day(today, -1);
    const report = await request(app.getHttpServer())
      .get(`/saas/portfolio?asOf=${cutoff}`)
      .set(authorized(operatorToken))
      .expect(200);
    const client = report.body.clients.find(
      (row: { id: string }) => row.id === accountId,
    );
    expect(client.open_balance).toBe('18.6911');
  });

  it('enforces optimistic follow-up revisions and preserves owner assignment', async () => {
    const created = await request(app.getHttpServer())
      .post(`/saas/accounts/${accountId}/followups`)
      .set(authorized(operatorToken))
      .send({
        kind: 'promise',
        note: 'Customer promised a payment date',
        dueOn: day(today, 1),
        promisedOn: day(today, 2),
        ownerId: operatorId,
      })
      .expect(201);
    followupId = created.body.id;
    expect(created.body.owner_id).toBe(operatorId);
    const edits = await Promise.all([
      request(app.getHttpServer())
        .patch(`/saas/followups/${followupId}`)
        .set(authorized(operatorToken))
        .send({
          expectedRevision: 1,
          status: 'done',
          note: 'Customer confirmed payment is complete',
        }),
      request(app.getHttpServer())
        .patch(`/saas/followups/${followupId}`)
        .set(authorized(operatorToken))
        .send({
          expectedRevision: 1,
          status: 'paused',
          note: 'Pause pending another review',
        }),
    ]);
    expect(edits.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it('prepares due collection tasks only, is idempotent, and sends no messages', async () => {
    const dueSoon = await request(app.getHttpServer())
      .post(`/saas/subscriptions/${subscriptionId}/invoices`)
      .set(authorized(operatorToken))
      .send({
        reference: `INV-D3-${suffix}`,
        periodStart: today,
        periodEnd: today,
        dueOn: day(today, 3),
      })
      .expect(201);
    const dueToday = await request(app.getHttpServer())
      .post(`/saas/subscriptions/${subscriptionId}/invoices`)
      .set(authorized(operatorToken))
      .send({
        reference: `INV-D0-${suffix}`,
        periodStart: today,
        periodEnd: today,
        dueOn: today,
      })
      .expect(201);
    const paid = await request(app.getHttpServer())
      .post(`/saas/subscriptions/${subscriptionId}/invoices`)
      .set(authorized(operatorToken))
      .send({
        reference: `INV-PAID-${suffix}`,
        periodStart: today,
        periodEnd: today,
        dueOn: today,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/saas/invoices/${paid.body.id}/payments`)
      .set(authorized(operatorToken))
      .send({
        reference: `PAY-PAID-${suffix}`,
        amount: '12.3456',
        paidOn: today,
        method: 'transfer',
        reason: 'Entire invoice amount received',
      })
      .expect(201);
    const queue = await request(app.getHttpServer())
      .get(`/saas/followups/due?asOf=${today}`)
      .set(authorized(operatorToken))
      .expect(200);
    expect(
      queue.body.items.some(
        (row: { invoice_id: string; stage: string }) =>
          row.invoice_id === dueSoon.body.id && row.stage === 'D-3',
      ),
    ).toBe(true);
    expect(
      queue.body.items.some(
        (row: { invoice_id: string }) => row.invoice_id === paid.body.id,
      ),
    ).toBe(false);
    const run = await request(app.getHttpServer())
      .post('/saas/collection-runs')
      .set(authorized(operatorToken))
      .send({ asOf: today })
      .expect(201);
    expect(run.body.created).toBeGreaterThan(0);
    expect(run.body.already_run).toBe(false);
    expect(run.body.skipped_paid).toBeGreaterThanOrEqual(1);
    const detailBeforePause = await request(app.getHttpServer())
      .get(`/saas/accounts/${accountId}`)
      .set(authorized(operatorToken))
      .expect(200);
    const dueTodayFollowup = detailBeforePause.body.followups.find(
      (row: { invoice_id: string }) => row.invoice_id === dueToday.body.id,
    );
    expect(dueTodayFollowup).toBeDefined();
    await request(app.getHttpServer())
      .patch(`/saas/followups/${dueTodayFollowup.id}`)
      .set(authorized(operatorToken))
      .send({
        expectedRevision: 1,
        status: 'paused',
        note: 'Pause this internal collection task for review',
      })
      .expect(200);
    const replay = await request(app.getHttpServer())
      .post('/saas/collection-runs')
      .set(authorized(operatorToken))
      .send({ asOf: today })
      .expect(201);
    expect(replay.body.already_run).toBe(true);
    expect(replay.body.created).toBe(0);
    expect(replay.body.skipped_paused).toBeGreaterThanOrEqual(1);
    const prepared = await request(app.getHttpServer())
      .get(`/saas/accounts/${accountId}`)
      .set(authorized(operatorToken))
      .expect(200);
    expect(
      prepared.body.followups.some(
        (row: { invoice_id: string; note: string }) =>
          row.invoice_id === dueSoon.body.id &&
          row.note.includes('No message was sent'),
      ),
    ).toBe(true);
  });

  it('does not prepare a historical reminder for an invoice that is now settled', async () => {
    const invoice = await request(app.getHttpServer())
      .post(`/saas/subscriptions/${subscriptionId}/invoices`)
      .set(authorized(operatorToken))
      .send({
        reference: `INV-SETTLED-HISTORIC-${suffix}`,
        periodStart: day(today, -10),
        periodEnd: day(today, -5),
        dueOn: day(today, -4),
      })
      .expect(201);
    await db.query('UPDATE saas_invoices SET issued_on = $2::date WHERE id = $1', [
      invoice.body.id, day(today, -5),
    ]);
    await request(app.getHttpServer())
      .post(`/saas/invoices/${invoice.body.id}/payments`)
      .set(authorized(operatorToken))
      .send({
        reference: `PAY-SETTLED-HISTORIC-${suffix}`,
        amount: invoice.body.total,
        paidOn: today,
        method: 'transfer',
        reason: 'Entire historical invoice received today',
      })
      .expect(201);
    const cutoff = day(today, -1);
    const queue = await request(app.getHttpServer())
      .get(`/saas/followups/due?asOf=${cutoff}`)
      .set(authorized(operatorToken))
      .expect(200);
    expect(queue.body.items.some((row: { invoice_id: string }) =>
      row.invoice_id === invoice.body.id)).toBe(true);
    await request(app.getHttpServer())
      .post('/saas/collection-runs')
      .set(authorized(operatorToken))
      .send({ asOf: cutoff })
      .expect(201);
    const prepared = await db.query(
      'SELECT id FROM saas_followups WHERE invoice_id = $1',
      [invoice.body.id],
    );
    expect(prepared.rows).toHaveLength(0);
  });

  it('keeps viewers read-only and returns snake-case account detail/audit rows', async () => {
    await db.query(
      `INSERT INTO platform_saas_operators(user_id, role, enabled, created_by, updated_by)
       VALUES ($1, 'viewer', TRUE, $1, $1)`,
      [viewerId],
    );
    viewerToken = otherTenantToken;
    await request(app.getHttpServer())
      .get('/saas/accounts')
      .set(authorized(viewerToken))
      .expect(200);
    const operators = await request(app.getHttpServer())
      .get('/saas/operators')
      .set(authorized(operatorToken))
      .expect(200);
    expect(
      operators.body.some(
        (row: { user_id: string; role: string }) =>
          row.user_id === operatorId && row.role === 'owner',
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .post('/saas/accounts')
      .set(authorized(viewerToken))
      .send({ name: 'Read only', billingEmail: email('readonly') })
      .expect(403);
    const detail = await request(app.getHttpServer())
      .get(`/saas/accounts/${accountId}`)
      .set(authorized(operatorToken))
      .expect(200);
    expect(Array.isArray(detail.body.subscriptions)).toBe(true);
    expect(Array.isArray(detail.body.invoices)).toBe(true);
    expect(Array.isArray(detail.body.payments)).toBe(true);
    expect(Array.isArray(detail.body.followups)).toBe(true);
    expect(
      detail.body.audit.every(
        (row: Record<string, unknown>) =>
          'actor_user_id' in row && 'occurred_at' in row && 'action' in row,
      ),
    ).toBe(true);
    await db.query(`UPDATE saas_accounts SET name = $2 WHERE id = $1`, [
      accountId,
      '=SUM(1,1)',
    ]);
    const csv = await request(app.getHttpServer())
      .get(`/saas/portfolio.csv?asOf=${today}`)
      .set(authorized(operatorToken))
      .expect(200)
      .expect('Content-Type', /text\/csv/);
    expect(csv.text).toContain(`"'=SUM(1,1)"`);
  });
});
