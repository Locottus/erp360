import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';
import { AiProviderService } from '../src/assistant/ai-provider.service';
import { ASSISTANT_SCREENS, chatInput, type Message } from '../src/assistant/assistant-inputs';
import { ProviderFailure, type Completion, type ProviderCode } from '../src/assistant/ai-providers';

describe('Assistant tenant services and monthly quotas', () => {
  let app: INestApplication, db: DatabaseService;
  let token: string, buyerToken: string, otherToken: string;
  let companyId: string, ownerId: string, buyerId: string, otherUserId: string;
  let productId: string, diagnosticRequestId: string, salesOrderId: string;
  const privateMarker = 'PRIVATE_FIXTURE_NAME_NOT_FOR_PROVIDER';
  const companyIds: string[] = [];
  const suffix = randomBytes(6).toString('hex'), code = `ai-${suffix}`;
  const secret = randomBytes(24).toString('hex');
  const previousBootstrap = process.env.BOOTSTRAP_ENABLED;
  const previousKey = process.env.ASSISTANT_CREDENTIAL_KEY;
  const complete = jest.fn<Promise<Completion>, [ProviderCode, string, string, Message[], number]>();
  const post = (url: string, body: object, bearer = token) => request(app.getHttpServer()).post(url).auth(bearer, { type: 'bearer' }).send(body);
  const get = (url: string, bearer = token) => request(app.getHttpServer()).get(url).auth(bearer, { type: 'bearer' });
  const message = (provider: ProviderCode = 'deepseek') => ({
    requestId: randomUUID(), provider, consent: true, question: 'Explica una validación de inventario.',
    context: { screen: '/inventory', incident: null },
  });
  const reply = { text: 'Respuesta sintética sin consulta externa.', promptTokens: 100, completionTokens: 20, truncated: false };

  beforeAll(async () => {
    process.env.BOOTSTRAP_ENABLED = 'true';
    process.env.ASSISTANT_CREDENTIAL_KEY = randomBytes(32).toString('base64');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiProviderService).useValue({ complete }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); db = app.get(DatabaseService);
    const password = randomBytes(24).toString('hex');
    for (const index of [0, 1]) {
      const email = `assistant-${index}-${suffix}@example.test`;
      const created = await post('/auth/bootstrap-admin', { companyCode: `AI-${index}-${suffix}`, companyName: 'AI test fixture',
        email, password, fullName: 'Synthetic administrator' }).expect(201);
      companyIds.push(String(created.body.companyId));
      const login = await post('/auth/login', { email, password }).expect(201);
      if (index === 0) { token = login.body.access_token; companyId = login.body.user.companyId; ownerId = login.body.user.id; }
      else { otherToken = login.body.access_token; otherUserId = login.body.user.id; }
    }
    await db.query(`INSERT INTO platform_saas_operators(user_id,role,created_by,updated_by) VALUES($1,'owner',$1,$1)`, [ownerId]);
    const email = `assistant-buyer-${suffix}@example.test`;
    const invited = await post('/auth/users', { email, fullName: 'Synthetic buyer', roles: ['employee'] }).expect(201);
    buyerId = String(invited.body.id);
    await post('/auth/reset-password', { token: invited.body.activationToken, password }).expect(201);
    buyerToken = (await post('/auth/login', { email, password }).expect(201)).body.access_token;
    await db.query(`INSERT INTO platform_saas_operators(user_id,role,created_by,updated_by) VALUES($1,'billing',$2,$2)`, [buyerId, ownerId]);
    await post('/assistant/admin/service-types', { code, name: 'Synthetic AI service', monthlyTokens: 10000, maxOutputTokens: 128,
      enabled: true, expectedRevision: 0, reason: 'Synthetic fixture for quota tests' }).expect(201);
    for (const user of [ownerId, buyerId]) await post(`/assistant/admin/companies/${companyId}/users/${user}/service`,
      { serviceCode: code, enabled: true, expectedRevision: 0, reason: 'Synthetic fixture service assignment' }).expect(201);
    await post(`/assistant/admin/companies/${companyId}/provider`, { provider: 'deepseek', model: 'deepseek-flash', apiKey: secret,
      enabled: true, expectedRevision: 0, reason: 'Synthetic provider configuration' }).expect(201);
    productId = (await post('/masters/products', { sku: `DIAG-${suffix}`, name: privateMarker, unitPrice: 1 }).expect(201)).body.id;
    const customerId = (await post('/masters/customers', { code: `DIAG-${suffix}`, name: privateMarker }).expect(201)).body.id;
    const supplierId = (await post('/masters/suppliers', { code: `DIAG-${suffix}`, name: privateMarker }).expect(201)).body.id;
    diagnosticRequestId = (await post('/commerce/purchases/requests', { requestNumber: `DIAG-${suffix}`, supplierId,
      lines: [{ productId, quantity: 2, unitCost: 1 }] }).expect(201)).body.id;
    await db.query('UPDATE companies SET require_independent_purchase_approver=TRUE WHERE id=$1', [companyId]);
    salesOrderId = (await db.query<{ id: string }>(`INSERT INTO sales_orders(company_id,customer_id,order_number,status,created_by)
      VALUES($1,$2,$3,'confirmed',$4) RETURNING id`, [companyId, customerId, `DIAG-${suffix}`, ownerId])).rows[0].id;
    await db.query(`INSERT INTO sales_order_lines(order_id,product_id,quantity,unit_price,line_total)
      VALUES($1,$2,2,1,2),($1,$2,2,1,2)`, [salesOrderId, productId]);
    await db.query(`INSERT INTO inventory_stock_balances(company_id,product_id,location_code,on_hand,reserved)
      VALUES($1,$2,'MAIN',3,0)`, [companyId, productId]);
  });
  beforeEach(async () => {
    complete.mockReset().mockResolvedValue(reply);
    await db.query('DELETE FROM assistant_requests WHERE company_id=$1', [companyId]);
    await db.query('DELETE FROM assistant_monthly_usage WHERE company_id=$1', [companyId]);
    await db.query('DELETE FROM assistant_token_purchases WHERE company_id=$1', [companyId]);
    await db.query('UPDATE assistant_service_types SET monthly_tokens=10000,enabled=TRUE WHERE code=$1', [code]);
    await db.query('UPDATE assistant_user_services SET enabled=TRUE WHERE user_id=ANY($1::uuid[])', [[ownerId, buyerId]]);
    await db.query('UPDATE assistant_provider_configs SET enabled=FALSE WHERE company_id=$1', [companyId]);
    await db.query(`UPDATE assistant_provider_configs SET enabled=TRUE WHERE company_id=$1 AND provider='deepseek'`, [companyId]);
  });
  afterAll(async () => {
    try {
      if (db && companyIds.length) {
        await db.query('DELETE FROM inventory_reservations WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM inventory_stock_balances WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM sales_orders WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM purchase_requests WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM products WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM customers WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM suppliers WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM assistant_requests WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM assistant_monthly_usage WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM assistant_token_purchases WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM assistant_provider_configs WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM assistant_user_services WHERE user_id IN (SELECT id FROM users WHERE company_id=ANY($1::uuid[]))', [companyIds]);
        await db.query('DELETE FROM audit_log WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM user_password_resets WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM platform_saas_operators WHERE user_id IN (SELECT id FROM users WHERE company_id=ANY($1::uuid[]))', [companyIds]);
        await db.query('DELETE FROM users WHERE company_id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM companies WHERE id=ANY($1::uuid[])', [companyIds]);
        await db.query('DELETE FROM assistant_service_types WHERE code=$1', [code]);
      }
    } finally {
      if (app) await app.close();
      if (previousBootstrap === undefined) delete process.env.BOOTSTRAP_ENABLED; else process.env.BOOTSTRAP_ENABLED = previousBootstrap;
      if (previousKey === undefined) delete process.env.ASSISTANT_CREDENTIAL_KEY; else process.env.ASSISTANT_CREDENTIAL_KEY = previousKey;
    }
  });

  it('requires membership and service, isolates tenants and never returns or audits API keys', async () => {
    await request(app.getHttpServer()).get('/assistant/usage').expect(401);
    await get(`/assistant/admin/companies/${companyId}/provider`, buyerToken).expect(403);
    await get(`/assistant/admin/companies/${companyId}`, otherToken).expect(403);
    await post(`/assistant/admin/companies/${companyId}/users/${otherUserId}/service`,
      { serviceCode: code, enabled: true, expectedRevision: 0, reason: 'Attempted cross-company assignment' }).expect(404);
    await post('/assistant/chat', message(), otherToken).expect(403);
    await db.query('UPDATE assistant_user_services SET enabled=FALSE WHERE user_id=$1', [buyerId]);
    await post('/assistant/chat', message(), buyerToken).expect(403);
    expect(complete).not.toHaveBeenCalled();
    const config = (await get(`/assistant/admin/companies/${companyId}/provider`).expect(200)).body;
    expect(config.keyConfigured).toBe(true);
    expect(JSON.stringify(config)).not.toContain(secret);
    const stored = await db.query<{ encrypted_api_key: string }>('SELECT encrypted_api_key FROM assistant_provider_configs WHERE company_id=$1', [companyId]);
    expect(stored.rows[0].encrypted_api_key).not.toContain(secret);
    const audit = await db.query<{ payload: unknown }>('SELECT payload FROM audit_log WHERE company_id=$1 AND event_name=\'assistant.provider.update\'', [companyId]);
    expect(JSON.stringify(audit.rows)).not.toContain(secret);
    expect(JSON.stringify(audit.rows)).not.toContain(stored.rows[0].encrypted_api_key);
  });
  it('meters exact prompt/output usage and idempotency; client identity and title never reach the provider', async () => {
    const input = { ...message(), companyId: companyIds[1], userId: otherUserId,
      context: { screen: '/inventory', incident: null, title: secret, companyId: companyIds[1] } };
    const response = (await post('/assistant/chat', input).expect(201)).body;
    expect(response.tokens).toEqual({ prompt: 100, completion: 20, total: 120 });
    expect(response.usage).toMatchObject({ usedTokens: 120, reservedTokens: 0, limitTokens: 20000 });
    expect(JSON.stringify(complete.mock.calls[0][3])).not.toContain(secret);
    expect(JSON.stringify(complete.mock.calls[0][3])).not.toContain(companyIds[1]);
    await post('/assistant/chat', input).expect(409);
    expect(complete).toHaveBeenCalledTimes(1);
    expect((await get('/assistant/usage', otherToken).expect(200)).body.usedTokens).toBe(0);
    const row = (await db.query<{ provider: string; prompt_tokens: number; completion_tokens: number; status: string }>(
      'SELECT provider,prompt_tokens,completion_tokens,status FROM assistant_requests WHERE id=$1', [input.requestId])).rows[0];
    expect(row).toEqual({ provider: 'deepseek', prompt_tokens: 100, completion_tokens: 20, status: 'succeeded' });
  });
  it('switches among three adapters without resetting usage or reusing another provider credential', async () => {
    await post('/assistant/chat', message()).expect(201);
    for (const [provider, model] of [['openai', 'gpt-5.4-mini'], ['claude', 'claude-haiku-5-5'], ['deepseek', 'deepseek-flash']] as const) {
      const prior = (await get(`/assistant/admin/companies/${companyId}/provider?provider=${provider}`).expect(200)).body;
      await post(`/assistant/admin/companies/${companyId}/provider`, { provider, model, enabled: true,
        expectedRevision: prior.revision, reason: 'Switch adapter without resetting usage',
        ...(prior.keyConfigured ? {} : { apiKey: randomBytes(24).toString('hex') }) }).expect(201);
      const usage = (await get('/assistant/usage').expect(200)).body;
      expect(usage.provider).toBe(provider);
      expect(usage.usedTokens).toBeGreaterThanOrEqual(120);
      await post('/assistant/chat', message(provider)).expect(201);
      expect(complete.mock.calls.at(-1)?.[0]).toBe(provider);
      const active = await db.query('SELECT provider FROM assistant_provider_configs WHERE company_id=$1 AND enabled', [companyId]);
      expect(active.rows).toEqual([{ provider }]);
    }
    expect((await get('/assistant/usage').expect(200)).body.usedTokens).toBe(480);
    await post('/assistant/chat', message('claude')).expect(409);
    await post(`/assistant/admin/companies/${companyId}/provider`, { provider: 'openai', model: 'claude-haiku-5-5',
      enabled: true, expectedRevision: 0, reason: 'Reject mismatched provider and model' }).expect(400);
  });
  it('reserves atomically across two users, blocks at quota and resumes only after confirmed extra service', async () => {
    const input = message();
    let reservation = Buffer.byteLength(JSON.stringify(chatInput(input).messages), 'utf8') + 1024 + 128;
    if (reservation % 2) { input.question += '.'; reservation++; }
    await db.query('UPDATE assistant_service_types SET monthly_tokens=$2 WHERE code=$1', [code, reservation / 2]);
    let resolve!: (value: Completion) => void;
    let started!: () => void;
    const called = new Promise<void>(done => { started = done; });
    complete.mockImplementationOnce(() => { started(); return new Promise<Completion>(done => { resolve = done; }); });
    const pending = post('/assistant/chat', input).then(result => result);
    await called;
    await post('/assistant/chat', message(), buyerToken).expect(429);
    await post('/assistant/chat', message()).expect(409);
    expect(complete).toHaveBeenCalledTimes(1);
    expect((await get('/assistant/usage').expect(200)).body.reservedTokens).toBe(reservation);
    resolve(reply); expect((await pending).status).toBe(201);
    await db.query('UPDATE assistant_monthly_usage SET prompt_tokens=$2,completion_tokens=0 WHERE company_id=$1', [companyId, reservation]);
    await post('/assistant/chat', message()).expect(429);
    const purchase = { tokens: 10000, reference: 'synthetic-purchase', paidAmount: '1.00',
      paymentConfirmed: false, reason: 'Synthetic confirmed additional service' };
    await post(`/assistant/admin/companies/${companyId}/token-purchases`, purchase).expect(400);
    await post(`/assistant/admin/companies/${companyId}/token-purchases`, { ...purchase, paymentConfirmed: true }, buyerToken).expect(201);
    await post(`/assistant/admin/companies/${companyId}/token-purchases`, { ...purchase, paymentConfirmed: true }, buyerToken).expect(409);
    await post('/assistant/chat', message()).expect(201);
    expect((await get('/assistant/usage').expect(200)).body.extraTokens).toBe(10000);
  });
  it('retains uncertain reservations and reconciles exactly once; provider 401 never logs out the ERP session', async () => {
    const input = message();
    complete.mockRejectedValueOnce(new ProviderFailure('deepseek_transport_or_parse_error'));
    await post('/assistant/chat', input).expect(503);
    const held = (await get('/assistant/usage').expect(200)).body.reservedTokens;
    expect(held).toBeGreaterThan(0);
    const reconciliation = { promptTokens: 70, completionTokens: 10, providerUsageConfirmed: true,
      reason: 'Synthetic provider usage independently verified' };
    const url = `/assistant/admin/companies/${companyId}/requests/${input.requestId}/reconcile`;
    await post(url, reconciliation, buyerToken).expect(403);
    await post(url, reconciliation).expect(201);
    await post(url, reconciliation).expect(409);
    expect((await get('/assistant/usage').expect(200)).body).toMatchObject({ usedTokens: 80, reservedTokens: 0 });
    complete.mockRejectedValueOnce(new ProviderFailure('deepseek_http_401', true));
    await post('/assistant/chat', message()).expect(503);
    expect((await get('/assistant/usage').expect(200)).body).toMatchObject({ usedTokens: 80, reservedTokens: 0 });
  });
  it('starts a new UTC month without old consumption or purchases, and counts empty-response usage', async () => {
    const previous = (await db.query<{ month: string }>(`SELECT (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '1 month')::date::text AS month`)).rows[0].month;
    await db.query('INSERT INTO assistant_monthly_usage(company_id,month_start,prompt_tokens,reserved_tokens) VALUES($1,$2::date,999999,999999)', [companyId, previous]);
    await db.query(`INSERT INTO assistant_token_purchases(company_id,month_start,tokens,reference,paid_amount,reason,created_by)
      VALUES($1,$2::date,999999,'old-month',1,'Synthetic old month purchase',$3)`, [companyId, previous, ownerId]);
    expect((await get('/assistant/usage').expect(200)).body).toMatchObject({ usedTokens: 0, reservedTokens: 0, extraTokens: 0 });
    complete.mockResolvedValueOnce({ ...reply, text: '', truncated: true });
    await post('/assistant/chat', message()).expect(503);
    expect((await get('/assistant/usage').expect(200)).body).toMatchObject({ usedTokens: 120, reservedTokens: 0 });
    const row = await db.query<{ prompt_tokens: string; reserved_tokens: string }>(
      'SELECT prompt_tokens::text,reserved_tokens::text FROM assistant_monthly_usage WHERE company_id=$1 AND month_start=$2::date', [companyId, previous]);
    expect(row.rows[0]).toEqual({ prompt_tokens: '999999', reserved_tokens: '999999' });
  });
  it('covers every ERP screen and Operations area with bounded read-only reports, without requiring AI service', async () => {
    const targets = [
      ...ASSISTANT_SCREENS.map(screen => ({ kind: 'screen', screen })),
      ...['sales', 'purchases', 'masters', 'people', 'accounting', 'fiscal', 'portal', 'overview'].map(area => ({ kind: 'screen', screen: '/operations', area })),
    ];
    for (const target of targets) {
      const response = await post('/assistant/diagnostics', target);
      expect({ target, status: response.status, error: response.body.message }).toMatchObject({ status: 201 });
      expect(response.body).toMatchObject({ target, readOnly: true });
      expect(response.body.evidence.length).toBeGreaterThan(0);
      expect(response.body.findings.length).toBeGreaterThan(0);
    }
    await post('/assistant/diagnostics', { kind: 'screen', screen: '/inventory' }, otherToken).expect(201);
    expect(complete).not.toHaveBeenCalled();
    const balance = (await db.query('SELECT on_hand::text,reserved::text FROM inventory_stock_balances WHERE company_id=$1', [companyId])).rows[0];
    expect(balance).toEqual({ on_hand: '3.0000', reserved: '0.0000' });
  });
  it('investigates independent approval and grouped stock demand, enforcing roles and tenant isolation', async () => {
    const purchase = (await post('/assistant/diagnostics', { kind: 'purchase-request', id: diagnosticRequestId }).expect(201)).body;
    expect(purchase.findings.map((item: { code: string }) => item.code)).toContain('independent_approval');
    const sale = (await post('/assistant/diagnostics', { kind: 'sales-order', id: salesOrderId, locationCode: 'MAIN' }).expect(201)).body;
    expect(sale.findings.map((item: { code: string }) => item.code)).toEqual(expect.arrayContaining(['insufficient_stock', 'reservation_missing']));
    await post('/assistant/diagnostics', { kind: 'stock', id: productId, locationCode: 'OTHER' }).expect(201);
    const spaced = (await post('/assistant/diagnostics', { kind: 'stock', id: productId, locationCode: ' bodega central ' }).expect(201)).body;
    expect(spaced.target.locationCode).toBe('BODEGA CENTRAL');
    await post('/assistant/diagnostics', { kind: 'stock', id: productId, locationCode: 'MAIN' }, otherToken).expect(404);
    await post('/assistant/diagnostics', { kind: 'purchase-request', id: diagnosticRequestId }, buyerToken).expect(403);
    await post('/assistant/diagnostics', { kind: 'screen', screen: '/people' }, buyerToken).expect(403);
    await post('/assistant/diagnostics', { kind: 'screen', screen: '/platform/billing' }, otherToken).expect(403);
    await post('/assistant/diagnostics', { kind: 'sql', id: productId }).expect(400);
    await post('/assistant/diagnostics', { kind: 'screen', screen: '/users?companyId=forged' }).expect(400);
    const hidden = (await post('/assistant/diagnostics', { kind: 'screen', screen: '/catalogs' }, buyerToken).expect(201)).body;
    expect(hidden.evidence[1].facts.customers).toBeNull();
    expect(hidden.evidence[1].facts.suppliers).toBeNull();
    expect(JSON.stringify(purchase)).not.toContain(privateMarker);
    expect(complete).not.toHaveBeenCalled();
  });
  it('detects unbacked reservations and location mismatch without changing balances or reservations', async () => {
    const reservation = (await db.query<{ id: string }>(`INSERT INTO inventory_reservations(company_id,sales_order_id,product_id,location_code,quantity,status)
      VALUES($1,$2,$3,'MAIN',1,'reserved') RETURNING id`, [companyId, salesOrderId, productId])).rows[0].id;
    try {
      const stock = (await post('/assistant/diagnostics', { kind: 'stock', id: productId, locationCode: 'MAIN' }).expect(201)).body;
      expect(stock.findings.map((item: { code: string }) => item.code)).toContain('stock_inconsistency');
      const sale = (await post('/assistant/diagnostics', { kind: 'sales-order', id: salesOrderId, locationCode: 'OTHER' }).expect(201)).body;
      expect(sale.findings.map((item: { code: string }) => item.code)).toEqual(expect.arrayContaining(['reservation_stock', 'reservation_location']));
      expect((await db.query('SELECT status FROM inventory_reservations WHERE id=$1', [reservation])).rows[0].status).toBe('reserved');
      expect((await db.query('SELECT reserved::text FROM inventory_stock_balances WHERE company_id=$1', [companyId])).rows[0].reserved).toBe('0.0000');
    } finally { await db.query('DELETE FROM inventory_reservations WHERE id=$1 AND company_id=$2', [reservation, companyId]); }
  });
  it('refreshes consented evidence on the server, omits record identities and meters the enriched prompt', async () => {
    const diagnostic = { consent: true, target: { kind: 'purchase-request', id: diagnosticRequestId },
      evidence: { forged: privateMarker } };
    await post('/assistant/chat', { ...message(), diagnostic: { ...diagnostic, consent: false } }).expect(400);
    await post('/assistant/chat', { ...message(), diagnostic }, buyerToken).expect(403);
    expect(complete).not.toHaveBeenCalled();
    const response = (await post('/assistant/chat', { ...message(), diagnostic }).expect(201)).body;
    expect(response.diagnostic.findings.map((item: { code: string }) => item.code)).toContain('independent_approval');
    const sent = JSON.stringify(complete.mock.calls[0][3]);
    expect(sent).toContain('approvalBlockedByPolicy');
    for (const value of [privateMarker, productId, diagnosticRequestId, ownerId, companyId, secret]) expect(sent).not.toContain(value);
    expect(response.usage.usedTokens).toBe(120);
    const stored = await db.query<{ payload: object }>("SELECT payload FROM audit_log WHERE company_id=$1 AND event_name='assistant.diagnostic.read'", [companyId]);
    expect(stored.rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(stored.rows)).not.toContain(privateMarker);
  });
});
