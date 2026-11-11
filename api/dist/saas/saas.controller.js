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
exports.SaasOperatorController = exports.SaasIdentityController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const saas_operator_guard_1 = require("./saas-operator.guard");
const saas_service_1 = require("./saas.service");
function operatorUser(request) {
    return { ...request.user, saasRole: request.saasRole };
}
let SaasIdentityController = class SaasIdentityController {
    saas;
    constructor(saas) {
        this.saas = saas;
    }
    async operator(request) {
        return {
            role: await this.saas.operatorRole(request.user),
            integrations: await this.saas.integrations(),
        };
    }
    subscription(request) {
        return this.saas.getTenantSubscription(request.user.companyId);
    }
};
exports.SaasIdentityController = SaasIdentityController;
__decorate([
    (0, common_1.Get)('operator'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SaasIdentityController.prototype, "operator", null);
__decorate([
    (0, common_1.Get)('subscription'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SaasIdentityController.prototype, "subscription", null);
exports.SaasIdentityController = SaasIdentityController = __decorate([
    (0, common_1.Controller)('saas'),
    __metadata("design:paramtypes", [saas_service_1.SaasService])
], SaasIdentityController);
let SaasOperatorController = class SaasOperatorController {
    saas;
    constructor(saas) {
        this.saas = saas;
    }
    operators() {
        return this.saas.listOperators();
    }
    portfolio(asOf) {
        return this.saas.portfolio(asOf);
    }
    async portfolioCsv(asOf, response) {
        response.type('text/csv');
        return this.saas.portfolioCsv(asOf);
    }
    accounts() {
        return this.saas.listAccounts();
    }
    createAccount(request, body) {
        return this.saas.createAccount(operatorUser(request), body);
    }
    account(id) {
        return this.saas.accountDetail(id);
    }
    companies() {
        return this.saas.listCompanies();
    }
    createSubscription(request, body) {
        return this.saas.createSubscription(operatorUser(request), body);
    }
    updateSubscription(request, id, body) {
        return this.saas.updateSubscription(operatorUser(request), id, body);
    }
    createInvoice(request, id, body) {
        return this.saas.createInvoice(operatorUser(request), id, body);
    }
    recordPayment(request, id, body) {
        return this.saas.recordPayment(operatorUser(request), id, body);
    }
    reversePayment(request, id, body) {
        return this.saas.reversePayment(operatorUser(request), id, body);
    }
    issueCredit(request, id, body) {
        return this.saas.issueCredit(operatorUser(request), id, body);
    }
    createFollowup(request, id, body) {
        return this.saas.createFollowup(operatorUser(request), id, body);
    }
    updateFollowup(request, id, body) {
        return this.saas.updateFollowup(operatorUser(request), id, body);
    }
    collectionQueue(asOf) {
        return this.saas.collectionQueue(asOf);
    }
    collectionRun(request, body) {
        return this.saas.runCollection(operatorUser(request), body);
    }
};
exports.SaasOperatorController = SaasOperatorController;
__decorate([
    (0, common_1.Get)('operators'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "operators", null);
__decorate([
    (0, common_1.Get)('portfolio'),
    __param(0, (0, common_1.Query)('asOf')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "portfolio", null);
__decorate([
    (0, common_1.Get)('portfolio.csv'),
    (0, common_1.Header)('Content-Type', 'text/csv; charset=utf-8'),
    (0, common_1.Header)('Content-Disposition', 'attachment; filename="saas-portfolio.csv"'),
    __param(0, (0, common_1.Query)('asOf')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SaasOperatorController.prototype, "portfolioCsv", null);
__decorate([
    (0, common_1.Get)('accounts'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "accounts", null);
__decorate([
    (0, common_1.Post)('accounts'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "createAccount", null);
__decorate([
    (0, common_1.Get)('accounts/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "account", null);
__decorate([
    (0, common_1.Get)('companies'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "companies", null);
__decorate([
    (0, common_1.Post)('subscriptions'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "createSubscription", null);
__decorate([
    (0, common_1.Patch)('subscriptions/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "updateSubscription", null);
__decorate([
    (0, common_1.Post)('subscriptions/:id/invoices'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "createInvoice", null);
__decorate([
    (0, common_1.Post)('invoices/:id/payments'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "recordPayment", null);
__decorate([
    (0, common_1.Post)('payments/:id/reverse'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "reversePayment", null);
__decorate([
    (0, common_1.Post)('invoices/:id/credits'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "issueCredit", null);
__decorate([
    (0, common_1.Post)('accounts/:id/followups'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "createFollowup", null);
__decorate([
    (0, common_1.Patch)('followups/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "updateFollowup", null);
__decorate([
    (0, common_1.Get)('followups/due'),
    __param(0, (0, common_1.Query)('asOf')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "collectionQueue", null);
__decorate([
    (0, common_1.Post)('collection-runs'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SaasOperatorController.prototype, "collectionRun", null);
exports.SaasOperatorController = SaasOperatorController = __decorate([
    (0, common_1.Controller)('saas'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard, saas_operator_guard_1.SaasOperatorGuard),
    __metadata("design:paramtypes", [saas_service_1.SaasService])
], SaasOperatorController);
//# sourceMappingURL=saas.controller.js.map