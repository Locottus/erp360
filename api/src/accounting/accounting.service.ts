import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../common/database.service';
import { nextDocumentNumber } from '../common/document-sequence';
import { normalizeQuantityDocument, type QuantityDocument } from '../common/quantity-document';
import { requiredDate } from '../common/iso-date';
import type { AuthUser, ClosePeriodInput, RegisterInvoicePaymentInput } from './accounting.types';

type DbClient = Awaited<ReturnType<DatabaseService['connect']>>;

type SystemAccountCode = '1100' | '1110' | '1200' | '1300' | '2100' | '2200' | '4100' | '5100';
type PaymentAmounts = {
  amountInDocumentCurrency: number;
  amountInBaseCurrency: number;
  paymentCurrencyCode: string;
  documentCurrencyCode: string;
  baseCurrencyCode: string;
  exchangeRate: number;
};

type ParsedBankCsvLine = {
  reference: string;
  lineType: 'debit' | 'credit';
  amount: string;
  bookedAt: string;
  counterpartReference: string | null;
};

function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index++;
      record.push(field);
      if (record.some(value => value.trim() !== '')) records.push(record);
      record = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new BadRequestException('CSV contains an unclosed quoted field.');
  record.push(field);
  if (record.some(value => value.trim() !== '')) records.push(record);
  return records;
}

@Injectable()
export class AccountingService {
  constructor(private readonly db: DatabaseService) {}

  async listAccounts(user: AuthUser) {
    const result = await this.db.query(
      `SELECT code AS account_code,name AS account_name,account_type,is_active,is_system
       FROM accounting_accounts WHERE company_id=$1 ORDER BY code`, [user.companyId]);
    return result.rows;
  }

  async listBankAccounts(user: AuthUser) {
    return (await this.db.query(
      `SELECT id, code, bank_name, iban, currency_code, is_active, created_at
       FROM bank_accounts WHERE company_id=$1 ORDER BY created_at DESC`, [user.companyId],
    )).rows;
  }

  async listBankReconciliationLines(user: AuthUser) {
    const result = await this.db.query(
      `SELECT l.id,l.reference,l.line_type,l.amount::text,l.booked_at,l.counterpart_reference,l.metadata,
              l.reconciliation_status,l.matched_payment_id,l.difference_amount::text,l.reconciled_at,
              s.statement_reference,s.statement_date,b.code AS bank_account_code,b.bank_name
       FROM bank_statement_lines l
       JOIN bank_account_statements s ON s.id=l.statement_id
       JOIN bank_accounts b ON b.id=s.bank_account_id
       WHERE s.company_id=$1
       ORDER BY l.booked_at DESC,l.created_at DESC
       LIMIT 1000`,
      [user.companyId],
    );
    return result.rows;
  }

  async listBankReconciliationSuggestions(user: AuthUser) {
    const result = await this.db.query(
      `WITH pending_lines AS (
         SELECT l.id,l.reference,l.counterpart_reference,l.amount::text,l.line_type,l.booked_at,
                s.statement_reference,b.code AS bank_account_code
         FROM bank_statement_lines l
         JOIN bank_account_statements s ON s.id=l.statement_id
         JOIN bank_accounts b ON b.id=s.bank_account_id
         WHERE s.company_id=$1
           AND l.reconciliation_status IN ('pending','matched')
           AND l.line_type='credit'
       )
       SELECT pl.id AS line_id,pl.reference,pl.counterpart_reference,pl.amount,
              pl.line_type,pl.booked_at,pl.statement_reference,pl.bank_account_code,
              p.id AS payment_id,p.payment_reference,p.payment_date,
              CASE
                WHEN p.payment_reference=pl.reference THEN 'exact_reference'
                WHEN p.payment_reference=COALESCE(pl.counterpart_reference,'') THEN 'exact_counterpart'
                ELSE 'exact_amount'
              END AS match_type
       FROM pending_lines pl
       JOIN accounting_payments p
         ON p.company_id=$1
        AND p.amount=pl.amount::numeric
       WHERE pl.counterpart_reference IS NOT NULL
          OR p.payment_reference=pl.reference
       ORDER BY pl.booked_at DESC,p.created_at DESC
       LIMIT 500`,
      [user.companyId],
    );
    await this.insertAuditDirect(
      user,
      'accounting.bank_reconciliation.suggestions',
      user.companyId,
      { suggestions: result.rows.length },
    );
    return result.rows;
  }

