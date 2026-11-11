import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { nextDocumentNumber } from '../common/document-sequence';
import { normalizeQuantityDocument, type QuantityDocument } from '../common/quantity-document';
import { requiredDate } from '../common/iso-date';
import type { AuthUser, ClosePeriodInput, RegisterInvoicePaymentInput } from './accounting.types';

type DbClient = Awaited<ReturnType<DatabaseService['connect']>>;

type SystemAccountCode = '1100' | '1110' | '1200' | '1300' | '2100' | '2200' | '4100';

@Injectable()
export class AccountingService {
  constructor(private readonly db: DatabaseService) {}

  async listAccounts(user: AuthUser) {
    const result = await this.db.query(
      `SELECT code AS account_code,name AS account_name,account_type,is_active,is_system
       FROM accounting_accounts WHERE company_id=$1 ORDER BY code`, [user.companyId]);
    return result.rows;
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

  async creditInvoice(user: AuthUser, invoiceId: string, input: { reason: string; returnStock: boolean }) {
    if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000 ||
        typeof input.returnStock !== 'boolean') {
      throw new BadRequestException('A reason (10 to 1000 characters) and explicit returnStock choice are required.');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const source = await client.query<{ order_id: string }>('SELECT order_id FROM sales_invoices WHERE id=$1 AND company_id=$2', [invoiceId, user.companyId]);
      if (!source.rows[0]) throw new NotFoundException('Invoice not found.');
      await client.query('SELECT id FROM sales_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [source.rows[0].order_id, user.companyId]);
      const invoice = await client.query<{ status: string; subtotal: string; tax_total: string; grand_total: string; currency_code: string | null }>(
        'SELECT status,subtotal,tax_total,grand_total,currency_code FROM sales_invoices WHERE id=$1 AND company_id=$2 FOR UPDATE', [invoiceId, user.companyId],
      );
      if (invoice.rows[0].status === 'void') throw new ConflictException('Invoice was already voided/credited.');
      if (Number(invoice.rows[0].grand_total) <= 0) throw new BadRequestException('A credit requires a positive invoice total.');
      await this.assertSourceEntryExists(client, user.companyId, 'sales_invoice', invoiceId);
      const creditNumber = await nextDocumentNumber(client, user.companyId, 'AUTO-CN');
      const credit = await client.query<{ id: string }>(
        `INSERT INTO sales_credit_notes(company_id,invoice_id,credit_number,reason,subtotal,tax_total,grand_total,currency_code,stock_returned,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [user.companyId, invoiceId, creditNumber, input.reason.trim(), invoice.rows[0].subtotal, invoice.rows[0].tax_total,
          invoice.rows[0].grand_total, invoice.rows[0].currency_code, input.returnStock, user.sub],
      );
      const entryId = await this.createEntryHeader(client, user, 'sales_credit', credit.rows[0].id, `Nota de credito ${creditNumber}`);
      const accounts = await this.getSystemAccounts(client, user.companyId, ['1100', '4100', '2200']);
      if (Number(invoice.rows[0].subtotal) > 0) await this.insertLine(client, entryId, accounts['4100'], 'Reversion ingreso', Number(invoice.rows[0].subtotal), 0);
      if (Number(invoice.rows[0].tax_total) > 0) await this.insertLine(client, entryId, accounts['2200'], 'Reversion impuesto', Number(invoice.rows[0].tax_total), 0);
      await this.insertLine(client, entryId, accounts['1100'], 'Credito a cliente', 0, Number(invoice.rows[0].grand_total));
      const reservations = await client.query<{ id: string; product_id: string; location_code: string; quantity: string; status: string }>(
        `SELECT id,product_id,location_code,quantity,status FROM inventory_reservations
         WHERE company_id=$1 AND sales_order_id=$2 AND status IN ('reserved','fulfilled')
         ORDER BY product_id,location_code FOR UPDATE`, [user.companyId, source.rows[0].order_id],
      );
      if (input.returnStock && !reservations.rows.some(row => row.status === 'fulfilled')) {
        throw new BadRequestException('No dispatched goods exist to return.');
      }
      for (const row of reservations.rows) {
        if (row.status === 'reserved') {
          const updated = await client.query(
            `UPDATE inventory_stock_balances SET reserved=reserved-$1,updated_at=NOW()
             WHERE company_id=$2 AND product_id=$3 AND location_code=$4 AND reserved>=$1 RETURNING id`,
            [row.quantity, user.companyId, row.product_id, row.location_code],
          );
          if (!updated.rows[0]) throw new BadRequestException('Reservation balance is inconsistent.');
          await client.query(`UPDATE inventory_reservations SET status='released',updated_at=NOW() WHERE id=$1`, [row.id]);
        } else if (input.returnStock) {
          await this.restoreCreditedStock(client, user, credit.rows[0].id, row, input.reason.trim());
          continue;
        } else continue;
        await client.query(
          `INSERT INTO inventory_movements(company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by)
           VALUES($1,$2,$3,$4,$5,'sales_credit',$6,$7,$8)`,
          [user.companyId, row.location_code, row.product_id, 'reservation_release',
            row.quantity, credit.rows[0].id, input.reason.trim(), user.sub],
        );
      }
      await client.query(`UPDATE sales_invoices SET status='void' WHERE id=$1 AND company_id=$2`, [invoiceId, user.companyId]);
      await client.query(`UPDATE sales_orders SET status='cancelled',updated_at=NOW() WHERE id=$1 AND company_id=$2`, [source.rows[0].order_id, user.companyId]);
      await this.insertAudit(client, user, 'accounting.sales.credit', credit.rows[0].id, { invoice_id: invoiceId, return_stock: input.returnStock, reason: input.reason.trim() });
      await client.query('COMMIT');
      return { id: credit.rows[0].id, creditNumber };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Invoice already has a credit note.');
      throw error;
    } finally { client.release(); }
  }

  async listCredits(user: AuthUser) {
    return (await this.db.query(
      `SELECT cn.id,cn.credit_number,cn.reason,cn.grand_total,cn.currency_code,cn.stock_returned,si.invoice_number,
              (NOT cn.stock_returned AND EXISTS(SELECT 1 FROM inventory_reservations ir
                WHERE ir.sales_order_id=si.order_id AND ir.company_id=cn.company_id AND ir.status='fulfilled')) AS can_return_stock,
              COALESCE(paid.total,0)::text AS paid_amount,
              (COALESCE(paid.total,0)-COALESCE(refunded.total,0))::text AS refund_due
       FROM sales_credit_notes cn JOIN sales_invoices si ON si.id=cn.invoice_id AND si.company_id=cn.company_id
       LEFT JOIN (SELECT invoice_id,SUM(amount) AS total FROM accounting_payments WHERE company_id=$1 GROUP BY invoice_id) paid ON paid.invoice_id=cn.invoice_id
       LEFT JOIN (SELECT credit_note_id,SUM(amount) AS total FROM sales_customer_refunds WHERE company_id=$1 GROUP BY credit_note_id) refunded ON refunded.credit_note_id=cn.id
       WHERE cn.company_id=$1 ORDER BY cn.created_at DESC`, [user.companyId],
    )).rows;
  }

  async returnCreditedStock(user: AuthUser, id: string, input: { reference: string; reason: string }) {
    if (!input || typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 64 ||
        typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) {
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
      const credit = await client.query<{ stock_returned: boolean }>(
        'SELECT stock_returned FROM sales_credit_notes WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId],
      );
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sales-stock-return:${user.companyId}:${reference}`]);
      const prior = await client.query<{ id: string; credit_note_id: string; reason: string }>(
        'SELECT id,credit_note_id,reason FROM sales_credit_stock_returns WHERE company_id=$1 AND reference=$2', [user.companyId, reference],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].credit_note_id !== id || prior.rows[0].reason !== reason) throw new ConflictException('Return reference already used with different data.');
        await client.query('COMMIT'); return { id: prior.rows[0].id, replayed: true };
      }
      if (credit.rows[0].stock_returned) throw new ConflictException('Goods were already returned with this credit.');
      const reservations = await client.query<{ product_id: string; location_code: string; quantity: string }>(
        `SELECT product_id,location_code,quantity FROM inventory_reservations
         WHERE company_id=$1 AND sales_order_id=$2 AND status='fulfilled' ORDER BY product_id,location_code,id FOR UPDATE`,
        [user.companyId, source.rows[0].order_id],
      );
      if (!reservations.rows.length) throw new BadRequestException('No dispatched goods exist to return.');
      const document = await client.query<{ id: string }>(
        `INSERT INTO sales_credit_stock_returns(company_id,credit_note_id,reference,reason,created_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.companyId, id, reference, reason, user.sub],
      );
      for (const row of reservations.rows) {
        await this.restoreCreditedStock(client, user, id, row, reason);
      }
      await client.query('UPDATE sales_credit_notes SET stock_returned=TRUE WHERE id=$1 AND company_id=$2', [id, user.companyId]);
      await this.insertAudit(client, user, 'accounting.sales.credit.stock.return', document.rows[0].id,
        { credit_note_id: id, reference, reason, lines: reservations.rows.length });
      await client.query('COMMIT');
      return { id: document.rows[0].id, replayed: false };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async restoreCreditedStock(client: DbClient, user: AuthUser, creditId: string,
    row: { product_id: string; location_code: string; quantity: string }, reason: string) {
    const stock = await client.query(
      `UPDATE inventory_stock_balances SET on_hand=on_hand+$1,updated_at=NOW()
       WHERE company_id=$2 AND product_id=$3 AND location_code=$4 RETURNING id`,
      [row.quantity, user.companyId, row.product_id, row.location_code],
    );
    if (!stock.rows[0]) throw new BadRequestException('Original dispatch stock location is missing. Reconcile before returning goods.');
    await client.query(
      `INSERT INTO inventory_movements(company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by)
       VALUES($1,$2,$3,'adjustment_in',$4,'sales_credit',$5,$6,$7)`,
      [user.companyId, row.location_code, row.product_id, row.quantity, creditId, reason, user.sub],
    );
  }

  async refundCredit(user: AuthUser, id: string, input: RegisterInvoicePaymentInput) {
    if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 ||
        Math.round(input.amount * 10000) / 10000 !== input.amount || typeof input.paymentReference !== 'string' ||
        !input.paymentReference.trim() || input.paymentReference.length > 64) throw new BadRequestException('Valid reference and positive amount are required.');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const credit = await client.query<{ invoice_id: string }>(
        'SELECT invoice_id FROM sales_credit_notes WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId],
      );
      if (!credit.rows[0]) throw new NotFoundException('Credit not found.');
      const balance = await client.query<{ due: string }>(
        `SELECT ((SELECT COALESCE(SUM(amount),0) FROM accounting_payments WHERE company_id=$1 AND invoice_id=$2)
                 -(SELECT COALESCE(SUM(amount),0) FROM sales_customer_refunds WHERE company_id=$1 AND credit_note_id=$3))::text AS due`,
        [user.companyId, credit.rows[0].invoice_id, id],
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
      const invoice = await client.query<{ id: string; status: string; grand_total: string }>(
        `SELECT id, status, grand_total
         FROM sales_invoices
         WHERE id = $1 AND company_id = $2
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
        [user.companyId, invoiceId, input.amount],
      );
      const { remaining, remaining_after: newRemaining, has_balance: hasBalance, fits, settles } = balance.rows[0];
      if (!hasBalance) {
        throw new BadRequestException('Invoice is already fully paid.');
      }
      if (!fits) {
        throw new BadRequestException(`Payment amount exceeds remaining balance (${remaining}).`);
      }

