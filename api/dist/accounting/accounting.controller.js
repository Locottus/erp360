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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentWebhookController = exports.AccountingController = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const database_service_1 = require("../common/database.service");
const auth_guard_1 = require("../auth/auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const accounting_service_1 = require("./accounting.service");
let AccountingController = class AccountingController {
    accountingService;
    constructor(accountingService) {
        this.accountingService = accountingService;
    }
    accounts(request) {
        return this.accountingService.listAccounts(request.user);
    }
    generalLedger(request, accountCode, fromDate, toDate, page, pageSize) {
        return this.accountingService.generalLedger(request.user, { accountCode, fromDate, toDate, page, pageSize });
    }
    financialStatements(request, asOfDate) {
        return this.accountingService.getFinancialStatements(request.user, asOfDate);
    }
    bankAccounts(request) {
        return this.accountingService.listBankAccounts(request.user);
    }
    bankReconciliationLines(request) {
        return this.accountingService.listBankReconciliationLines(request.user);
    }
    reconcileBankLine(request, id, input) {
        return this.accountingService.reconcileBankLine(request.user, id, input);
    }
    upsertBankAccount(request, input) {
        return this.accountingService.upsertBankAccount(request.user, input);
    }
    returnToSupplier(request, id, input) {
        return this.accountingService.returnToSupplier(request.user, id, input);
    }
    credit(request, id, input) {
        return this.accountingService.creditInvoice(request.user, id, input);
    }
    credits(request) { return this.accountingService.listCredits(request.user); }
    refund(request, id, input) {
        return this.accountingService.refundCredit(request.user, id, input);
    }
    returnCreditedStock(request, id, input) {
        return this.accountingService.returnCreditedStock(request.user, id, input);
    }
    payables(request) { return this.accountingService.listPayables(request.user); }
    supplierRefunds(request, id) {
        return this.accountingService.supplierRefundHistory(request.user, id);
    }
    supplierRefund(request, id, input) {
        return this.accountingService.receiveSupplierRefund(request.user, id, input);
    }
    paySupplier(request, id, input) {
        return this.accountingService.paySupplier(request.user, id, input);
    }
    periods(request) { return this.accountingService.listPeriods(request.user); }
    reopen(request, input) {
        return this.accountingService.reopenPeriod(request.user, input);
    }
    bootstrapAccounts(request) {
        return this.accountingService.bootstrapDefaultAccounts(request.user);
    }
    postSalesInvoice(request, invoiceId) {
        return this.accountingService.postSalesInvoice(request.user, invoiceId);
    }
    registerSalesInvoicePayment(request, invoiceId, body) {
        return this.accountingService.registerInvoicePayment(request.user, invoiceId, body);
    }
    postPurchaseOrder(request, purchaseOrderId) {
        return this.accountingService.postPurchaseOrderAccrual(request.user, purchaseOrderId);
    }
    getTrialBalance(request, fromDate, toDate) {
        return this.accountingService.getTrialBalance(request.user, fromDate, toDate);
    }
    closePeriod(request, body) {
        return this.accountingService.closePeriod(request.user, body);
    }
};
exports.AccountingController = AccountingController;
__decorate([
    (0, common_1.Get)('accounts'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "accounts", null);
__decorate([
    (0, common_1.Get)('reports/general-ledger'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('accountCode')),
    __param(2, (0, common_1.Query)('fromDate')),
    __param(3, (0, common_1.Query)('toDate')),
    __param(4, (0, common_1.Query)('page')),
    __param(5, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "generalLedger", null);
__decorate([
    (0, common_1.Get)('reports/financial-statements'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('asOfDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "financialStatements", null);
__decorate([
    (0, common_1.Get)('bank-accounts'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "bankAccounts", null);
__decorate([
    (0, common_1.Get)('bank-reconciliation-lines'),
    (0, roles_decorator_1.Roles)('admin', 'accountant'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "bankReconciliationLines", null);
__decorate([
    (0, common_1.Post)('bank-reconciliation-lines/:id/reconcile'),
    (0, roles_decorator_1.Roles)('admin', 'accountant'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "reconcileBankLine", null);
__decorate([
    (0, common_1.Post)('bank-accounts'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "upsertBankAccount", null);
__decorate([
    (0, common_1.Post)('purchase-orders/:id/returns'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "returnToSupplier", null);
__decorate([
    (0, common_1.Post)('sales-invoices/:id/credit'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "credit", null);
__decorate([
    (0, common_1.Get)('credits'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "credits", null);
__decorate([
    (0, common_1.Post)('credits/:id/refunds'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "refund", null);
__decorate([
    (0, common_1.Post)('credits/:id/stock-return'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "returnCreditedStock", null);
__decorate([
    (0, common_1.Get)('payables'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "payables", null);
__decorate([
    (0, common_1.Get)('purchase-orders/:id/refunds'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "supplierRefunds", null);
__decorate([
    (0, common_1.Post)('purchase-orders/:id/refunds'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "supplierRefund", null);
__decorate([
    (0, common_1.Post)('purchase-orders/:id/payments'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "paySupplier", null);
__decorate([
    (0, common_1.Get)('periods'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "periods", null);
__decorate([
    (0, common_1.Post)('periods/reopen'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "reopen", null);
__decorate([
    (0, common_1.Post)('bootstrap-accounts'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "bootstrapAccounts", null);
__decorate([
    (0, common_1.Post)('sales-invoices/:id/post'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "postSalesInvoice", null);
__decorate([
    (0, common_1.Post)('sales-invoices/:id/payments'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "registerSalesInvoicePayment", null);
__decorate([
    (0, common_1.Post)('purchase-orders/:id/post'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "postPurchaseOrder", null);
__decorate([
    (0, common_1.Get)('reports/trial-balance'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('fromDate')),
    __param(2, (0, common_1.Query)('toDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "getTrialBalance", null);
__decorate([
    (0, common_1.Post)('periods/close'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "closePeriod", null);
exports.AccountingController = AccountingController = __decorate([
    (0, common_1.Controller)('accounting'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [accounting_service_1.AccountingService])
], AccountingController);
let PaymentWebhookController = class PaymentWebhookController {
    db;
    constructor(db) {
        this.db = db;
    }
    async receive(provider, companyCodeHeader, signature, body) {
        const providerCode = provider.trim().toLowerCase();
        if (!/^[a-z0-9_-]{1,64}$/.test(providerCode)) {
            throw new common_1.BadRequestException('Invalid payment provider.');
        }
        const companyCode = (companyCodeHeader ?? (typeof body.companyCode === 'string' ? body.companyCode : '')).trim();
        if (!companyCode)
            throw new common_1.BadRequestException('x-company-code is required.');
        const company = await this.db.query('SELECT id FROM companies WHERE code=$1 AND is_active=TRUE', [companyCode]);
        if (!company.rows[0])
            throw new common_1.BadRequestException('Active company not found.');
        const eventId = typeof body.eventId === 'string'
            ? body.eventId
            : typeof body.id === 'string' ? body.id : '';
        const eventType = typeof body.eventType === 'string'
            ? body.eventType
            : typeof body.type === 'string' ? body.type : 'unknown';
        if (!eventId || eventId.length > 128)
            throw new common_1.BadRequestException('eventId is required.');
        let signatureValid = false;
        const secretMap = this.readSecretMap();
        const secret = secretMap[providerCode];
        if (secret && signature) {
            const payload = JSON.stringify(body);
            const expected = (0, crypto_1.createHmac)('sha256', secret).update(payload, 'utf8').digest();
            const supplied = Buffer.from(signature.replace(/^sha256=/i, '').trim(), 'hex');
            signatureValid = supplied.length === expected.length &&
                (0, crypto_1.timingSafeEqual)(supplied, expected);
        }
        const insert = await this.db.query(`INSERT INTO payment_gateway_events
         (company_id,provider,event_id,event_type,signature_valid,payload,processed)
       VALUES($1,$2,$3,$4,$5,$6,FALSE)
       ON CONFLICT(provider,event_id) DO NOTHING
       RETURNING id`, [company.rows[0].id, providerCode, eventId, eventType, signatureValid, JSON.stringify(body)]);
        if (!insert.rows[0])
            return { received: true, duplicate: true, signatureValid };
        if (!signatureValid) {
            return { received: true, duplicate: false, signatureValid: false, message: 'Evento retenido para revisión; no se aplicó ningún pago.' };
        }
        return { received: true, duplicate: false, signatureValid: true, message: 'Evento recibido. El procesamiento contable automático requiere una conciliación autorizada.' };
    }
    readSecretMap() {
        try {
            const parsed = JSON.parse(process.env.PAYMENT_WEBHOOK_SECRETS_JSON || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        }
        catch {
            return {};
        }
    }
};
exports.PaymentWebhookController = PaymentWebhookController;
__decorate([
    (0, common_1.Post)(':provider'),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Headers)('x-company-code')),
    __param(2, (0, common_1.Headers)('x-signature')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], PaymentWebhookController.prototype, "receive", null);
exports.PaymentWebhookController = PaymentWebhookController = __decorate([
    (0, common_1.Controller)('payments/webhooks'),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], PaymentWebhookController);
//# sourceMappingURL=accounting.controller.js.map