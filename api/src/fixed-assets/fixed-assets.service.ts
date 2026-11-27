import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { assertAccounts, auditEvent, fromUnits, postJournalEntry, toUnits } from '../accounting/journal-posting';
import { DatabaseService } from '../common/database.service';
import { requiredDecimal } from '../common/decimal-input';
import { requiredDate } from '../common/iso-date';
import { changeReason, expectedRevision } from '../common/management-input';
import {
  boundedText, idempotencyKey, inTransaction, objectBody, UUID_PATTERN, uuidValue,
} from '../common/request-input';

type Actor = { sub: string; companyId: string };

type AssetRow = {
  id: string;
  asset_code: string;
  name: string;
  cost: string;
  salvage_value: string;
  useful_life_months: number;
  in_service_date: string;
  asset_account_id: string;
  accumulated_account_id: string;
  expense_account_id: string;
  accumulated_depreciation: string;
  status: 'draft' | 'active' | 'disposed';
  revision: number;
};

type LineRow = {
  id: string;
  asset_id: string;
  period_year: number;
  period_month: number;
  sequence_no: number;
  amount: string;
  status: string;
};

const ASSET_COLUMNS = `id, asset_code, name, cost::text, salvage_value::text, useful_life_months,
  to_char(in_service_date,'YYYY-MM-DD') AS in_service_date, asset_account_id, accumulated_account_id,
  expense_account_id, accumulated_depreciation::text, status, revision`;

function period(value: unknown, field: 'year' | 'month') {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number) ||
      (field === 'year' ? number < 2000 || number > 2200 : number < 1 || number > 12)) {
    throw new BadRequestException(`${field} is not a valid accounting period component.`);
  }
  return number;
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

@Injectable()
export class FixedAssetsService {
  constructor(private readonly db: DatabaseService) {}

  private transaction<T>(work: (client: PoolClient) => Promise<T>) {
    return inTransaction(this.db, work);
  }

  async listCategories(user: Actor) {
    const result = await this.db.query(
      `SELECT id, code, name, depreciation_method, useful_life_months, asset_account_id,
              accumulated_account_id, expense_account_id, is_active
       FROM fixed_asset_categories WHERE company_id=$1 ORDER BY code`,
      [user.companyId],
    );
    return result.rows;
  }

