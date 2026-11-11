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
exports.EcommerceStorefrontController = void 0;
const common_1 = require("@nestjs/common");
const ecommerce_service_1 = require("./ecommerce.service");
let EcommerceStorefrontController = class EcommerceStorefrontController {
    ecommerceService;
    constructor(ecommerceService) {
        this.ecommerceService = ecommerceService;
    }
    unsubscribe(companyCode, input) {
        return this.ecommerceService.publicUnsubscribe(companyCode, input.token);
    }
    getStorefrontBySlug(storeSlug, query, categoryCode) {
        return this.ecommerceService.getStorefrontBySlug(storeSlug, query, categoryCode);
    }
    getStorefront(companyCode, query, categoryCode) {
        return this.ecommerceService.getStorefront(companyCode, query, categoryCode);
    }
    createCart(companyCode) {
        return this.ecommerceService.createCart(companyCode);
    }
    subscribe(companyCode, body) {
        return this.ecommerceService.subscribe(companyCode, body);
    }
    getCart(companyCode, cartId, cartToken) {
        return this.ecommerceService.getCart(companyCode, cartId, cartToken ?? '');
    }
    addCartItem(companyCode, cartId, cartToken, body) {
        return this.ecommerceService.addCartItem(companyCode, cartId, cartToken ?? '', body);
    }
    removeCartItem(companyCode, cartId, itemId, cartToken) {
        return this.ecommerceService.removeCartItem(companyCode, cartId, cartToken ?? '', itemId);
    }
    checkoutCart(companyCode, cartId, cartToken, body) {
        return this.ecommerceService.checkoutCart(companyCode, cartId, cartToken ?? '', body);
    }
};
exports.EcommerceStorefrontController = EcommerceStorefrontController;
__decorate([
    (0, common_1.Post)(':companyCode/unsubscribe'),
    __param(0, (0, common_1.Param)('companyCode')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], EcommerceStorefrontController.prototype, "unsubscribe", null);
__decorate([
    (0, common_1.Get)('by-slug/:storeSlug'),
    __param(0, (0, common_1.Param)('storeSlug')),
    __param(1, (0, common_1.Query)('q')),
    __param(2, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], EcommerceStorefrontController.prototype, "getStorefrontBySlug", null);
__decorate([
    (0, common_1.Get)(':companyCode'),
    __param(0, (0, common_1.Param)('companyCode')),
    __param(1, (0, common_1.Query)('q')),
    __param(2, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], EcommerceStorefrontController.prototype, "getStorefront", null);
__decorate([
    (0, common_1.Post)(':companyCode/carts'),
    __param(0, (0, common_1.Param)('companyCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EcommerceStorefrontController.prototype, "createCart", null);
__decorate([
    (0, common_1.Post)(':companyCode/subscribe'),
    __param(0, (0, common_1.Param)('companyCode')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], EcommerceStorefrontController.prototype, "subscribe", null);
__decorate([
    (0, common_1.Get)(':companyCode/carts/:cartId'),
    __param(0, (0, common_1.Param)('companyCode')),
    __param(1, (0, common_1.Param)('cartId')),
    __param(2, (0, common_1.Headers)('x-cart-token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], EcommerceStorefrontController.prototype, "getCart", null);
__decorate([
    (0, common_1.Post)(':companyCode/carts/:cartId/items'),
    __param(0, (0, common_1.Param)('companyCode')),
    __param(1, (0, common_1.Param)('cartId')),
    __param(2, (0, common_1.Headers)('x-cart-token')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], EcommerceStorefrontController.prototype, "addCartItem", null);
__decorate([
    (0, common_1.Delete)(':companyCode/carts/:cartId/items/:itemId'),
    __param(0, (0, common_1.Param)('companyCode')),
    __param(1, (0, common_1.Param)('cartId')),
    __param(2, (0, common_1.Param)('itemId')),
    __param(3, (0, common_1.Headers)('x-cart-token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], EcommerceStorefrontController.prototype, "removeCartItem", null);
__decorate([
    (0, common_1.Post)(':companyCode/carts/:cartId/checkout'),
    __param(0, (0, common_1.Param)('companyCode')),
    __param(1, (0, common_1.Param)('cartId')),
    __param(2, (0, common_1.Headers)('x-cart-token')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], EcommerceStorefrontController.prototype, "checkoutCart", null);
exports.EcommerceStorefrontController = EcommerceStorefrontController = __decorate([
    (0, common_1.Controller)('ecommerce/storefront'),
    __metadata("design:paramtypes", [ecommerce_service_1.EcommerceService])
], EcommerceStorefrontController);
//# sourceMappingURL=ecommerce.storefront.controller.js.map