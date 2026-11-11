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
exports.CommerceController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const commerce_service_1 = require("./commerce.service");
let CommerceController = class CommerceController {
    commerceService;
    constructor(commerceService) {
        this.commerceService = commerceService;
    }
    createQuotation(request, body) {
        return this.commerceService.createQuotation(request.user, body);
    }
    listQuotations(request) {
        return this.commerceService.listQuotations(request.user);
    }
    listSalesOrders(request) {
        return this.commerceService.listSalesOrders(request.user);
    }
    listSalesInvoices(request) {
        return this.commerceService.listSalesInvoices(request.user);
    }
    confirmQuotation(request, quotationId, body) {
        return this.commerceService.confirmQuotation(request.user, quotationId, body?.orderNumber);
    }
    issueInvoice(request, salesOrderId, body) {
        return this.commerceService.issueInvoice(request.user, salesOrderId, body?.invoiceNumber);
    }
    createPurchaseRequest(request, body) {
        return this.commerceService.createPurchaseRequest(request.user, body);
    }
    listPurchaseRequests(request) {
        return this.commerceService.listPurchaseRequests(request.user);
    }
    approvePurchaseRequest(request, requestId, body) {
        return this.commerceService.approvePurchaseRequest(request.user, requestId, body?.orderNumber);
    }
    receivePurchaseOrder(request, purchaseOrderId, body) {
        return this.commerceService.receivePurchaseOrder(request.user, purchaseOrderId, body?.receiptNumber);
    }
};
exports.CommerceController = CommerceController;
__decorate([
    (0, common_1.Post)('sales/quotations'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CommerceController.prototype, "createQuotation", null);
__decorate([
    (0, common_1.Get)('sales/quotations'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CommerceController.prototype, "listQuotations", null);
__decorate([
    (0, common_1.Get)('sales/orders'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CommerceController.prototype, "listSalesOrders", null);
__decorate([
    (0, common_1.Get)('sales/invoices'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CommerceController.prototype, "listSalesInvoices", null);
__decorate([
    (0, common_1.Post)('sales/quotations/:id/confirm'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CommerceController.prototype, "confirmQuotation", null);
__decorate([
    (0, common_1.Post)('sales/orders/:id/invoice'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CommerceController.prototype, "issueInvoice", null);
__decorate([
    (0, common_1.Post)('purchases/requests'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CommerceController.prototype, "createPurchaseRequest", null);
__decorate([
    (0, common_1.Get)('purchases/requests'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CommerceController.prototype, "listPurchaseRequests", null);
__decorate([
    (0, common_1.Post)('purchases/requests/:id/approve'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CommerceController.prototype, "approvePurchaseRequest", null);
__decorate([
    (0, common_1.Post)('purchases/orders/:id/receive'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CommerceController.prototype, "receivePurchaseOrder", null);
exports.CommerceController = CommerceController = __decorate([
    (0, common_1.Controller)('commerce'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [commerce_service_1.CommerceService])
], CommerceController);
//# sourceMappingURL=commerce.controller.js.map