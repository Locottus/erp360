import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('Petty cash and fixed assets', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let token: string;
  let companyId: string;
  const suffix = Date.now().toString();
  const accounts: Record<string, string> = {};
  const api = () => request(app.getHttpServer());
  const post = (path: string, body: object, bearer = token) => api().post(path).auth(bearer, { type: 'bearer' }).send(body);
  const get = (path: string, bearer = token) => api().get(path).auth(bearer, { type: 'bearer' });

  const createAccount = async (key: string, accountType: string) => {
    const code = `${key}-${suffix}`;
    const response = await post('/accounting/accounts', { code, name: `Account ${key}`, accountType }).expect(201);
    accounts[key] = response.body.id;
  };

  const entryTotals = async (entryId: string) => (await db.query<{ debit: string; credit: string }>(
    `SELECT COALESCE(SUM(debit),0)::text AS debit, COALESCE(SUM(credit),0)::text AS credit
     FROM accounting_journal_lines WHERE journal_entry_id=$1`, [entryId])).rows[0];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DatabaseService);
    const email = `cash-${suffix}@example.test`;
    await api().post('/auth/bootstrap-admin').send({
      companyCode: `CASH-${suffix}`, companyName: 'Petty cash test', email,
      fullName: 'Cash Administrator', password: 'CashAssets123!',
    }).expect(201);
    token = (await api().post('/auth/login').send({ email, password: 'CashAssets123!' }).expect(201)).body.access_token;
    companyId = (await db.query<{ company_id: string }>('SELECT company_id FROM users WHERE email=$1', [email])).rows[0].company_id;
    await createAccount('CASH', 'asset');
    await createAccount('BANK', 'asset');
    await createAccount('EXP', 'expense');
    await createAccount('ASSET', 'asset');
    await createAccount('ACCUM', 'asset');
    await createAccount('DEPR', 'expense');
    await createAccount('GAIN', 'revenue');
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs the petty cash lifecycle with independent approval and balanced entries', async () => {
    const fund = (await post('/petty-cash/funds', {
      code: `PC-${suffix}`, name: 'Fondo principal', imprestAmount: '500.0000', cashAccountId: accounts.CASH,
    }).expect(201)).body;
    const openInput = { idempotencyKey: `open-${suffix}`, expectedRevision: fund.revision, sourceAccountId: accounts.BANK };
    const opened = await post(`/petty-cash/funds/${fund.id}/open`, openInput).expect(201);
    const replay = await post(`/petty-cash/funds/${fund.id}/open`, openInput).expect(201);
    expect(replay.body.replayed).toBe(true);
    expect(await entryTotals(opened.body.journalEntryId)).toEqual({ debit: '500.0000', credit: '500.0000' });
    await post(`/petty-cash/funds/${fund.id}/open`, { ...openInput, idempotencyKey: `open2-${suffix}` }).expect(409);

    const voucherInput = {
      idempotencyKey: `voucher-${suffix}`, amount: '120.0000', payee: 'Proveedor', description: 'Compra de insumos',
      receiptReference: 'REC-1', expenseAccountId: accounts.EXP,
    };
    const voucher = (await post(`/petty-cash/funds/${fund.id}/vouchers`, voucherInput).expect(201)).body;
    expect((await post(`/petty-cash/funds/${fund.id}/vouchers`, voucherInput).expect(201)).body.id).toBe(voucher.id);
    await post(`/petty-cash/funds/${fund.id}/vouchers`, {
      ...voucherInput, idempotencyKey: `big-${suffix}`, amount: '400.0000',
    }).expect(400);

    await post(`/petty-cash/vouchers/${voucher.id}/approve`, {}).expect(403);

    const cancelled = (await post(`/petty-cash/funds/${fund.id}/vouchers`, {
      ...voucherInput, idempotencyKey: `cancel-${suffix}`, amount: '10.0000',
    }).expect(201)).body;
    await post(`/petty-cash/vouchers/${cancelled.id}/cancel`, { reason: 'Cancelado por el solicitante' }).expect(201);

    await db.query('UPDATE petty_cash_funds SET self_approval_limit=1000 WHERE id=$1', [fund.id]);
    const approved = await post(`/petty-cash/vouchers/${voucher.id}/approve`, {}).expect(201);
    expect(await entryTotals(approved.body.journalEntryId)).toEqual({ debit: '120.0000', credit: '120.0000' });
    await post(`/petty-cash/vouchers/${voucher.id}/approve`, {}).expect(400);

    const detail = (await get(`/petty-cash/funds/${fund.id}`).expect(200)).body;
    expect(detail.balance).toBe('380.0000');

    const replenishInput = { idempotencyKey: `repl-${suffix}`, sourceAccountId: accounts.BANK };
    const replenished = await post(`/petty-cash/funds/${fund.id}/replenish`, replenishInput).expect(201);
    expect(await entryTotals(replenished.body.journalEntryId)).toEqual({ debit: '120.0000', credit: '120.0000' });
    expect((await post(`/petty-cash/funds/${fund.id}/replenish`, replenishInput).expect(201)).body.replayed).toBe(true);

    const count = await post(`/petty-cash/funds/${fund.id}/counts`, {
      countedAmount: '495.0000', notes: 'Arqueo con diferencia',
    }).expect(201);
    expect(count.body.difference ?? count.body.differenceAmount).toBe('-5.0000');

    const current = (await get(`/petty-cash/funds/${fund.id}`).expect(200)).body;
    const closeInput = {
      idempotencyKey: `close-${suffix}`, expectedRevision: current.revision,
      destinationAccountId: accounts.BANK, reason: 'Cierre del fondo en la validacion',
    };
    await post(`/petty-cash/funds/${fund.id}/close`, closeInput).expect(201);
    const closed = (await get(`/petty-cash/funds/${fund.id}`).expect(200)).body;
    expect(closed).toMatchObject({ status: 'closed', balance: '0.0000' });
  });

  it('depreciates, posts and disposes a fixed asset with sequential controls', async () => {
    const category = (await post('/fixed-assets/categories', {
      code: `CAT-${suffix}`, name: 'Equipo', usefulLifeMonths: 12,
      assetAccountId: accounts.ASSET, accumulatedAccountId: accounts.ACCUM, expenseAccountId: accounts.DEPR,
    }).expect(201)).body;
    const assetInput = {
      idempotencyKey: `asset-${suffix}`, assetCode: `AF-${suffix}`, name: 'Servidor', categoryId: category.id,
      acquisitionDate: '2026-01-01', cost: '1200.0000', salvageValue: '0.0000',
    };
    const asset = (await post('/fixed-assets/assets', assetInput).expect(201)).body;
    expect((await post('/fixed-assets/assets', assetInput).expect(201)).body.id).toBe(asset.id);
    await post('/fixed-assets/depreciation/runs', { year: 2026, month: 1 }).expect(201);
    expect((await get('/fixed-assets/depreciation?year=2026&month=1').expect(200)).body).toHaveLength(0);

    const activated = await post(`/fixed-assets/assets/${asset.id}/activate`, {
      expectedRevision: asset.revision, offsetAccountId: accounts.BANK,
    }).expect(201);
    expect(await entryTotals(activated.body.journalEntryId)).toEqual({ debit: '1200.0000', credit: '1200.0000' });

    const run = await post('/fixed-assets/depreciation/runs', { year: 2026, month: 1 }).expect(201);
    expect(run.body.created).toHaveLength(1);
    const gap = await post('/fixed-assets/depreciation/runs', { year: 2026, month: 3 }).expect(201);
    expect(gap.body.created).toHaveLength(0);
    expect(gap.body.skipped).toHaveLength(1);
    const feb = await post('/fixed-assets/depreciation/runs', { year: 2026, month: 2 }).expect(201);
    expect(feb.body.created).toHaveLength(1);

    const lines = (await get('/fixed-assets/depreciation').expect(200)).body as Array<{ id: string; periodMonth?: number; period_month?: number; status: string }>;
    expect(lines.every((line) => line.status === 'draft')).toBe(true);
    const posted = await post('/fixed-assets/depreciation/post-period', { year: 2026, month: 1 }).expect(201);
    expect(posted.body.posted).toHaveLength(1);
    await post('/fixed-assets/depreciation/post-period', { year: 2026, month: 1 }).expect(400);
    await post('/fixed-assets/depreciation/post-period', { year: 2099, month: 1 }).expect(400);

    const febLine = feb.body.created[0].lineId;
    const beforeVoid = (await get(`/fixed-assets/assets/${asset.id}`).expect(200)).body;
    await post(`/fixed-assets/assets/${asset.id}/dispose`, {
      expectedRevision: beforeVoid.revision, reason: 'Baja anticipada de prueba', disposalDate: '2026-03-01',
    }).expect(400);
    await post(`/fixed-assets/depreciation/lines/${febLine}/void`, { reason: 'Anulacion de ensayo' }).expect(201);

    const janLine = posted.body.posted[0].id;
    await post(`/fixed-assets/depreciation/lines/${febLine}/reverse`, { reason: 'Linea en borrador no reversible' }).expect(400);
    const reversed = await post(`/fixed-assets/depreciation/lines/${janLine}/reverse`, { reason: 'Correccion de periodo ya contabilizado' }).expect(201);
    expect(await entryTotals(reversed.body.reversalJournalEntryId)).toEqual({ debit: '100.0000', credit: '100.0000' });
    await post(`/fixed-assets/depreciation/lines/${janLine}/reverse`, { reason: 'Segunda reversion no valida' }).expect(400);
    expect((await get(`/fixed-assets/assets/${asset.id}`).expect(200)).body.accumulated_depreciation).toBe('0.0000');
    await post('/fixed-assets/depreciation/runs', { year: 2026, month: 1 }).expect(201);
    expect((await post('/fixed-assets/depreciation/post-period', { year: 2026, month: 1 }).expect(201)).body.posted).toHaveLength(1);

    const current = (await get(`/fixed-assets/assets/${asset.id}`).expect(200)).body;
    const disposed = await post(`/fixed-assets/assets/${asset.id}/dispose`, {
      expectedRevision: current.revision, reason: 'Venta del equipo en validacion', disposalDate: '2026-03-01',
      proceeds: '1150.0000', proceedsAccountId: accounts.BANK, gainLossAccountId: accounts.GAIN,
    }).expect(201);
    expect(await entryTotals(disposed.body.journalEntryId)).toEqual({ debit: '1250.0000', credit: '1250.0000' });
    await post(`/fixed-assets/assets/${asset.id}/dispose`, {
      expectedRevision: current.revision + 1, reason: 'Segunda baja no valida', disposalDate: '2026-03-01',
    }).expect(400);
  });

  it('gives accountants operational access but keeps approval, disposal and reversal for admins', async () => {
    const email = `acct-${suffix}@example.test`;
    const invitation = await post('/auth/users', { email, fullName: 'Accountant', roles: ['accountant'] }).expect(201);
    await api().post('/auth/reset-password').send({ token: invitation.body.activationToken, password: 'CashAssets123!' }).expect(201);
    const accountant = (await api().post('/auth/login').send({ email, password: 'CashAssets123!' }).expect(201)).body.access_token;
    await get('/petty-cash/funds', accountant).expect(200);
    await get('/fixed-assets/assets', accountant).expect(200);
    await post('/petty-cash/funds', { code: 'X2' }, accountant).expect(403);
    await post('/petty-cash/vouchers/00000000-0000-0000-0000-000000000000/approve', {}, accountant).expect(403);
    await post('/fixed-assets/assets/00000000-0000-0000-0000-000000000000/dispose', {}, accountant).expect(403);
    await post('/fixed-assets/depreciation/lines/00000000-0000-0000-0000-000000000000/reverse', {}, accountant).expect(403);
    const category = await post('/fixed-assets/categories', {
      code: `ACAT-${suffix}`, name: 'Categoria contador', usefulLifeMonths: 12,
      assetAccountId: accounts.ASSET, accumulatedAccountId: accounts.ACCUM, expenseAccountId: accounts.DEPR,
    }, accountant).expect(201);
    expect(category.body.id).toBeDefined();
  });

  it('denies users without the new permissions and records audit events', async () => {
    const email = `reader-${suffix}@example.test`;
    const invitation = await post('/auth/users', { email, fullName: 'Reader', roles: ['employee'] }).expect(201);
    await api().post('/auth/reset-password').send({ token: invitation.body.activationToken, password: 'CashAssets123!' }).expect(201);
    const reader = (await api().post('/auth/login').send({ email, password: 'CashAssets123!' }).expect(201)).body.access_token;
    await get('/petty-cash/funds', reader).expect(403);
    await get('/fixed-assets/assets', reader).expect(403);
    await post('/petty-cash/funds', { code: 'X1' }, reader).expect(403);
    const audit = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_log WHERE company_id=$1 AND event_name LIKE 'petty_cash.%'`, [companyId]);
    expect(Number(audit.rows[0].count)).toBeGreaterThan(0);
  });
});