      const paymentInsert = await client.query<{ id: string }>(
        `INSERT INTO accounting_payments (company_id, invoice_id, payment_reference, amount, status, created_by)
         VALUES ($1,$2,$3,$4,'registered',$5)
         RETURNING id`,
        [user.companyId, invoiceId, input.paymentReference.trim(), input.amount, user.sub],
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
      await this.insertLine(client, entryId, accounts['1110'], 'Ingreso a caja/bancos', input.amount, 0);
      await this.insertLine(client, entryId, accounts['1100'], 'Disminucion de cuenta por cobrar', 0, input.amount);

      await client.query(
        `INSERT INTO accounting_reconciliations (company_id, invoice_id, payment_id, amount)
         VALUES ($1,$2,$3,$4)`,
        [user.companyId, invoiceId, paymentId, input.amount],
      );
      await client.query(`UPDATE accounting_payments SET status = 'reconciled' WHERE id = $1`, [paymentId]);

      if (settles) {
        await client.query(`UPDATE sales_invoices SET status = 'paid' WHERE id = $1`, [invoiceId]);
      }

      await this.insertAudit(client, user, 'accounting.invoice.payment.registered', paymentId, {
        invoice_id: invoiceId,
        amount: input.amount,
        remaining: Number(newRemaining),
      });
      await client.query('COMMIT');
      return {
        invoiceId,
        paymentId,
        paymentReference: input.paymentReference.trim(),
        amount: input.amount,
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
        const stock = await client.query(
          `UPDATE inventory_stock_balances SET on_hand=on_hand-$1,updated_at=NOW()
           WHERE company_id=$2 AND product_id=$3 AND location_code=$4 AND on_hand-reserved>=$1 RETURNING id`,
          [quantity, user.companyId, row.product_id, row.location_code],
        );
        if (!stock.rows[0]) throw new BadRequestException('Insufficient available stock at the original receipt location. Reserved stock cannot be returned.');
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
        await client.query(
          `INSERT INTO inventory_movements(company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by)
           VALUES($1,$2,$3,'supplier_return',$4,'supplier_return',$5,$6,$7)`,
          [user.companyId, row.location_code, row.product_id, quantity, created.rows[0].id, payload.reason, user.sub],
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
        const order = await client.query<{ grand_total: string; status: string }>(
          'SELECT grand_total,status FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId],
        );
        if (!order.rows[0]) throw new NotFoundException('Purchase order not found.');
        if (order.rows[0].status !== 'received') throw new BadRequestException('Only received and posted purchases can be paid.');
        await this.assertSourceEntryExists(client, user.companyId, 'purchase_order', id);
        const paid = await client.query<{ total: string }>(
          `SELECT ((SELECT COALESCE(SUM(amount),0) FROM accounting_supplier_payments WHERE company_id=$1 AND purchase_order_id=$2)
            +(SELECT COALESCE(SUM(grand_total),0) FROM purchase_supplier_returns WHERE company_id=$1 AND purchase_order_id=$2)
            -(SELECT COALESCE(SUM(amount),0) FROM accounting_supplier_refunds WHERE company_id=$1 AND purchase_order_id=$2))::text AS total`,
          [user.companyId, id],
        );
        const remaining = Number((Number(order.rows[0].grand_total) - Number(paid.rows[0].total)).toFixed(4));
        if (input.amount > remaining) throw new BadRequestException('Payment exceeds remaining payable.');
        const payment = await client.query<{ id: string }>(
          `INSERT INTO accounting_supplier_payments(company_id,purchase_order_id,payment_reference,amount,created_by)
           VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.companyId, id, input.paymentReference.trim(), input.amount, user.sub],
        );
        const accounts = await this.getSystemAccounts(client, user.companyId, ['1110', '2100']);
        const entryId = await this.createEntryHeader(client, user, 'supplier_payment', payment.rows[0].id, `Pago proveedor ${input.paymentReference.trim()}`);
        await this.insertLine(client, entryId, accounts['2100'], 'Disminucion de cuenta por pagar', input.amount, 0);
        await this.insertLine(client, entryId, accounts['1110'], 'Egreso caja/bancos', 0, input.amount);
        await this.insertAudit(client, user, 'accounting.supplier.payment', payment.rows[0].id, { purchase_order_id: id, amount: input.amount });
        await client.query('COMMIT');
        return { paymentId: payment.rows[0].id, remainingBalance: Number((remaining - input.amount).toFixed(4)) };
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
