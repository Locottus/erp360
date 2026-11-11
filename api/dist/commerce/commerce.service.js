"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommerceService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../common/database.service");
const document_sequence_1 = require("../common/document-sequence");
const pdfkit_1 = __importDefault(require("pdfkit"));
let CommerceService = class CommerceService {
    db;
    constructor(db) {
        this.db = db;
    }
    async cancelOrder(user, id, type, reason) {
        if (typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 1000) {
            throw new common_1.BadRequestException('A reason of 10 to 1000 characters is required.');
        }
        const table = type === 'sales' ? 'sales_orders' : 'purchase_orders';
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const order = await client.query(`SELECT status FROM ${table} WHERE id=$1 AND company_id=$2 FOR UPDATE`, [id, user.companyId]);
            if (!order.rows[0])
                throw new common_1.NotFoundException('Order not found.');
            if (order.rows[0].status === 'cancelled')
                throw new common_1.ConflictException('Order already cancelled.');
            if (type === 'sales') {
                const invoice = await client.query('SELECT id FROM sales_invoices WHERE order_id=$1 AND company_id=$2', [id, user.companyId]);
                const dispatched = await client.query(`SELECT id FROM inventory_reservations WHERE sales_order_id=$1 AND company_id=$2 AND status='fulfilled'`, [id, user.companyId]);
                if (invoice.rows.length || dispatched.rows.length)
                    throw new common_1.BadRequestException('Invoiced or dispatched orders require a credit/return process.');
                const reservations = await client.query(`SELECT id,product_id,location_code,quantity FROM inventory_reservations
           WHERE sales_order_id=$1 AND company_id=$2 AND status='reserved' ORDER BY product_id,location_code FOR UPDATE`, [id, user.companyId]);
                for (const row of reservations.rows) {
                    const updated = await client.query(`UPDATE inventory_stock_balances SET reserved=reserved-$1,updated_at=NOW()
             WHERE company_id=$2 AND product_id=$3 AND location_code=$4 AND reserved>=$1 RETURNING id`, [row.quantity, user.companyId, row.product_id, row.location_code]);
                    if (!updated.rows[0])
                        throw new common_1.BadRequestException('Reservation balance is inconsistent.');
                    await client.query(`UPDATE inventory_reservations SET status='released',updated_at=NOW() WHERE id=$1`, [row.id]);
                    await client.query(`INSERT INTO inventory_movements(company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by)
             VALUES($1,$2,$3,'reservation_release',$4,'sales_order',$5,$6,$7)`, [user.companyId, row.location_code, row.product_id, row.quantity, id, reason.trim(), user.sub]);
                }
            }
            else {
                const receipts = await client.query('SELECT id FROM purchase_receipts WHERE purchase_order_id=$1 AND company_id=$2', [id, user.companyId]);
                const posted = await client.query(`SELECT id FROM accounting_journal_entries WHERE company_id=$1 AND source_id=$2 AND source_type='purchase_order' AND status='posted'`, [user.companyId, id]);
                if (receipts.rows.length || posted.rows.length || order.rows[0].status === 'received') {
                    throw new common_1.BadRequestException('Received or posted purchases require a supplier return process.');
                }
            }
            await client.query(`UPDATE ${table} SET status='cancelled',updated_at=NOW() WHERE id=$1 AND company_id=$2`, [id, user.companyId]);
            await this.insertAudit(client, user, `commerce.${type}.order.cancel`, id, { reason: reason.trim() });
            await client.query('COMMIT');
            return { id, status: 'cancelled' };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async invoicePdf(user, id) {
        const result = await this.db.query(`SELECT si.invoice_number,si.subtotal,si.tax_total,si.grand_total,si.issued_at,si.currency_code,si.status,si.document_snapshot,
              c.name AS company_name,cu.name AS customer_name
       FROM sales_invoices si JOIN companies c ON c.id=si.company_id
       JOIN sales_orders so ON so.id=si.order_id AND so.company_id=si.company_id
       JOIN customers cu ON cu.id=so.customer_id AND cu.company_id=so.company_id
       WHERE si.id=$1 AND si.company_id=$2`, [id, user.companyId]);
        if (!result.rows[0])
            throw new common_1.NotFoundException('Invoice not found.');
        const invoice = result.rows[0];
        const snapshot = invoice.document_snapshot;
        const lines = snapshot?.lines ?? (await this.db.query(`SELECT p.name,l.quantity,l.unit_price,l.line_total FROM sales_order_lines l
       JOIN sales_invoices si ON si.order_id=l.order_id
       JOIN products p ON p.id=l.product_id AND p.company_id=si.company_id
       WHERE si.id=$1 AND si.company_id=$2 ORDER BY l.id`, [id, user.companyId])).rows;
        const doc = new pdfkit_1.default({ margin: 48, size: 'A4', info: { Title: `Factura comercial ${invoice.invoice_number}` } });
        const chunks = [];
        const completed = new Promise((resolve, reject) => {
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
        });
        doc.fontSize(22).text(snapshot?.companyName ?? invoice.company_name);
        doc.moveDown().fontSize(16).text(`Factura comercial ${invoice.invoice_number}`);
        doc.fontSize(10).text('Documento comercial. No constituye comprobante fiscal certificado.');
        doc.text(`Cliente: ${snapshot?.customerName ?? invoice.customer_name}`).text(`Fecha: ${invoice.issued_at.toISOString().slice(0, 10)}`);
        if (!snapshot)
            doc.text('Registro historico: datos descriptivos actuales, sin snapshot de emision.');
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
    async createQuotation(user, input) {
        this.validateSalesInput(input.quotationNumber, input.customerId, input.lines);
        if (/^WEBQ-/i.test(input.quotationNumber.trim()))
            throw new common_1.BadRequestException('WEBQ- is reserved for automatic storefront numbering.');
        const taxRate = await this.resolveTaxRatePercent(user.companyId, input.taxRateCode);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await this.assertCustomerOwnership(client, user.companyId, input.customerId);
            const lineCalc = await this.calculateSalesLines(client, user.companyId, input.lines);
            const { subtotal, taxTotal, grandTotal } = this.calculateTotals(lineCalc.subtotal, taxRate);
            const quotation = await client.query(`INSERT INTO sales_quotations
          (company_id, customer_id, quotation_number, status, subtotal, tax_total, grand_total, notes, created_by, currency_code)
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,(SELECT currency_code FROM companies WHERE id=$1))
         RETURNING id, quotation_number`, [
                user.companyId,
                input.customerId,
                input.quotationNumber.trim(),
                subtotal,
                taxTotal,
                grandTotal,
                input.notes ?? null,
                user.sub,
            ]);
            for (const line of lineCalc.lines) {
                await client.query(`INSERT INTO sales_quotation_lines (quotation_id, product_id, quantity, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5)`, [quotation.rows[0].id, line.productId, line.quantity, line.unitPrice, line.lineTotal]);
            }
            await this.insertAudit(client, user, 'commerce.sales.quotation.create', quotation.rows[0].id, { quotation_number: input.quotationNumber, line_count: lineCalc.lines.length });
            await client.query('COMMIT');
            return {
                id: quotation.rows[0].id,
                quotationNumber: quotation.rows[0].quotation_number,
                status: 'draft',
                subtotal,
                taxTotal,
                grandTotal,
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (String(error).includes('sales_quotations_company_id_quotation_number_key')) {
                throw new common_1.ConflictException('Quotation number already exists for this company.');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async listQuotations(user) {
        const result = await this.db.query(`SELECT id, quotation_number, status, subtotal, tax_total, grand_total, customer_id
       FROM sales_quotations
       WHERE company_id = $1
       ORDER BY created_at DESC`, [user.companyId]);
        await this.insertAuditDirect(user, 'commerce.sales.quotation.list', user.companyId, {
            total: result.rows.length,
        });
        return result.rows;
    }
    async listSalesOrders(user) {
        const result = await this.db.query(`SELECT so.id, so.order_number, so.status, so.subtotal, so.tax_total, so.grand_total, so.currency_code,
              so.created_at, c.name AS customer_name
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id AND c.company_id = so.company_id
       WHERE so.company_id = $1
       ORDER BY so.created_at DESC, so.id DESC`, [user.companyId]);
        return result.rows;
    }
    async listSalesInvoices(user) {
        const result = await this.db.query(`SELECT si.id, si.invoice_number, si.status, si.subtotal, si.tax_total, si.grand_total, si.currency_code,
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
       ORDER BY si.issued_at DESC, si.id DESC`, [user.companyId]);
        return result.rows;
    }
    async confirmQuotation(user, quotationId, orderNumber) {
        if (!orderNumber?.trim()) {
            throw new common_1.BadRequestException('orderNumber is required.');
        }
        if (/^WEBO-/i.test(orderNumber.trim()))
            throw new common_1.BadRequestException('WEBO- is reserved for automatic storefront numbering.');
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const quote = await client.query(`SELECT id, customer_id, status, subtotal, tax_total, grand_total
         FROM sales_quotations
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`, [quotationId, user.companyId]);
            if (!quote.rows[0]) {
                throw new common_1.NotFoundException('Quotation not found.');
            }
            if (quote.rows[0].status === 'approved') {
                throw new common_1.BadRequestException('Quotation is already approved.');
            }
            if (quote.rows[0].status === 'rejected') {
                throw new common_1.BadRequestException('Rejected quotation cannot be confirmed.');
            }
            const order = await client.query(`INSERT INTO sales_orders
          (company_id, customer_id, quotation_id, order_number, status, subtotal, tax_total, grand_total, created_by, currency_code)
         VALUES ($1,$2,$3,$4,'confirmed',$5,$6,$7,$8,(SELECT currency_code FROM sales_quotations WHERE id=$3))
         RETURNING id, order_number`, [
                user.companyId,
                quote.rows[0].customer_id,
                quote.rows[0].id,
                orderNumber.trim(),
                quote.rows[0].subtotal,
                quote.rows[0].tax_total,
                quote.rows[0].grand_total,
                user.sub,
            ]);
            const lines = await client.query(`SELECT product_id, quantity, unit_price, line_total
         FROM sales_quotation_lines
         WHERE quotation_id = $1`, [quote.rows[0].id]);
            for (const line of lines.rows) {
                await client.query(`INSERT INTO sales_order_lines (order_id, product_id, quantity, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5)`, [order.rows[0].id, line.product_id, line.quantity, line.unit_price, line.line_total]);
            }
            await client.query(`UPDATE sales_quotations SET status = 'approved', updated_at = NOW() WHERE id = $1`, [
                quote.rows[0].id,
            ]);
            await this.insertAudit(client, user, 'commerce.sales.quotation.confirm', quote.rows[0].id, { order_number: order.rows[0].order_number, order_id: order.rows[0].id });
            await client.query('COMMIT');
            return {
                quotationId: quote.rows[0].id,
                orderId: order.rows[0].id,
                orderNumber: order.rows[0].order_number,
                status: 'confirmed',
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (String(error).includes('sales_orders_company_id_order_number_key')) {
                throw new common_1.ConflictException('Sales order number already exists for this company.');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async issueInvoice(user, salesOrderId, invoiceNumber) {
        if (invoiceNumber !== undefined && (typeof invoiceNumber !== 'string' || invoiceNumber.length > 64)) {
            throw new common_1.BadRequestException('invoiceNumber must be a string of at most 64 characters.');
        }
        if (/^AUTO-INV-/i.test(invoiceNumber?.trim() ?? ''))
            throw new common_1.BadRequestException('AUTO-INV- is reserved for automatic invoice numbering. Leave the field empty.');
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const order = await client.query(`SELECT id, status, subtotal, tax_total, grand_total
         FROM sales_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`, [salesOrderId, user.companyId]);
            if (!order.rows[0]) {
                throw new common_1.NotFoundException('Sales order not found.');
            }
            if (order.rows[0].status === 'invoiced') {
                throw new common_1.BadRequestException('Sales order is already invoiced.');
            }
            if (order.rows[0].status !== 'confirmed') {
                throw new common_1.BadRequestException('Only confirmed orders can be invoiced.');
            }
            const invoice = await client.query(`INSERT INTO sales_invoices
          (company_id, order_id, invoice_number, status, subtotal, tax_total, grand_total, currency_code,document_snapshot)
         VALUES ($1,$2,$3,'issued',$4,$5,$6,(SELECT currency_code FROM sales_orders WHERE id=$2),
           jsonb_build_object(
             'companyName',(SELECT name FROM companies WHERE id=$1),
             'customerName',(SELECT c.name FROM customers c JOIN sales_orders so ON so.customer_id=c.id AND so.company_id=c.company_id WHERE so.id=$2 AND so.company_id=$1),
             'lines',(SELECT jsonb_agg(jsonb_build_object('name',p.name,'quantity',l.quantity::text,'unit_price',l.unit_price::text,'line_total',l.line_total::text) ORDER BY l.id)
                      FROM sales_order_lines l JOIN products p ON p.id=l.product_id AND p.company_id=$1 WHERE l.order_id=$2)
           ))
         RETURNING id, invoice_number`, [
                user.companyId,
                order.rows[0].id,
                invoiceNumber?.trim() || await (0, document_sequence_1.nextDocumentNumber)(client, user.companyId, 'AUTO-INV'),
                order.rows[0].subtotal,
                order.rows[0].tax_total,
                order.rows[0].grand_total,
            ]);
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
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (String(error).includes('sales_invoices_company_id_invoice_number_key')) {
                throw new common_1.ConflictException('Invoice number already exists for this company.');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async createPurchaseRequest(user, input) {
        this.validatePurchaseInput(input.requestNumber, input.supplierId, input.lines);
        const taxRate = await this.resolveTaxRatePercent(user.companyId, input.taxRateCode);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await this.assertSupplierOwnership(client, user.companyId, input.supplierId);
            const lineCalc = await this.calculatePurchaseLines(client, user.companyId, input.lines);
            const { subtotal, taxTotal, grandTotal } = this.calculateTotals(lineCalc.subtotal, taxRate);
            const requestRec = await client.query(`INSERT INTO purchase_requests
          (company_id, supplier_id, request_number, status, subtotal, tax_total, grand_total, created_by, currency_code)
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,(SELECT currency_code FROM companies WHERE id=$1))
         RETURNING id, request_number`, [
                user.companyId,
                input.supplierId,
                input.requestNumber.trim(),
                subtotal,
                taxTotal,
                grandTotal,
                user.sub,
            ]);
            for (const line of lineCalc.lines) {
                await client.query(`INSERT INTO purchase_request_lines (request_id, product_id, quantity, unit_cost, line_total)
           VALUES ($1,$2,$3,$4,$5)`, [requestRec.rows[0].id, line.productId, line.quantity, line.unitCost, line.lineTotal]);
            }
            await this.insertAudit(client, user, 'commerce.purchase.request.create', requestRec.rows[0].id, { request_number: input.requestNumber, line_count: lineCalc.lines.length });
            await client.query('COMMIT');
            return {
                id: requestRec.rows[0].id,
                requestNumber: requestRec.rows[0].request_number,
                status: 'draft',
                subtotal,
                taxTotal,
                grandTotal,
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (String(error).includes('purchase_requests_company_id_request_number_key')) {
                throw new common_1.ConflictException('Purchase request number already exists for this company.');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async listPurchaseRequests(user) {
        const result = await this.db.query(`SELECT pr.id, pr.request_number, pr.status, pr.subtotal, pr.tax_total, pr.grand_total,
              pr.supplier_id, s.name AS supplier_name,
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
       ORDER BY pr.created_at DESC, pr.id DESC`, [user.companyId]);
        await this.insertAuditDirect(user, 'commerce.purchase.request.list', user.companyId, {
            total: result.rows.length,
        });
        return result.rows;
    }
    async approvePurchaseRequest(user, requestId, orderNumber) {
        if (!orderNumber?.trim()) {
            throw new common_1.BadRequestException('orderNumber is required.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const requestRec = await client.query(`SELECT id, supplier_id, status, subtotal, tax_total, grand_total
         FROM purchase_requests
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`, [requestId, user.companyId]);
            if (!requestRec.rows[0]) {
                throw new common_1.NotFoundException('Purchase request not found.');
            }
            if (requestRec.rows[0].status === 'approved') {
                throw new common_1.BadRequestException('Purchase request already approved.');
            }
            if (requestRec.rows[0].status === 'rejected') {
                throw new common_1.BadRequestException('Rejected purchase request cannot be approved.');
            }
            const po = await client.query(`INSERT INTO purchase_orders
          (company_id, supplier_id, request_id, order_number, status, subtotal, tax_total, grand_total, created_by, currency_code)
         VALUES ($1,$2,$3,$4,'ordered',$5,$6,$7,$8,(SELECT currency_code FROM purchase_requests WHERE id=$3))
         RETURNING id, order_number`, [
                user.companyId,
                requestRec.rows[0].supplier_id,
                requestRec.rows[0].id,
                orderNumber.trim(),
                requestRec.rows[0].subtotal,
                requestRec.rows[0].tax_total,
                requestRec.rows[0].grand_total,
                user.sub,
            ]);
            const lines = await client.query(`SELECT product_id, quantity, unit_cost, line_total
         FROM purchase_request_lines
         WHERE request_id = $1`, [requestRec.rows[0].id]);
            for (const line of lines.rows) {
                await client.query(`INSERT INTO purchase_order_lines (order_id, product_id, quantity, unit_cost, line_total)
           VALUES ($1,$2,$3,$4,$5)`, [po.rows[0].id, line.product_id, line.quantity, line.unit_cost, line.line_total]);
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
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (String(error).includes('purchase_orders_company_id_order_number_key')) {
                throw new common_1.ConflictException('Purchase order number already exists for this company.');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async receivePurchaseOrder(user, purchaseOrderId, receiptNumber) {
        if (!receiptNumber?.trim()) {
            throw new common_1.BadRequestException('receiptNumber is required.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const po = await client.query(`SELECT id, status
         FROM purchase_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`, [purchaseOrderId, user.companyId]);
            if (!po.rows[0]) {
                throw new common_1.NotFoundException('Purchase order not found.');
            }
            if (po.rows[0].status === 'received') {
                throw new common_1.BadRequestException('Purchase order is already received.');
            }
            if (po.rows[0].status !== 'ordered') {
                throw new common_1.BadRequestException('Only ordered purchase orders can be received.');
            }
            const receipt = await client.query(`INSERT INTO purchase_receipts (company_id, purchase_order_id, receipt_number, created_by)
         VALUES ($1,$2,$3,$4)
         RETURNING id, receipt_number`, [user.companyId, po.rows[0].id, receiptNumber.trim(), user.sub]);
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
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (String(error).includes('purchase_receipts_company_id_receipt_number_key')) {
                throw new common_1.ConflictException('Receipt number already exists for this company.');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    validateSalesInput(quotationNumber, customerId, lines) {
        if (!quotationNumber?.trim()) {
            throw new common_1.BadRequestException('quotationNumber is required.');
        }
        if (!customerId?.trim()) {
            throw new common_1.BadRequestException('customerId is required.');
        }
        if (!lines || lines.length === 0) {
            throw new common_1.BadRequestException('At least one sales line is required.');
        }
    }
    validatePurchaseInput(requestNumber, supplierId, lines) {
        if (!requestNumber?.trim()) {
            throw new common_1.BadRequestException('requestNumber is required.');
        }
        if (!supplierId?.trim()) {
            throw new common_1.BadRequestException('supplierId is required.');
        }
        if (!lines || lines.length === 0) {
            throw new common_1.BadRequestException('At least one purchase line is required.');
        }
    }
    async resolveTaxRatePercent(companyId, taxRateCode) {
        if (!taxRateCode) {
            return 0;
        }
        const taxRate = await this.db.query(`SELECT rate
       FROM tax_rates
       WHERE company_id = $1 AND code = $2 AND is_active = TRUE
       LIMIT 1`, [companyId, taxRateCode]);
        if (!taxRate.rows[0]) {
            throw new common_1.BadRequestException(`Tax rate '${taxRateCode}' was not found for this company.`);
        }
        return Number(taxRate.rows[0].rate);
    }
    calculateTotals(subtotal, taxRatePercent) {
        const taxTotal = Number(((subtotal * taxRatePercent) / 100).toFixed(4));
        const grandTotal = Number((subtotal + taxTotal).toFixed(4));
        return { subtotal, taxTotal, grandTotal };
    }
    async calculateSalesLines(client, companyId, lines) {
        const calcLines = [];
        let subtotal = 0;
        for (const line of lines) {
            if (!line.productId || line.quantity <= 0) {
                throw new common_1.BadRequestException('Invalid sales line.');
            }
            const product = await client.query(`SELECT unit_price
         FROM products
         WHERE id = $1 AND company_id = $2 AND is_active = TRUE
         LIMIT 1`, [line.productId, companyId]);
            if (!product.rows[0]) {
                throw new common_1.BadRequestException(`Product '${line.productId}' not found for this company.`);
            }
            const unitPrice = line.unitPrice ?? Number(product.rows[0].unit_price);
            if (unitPrice < 0) {
                throw new common_1.BadRequestException('Sales line unitPrice cannot be negative.');
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
    async calculatePurchaseLines(client, companyId, lines) {
        const calcLines = [];
        let subtotal = 0;
        for (const line of lines) {
            if (!line.productId || line.quantity <= 0) {
                throw new common_1.BadRequestException('Invalid purchase line.');
            }
            const product = await client.query(`SELECT unit_price
         FROM products
         WHERE id = $1 AND company_id = $2 AND is_active = TRUE
         LIMIT 1`, [line.productId, companyId]);
            if (!product.rows[0]) {
                throw new common_1.BadRequestException(`Product '${line.productId}' not found for this company.`);
            }
            const unitCost = line.unitCost ?? Number(product.rows[0].unit_price);
            if (unitCost < 0) {
                throw new common_1.BadRequestException('Purchase line unitCost cannot be negative.');
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
    async assertCustomerOwnership(client, companyId, customerId) {
        const customer = await client.query(`SELECT id FROM customers WHERE id = $1 AND company_id = $2 AND is_active = TRUE LIMIT 1`, [customerId, companyId]);
        if (!customer.rows[0]) {
            throw new common_1.BadRequestException('Customer does not belong to current company.');
        }
    }
    async assertSupplierOwnership(client, companyId, supplierId) {
        const supplier = await client.query(`SELECT id FROM suppliers WHERE id = $1 AND company_id = $2 AND is_active = TRUE LIMIT 1`, [supplierId, companyId]);
        if (!supplier.rows[0]) {
            throw new common_1.BadRequestException('Supplier does not belong to current company.');
        }
    }
    async insertAudit(client, user, eventName, entityId, payload) {
        await client.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [user.companyId, user.sub, eventName, 'commerce', entityId, JSON.stringify(payload)]);
    }
    async insertAuditDirect(user, eventName, entityId, payload) {
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [user.companyId, user.sub, eventName, 'commerce', entityId, JSON.stringify(payload)]);
    }
};
exports.CommerceService = CommerceService;
exports.CommerceService = CommerceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], CommerceService);
//# sourceMappingURL=commerce.service.js.map