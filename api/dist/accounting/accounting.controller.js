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
exports.AccountingController = void 0;
const common_1 = require("@nestjs/common");
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
//# sourceMappingURL=accounting.controller.js.map