import type { PoolClient } from 'pg';

const sources = {
  'AUTO-INV': ['sales_invoices', 'invoice_number'],
  'AUTO-JE': ['accounting_journal_entries', 'entry_number'],
  'AUTO-CN': ['sales_credit_notes', 'credit_number'],
  WEBQ: ['sales_quotations', 'quotation_number'],
  WEBO: ['sales_orders', 'order_number'],
  CHKO: ['ecommerce_checkouts', 'checkout_number'],
} as const;

export async function nextDocumentNumber(client: PoolClient, companyId: string, prefix: keyof typeof sources) {
  const [table, column] = sources[prefix];
  for (;;) {
    const result = await client.query<{ last_value: string }>(
      `INSERT INTO document_sequences(company_id,prefix,last_value) VALUES($1,$2,1)
       ON CONFLICT(company_id,prefix) DO UPDATE SET last_value=document_sequences.last_value+1
       RETURNING last_value`, [companyId, prefix],
    );
    const number = `${prefix}-${result.rows[0].last_value.padStart(8, '0')}`;
    const existing = await client.query(`SELECT id FROM ${table} WHERE company_id=$1 AND ${column}=$2`, [companyId, number]);
    if (!existing.rows.length) return number;
  }
}
