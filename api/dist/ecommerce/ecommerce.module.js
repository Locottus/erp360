"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EcommerceModule = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const auth_service_1 = require("../auth/auth.service");
const database_service_1 = require("../common/database.service");
const ecommerce_admin_controller_1 = require("./ecommerce.admin.controller");
const ecommerce_service_1 = require("./ecommerce.service");
const ecommerce_storefront_controller_1 = require("./ecommerce.storefront.controller");
let EcommerceModule = class EcommerceModule {
};
exports.EcommerceModule = EcommerceModule;
exports.EcommerceModule = EcommerceModule = __decorate([
    (0, common_1.Module)({
        controllers: [ecommerce_admin_controller_1.EcommerceAdminController, ecommerce_storefront_controller_1.EcommerceStorefrontController],
        providers: [ecommerce_service_1.EcommerceService, database_service_1.DatabaseService, auth_service_1.AuthService, auth_guard_1.AuthGuard],
    })
], EcommerceModule);
//# sourceMappingURL=ecommerce.module.js.map