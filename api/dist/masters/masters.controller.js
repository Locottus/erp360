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
exports.MastersController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const masters_service_1 = require("./masters.service");
let MastersController = class MastersController {
    mastersService;
    constructor(mastersService) {
        this.mastersService = mastersService;
    }
    update(request, kind, id, input) {
        return this.mastersService.updateRecord(request.user, kind, id, input);
    }
    import(request, kind, body) {
        return this.mastersService.importRecords(request.user, kind, body.records);
    }
    listCustomers(request) {
        return this.mastersService.listCustomers(request.user);
    }
    createCustomer(request, body) {
        return this.mastersService.createCustomer(request.user, body);
    }
    listProducts(request) {
        return this.mastersService.listProducts(request.user);
    }
    createProduct(request, body) {
        return this.mastersService.createProduct(request.user, body);
    }
    listSuppliers(request) {
        return this.mastersService.listSuppliers(request.user);
    }
    createSupplier(request, body) {
        return this.mastersService.createSupplier(request.user, body);
    }
    listTaxRates(request) {
        return this.mastersService.listTaxRates(request.user);
    }
    createTaxRate(request, body) {
        return this.mastersService.createTaxRate(request.user, body);
    }
};
exports.MastersController = MastersController;
__decorate([
    (0, common_1.Patch)(':kind/:id'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('kind')),
    __param(2, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], MastersController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':kind/import'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('kind')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], MastersController.prototype, "import", null);
__decorate([
    (0, common_1.Get)('customers'),
    (0, roles_decorator_1.Roles)('admin', 'sales'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MastersController.prototype, "listCustomers", null);
__decorate([
    (0, common_1.Post)('customers'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MastersController.prototype, "createCustomer", null);
__decorate([
    (0, common_1.Get)('products'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MastersController.prototype, "listProducts", null);
__decorate([
    (0, common_1.Post)('products'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MastersController.prototype, "createProduct", null);
__decorate([
    (0, common_1.Get)('suppliers'),
    (0, roles_decorator_1.Roles)('admin', 'purchases'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MastersController.prototype, "listSuppliers", null);
__decorate([
    (0, common_1.Post)('suppliers'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MastersController.prototype, "createSupplier", null);
__decorate([
    (0, common_1.Get)('tax-rates'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MastersController.prototype, "listTaxRates", null);
__decorate([
    (0, common_1.Post)('tax-rates'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MastersController.prototype, "createTaxRate", null);
exports.MastersController = MastersController = __decorate([
    (0, common_1.Controller)('masters'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [masters_service_1.MastersService])
], MastersController);
//# sourceMappingURL=masters.controller.js.map