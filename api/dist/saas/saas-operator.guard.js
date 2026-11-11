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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaasOperatorGuard = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../common/database.service");
let SaasOperatorGuard = class SaasOperatorGuard {
    db;
    constructor(db) {
        this.db = db;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        if (!request.user?.sub) {
            throw new common_1.ForbiddenException('Authentication is required.');
        }
        const result = await this.db.query(`SELECT o.role
       FROM platform_saas_operators o
       JOIN users u ON u.id = o.user_id AND u.is_active = TRUE
       WHERE o.user_id = $1 AND o.enabled = TRUE`, [request.user.sub]);
        if (!result.rows[0]) {
            throw new common_1.ForbiddenException('Enabled platform SaaS membership is required.');
        }
        request.saasRole = result.rows[0].role;
        return true;
    }
};
exports.SaasOperatorGuard = SaasOperatorGuard;
exports.SaasOperatorGuard = SaasOperatorGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], SaasOperatorGuard);
//# sourceMappingURL=saas-operator.guard.js.map