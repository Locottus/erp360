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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommerceService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../common/database.service");
let CommerceService = class CommerceService {
    db;
    constructor(db) {
        this.db = db;
    }
    async createQuotation(user, input) {
        this.validateSalesInput(input.quotationNumber, input.customerId, input.lines);
        const taxRate = await this.resolveTaxRatePercent(user.companyId, input.taxRateCode);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await this.assertCustomerOwnership(client, user.companyId, input.customerId);
            const lineCalc = await this.calculateSalesLines(client, user.companyId, input.lines);
            const { subtotal, taxTotal, grandTotal } = this.calculateTotals(lineCalc.subtotal, taxRate);
            const quotation = await client.query(`INSERT INTO sales_quotations
          (company_id, customer_id, quotation_number, status, subtotal, tax_total, grand_total, notes, created_by)
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8)
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
        const result = await this.db.query(`SELECT so.id, so.order_number, so.status, so.subtotal, so.tax_total, so.grand_total,
              so.created_at, c.name AS customer_name
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id AND c.company_id = so.company_id
       WHERE so.company_id = $1
       ORDER BY so.created_at DESC, so.id DESC`, [user.companyId]);
        return result.rows;
    }
    async listSalesInvoices(user) {
        const result = await this.db.query(`SELECT si.id, si.invoice_number, si.status, si.subtotal, si.tax_total, si.grand_total,
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
       ORDER BY si.issued_at DESC, si.id DESC`, [user.companyId]);
        return result.rows;
    }
    async confirmQuotation(user, quotationId, orderNumber) {
        if (!orderNumber?.trim()) {
            throw new common_1.BadRequestException('orderNumber is required.');
        }
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
          (company_id, customer_id, quotation_id, order_number, status, subtotal, tax_total, grand_total, created_by)
         VALUES ($1,$2,$3,$4,'confirmed',$5,$6,$7,$8)
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
        if (!invoiceNumber?.trim()) {
            throw new common_1.BadRequestException('invoiceNumber is required.');
        }
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
          (company_id, order_id, invoice_number, status, subtotal, tax_total, grand_total)
         VALUES ($1,$2,$3,'issued',$4,$5,$6)
         RETURNING id, invoice_number`, [
                user.companyId,
                order.rows[0].id,
                invoiceNumber.trim(),
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
          (company_id, supplier_id, request_number, status, subtotal, tax_total, grand_total, created_by)
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7)
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
          (company_id, supplier_id, request_id, order_number, status, subtotal, tax_total, grand_total, created_by)
         VALUES ($1,$2,$3,$4,'ordered',$5,$6,$7,$8)
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
        const customer = await client.query(`SELECT id FROM customers WHERE id = $1 AND company_id = $2 LIMIT 1`, [customerId, companyId]);
        if (!customer.rows[0]) {
            throw new common_1.BadRequestException('Customer does not belong to current company.');
        }
    }
    async assertSupplierOwnership(client, companyId, supplierId) {
        const supplier = await client.query(`SELECT id FROM suppliers WHERE id = $1 AND company_id = $2 LIMIT 1`, [supplierId, companyId]);
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