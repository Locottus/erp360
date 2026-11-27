import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { assertAccounts, auditEvent, fromUnits, postJournalEntry, toUnits } from '../accounting/journal-posting';
import { DatabaseService } from '../common/database.service';
import { requiredDecimal } from '../common/decimal-input';
import { changeReason, expectedRevision } from '../common/management-input';
import {
  boundedText, idempotencyKey, inTransaction, objectBody, UUID_PATTERN, uuidValue,
} from '../common/request-input';

type Actor = { sub: string; companyId: string };

type FundRow = {
  id: string;
  code: string;
  name: string;
  cash_account_id: string;
  imprest_amount: string;
  self_approval_limit: string;
  balance: string;
  status: 'draft' | 'active' | 'closed';
  revision: number;
};

type VoucherRow = {
  id: string;
  fund_id: string;
  amount: string;
  expense_account_id: string;
  voucher_number: string;
  status: string;
  requested_by: string;
  description: string;
  payee: string;
};

@Injectable()
export class PettyCashService {
  constructor(private readonly db: DatabaseService) {}

  private transaction<T>(work: (client: PoolClient) => Promise<T>) {
    return inTransaction(this.db, work);
  }

  private async lockFund(client: PoolClient, companyId: string, id: string) {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Petty cash fund not found.');
    const result = await client.query<FundRow>(
      `SELECT id, code, name, cash_account_id, imprest_amount::text, self_approval_limit::text,
              balance::text, status, revision
       FROM petty_cash_funds WHERE id=$1 AND company_id=$2 FOR UPDATE`,
      [id, companyId],
    );
    if (!result.rows[0]) throw new NotFoundException('Petty cash fund not found.');
    return result.rows[0];
  }

