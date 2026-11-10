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
let AccountingService = class AccountingService {
    db;
    constructor(db) {
        this.db = db;
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
         LIMIT 1`, [invoiceId, user.companyId]);
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
        if (!input.paymentReference?.trim()) {
            throw new common_1.BadRequestException('paymentReference is required.');
        }
        if (!input.amount || input.amount <= 0) {
            throw new common_1.BadRequestException('amount must be greater than zero.');
        }
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const invoice = await client.query(`SELECT id, status, grand_total
         FROM sales_invoices
         WHERE id = $1 AND company_id = $2
         LIMIT 1`, [invoiceId, user.companyId]);
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
         LIMIT 1`, [purchaseOrderId, user.companyId]);
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
        if (!input.year || input.year < 2000) {
            throw new common_1.BadRequestException('year must be >= 2000.');
        }
        if (!input.month || input.month < 1 || input.month > 12) {
            throw new common_1.BadRequestException('month must be between 1 and 12.');
        }
        const unbalanced = await this.db.query(`SELECT COUNT(*)::text AS unbalanced_count
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
        try {
            const result = await this.db.query(`INSERT INTO accounting_period_closures (company_id, period_year, period_month, closed_by)
         VALUES ($1,$2,$3,$4)
         RETURNING id`, [user.companyId, input.year, input.month, user.sub]);
            await this.insertAuditDirect(user, 'accounting.period.closed', result.rows[0].id, {
                year: input.year,
                month: input.month,
            });
            return { id: result.rows[0].id, year: input.year, month: input.month, status: 'closed' };
        }
        catch (error) {
            if (String(error).includes('accounting_period_closures_company_id_period_year_period_month_key')) {
                throw new common_1.ConflictException('Period is already closed.');
            }
            throw error;
        }
    }
    async createEntryHeader(client, user, sourceType, sourceId, description) {
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
        const count = await client.query(`SELECT COUNT(*)::text AS total
       FROM accounting_journal_entries
       WHERE company_id = $1`, [companyId]);
        const next = Number(count.rows[0].total) + 1;
        return `JE-${next.toString().padStart(6, '0')}`;
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