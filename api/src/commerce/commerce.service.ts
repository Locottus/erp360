import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { nextDocumentNumber } from '../common/document-sequence';
import { requiredDate } from '../common/iso-date';
import { changeReason } from '../common/management-input';
import PDFDocument from 'pdfkit';
import type {
  AuthUser,
  CreatePurchaseRequestInput,
  CreateQuotationInput,
  PurchaseLineInput,
  SalesLineInput,
} from './commerce.types';

@Injectable()
export class CommerceService {
  constructor(private readonly db: DatabaseService) {}

  async cancelOrder(user: AuthUser, id: string, type: 'sales' | 'purchase', reason: string) {
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 1000) {
      throw new BadRequestException('A reason of 10 to 1000 characters is required.');
    }
    const table = type === 'sales' ? 'sales_orders' : 'purchase_orders';
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query<{ status: string }>(`SELECT status FROM ${table} WHERE id=$1 AND company_id=$2 FOR UPDATE`, [id, user.companyId]);
      if (!order.rows[0]) throw new NotFoundException('Order not found.');
      if (order.rows[0].status === 'cancelled') throw new ConflictException('Order already cancelled.');
      if (type === 'sales') {
        const invoice = await client.query('SELECT id FROM sales_invoices WHERE order_id=$1 AND company_id=$2', [id, user.companyId]);
        const dispatched = await client.query(
          `SELECT id FROM inventory_reservations WHERE sales_order_id=$1 AND company_id=$2 AND status='fulfilled'`, [id, user.companyId],
        );
        if (invoice.rows.length || dispatched.rows.length) throw new BadRequestException('Invoiced or dispatched orders require a credit/return process.');
        const reservations = await client.query<{ id: string; product_id: string; location_code: string; quantity: string }>(
          `SELECT id,product_id,location_code,quantity FROM inventory_reservations
           WHERE sales_order_id=$1 AND company_id=$2 AND status='reserved' ORDER BY product_id,location_code FOR UPDATE`, [id, user.companyId],
        );
        for (const row of reservations.rows) {
          const updated = await client.query(
            `UPDATE inventory_stock_balances SET reserved=reserved-$1,updated_at=NOW()
             WHERE company_id=$2 AND product_id=$3 AND location_code=$4 AND reserved>=$1 RETURNING id`,
            [row.quantity, user.companyId, row.product_id, row.location_code],
          );
          if (!updated.rows[0]) throw new BadRequestException('Reservation balance is inconsistent.');
          await client.query(`UPDATE inventory_reservations SET status='released',updated_at=NOW() WHERE id=$1`, [row.id]);
          await client.query(
            `INSERT INTO inventory_movements(company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by)
             VALUES($1,$2,$3,'reservation_release',$4,'sales_order',$5,$6,$7)`,
            [user.companyId, row.location_code, row.product_id, row.quantity, id, reason.trim(), user.sub],
          );
        }
      } else {
        const receipts = await client.query('SELECT id FROM purchase_receipts WHERE purchase_order_id=$1 AND company_id=$2', [id, user.companyId]);
        const posted = await client.query(
          `SELECT id FROM accounting_journal_entries WHERE company_id=$1 AND source_id=$2 AND source_type='purchase_order' AND status='posted'`,
          [user.companyId, id],
        );
        if (receipts.rows.length || posted.rows.length || order.rows[0].status === 'received') {
          throw new BadRequestException('Received or posted purchases require a supplier return process.');
        }
      }
      await client.query(`UPDATE ${table} SET status='cancelled',updated_at=NOW() WHERE id=$1 AND company_id=$2`, [id, user.companyId]);
      await this.insertAudit(client, user, `commerce.${type}.order.cancel`, id, { reason: reason.trim() });
      await client.query('COMMIT');
      return { id, status: 'cancelled' };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async invoicePdf(user: AuthUser, id: string): Promise<Buffer> {
    const result = await this.db.query<{
      invoice_number: string; subtotal: string; tax_total: string; grand_total: string;
      issued_at: Date; currency_code: string | null; company_name: string; customer_name: string; status: string;
      document_snapshot: { companyName: string; customerName: string; lines: { name: string; quantity: string; unit_price: string; line_total: string }[] } | null;
    }>(
      `SELECT si.invoice_number,si.subtotal,si.tax_total,si.grand_total,si.issued_at,si.currency_code,si.status,si.document_snapshot,
              c.name AS company_name,cu.name AS customer_name
       FROM sales_invoices si JOIN companies c ON c.id=si.company_id
       JOIN sales_orders so ON so.id=si.order_id AND so.company_id=si.company_id
       JOIN customers cu ON cu.id=so.customer_id AND cu.company_id=so.company_id
       WHERE si.id=$1 AND si.company_id=$2`, [id, user.companyId],
    );
    if (!result.rows[0]) throw new NotFoundException('Invoice not found.');
    const invoice = result.rows[0];
    const snapshot = invoice.document_snapshot;
    const lines = snapshot?.lines ?? (await this.db.query<{ name: string; quantity: string; unit_price: string; line_total: string }>(
      `SELECT p.name,l.quantity,l.unit_price,l.line_total FROM sales_order_lines l
       JOIN sales_invoices si ON si.order_id=l.order_id
       JOIN products p ON p.id=l.product_id AND p.company_id=si.company_id
       WHERE si.id=$1 AND si.company_id=$2 ORDER BY l.id`, [id, user.companyId],
    )).rows;
    const doc = new PDFDocument({ margin: 48, size: 'A4', info: { Title: `Factura comercial ${invoice.invoice_number}` } });
    const chunks: Buffer[] = [];
    const completed = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    });
    doc.fontSize(22).text(snapshot?.companyName ?? invoice.company_name);
    doc.moveDown().fontSize(16).text(`Factura comercial ${invoice.invoice_number}`);
    doc.fontSize(10).text('Documento comercial. No constituye comprobante fiscal certificado.');
    doc.text(`Cliente: ${snapshot?.customerName ?? invoice.customer_name}`).text(`Fecha: ${invoice.issued_at.toISOString().slice(0, 10)}`);
    if (!snapshot) doc.text('Registro historico: datos descriptivos actuales, sin snapshot de emision.');
    doc.text(`Estado: ${invoice.status} | Moneda: ${invoice.currency_code ?? 'NO DEFINIDA - registro historico'}`);
    doc.moveDown();
    for (const line of lines) {
      doc.fontSize(11).text(line.name);
      doc.fontSize(10).text(`Cantidad ${line.quantity} x ${line.unit_price} = ${line.line_total}`).moveDown(0.5);
    }
    doc.moveDown().text(`Subtotal: ${invoice.subtotal}`).text(`Impuestos: ${invoice.tax_total}`)
      .fontSize(14).text(`Total: ${invoice.grand_total} ${invoice.currency_code ?? ''}`);
    doc.end();
    await this.insertAuditDirect(user, 'commerce.invoice.pdf', id, {});
    return completed;
  }

  async createQuotation(user: AuthUser, input: CreateQuotationInput) {
    this.validateSalesInput(input.quotationNumber, input.customerId, input.lines);
    const validUntil = input.validUntil == null ? null : requiredDate(input.validUntil, 'validUntil');
    if (/^WEBQ-/i.test(input.quotationNumber.trim())) throw new BadRequestException('WEBQ- is reserved for automatic storefront numbering.');
    const taxRate = await this.resolveTaxRatePercent(user.companyId, input.taxRateCode);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      if (validUntil) {
        const valid = await client.query<{ valid: boolean }>(
          `SELECT $1::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS valid`, [validUntil],
        );
        if (!valid.rows[0].valid) throw new BadRequestException('Quotation validity cannot start in the past.');
      }
      await this.assertCustomerOwnership(client, user.companyId, input.customerId);
      const lineCalc = await this.calculateSalesLines(client, user.companyId, input.lines);
      const { subtotal, taxTotal, grandTotal } = this.calculateTotals(lineCalc.subtotal, taxRate);
      const quotation = await client.query<{ id: string; quotation_number: string }>(
        `INSERT INTO sales_quotations
          (company_id, customer_id, quotation_number, status, subtotal, tax_total, grand_total, notes, created_by, currency_code, valid_until)
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,(SELECT currency_code FROM companies WHERE id=$1),$9::date)
         RETURNING id, quotation_number`,
        [
          user.companyId,
          input.customerId,
          input.quotationNumber.trim(),
          subtotal,
          taxTotal,
          grandTotal,
          input.notes ?? null,
          user.sub,
          validUntil,
        ],
      );
      for (const line of lineCalc.lines) {
        await client.query(
          `INSERT INTO sales_quotation_lines (quotation_id, product_id, quantity, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5)`,
          [quotation.rows[0].id, line.productId, line.quantity, line.unitPrice, line.lineTotal],
        );
      }
      await this.insertAudit(
        client,
        user,
        'commerce.sales.quotation.create',
        quotation.rows[0].id,
        { quotation_number: input.quotationNumber, line_count: lineCalc.lines.length, valid_until: validUntil },
      );
      await client.query('COMMIT');
      return {
        id: quotation.rows[0].id,
        quotationNumber: quotation.rows[0].quotation_number,
        status: 'draft',
        subtotal,
        taxTotal,
        grandTotal,
        validUntil,
        revision: 0,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (String(error).includes('sales_quotations_company_id_quotation_number_key')) {
        throw new ConflictException('Quotation number already exists for this company.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listQuotations(user: AuthUser) {
    const result = await this.db.query<{
      id: string;
      quotation_number: string;
      status: string;
      subtotal: string;
      tax_total: string;
      grand_total: string;
      customer_id: string;
      valid_until: string | null;
      revision: number;
      is_expired: boolean;
    }>(
      `SELECT id, quotation_number, status, subtotal, tax_total, grand_total, customer_id,
              valid_until::text, revision,
              COALESCE(status = 'draft' AND valid_until < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, FALSE) AS is_expired
       FROM sales_quotations
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [user.companyId],
    );
    await this.insertAuditDirect(user, 'commerce.sales.quotation.list', user.companyId, {
      total: result.rows.length,
    });
    return result.rows;
  }

  async listSalesOrders(user: AuthUser) {
    const result = await this.db.query(
      `SELECT so.id, so.order_number, so.status, so.subtotal, so.tax_total, so.grand_total, so.currency_code,
              so.created_at, c.name AS customer_name
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id AND c.company_id = so.company_id
       WHERE so.company_id = $1
       ORDER BY so.created_at DESC, so.id DESC`,
      [user.companyId],
    );
    return result.rows;
  }

  async listSalesInvoices(user: AuthUser) {
    const result = await this.db.query(
      `SELECT si.id, si.invoice_number, si.status, si.subtotal, si.tax_total, si.grand_total, si.currency_code,
              si.issued_at, so.id AS sales_order_id, so.order_number, c.name AS customer_name,
              COALESCE(pay.total_paid, 0)::text AS total_paid,
              CASE WHEN si.status='void' THEN 0 ELSE GREATEST(si.grand_total - COALESCE(pay.total_paid, 0), 0) END::text AS balance_due,
              EXISTS (
                SELECT 1 FROM accounting_journal_entries je
                WHERE je.company_id = si.company_id
                  AND je.source_type = 'sales_invoice'
                  AND je.source_id = si.id
                  AND je.status = 'posted'
              ) AS is_posted
       FROM sales_invoices si
       JOIN sales_orders so ON so.id = si.order_id AND so.company_id = si.company_id
       JOIN customers c ON c.id = so.customer_id AND c.company_id = so.company_id
       LEFT JOIN (
         SELECT company_id, invoice_id, SUM(amount) AS total_paid
         FROM accounting_payments
         WHERE company_id = $1
         GROUP BY company_id, invoice_id
       ) pay ON pay.company_id = si.company_id AND pay.invoice_id = si.id
       WHERE si.company_id = $1
       ORDER BY si.issued_at DESC, si.id DESC`,
      [user.companyId],
    );
    return result.rows;
  }

  async confirmQuotation(user: AuthUser, quotationId: string, orderNumber: string) {
    if (!orderNumber?.trim()) {
      throw new BadRequestException('orderNumber is required.');
    }
    if (/^WEBO-/i.test(orderNumber.trim())) throw new BadRequestException('WEBO- is reserved for automatic storefront numbering.');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const quote = await client.query<{
        id: string;
        customer_id: string;
        status: string;
        subtotal: string;
        tax_total: string;
        grand_total: string;
        is_expired: boolean;
      }>(
        `SELECT id, customer_id, status, subtotal, tax_total, grand_total,
                COALESCE(valid_until < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, FALSE) AS is_expired
         FROM sales_quotations
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`,
        [quotationId, user.companyId],
      );
      if (!quote.rows[0]) {
        throw new NotFoundException('Quotation not found.');
      }
      if (quote.rows[0].status === 'approved') {
        throw new BadRequestException('Quotation is already approved.');
      }
      if (quote.rows[0].status === 'rejected') {
        throw new BadRequestException('Rejected quotation cannot be confirmed.');
      }
      if (quote.rows[0].is_expired) {
        throw new ConflictException('Quotation expired. Review prices and revise validity before confirming.');
      }

      const order = await client.query<{ id: string; order_number: string }>(
        `INSERT INTO sales_orders
          (company_id, customer_id, quotation_id, order_number, status, subtotal, tax_total, grand_total, created_by, currency_code)
         VALUES ($1,$2,$3,$4,'confirmed',$5,$6,$7,$8,(SELECT currency_code FROM sales_quotations WHERE id=$3))
         RETURNING id, order_number`,
        [
          user.companyId,
          quote.rows[0].customer_id,
          quote.rows[0].id,
          orderNumber.trim(),
          quote.rows[0].subtotal,
          quote.rows[0].tax_total,
          quote.rows[0].grand_total,
          user.sub,
        ],
      );

      const lines = await client.query<{
        product_id: string;
        quantity: string;
        unit_price: string;
        line_total: string;
      }>(
        `SELECT product_id, quantity, unit_price, line_total
         FROM sales_quotation_lines
         WHERE quotation_id = $1`,
        [quote.rows[0].id],
      );
      for (const line of lines.rows) {
        await client.query(
          `INSERT INTO sales_order_lines (order_id, product_id, quantity, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5)`,
          [order.rows[0].id, line.product_id, line.quantity, line.unit_price, line.line_total],
        );
      }

      await client.query(`UPDATE sales_quotations SET status = 'approved', revision = revision + 1, updated_at = NOW() WHERE id = $1`, [
        quote.rows[0].id,
      ]);

      await this.insertAudit(
        client,
        user,
        'commerce.sales.quotation.confirm',
        quote.rows[0].id,
        { order_number: order.rows[0].order_number, order_id: order.rows[0].id },
      );

      await client.query('COMMIT');
      return {
        quotationId: quote.rows[0].id,
        orderId: order.rows[0].id,
        orderNumber: order.rows[0].order_number,
        status: 'confirmed',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (String(error).includes('sales_orders_company_id_order_number_key')) {
        throw new ConflictException('Sales order number already exists for this company.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async reviseQuotationValidity(
    user: AuthUser, id: string,
    input: { validUntil: string | null; expectedRevision: number; reason: string },
  ) {
    if (!input || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new BadRequestException('A nonnegative expectedRevision is required.');
    }
    if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) {
      throw new BadRequestException('A reason of 10 to 1000 characters is required.');
    }
    const validUntil = input.validUntil === null ? null : requiredDate(input.validUntil, 'validUntil');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ status: string; valid_until: string | null; revision: number }>(
        `SELECT status, valid_until::text, revision FROM sales_quotations
         WHERE id=$1 AND company_id=$2 FOR UPDATE`, [id, user.companyId],
      );
      const quote = current.rows[0];
      if (!quote) throw new NotFoundException('Quotation not found.');
      if (quote.status !== 'draft') throw new ConflictException('Only a draft quotation can have its validity revised.');
      if (quote.revision !== input.expectedRevision) throw new ConflictException('Quotation changed. Reload before revising validity.');
      if (validUntil) {
        const valid = await client.query<{ valid: boolean }>(
          `SELECT $1::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS valid`, [validUntil],
        );
        if (!valid.rows[0].valid) throw new BadRequestException('New validity must be today or later (UTC).');
      }
      if (validUntil === quote.valid_until) throw new ConflictException('Quotation already has this validity.');
      const result = await client.query(
        `UPDATE sales_quotations SET valid_until=$3::date, revision=revision+1, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING id, valid_until::text, revision`,
        [id, user.companyId, validUntil],
      );
      await this.insertAudit(client, user, 'commerce.sales.quotation.validity', id, {
        before: { valid_until: quote.valid_until, revision: quote.revision },
        after: result.rows[0], reason: input.reason.trim(),
      });
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async issueInvoice(user: AuthUser, salesOrderId: string, invoiceNumber: string) {
    if (invoiceNumber !== undefined && (typeof invoiceNumber !== 'string' || invoiceNumber.length > 64)) {
      throw new BadRequestException('invoiceNumber must be a string of at most 64 characters.');
    }
    if (/^AUTO-INV-/i.test(invoiceNumber?.trim() ?? '')) throw new BadRequestException('AUTO-INV- is reserved for automatic invoice numbering. Leave the field empty.');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query<{
        id: string;
        status: string;
        subtotal: string;
        tax_total: string;
        grand_total: string;
      }>(
        `SELECT id, status, subtotal, tax_total, grand_total
         FROM sales_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`,
        [salesOrderId, user.companyId],
      );
      if (!order.rows[0]) {
        throw new NotFoundException('Sales order not found.');
      }
      if (order.rows[0].status === 'invoiced') {
        throw new BadRequestException('Sales order is already invoiced.');
      }
      if (order.rows[0].status !== 'confirmed') {
        throw new BadRequestException('Only confirmed orders can be invoiced.');
      }

      const invoice = await client.query<{ id: string; invoice_number: string }>(
        `INSERT INTO sales_invoices
          (company_id, order_id, invoice_number, status, subtotal, tax_total, grand_total, currency_code,document_snapshot)
         VALUES ($1,$2,$3,'issued',$4,$5,$6,(SELECT currency_code FROM sales_orders WHERE id=$2),
           jsonb_build_object(
             'companyName',(SELECT name FROM companies WHERE id=$1),
             'customerName',(SELECT c.name FROM customers c JOIN sales_orders so ON so.customer_id=c.id AND so.company_id=c.company_id WHERE so.id=$2 AND so.company_id=$1),
             'lines',(SELECT jsonb_agg(jsonb_build_object('name',p.name,'quantity',l.quantity::text,'unit_price',l.unit_price::text,'line_total',l.line_total::text) ORDER BY l.id)
                      FROM sales_order_lines l JOIN products p ON p.id=l.product_id AND p.company_id=$1 WHERE l.order_id=$2)
           ))
         RETURNING id, invoice_number`,
        [
          user.companyId,
          order.rows[0].id,
          invoiceNumber?.trim() || await nextDocumentNumber(client, user.companyId, 'AUTO-INV'),
          order.rows[0].subtotal,
          order.rows[0].tax_total,
          order.rows[0].grand_total,
        ],
      );

      await client.query(`UPDATE sales_orders SET status = 'invoiced', updated_at = NOW() WHERE id = $1`, [
        order.rows[0].id,
      ]);

      await this.insertAudit(client, user, 'commerce.sales.invoice.issue', order.rows[0].id, {
        invoice_id: invoice.rows[0].id,
        invoice_number: invoice.rows[0].invoice_number,
      });
      await client.query('COMMIT');
      return {
        salesOrderId: order.rows[0].id,
        invoiceId: invoice.rows[0].id,
        invoiceNumber: invoice.rows[0].invoice_number,
        status: 'issued',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (String(error).includes('sales_invoices_company_id_invoice_number_key')) {
        throw new ConflictException('Invoice number already exists for this company.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async createPurchaseRequest(user: AuthUser, input: CreatePurchaseRequestInput) {
    this.validatePurchaseInput(input.requestNumber, input.supplierId, input.lines);
    const taxRate = await this.resolveTaxRatePercent(user.companyId, input.taxRateCode);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await this.assertSupplierOwnership(client, user.companyId, input.supplierId);
      const lineCalc = await this.calculatePurchaseLines(client, user.companyId, input.lines);
      const { subtotal, taxTotal, grandTotal } = this.calculateTotals(lineCalc.subtotal, taxRate);

      const requestRec = await client.query<{ id: string; request_number: string }>(
        `INSERT INTO purchase_requests
          (company_id, supplier_id, request_number, status, subtotal, tax_total, grand_total, created_by, currency_code)
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,(SELECT currency_code FROM companies WHERE id=$1))
         RETURNING id, request_number`,
        [
          user.companyId,
          input.supplierId,
          input.requestNumber.trim(),
          subtotal,
          taxTotal,
          grandTotal,
          user.sub,
        ],
      );
      for (const line of lineCalc.lines) {
        await client.query(
          `INSERT INTO purchase_request_lines (request_id, product_id, quantity, unit_cost, line_total)
           VALUES ($1,$2,$3,$4,$5)`,
          [requestRec.rows[0].id, line.productId, line.quantity, line.unitCost, line.lineTotal],
        );
      }
      await this.insertAudit(
        client,
        user,
        'commerce.purchase.request.create',
        requestRec.rows[0].id,
        { request_number: input.requestNumber, line_count: lineCalc.lines.length },
      );

      await client.query('COMMIT');
      return {
        id: requestRec.rows[0].id,
        requestNumber: requestRec.rows[0].request_number,
        status: 'draft',
        subtotal,
        taxTotal,
        grandTotal,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (String(error).includes('purchase_requests_company_id_request_number_key')) {
        throw new ConflictException('Purchase request number already exists for this company.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listPurchaseRequests(user: AuthUser) {
    const result = await this.db.query<{
      id: string;
      request_number: string;
      status: string;
      subtotal: string;
      tax_total: string;
      grand_total: string;
      supplier_id: string;
    }>(
      `SELECT pr.id, pr.request_number, pr.status, pr.subtotal, pr.tax_total, pr.grand_total,
              pr.supplier_id, s.name AS supplier_name,
              (SELECT a.payload->>'reason' FROM audit_log a
               WHERE a.company_id=pr.company_id AND a.entity_id=pr.id::text
                 AND a.event_name='commerce.purchase.request.reject'
               ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS rejection_reason,
              po.id AS purchase_order_id, po.order_number AS purchase_order_number,
              po.status AS purchase_order_status,
              (po.id IS NOT NULL AND EXISTS (
                SELECT 1 FROM inventory_movements im
                WHERE im.company_id = pr.company_id
                  AND ((im.reference_type = 'purchase_order' AND im.reference_id = po.id)
                    OR (im.reference_type = 'purchase_receipt' AND EXISTS (
                      SELECT 1 FROM purchase_receipts r WHERE r.id=im.reference_id AND r.purchase_order_id=po.id AND r.company_id=po.company_id)))
                  AND im.movement_type = 'purchase_receipt'
              )) AS inventory_received,
              (po.id IS NOT NULL AND EXISTS (
                SELECT 1 FROM accounting_journal_entries je
                WHERE je.company_id = pr.company_id
                  AND je.source_type = 'purchase_order'
                  AND je.source_id = po.id
                  AND je.status = 'posted'
              )) AS is_posted
       FROM purchase_requests pr
       JOIN suppliers s ON s.id = pr.supplier_id AND s.company_id = pr.company_id
       LEFT JOIN purchase_orders po ON po.request_id = pr.id AND po.company_id = pr.company_id
       WHERE pr.company_id = $1
       ORDER BY pr.created_at DESC, pr.id DESC`,
      [user.companyId],
    );
    await this.insertAuditDirect(user, 'commerce.purchase.request.list', user.companyId, {
      total: result.rows.length,
    });
    return result.rows;
  }

  async purchaseRequestDetails(user: AuthUser, id: string) {
    const result = await this.db.query(
      `SELECT pr.id,pr.request_number,pr.status,pr.currency_code,
        pr.subtotal::text,pr.tax_total::text,pr.grand_total::text,
        s.name AS supplier_name,
        rp.location_code AS replenishment_location,rp.rule_revision AS replenishment_rule_revision,
        rp.reason AS replenishment_reason,
        COALESCE(json_agg(json_build_object(
          'id',l.id,'product_id',l.product_id,'sku',p.sku,'product_name',p.name,
          'quantity',l.quantity::text,'unit_cost',l.unit_cost::text,'line_total',l.line_total::text
        ) ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL),'[]'::json) AS lines
       FROM purchase_requests pr
       JOIN suppliers s ON s.id=pr.supplier_id AND s.company_id=pr.company_id
       LEFT JOIN replenishment_purchase_proposals rp ON rp.request_id=pr.id AND rp.company_id=pr.company_id
       LEFT JOIN purchase_request_lines l ON l.request_id=pr.id
       LEFT JOIN products p ON p.id=l.product_id AND p.company_id=pr.company_id
       WHERE pr.id=$1 AND pr.company_id=$2
       GROUP BY pr.id,s.name,rp.location_code,rp.rule_revision,rp.reason`, [id, user.companyId]);
    if (!result.rows[0]) throw new NotFoundException('Purchase request not found.');
    return result.rows[0];
  }

  async rejectPurchaseRequest(user: AuthUser, id: string, input: { reason: string }) {
    const reason = changeReason(input?.reason);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ status: string }>(
        'SELECT status FROM purchase_requests WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
      if (!current.rows[0]) throw new NotFoundException('Purchase request not found.');
      if (current.rows[0].status !== 'draft' && current.rows[0].status !== 'submitted') {
        throw new ConflictException('Only open purchase requests can be rejected.');
      }
      await client.query(`UPDATE purchase_requests SET status='rejected',updated_at=NOW() WHERE id=$1 AND company_id=$2`,
        [id, user.companyId]);
      await this.insertAudit(client, user, 'commerce.purchase.request.reject', id, {
        reason, previous_status: current.rows[0].status,
      });
      await client.query('COMMIT');
      return { id, status: 'rejected' };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async approvePurchaseRequest(user: AuthUser, requestId: string, orderNumber: string) {
    if (!orderNumber?.trim()) {
      throw new BadRequestException('orderNumber is required.');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const requestRec = await client.query<{
        id: string;
        supplier_id: string;
        status: string;
        subtotal: string;
        tax_total: string;
        grand_total: string;
      }>(
        `SELECT id, supplier_id, status, subtotal, tax_total, grand_total
         FROM purchase_requests
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`,
        [requestId, user.companyId],
      );
      if (!requestRec.rows[0]) {
        throw new NotFoundException('Purchase request not found.');
      }
      if (requestRec.rows[0].status === 'approved') {
        throw new BadRequestException('Purchase request already approved.');
      }
      if (requestRec.rows[0].status === 'rejected') {
        throw new BadRequestException('Rejected purchase request cannot be approved.');
      }

      const po = await client.query<{ id: string; order_number: string }>(
        `INSERT INTO purchase_orders
          (company_id, supplier_id, request_id, order_number, status, subtotal, tax_total, grand_total, created_by, currency_code)
         VALUES ($1,$2,$3,$4,'ordered',$5,$6,$7,$8,(SELECT currency_code FROM purchase_requests WHERE id=$3))
         RETURNING id, order_number`,
        [
          user.companyId,
          requestRec.rows[0].supplier_id,
          requestRec.rows[0].id,
          orderNumber.trim(),
          requestRec.rows[0].subtotal,
          requestRec.rows[0].tax_total,
          requestRec.rows[0].grand_total,
          user.sub,
        ],
      );

      const lines = await client.query<{
        product_id: string;
        quantity: string;
        unit_cost: string;
        line_total: string;
      }>(
        `SELECT product_id, quantity, unit_cost, line_total
         FROM purchase_request_lines
         WHERE request_id = $1`,
        [requestRec.rows[0].id],
      );
      for (const line of lines.rows) {
        await client.query(
          `INSERT INTO purchase_order_lines (order_id, product_id, quantity, unit_cost, line_total)
           VALUES ($1,$2,$3,$4,$5)`,
          [po.rows[0].id, line.product_id, line.quantity, line.unit_cost, line.line_total],
        );
      }

      await client.query(`UPDATE purchase_requests SET status = 'approved', updated_at = NOW() WHERE id = $1`, [
        requestRec.rows[0].id,
      ]);

      await this.insertAudit(client, user, 'commerce.purchase.request.approve', requestRec.rows[0].id, {
        purchase_order_id: po.rows[0].id,
        purchase_order_number: po.rows[0].order_number,
      });

      await client.query('COMMIT');
      return {
        requestId: requestRec.rows[0].id,
        purchaseOrderId: po.rows[0].id,
        purchaseOrderNumber: po.rows[0].order_number,
        status: 'ordered',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (String(error).includes('purchase_orders_company_id_order_number_key')) {
        throw new ConflictException('Purchase order number already exists for this company.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async receivePurchaseOrder(user: AuthUser, purchaseOrderId: string, receiptNumber: string) {
    if (!receiptNumber?.trim()) {
      throw new BadRequestException('receiptNumber is required.');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const po = await client.query<{ id: string; status: string }>(
        `SELECT id, status
         FROM purchase_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`,
        [purchaseOrderId, user.companyId],
      );
      if (!po.rows[0]) {
        throw new NotFoundException('Purchase order not found.');
      }
      if (po.rows[0].status === 'received') {
        throw new BadRequestException('Purchase order is already received.');
      }
      if (po.rows[0].status !== 'ordered') {
        throw new BadRequestException('Only ordered purchase orders can be received.');
      }

      const receipt = await client.query<{ id: string; receipt_number: string }>(
        `INSERT INTO purchase_receipts (company_id, purchase_order_id, receipt_number, created_by)
         VALUES ($1,$2,$3,$4)
         RETURNING id, receipt_number`,
        [user.companyId, po.rows[0].id, receiptNumber.trim(), user.sub],
      );

      await client.query(`UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = $1`, [
        po.rows[0].id,
      ]);

      await this.insertAudit(client, user, 'commerce.purchase.order.receive', po.rows[0].id, {
        receipt_id: receipt.rows[0].id,
        receipt_number: receipt.rows[0].receipt_number,
      });
      await client.query('COMMIT');
      return {
        purchaseOrderId: po.rows[0].id,
        receiptId: receipt.rows[0].id,
        receiptNumber: receipt.rows[0].receipt_number,
        status: 'received',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (String(error).includes('purchase_receipts_company_id_receipt_number_key')) {
        throw new ConflictException('Receipt number already exists for this company.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private validateSalesInput(quotationNumber: string, customerId: string, lines: SalesLineInput[]) {
    if (!quotationNumber?.trim()) {
      throw new BadRequestException('quotationNumber is required.');
    }
    if (!customerId?.trim()) {
      throw new BadRequestException('customerId is required.');
    }
    if (!lines || lines.length === 0) {
      throw new BadRequestException('At least one sales line is required.');
    }
  }

  private validatePurchaseInput(requestNumber: string, supplierId: string, lines: PurchaseLineInput[]) {
    if (!requestNumber?.trim()) {
      throw new BadRequestException('requestNumber is required.');
    }
    if (!supplierId?.trim()) {
      throw new BadRequestException('supplierId is required.');
    }
    if (!lines || lines.length === 0) {
      throw new BadRequestException('At least one purchase line is required.');
    }
  }

  private async resolveTaxRatePercent(companyId: string, taxRateCode?: string): Promise<number> {
    if (!taxRateCode) {
      return 0;
    }
    const taxRate = await this.db.query<{ rate: string }>(
      `SELECT rate
       FROM tax_rates
       WHERE company_id = $1 AND code = $2 AND is_active = TRUE
       LIMIT 1`,
      [companyId, taxRateCode],
    );
    if (!taxRate.rows[0]) {
      throw new BadRequestException(`Tax rate '${taxRateCode}' was not found for this company.`);
    }
    return Number(taxRate.rows[0].rate);
  }

  private calculateTotals(subtotal: number, taxRatePercent: number) {
    const taxTotal = Number(((subtotal * taxRatePercent) / 100).toFixed(4));
    const grandTotal = Number((subtotal + taxTotal).toFixed(4));
    return { subtotal, taxTotal, grandTotal };
  }

  private async calculateSalesLines(
    client: Awaited<ReturnType<DatabaseService['connect']>>,
    companyId: string,
    lines: SalesLineInput[],
  ) {
    const calcLines: Array<{ productId: string; quantity: number; unitPrice: number; lineTotal: number }> = [];
    let subtotal = 0;
    for (const line of lines) {
      if (!line.productId || line.quantity <= 0) {
        throw new BadRequestException('Invalid sales line.');
      }
      const product = await client.query<{ unit_price: string }>(
        `SELECT unit_price
         FROM products
         WHERE id = $1 AND company_id = $2 AND is_active = TRUE
         LIMIT 1`,
        [line.productId, companyId],
      );
      if (!product.rows[0]) {
        throw new BadRequestException(`Product '${line.productId}' not found for this company.`);
      }
      const unitPrice = line.unitPrice ?? Number(product.rows[0].unit_price);
      if (unitPrice < 0) {
        throw new BadRequestException('Sales line unitPrice cannot be negative.');
      }
      const lineTotal = Number((line.quantity * unitPrice).toFixed(4));
      subtotal += lineTotal;
      calcLines.push({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice,
        lineTotal,
      });
    }
    return { lines: calcLines, subtotal: Number(subtotal.toFixed(4)) };
  }

  private async calculatePurchaseLines(
    client: Awaited<ReturnType<DatabaseService['connect']>>,
    companyId: string,
    lines: PurchaseLineInput[],
  ) {
    const calcLines: Array<{ productId: string; quantity: number; unitCost: number; lineTotal: number }> = [];
    let subtotal = 0;
    for (const line of lines) {
      if (!line.productId || line.quantity <= 0) {
        throw new BadRequestException('Invalid purchase line.');
      }
      const product = await client.query<{ unit_price: string }>(
        `SELECT unit_price
         FROM products
         WHERE id = $1 AND company_id = $2 AND is_active = TRUE
         LIMIT 1`,
        [line.productId, companyId],
      );
      if (!product.rows[0]) {
        throw new BadRequestException(`Product '${line.productId}' not found for this company.`);
      }
      const unitCost = line.unitCost ?? Number(product.rows[0].unit_price);
      if (unitCost < 0) {
        throw new BadRequestException('Purchase line unitCost cannot be negative.');
      }
      const lineTotal = Number((line.quantity * unitCost).toFixed(4));
      subtotal += lineTotal;
      calcLines.push({
        productId: line.productId,
        quantity: line.quantity,
        unitCost,
        lineTotal,
      });
    }
    return { lines: calcLines, subtotal: Number(subtotal.toFixed(4)) };
  }

  private async assertCustomerOwnership(
    client: Awaited<ReturnType<DatabaseService['connect']>>,
    companyId: string,
    customerId: string,
  ) {
    const customer = await client.query<{ id: string }>(
      `SELECT id FROM customers WHERE id = $1 AND company_id = $2 AND is_active = TRUE LIMIT 1`,
      [customerId, companyId],
    );
    if (!customer.rows[0]) {
      throw new BadRequestException('Customer does not belong to current company.');
    }
  }

  private async assertSupplierOwnership(
    client: Awaited<ReturnType<DatabaseService['connect']>>,
    companyId: string,
    supplierId: string,
  ) {
    const supplier = await client.query<{ id: string }>(
      `SELECT id FROM suppliers WHERE id = $1 AND company_id = $2 AND is_active = TRUE LIMIT 1`,
      [supplierId, companyId],
    );
    if (!supplier.rows[0]) {
      throw new BadRequestException('Supplier does not belong to current company.');
    }
  }

  private async insertAudit(
    client: Awaited<ReturnType<DatabaseService['connect']>>,
    user: AuthUser,
    eventName: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.companyId, user.sub, eventName, 'commerce', entityId, JSON.stringify(payload)],
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
      [user.companyId, user.sub, eventName, 'commerce', entityId, JSON.stringify(payload)],
    );
  }
}
