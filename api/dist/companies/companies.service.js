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
exports.CompaniesService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../common/database.service");
let CompaniesService = class CompaniesService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getCurrentCompany(user) {
        const result = await this.db.query(`SELECT id, code, name, tax_id, is_active
       FROM companies
       WHERE id = $1
       LIMIT 1`, [user.companyId]);
        const company = result.rows[0];
        if (!company) {
            throw new common_1.NotFoundException('Company not found.');
        }
        await this.logAudit(user.companyId, user.sub, 'company.read.current', company.id, {
            role_count: user.roles.length,
        });
        return company;
    }
    async getCompanyById(id, user) {
        const isAdmin = user.roles.includes('admin');
        if (user.companyId !== id) {
            await this.logAudit(user.companyId, user.sub, 'company.read.denied_cross_company', id, {
                requested_company_id: id,
            });
            throw new common_1.ForbiddenException('You cannot access another company.');
        }
        const result = await this.db.query(`SELECT id, code, name, tax_id, is_active
       FROM companies
       WHERE id = $1
       LIMIT 1`, [id]);
        const company = result.rows[0];
        if (!company) {
            throw new common_1.NotFoundException('Company not found.');
        }
        await this.logAudit(user.companyId, user.sub, 'company.read.by_id', company.id, {
            requested_company_id: id,
            is_admin: isAdmin,
        });
        return company;
    }
    async logAudit(companyId, actorUserId, eventName, entityId, payload) {
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`, [companyId, actorUserId, eventName, 'companies', entityId, JSON.stringify(payload)]);
    }
};
exports.CompaniesService = CompaniesService;
exports.CompaniesService = CompaniesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], CompaniesService);
//# sourceMappingURL=companies.service.js.map