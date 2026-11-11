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
exports.AccountingService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../common/database.service");
const document_sequence_1 = require("../common/document-sequence");
const quantity_document_1 = require("../common/quantity-document");
let AccountingService = class AccountingService {
    db;
    constructor(db) {
        this.db = db;
    }
    async creditInvoice(user, invoiceId, input) {
        if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000 ||
            typeof input.returnStock !== 'boolean') {
            throw new common_1.BadRequestException('A reason (10 to 1000 characters) and explicit returnStock choice are required.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const source = await client.query('SELECT order_id FROM sales_invoices WHERE id=$1 AND company_id=$2', [invoiceId, user.companyId]);
            if (!source.rows[0])
                throw new common_1.NotFoundException('Invoice not found.');
            await client.query('SELECT id FROM sales_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [source.rows[0].order_id, user.companyId]);
            const invoice = await client.query('SELECT status,subtotal,tax_total,grand_total,currency_code FROM sales_invoices WHERE id=$1 AND company_id=$2 FOR UPDATE', [invoiceId, user.companyId]);
            if (invoice.rows[0].status === 'void')
                throw new common_1.ConflictException('Invoice was already voided/credited.');
            if (Number(invoice.rows[0].grand_total) <= 0)
                throw new common_1.BadRequestException('A credit requires a positive invoice total.');
            await this.assertSourceEntryExists(client, user.companyId, 'sales_invoice', invoiceId);
            const creditNumber = await (0, document_sequence_1.nextDocumentNumber)(client, user.companyId, 'AUTO-CN');
            const credit = await client.query(`INSERT INTO sales_credit_notes(company_id,invoice_id,credit_number,reason,subtotal,tax_total,grand_total,currency_code,stock_returned,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [user.companyId, invoiceId, creditNumber, input.reason.trim(), invoice.rows[0].subtotal, invoice.rows[0].tax_total,
                invoice.rows[0].grand_total, invoice.rows[0].currency_code, input.returnStock, user.sub]);
            const entryId = await this.createEntryHeader(client, user, 'sales_credit', credit.rows[0].id, `Nota de credito ${creditNumber}`);
            const accounts = await this.getSystemAccounts(client, user.companyId, ['1100', '4100', '2200']);
            if (Number(invoice.rows[0].subtotal) > 0)
                await this.insertLine(client, entryId, accounts['4100'], 'Reversion ingreso', Number(invoice.rows[0].subtotal), 0);
            if (Number(invoice.rows[0].tax_total) > 0)
                await this.insertLine(client, entryId, accounts['2200'], 'Reversion impuesto', Number(invoice.rows[0].tax_total), 0);
            await this.insertLine(client, entryId, accounts['1100'], 'Credito a cliente', 0, Number(invoice.rows[0].grand_total));
            const reservations = await client.query(`SELECT id,product_id,location_code,quantity,status FROM inventory_reservations
         WHERE company_id=$1 AND sales_order_id=$2 AND status IN ('reserved','fulfilled')
         ORDER BY product_id,location_code FOR UPDATE`, [user.companyId, source.rows[0].order_id]);
            if (input.returnStock && !reservations.rows.some(row => row.status === 'fulfilled')) {
                throw new common_1.BadRequestException('No dispatched goods exist to return.');
            }
            for (const row of reservations.rows) {
                if (row.status === 'reserved') {
                    const updated = await client.query(`UPDATE inventory_stock_balances SET reserved=reserved-$1,updated_at=NOW()
             WHERE company_id=$2 AND product_id=$3 AND location_code=$4 AND reserved>=$1 RETURNING id`, [row.quantity, user.companyId, row.product_id, row.location_code]);
                    if (!updated.rows[0])
                        throw new common_1.BadRequestException('Reservation balance is inconsistent.');
                    await client.query(`UPDATE inventory_reservations SET status='released',updated_at=NOW() WHERE id=$1`, [row.id]);
                }
                else if (input.returnStock) {
                    await this.restoreCreditedStock(client, user, credit.rows[0].id, row, input.reason.trim());
                    continue;
                }
                else
                    continue;
                await client.query(`INSERT INTO inventory_movements(company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by)
           VALUES($1,$2,$3,$4,$5,'sales_credit',$6,$7,$8)`, [user.companyId, row.location_code, row.product_id, 'reservation_release',
                    row.quantity, credit.rows[0].id, input.reason.trim(), user.sub]);
            }
            await client.query(`UPDATE sales_invoices SET status='void' WHERE id=$1 AND company_id=$2`, [invoiceId, user.companyId]);
            await client.query(`UPDATE sales_orders SET status='cancelled',updated_at=NOW() WHERE id=$1 AND company_id=$2`, [source.rows[0].order_id, user.companyId]);
            await this.insertAudit(client, user, 'accounting.sales.credit', credit.rows[0].id, { invoice_id: invoiceId, return_stock: input.returnStock, reason: input.reason.trim() });
            await client.query('COMMIT');
            return { id: credit.rows[0].id, creditNumber };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (error.code === '23505')
                throw new common_1.ConflictException('Invoice already has a credit note.');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async listCredits(user) {
        return (await this.db.query(`SELECT cn.id,cn.credit_number,cn.reason,cn.grand_total,cn.currency_code,cn.stock_returned,si.invoice_number,
              (NOT cn.stock_returned AND EXISTS(SELECT 1 FROM inventory_reservations ir
                WHERE ir.sales_order_id=si.order_id AND ir.company_id=cn.company_id AND ir.status='fulfilled')) AS can_return_stock,
              COALESCE(paid.total,0)::text AS paid_amount,
              (COALESCE(paid.total,0)-COALESCE(refunded.total,0))::text AS refund_due
       FROM sales_credit_notes cn JOIN sales_invoices si ON si.id=cn.invoice_id AND si.company_id=cn.company_id
       LEFT JOIN (SELECT invoice_id,SUM(amount) AS total FROM accounting_payments WHERE company_id=$1 GROUP BY invoice_id) paid ON paid.invoice_id=cn.invoice_id
       LEFT JOIN (SELECT credit_note_id,SUM(amount) AS total FROM sales_customer_refunds WHERE company_id=$1 GROUP BY credit_note_id) refunded ON refunded.credit_note_id=cn.id
       WHERE cn.company_id=$1 ORDER BY cn.created_at DESC`, [user.companyId])).rows;
    }
    async returnCreditedStock(user, id, input) {
        if (!input || typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 64 ||
            typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) {
            throw new common_1.BadRequestException('A reference (1 to 64 characters) and reason (10 to 1000) are required.');
        }
        const reference = input.reference.trim();
        const reason = input.reason.trim();
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const source = await client.query(`SELECT si.order_id FROM sales_credit_notes cn JOIN sales_invoices si ON si.id=cn.invoice_id AND si.company_id=cn.company_id
         WHERE cn.id=$1 AND cn.company_id=$2`, [id, user.companyId]);
            if (!source.rows[0])
                throw new common_1.NotFoundException('Credit not found.');
            await client.query('SELECT id FROM sales_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [source.rows[0].order_id, user.companyId]);
            const credit = await client.query('SELECT stock_returned FROM sales_credit_notes WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sales-stock-return:${user.companyId}:${reference}`]);
            const prior = await client.query('SELECT id,credit_note_id,reason FROM sales_credit_stock_returns WHERE company_id=$1 AND reference=$2', [user.companyId, reference]);
            if (prior.rows[0]) {
                if (prior.rows[0].credit_note_id !== id || prior.rows[0].reason !== reason)
                    throw new common_1.ConflictException('Return reference already used with different data.');
                await client.query('COMMIT');
                return { id: prior.rows[0].id, replayed: true };
            }
            if (credit.rows[0].stock_returned)
                throw new common_1.ConflictException('Goods were already returned with this credit.');
            const reservations = await client.query(`SELECT product_id,location_code,quantity FROM inventory_reservations
         WHERE company_id=$1 AND sales_order_id=$2 AND status='fulfilled' ORDER BY product_id,location_code,id FOR UPDATE`, [user.companyId, source.rows[0].order_id]);
            if (!reservations.rows.length)
                throw new common_1.BadRequestException('No dispatched goods exist to return.');
            const document = await client.query(`INSERT INTO sales_credit_stock_returns(company_id,credit_note_id,reference,reason,created_by)
         VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.companyId, id, reference, reason, user.sub]);
            for (const row of reservations.rows) {
                await this.restoreCreditedStock(client, user, id, row, reason);
            }
            await client.query('UPDATE sales_credit_notes SET stock_returned=TRUE WHERE id=$1 AND company_id=$2', [id, user.companyId]);
            await this.insertAudit(client, user, 'accounting.sales.credit.stock.return', document.rows[0].id, { credit_note_id: id, reference, reason, lines: reservations.rows.length });
            await client.query('COMMIT');
            return { id: document.rows[0].id, replayed: false };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async restoreCreditedStock(client, user, creditId, row, reason) {
        const stock = await client.query(`UPDATE inventory_stock_balances SET on_hand=on_hand+$1,updated_at=NOW()
       WHERE company_id=$2 AND product_id=$3 AND location_code=$4 RETURNING id`, [row.quantity, user.companyId, row.product_id, row.location_code]);
        if (!stock.rows[0])
            throw new common_1.BadRequestException('Original dispatch stock location is missing. Reconcile before returning goods.');
        await client.query(`INSERT INTO inventory_movements(company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by)
       VALUES($1,$2,$3,'adjustment_in',$4,'sales_credit',$5,$6,$7)`, [user.companyId, row.location_code, row.product_id, row.quantity, creditId, reason, user.sub]);
    }
    async refundCredit(user, id, input) {
        if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 ||
            Math.round(input.amount * 10000) / 10000 !== input.amount || typeof input.paymentReference !== 'string' ||
            !input.paymentReference.trim() || input.paymentReference.length > 64)
            throw new common_1.BadRequestException('Valid reference and positive amount are required.');
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const credit = await client.query('SELECT invoice_id FROM sales_credit_notes WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
            if (!credit.rows[0])
                throw new common_1.NotFoundException('Credit not found.');
            const balance = await client.query(`SELECT ((SELECT COALESCE(SUM(amount),0) FROM accounting_payments WHERE company_id=$1 AND invoice_id=$2)
                 -(SELECT COALESCE(SUM(amount),0) FROM sales_customer_refunds WHERE company_id=$1 AND credit_note_id=$3))::text AS due`, [user.companyId, credit.rows[0].invoice_id, id]);
            if (input.amount > Number(balance.rows[0].due))
                throw new common_1.BadRequestException('Refund exceeds amount actually paid by the customer.');
            const refund = await client.query(`INSERT INTO sales_customer_refunds(company_id,credit_note_id,reference,amount,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.companyId, id, input.paymentReference.trim(), input.amount, user.sub]);
            const accounts = await this.getSystemAccounts(client, user.companyId, ['1100', '1110']);
            const entry = await this.createEntryHeader(client, user, 'customer_refund', refund.rows[0].id, 'Reembolso confirmado al cliente');
            await this.insertLine(client, entry, accounts['1100'], 'Compensacion saldo a favor', input.amount, 0);
            await this.insertLine(client, entry, accounts['1110'], 'Salida de caja/bancos', 0, input.amount);
            await this.insertAudit(client, user, 'accounting.customer.refund', refund.rows[0].id, { credit_note_id: id, amount: input.amount });
            await client.query('COMMIT');
            return { id: refund.rows[0].id };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (error.code === '23505')
                throw new common_1.ConflictException('Refund reference already registered.');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async bootstrapDefaultAccounts(user) {
        const defaults = [
            { code: '1100', name: 'Cuentas por cobrar', type: 'asset' },
            { code: '1110', name: 'Caja y bancos', type: 'asset' },
            { code: '1200', name: 'Inventario', type: 'asset' },
            { code: '1300', name: 'Credito fiscal', type: 'asset' },
            { code: '2100', name: 'Cuentas por pagar', type: 'liability' },
            { code: '2200', name: 'IVA por pagar', type: 'liability' },
            { code: '4100', name: 'Ingresos por ventas', type: 'revenue' },
        ];
        const created = [];
        for (const account of defaults) {
            const inserted = await this.db.query(`INSERT INTO accounting_accounts (company_id, code, name, account_type, is_system)
         VALUES ($1,$2,$3,$4,TRUE)
         ON CONFLICT (company_id, code) DO NOTHING
         RETURNING code`, [user.companyId, account.code, account.name, account.type]);
            if (inserted.rows[0]) {
                created.push(inserted.rows[0].code);
            }
        }
        await this.insertAuditDirect(user, 'accounting.chart.bootstrap', user.companyId, { created_count: created.length });
        return { companyId: user.companyId, createdCount: created.length, createdCodes: created };
    }
    async postSalesInvoice(user, invoiceId) {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const invoice = await client.query(`SELECT id, status, subtotal, tax_total, grand_total
         FROM sales_invoices
         WHERE id = $1 AND company_id = $2
         LIMIT 1 FOR UPDATE`, [invoiceId, user.companyId]);
            if (!invoice.rows[0]) {
                throw new common_1.NotFoundException('Invoice not found.');
            }
            if (invoice.rows[0].status === 'void') {
                throw new common_1.BadRequestException('Void invoice cannot be posted.');
            }
            await this.assertNoExistingSourceEntry(client, user.companyId, 'sales_invoice', invoiceId);
            const accounts = await this.getSystemAccounts(client, user.companyId, ['1100', '2200', '4100']);
            const entryId = await this.createEntryHeader(client, user, 'sales_invoice', invoiceId, `Posteo contable de factura ${invoiceId}`);
            const subtotal = Number(invoice.rows[0].subtotal);
            const taxTotal = Number(invoice.rows[0].tax_total);
            const grandTotal = Number(invoice.rows[0].grand_total);
            await this.insertLine(client, entryId, accounts['1100'], 'Cuenta por cobrar', grandTotal, 0);
            await this.insertLine(client, entryId, accounts['4100'], 'Ingreso por ventas', 0, subtotal);
            if (taxTotal > 0) {
                await this.insertLine(client, entryId, accounts['2200'], 'IVA por pagar', 0, taxTotal);
            }
            await this.insertAudit(client, user, 'accounting.sales.invoice.posted', invoiceId, { entry_id: entryId, grand_total: grandTotal });
            await client.query('COMMIT');
            return { invoiceId, journalEntryId: entryId, status: 'posted' };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async registerInvoicePayment(user, invoiceId, input) {
        if (typeof input.paymentReference !== 'string' || !input.paymentReference.trim()) {
            throw new common_1.BadRequestException('paymentReference is required.');
        }
        if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) {
            throw new common_1.BadRequestException('amount must be greater than zero.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const invoice = await client.query(`SELECT id, status, grand_total
         FROM sales_invoices
         WHERE id = $1 AND company_id = $2
         LIMIT 1
         FOR UPDATE`, [invoiceId, user.companyId]);
            if (!invoice.rows[0]) {
                throw new common_1.NotFoundException('Invoice not found.');
            }
            if (invoice.rows[0].status === 'void') {
                throw new common_1.BadRequestException('Cannot pay a void invoice.');
            }
            await this.assertSourceEntryExists(client, user.companyId, 'sales_invoice', invoiceId);
            const paid = await client.query(`SELECT COALESCE(SUM(amount), 0)::text AS total_paid
         FROM accounting_payments
         WHERE company_id = $1 AND invoice_id = $2`, [user.companyId, invoiceId]);
            const totalPaid = Number(paid.rows[0].total_paid ?? '0');
            const invoiceTotal = Number(invoice.rows[0].grand_total);
            const remaining = Number((invoiceTotal - totalPaid).toFixed(4));
            if (remaining <= 0) {
                throw new common_1.BadRequestException('Invoice is already fully paid.');
            }
            if (input.amount > remaining) {
                throw new common_1.BadRequestException(`Payment amount exceeds remaining balance (${remaining}).`);
            }
            const paymentInsert = await client.query(`INSERT INTO accounting_payments (company_id, invoice_id, payment_reference, amount, status, created_by)
         VALUES ($1,$2,$3,$4,'registered',$5)
         RETURNING id`, [user.companyId, invoiceId, input.paymentReference.trim(), input.amount, user.sub]);
            if (!paymentInsert.rows[0]) {
                throw new common_1.BadRequestException('Could not register payment.');
            }
            const paymentId = paymentInsert.rows[0].id;
            const accounts = await this.getSystemAccounts(client, user.companyId, ['1100', '1110']);
            const entryId = await this.createEntryHeader(client, user, 'invoice_payment', paymentId, `Registro de pago ${input.paymentReference}`);
            await this.insertLine(client, entryId, accounts['1110'], 'Ingreso a caja/bancos', input.amount, 0);
            await this.insertLine(client, entryId, accounts['1100'], 'Disminucion de cuenta por cobrar', 0, input.amount);
            await client.query(`INSERT INTO accounting_reconciliations (company_id, invoice_id, payment_id, amount)
         VALUES ($1,$2,$3,$4)`, [user.companyId, invoiceId, paymentId, input.amount]);
            await client.query(`UPDATE accounting_payments SET status = 'reconciled' WHERE id = $1`, [paymentId]);
            const newRemaining = Number((remaining - input.amount).toFixed(4));
            if (newRemaining <= 0.0001) {
                await client.query(`UPDATE sales_invoices SET status = 'paid' WHERE id = $1`, [invoiceId]);
            }
            await this.insertAudit(client, user, 'accounting.invoice.payment.registered', paymentId, {
                invoice_id: invoiceId,
                amount: input.amount,
                remaining: Number(Math.max(0, newRemaining).toFixed(4)),
            });
            await client.query('COMMIT');
            return {
                invoiceId,
                paymentId,
                paymentReference: input.paymentReference.trim(),
                amount: input.amount,
                remainingBalance: Number(Math.max(0, newRemaining).toFixed(4)),
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (String(error).includes('accounting_payments_company_id_payment_reference_key')) {
                throw new common_1.ConflictException('paymentReference already exists for this company.');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async postPurchaseOrderAccrual(user, purchaseOrderId) {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const po = await client.query(`SELECT id, status, subtotal, tax_total, grand_total
         FROM purchase_orders
         WHERE id = $1 AND company_id = $2
         LIMIT 1 FOR UPDATE`, [purchaseOrderId, user.companyId]);
            if (!po.rows[0]) {
                throw new common_1.NotFoundException('Purchase order not found.');
            }
            if (po.rows[0].status !== 'received') {
                throw new common_1.BadRequestException('Only received purchase orders can be posted.');
            }
            await this.assertNoExistingSourceEntry(client, user.companyId, 'purchase_order', purchaseOrderId);
            const accounts = await this.getSystemAccounts(client, user.companyId, ['1200', '1300', '2100']);
            const entryId = await this.createEntryHeader(client, user, 'purchase_order', purchaseOrderId, `Posteo contable de compra ${purchaseOrderId}`);
            const subtotal = Number(po.rows[0].subtotal);
            const taxTotal = Number(po.rows[0].tax_total);
            const grandTotal = Number(po.rows[0].grand_total);
            await this.insertLine(client, entryId, accounts['1200'], 'Inventario recibido', subtotal, 0);
            if (taxTotal > 0) {
                await this.insertLine(client, entryId, accounts['1300'], 'Credito fiscal de compra', taxTotal, 0);
            }
            await this.insertLine(client, entryId, accounts['2100'], 'Cuenta por pagar a proveedor', 0, grandTotal);
            await this.insertAudit(client, user, 'accounting.purchase.order.posted', purchaseOrderId, { entry_id: entryId, grand_total: grandTotal });
            await client.query('COMMIT');
            return { purchaseOrderId, journalEntryId: entryId, status: 'posted' };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async returnToSupplier(user, id, input) {
        const document = (0, quantity_document_1.normalizeQuantityDocument)(input);
        if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) {
            throw new common_1.BadRequestException('A return reason of 10 to 1000 characters is required.');
        }
        const payload = { orderId: id.toLowerCase(), reason: input.reason.trim(), lines: document.lines };
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const order = await client.query('SELECT status FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
            if (!order.rows[0])
                throw new common_1.NotFoundException('Purchase order not found.');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`supplier-return:${user.companyId}:${document.reference}`]);
            const prior = await client.query('SELECT id,payload=$3::jsonb AS same FROM purchase_supplier_returns WHERE company_id=$1 AND reference=$2', [user.companyId, document.reference, JSON.stringify(payload)]);
            if (prior.rows[0]) {
                if (!prior.rows[0].same)
                    throw new common_1.ConflictException('Return reference already used with different data.');
                await client.query('COMMIT');
                return { returnId: prior.rows[0].id, replayed: true };
            }
            if (order.rows[0].status !== 'received')
                throw new common_1.BadRequestException('Complete and post the purchase before returning goods.');
            await this.assertSourceEntryExists(client, user.companyId, 'purchase_order', id);
            const created = await client.query(`INSERT INTO purchase_supplier_returns(company_id,purchase_order_id,reference,reason,payload,created_by)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [user.companyId, id, document.reference, payload.reason, JSON.stringify(payload), user.sub]);
            const rows = await client.query(`SELECT rl.id,l.product_id,rl.location_code,rl.order_line_id FROM purchase_receipt_lines rl
         JOIN purchase_receipts r ON r.id=rl.receipt_id JOIN purchase_order_lines l ON l.id=rl.order_line_id
         WHERE r.company_id=$1 AND r.purchase_order_id=$2 AND rl.id=ANY($3::uuid[]) ORDER BY l.product_id,rl.location_code,rl.id`, [user.companyId, id, document.lines.map(line => line.lineId)]);
            if (rows.rows.length !== document.lines.length)
                throw new common_1.BadRequestException('Receipt line does not belong to this purchase or has no reconciled batch history.');
            for (const row of rows.rows) {
                const quantity = document.lines.find(line => line.lineId === row.id).quantity;
                const allowance = await client.query(`SELECT rl.quantity-COALESCE((SELECT SUM(quantity) FROM purchase_supplier_return_lines WHERE receipt_line_id=rl.id),0)>=$2::numeric AS valid
           FROM purchase_receipt_lines rl WHERE rl.id=$1`, [row.id, quantity]);
                if (!allowance.rows[0].valid)
                    throw new common_1.ConflictException('Return exceeds the unreturned receipt quantity.');
                const stock = await client.query(`UPDATE inventory_stock_balances SET on_hand=on_hand-$1,updated_at=NOW()
           WHERE company_id=$2 AND product_id=$3 AND location_code=$4 AND on_hand-reserved>=$1 RETURNING id`, [quantity, user.companyId, row.product_id, row.location_code]);
                if (!stock.rows[0])
                    throw new common_1.BadRequestException('Insufficient available stock at the original receipt location. Reserved stock cannot be returned.');
                await client.query(`INSERT INTO purchase_supplier_return_lines(return_id,receipt_line_id,quantity,subtotal)
           SELECT $1,$2,$3,
             ROUND(l.line_total*(COALESCE(ret.quantity,0)+$3::numeric)/l.quantity,4)
             -ROUND(l.line_total*COALESCE(ret.quantity,0)/l.quantity,4)
           FROM purchase_order_lines l LEFT JOIN (
             SELECT SUM(ret.quantity) quantity FROM purchase_supplier_return_lines ret
             JOIN purchase_receipt_lines rl ON rl.id=ret.receipt_line_id WHERE rl.order_line_id=$4
           ) ret ON TRUE WHERE l.id=$4`, [created.rows[0].id, row.id, quantity, row.order_line_id]);
                await client.query(`INSERT INTO inventory_movements(company_id,location_code,product_id,movement_type,quantity,reference_type,reference_id,notes,created_by)
           VALUES($1,$2,$3,'supplier_return',$4,'supplier_return',$5,$6,$7)`, [user.companyId, row.location_code, row.product_id, quantity, created.rows[0].id, payload.reason, user.sub]);
            }
            const amounts = await client.query(`WITH amounts AS (
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
         FROM totals t WHERE r.id=$1 RETURNING r.subtotal,r.tax_total,r.grand_total`, [created.rows[0].id, id, user.companyId]);
            const amount = amounts.rows[0];
            if (Number(amount.grand_total) > 0) {
                const accounts = await this.getSystemAccounts(client, user.companyId, ['1200', '1300', '2100']);
                const entry = await this.createEntryHeader(client, user, 'supplier_return', created.rows[0].id, `Devolucion proveedor ${document.reference}`);
                await this.insertLine(client, entry, accounts['2100'], 'Credito comercial del proveedor', amount.grand_total, 0);
                if (Number(amount.subtotal) > 0)
                    await this.insertLine(client, entry, accounts['1200'], 'Salida de inventario devuelto', 0, amount.subtotal);
                if (Number(amount.tax_total) > 0)
                    await this.insertLine(client, entry, accounts['1300'], 'Reversion proporcional credito fiscal', 0, amount.tax_total);
            }
            await this.insertAudit(client, user, 'accounting.supplier.return', created.rows[0].id, { ...payload, ...amount });
            await client.query('COMMIT');
            return { returnId: created.rows[0].id, ...amount, replayed: false };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (error.code === 'P0001')
                throw new common_1.BadRequestException('Accounting period is closed.');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async listPayables(user) {
        return (await this.db.query(`SELECT po.id,po.order_number,s.name AS supplier_name,po.grand_total,po.status,
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
         WHERE po.company_id=$1 AND po.status<>'cancelled' ORDER BY po.created_at DESC`, [user.companyId])).rows;
    }
    async supplierRefundHistory(user, id) {
        const order = await this.db.query('SELECT id FROM purchase_orders WHERE id=$1 AND company_id=$2', [id, user.companyId]);
        if (!order.rows[0])
            throw new common_1.NotFoundException('Purchase order not found.');
        return (await this.db.query(`SELECT id,reference,amount,reason,created_at FROM accounting_supplier_refunds
       WHERE company_id=$1 AND purchase_order_id=$2 ORDER BY created_at DESC,id`, [user.companyId, id])).rows;
    }
    async receiveSupplierRefund(user, id, input) {
        if (!input || typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 64 ||
            typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1e9 ||
            Math.round(input.amount * 10000) / 10000 !== input.amount ||
            typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) {
            throw new common_1.BadRequestException('A reference, positive amount (up to 4 decimals) and reason of 10 to 1000 characters are required.');
        }
        const reference = input.reference.trim();
        const reason = input.reason.trim();
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const order = await client.query('SELECT status FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
            if (!order.rows[0])
                throw new common_1.NotFoundException('Purchase order not found.');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`supplier-refund:${user.companyId}:${reference}`]);
            const prior = await client.query(`SELECT id,(purchase_order_id=$3 AND amount=$4::numeric AND reason=$5) AS same
         FROM accounting_supplier_refunds WHERE company_id=$1 AND reference=$2`, [user.companyId, reference, id, input.amount, reason]);
            if (prior.rows[0]) {
                if (!prior.rows[0].same)
                    throw new common_1.ConflictException('Refund reference already used with different data.');
                await client.query('COMMIT');
                return { refundId: prior.rows[0].id, replayed: true };
            }
            if (order.rows[0].status !== 'received')
                throw new common_1.BadRequestException('Only completed and posted purchases can receive supplier refunds.');
            await this.assertSourceEntryExists(client, user.companyId, 'purchase_order', id);
            const balance = await client.query(`SELECT (
          (SELECT COALESCE(SUM(amount),0) FROM accounting_supplier_payments WHERE company_id=$1 AND purchase_order_id=$2)
          +(SELECT COALESCE(SUM(grand_total),0) FROM purchase_supplier_returns WHERE company_id=$1 AND purchase_order_id=$2)
          -po.grand_total
          -(SELECT COALESCE(SUM(amount),0) FROM accounting_supplier_refunds WHERE company_id=$1 AND purchase_order_id=$2)
        ) >= $3::numeric AS valid FROM purchase_orders po WHERE po.id=$2 AND po.company_id=$1`, [user.companyId, id, input.amount]);
            if (!balance.rows[0].valid)
                throw new common_1.BadRequestException('Refund exceeds outstanding supplier credit. Do not register money not actually received.');
            const refund = await client.query(`INSERT INTO accounting_supplier_refunds(company_id,purchase_order_id,reference,amount,reason,created_by)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [user.companyId, id, reference, input.amount, reason, user.sub]);
            const accounts = await this.getSystemAccounts(client, user.companyId, ['1110', '2100']);
            const entry = await this.createEntryHeader(client, user, 'supplier_refund', refund.rows[0].id, `Reembolso recibido de proveedor ${reference}`);
            await this.insertLine(client, entry, accounts['1110'], 'Ingreso confirmado caja/bancos', input.amount, 0);
            await this.insertLine(client, entry, accounts['2100'], 'Compensacion credito de proveedor', 0, input.amount);
            await this.insertAudit(client, user, 'accounting.supplier.refund', refund.rows[0].id, { purchase_order_id: id, reference, amount: input.amount, reason });
            await client.query('COMMIT');
            return { refundId: refund.rows[0].id, replayed: false };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (error.code === 'P0001')
                throw new common_1.BadRequestException('Accounting period is closed.');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async paySupplier(user, id, input) {
        if (typeof input.paymentReference !== 'string' || !input.paymentReference.trim() || input.paymentReference.length > 64 ||
            typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 ||
            Math.round(input.amount * 10000) / 10000 !== input.amount) {
            throw new common_1.BadRequestException('A reference and positive amount with at most 4 decimals are required.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const order = await client.query('SELECT grand_total,status FROM purchase_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
            if (!order.rows[0])
                throw new common_1.NotFoundException('Purchase order not found.');
            if (order.rows[0].status !== 'received')
                throw new common_1.BadRequestException('Only received and posted purchases can be paid.');
            await this.assertSourceEntryExists(client, user.companyId, 'purchase_order', id);
            const paid = await client.query(`SELECT ((SELECT COALESCE(SUM(amount),0) FROM accounting_supplier_payments WHERE company_id=$1 AND purchase_order_id=$2)
            +(SELECT COALESCE(SUM(grand_total),0) FROM purchase_supplier_returns WHERE company_id=$1 AND purchase_order_id=$2)
            -(SELECT COALESCE(SUM(amount),0) FROM accounting_supplier_refunds WHERE company_id=$1 AND purchase_order_id=$2))::text AS total`, [user.companyId, id]);
            const remaining = Number((Number(order.rows[0].grand_total) - Number(paid.rows[0].total)).toFixed(4));
            if (input.amount > remaining)
                throw new common_1.BadRequestException('Payment exceeds remaining payable.');
            const payment = await client.query(`INSERT INTO accounting_supplier_payments(company_id,purchase_order_id,payment_reference,amount,created_by)
           VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.companyId, id, input.paymentReference.trim(), input.amount, user.sub]);
            const accounts = await this.getSystemAccounts(client, user.companyId, ['1110', '2100']);
            const entryId = await this.createEntryHeader(client, user, 'supplier_payment', payment.rows[0].id, `Pago proveedor ${input.paymentReference.trim()}`);
            await this.insertLine(client, entryId, accounts['2100'], 'Disminucion de cuenta por pagar', input.amount, 0);
            await this.insertLine(client, entryId, accounts['1110'], 'Egreso caja/bancos', 0, input.amount);
            await this.insertAudit(client, user, 'accounting.supplier.payment', payment.rows[0].id, { purchase_order_id: id, amount: input.amount });
            await client.query('COMMIT');
            return { paymentId: payment.rows[0].id, remainingBalance: Number((remaining - input.amount).toFixed(4)) };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (error.code === '23505')
                throw new common_1.ConflictException('Payment reference already registered.');
            if (error.code === 'P0001')
                throw new common_1.BadRequestException('Accounting period is closed.');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async listPeriods(user) {
        return (await this.db.query(`SELECT period_year,period_month,status,closed_at,reopened_at,reopen_reason
         FROM accounting_period_closures WHERE company_id=$1 ORDER BY period_year DESC,period_month DESC`, [user.companyId])).rows;
    }
    async reopenPeriod(user, input) {
        if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 9999 ||
            !Number.isInteger(input.month) || input.month < 1 || input.month > 12 ||
            typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 1000) {
            throw new common_1.BadRequestException('Valid year/month and a reason of 10 to 1000 characters are required.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accounting-period:${user.companyId}`]);
            const result = await client.query(`UPDATE accounting_period_closures SET status='reopened',reopened_by=$1,reopened_at=NOW(),reopen_reason=$2
           WHERE company_id=$3 AND period_year=$4 AND period_month=$5 AND status='closed' RETURNING id`, [user.sub, input.reason.trim(), user.companyId, input.year, input.month]);
            if (!result.rows[0])
                throw new common_1.BadRequestException('Closed period not found.');
            await this.insertAudit(client, user, 'accounting.period.reopened', result.rows[0].id, { reason: input.reason.trim(), year: input.year, month: input.month });
            await client.query('COMMIT');
            return { status: 'reopened' };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getTrialBalance(user, fromDate, toDate) {
        const params = [user.companyId];
        let dateFilter = '';
        if (fromDate) {
            params.push(fromDate);
            dateFilter += ` AND je.entry_date >= $${params.length}`;
        }
        if (toDate) {
            params.push(toDate);
            dateFilter += ` AND je.entry_date <= $${params.length}`;
        }
        const rows = await this.db.query(`SELECT a.code AS account_code,
              a.name AS account_name,
              a.account_type,
              COALESCE(SUM(jl.debit), 0)::text AS debit,
              COALESCE(SUM(jl.credit), 0)::text AS credit,
              COALESCE(SUM(jl.debit - jl.credit), 0)::text AS balance
       FROM accounting_accounts a
       LEFT JOIN accounting_journal_lines jl ON jl.account_id = a.id
       LEFT JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
       WHERE a.company_id = $1
         AND (je.id IS NULL OR je.status = 'posted')
         ${dateFilter}
       GROUP BY a.code, a.name, a.account_type
       ORDER BY a.code ASC`, params);
        const totals = rows.rows.reduce((acc, row) => {
            acc.totalDebit += Number(row.debit);
            acc.totalCredit += Number(row.credit);
            return acc;
        }, { totalDebit: 0, totalCredit: 0 });
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
    async closePeriod(user, input) {
        if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 9999) {
            throw new common_1.BadRequestException('year must be >= 2000.');
        }
        if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
            throw new common_1.BadRequestException('month must be between 1 and 12.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accounting-period:${user.companyId}`]);
            const unbalanced = await client.query(`SELECT COUNT(*)::text AS unbalanced_count
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
       ) t`, [user.companyId, input.year, input.month]);
            if (Number(unbalanced.rows[0].unbalanced_count) > 0) {
                throw new common_1.BadRequestException('Cannot close period with unbalanced journal entries.');
            }
            const result = await client.query(`INSERT INTO accounting_period_closures (company_id, period_year, period_month, closed_by)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT(company_id,period_year,period_month) DO UPDATE
         SET status='closed',closed_by=EXCLUDED.closed_by,closed_at=NOW()
         WHERE accounting_period_closures.status='reopened'
         RETURNING id`, [user.companyId, input.year, input.month, user.sub]);
            if (!result.rows[0])
                throw new common_1.ConflictException('Period is already closed.');
            await this.insertAudit(client, user, 'accounting.period.closed', result.rows[0].id, {
                year: input.year,
                month: input.month,
            });
            await client.query('COMMIT');
            return { id: result.rows[0].id, year: input.year, month: input.month, status: 'closed' };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (String(error).includes('accounting_period_closures_company_id_period_year_period_month_key')) {
                throw new common_1.ConflictException('Period is already closed.');
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    async createEntryHeader(client, user, sourceType, sourceId, description) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accounting-period:${user.companyId}`]);
        const closed = await client.query(`SELECT id FROM accounting_period_closures WHERE company_id=$1 AND status='closed'
       AND period_year=EXTRACT(YEAR FROM CURRENT_DATE) AND period_month=EXTRACT(MONTH FROM CURRENT_DATE)`, [user.companyId]);
        if (closed.rows[0])
            throw new common_1.BadRequestException('Accounting period is closed.');
        const entryNumber = await this.generateEntryNumber(client, user.companyId);
        const entry = await client.query(`INSERT INTO accounting_journal_entries
        (company_id, entry_number, source_type, source_id, description, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'posted',$6)
       RETURNING id`, [user.companyId, entryNumber, sourceType, sourceId, description, user.sub]);
        if (!entry.rows[0]) {
            throw new common_1.BadRequestException('Could not create journal entry.');
        }
        return entry.rows[0].id;
    }
    async generateEntryNumber(client, companyId) {
        return (0, document_sequence_1.nextDocumentNumber)(client, companyId, 'AUTO-JE');
    }
    async insertLine(client, entryId, accountId, lineDescription, debit, credit) {
        await client.query(`INSERT INTO accounting_journal_lines (journal_entry_id, account_id, line_description, debit, credit)
       VALUES ($1,$2,$3,$4,$5)`, [entryId, accountId, lineDescription, debit, credit]);
    }
    async getSystemAccounts(client, companyId, codes) {
        const result = await client.query(`SELECT id, code
       FROM accounting_accounts
       WHERE company_id = $1
         AND code = ANY($2::text[])
         AND is_active = TRUE`, [companyId, codes]);
        const map = result.rows.reduce((acc, row) => {
            acc[row.code] = row.id;
            return acc;
        }, {});
        for (const code of codes) {
            if (!map[code]) {
                throw new common_1.BadRequestException(`Missing accounting account ${code}. Run /accounting/bootstrap-accounts first.`);
            }
        }
        return map;
    }
    async assertNoExistingSourceEntry(client, companyId, sourceType, sourceId) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`accounting-source:${companyId}:${sourceType}:${sourceId}`]);
        const existing = await client.query(`SELECT id
       FROM accounting_journal_entries
       WHERE company_id = $1 AND source_type = $2 AND source_id = $3 AND status = 'posted'
       LIMIT 1`, [companyId, sourceType, sourceId]);
        if (existing.rows[0]) {
            throw new common_1.BadRequestException('Source document is already posted in accounting.');
        }
    }
    async assertSourceEntryExists(client, companyId, sourceType, sourceId) {
        const existing = await client.query(`SELECT id
       FROM accounting_journal_entries
       WHERE company_id = $1 AND source_type = $2 AND source_id = $3 AND status = 'posted'
       LIMIT 1`, [companyId, sourceType, sourceId]);
        if (!existing.rows[0]) {
            throw new common_1.BadRequestException('Source document must be posted before payment.');
        }
    }
    async insertAudit(client, user, eventName, entityId, payload) {
        await client.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [user.companyId, user.sub, eventName, 'accounting', entityId, JSON.stringify(payload)]);
    }
    async insertAuditDirect(user, eventName, entityId, payload) {
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [user.companyId, user.sub, eventName, 'accounting', entityId, JSON.stringify(payload)]);
    }
};
exports.AccountingService = AccountingService;
exports.AccountingService = AccountingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], AccountingService);
//# sourceMappingURL=accounting.service.js.map