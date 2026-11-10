"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortalModule = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const auth_service_1 = require("../auth/auth.service");
const database_service_1 = require("../common/database.service");
const portal_admin_controller_1 = require("./portal.admin.controller");
const portal_public_controller_1 = require("./portal.public.controller");
const portal_service_1 = require("./portal.service");
let PortalModule = class PortalModule {
};
exports.PortalModule = PortalModule;
exports.PortalModule = PortalModule = __decorate([
    (0, common_1.Module)({
        controllers: [portal_admin_controller_1.PortalAdminController, portal_public_controller_1.PortalPublicController],
        providers: [portal_service_1.PortalService, database_service_1.DatabaseService, auth_service_1.AuthService, auth_guard_1.AuthGuard],
    })
], PortalModule);
//# sourceMappingURL=portal.module.js.map