  async createCategory(user: Actor, input: unknown) {
    const data = objectBody(input);
    const code = boundedText(data.code, 'code', 2, 32).toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code)) throw new BadRequestException('code may only contain letters, digits, _ and -.');
    const name = boundedText(data.name, 'name', 3, 128);
    const life = data.usefulLifeMonths;
    if (typeof life !== 'number' || !Number.isInteger(life) || life < 1 || life > 1200) {
      throw new BadRequestException('usefulLifeMonths must be an integer between 1 and 1200.');
    }
    if (data.depreciationMethod !== undefined && data.depreciationMethod !== 'straight_line') {
      throw new BadRequestException('Only straight_line depreciation is supported.');
    }
    if (new Set([data.assetAccountId, data.accumulatedAccountId, data.expenseAccountId]).size !== 3) {
      throw new BadRequestException('Asset, accumulated depreciation and expense accounts must be different.');
    }
    return this.transaction(async (client) => {
      await assertAccounts(client, user.companyId, [
        { id: data.assetAccountId, field: 'assetAccountId', types: ['asset'] },
        { id: data.accumulatedAccountId, field: 'accumulatedAccountId', types: ['asset'] },
        { id: data.expenseAccountId, field: 'expenseAccountId', types: ['expense'] },
      ]);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO fixed_asset_categories
           (company_id, code, name, useful_life_months, asset_account_id, accumulated_account_id,
            expense_account_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (company_id, code) DO NOTHING RETURNING id`,
        [user.companyId, code, name, life, data.assetAccountId, data.accumulatedAccountId,
          data.expenseAccountId, user.sub],
      );
      if (!inserted.rows[0]) throw new ConflictException('A category with this code already exists.');
      await auditEvent(client, user, 'fixed_assets', 'fixed_assets.category.created', inserted.rows[0].id, {
        code, useful_life_months: life,
      });
      return { id: inserted.rows[0].id, code, name, usefulLifeMonths: life };
    });
  }

  async listAssets(user: Actor) {
    const result = await this.db.query(
      `SELECT a.id, a.asset_code, a.name, c.code AS category_code, a.status, a.cost::text, a.salvage_value::text,
              a.useful_life_months, to_char(a.in_service_date,'YYYY-MM-DD') AS in_service_date,
              a.accumulated_depreciation::text, (a.cost - a.accumulated_depreciation)::text AS book_value,
              a.revision
       FROM fixed_assets a JOIN fixed_asset_categories c ON c.id=a.category_id
       WHERE a.company_id=$1 ORDER BY a.asset_code`,
      [user.companyId],
    );
    return result.rows;
  }

  async getAsset(user: Actor, id: string) {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Fixed asset not found.');
    const asset = await this.db.query(
      `SELECT ${ASSET_COLUMNS}, acquisition_entry_id, disposal_entry_id, disposal_reason,
              disposal_proceeds::text, to_char(disposed_at,'YYYY-MM-DD') AS disposed_at
       FROM fixed_assets WHERE id=$1 AND company_id=$2`,
      [id, user.companyId],
    );
    if (!asset.rows[0]) throw new NotFoundException('Fixed asset not found.');
    const lines = await this.db.query(
      `SELECT id, period_year, period_month, sequence_no, amount::text, status, journal_entry_id, void_reason
       FROM fixed_asset_depreciation_lines WHERE asset_id=$1 ORDER BY sequence_no, created_at`,
      [id],
    );
    return { ...asset.rows[0], depreciation: lines.rows };
  }

  async createAsset(user: Actor, input: unknown) {
    const data = objectBody(input);
    const key = idempotencyKey(data.idempotencyKey);
    const code = boundedText(data.assetCode, 'assetCode', 2, 48).toUpperCase();
    if (!/^[A-Z0-9_.-]+$/.test(code)) throw new BadRequestException('assetCode may only contain letters, digits, ., _ and -.');
    const name = boundedText(data.name, 'name', 3, 160);
    const acquisitionDate = requiredDate(data.acquisitionDate, 'acquisitionDate');
    const inServiceDate = data.inServiceDate === undefined
      ? acquisitionDate : requiredDate(data.inServiceDate, 'inServiceDate');
    if (inServiceDate < acquisitionDate) throw new BadRequestException('inServiceDate cannot precede acquisitionDate.');
    const cost = requiredDecimal(data.cost, 'cost');
    const salvage = data.salvageValue === undefined ? '0.0000' : requiredDecimal(data.salvageValue, 'salvageValue', true);
    if (toUnits(salvage) >= toUnits(cost)) throw new BadRequestException('salvageValue must be lower than cost.');
    const categoryId = uuidValue(data.categoryId, 'categoryId');
    const lookup = async (client: Pick<DatabaseService, 'query'>) => {
      const found = await client.query<{ id: string; asset_code: string; cost: string; status: string }>(
        `SELECT id, asset_code, cost::text, status FROM fixed_assets WHERE company_id=$1 AND idempotency_key=$2`,
        [user.companyId, key],
      );
      const row = found.rows[0];
      if (!row) return null;
      if (row.asset_code !== code || toUnits(row.cost) !== toUnits(cost)) {
        throw new ConflictException('idempotencyKey was already used for a different asset.');
      }
      return { id: row.id, assetCode: row.asset_code, status: row.status, replayed: true };
    };
    try {
      return await this.transaction(async (client) => {
        const replay = await lookup(client);
        if (replay) return replay;
        const category = await client.query<{
          useful_life_months: number; asset_account_id: string; accumulated_account_id: string; expense_account_id: string;
        }>(
          `SELECT useful_life_months, asset_account_id, accumulated_account_id, expense_account_id
           FROM fixed_asset_categories WHERE id=$1 AND company_id=$2 AND is_active=TRUE`,
          [categoryId, user.companyId],
        );
        if (!category.rows[0]) throw new BadRequestException('categoryId must reference an active category.');
        let life = category.rows[0].useful_life_months;
        if (data.usefulLifeMonths !== undefined) {
          if (typeof data.usefulLifeMonths !== 'number' || !Number.isInteger(data.usefulLifeMonths) ||
              data.usefulLifeMonths < 1 || data.usefulLifeMonths > 1200) {
            throw new BadRequestException('usefulLifeMonths must be an integer between 1 and 1200.');
          }
          life = data.usefulLifeMonths;
        }
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO fixed_assets
             (company_id, asset_code, name, category_id, idempotency_key, acquisition_date, in_service_date, cost,
              salvage_value, useful_life_months, asset_account_id, accumulated_account_id, expense_account_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (company_id, asset_code) DO NOTHING RETURNING id`,
          [user.companyId, code, name, categoryId, key, acquisitionDate, inServiceDate, cost, salvage, life,
            category.rows[0].asset_account_id, category.rows[0].accumulated_account_id,
            category.rows[0].expense_account_id, user.sub],
        );
        if (!inserted.rows[0]) throw new ConflictException('An asset with this code already exists.');
        await auditEvent(client, user, 'fixed_assets', 'fixed_assets.asset.created', inserted.rows[0].id, {
          asset_code: code, cost, salvage_value: salvage, useful_life_months: life,
        });
        return { id: inserted.rows[0].id, assetCode: code, status: 'draft', revision: 0, replayed: false };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        const replay = await lookup(this.db);
        if (replay) return replay;
      }
      throw error;
    }
  }

  private async lockAsset(client: PoolClient, companyId: string, id: string) {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Fixed asset not found.');
    const result = await client.query<AssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM fixed_assets WHERE id=$1 AND company_id=$2 FOR UPDATE`,
      [id, companyId],
    );
    if (!result.rows[0]) throw new NotFoundException('Fixed asset not found.');
    return result.rows[0];
  }

  async activateAsset(user: Actor, id: string, input: unknown) {
    const data = objectBody(input);
    const revision = expectedRevision(data.expectedRevision);
    return this.transaction(async (client) => {
      const asset = await this.lockAsset(client, user.companyId, id);
      if (asset.revision !== revision) throw new ConflictException('Asset revision is stale.');
      if (asset.status !== 'draft') throw new BadRequestException('Only a draft asset can be activated.');
      await assertAccounts(client, user.companyId, [
        { id: data.offsetAccountId, field: 'offsetAccountId', types: ['asset', 'liability', 'equity'] },
        { id: asset.asset_account_id, field: 'assetAccountId', types: ['asset'] },
      ]);
      if (data.offsetAccountId === asset.asset_account_id) {
        throw new BadRequestException('offsetAccountId must differ from the asset account.');
      }
      const cost = toUnits(asset.cost);
      const entryId = await postJournalEntry(client, user, {
        sourceType: 'fixed_asset_acq', sourceId: asset.id,
        description: `Alta de activo fijo ${asset.asset_code}`,
        lines: [
          { accountId: asset.asset_account_id, description: asset.name, debit: cost, credit: 0n },
          { accountId: data.offsetAccountId as string, description: 'Contrapartida de adquisicion', debit: 0n, credit: cost },
        ],
      });
      await client.query(
        `UPDATE fixed_assets SET status='active', acquisition_entry_id=$2, activated_by=$3, activated_at=NOW(),
           revision=revision+1 WHERE id=$1`,
        [asset.id, entryId, user.sub],
      );
      await auditEvent(client, user, 'fixed_assets', 'fixed_assets.asset.activated', asset.id, {
        journal_entry_id: entryId, cost: asset.cost,
      });
      return { id: asset.id, status: 'active', journalEntryId: entryId, revision: revision + 1 };
    });
  }

  async disposeAsset(user: Actor, id: string, input: unknown) {
    const data = objectBody(input);
    const revision = expectedRevision(data.expectedRevision);
    const reason = changeReason(data.reason);
    const disposalDate = requiredDate(data.disposalDate, 'disposalDate');
    const proceeds = data.proceeds === undefined ? 0n : toUnits(requiredDecimal(data.proceeds, 'proceeds', true));
    return this.transaction(async (client) => {
      const asset = await this.lockAsset(client, user.companyId, id);
      if (asset.revision !== revision) throw new ConflictException('Asset revision is stale.');
      if (asset.status !== 'active') throw new BadRequestException('Only an active asset can be disposed.');
      if (disposalDate < asset.in_service_date || disposalDate > new Date().toISOString().slice(0, 10)) {
        throw new BadRequestException('disposalDate must be between the in-service date and today.');
      }
      const drafts = await client.query(
        `SELECT 1 FROM fixed_asset_depreciation_lines WHERE asset_id=$1 AND status='draft' LIMIT 1`,
        [asset.id],
      );
      if (drafts.rows[0]) {
        throw new BadRequestException('Post or void draft depreciation before disposing the asset.');
      }
      const cost = toUnits(asset.cost);
      const accumulated = toUnits(asset.accumulated_depreciation);
      const difference = proceeds - (cost - accumulated);
      const checks: Array<{ id: unknown; field: string; types: string[] }> = [];
      if (proceeds > 0n) checks.push({ id: data.proceedsAccountId, field: 'proceedsAccountId', types: ['asset'] });
      if (difference !== 0n) {
        checks.push({ id: data.gainLossAccountId, field: 'gainLossAccountId', types: ['revenue', 'expense'] });
      }
      await assertAccounts(client, user.companyId, checks);
      const lines = [
        { accountId: asset.accumulated_account_id, description: 'Baja de depreciacion acumulada', debit: accumulated, credit: 0n },
        { accountId: data.proceedsAccountId as string, description: 'Producto de la baja', debit: proceeds, credit: 0n },
        { accountId: data.gainLossAccountId as string, description: difference < 0n ? 'Perdida en baja' : 'Ganancia en baja',
          debit: difference < 0n ? -difference : 0n, credit: difference > 0n ? difference : 0n },
        { accountId: asset.asset_account_id, description: `Baja de ${asset.asset_code}`, debit: 0n, credit: cost },
      ];
      const entryId = await postJournalEntry(client, user, {
        sourceType: 'fixed_asset_disp', sourceId: asset.id,
        description: `Baja de activo fijo ${asset.asset_code}`, entryDate: disposalDate, lines,
      });
      await client.query(
        `UPDATE fixed_assets SET status='disposed', disposed_at=$2, disposal_proceeds=$3, disposal_entry_id=$4,
           disposal_reason=$5, revision=revision+1 WHERE id=$1`,
        [asset.id, disposalDate, fromUnits(proceeds), entryId, reason],
      );
      await auditEvent(client, user, 'fixed_assets', 'fixed_assets.asset.disposed', asset.id, {
        journal_entry_id: entryId, proceeds: fromUnits(proceeds), gain_loss: fromUnits(difference), reason,
      });
      return {
        id: asset.id, status: 'disposed', journalEntryId: entryId,
        proceeds: fromUnits(proceeds), gainLoss: fromUnits(difference),
      };
    });
  }

  async listDepreciation(user: Actor, year?: string, month?: string) {
    const y = year === undefined ? null : period(year, 'year');
    const m = month === undefined ? null : period(month, 'month');
    const result = await this.db.query(
      `SELECT l.id, l.asset_id, a.asset_code, a.name, l.period_year, l.period_month, l.sequence_no,
              l.amount::text, l.status, l.journal_entry_id, l.void_reason
       FROM fixed_asset_depreciation_lines l JOIN fixed_assets a ON a.id=l.asset_id
       WHERE l.company_id=$1 AND ($2::int IS NULL OR l.period_year=$2) AND ($3::int IS NULL OR l.period_month=$3)
       ORDER BY l.period_year DESC, l.period_month DESC, a.asset_code LIMIT 500`,
      [user.companyId, y, m],
    );
    return result.rows;
  }

  async runDepreciation(user: Actor, input: unknown) {
    const data = objectBody(input);
    const year = period(data.year, 'year');
    const month = period(data.month, 'month');
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`fixed-asset-run:${user.companyId}`]);
      const assets = await client.query<AssetRow>(
        `SELECT ${ASSET_COLUMNS} FROM fixed_assets
         WHERE company_id=$1 AND status='active' ORDER BY asset_code FOR UPDATE`,
        [user.companyId],
      );
      const created: Array<{ lineId: string; assetCode: string; amount: string }> = [];
      const skipped: Array<{ assetCode: string; reason: string }> = [];
      for (const asset of assets.rows) {
        const start = new Date(`${asset.in_service_date}T00:00:00.000Z`);
        const startIndex = start.getUTCFullYear() * 12 + start.getUTCMonth();
        const target = year * 12 + (month - 1);
        const existing = await client.query<{ count: string; accumulated: string }>(
          `SELECT COUNT(*)::text AS count, COALESCE(SUM(amount),0)::text AS accumulated
           FROM fixed_asset_depreciation_lines WHERE asset_id=$1 AND status<>'void'`,
          [asset.id],
        );
        const count = Number(existing.rows[0].count);
        if (target < startIndex) { skipped.push({ assetCode: asset.asset_code, reason: 'not_in_service' }); continue; }
        if (count >= asset.useful_life_months) { skipped.push({ assetCode: asset.asset_code, reason: 'fully_depreciated' }); continue; }
        if (target < startIndex + count) { skipped.push({ assetCode: asset.asset_code, reason: 'already_calculated' }); continue; }
        if (target > startIndex + count) { skipped.push({ assetCode: asset.asset_code, reason: 'previous_period_missing' }); continue; }
        const depreciable = toUnits(asset.cost) - toUnits(asset.salvage_value);
        const sequence = count + 1;
        const remaining = depreciable - toUnits(existing.rows[0].accumulated);
        const regular = depreciable / BigInt(asset.useful_life_months);
        const amount = sequence === asset.useful_life_months || regular > remaining ? remaining : regular;
        if (amount <= 0n) { skipped.push({ assetCode: asset.asset_code, reason: 'nothing_to_depreciate' }); continue; }
        const line = await client.query<{ id: string }>(
          `INSERT INTO fixed_asset_depreciation_lines
             (company_id, asset_id, period_year, period_month, sequence_no, amount, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [user.companyId, asset.id, year, month, sequence, fromUnits(amount), user.sub],
        );
        created.push({ lineId: line.rows[0].id, assetCode: asset.asset_code, amount: fromUnits(amount) });
      }
      await auditEvent(client, user, 'fixed_assets', 'fixed_assets.depreciation.calculated', `${year}-${month}`, {
        year, month, created: created.length, skipped: skipped.length,
      });
      return { year, month, status: 'draft', created, skipped };
    });
  }

  private async postLine(client: PoolClient, user: Actor, lineId: string) {
    if (!UUID_PATTERN.test(lineId)) throw new NotFoundException('Depreciation line not found.');
    const owner = await client.query<{ asset_id: string }>(
      'SELECT asset_id FROM fixed_asset_depreciation_lines WHERE id=$1 AND company_id=$2',
      [lineId, user.companyId],
    );
    if (!owner.rows[0]) throw new NotFoundException('Depreciation line not found.');
    const asset = await this.lockAsset(client, user.companyId, owner.rows[0].asset_id);
    const line = (await client.query<LineRow>(
      `SELECT id, asset_id, period_year, period_month, sequence_no, amount::text, status
       FROM fixed_asset_depreciation_lines WHERE id=$1 FOR UPDATE`,
      [lineId],
    )).rows[0];
    if (line.status !== 'draft') throw new BadRequestException('Only a draft depreciation line can be posted.');
    if (asset.status !== 'active') throw new BadRequestException('The asset is not active.');
    const periodEnd = lastDayOfMonth(line.period_year, line.period_month);
    if (periodEnd > new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException('A depreciation period can only be posted after it has ended.');
    }
    const earlier = await client.query(
      `SELECT 1 FROM fixed_asset_depreciation_lines
       WHERE asset_id=$1 AND status='draft' AND sequence_no<$2 LIMIT 1`,
      [asset.id, line.sequence_no],
    );
    if (earlier.rows[0]) throw new BadRequestException('Post earlier depreciation periods first.');
    const amount = toUnits(line.amount);
    if (toUnits(asset.accumulated_depreciation) + amount > toUnits(asset.cost) - toUnits(asset.salvage_value)) {
      throw new BadRequestException('Depreciation would exceed the depreciable amount.');
    }
    const entryId = await postJournalEntry(client, user, {
      sourceType: 'fixed_asset_dep', sourceId: line.id, entryDate: periodEnd,
      description: `Depreciacion ${line.period_year}-${String(line.period_month).padStart(2, '0')} ${asset.asset_code}`,
      lines: [
        { accountId: asset.expense_account_id, description: 'Gasto por depreciacion', debit: amount, credit: 0n },
        { accountId: asset.accumulated_account_id, description: 'Depreciacion acumulada', debit: 0n, credit: amount },
      ],
    });
    await client.query(
      `UPDATE fixed_asset_depreciation_lines SET status='posted', journal_entry_id=$2, decided_by=$3, decided_at=NOW()
       WHERE id=$1`,
      [line.id, entryId, user.sub],
    );
    await client.query(
      'UPDATE fixed_assets SET accumulated_depreciation=accumulated_depreciation+$2, revision=revision+1 WHERE id=$1',
      [asset.id, line.amount],
    );
    await auditEvent(client, user, 'fixed_assets', 'fixed_assets.depreciation.posted', line.id, {
      asset_id: asset.id, amount: line.amount, journal_entry_id: entryId,
    });
    return { id: line.id, assetCode: asset.asset_code, status: 'posted', journalEntryId: entryId };
  }

  postDepreciationLine(user: Actor, lineId: string) {
    return this.transaction((client) => this.postLine(client, user, lineId));
  }

  async postDepreciationPeriod(user: Actor, input: unknown) {
    const data = objectBody(input);
    const year = period(data.year, 'year');
    const month = period(data.month, 'month');
    return this.transaction(async (client) => {
      const lines = await client.query<{ id: string }>(
        `SELECT l.id FROM fixed_asset_depreciation_lines l
         WHERE l.company_id=$1 AND l.period_year=$2 AND l.period_month=$3 AND l.status='draft'
         ORDER BY l.sequence_no, l.id`,
        [user.companyId, year, month],
      );
      if (!lines.rows.length) throw new BadRequestException('There are no draft depreciation lines for this period.');
      const posted: Awaited<ReturnType<FixedAssetsService['postLine']>>[] = [];
      for (const line of lines.rows) posted.push(await this.postLine(client, user, line.id));
      return { year, month, posted };
    });
  }

  async reverseDepreciationLine(user: Actor, lineId: string, input: unknown) {
    const reason = changeReason(objectBody(input).reason);
    return this.transaction(async (client) => {
      if (!UUID_PATTERN.test(lineId)) throw new NotFoundException('Depreciation line not found.');
      const owner = await client.query<{ asset_id: string }>(
        'SELECT asset_id FROM fixed_asset_depreciation_lines WHERE id=$1 AND company_id=$2',
        [lineId, user.companyId],
      );
      if (!owner.rows[0]) throw new NotFoundException('Depreciation line not found.');
      const asset = await this.lockAsset(client, user.companyId, owner.rows[0].asset_id);
      const line = (await client.query<LineRow>(
        `SELECT id, asset_id, period_year, period_month, sequence_no, amount::text, status
         FROM fixed_asset_depreciation_lines WHERE id=$1 FOR UPDATE`,
        [lineId],
      )).rows[0];
      if (line.status !== 'posted') throw new BadRequestException('Only a posted depreciation line can be reversed.');
      if (asset.status !== 'active') throw new BadRequestException('The asset is not active.');
      const later = await client.query(
        `SELECT 1 FROM fixed_asset_depreciation_lines
         WHERE asset_id=$1 AND status<>'void' AND sequence_no>$2 LIMIT 1`,
        [asset.id, line.sequence_no],
      );
      if (later.rows[0]) throw new BadRequestException('Reverse later depreciation lines first.');
      const amount = toUnits(line.amount);
      const entryId = await postJournalEntry(client, user, {
        sourceType: 'fixed_asset_dep_rev', sourceId: line.id,
        description: `Reversion depreciacion ${line.period_year}-${String(line.period_month).padStart(2, '0')} ${asset.asset_code}`,
        lines: [
          { accountId: asset.accumulated_account_id, description: 'Reversion de depreciacion acumulada', debit: amount, credit: 0n },
          { accountId: asset.expense_account_id, description: 'Reversion de gasto por depreciacion', debit: 0n, credit: amount },
        ],
      });
      await client.query(
        `UPDATE fixed_asset_depreciation_lines
         SET status='void', void_reason=$2, reversal_journal_entry_id=$3, decided_by=$4, decided_at=NOW() WHERE id=$1`,
        [line.id, reason, entryId, user.sub],
      );
      await client.query(
        'UPDATE fixed_assets SET accumulated_depreciation=accumulated_depreciation-$2, revision=revision+1 WHERE id=$1',
        [asset.id, line.amount],
      );
      await auditEvent(client, user, 'fixed_assets', 'fixed_assets.depreciation.reversed', line.id, {
        asset_id: asset.id, amount: line.amount, reversal_journal_entry_id: entryId, reason,
      });
      return { id: line.id, status: 'void', reversalJournalEntryId: entryId };
    });
  }

  async voidDepreciationLine(user: Actor, lineId: string, input: unknown) {
    const reason = changeReason(objectBody(input).reason);
    return this.transaction(async (client) => {
      if (!UUID_PATTERN.test(lineId)) throw new NotFoundException('Depreciation line not found.');
      const line = await client.query<LineRow>(
        `SELECT id, asset_id, period_year, period_month, sequence_no, amount::text, status
         FROM fixed_asset_depreciation_lines WHERE id=$1 AND company_id=$2 FOR UPDATE`,
        [lineId, user.companyId],
      );
      if (!line.rows[0]) throw new NotFoundException('Depreciation line not found.');
      if (line.rows[0].status !== 'draft') throw new BadRequestException('Only a draft depreciation line can be voided.');
      const later = await client.query(
        `SELECT 1 FROM fixed_asset_depreciation_lines
         WHERE asset_id=$1 AND status<>'void' AND sequence_no>$2 LIMIT 1`,
        [line.rows[0].asset_id, line.rows[0].sequence_no],
      );
      if (later.rows[0]) throw new BadRequestException('Void later depreciation lines first.');
      await client.query(
        `UPDATE fixed_asset_depreciation_lines SET status='void', void_reason=$2, decided_by=$3, decided_at=NOW()
         WHERE id=$1`,
        [lineId, reason, user.sub],
      );
      await auditEvent(client, user, 'fixed_assets', 'fixed_assets.depreciation.voided', lineId, { reason });
      return { id: lineId, status: 'void' };
    });
  }
}
