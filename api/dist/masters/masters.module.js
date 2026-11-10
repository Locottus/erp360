"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MastersModule = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("../auth/auth.service");
const auth_guard_1 = require("../auth/auth.guard");
const database_service_1 = require("../common/database.service");
const masters_controller_1 = require("./masters.controller");
const masters_service_1 = require("./masters.service");
let MastersModule = class MastersModule {
};
exports.MastersModule = MastersModule;
exports.MastersModule = MastersModule = __decorate([
    (0, common_1.Module)({
        controllers: [masters_controller_1.MastersController],
        providers: [masters_service_1.MastersService, database_service_1.DatabaseService, auth_service_1.AuthService, auth_guard_1.AuthGuard],
    })
], MastersModule);
//# sourceMappingURL=masters.module.js.map