  private async pendingTotal(client: PoolClient, fundId: string) {
    const result = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount),0)::text AS total FROM petty_cash_vouchers
       WHERE fund_id=$1 AND status='pending'`,
      [fundId],
    );
    return toUnits(result.rows[0].total);
  }

  private async movementReplay(
    client: PoolClient,
    companyId: string,
    key: string,
    fundId: string,
    kind: string,
  ) {
    const existing = await client.query<{ id: string; fund_id: string; kind: string; amount: string; journal_entry_id: string }>(
      `SELECT id, fund_id, kind, amount::text, journal_entry_id
       FROM petty_cash_fund_movements WHERE company_id=$1 AND idempotency_key=$2`,
      [companyId, key],
    );
    const row = existing.rows[0];
    if (!row) return null;
    if (row.fund_id !== fundId || row.kind !== kind) {
      throw new ConflictException('idempotencyKey was already used for a different operation.');
    }
    return { movementId: row.id, amount: row.amount, journalEntryId: row.journal_entry_id, replayed: true };
  }

  async listFunds(user: Actor) {
    const result = await this.db.query(
      `SELECT f.id, f.code, f.name, f.custodian_user_id, f.cash_account_id, f.imprest_amount::text,
              f.self_approval_limit::text, f.balance::text, f.status, f.revision, f.created_at,
              COALESCE(p.pending,0)::text AS pending_amount,
              (f.balance - COALESCE(p.pending,0))::text AS projected_balance
       FROM petty_cash_funds f
       LEFT JOIN (SELECT fund_id, SUM(amount) AS pending FROM petty_cash_vouchers
                  WHERE status='pending' GROUP BY fund_id) p ON p.fund_id=f.id
       WHERE f.company_id=$1 ORDER BY f.code`,
      [user.companyId],
    );
    return result.rows;
  }

  async getFund(user: Actor, id: string) {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Petty cash fund not found.');
    const fund = (await this.listFunds(user)).find((row) => row.id === id);
    if (!fund) throw new NotFoundException('Petty cash fund not found.');
    const [vouchers, movements, counts] = await Promise.all([
      this.db.query(
        `SELECT id, voucher_number, amount::text, expense_account_id, payee, description, receipt_reference,
                status, requested_by, decided_by, decided_at, decision_reason, replenishment_id, created_at
         FROM petty_cash_vouchers WHERE fund_id=$1 AND company_id=$2 ORDER BY created_at DESC LIMIT 200`,
        [id, user.companyId],
      ),
      this.db.query(
        `SELECT id, kind, amount::text, counter_account_id, journal_entry_id, created_by, created_at
         FROM petty_cash_fund_movements WHERE fund_id=$1 AND company_id=$2 ORDER BY created_at DESC LIMIT 100`,
        [id, user.companyId],
      ),
      this.db.query(
        `SELECT id, counted_amount::text, book_balance::text, pending_amount::text, difference::text,
                notes, counted_by, created_at
         FROM petty_cash_counts WHERE fund_id=$1 AND company_id=$2 ORDER BY created_at DESC LIMIT 50`,
        [id, user.companyId],
      ),
    ]);
    return { ...fund, vouchers: vouchers.rows, movements: movements.rows, counts: counts.rows };
  }

  async listVouchers(user: Actor, status?: string) {
    if (status !== undefined && !['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      throw new BadRequestException('status is not supported.');
    }
    const result = await this.db.query(
      `SELECT v.id, v.fund_id, f.code AS fund_code, v.voucher_number, v.amount::text, v.payee, v.description,
              v.receipt_reference, v.status, v.requested_by, v.decided_by, v.decision_reason, v.created_at
       FROM petty_cash_vouchers v JOIN petty_cash_funds f ON f.id=v.fund_id
       WHERE v.company_id=$1 AND ($2::text IS NULL OR v.status=$2)
       ORDER BY v.created_at DESC LIMIT 300`,
      [user.companyId, status ?? null],
    );
    return result.rows;
  }

  async createFund(user: Actor, input: unknown) {
    const data = objectBody(input);
    const code = boundedText(data.code, 'code', 2, 32).toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code)) throw new BadRequestException('code may only contain letters, digits, _ and -.');
    const name = boundedText(data.name, 'name', 3, 128);
    const imprest = requiredDecimal(data.imprestAmount, 'imprestAmount');
    const limit = data.selfApprovalLimit === undefined
      ? '0.0000' : requiredDecimal(data.selfApprovalLimit, 'selfApprovalLimit', true);
    if (toUnits(limit) > toUnits(imprest)) {
      throw new BadRequestException('selfApprovalLimit cannot exceed imprestAmount.');
    }
    return this.transaction(async (client) => {
      await assertAccounts(client, user.companyId, [
        { id: data.cashAccountId, field: 'cashAccountId', types: ['asset'] },
      ]);
      let custodian: string | null = null;
      if (data.custodianUserId !== undefined && data.custodianUserId !== null) {
        custodian = uuidValue(data.custodianUserId, 'custodianUserId');
        const found = await client.query(
          'SELECT 1 FROM users WHERE id=$1 AND company_id=$2 AND is_active=TRUE',
          [custodian, user.companyId],
        );
        if (!found.rows[0]) throw new BadRequestException('custodianUserId must be an active company user.');
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO petty_cash_funds
           (company_id, code, name, custodian_user_id, cash_account_id, imprest_amount, self_approval_limit, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (company_id, code) DO NOTHING RETURNING id`,
        [user.companyId, code, name, custodian, data.cashAccountId, imprest, limit, user.sub],
      );
      if (!inserted.rows[0]) throw new ConflictException('A fund with this code already exists.');
      await auditEvent(client, user, 'petty_cash', 'petty_cash.fund.created', inserted.rows[0].id, {
        code, imprest_amount: imprest, self_approval_limit: limit,
      });
      return { id: inserted.rows[0].id, code, status: 'draft', revision: 0 };
    });
  }

  async openFund(user: Actor, id: string, input: unknown) {
    const data = objectBody(input);
    const key = idempotencyKey(data.idempotencyKey);
    const revision = expectedRevision(data.expectedRevision);
    return this.transaction(async (client) => {
      const fund = await this.lockFund(client, user.companyId, id);
      const replay = await this.movementReplay(client, user.companyId, key, fund.id, 'opening');
      if (replay) return { fundId: fund.id, ...replay };
      if (fund.revision !== revision) throw new ConflictException('Fund revision is stale.');
      if (fund.status !== 'draft') throw new BadRequestException('Only a draft fund can be opened.');
      await assertAccounts(client, user.companyId, [
        { id: data.sourceAccountId, field: 'sourceAccountId', types: ['asset'] },
      ]);
      if (data.sourceAccountId === fund.cash_account_id) {
        throw new BadRequestException('sourceAccountId must differ from the fund cash account.');
      }
      const amount = toUnits(fund.imprest_amount);
      const movementId = (await client.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0].id;
      const entryId = await postJournalEntry(client, user, {
        sourceType: 'petty_cash_open', sourceId: movementId,
        description: `Apertura de caja chica ${fund.code}`,
        lines: [
          { accountId: fund.cash_account_id, description: 'Fondo fijo de caja chica', debit: amount, credit: 0n },
          { accountId: data.sourceAccountId as string, description: 'Origen del fondo', debit: 0n, credit: amount },
        ],
      });
      await client.query(
        `INSERT INTO petty_cash_fund_movements
           (id, company_id, fund_id, kind, idempotency_key, amount, counter_account_id, journal_entry_id, created_by)
         VALUES ($1,$2,$3,'opening',$4,$5,$6,$7,$8)`,
        [movementId, user.companyId, fund.id, key, fromUnits(amount), data.sourceAccountId, entryId, user.sub],
      );
      await client.query(
        `UPDATE petty_cash_funds SET status='active', balance=$2, revision=revision+1, updated_at=NOW() WHERE id=$1`,
        [fund.id, fromUnits(amount)],
      );
      await auditEvent(client, user, 'petty_cash', 'petty_cash.fund.opened', fund.id, {
        amount: fromUnits(amount), journal_entry_id: entryId,
      });
      return { fundId: fund.id, movementId, amount: fromUnits(amount), journalEntryId: entryId, replayed: false };
    });
  }

  async createVoucher(user: Actor, fundId: string, input: unknown) {
    const data = objectBody(input);
    const key = idempotencyKey(data.idempotencyKey);
    const amount = requiredDecimal(data.amount, 'amount');
    const payee = boundedText(data.payee, 'payee', 2, 160);
    const description = boundedText(data.description, 'description', 5, 500);
    const receipt = boundedText(data.receiptReference, 'receiptReference', 1, 80);
    const lookup = async (client: Pick<DatabaseService, 'query'>) => {
      const found = await client.query<{ id: string; fund_id: string; voucher_number: string; status: string; amount: string }>(
        `SELECT id, fund_id, voucher_number, status, amount::text
         FROM petty_cash_vouchers WHERE company_id=$1 AND idempotency_key=$2`,
        [user.companyId, key],
      );
      const row = found.rows[0];
      if (!row) return null;
      if (row.fund_id !== fundId || toUnits(row.amount) !== toUnits(amount)) {
        throw new ConflictException('idempotencyKey was already used for a different voucher.');
      }
      return { id: row.id, voucherNumber: row.voucher_number, status: row.status, replayed: true };
    };
    try {
      return await this.transaction(async (client) => {
        const fund = await this.lockFund(client, user.companyId, fundId);
        const replay = await lookup(client);
        if (replay) return replay;
        if (fund.status !== 'active') throw new BadRequestException('Fund is not active.');
        await assertAccounts(client, user.companyId, [
          { id: data.expenseAccountId, field: 'expenseAccountId', types: ['expense'] },
        ]);
        const projected = toUnits(fund.balance) - await this.pendingTotal(client, fund.id);
        if (toUnits(amount) > projected) {
          throw new BadRequestException(`Amount exceeds the projected fund balance (${fromUnits(projected)}).`);
        }
        const sequence = await client.query<{ last_value: string }>(
          `INSERT INTO document_sequences(company_id,prefix,last_value) VALUES($1,'PCV',1)
           ON CONFLICT(company_id,prefix) DO UPDATE SET last_value=document_sequences.last_value+1
           RETURNING last_value::text`,
          [user.companyId],
        );
        const number = `PCV-${sequence.rows[0].last_value.padStart(8, '0')}`;
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO petty_cash_vouchers
             (company_id, fund_id, voucher_number, idempotency_key, amount, expense_account_id, payee,
              description, receipt_reference, requested_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [user.companyId, fund.id, number, key, amount, data.expenseAccountId, payee, description, receipt, user.sub],
        );
        await auditEvent(client, user, 'petty_cash', 'petty_cash.voucher.requested', inserted.rows[0].id, {
          fund_id: fund.id, amount, voucher_number: number,
        });
        return { id: inserted.rows[0].id, voucherNumber: number, status: 'pending', replayed: false };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        const replay = await lookup(this.db);
        if (replay) return replay;
      }
      throw error;
    }
  }

  private async lockVoucher(client: PoolClient, companyId: string, id: string) {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Voucher not found.');
    const owner = await client.query<{ fund_id: string }>(
      'SELECT fund_id FROM petty_cash_vouchers WHERE id=$1 AND company_id=$2',
      [id, companyId],
    );
    if (!owner.rows[0]) throw new NotFoundException('Voucher not found.');
    const fund = await this.lockFund(client, companyId, owner.rows[0].fund_id);
    const voucher = await client.query<VoucherRow>(
      `SELECT id, fund_id, amount::text, expense_account_id, voucher_number, status, requested_by,
              description, payee
       FROM petty_cash_vouchers WHERE id=$1 FOR UPDATE`,
      [id],
    );
    return { fund, voucher: voucher.rows[0] };
  }

  async approveVoucher(user: Actor, id: string) {
    return this.transaction(async (client) => {
      const { fund, voucher } = await this.lockVoucher(client, user.companyId, id);
      if (voucher.status !== 'pending') throw new BadRequestException('Only a pending voucher can be approved.');
      if (voucher.requested_by === user.sub && toUnits(voucher.amount) > toUnits(fund.self_approval_limit)) {
        throw new ForbiddenException('An independent approver is required for this amount.');
      }
      if (fund.status !== 'active') throw new BadRequestException('Fund is not active.');
      if (toUnits(voucher.amount) > toUnits(fund.balance)) {
        throw new BadRequestException('Fund balance is insufficient for this voucher.');
      }
      await assertAccounts(client, user.companyId, [
        { id: voucher.expense_account_id, field: 'expenseAccountId', types: ['expense'] },
      ]);
      const amount = toUnits(voucher.amount);
      const entryId = await postJournalEntry(client, user, {
        sourceType: 'petty_cash_voucher', sourceId: voucher.id,
        description: `Vale de caja chica ${voucher.voucher_number}: ${voucher.payee}`,
        lines: [
          { accountId: voucher.expense_account_id, description: voucher.description, debit: amount, credit: 0n },
          { accountId: fund.cash_account_id, description: `Desembolso ${voucher.voucher_number}`, debit: 0n, credit: amount },
        ],
      });
      await client.query(
        `UPDATE petty_cash_vouchers
         SET status='approved', decided_by=$2, decided_at=NOW(), journal_entry_id=$3 WHERE id=$1`,
        [voucher.id, user.sub, entryId],
      );
      await client.query(
        'UPDATE petty_cash_funds SET balance=balance-$2, revision=revision+1, updated_at=NOW() WHERE id=$1',
        [fund.id, voucher.amount],
      );
      await auditEvent(client, user, 'petty_cash', 'petty_cash.voucher.approved', voucher.id, {
        fund_id: fund.id, amount: voucher.amount, journal_entry_id: entryId,
      });
      return { id: voucher.id, status: 'approved', journalEntryId: entryId };
    });
  }

  async rejectVoucher(user: Actor, id: string, input: unknown) {
    const reason = changeReason(objectBody(input).reason);
    return this.transaction(async (client) => {
      const { voucher } = await this.lockVoucher(client, user.companyId, id);
      if (voucher.status !== 'pending') throw new BadRequestException('Only a pending voucher can be rejected.');
      await client.query(
        `UPDATE petty_cash_vouchers SET status='rejected', decided_by=$2, decided_at=NOW(), decision_reason=$3
         WHERE id=$1`,
        [voucher.id, user.sub, reason],
      );
      await auditEvent(client, user, 'petty_cash', 'petty_cash.voucher.rejected', voucher.id, { reason });
      return { id: voucher.id, status: 'rejected' };
    });
  }

  async cancelVoucher(user: Actor, id: string, input: unknown) {
    const reason = changeReason(objectBody(input).reason);
    return this.transaction(async (client) => {
      const { voucher } = await this.lockVoucher(client, user.companyId, id);
      if (voucher.requested_by !== user.sub) {
        throw new ForbiddenException('Only the requester can cancel a voucher.');
      }
      if (voucher.status !== 'pending') throw new BadRequestException('Only a pending voucher can be cancelled.');
      await client.query(
        `UPDATE petty_cash_vouchers SET status='cancelled', decided_by=$2, decided_at=NOW(), decision_reason=$3
         WHERE id=$1`,
        [voucher.id, user.sub, reason],
      );
      await auditEvent(client, user, 'petty_cash', 'petty_cash.voucher.cancelled', voucher.id, { reason });
      return { id: voucher.id, status: 'cancelled' };
    });
  }

  async replenish(user: Actor, id: string, input: unknown) {
    const data = objectBody(input);
    const key = idempotencyKey(data.idempotencyKey);
    return this.transaction(async (client) => {
      const fund = await this.lockFund(client, user.companyId, id);
      const replay = await this.movementReplay(client, user.companyId, key, fund.id, 'replenishment');
      if (replay) return { fundId: fund.id, ...replay };
      if (fund.status !== 'active') throw new BadRequestException('Fund is not active.');
      await assertAccounts(client, user.companyId, [
        { id: data.sourceAccountId, field: 'sourceAccountId', types: ['asset'] },
      ]);
      if (data.sourceAccountId === fund.cash_account_id) {
        throw new BadRequestException('sourceAccountId must differ from the fund cash account.');
      }
      const vouchers = await client.query<{ id: string; amount: string }>(
        `SELECT id, amount::text FROM petty_cash_vouchers
         WHERE fund_id=$1 AND status='approved' AND replenishment_id IS NULL FOR UPDATE`,
        [fund.id],
      );
      const total = vouchers.rows.reduce((sum, row) => sum + toUnits(row.amount), 0n);
      if (total <= 0n) throw new BadRequestException('There are no approved vouchers pending replenishment.');
      const movementId = (await client.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0].id;
      const entryId = await postJournalEntry(client, user, {
        sourceType: 'petty_cash_replenish', sourceId: movementId,
        description: `Reposicion de caja chica ${fund.code}`,
        lines: [
          { accountId: fund.cash_account_id, description: 'Reposicion del fondo', debit: total, credit: 0n },
          { accountId: data.sourceAccountId as string, description: 'Origen de la reposicion', debit: 0n, credit: total },
        ],
      });
      await client.query(
        `INSERT INTO petty_cash_fund_movements
           (id, company_id, fund_id, kind, idempotency_key, amount, counter_account_id, journal_entry_id, created_by)
         VALUES ($1,$2,$3,'replenishment',$4,$5,$6,$7,$8)`,
        [movementId, user.companyId, fund.id, key, fromUnits(total), data.sourceAccountId, entryId, user.sub],
      );
      await client.query(
        'UPDATE petty_cash_vouchers SET replenishment_id=$2 WHERE id = ANY($1::uuid[])',
        [vouchers.rows.map((row) => row.id), movementId],
      );
      await client.query(
        'UPDATE petty_cash_funds SET balance=balance+$2, revision=revision+1, updated_at=NOW() WHERE id=$1',
        [fund.id, fromUnits(total)],
      );
      await auditEvent(client, user, 'petty_cash', 'petty_cash.fund.replenished', fund.id, {
        amount: fromUnits(total), vouchers: vouchers.rows.length, journal_entry_id: entryId,
      });
      return {
        fundId: fund.id, movementId, amount: fromUnits(total), journalEntryId: entryId,
        vouchers: vouchers.rows.length, replayed: false,
      };
    });
  }

  async registerCount(user: Actor, id: string, input: unknown) {
    const data = objectBody(input);
    const counted = requiredDecimal(data.countedAmount, 'countedAmount', true);
    const notes = changeReason(data.notes);
    return this.transaction(async (client) => {
      const fund = await this.lockFund(client, user.companyId, id);
      if (fund.status !== 'active') throw new BadRequestException('Fund is not active.');
      const pending = await this.pendingTotal(client, fund.id);
      const difference = toUnits(counted) - toUnits(fund.balance);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO petty_cash_counts
           (company_id, fund_id, counted_amount, book_balance, pending_amount, difference, notes, counted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [user.companyId, fund.id, counted, fund.balance, fromUnits(pending), fromUnits(difference), notes, user.sub],
      );
      await auditEvent(client, user, 'petty_cash', 'petty_cash.count.registered', inserted.rows[0].id, {
        fund_id: fund.id, counted_amount: counted, book_balance: fund.balance, difference: fromUnits(difference),
      });
      return {
        id: inserted.rows[0].id, bookBalance: fund.balance, countedAmount: counted,
        difference: fromUnits(difference), requiresReview: difference !== 0n,
      };
    });
  }

  async closeFund(user: Actor, id: string, input: unknown) {
    const data = objectBody(input);
    const key = idempotencyKey(data.idempotencyKey);
    const revision = expectedRevision(data.expectedRevision);
    const reason = changeReason(data.reason);
    return this.transaction(async (client) => {
      const fund = await this.lockFund(client, user.companyId, id);
      const replay = await this.movementReplay(client, user.companyId, key, fund.id, 'closing');
      if (replay) return { fundId: fund.id, status: 'closed', ...replay };
      if (fund.revision !== revision) throw new ConflictException('Fund revision is stale.');
      if (fund.status !== 'active') throw new BadRequestException('Only an active fund can be closed.');
      if ((await this.pendingTotal(client, fund.id)) > 0n) {
        throw new BadRequestException('Resolve pending vouchers before closing the fund.');
      }
      const unreplenished = await client.query(
        `SELECT 1 FROM petty_cash_vouchers WHERE fund_id=$1 AND status='approved' AND replenishment_id IS NULL LIMIT 1`,
        [fund.id],
      );
      if (unreplenished.rows[0]) {
        throw new BadRequestException('Replenish approved vouchers before closing the fund.');
      }
      await assertAccounts(client, user.companyId, [
        { id: data.destinationAccountId, field: 'destinationAccountId', types: ['asset'] },
      ]);
      if (data.destinationAccountId === fund.cash_account_id) {
        throw new BadRequestException('destinationAccountId must differ from the fund cash account.');
      }
      const balance = toUnits(fund.balance);
      let movementId: string | null = null;
      let entryId: string | null = null;
      if (balance > 0n) {
        movementId = (await client.query<{ id: string }>('SELECT gen_random_uuid() AS id')).rows[0].id;
        entryId = await postJournalEntry(client, user, {
          sourceType: 'petty_cash_close', sourceId: movementId,
          description: `Cierre de caja chica ${fund.code}`,
          lines: [
            { accountId: data.destinationAccountId as string, description: 'Devolucion del fondo', debit: balance, credit: 0n },
            { accountId: fund.cash_account_id, description: 'Cierre del fondo', debit: 0n, credit: balance },
          ],
        });
        await client.query(
          `INSERT INTO petty_cash_fund_movements
             (id, company_id, fund_id, kind, idempotency_key, amount, counter_account_id, journal_entry_id, created_by)
           VALUES ($1,$2,$3,'closing',$4,$5,$6,$7,$8)`,
          [movementId, user.companyId, fund.id, key, fromUnits(balance), data.destinationAccountId, entryId, user.sub],
        );
      }
      await client.query(
        `UPDATE petty_cash_funds SET status='closed', balance=0, closed_at=NOW(), revision=revision+1, updated_at=NOW()
         WHERE id=$1`,
        [fund.id],
      );
      await auditEvent(client, user, 'petty_cash', 'petty_cash.fund.closed', fund.id, {
        returned_amount: fromUnits(balance), journal_entry_id: entryId, reason,
      });
      return {
        fundId: fund.id, status: 'closed', movementId, amount: fromUnits(balance),
        journalEntryId: entryId, replayed: false,
      };
    });
  }
}
