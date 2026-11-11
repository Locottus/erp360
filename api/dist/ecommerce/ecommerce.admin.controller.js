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
exports.EcommerceAdminController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const ecommerce_service_1 = require("./ecommerce.service");
let EcommerceAdminController = class EcommerceAdminController {
    ecommerceService;
    constructor(ecommerceService) {
        this.ecommerceService = ecommerceService;
    }
    getSettings(request) {
        return this.ecommerceService.getAdminSettings(request.user);
    }
    listProducts(request) {
        return this.ecommerceService.listAdminProducts(request.user);
    }
    upsertSettings(request, body) {
        return this.ecommerceService.upsertAdminSettings(request.user, body);
    }
    createCategory(request, body) {
        return this.ecommerceService.createCategory(request.user, body);
    }
    listCategories(request) {
        return this.ecommerceService.listCategories(request.user);
    }
    publishListing(request, body) {
        return this.ecommerceService.publishListing(request.user, body);
    }
    listListings(request) {
        return this.ecommerceService.listAdminListings(request.user);
    }
    listSubscribers(request) {
        return this.ecommerceService.listSubscribers(request.user);
    }
    unsubscribe(request, subscriberId) {
        return this.ecommerceService.unsubscribe(request.user, subscriberId);
    }
};
exports.EcommerceAdminController = EcommerceAdminController;
__decorate([
    (0, common_1.Get)('settings'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcommerceAdminController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Get)('products'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcommerceAdminController.prototype, "listProducts", null);
__decorate([
    (0, common_1.Post)('settings'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcommerceAdminController.prototype, "upsertSettings", null);
__decorate([
    (0, common_1.Post)('categories'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcommerceAdminController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Get)('categories'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcommerceAdminController.prototype, "listCategories", null);
__decorate([
    (0, common_1.Post)('listings'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EcommerceAdminController.prototype, "publishListing", null);
__decorate([
    (0, common_1.Get)('listings'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcommerceAdminController.prototype, "listListings", null);
__decorate([
    (0, common_1.Get)('subscribers'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], EcommerceAdminController.prototype, "listSubscribers", null);
__decorate([
    (0, common_1.Post)('subscribers/:id/unsubscribe'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EcommerceAdminController.prototype, "unsubscribe", null);
exports.EcommerceAdminController = EcommerceAdminController = __decorate([
    (0, common_1.Controller)('ecommerce/admin'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:paramtypes", [ecommerce_service_1.EcommerceService])
], EcommerceAdminController);
//# sourceMappingURL=ecommerce.admin.controller.js.map