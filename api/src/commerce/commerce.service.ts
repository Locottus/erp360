import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
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

  async createQuotation(user: AuthUser, input: CreateQuotationInput) {
    this.validateSalesInput(input.quotationNumber, input.customerId, input.lines);
    const taxRate = await this.resolveTaxRatePercent(user.companyId, input.taxRateCode);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await this.assertCustomerOwnership(client, user.companyId, input.customerId);
      const lineCalc = await this.calculateSalesLines(client, user.companyId, input.lines);
      const { subtotal, taxTotal, grandTotal } = this.calculateTotals(lineCalc.subtotal, taxRate);
      const quotation = await client.query<{ id: string; quotation_number: string }>(
        `INSERT INTO sales_quotations
          (company_id, customer_id, quotation_number, status, subtotal, tax_total, grand_total, notes, created_by)
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8)
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
        { quotation_number: input.quotationNumber, line_count: lineCalc.lines.length },
      );
      await client.query('COMMIT');
      return {
        id: quotation.rows[0].id,
        quotationNumber: quotation.rows[0].quotation_number,
        status: 'draft',
        subtotal,
        taxTotal,
        grandTotal,
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
    }>(
      `SELECT id, quotation_number, status, subtotal, tax_total, grand_total, customer_id
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
      `SELECT so.id, so.order_number, so.status, so.subtotal, so.tax_total, so.grand_total,
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
      `SELECT si.id, si.invoice_number, si.status, si.subtotal, si.tax_total, si.grand_total,
              si.issued_at, so.id AS sales_order_id, so.order_number, c.name AS customer_name,
              COALESCE(pay.total_paid, 0)::text AS total_paid,
              GREATEST(si.grand_total - COALESCE(pay.total_paid, 0), 0)::text AS balance_due,
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
      }>(
        `SELECT id, customer_id, status, subtotal, tax_total, grand_total
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

      const order = await client.query<{ id: string; order_number: string }>(
        `INSERT INTO sales_orders
          (company_id, customer_id, quotation_id, order_number, status, subtotal, tax_total, grand_total, created_by)
         VALUES ($1,$2,$3,$4,'confirmed',$5,$6,$7,$8)
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

      await client.query(`UPDATE sales_quotations SET status = 'approved', updated_at = NOW() WHERE id = $1`, [
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

  async issueInvoice(user: AuthUser, salesOrderId: string, invoiceNumber: string) {
    if (!invoiceNumber?.trim()) {
      throw new BadRequestException('invoiceNumber is required.');
    }
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
          (company_id, order_id, invoice_number, status, subtotal, tax_total, grand_total)
         VALUES ($1,$2,$3,'issued',$4,$5,$6)
         RETURNING id, invoice_number`,
        [
          user.companyId,
          order.rows[0].id,
          invoiceNumber.trim(),
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
          (company_id, supplier_id, request_number, status, subtotal, tax_total, grand_total, created_by)
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7)
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
              po.id AS purchase_order_id, po.order_number AS purchase_order_number,
              po.status AS purchase_order_status,
              (po.id IS NOT NULL AND EXISTS (
                SELECT 1 FROM inventory_movements im
                WHERE im.company_id = pr.company_id
                  AND im.reference_type = 'purchase_order'
                  AND im.reference_id = po.id
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
          (company_id, supplier_id, request_id, order_number, status, subtotal, tax_total, grand_total, created_by)
         VALUES ($1,$2,$3,$4,'ordered',$5,$6,$7,$8)
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
      `SELECT id FROM customers WHERE id = $1 AND company_id = $2 LIMIT 1`,
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
      `SELECT id FROM suppliers WHERE id = $1 AND company_id = $2 LIMIT 1`,
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