  async reverseBankLine(
    user: AuthUser,
    lineId: string,
    input: { reason: string },
  ) {
    if (
      !input ||
      typeof input.reason !== 'string' ||
      input.reason.trim().length < 10 ||
      input.reason.length > 1000
    ) {
      throw new BadRequestException(
        'reason must contain 10 to 1000 characters.',
      );
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const line = await client.query<{
        id: string;
        reconciliation_status: string;
        matched_payment_id: string | null;
      }>(
        `SELECT l.id,l.reconciliation_status,l.matched_payment_id
         FROM bank_statement_lines l
         JOIN bank_account_statements s ON s.id=l.statement_id
         WHERE l.id=$1 AND s.company_id=$2
         FOR UPDATE OF l`,
        [lineId, user.companyId],
      );
      if (!line.rows[0]) {
        throw new NotFoundException('Bank statement line not found.');
      }
      if (line.rows[0].reconciliation_status === 'pending') {
        throw new ConflictException('This bank line is already pending.');
      }
      const matchedPaymentId = line.rows[0].matched_payment_id;
      await client.query(
        `UPDATE bank_statement_lines SET
           reconciliation_status='pending',
           matched_payment_id=NULL,
           difference_amount=NULL,
           reconciled_at=NULL,
           reconciled_by=NULL,
           reconciliation_reason=$2
         WHERE id=$1`,
        [lineId, input.reason.trim()],
      );
      if (matchedPaymentId) {
        const other = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM bank_statement_lines l
           JOIN bank_account_statements s ON s.id=l.statement_id
           WHERE s.company_id=$1
             AND l.matched_payment_id=$2
             AND l.id<>$3
             AND l.reconciliation_status IN ('matched','reconciled')`,
          [user.companyId, matchedPaymentId, lineId],
        );
        if (Number(other.rows[0].count) === 0) {
          await client.query(
            `UPDATE accounting_payments SET status='registered'
             WHERE id=$1 AND company_id=$2`,
            [matchedPaymentId, user.companyId],
          );
        }
      }
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'accounting.bank_line.reverse','bank_statement_lines',$3,$4)`,
        [
          user.companyId,
          user.sub,
          lineId,
          JSON.stringify({
            before_status: line.rows[0].reconciliation_status,
            after_status: 'pending',
            matched_payment_id: matchedPaymentId,
            reason: input.reason.trim(),
          }),
        ],
      );
      await client.query('COMMIT');
      return {
        id: lineId,
        status: 'pending',
        matchedPaymentId: null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async reconcileBankLine(
    user: AuthUser,
    lineId: string,
    input: { matchedPaymentId?: string; status: 'matched' | 'reconciled' | 'difference'; reason: string; differenceAmount?: number },
  ) {
    if (!input || !['matched', 'reconciled', 'difference'].includes(input.status)) {
      throw new BadRequestException('status must be matched, reconciled or difference.');
    }
    if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) {
      throw new BadRequestException('reason must contain 10 to 1000 characters.');
    }
    if (input.status === 'difference' &&
      (typeof input.differenceAmount !== 'number' || !Number.isFinite(input.differenceAmount) || input.differenceAmount < 0)) {
      throw new BadRequestException('differenceAmount must be a non-negative number.');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const line = await client.query<{
        id: string; amount: string; reconciliation_status: string; statement_id: string;
      }>(
        `SELECT l.id,l.amount::text,l.reconciliation_status,l.statement_id
         FROM bank_statement_lines l
         JOIN bank_account_statements s ON s.id=l.statement_id
         WHERE l.id=$1 AND s.company_id=$2 FOR UPDATE OF l`,
        [lineId, user.companyId],
      );
      if (!line.rows[0]) throw new NotFoundException('Bank statement line not found.');
      if (line.rows[0].reconciliation_status === 'reconciled') {
        throw new ConflictException('This bank line is already reconciled.');
      }
      let matchedPaymentId: string | null = null;
      if (input.matchedPaymentId !== undefined) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.matchedPaymentId)) {
          throw new BadRequestException('matchedPaymentId must be a UUID.');
        }
        const payment = await client.query<{ id: string; amount: string }>(
          `SELECT id,amount::text FROM accounting_payments WHERE id=$1 AND company_id=$2`,
          [input.matchedPaymentId, user.companyId],
        );
        if (!payment.rows[0]) throw new NotFoundException('Matched accounting payment not found.');
        if (Math.abs(Number(payment.rows[0].amount) - Number(line.rows[0].amount)) >= 0.0001) {
          throw new ConflictException('Payment amount does not match the bank line amount.');
        }
        matchedPaymentId = input.matchedPaymentId;
        await client.query(
          `UPDATE accounting_payments SET status='reconciled' WHERE id=$1 AND company_id=$2`,
          [matchedPaymentId, user.companyId],
        );
      }
      const updated =
        input.status === 'difference'
          ? await client.query<{ reconciliation_status: string }>(
              `UPDATE bank_statement_lines SET
                 reconciliation_status=$2::varchar,
                 matched_payment_id=NULL,
                 difference_amount=$3::numeric,
                 reconciled_at=NULL,
                 reconciled_by=NULL,
                 reconciliation_reason=$4
               WHERE id=$1
               RETURNING reconciliation_status`,
              [
                lineId,
                input.status,
                input.differenceAmount,
                input.reason.trim(),
              ],
            )
          : await client.query<{ reconciliation_status: string }>(
              `UPDATE bank_statement_lines SET
                 reconciliation_status=$2::varchar,
                 matched_payment_id=$3::uuid,
                 difference_amount=NULL,
                 reconciled_at=CASE WHEN $2::text='reconciled' THEN NOW() ELSE NULL END,
                 reconciled_by=CASE WHEN $2::text='reconciled' THEN $4::uuid ELSE NULL END,
                 reconciliation_reason=$5
               WHERE id=$1
               RETURNING reconciliation_status`,
              [
                lineId,
                input.status,
                matchedPaymentId,
                user.sub,
                input.reason.trim(),
              ],
            );
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'accounting.bank_line.reconcile','bank_statement_lines',$4,$3::jsonb)`,
        [user.companyId, user.sub, JSON.stringify({
          before_status: line.rows[0].reconciliation_status,
          after_status: updated.rows[0].reconciliation_status,
          matched_payment_id: matchedPaymentId,
          difference_amount: input.differenceAmount ?? null,
          reason: input.reason.trim(),
        }), lineId],
      );
      await client.query('COMMIT');
      return {
        id: lineId,
        status: updated.rows[0].reconciliation_status,
        matchedPaymentId,
        differenceAmount: input.status === 'difference' ? input.differenceAmount : null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertBankAccount(user: AuthUser, input: { code?: string; bankName?: string; iban?: string; currencyCode?: string; isActive?: boolean }) {
    if (typeof input?.code !== 'string' || !input.code.trim()) throw new BadRequestException('code is required.');
    if (typeof input?.bankName !== 'string' || !input.bankName.trim()) throw new BadRequestException('bankName is required.');
    const code = input.code.trim().toUpperCase();
    const bankName = input.bankName.trim();
    const iban = input.iban === undefined || input.iban === null || input.iban === '' ? null : String(input.iban).trim();
    const currencyCode = (input.currencyCode ?? 'USD').toString().trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) throw new BadRequestException('currencyCode must be a three-letter ISO code.');
    if (iban !== null && iban.length > 64) throw new BadRequestException('iban cannot exceed 64 characters.');
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO bank_accounts(company_id,code,bank_name,iban,currency_code,is_active,created_by,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT(company_id,code) DO UPDATE SET
         bank_name=EXCLUDED.bank_name,
         iban=EXCLUDED.iban,
         currency_code=EXCLUDED.currency_code,
         is_active=COALESCE(EXCLUDED.is_active,bank_accounts.is_active),
         updated_at=NOW()
       RETURNING id`, [user.companyId, code, bankName, iban, currencyCode, input.isActive ?? true, user.sub],
    );
    await this.insertAuditDirect(user, 'accounting.bank_account.upsert', result.rows[0].id, {
      code, bank_name: bankName, iban, currency_code: currencyCode, is_active: input.isActive ?? true,
    });
    return { id: result.rows[0].id, code, bankName: bankName, iban, currencyCode, isActive: input.isActive ?? true };
  }

  async importBankStatement(user: AuthUser, bankAccountId: string, input: {
    statementReference: string; statementDate: string; openingBalance: string; closingBalance: string; csv: string;
  }) {
    if (!input || typeof input.statementReference !== 'string' || !input.statementReference.trim() ||
        input.statementReference.trim().length > 64 || /[\u0000-\u001f]/.test(input.statementReference)) {
      throw new BadRequestException('statementReference must contain 1 to 64 valid characters.');
    }
    const statementDate = requiredDate(input.statementDate, 'statementDate');
    const parseMoney = (value: string, field: string, allowZero: boolean) => {
      if (typeof value !== 'string' || !/^\d{1,14}(?:\.\d{1,4})?$/.test(value)) {
        throw new BadRequestException(`${field} must be a non-negative amount with up to 4 decimals.`);
      }
      const [whole, fraction = ''] = value.split('.');
      const scaled = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
      if (!allowZero && scaled <= 0n) throw new BadRequestException(`${field} must be greater than zero.`);
      return { value: Number(value), scaled };
    };
    const opening = parseMoney(input.openingBalance, 'openingBalance', true);
    const closing = parseMoney(input.closingBalance, 'closingBalance', true);
    if (typeof input.csv !== 'string' || !input.csv.trim() || Buffer.byteLength(input.csv, 'utf8') > 1_000_000) {
      throw new BadRequestException('csv must contain a file of at most 1 MB.');
    }
    const records = parseCsvRecords(input.csv.replace(/^\uFEFF/, ''));
    const headers = records.shift()?.map(value => value.trim().toLowerCase());
    const expectedHeaders = ['reference', 'line_type', 'amount', 'booked_at', 'counterpart_reference'];
    if (!headers || headers.length !== expectedHeaders.length ||
        headers.some((header, index) => header !== expectedHeaders[index])) {
      throw new BadRequestException(`CSV header must be: ${expectedHeaders.join(',')}.`);
    }
    if (records.length < 1 || records.length > 5000) {
      throw new BadRequestException('CSV must contain between 1 and 5000 transaction rows.');
    }
    const seenReferences = new Set<string>();
    let debits = 0n;
    let credits = 0n;
    const lines: ParsedBankCsvLine[] = records.map((record, index) => {
      if (record.length !== expectedHeaders.length) throw new BadRequestException(`CSV row ${index + 2} must contain exactly 5 fields.`);
      const [reference, rawType, rawAmount, bookedAt, rawCounterpart] = record.map(value => value.trim());
      if (!reference || reference.length > 64 || /[\u0000-\u001f]/.test(reference) || seenReferences.has(reference)) {
        throw new BadRequestException(`CSV row ${index + 2} has an invalid or repeated reference.`);
      }
      seenReferences.add(reference);
      const lineType = rawType.toLowerCase();
      if (lineType !== 'debit' && lineType !== 'credit') {
        throw new BadRequestException(`CSV row ${index + 2} line_type must be debit or credit.`);
      }
      const amount = parseMoney(rawAmount, `CSV row ${index + 2} amount`, false);
      const timestamp = Date.parse(bookedAt);
      if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(bookedAt) || !Number.isFinite(timestamp)) {
        throw new BadRequestException(`CSV row ${index + 2} booked_at must be an ISO 8601 timestamp with timezone.`);
      }
      if (lineType === 'debit') debits += amount.scaled;
      else credits += amount.scaled;
      return {
        reference,
        lineType,
        amount: amount.value.toFixed(4),
        bookedAt: new Date(timestamp).toISOString(),
        counterpartReference: rawCounterpart || null,
      };
    });
    if (opening.scaled + credits - debits !== closing.scaled) {
      throw new BadRequestException('Opening balance plus credits minus debits must equal closing balance.');
    }
    const importHash = createHash('sha256').update(input.csv, 'utf8').digest('hex');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const bank = await client.query<{ id: string }>(
        'SELECT id FROM bank_accounts WHERE id=$1 AND company_id=$2 AND is_active FOR UPDATE',
        [bankAccountId, user.companyId],
      );
      if (!bank.rows[0]) throw new NotFoundException('Active bank account not found in this company.');
      const prior = await client.query<{ id: string; statement_reference: string; import_sha256: string }>(
        `SELECT id,statement_reference,import_sha256 FROM bank_account_statements
         WHERE company_id=$1 AND bank_account_id=$2 AND (statement_reference=$3 OR import_sha256=$4)
         FOR UPDATE`,
        [user.companyId, bankAccountId, input.statementReference.trim(), importHash],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].statement_reference !== input.statementReference.trim() ||
            prior.rows[0].import_sha256?.trim() !== importHash) {
          throw new ConflictException('Statement reference or CSV file was already imported with different data.');
        }
        await client.query('COMMIT');
        return { id: prior.rows[0].id, importedLines: lines.length, replayed: true };
      }
      const statement = await client.query<{ id: string }>(
        `INSERT INTO bank_account_statements
          (company_id,bank_account_id,statement_reference,statement_date,opening_balance,closing_balance,created_by,import_format,import_sha256)
         VALUES($1,$2,$3,$4::date,$5,$6,$7,'generic_csv',$8) RETURNING id`,
        [user.companyId, bankAccountId, input.statementReference.trim(), statementDate,
          opening.value, closing.value, user.sub, importHash],
      );
      for (const line of lines) {
        await client.query(
          `INSERT INTO bank_statement_lines(statement_id,line_type,reference,amount,booked_at,counterpart_reference)
           VALUES($1,$2,$3,$4,$5::timestamptz,$6)`,
          [statement.rows[0].id, line.lineType, line.reference, line.amount, line.bookedAt, line.counterpartReference],
        );
      }
      await this.insertAudit(client, user, 'accounting.bank_statement.import', statement.rows[0].id, {
        bank_account_id: bankAccountId, statement_reference: input.statementReference.trim(),
        statement_date: statementDate, imported_lines: lines.length, import_sha256: importHash,
        reconciliation_started_as: 'pending',
      });
      await client.query('COMMIT');
      return { id: statement.rows[0].id, importedLines: lines.length, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Duplicate bank statement or transaction reference.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getInventoryCostIntegrity(user: AuthUser) {
    const result = await this.db.query<{
      dispatch_movements: string;
      dispatch_with_snapshot: string;
      dispatch_without_snapshot: string;
      dispatch_with_negative_cost: string;
      dispatch_quantity_mismatch: string;
      lot_quantity_negative: string;
    }>(
      `WITH dispatches AS (
         SELECT m.id,m.quantity::text,m.unit_cost,m.total_cost,
                dc.id AS dispatch_cost_id,dc.quantity AS dispatch_quantity,
                dc.unit_cost AS dispatch_unit_cost,dc.total_cost AS dispatch_total_cost
         FROM inventory_movements m
         LEFT JOIN inventory_dispatch_costs dc
           ON dc.inventory_movement_id=m.id AND dc.company_id=m.company_id
         WHERE m.company_id=$1 AND m.movement_type='sale_dispatch'
       )
       SELECT
         (SELECT COUNT(*)::text FROM dispatches) AS dispatch_movements,
         (SELECT COUNT(*)::text FROM dispatches WHERE dispatch_cost_id IS NOT NULL) AS dispatch_with_snapshot,
         (SELECT COUNT(*)::text FROM dispatches WHERE dispatch_cost_id IS NULL) AS dispatch_without_snapshot,
         (SELECT COUNT(*)::text FROM dispatches
          WHERE dispatch_unit_cost<0 OR dispatch_total_cost<0 OR unit_cost<0 OR total_cost<0) AS dispatch_with_negative_cost,
         (SELECT COUNT(*)::text FROM dispatches
          WHERE dispatch_cost_id IS NOT NULL
            AND ABS(dispatch_quantity-quantity::numeric)>0.00005) AS dispatch_quantity_mismatch,
         (SELECT COUNT(*)::text FROM inventory_cost_lots
          WHERE company_id=$1 AND quantity_remaining<0) AS lot_quantity_negative`,
      [user.companyId],
    );
    const row = result.rows[0];
    const report = {
      capturedAt: new Date().toISOString(),
      dispatchMovements: Number(row.dispatch_movements),
      dispatchWithSnapshot: Number(row.dispatch_with_snapshot),
      dispatchWithoutSnapshot: Number(row.dispatch_without_snapshot),
      dispatchWithNegativeCost: Number(row.dispatch_with_negative_cost),
      dispatchQuantityMismatch: Number(row.dispatch_quantity_mismatch),
      lotQuantityNegative: Number(row.lot_quantity_negative),
      complete:
        Number(row.dispatch_without_snapshot) === 0 &&
        Number(row.dispatch_with_negative_cost) === 0 &&
        Number(row.dispatch_quantity_mismatch) === 0 &&
        Number(row.lot_quantity_negative) === 0,
    };
    await this.insertAuditDirect(
      user,
      'accounting.inventory_cost.integrity_report',
      user.companyId,
      report,
    );
    return report;
  }

  async getFinancialStatements(user: AuthUser, asOfDate?: string, fromDate?: string, toDate?: string) {
    const reportTo = requiredDate(toDate ?? asOfDate ?? new Date().toISOString().slice(0, 10), 'toDate');
    const reportFrom = requiredDate(fromDate ?? `${reportTo.slice(0, 4)}-01-01`, 'fromDate');
    if (reportFrom > reportTo) throw new BadRequestException('fromDate must not be later than toDate.');
    const currentFrom = new Date(`${reportFrom}T00:00:00Z`);
    const currentTo = new Date(`${reportTo}T00:00:00Z`);
    const periodDays = Math.round((currentTo.getTime() - currentFrom.getTime()) / 86400000) + 1;
    const previousTo = new Date(currentFrom.getTime() - 86400000);
    const previousFrom = new Date(previousTo.getTime() - (periodDays - 1) * 86400000);
    const previousToDate = previousTo.toISOString().slice(0, 10);
    const previousFromDate = previousFrom.toISOString().slice(0, 10);
    const result = await this.db.query<{
      account_type: string;
      balance: string;
      period_balance: string;
      previous_period_balance: string;
    }>(
      `SELECT a.account_type,
              COALESCE(SUM(CASE WHEN je.status='posted' AND je.entry_date<=$2::date THEN
                CASE a.account_type
                  WHEN 'asset' THEN jl.debit-jl.credit
                  WHEN 'liability' THEN jl.credit-jl.debit
                  WHEN 'equity' THEN jl.credit-jl.debit
                  WHEN 'revenue' THEN jl.credit-jl.debit
                  WHEN 'expense' THEN jl.debit-jl.credit
                  ELSE 0 END ELSE 0 END),0)::text AS balance,
              COALESCE(SUM(CASE WHEN je.status='posted' AND je.entry_date BETWEEN $3::date AND $2::date THEN
                CASE a.account_type
                  WHEN 'revenue' THEN jl.credit-jl.debit
                  WHEN 'expense' THEN jl.debit-jl.credit
                  ELSE 0 END ELSE 0 END),0)::text AS period_balance
              ,COALESCE(SUM(CASE WHEN je.status='posted' AND je.entry_date BETWEEN $5::date AND $4::date THEN
                CASE a.account_type
                  WHEN 'revenue' THEN jl.credit-jl.debit
                  WHEN 'expense' THEN jl.debit-jl.credit
                  ELSE 0 END ELSE 0 END),0)::text AS previous_period_balance
       FROM accounting_accounts a
       LEFT JOIN accounting_journal_lines jl ON jl.account_id=a.id
       LEFT JOIN accounting_journal_entries je ON je.id=jl.journal_entry_id AND je.company_id=a.company_id
       WHERE a.company_id=$1
       GROUP BY a.account_type`,
      [user.companyId, reportTo, reportFrom, previousToDate, previousFromDate],
    );
    const balances = Object.fromEntries(result.rows.map(row => [row.account_type, {
      balance: Number(row.balance),
      period: Number(row.period_balance),
      previousPeriod: Number(row.previous_period_balance),
    }]));
    const assets = balances.asset?.balance ?? 0;
    const liabilities = balances.liability?.balance ?? 0;
    const bookedEquity = balances.equity?.balance ?? 0;
    const accumulatedNetIncome = (balances.revenue?.balance ?? 0) - (balances.expense?.balance ?? 0);
    const equity = bookedEquity + accumulatedNetIncome;
    const revenue = balances.revenue?.period ?? 0;
    const expenses = balances.expense?.period ?? 0;
    const previousRevenue = balances.revenue?.previousPeriod ?? 0;
    const previousExpenses = balances.expense?.previousPeriod ?? 0;
    const previousNetIncome = previousRevenue - previousExpenses;
    const totalLiabilitiesAndEquity = liabilities + equity;
    const balanceSheet = {
      asOfDate: reportTo,
      assets,
      liabilities,
      equity,
      accumulatedNetIncome,
      totalLiabilitiesAndEquity,
      balancesMatch: Math.abs(assets - totalLiabilitiesAndEquity) < 0.0001,
    };
    const incomeStatement = {
      fromDate: reportFrom,
      toDate: reportTo,
      revenue,
      expenses,
      netIncome: revenue - expenses,
      comparative: {
        fromDate: previousFromDate,
        toDate: previousToDate,
        revenue: previousRevenue,
        expenses: previousExpenses,
        netIncome: previousNetIncome,
      },
    };
    await this.insertAuditDirect(user, 'accounting.report.financial_statements', user.companyId, {
      from_date: reportFrom,
      to_date: reportTo,
      assets,
      liabilities,
      equity,
      revenue,
      expenses,
      basis: 'operational_unreviewed',
    });
    return { basis: 'operational_unreviewed', balanceSheet, incomeStatement };
  }

  async generalLedger(user: AuthUser, options: {
    accountCode?: string; fromDate?: string; toDate?: string; page?: string; pageSize?: string;
  }) {
    if (typeof options.accountCode !== 'string' || !options.accountCode.trim() || options.accountCode.length > 32) {
      throw new BadRequestException('accountCode is required (1 to 32 characters).');
    }
    const from = requiredDate(options.fromDate, 'fromDate');
    const to = requiredDate(options.toDate, 'toDate');
    if (from > to) throw new BadRequestException('fromDate must not be later than toDate.');
    const page = options.page === undefined ? 1 : Number(options.page);
    const pageSize = options.pageSize === undefined ? 25 : Number(options.pageSize);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 ||
        !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('page must be 1 to 1000000 and pageSize 1 to 100.');
    }
    const result = await this.db.query<{
      account: { code: string; name: string; account_type: string };
      summary: { opening: string; debit: string; credit: string; closing: string };
      items: { id: string; entry_id: string; entry_number: string; entry_date: string; description: string | null;
        source_type: string; source_id: string | null; debit: string; credit: string; running_balance: string }[];
      total: number;
    }>(
      `WITH account AS (
         SELECT id,code,name,account_type FROM accounting_accounts WHERE company_id=$1 AND code=$2
       ), source AS (
         SELECT jl.id,je.id AS entry_id,je.entry_number,je.entry_date,je.created_at,
           COALESCE(jl.line_description,je.description) AS description,je.source_type,je.source_id,jl.debit,jl.credit
         FROM accounting_journal_lines jl JOIN account a ON a.id=jl.account_id
         JOIN accounting_journal_entries je ON je.id=jl.journal_entry_id
         WHERE je.company_id=$1 AND je.status='posted' AND je.entry_date<=$4::date
       ), summary AS (
         SELECT COALESCE(SUM(debit-credit) FILTER(WHERE entry_date<$3::date),0) AS opening,
           COALESCE(SUM(debit) FILTER(WHERE entry_date>=$3::date),0) AS debit,
           COALESCE(SUM(credit) FILTER(WHERE entry_date>=$3::date),0) AS credit,
           COALESCE(SUM(debit-credit),0) AS closing,
           COUNT(*) FILTER(WHERE entry_date>=$3::date)::integer AS total FROM source
       ), running AS (
         SELECT s.*,summary.opening+SUM(s.debit-s.credit) OVER (
           ORDER BY s.entry_date,s.created_at,s.entry_id,s.id ROWS UNBOUNDED PRECEDING) AS running_balance
         FROM source s CROSS JOIN summary WHERE s.entry_date>=$3::date
       ), paged AS (
         SELECT * FROM running ORDER BY entry_date,created_at,entry_id,id LIMIT $5 OFFSET $6
       )
       SELECT jsonb_build_object('code',a.code,'name',a.name,'account_type',a.account_type) AS account,
         jsonb_build_object('opening',s.opening::text,'debit',s.debit::text,'credit',s.credit::text,'closing',s.closing::text) AS summary,
         s.total,COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'id',p.id,'entry_id',p.entry_id,'entry_number',p.entry_number,'entry_date',p.entry_date::text,
           'description',p.description,'source_type',p.source_type,'source_id',p.source_id,
           'debit',p.debit::text,'credit',p.credit::text,'running_balance',p.running_balance::text)
           ORDER BY p.entry_date,p.created_at,p.entry_id,p.id) FROM paged p),'[]'::jsonb) AS items
       FROM account a CROSS JOIN summary s`,
      [user.companyId, options.accountCode.trim(), from, to, pageSize, (page - 1) * pageSize]);
    if (!result.rows[0]) throw new NotFoundException('Account not found in current company.');
    await this.insertAuditDirect(user, 'accounting.report.general_ledger', user.companyId,
      { account_code: options.accountCode.trim(), from_date: from, to_date: to, page, page_size: pageSize });
    return { ...result.rows[0], fromDate: from, toDate: to, page, pageSize };
  }

  async creditableInvoiceLines(user: AuthUser, invoiceId: string) {
    const invoice = await this.db.query<{ order_id: string; status: string }>(
      'SELECT order_id,status FROM sales_invoices WHERE id=$1 AND company_id=$2',
      [invoiceId, user.companyId],
    );
    if (!invoice.rows[0]) throw new NotFoundException('Invoice not found.');
    if (invoice.rows[0].status === 'void') return [];
    return (await this.db.query(
      `SELECT l.id AS order_line_id,l.product_id,p.sku,p.name AS product_name,
         l.quantity::text AS invoiced_quantity,l.unit_price::text AS unit_price,
         (l.quantity-COALESCE((SELECT SUM(cnl.quantity) FROM sales_credit_note_lines cnl
           JOIN sales_credit_notes cn ON cn.id=cnl.credit_note_id AND cn.company_id=$2
           WHERE cn.invoice_id=$1 AND cnl.order_line_id=l.id),0))::text AS creditable_quantity
       FROM sales_order_lines l JOIN products p ON p.id=l.product_id AND p.company_id=$2
       WHERE l.order_id=$3
         AND l.quantity>COALESCE((SELECT SUM(cnl.quantity) FROM sales_credit_note_lines cnl
           JOIN sales_credit_notes cn ON cn.id=cnl.credit_note_id AND cn.company_id=$2
           WHERE cn.invoice_id=$1 AND cnl.order_line_id=l.id),0)
       ORDER BY l.id`,
      [invoiceId, user.companyId, invoice.rows[0].order_id],
    )).rows;
  }

  async creditInvoice(user: AuthUser, invoiceId: string, input: {
    reason: string; returnStock: boolean; lines?: { orderLineId: string; quantity: number }[];
  }) {
    if (typeof input?.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000 ||
        typeof input.returnStock !== 'boolean' || (input.lines !== undefined && !Array.isArray(input.lines))) {
      throw new BadRequestException('A reason, explicit returnStock choice, and valid optional line quantities are required.');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const source = await client.query<{ order_id: string }>(
        'SELECT order_id FROM sales_invoices WHERE id=$1 AND company_id=$2', [invoiceId, user.companyId],
      );
      if (!source.rows[0]) throw new NotFoundException('Invoice not found.');
      await client.query('SELECT id FROM sales_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [source.rows[0].order_id, user.companyId]);
      const invoice = await client.query<{
        status: string; subtotal: string; tax_total: string; grand_total: string; currency_code: string | null;
      }>(
        'SELECT status,subtotal,tax_total,grand_total,currency_code FROM sales_invoices WHERE id=$1 AND company_id=$2 FOR UPDATE',
        [invoiceId, user.companyId],
      );
      if (invoice.rows[0].status === 'void') throw new ConflictException('Invoice was already fully credited.');
      if (Number(invoice.rows[0].grand_total) <= 0) throw new BadRequestException('A credit requires a positive invoice total.');
      await this.assertSourceEntryExists(client, user.companyId, 'sales_invoice', invoiceId);
      const sourceLines = await client.query<{
        id: string; product_id: string; quantity: string; unit_price: string; remaining_quantity: string;
      }>(
        `SELECT l.id,l.product_id,l.quantity::text,l.unit_price::text,
           (l.quantity-COALESCE((SELECT SUM(cnl.quantity) FROM sales_credit_note_lines cnl
             JOIN sales_credit_notes cn ON cn.id=cnl.credit_note_id AND cn.company_id=$2
             WHERE cn.invoice_id=$1 AND cnl.order_line_id=l.id),0))::text AS remaining_quantity
         FROM sales_order_lines l WHERE l.order_id=$3 ORDER BY l.id FOR UPDATE`,
        [invoiceId, user.companyId, source.rows[0].order_id],
      );
      if (!sourceLines.rows.length) throw new BadRequestException('Invoice has no verifiable order lines.');
      const selected = new Map<string, number>();
      if (input.lines === undefined) {
        for (const line of sourceLines.rows) {
          const remaining = Number(line.remaining_quantity);
          if (remaining > 0) selected.set(line.id, remaining);
        }
      } else {
        if (input.lines.length === 0) throw new BadRequestException('At least one credit line is required.');
        for (const line of input.lines) {
          if (!line || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(line.orderLineId) ||
              typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0 ||
              Math.round(line.quantity * 10000) / 10000 !== line.quantity || selected.has(line.orderLineId)) {
            throw new BadRequestException('Each credit line must have a unique orderLineId and positive quantity with up to 4 decimals.');
          }
          selected.set(line.orderLineId, line.quantity);
        }
      }
      const selectedLines = [...selected.entries()].map(([id, quantity]) => {
        const sourceLine = sourceLines.rows.find(line => line.id === id);
        if (!sourceLine) throw new BadRequestException(`Order line '${id}' does not belong to this invoice.`);
        if (quantity > Number(sourceLine.remaining_quantity) + 0.00005) {
          throw new BadRequestException('Credit quantity exceeds the uninvoiced quantity remaining for an order line.');
        }
        return {
          orderLineId: id,
          quantity,
          subtotal: Number((quantity * Number(sourceLine.unit_price)).toFixed(4)),
          productId: sourceLine.product_id,
        };
      });
      if (!selectedLines.length) throw new ConflictException('Invoice quantities have already been fully credited.');
      const subtotal = Number(selectedLines.reduce((sum, line) => sum + line.subtotal, 0).toFixed(4));
      const priorCredits = await client.query<{ subtotal: string; tax_total: string }>(
        `SELECT COALESCE(SUM(subtotal),0)::text AS subtotal,COALESCE(SUM(tax_total),0)::text AS tax_total
         FROM sales_credit_notes WHERE company_id=$1 AND invoice_id=$2`,
        [user.companyId, invoiceId],
      );
      const remainingSubtotal = Number((Number(invoice.rows[0].subtotal) - Number(priorCredits.rows[0].subtotal)).toFixed(4));
      const remainingTax = Number((Number(invoice.rows[0].tax_total) - Number(priorCredits.rows[0].tax_total)).toFixed(4));
      if (subtotal <= 0 || subtotal > remainingSubtotal + 0.00005) {
        throw new BadRequestException('Credit subtotal exceeds the invoice amount remaining.');
      }
      const taxTotal = subtotal >= remainingSubtotal - 0.00005
        ? remainingTax
        : Math.min(remainingTax, Number((Number(invoice.rows[0].tax_total) * subtotal / Number(invoice.rows[0].subtotal)).toFixed(4)));
      const grandTotal = Number((subtotal + taxTotal).toFixed(4));
      const creditNumber = await nextDocumentNumber(client, user.companyId, 'AUTO-CN');
      const credit = await client.query<{ id: string }>(
        `INSERT INTO sales_credit_notes(company_id,invoice_id,credit_number,reason,subtotal,tax_total,grand_total,currency_code,stock_returned,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9) RETURNING id`,
        [user.companyId, invoiceId, creditNumber, input.reason.trim(), subtotal, taxTotal, grandTotal,
          invoice.rows[0].currency_code, user.sub],
      );
      let taxAllocated = 0;
      for (const [index, line] of selectedLines.entries()) {
        const lineTax = index === selectedLines.length - 1
          ? Number((taxTotal - taxAllocated).toFixed(4))
          : Number((taxTotal * line.subtotal / subtotal).toFixed(4));
        taxAllocated = Number((taxAllocated + lineTax).toFixed(4));
        await client.query(
          `INSERT INTO sales_credit_note_lines(company_id,credit_note_id,order_line_id,quantity,subtotal,tax_total,grand_total)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [user.companyId, credit.rows[0].id, line.orderLineId, line.quantity, line.subtotal, lineTax,
            Number((line.subtotal + lineTax).toFixed(4))],
        );
      }
      const entryId = await this.createEntryHeader(client, user, 'sales_credit', credit.rows[0].id, `Nota de credito ${creditNumber}`);
      const accounts = await this.getSystemAccounts(client, user.companyId, ['1100', '4100', '2200']);
      if (subtotal > 0) await this.insertLine(client, entryId, accounts['4100'], 'Reversion ingreso', subtotal, 0);
      if (taxTotal > 0) await this.insertLine(client, entryId, accounts['2200'], 'Reversion impuesto', taxTotal, 0);
      await this.insertLine(client, entryId, accounts['1100'], 'Credito a cliente', 0, grandTotal);

      const reservations = await client.query<{ id: string; sales_order_line_id: string | null; product_id: string;
        location_code: string; quantity: string; status: string }>(
        `SELECT id,sales_order_line_id,product_id,location_code,quantity,status FROM inventory_reservations
         WHERE company_id=$1 AND sales_order_id=$2 AND status IN ('reserved','fulfilled')
         ORDER BY product_id,location_code FOR UPDATE`,
        [user.companyId, source.rows[0].order_id],
      );
      for (const reservation of reservations.rows.filter(row => row.status === 'reserved')) {
        const matchingCreditLines = selectedLines.filter(line =>
          reservation.sales_order_line_id
            ? line.orderLineId === reservation.sales_order_line_id
            : line.productId === reservation.product_id &&
              sourceLines.rows.filter(sourceLine => sourceLine.product_id === reservation.product_id).length === 1,
        );
        const creditedQuantity = matchingCreditLines.reduce((sum, line) => sum + line.quantity, 0);
        const releaseQuantity = Math.min(Number(reservation.quantity), creditedQuantity);
        if (releaseQuantity <= 0) continue;
        const balance = await client.query(
          `UPDATE inventory_stock_balances SET reserved=reserved-$1,updated_at=NOW()
           WHERE company_id=$2 AND product_id=$3 AND location_code=$4 AND reserved >= $1 RETURNING id`,
          [releaseQuantity, user.companyId, reservation.product_id, reservation.location_code],
        );
        if (!balance.rows[0]) throw new BadRequestException('Reservation balance is inconsistent.');
        await client.query(
          `UPDATE inventory_reservations SET quantity=quantity-$2,
             status=CASE WHEN quantity=$2 THEN 'released' ELSE 'reserved' END,updated_at=NOW()
           WHERE id=$1`,
          [reservation.id, releaseQuantity],
        );
        await client.query(
          `INSERT INTO inventory_movements(company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by)
           VALUES($1,$2,$3,'reservation_release',$4,'sales_credit',$5,$6,$7)`,
          [user.companyId, reservation.location_code, reservation.product_id, releaseQuantity,
            credit.rows[0].id, input.reason.trim(), user.sub],
        );
      }
      if (input.returnStock) {
        const creditLines = await client.query<{ id: string; order_line_id: string; quantity: string }>(
          `SELECT id,order_line_id,quantity::text FROM sales_credit_note_lines WHERE credit_note_id=$1 ORDER BY id`,
          [credit.rows[0].id],
        );
        const returnLines = creditLines.rows.map(line => ({
          creditNoteLineId: line.id, quantity: Number(line.quantity),
        }));
        const returnDoc = await client.query<{ id: string }>(
          `INSERT INTO sales_credit_stock_returns(company_id,credit_note_id,reference,reason,created_by)
           VALUES($1,$2,$3,$4,$5) RETURNING id`,
          [user.companyId, credit.rows[0].id, `CREDIT-${creditNumber}`, input.reason.trim(), user.sub],
        );
        await this.restoreCreditedStockLines(client, user, credit.rows[0].id, returnDoc.rows[0].id,
          returnLines, input.reason.trim());
      }
      const fullyCredited = Number((subtotal + Number(priorCredits.rows[0].subtotal)).toFixed(4)) >=
        Number(invoice.rows[0].subtotal) - 0.00005;
      if (fullyCredited) {
        await client.query(`UPDATE sales_invoices SET status='void' WHERE id=$1 AND company_id=$2`, [invoiceId, user.companyId]);
        await client.query(`UPDATE sales_orders SET status='cancelled',updated_at=NOW() WHERE id=$1 AND company_id=$2`,
          [source.rows[0].order_id, user.companyId]);
      }
      await this.insertAudit(client, user, 'accounting.sales.credit', credit.rows[0].id, {
        invoice_id: invoiceId, return_stock: input.returnStock, reason: input.reason.trim(),
        subtotal, tax_total: taxTotal, grand_total: grandTotal, lines: selectedLines.length,
      });
      await client.query('COMMIT');
      return { id: credit.rows[0].id, creditNumber, subtotal, taxTotal, grandTotal, fullyCredited };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Credit document reference already exists.');
      throw error;
    } finally { client.release(); }
  }

  async listCredits(user: AuthUser) {
    return (await this.db.query(
      `SELECT cn.id,cn.credit_number,cn.reason,cn.grand_total,cn.currency_code,cn.stock_returned,si.invoice_number,
              EXISTS(SELECT 1 FROM sales_credit_note_lines cnl
                JOIN inventory_reservations ir ON ir.sales_order_line_id=cnl.order_line_id
                  AND ir.company_id=cnl.company_id AND ir.sales_order_id=si.order_id AND ir.status='fulfilled'
                WHERE cnl.credit_note_id=cn.id AND cnl.company_id=cn.company_id
                  AND cnl.quantity>COALESCE((SELECT SUM(srl.quantity) FROM sales_credit_stock_return_lines srl
                    WHERE srl.credit_note_line_id=cnl.id AND srl.company_id=cnl.company_id),0)) AS can_return_stock,
              COALESCE(paid.total,0)::text AS paid_amount,
              GREATEST(0,LEAST(cn.grand_total-COALESCE(refunded.total,0),
                COALESCE(paid.total,0)-COALESCE(refunded_invoice.total,0)))::text AS refund_due
       FROM sales_credit_notes cn JOIN sales_invoices si ON si.id=cn.invoice_id AND si.company_id=cn.company_id
       LEFT JOIN (SELECT invoice_id,SUM(amount) AS total FROM accounting_payments WHERE company_id=$1 GROUP BY invoice_id) paid ON paid.invoice_id=cn.invoice_id
       LEFT JOIN (SELECT credit_note_id,SUM(amount) AS total FROM sales_customer_refunds WHERE company_id=$1 GROUP BY credit_note_id) refunded ON refunded.credit_note_id=cn.id
       LEFT JOIN (SELECT cn2.invoice_id,SUM(r.amount) AS total
                  FROM sales_customer_refunds r JOIN sales_credit_notes cn2
                    ON cn2.id=r.credit_note_id AND cn2.company_id=r.company_id
                  WHERE r.company_id=$1 GROUP BY cn2.invoice_id) refunded_invoice ON refunded_invoice.invoice_id=cn.invoice_id
       WHERE cn.company_id=$1 ORDER BY cn.created_at DESC`, [user.companyId],
    )).rows;
  }

  async returnCreditedStock(user: AuthUser, id: string, input: {
    reference: string; reason: string; lines?: { creditNoteLineId: string; quantity: number }[];
  }) {
    if (!input || typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 64 ||
        typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000 ||
        (input.lines !== undefined && !Array.isArray(input.lines))) {
      throw new BadRequestException('A reference (1 to 64 characters) and reason (10 to 1000) are required.');
    }
    const reference = input.reference.trim(); const reason = input.reason.trim();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const source = await client.query<{ order_id: string }>(
        `SELECT si.order_id FROM sales_credit_notes cn JOIN sales_invoices si ON si.id=cn.invoice_id AND si.company_id=cn.company_id
         WHERE cn.id=$1 AND cn.company_id=$2`, [id, user.companyId],
      );
      if (!source.rows[0]) throw new NotFoundException('Credit not found.');
      await client.query('SELECT id FROM sales_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [source.rows[0].order_id, user.companyId]);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sales-stock-return:${user.companyId}:${reference}`]);
      const prior = await client.query<{ id: string; credit_note_id: string; reason: string }>(
        'SELECT id,credit_note_id,reason FROM sales_credit_stock_returns WHERE company_id=$1 AND reference=$2', [user.companyId, reference],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].credit_note_id !== id || prior.rows[0].reason !== reason) throw new ConflictException('Return reference already used with different data.');
        await client.query('COMMIT'); return { id: prior.rows[0].id, replayed: true };
      }
      await client.query('SELECT id FROM sales_credit_notes WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
      const creditLines = await client.query<{ id: string; quantity: string; returned: string }>(
        `SELECT cnl.id,cnl.quantity::text,COALESCE(SUM(srl.quantity),0)::text AS returned
         FROM sales_credit_note_lines cnl
         LEFT JOIN sales_credit_stock_return_lines srl ON srl.credit_note_line_id=cnl.id AND srl.company_id=cnl.company_id
         WHERE cnl.company_id=$1 AND cnl.credit_note_id=$2
         GROUP BY cnl.id ORDER BY cnl.id`,
        [user.companyId, id],
      );
      const returnLines = input.lines ?? creditLines.rows
        .map(line => ({ creditNoteLineId: line.id, quantity: Number(line.quantity) - Number(line.returned) }))
        .filter(line => line.quantity > 0.00005);
      if (!returnLines.length) throw new ConflictException('All credited quantities have already been returned physically.');
      if (new Set(returnLines.map(line => line.creditNoteLineId)).size !== returnLines.length) {
        throw new BadRequestException('Return creditNoteLineId values must be unique.');
      }
      const document = await client.query<{ id: string }>(
        `INSERT INTO sales_credit_stock_returns(company_id,credit_note_id,reference,reason,created_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.companyId, id, reference, reason, user.sub],
      );
      await this.restoreCreditedStockLines(client, user, id, document.rows[0].id, returnLines, reason);
      await this.insertAudit(client, user, 'accounting.sales.credit.stock.return', document.rows[0].id,
        { credit_note_id: id, reference, reason, lines: returnLines.length });
      await client.query('COMMIT');
      return { id: document.rows[0].id, replayed: false };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async restoreCreditedStockLines(client: DbClient, user: AuthUser, creditId: string, returnId: string,
    lines: { creditNoteLineId: string; quantity: number }[], reason: string) {
    let restoredCost = 0;
    for (const requested of lines) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested.creditNoteLineId) ||
          typeof requested.quantity !== 'number' || !Number.isFinite(requested.quantity) || requested.quantity <= 0 ||
          Math.round(requested.quantity * 10000) / 10000 !== requested.quantity) {
        throw new BadRequestException('Return lines require a valid creditNoteLineId and positive quantity with up to 4 decimals.');
      }
      const creditLine = await client.query<{
        order_line_id: string; product_id: string; quantity: string; returned_for_credit: string;
      }>(
        `SELECT cnl.order_line_id,sol.product_id,cnl.quantity::text,
           COALESCE((SELECT SUM(srl.quantity) FROM sales_credit_stock_return_lines srl
             WHERE srl.company_id=cnl.company_id AND srl.credit_note_line_id=cnl.id),0)::text AS returned_for_credit
         FROM sales_credit_note_lines cnl
         JOIN sales_order_lines sol ON sol.id=cnl.order_line_id
         WHERE cnl.id=$1 AND cnl.company_id=$2 AND cnl.credit_note_id=$3
         FOR UPDATE OF cnl`,
        [requested.creditNoteLineId, user.companyId, creditId],
      );
      if (!creditLine.rows[0]) throw new BadRequestException('Credit note line does not belong to this credit.');
      const orderLineId = creditLine.rows[0].order_line_id;
      const dispatch = await client.query<{ location_code: string; dispatched: string }>(
        `SELECT ir.location_code,COALESCE(SUM(ir.quantity),0)::text AS dispatched
         FROM inventory_reservations ir
         WHERE ir.company_id=$1 AND ir.sales_order_line_id=$2 AND ir.status='fulfilled'
         GROUP BY ir.location_code ORDER BY ir.location_code`,
        [user.companyId, orderLineId],
      );
      const dispatched = dispatch.rows.reduce((sum, row) => sum + Number(row.dispatched), 0);
      const returned = Number(creditLine.rows[0].returned_for_credit);
      const priorReturns = await client.query<{ quantity: string }>(
        `SELECT COALESCE(SUM(srl.quantity),0)::text AS quantity
         FROM sales_credit_stock_return_lines srl
         JOIN sales_credit_note_lines cnl ON cnl.id=srl.credit_note_line_id AND cnl.company_id=srl.company_id
         WHERE cnl.company_id=$1 AND cnl.order_line_id=$2`,
        [user.companyId, orderLineId],
      );
      const previouslyReturned = Number(priorReturns.rows[0].quantity);
      if (requested.quantity > Number(creditLine.rows[0].quantity) - returned + 0.00005 ||
          requested.quantity > dispatched - previouslyReturned + 0.00005) {
        throw new BadRequestException('Physical return quantity exceeds credited or not-yet-returned dispatched quantity.');
      }
      const layers = await client.query<{
        id: string; cost_lot_id: string; quantity: string; unit_cost: string; available: string; location_code: string;
      }>(
        `SELECT dcl.id,dcl.cost_lot_id,dcl.quantity::text,dcl.unit_cost::text,
           (dcl.quantity-COALESCE(SUM(srl.quantity),0))::text AS available,dc.location_code
         FROM inventory_dispatch_cost_layers dcl
         JOIN inventory_dispatch_costs dc ON dc.id=dcl.dispatch_cost_id AND dc.company_id=dcl.company_id
         LEFT JOIN sales_credit_stock_return_lines srl
           ON srl.dispatch_cost_layer_id=dcl.id AND srl.company_id=dcl.company_id
         WHERE dc.company_id=$1 AND dc.sales_order_line_id=$2
         GROUP BY dcl.id,dc.location_code,dcl.created_at
         HAVING dcl.quantity>COALESCE(SUM(srl.quantity),0)
         ORDER BY dcl.created_at,dcl.id`,
        [user.companyId, orderLineId],
      );
      let remaining = requested.quantity;
      let lineCost = 0;
      const allocations: { layerId: string; location: string; quantity: number; unitCost: number; totalCost: number }[] = [];
      for (const layer of layers.rows) {
        if (remaining <= 0.00005) break;
        const quantity = Math.min(remaining, Number(layer.available));
        if (quantity <= 0) continue;
        const unitCost = Number(layer.unit_cost);
        const totalCost = Number((quantity * unitCost).toFixed(4));
        allocations.push({ layerId: layer.id, location: layer.location_code, quantity, unitCost, totalCost });
        lineCost = Number((lineCost + totalCost).toFixed(4));
        remaining = Number((remaining - quantity).toFixed(4));
      }
      if (remaining > 0.00005) {
        throw new BadRequestException('Dispatch cost layers are missing or already fully returned. Reconcile this dispatch before returning goods.');
      }
      const location = allocations[0]?.location;
      if (!location || allocations.some(layer => layer.location !== location)) {
        throw new BadRequestException('A sale line dispatched from multiple locations requires separate stock-return lines.');
      }
      const stock = await client.query(
        `UPDATE inventory_stock_balances SET on_hand=on_hand+$1,updated_at=NOW()
         WHERE company_id=$2 AND product_id=$3 AND location_code=$4 RETURNING id`,
        [requested.quantity, user.companyId, creditLine.rows[0].product_id, location],
      );
      if (!stock.rows[0]) throw new BadRequestException('Original dispatch stock location is missing. Reconcile before returning goods.');
      const unitCost = Number((lineCost / requested.quantity).toFixed(4));
      const movement = await client.query<{ id: string }>(
        `INSERT INTO inventory_movements
          (company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by,
           unit_cost,total_cost,cost_policy,cost_posted,cost_source)
         VALUES($1,$2,$3,'adjustment_in',$4,'sales_credit_stock_return',$5,$6,$7,$8,$9,'returned_dispatch_cost',TRUE,'customer_return')
         RETURNING id`,
        [user.companyId, location, creditLine.rows[0].product_id, requested.quantity, returnId, reason, user.sub,
          unitCost, lineCost],
      );
      for (const allocation of allocations) {
        const costLot = await client.query<{ id: string }>(
          `INSERT INTO inventory_cost_lots
            (company_id,product_id,location_code,quantity_remaining,unit_cost,source_type,source_id)
           VALUES($1,$2,$3,$4,$5,'sales_credit_return',$6) RETURNING id`,
          [user.companyId, creditLine.rows[0].product_id, allocation.location, allocation.quantity,
            allocation.unitCost, returnId],
        );
        await client.query(
          `INSERT INTO sales_credit_stock_return_lines
            (company_id,return_id,credit_note_line_id,inventory_movement_id,dispatch_cost_layer_id,cost_lot_id,
             quantity,unit_cost,total_cost)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [user.companyId, returnId, requested.creditNoteLineId, movement.rows[0].id, allocation.layerId,
            costLot.rows[0].id, allocation.quantity, allocation.unitCost, allocation.totalCost],
        );
      }
      restoredCost = Number((restoredCost + lineCost).toFixed(4));
    }
    if (restoredCost > 0) {
      const accounts = await this.getSystemAccounts(client, user.companyId, ['1200', '5100']);
      const entry = await this.createEntryHeader(client, user, 'sales_credit_stock_return', returnId,
        'Reversion de costo de ventas por devolucion');
      await this.insertLine(client, entry, accounts['1200'], 'Ingreso de inventario devuelto', restoredCost, 0);
      await this.insertLine(client, entry, accounts['5100'], 'Reversion de costo de ventas', 0, restoredCost);
    }
    await client.query(
      `UPDATE sales_credit_notes cn SET stock_returned=NOT EXISTS(
         SELECT 1 FROM sales_credit_note_lines cnl WHERE cnl.credit_note_id=cn.id
           AND cnl.quantity>COALESCE((SELECT SUM(srl.quantity) FROM sales_credit_stock_return_lines srl
             WHERE srl.credit_note_line_id=cnl.id AND srl.company_id=cnl.company_id),0)
       ) WHERE cn.id=$1 AND cn.company_id=$2`,
      [creditId, user.companyId],
    );
  }

  async refundCredit(user: AuthUser, id: string, input: RegisterInvoicePaymentInput) {
    if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 ||
        Math.round(input.amount * 10000) / 10000 !== input.amount || typeof input.paymentReference !== 'string' ||
        !input.paymentReference.trim() || input.paymentReference.length > 64) throw new BadRequestException('Valid reference and positive amount are required.');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const credit = await client.query<{ invoice_id: string; grand_total: string }>(
        'SELECT invoice_id,grand_total::text FROM sales_credit_notes WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId],
      );
      if (!credit.rows[0]) throw new NotFoundException('Credit not found.');
      await client.query('SELECT id FROM sales_invoices WHERE id=$1 AND company_id=$2 FOR UPDATE',
        [credit.rows[0].invoice_id, user.companyId]);
      const balance = await client.query<{ due: string }>(
        `SELECT GREATEST(0,LEAST($4::numeric-
                   (SELECT COALESCE(SUM(amount),0) FROM sales_customer_refunds WHERE company_id=$1 AND credit_note_id=$3),
                 (SELECT COALESCE(SUM(amount),0) FROM accounting_payments WHERE company_id=$1 AND invoice_id=$2)
                   -(SELECT COALESCE(SUM(r.amount),0) FROM sales_customer_refunds r
                     JOIN sales_credit_notes cn ON cn.id=r.credit_note_id AND cn.company_id=r.company_id
                     WHERE r.company_id=$1 AND cn.invoice_id=$2)))::text AS due`,
        [user.companyId, credit.rows[0].invoice_id, id, credit.rows[0].grand_total],
      );
      if (input.amount > Number(balance.rows[0].due)) throw new BadRequestException('Refund exceeds amount actually paid by the customer.');
      const refund = await client.query<{ id: string }>(
        `INSERT INTO sales_customer_refunds(company_id,credit_note_id,reference,amount,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [user.companyId, id, input.paymentReference.trim(), input.amount, user.sub],
      );
      const accounts = await this.getSystemAccounts(client, user.companyId, ['1100', '1110']);
      const entry = await this.createEntryHeader(client, user, 'customer_refund', refund.rows[0].id, 'Reembolso confirmado al cliente');
      await this.insertLine(client, entry, accounts['1100'], 'Compensacion saldo a favor', input.amount, 0);
      await this.insertLine(client, entry, accounts['1110'], 'Salida de caja/bancos', 0, input.amount);
      await this.insertAudit(client, user, 'accounting.customer.refund', refund.rows[0].id, { credit_note_id: id, amount: input.amount });
      await client.query('COMMIT');
      return { id: refund.rows[0].id };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Refund reference already registered.');
      throw error;
    } finally { client.release(); }
  }

  async bootstrapDefaultAccounts(user: AuthUser) {
    const defaults: Array<{ code: SystemAccountCode; name: string; type: string }> = [
      { code: '1100', name: 'Cuentas por cobrar', type: 'asset' },
      { code: '1110', name: 'Caja y bancos', type: 'asset' },
      { code: '1200', name: 'Inventario', type: 'asset' },
      { code: '1300', name: 'Credito fiscal', type: 'asset' },
      { code: '2100', name: 'Cuentas por pagar', type: 'liability' },
      { code: '2200', name: 'IVA por pagar', type: 'liability' },
      { code: '4100', name: 'Ingresos por ventas', type: 'revenue' },
      { code: '5100', name: 'Costo de ventas', type: 'expense' },
    ];
    const created: string[] = [];
    for (const account of defaults) {
      const inserted = await this.db.query<{ code: string }>(
        `INSERT INTO accounting_accounts (company_id, code, name, account_type, is_system)
         VALUES ($1,$2,$3,$4,TRUE)
         ON CONFLICT (company_id, code) DO NOTHING
         RETURNING code`,
        [user.companyId, account.code, account.name, account.type],
      );
      if (inserted.rows[0]) {
        created.push(inserted.rows[0].code);
      }
    }
    await this.insertAuditDirect(user, 'accounting.chart.bootstrap', user.companyId, { created_count: created.length });
    return { companyId: user.companyId, createdCount: created.length, createdCodes: created };
  }

  async postSalesInvoice(user: AuthUser, invoiceId: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const invoice = await client.query<{
        id: string;
        status: string;
        subtotal: string;
        tax_total: string;
        grand_total: string;
      }>(
        `SELECT id, status, subtotal, tax_total, grand_total
         FROM sales_invoices
         WHERE id = $1 AND company_id = $2
         LIMIT 1 FOR UPDATE`,
        [invoiceId, user.companyId],
      );
      if (!invoice.rows[0]) {
        throw new NotFoundException('Invoice not found.');
      }
      if (invoice.rows[0].status === 'void') {
        throw new BadRequestException('Void invoice cannot be posted.');
      }
      await this.assertNoExistingSourceEntry(client, user.companyId, 'sales_invoice', invoiceId);

      const accounts = await this.getSystemAccounts(client, user.companyId, ['1100', '2200', '4100']);
      const entryId = await this.createEntryHeader(
        client,
        user,
        'sales_invoice',
        invoiceId,
        `Posteo contable de factura ${invoiceId}`,
      );
      const subtotal = Number(invoice.rows[0].subtotal);
      const taxTotal = Number(invoice.rows[0].tax_total);
      const grandTotal = Number(invoice.rows[0].grand_total);
      await this.insertLine(client, entryId, accounts['1100'], 'Cuenta por cobrar', grandTotal, 0);
      await this.insertLine(client, entryId, accounts['4100'], 'Ingreso por ventas', 0, subtotal);
      if (taxTotal > 0) {
        await this.insertLine(client, entryId, accounts['2200'], 'IVA por pagar', 0, taxTotal);
      }

      await this.insertAudit(
        client,
        user,
        'accounting.sales.invoice.posted',
        invoiceId,
        { entry_id: entryId, grand_total: grandTotal },
      );
      await client.query('COMMIT');
      return { invoiceId, journalEntryId: entryId, status: 'posted' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async registerInvoicePayment(user: AuthUser, invoiceId: string, input: RegisterInvoicePaymentInput) {
    if (typeof input.paymentReference !== 'string' || !input.paymentReference.trim()) {
      throw new BadRequestException('paymentReference is required.');
    }
    if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 ||
        Math.round(input.amount * 10000) / 10000 !== input.amount) {
      throw new BadRequestException('amount must be positive with at most 4 decimals.');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const invoice = await client.query<{ id: string; status: string; grand_total: string; currency_code: string | null }>(
        `SELECT i.id, i.status, i.grand_total, i.currency_code
         FROM sales_invoices i
         WHERE i.id = $1 AND i.company_id = $2
         LIMIT 1
         FOR UPDATE`,
        [invoiceId, user.companyId],
      );
      if (!invoice.rows[0]) {
        throw new NotFoundException('Invoice not found.');
      }
      if (invoice.rows[0].status === 'void') {
        throw new BadRequestException('Cannot pay a void invoice.');
      }
      await this.assertSourceEntryExists(client, user.companyId, 'sales_invoice', invoiceId);
      const amounts = await this.resolvePaymentAmounts(client, user.companyId, invoice.rows[0].currency_code, input);

      const balance = await client.query<{ remaining: string; remaining_after: string; has_balance: boolean; fits: boolean; settles: boolean }>(
        `SELECT remaining::text, (remaining - $3::numeric)::text AS remaining_after,
                remaining > 0 AS has_balance, $3::numeric <= remaining AS fits, $3::numeric = remaining AS settles
         FROM (
           SELECT i.grand_total - COALESCE(SUM(p.amount), 0) AS remaining
           FROM sales_invoices i
           LEFT JOIN accounting_payments p ON p.company_id = i.company_id AND p.invoice_id = i.id
           WHERE i.company_id = $1 AND i.id = $2
           GROUP BY i.id
         ) balance`,
        [user.companyId, invoiceId, amounts.amountInDocumentCurrency],
      );
      const { remaining, remaining_after: newRemaining, has_balance: hasBalance, fits, settles } = balance.rows[0];
      if (!hasBalance) {
        throw new BadRequestException('Invoice is already fully paid.');
      }
      if (!fits) {
        throw new BadRequestException(`Payment amount exceeds remaining balance (${remaining} ${amounts.documentCurrencyCode}).`);
      }

      const paymentInsert = await client.query<{ id: string }>(
        `INSERT INTO accounting_payments
           (company_id, invoice_id, payment_reference, amount, payment_currency_code, exchange_rate, amount_base, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'registered',$8)
         RETURNING id`,
        [
          user.companyId,
          invoiceId,
          input.paymentReference.trim(),
          amounts.amountInDocumentCurrency,
          amounts.paymentCurrencyCode,
          amounts.exchangeRate,
          amounts.amountInBaseCurrency,
          user.sub,
        ],
      );
      if (!paymentInsert.rows[0]) {
        throw new BadRequestException('Could not register payment.');
      }
      const paymentId = paymentInsert.rows[0].id;

      const accounts = await this.getSystemAccounts(client, user.companyId, ['1100', '1110']);
      const entryId = await this.createEntryHeader(
        client,
        user,
        'invoice_payment',
        paymentId,
        `Registro de pago ${input.paymentReference}`,
      );
      await this.insertLine(client, entryId, accounts['1110'], 'Ingreso a caja/bancos', amounts.amountInBaseCurrency, 0);
      await this.insertLine(client, entryId, accounts['1100'], 'Disminucion de cuenta por cobrar', 0, amounts.amountInBaseCurrency);

      await client.query(
        `INSERT INTO accounting_reconciliations (company_id, invoice_id, payment_id, amount)
         VALUES ($1,$2,$3,$4)`,
        [user.companyId, invoiceId, paymentId, amounts.amountInDocumentCurrency],
      );
      await client.query(`UPDATE accounting_payments SET status = 'reconciled' WHERE id = $1`, [paymentId]);

      if (settles) {
        await client.query(`UPDATE sales_invoices SET status = 'paid' WHERE id = $1`, [invoiceId]);
      }

      await this.insertAudit(client, user, 'accounting.invoice.payment.registered', paymentId, {
        invoice_id: invoiceId,
        amount_document_currency: amounts.amountInDocumentCurrency,
        amount_base_currency: amounts.amountInBaseCurrency,
        payment_currency_code: amounts.paymentCurrencyCode,
        document_currency_code: amounts.documentCurrencyCode,
        base_currency_code: amounts.baseCurrencyCode,
        exchange_rate: amounts.exchangeRate,
        remaining: Number(newRemaining),
      });
      await client.query('COMMIT');
      return {
        invoiceId,
        paymentId,
        paymentReference: input.paymentReference.trim(),
        amount: amounts.amountInDocumentCurrency,
        amountBase: amounts.amountInBaseCurrency,
        paymentCurrencyCode: amounts.paymentCurrencyCode,
        documentCurrencyCode: amounts.documentCurrencyCode,
        baseCurrencyCode: amounts.baseCurrencyCode,
        exchangeRate: amounts.exchangeRate,
        remainingBalance: Number(newRemaining),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (String(error).includes('accounting_payments_company_id_payment_reference_key')) {
        throw new ConflictException('paymentReference already exists for this company.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async postPurchaseOrderAccrual(user: AuthUser, purchaseOrderId: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const po = await client.query<{ id: string; status: string; subtotal: string; tax_total: string; grand_total: string }>(
        `SELECT id, status, subtotal, tax_total, grand_total
         FROM purchase_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1 FOR UPDATE`,
        [purchaseOrderId, user.companyId],
      );
      if (!po.rows[0]) {
        throw new NotFoundException('Purchase order not found.');
      }
      if (po.rows[0].status !== 'received') {
        throw new BadRequestException('Only received purchase orders can be posted.');
      }
      await this.assertNoExistingSourceEntry(client, user.companyId, 'purchase_order', purchaseOrderId);

      const accounts = await this.getSystemAccounts(client, user.companyId, ['1200', '1300', '2100']);
      const entryId = await this.createEntryHeader(
        client,
        user,
        'purchase_order',
        purchaseOrderId,
        `Posteo contable de compra ${purchaseOrderId}`,
      );
      const subtotal = Number(po.rows[0].subtotal);
      const taxTotal = Number(po.rows[0].tax_total);
      const grandTotal = Number(po.rows[0].grand_total);
      await this.insertLine(client, entryId, accounts['1200'], 'Inventario recibido', subtotal, 0);
      if (taxTotal > 0) {
        await this.insertLine(client, entryId, accounts['1300'], 'Credito fiscal de compra', taxTotal, 0);
      }
      await this.insertLine(client, entryId, accounts['2100'], 'Cuenta por pagar a proveedor', 0, grandTotal);

      await this.insertAudit(
        client,
        user,
        'accounting.purchase.order.posted',
        purchaseOrderId,
        { entry_id: entryId, grand_total: grandTotal },
      );
      await client.query('COMMIT');
      return { purchaseOrderId, journalEntryId: entryId, status: 'posted' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async returnToSupplier(user: AuthUser, id: string, input: QuantityDocument & { reason: string }) {
    const document = normalizeQuantityDocument(input);
    if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) {
      throw new BadRequestException('A return reason of 10 to 1000 characters is required.');
    }
    const payload = { orderId: id.toLowerCase(), reason: input.reason.trim(), lines: document.lines };
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query<{ status: string }>(
        'SELECT status FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId],
      );
      if (!order.rows[0]) throw new NotFoundException('Purchase order not found.');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`supplier-return:${user.companyId}:${document.reference}`]);
      const prior = await client.query<{ id: string; same: boolean }>(
        'SELECT id,payload=$3::jsonb AS same FROM purchase_supplier_returns WHERE company_id=$1 AND reference=$2',
        [user.companyId, document.reference, JSON.stringify(payload)],
      );
      if (prior.rows[0]) {
        if (!prior.rows[0].same) throw new ConflictException('Return reference already used with different data.');
        await client.query('COMMIT'); return { returnId: prior.rows[0].id, replayed: true };
      }
      if (order.rows[0].status !== 'received') throw new BadRequestException('Complete and post the purchase before returning goods.');
      await this.assertSourceEntryExists(client, user.companyId, 'purchase_order', id);
      const created = await client.query<{ id: string }>(
        `INSERT INTO purchase_supplier_returns(company_id,purchase_order_id,reference,reason,payload,created_by)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [user.companyId, id, document.reference, payload.reason, JSON.stringify(payload), user.sub],
      );
      const rows = await client.query<{ id: string; product_id: string; location_code: string; order_line_id: string }>(
        `SELECT rl.id,l.product_id,rl.location_code,rl.order_line_id FROM purchase_receipt_lines rl
         JOIN purchase_receipts r ON r.id=rl.receipt_id JOIN purchase_order_lines l ON l.id=rl.order_line_id
         WHERE r.company_id=$1 AND r.purchase_order_id=$2 AND rl.id=ANY($3::uuid[]) ORDER BY l.product_id,rl.location_code,rl.id`,
        [user.companyId, id, document.lines.map(line => line.lineId)],
      );
      if (rows.rows.length !== document.lines.length) throw new BadRequestException('Receipt line does not belong to this purchase or has no reconciled batch history.');
      for (const row of rows.rows) {
        const quantity = document.lines.find(line => line.lineId === row.id)!.quantity;
        const allowance = await client.query<{ valid: boolean }>(
          `SELECT rl.quantity-COALESCE((SELECT SUM(quantity) FROM purchase_supplier_return_lines WHERE receipt_line_id=rl.id),0)>=$2::numeric AS valid
           FROM purchase_receipt_lines rl WHERE rl.id=$1`, [row.id, quantity],
        );
        if (!allowance.rows[0].valid) throw new ConflictException('Return exceeds the unreturned receipt quantity.');
        const costLots = await client.query<{ id: string; quantity_remaining: string; unit_cost: string }>(
          `SELECT id,quantity_remaining::text,unit_cost::text
           FROM inventory_cost_lots
           WHERE company_id=$1 AND purchase_receipt_line_id=$2 AND quantity_remaining>0
           ORDER BY source_at,id
           FOR UPDATE`,
          [user.companyId, row.id],
        );
        const valuedAvailable = costLots.rows.reduce((sum, lot) => sum + Number(lot.quantity_remaining), 0);
        if (valuedAvailable + 0.00005 < quantity) {
          throw new BadRequestException('Returned receipt quantity has no matching valued cost layer. Reconcile inventory before returning it.');
        }
        const stock = await client.query(
          `UPDATE inventory_stock_balances SET on_hand=on_hand-$1,updated_at=NOW()
           WHERE company_id=$2 AND product_id=$3 AND location_code=$4 AND on_hand-reserved>=$1 RETURNING id`,
          [quantity, user.companyId, row.product_id, row.location_code],
        );
        if (!stock.rows[0]) throw new BadRequestException('Insufficient available stock at the original receipt location. Reserved stock cannot be returned.');
        let costQuantityRemaining = quantity;
        let returnedCost = 0;
        for (const lot of costLots.rows) {
          if (costQuantityRemaining <= 0.00005) break;
          const allocated = Math.min(costQuantityRemaining, Number(lot.quantity_remaining));
          const layerCost = Number((allocated * Number(lot.unit_cost)).toFixed(4));
          returnedCost = Number((returnedCost + layerCost).toFixed(4));
          costQuantityRemaining = Number((costQuantityRemaining - allocated).toFixed(4));
          await client.query(
            `UPDATE inventory_cost_lots SET quantity_remaining=quantity_remaining-$1
             WHERE id=$2 AND company_id=$3 AND quantity_remaining >= $1`,
            [allocated, lot.id, user.companyId],
          );
        }
        await client.query(
          `INSERT INTO purchase_supplier_return_lines(return_id,receipt_line_id,quantity,subtotal)
           SELECT $1,$2,$3,
             ROUND(l.line_total*(COALESCE(ret.quantity,0)+$3::numeric)/l.quantity,4)
             -ROUND(l.line_total*COALESCE(ret.quantity,0)/l.quantity,4)
           FROM purchase_order_lines l LEFT JOIN (
             SELECT SUM(ret.quantity) quantity FROM purchase_supplier_return_lines ret
             JOIN purchase_receipt_lines rl ON rl.id=ret.receipt_line_id WHERE rl.order_line_id=$4
           ) ret ON TRUE WHERE l.id=$4`, [created.rows[0].id, row.id, quantity, row.order_line_id],
        );
        const returnMovement = await client.query<{ id: string }>(
          `INSERT INTO inventory_movements(company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by)
           VALUES($1,$2,$3,'supplier_return',$4,'supplier_return',$5,$6,$7) RETURNING id`,
          [user.companyId, row.location_code, row.product_id, quantity, created.rows[0].id, payload.reason, user.sub],
        );
        await client.query(
          `UPDATE inventory_movements SET unit_cost=$1,total_cost=$2,cost_policy='receipt',cost_source='supplier_return'
           WHERE id=$3`,
          [Number((returnedCost / quantity).toFixed(4)), returnedCost.toFixed(4), returnMovement.rows[0].id],
        );
      }
      const amounts = await client.query<{ subtotal: string; tax_total: string; grand_total: string }>(
        `WITH amounts AS (
           SELECT COALESCE(SUM(subtotal),0) subtotal FROM purchase_supplier_return_lines WHERE return_id=$1
         ), previous AS (
           SELECT COALESCE(SUM(subtotal),0) subtotal,COALESCE(SUM(tax_total),0) tax_total
           FROM purchase_supplier_returns WHERE purchase_order_id=$2 AND company_id=$3 AND id<>$1
         ), totals AS (
           SELECT a.subtotal,CASE WHEN po.subtotal=0 THEN 0
             ELSE ROUND(po.tax_total*(p.subtotal+a.subtotal)/po.subtotal,4)-p.tax_total END tax_total
           FROM amounts a CROSS JOIN previous p JOIN purchase_orders po ON po.id=$2
         )
         UPDATE purchase_supplier_returns r SET subtotal=t.subtotal,tax_total=t.tax_total,grand_total=t.subtotal+t.tax_total
         FROM totals t WHERE r.id=$1 RETURNING r.subtotal,r.tax_total,r.grand_total`,
        [created.rows[0].id, id, user.companyId],
      );
      const amount = amounts.rows[0];
      if (Number(amount.grand_total) > 0) {
        const accounts = await this.getSystemAccounts(client, user.companyId, ['1200', '1300', '2100']);
        const entry = await this.createEntryHeader(client, user, 'supplier_return', created.rows[0].id, `Devolucion proveedor ${document.reference}`);
        await this.insertLine(client, entry, accounts['2100'], 'Credito comercial del proveedor', amount.grand_total, 0);
        if (Number(amount.subtotal) > 0) await this.insertLine(client, entry, accounts['1200'], 'Salida de inventario devuelto', 0, amount.subtotal);
        if (Number(amount.tax_total) > 0) await this.insertLine(client, entry, accounts['1300'], 'Reversion proporcional credito fiscal', 0, amount.tax_total);
      }
      await this.insertAudit(client, user, 'accounting.supplier.return', created.rows[0].id, { ...payload, ...amount });
      await client.query('COMMIT');
      return { returnId: created.rows[0].id, ...amount, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === 'P0001') throw new BadRequestException('Accounting period is closed.');
      throw error;
    } finally { client.release(); }
  }

    async listPayables(user: AuthUser) {
      return (await this.db.query(
        `SELECT po.id,po.order_number,s.name AS supplier_name,po.grand_total,po.status,
                COALESCE(paid.total,0)::text AS total_paid,
                COALESCE(returned.total,0)::text AS total_returned,
                COALESCE(refunded.total,0)::text AS total_refunded,
                (po.grand_total-COALESCE(paid.total,0)-COALESCE(returned.total,0)+COALESCE(refunded.total,0))::text AS balance_due,
                EXISTS(SELECT 1 FROM accounting_journal_entries je WHERE je.company_id=po.company_id
                  AND je.source_type='purchase_order' AND je.source_id=po.id AND je.status='posted') AS is_posted
         FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id AND s.company_id=po.company_id
         LEFT JOIN (SELECT purchase_order_id,SUM(amount) AS total FROM accounting_supplier_payments
                    WHERE company_id=$1 GROUP BY purchase_order_id) paid ON paid.purchase_order_id=po.id
         LEFT JOIN (SELECT purchase_order_id,SUM(grand_total) AS total FROM purchase_supplier_returns
                    WHERE company_id=$1 GROUP BY purchase_order_id) returned ON returned.purchase_order_id=po.id
         LEFT JOIN (SELECT purchase_order_id,SUM(amount) AS total FROM accounting_supplier_refunds
                    WHERE company_id=$1 GROUP BY purchase_order_id) refunded ON refunded.purchase_order_id=po.id
         WHERE po.company_id=$1 AND po.status<>'cancelled' ORDER BY po.created_at DESC`, [user.companyId],
      )).rows;
    }

  async supplierRefundHistory(user: AuthUser, id: string) {
    const order = await this.db.query('SELECT id FROM purchase_orders WHERE id=$1 AND company_id=$2', [id, user.companyId]);
    if (!order.rows[0]) throw new NotFoundException('Purchase order not found.');
    return (await this.db.query(
      `SELECT id,reference,amount,reason,created_at FROM accounting_supplier_refunds
       WHERE company_id=$1 AND purchase_order_id=$2 ORDER BY created_at DESC,id`, [user.companyId, id],
    )).rows;
  }

  async receiveSupplierRefund(user: AuthUser, id: string, input: { reference: string; amount: number; reason: string }) {
    if (!input || typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 64 ||
        typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1e9 ||
        Math.round(input.amount * 10000) / 10000 !== input.amount ||
        typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) {
      throw new BadRequestException('A reference, positive amount (up to 4 decimals) and reason of 10 to 1000 characters are required.');
    }
    const reference = input.reference.trim(); const reason = input.reason.trim();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query<{ status: string }>(
        'SELECT status FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId],
      );
      if (!order.rows[0]) throw new NotFoundException('Purchase order not found.');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`supplier-refund:${user.companyId}:${reference}`]);
      const prior = await client.query<{ id: string; same: boolean }>(
        `SELECT id,(purchase_order_id=$3 AND amount=$4::numeric AND reason=$5) AS same
         FROM accounting_supplier_refunds WHERE company_id=$1 AND reference=$2`,
        [user.companyId, reference, id, input.amount, reason],
      );
      if (prior.rows[0]) {
        if (!prior.rows[0].same) throw new ConflictException('Refund reference already used with different data.');
        await client.query('COMMIT'); return { refundId: prior.rows[0].id, replayed: true };
      }
      if (order.rows[0].status !== 'received') throw new BadRequestException('Only completed and posted purchases can receive supplier refunds.');
      await this.assertSourceEntryExists(client, user.companyId, 'purchase_order', id);
      const balance = await client.query<{ valid: boolean }>(
        `SELECT (
          (SELECT COALESCE(SUM(amount),0) FROM accounting_supplier_payments WHERE company_id=$1 AND purchase_order_id=$2)
          +(SELECT COALESCE(SUM(grand_total),0) FROM purchase_supplier_returns WHERE company_id=$1 AND purchase_order_id=$2)
          -po.grand_total
          -(SELECT COALESCE(SUM(amount),0) FROM accounting_supplier_refunds WHERE company_id=$1 AND purchase_order_id=$2)
        ) >= $3::numeric AS valid FROM purchase_orders po WHERE po.id=$2 AND po.company_id=$1`,
        [user.companyId, id, input.amount],
      );
      if (!balance.rows[0].valid) throw new BadRequestException('Refund exceeds outstanding supplier credit. Do not register money not actually received.');
      const refund = await client.query<{ id: string }>(
        `INSERT INTO accounting_supplier_refunds(company_id,purchase_order_id,reference,amount,reason,created_by)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [user.companyId, id, reference, input.amount, reason, user.sub],
      );
      const accounts = await this.getSystemAccounts(client, user.companyId, ['1110', '2100']);
      const entry = await this.createEntryHeader(client, user, 'supplier_refund', refund.rows[0].id, `Reembolso recibido de proveedor ${reference}`);
      await this.insertLine(client, entry, accounts['1110'], 'Ingreso confirmado caja/bancos', input.amount, 0);
      await this.insertLine(client, entry, accounts['2100'], 'Compensacion credito de proveedor', 0, input.amount);
      await this.insertAudit(client, user, 'accounting.supplier.refund', refund.rows[0].id, { purchase_order_id: id, reference, amount: input.amount, reason });
      await client.query('COMMIT');
      return { refundId: refund.rows[0].id, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === 'P0001') throw new BadRequestException('Accounting period is closed.');
      throw error;
    } finally { client.release(); }
  }

    async paySupplier(user: AuthUser, id: string, input: RegisterInvoicePaymentInput) {
      if (typeof input.paymentReference !== 'string' || !input.paymentReference.trim() || input.paymentReference.length > 64 ||
          typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 ||
          Math.round(input.amount * 10000) / 10000 !== input.amount) {
        throw new BadRequestException('A reference and positive amount with at most 4 decimals are required.');
      }
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        const order = await client.query<{ grand_total: string; status: string; currency_code: string | null }>(
          'SELECT grand_total,status,currency_code FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId],
        );
        if (!order.rows[0]) throw new NotFoundException('Purchase order not found.');
        if (order.rows[0].status !== 'received') throw new BadRequestException('Only received and posted purchases can be paid.');
        await this.assertSourceEntryExists(client, user.companyId, 'purchase_order', id);
        const amounts = await this.resolvePaymentAmounts(client, user.companyId, order.rows[0].currency_code, input);
        const paid = await client.query<{ total: string }>(
          `SELECT ((SELECT COALESCE(SUM(amount),0) FROM accounting_supplier_payments WHERE company_id=$1 AND purchase_order_id=$2)
            +(SELECT COALESCE(SUM(grand_total),0) FROM purchase_supplier_returns WHERE company_id=$1 AND purchase_order_id=$2)
            -(SELECT COALESCE(SUM(amount),0) FROM accounting_supplier_refunds WHERE company_id=$1 AND purchase_order_id=$2))::text AS total`,
          [user.companyId, id],
        );
        const remaining = Number((Number(order.rows[0].grand_total) - Number(paid.rows[0].total)).toFixed(4));
        if (amounts.amountInDocumentCurrency > remaining) throw new BadRequestException('Payment exceeds remaining payable.');
        const payment = await client.query<{ id: string }>(
          `INSERT INTO accounting_supplier_payments
            (company_id,purchase_order_id,payment_reference,amount,payment_currency_code,exchange_rate,amount_base,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            user.companyId,
            id,
            input.paymentReference.trim(),
            amounts.amountInDocumentCurrency,
            amounts.paymentCurrencyCode,
            amounts.exchangeRate,
            amounts.amountInBaseCurrency,
            user.sub,
          ],
        );
        const accounts = await this.getSystemAccounts(client, user.companyId, ['1110', '2100']);
        const entryId = await this.createEntryHeader(client, user, 'supplier_payment', payment.rows[0].id, `Pago proveedor ${input.paymentReference.trim()}`);
        await this.insertLine(client, entryId, accounts['2100'], 'Disminucion de cuenta por pagar', amounts.amountInBaseCurrency, 0);
        await this.insertLine(client, entryId, accounts['1110'], 'Egreso caja/bancos', 0, amounts.amountInBaseCurrency);
        await this.insertAudit(client, user, 'accounting.supplier.payment', payment.rows[0].id, {
          purchase_order_id: id,
          amount_document_currency: amounts.amountInDocumentCurrency,
          amount_base_currency: amounts.amountInBaseCurrency,
          payment_currency_code: amounts.paymentCurrencyCode,
          document_currency_code: amounts.documentCurrencyCode,
          base_currency_code: amounts.baseCurrencyCode,
          exchange_rate: amounts.exchangeRate,
        });
        await client.query('COMMIT');
        return {
          paymentId: payment.rows[0].id,
          remainingBalance: Number((remaining - amounts.amountInDocumentCurrency).toFixed(4)),
          amount: amounts.amountInDocumentCurrency,
          amountBase: amounts.amountInBaseCurrency,
          paymentCurrencyCode: amounts.paymentCurrencyCode,
          documentCurrencyCode: amounts.documentCurrencyCode,
          baseCurrencyCode: amounts.baseCurrencyCode,
          exchangeRate: amounts.exchangeRate,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505') throw new ConflictException('Payment reference already registered.');
        if ((error as { code?: string }).code === 'P0001') throw new BadRequestException('Accounting period is closed.');
        throw error;
      } finally { client.release(); }
    }

    async listPeriods(user: AuthUser) {
      return (await this.db.query(
        `SELECT period_year,period_month,status,closed_at,reopened_at,reopen_reason
         FROM accounting_period_closures WHERE company_id=$1 ORDER BY period_year DESC,period_month DESC`, [user.companyId],
      )).rows;
    }

    async reopenPeriod(user: AuthUser, input: ClosePeriodInput & { reason: string }) {
      if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 9999 ||
          !Number.isInteger(input.month) || input.month < 1 || input.month > 12 ||
          typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) {
        throw new BadRequestException('Valid year/month and a reason of 10 to 1000 characters are required.');
      }
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accounting-period:${user.companyId}`]);
        const result = await client.query<{ id: string }>(
          `UPDATE accounting_period_closures SET status='reopened',reopened_by=$1,reopened_at=NOW(),reopen_reason=$2
           WHERE company_id=$3 AND period_year=$4 AND period_month=$5 AND status='closed' RETURNING id`,
          [user.sub, input.reason.trim(), user.companyId, input.year, input.month],
        );
        if (!result.rows[0]) throw new BadRequestException('Closed period not found.');
        await this.insertAudit(client, user, 'accounting.period.reopened', result.rows[0].id, { reason: input.reason.trim(), year: input.year, month: input.month });
        await client.query('COMMIT');
        return { status: 'reopened' };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
  async getTrialBalance(user: AuthUser, fromDate?: string, toDate?: string) {
    for (const [field, value] of [['fromDate', fromDate], ['toDate', toDate]] as const) {
      if (value !== undefined && value !== '') {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') ||
            !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
          throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date.`);
        }
      }
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('fromDate must not be later than toDate.');
    }
    const params: unknown[] = [user.companyId];
    let dateFilter = '';
    if (fromDate) {
      params.push(fromDate);
      dateFilter += ` AND je.entry_date >= $${params.length}`;
    }
    if (toDate) {
      params.push(toDate);
      dateFilter += ` AND je.entry_date <= $${params.length}`;
    }
    const rows = await this.db.query<{
      account_code: string;
      account_name: string;
      account_type: string;
      debit: string;
      credit: string;
      balance: string;
    }>(
      `SELECT a.code AS account_code,
              a.name AS account_name,
              a.account_type,
              COALESCE(SUM(jl.debit), 0)::text AS debit,
              COALESCE(SUM(jl.credit), 0)::text AS credit,
              COALESCE(SUM(jl.debit - jl.credit), 0)::text AS balance
       FROM accounting_accounts a
       LEFT JOIN (
         SELECT line.account_id, line.debit, line.credit
         FROM accounting_journal_lines line
         JOIN accounting_journal_entries je ON je.id = line.journal_entry_id
         WHERE je.company_id = $1 AND je.status = 'posted' ${dateFilter}
       ) jl ON jl.account_id = a.id
       WHERE a.company_id = $1
       GROUP BY a.code, a.name, a.account_type
       ORDER BY a.code ASC`,
      params,
    );
    const totals = rows.rows.reduce(
      (acc, row) => {
        acc.totalDebit += Number(row.debit);
        acc.totalCredit += Number(row.credit);
        return acc;
      },
      { totalDebit: 0, totalCredit: 0 },
    );
    await this.insertAuditDirect(user, 'accounting.report.trial_balance', user.companyId, {
      from_date: fromDate ?? null,
      to_date: toDate ?? null,
      rows: rows.rows.length,
    });
    return {
      rows: rows.rows,
      totals: {
        totalDebit: Number(totals.totalDebit.toFixed(4)),
        totalCredit: Number(totals.totalCredit.toFixed(4)),
        isBalanced: Math.abs(totals.totalDebit - totals.totalCredit) < 0.0001,
      },
    };
  }

  async closePeriod(user: AuthUser, input: ClosePeriodInput) {
    if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 9999) {
      throw new BadRequestException('year must be >= 2000.');
    }
    if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
      throw new BadRequestException('month must be between 1 and 12.');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accounting-period:${user.companyId}`]);
      const unbalanced = await client.query<{ unbalanced_count: string }>(
      `SELECT COUNT(*)::text AS unbalanced_count
       FROM (
         SELECT je.id
         FROM accounting_journal_entries je
         JOIN accounting_journal_lines jl ON jl.journal_entry_id = je.id
         WHERE je.company_id = $1
           AND je.status = 'posted'
           AND EXTRACT(YEAR FROM je.entry_date) = $2
           AND EXTRACT(MONTH FROM je.entry_date) = $3
         GROUP BY je.id
         HAVING ABS(SUM(jl.debit) - SUM(jl.credit)) > 0.0001
       ) t`,
      [user.companyId, input.year, input.month],
    );
    if (Number(unbalanced.rows[0].unbalanced_count) > 0) {
      throw new BadRequestException('Cannot close period with unbalanced journal entries.');
    }
      const result = await client.query<{ id: string }>(
        `INSERT INTO accounting_period_closures (company_id, period_year, period_month, closed_by)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT(company_id,period_year,period_month) DO UPDATE
         SET status='closed',closed_by=EXCLUDED.closed_by,closed_at=NOW()
         WHERE accounting_period_closures.status='reopened'
         RETURNING id`,
        [user.companyId, input.year, input.month, user.sub],
      );
      if (!result.rows[0]) throw new ConflictException('Period is already closed.');
      await this.insertAudit(client, user, 'accounting.period.closed', result.rows[0].id, {
        year: input.year,
        month: input.month,
      });
      await client.query('COMMIT');
      return { id: result.rows[0].id, year: input.year, month: input.month, status: 'closed' };
    } catch (error) {
      await client.query('ROLLBACK');
      if (String(error).includes('accounting_period_closures_company_id_period_year_period_month_key')) {
        throw new ConflictException('Period is already closed.');
      }
      throw error;
    } finally { client.release(); }
  }

  private async createEntryHeader(
    client: DbClient,
    user: AuthUser,
    sourceType: string,
    sourceId: string,
    description: string,
  ) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accounting-period:${user.companyId}`]);
    const closed = await client.query(
      `SELECT id FROM accounting_period_closures WHERE company_id=$1 AND status='closed'
       AND period_year=EXTRACT(YEAR FROM CURRENT_DATE) AND period_month=EXTRACT(MONTH FROM CURRENT_DATE)`, [user.companyId],
    );
    if (closed.rows[0]) throw new BadRequestException('Accounting period is closed.');
    const entryNumber = await this.generateEntryNumber(client, user.companyId);
    const entry = await client.query<{ id: string }>(
      `INSERT INTO accounting_journal_entries
        (company_id, entry_number, source_type, source_id, description, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'posted',$6)
       RETURNING id`,
      [user.companyId, entryNumber, sourceType, sourceId, description, user.sub],
    );
    if (!entry.rows[0]) {
      throw new BadRequestException('Could not create journal entry.');
    }
    return entry.rows[0].id;
  }

  private async generateEntryNumber(client: DbClient, companyId: string) {
    return nextDocumentNumber(client, companyId, 'AUTO-JE');
  }

  private async insertLine(
    client: DbClient,
    entryId: string,
    accountId: string,
    lineDescription: string,
    debit: number | string,
    credit: number | string,
  ) {
    await client.query(
      `INSERT INTO accounting_journal_lines (journal_entry_id, account_id, line_description, debit, credit)
       VALUES ($1,$2,$3,$4,$5)`,
      [entryId, accountId, lineDescription, debit, credit],
    );
  }

  private async getSystemAccounts(client: DbClient, companyId: string, codes: SystemAccountCode[]) {
    const result = await client.query<{ id: string; code: SystemAccountCode }>(
      `SELECT id, code
       FROM accounting_accounts
       WHERE company_id = $1
         AND code = ANY($2::text[])
         AND is_active = TRUE`,
      [companyId, codes],
    );
    const map = result.rows.reduce(
      (acc, row) => {
        acc[row.code] = row.id;
        return acc;
      },
      {} as Record<SystemAccountCode, string>,
    );
    for (const code of codes) {
      if (!map[code]) {
        throw new BadRequestException(`Missing accounting account ${code}. Run /accounting/bootstrap-accounts first.`);
      }
    }
    return map;
  }

  private async resolvePaymentAmounts(
    client: DbClient,
    companyId: string,
    rawDocumentCurrencyCode: string | null,
    input: RegisterInvoicePaymentInput,
  ): Promise<PaymentAmounts> {
    const company = await client.query<{ currency_code: string }>(
      'SELECT currency_code FROM companies WHERE id=$1 LIMIT 1',
      [companyId],
    );
    if (!company.rows[0]) {
      throw new NotFoundException('Company not found.');
    }
    const baseCurrencyCode = company.rows[0].currency_code;
    const documentCurrencyCode = (rawDocumentCurrencyCode ?? baseCurrencyCode).toUpperCase();
    if (input.currencyCode !== undefined && typeof input.currencyCode !== 'string') {
      throw new BadRequestException('currencyCode must be a three-letter ISO code when provided.');
    }
    const paymentCurrencyCode = (input.currencyCode ?? documentCurrencyCode).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(paymentCurrencyCode)) {
      throw new BadRequestException('currencyCode must be a three-letter ISO code when provided.');
    }
    if (paymentCurrencyCode !== documentCurrencyCode && paymentCurrencyCode !== baseCurrencyCode) {
      throw new BadRequestException('Payments are supported in document currency or company base currency.');
    }
    if (documentCurrencyCode === baseCurrencyCode && paymentCurrencyCode !== baseCurrencyCode) {
      throw new BadRequestException('Payments in foreign currency require a foreign-currency document.');
    }

    let exchangeRate = 1;
    if (documentCurrencyCode !== baseCurrencyCode) {
      exchangeRate = await this.resolveBaseToDocumentRate(client, companyId, documentCurrencyCode, input.exchangeRate);
    } else if (input.exchangeRate !== undefined) {
      const provided = Number(input.exchangeRate);
      if (!Number.isFinite(provided) || provided <= 0) {
        throw new BadRequestException('exchangeRate must be a positive number when provided.');
      }
    }

    if (paymentCurrencyCode === documentCurrencyCode) {
      return {
        amountInDocumentCurrency: this.round4(input.amount),
        amountInBaseCurrency: this.round4(documentCurrencyCode === baseCurrencyCode ? input.amount : input.amount / exchangeRate),
        paymentCurrencyCode,
        documentCurrencyCode,
        baseCurrencyCode,
        exchangeRate: Number(exchangeRate.toFixed(8)),
      };
    }

    return {
      amountInDocumentCurrency: this.round4(input.amount * exchangeRate),
      amountInBaseCurrency: this.round4(input.amount),
      paymentCurrencyCode,
      documentCurrencyCode,
      baseCurrencyCode,
      exchangeRate: Number(exchangeRate.toFixed(8)),
    };
  }

  private async resolveBaseToDocumentRate(
    client: DbClient,
    companyId: string,
    documentCurrencyCode: string,
    inputExchangeRate?: number,
  ) {
    if (inputExchangeRate !== undefined) {
      const provided = Number(inputExchangeRate);
      if (!Number.isFinite(provided) || provided <= 0) {
        throw new BadRequestException('exchangeRate must be a positive number when provided.');
      }
      return provided;
    }
    const rate = await client.query<{ rate: string }>(
      `SELECT rate::text AS rate
       FROM currency_exchange_rates
       WHERE company_id=$1 AND to_currency=$2
         AND valid_from <= NOW()
         AND (valid_to IS NULL OR valid_to > NOW())
       ORDER BY valid_from DESC, created_at DESC
       LIMIT 1`,
      [companyId, documentCurrencyCode],
    );
    if (!rate.rows[0]) {
      throw new BadRequestException(
        `Missing exchange rate from company base currency to ${documentCurrencyCode}. Set it in /companies/currency-rates or provide exchangeRate.`,
      );
    }
    return Number(rate.rows[0].rate);
  }

  private round4(value: number) {
    return Number(value.toFixed(4));
  }

  private async assertNoExistingSourceEntry(client: DbClient, companyId: string, sourceType: string, sourceId: string) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accounting-source:${companyId}:${sourceType}:${sourceId}`]);
    const existing = await client.query<{ id: string }>(
      `SELECT id
       FROM accounting_journal_entries
       WHERE company_id = $1 AND source_type = $2 AND source_id = $3 AND status = 'posted'
       LIMIT 1`,
      [companyId, sourceType, sourceId],
    );
    if (existing.rows[0]) {
      throw new BadRequestException('Source document is already posted in accounting.');
    }
  }

  private async assertSourceEntryExists(client: DbClient, companyId: string, sourceType: string, sourceId: string) {
    const existing = await client.query<{ id: string }>(
      `SELECT id
       FROM accounting_journal_entries
       WHERE company_id = $1 AND source_type = $2 AND source_id = $3 AND status = 'posted'
       LIMIT 1`,
      [companyId, sourceType, sourceId],
    );
    if (!existing.rows[0]) {
      throw new BadRequestException('Source document must be posted before payment.');
    }
  }

  private async insertAudit(
    client: DbClient,
    user: AuthUser,
    eventName: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.companyId, user.sub, eventName, 'accounting', entityId, JSON.stringify(payload)],
    );
  }

  private async insertAuditDirect(
    user: AuthUser,
    eventName: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await this.db.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.companyId, user.sub, eventName, 'accounting', entityId, JSON.stringify(payload)],
    );
  }
}
