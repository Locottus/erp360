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
exports.FiscalController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const fiscal_service_1 = require("./fiscal.service");
let FiscalController = class FiscalController {
    fiscalService;
    constructor(fiscalService) {
        this.fiscalService = fiscalService;
    }
    upsertProviderConfig(request, body) {
        return this.fiscalService.upsertProviderConfig(request.user, body);
    }
    createFiscalDocument(request, invoiceId, body) {
        return this.fiscalService.createFiscalDocument(request.user, invoiceId, body);
    }
    submitFiscalDocument(request, fiscalDocumentId) {
        return this.fiscalService.submitFiscalDocument(request.user, fiscalDocumentId);
    }
    getFiscalDocument(request, fiscalDocumentId) {
        return this.fiscalService.getFiscalDocument(request.user, fiscalDocumentId);
    }
    listFiscalDocuments(request, countryCode) {
        return this.fiscalService.listFiscalDocuments(request.user, countryCode);
    }
};
exports.FiscalController = FiscalController;
__decorate([
    (0, common_1.Post)('providers/config'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], FiscalController.prototype, "upsertProviderConfig", null);
__decorate([
    (0, common_1.Post)('invoices/:id/documents'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], FiscalController.prototype, "createFiscalDocument", null);
__decorate([
    (0, common_1.Post)('documents/:id/submit'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FiscalController.prototype, "submitFiscalDocument", null);
__decorate([
    (0, common_1.Get)('documents/:id'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FiscalController.prototype, "getFiscalDocument", null);
__decorate([
    (0, common_1.Get)('documents'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FiscalController.prototype, "listFiscalDocuments", null);
exports.FiscalController = FiscalController = __decorate([
    (0, common_1.Controller)('fiscal'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [fiscal_service_1.FiscalService])
], FiscalController);
//# sourceMappingURL=fiscal.controller.js.map