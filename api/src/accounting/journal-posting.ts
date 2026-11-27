import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { nextDocumentNumber } from '../common/document-sequence';

export type JournalLineInput = {
  accountId: string;
  description: string;
  debit: bigint;
  credit: bigint;
};

const SCALE = 10000n;

export function toUnits(value: string | number): bigint {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, '0').slice(0, 4));
}

export function fromUnits(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const text = `${absolute / SCALE}.${(absolute % SCALE).toString().padStart(4, '0')}`;
  return negative ? `-${text}` : text;
}

export async function assertAccounts(
  client: PoolClient,
  companyId: string,
  accounts: Array<{ id: unknown; field: string; types: string[] }>,
) {
  for (const account of accounts) {
    if (typeof account.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(account.id)) {
      throw new BadRequestException(`${account.field} must be an account identifier.`);
    }
    const found = await client.query<{ account_type: string }>(
      `SELECT account_type FROM accounting_accounts
       WHERE id=$1 AND company_id=$2 AND is_active=TRUE`,
      [account.id, companyId],
    );
    if (!found.rows[0]) {
      throw new BadRequestException(`${account.field} does not reference an active company account.`);
    }
    if (!account.types.includes(found.rows[0].account_type)) {
      throw new BadRequestException(`${account.field} must be an account of type ${account.types.join(' or ')}.`);
    }
  }
}

export async function postJournalEntry(
  client: PoolClient,
  user: { sub: string; companyId: string },
  entry: {
    sourceType: string;
    sourceId: string;
    description: string;
    entryDate?: string;
    lines: JournalLineInput[];
  },
) {
  const lines = entry.lines.filter((line) => line.debit > 0n || line.credit > 0n);
  const debit = lines.reduce((sum, line) => sum + line.debit, 0n);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0n);
  if (lines.length < 2 || debit !== credit) {
    throw new BadRequestException('Journal entry must be balanced.');
  }
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accounting-period:${user.companyId}`]);
  const closed = await client.query(
    `SELECT id FROM accounting_period_closures
     WHERE company_id=$1 AND status='closed'
       AND period_year=EXTRACT(YEAR FROM COALESCE($2::date, CURRENT_DATE))
       AND period_month=EXTRACT(MONTH FROM COALESCE($2::date, CURRENT_DATE))`,
    [user.companyId, entry.entryDate ?? null],
  );
  if (closed.rows[0]) throw new BadRequestException('Accounting period is closed.');
  const entryNumber = await nextDocumentNumber(client, user.companyId, 'AUTO-JE');
  const header = await client.query<{ id: string }>(
    `INSERT INTO accounting_journal_entries
       (company_id, entry_number, entry_date, source_type, source_id, description, status, created_by)
     VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4,$5,$6,'posted',$7)
     RETURNING id`,
    [user.companyId, entryNumber, entry.entryDate ?? null, entry.sourceType, entry.sourceId, entry.description, user.sub],
  );
  for (const line of lines) {
    if (line.debit > 0n && line.credit > 0n) {
      throw new BadRequestException('A journal line cannot carry debit and credit.');
    }
    await client.query(
      `INSERT INTO accounting_journal_lines (journal_entry_id, account_id, line_description, debit, credit)
       VALUES ($1,$2,$3,$4,$5)`,
      [header.rows[0].id, line.accountId, line.description, fromUnits(line.debit), fromUnits(line.credit)],
    );
  }
  return header.rows[0].id;
}

export function auditEvent(
  client: PoolClient,
  user: { sub: string; companyId: string },
  entityName: string,
  eventName: string,
  entityId: string,
  payload: Record<string, unknown>,
) {
  return client.query(
    `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [user.companyId, user.sub, eventName, entityName, entityId, JSON.stringify(payload)],
  );
}
