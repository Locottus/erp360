"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcLegacyModule = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("../auth/auth.service");
const database_service_1 = require("../common/database.service");
const rpc_legacy_controller_1 = require("./rpc-legacy.controller");
const rpc_legacy_service_1 = require("./rpc-legacy.service");
let RpcLegacyModule = class RpcLegacyModule {
};
exports.RpcLegacyModule = RpcLegacyModule;
exports.RpcLegacyModule = RpcLegacyModule = __decorate([
    (0, common_1.Module)({
        controllers: [rpc_legacy_controller_1.RpcLegacyController],
        providers: [rpc_legacy_service_1.RpcLegacyService, database_service_1.DatabaseService, auth_service_1.AuthService],
    })
], RpcLegacyModule);
//# sourceMappingURL=rpc-legacy.module.js.map