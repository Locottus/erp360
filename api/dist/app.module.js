"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./auth/auth.module");
const companies_module_1 = require("./companies/companies.module");
const masters_module_1 = require("./masters/masters.module");
const commerce_module_1 = require("./commerce/commerce.module");
const inventory_module_1 = require("./inventory/inventory.module");
const accounting_module_1 = require("./accounting/accounting.module");
const fiscal_module_1 = require("./fiscal/fiscal.module");
const portal_module_1 = require("./portal/portal.module");
const hr_module_1 = require("./hr/hr.module");
const rpc_legacy_module_1 = require("./rpc-legacy/rpc-legacy.module");
const ecommerce_module_1 = require("./ecommerce/ecommerce.module");
const dashboard_module_1 = require("./dashboard/dashboard.module");
const saas_module_1 = require("./saas/saas.module");
const assistant_module_1 = require("./assistant/assistant.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            auth_module_1.AuthModule,
            companies_module_1.CompaniesModule,
            masters_module_1.MastersModule,
            commerce_module_1.CommerceModule,
            inventory_module_1.InventoryModule,
            accounting_module_1.AccountingModule,
            fiscal_module_1.FiscalModule,
            portal_module_1.PortalModule,
            hr_module_1.HrModule,
            rpc_legacy_module_1.RpcLegacyModule,
            ecommerce_module_1.EcommerceModule,
            dashboard_module_1.DashboardModule,
            saas_module_1.SaasModule,
            assistant_module_1.AssistantModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map