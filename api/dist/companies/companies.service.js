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
const management_input_1 = require("../common/management-input");
let CompaniesService = class CompaniesService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getCurrentCompany(user) {
        const result = await this.db.query(`SELECT id, code, name, tax_id, is_active, profile_revision
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
    async updateCurrentCompany(user, input) {
        const revision = (0, management_input_1.expectedRevision)(input.expectedRevision);
        const reason = (0, management_input_1.changeReason)(input.reason);
        if (typeof input.name !== 'string' ||
            !input.name.trim() ||
            input.name.length > 160 ||
            /[\u0000-\u001f]/.test(input.name) ||
            (input.taxId !== null &&
                (typeof input.taxId !== 'string' ||
                    !input.taxId.trim() ||
                    input.taxId.length > 64 ||
                    /[\u0000-\u001f]/.test(input.taxId)))) {
            throw new common_1.BadRequestException('A name (1 to 160 characters) and taxId (1 to 64 characters or explicit null) are required.');
        }
        const name = input.name.trim();
        const taxId = input.taxId?.trim() ?? null;
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const before = await client.query('SELECT name,tax_id,profile_revision FROM companies WHERE id=$1 FOR UPDATE', [user.companyId]);
            if (!before.rows[0])
                throw new common_1.NotFoundException('Company not found.');
            if (before.rows[0].profile_revision !== revision)
                throw new common_1.ConflictException('Company changed. Reload before editing.');
            if (before.rows[0].name === name && before.rows[0].tax_id === taxId)
                throw new common_1.ConflictException('No profile changes.');
            const updated = await client.query(`UPDATE companies SET name=$2,tax_id=$3,profile_revision=profile_revision+1,updated_at=NOW()
           WHERE id=$1 RETURNING id,code,name,tax_id,is_active,profile_revision`, [user.companyId, name, taxId]);
            await client.query(`INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
           VALUES($1::uuid,$2,'company.profile.update','companies',($1::uuid)::text,$3)`, [
                user.companyId,
                user.sub,
                JSON.stringify({
                    before: before.rows[0],
                    after: { name, tax_id: taxId, profile_revision: revision + 1 },
                    reason,
                }),
            ]);
            await client.query('COMMIT');
            return updated.rows[0];
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getCompanyById(id, user) {
        const isAdmin = user.roles.includes('admin');
        if (user.companyId !== id) {
            await this.logAudit(user.companyId, user.sub, 'company.read.denied_cross_company', id, {
                requested_company_id: id,
            });
            throw new common_1.ForbiddenException('You cannot access another company.');
        }
        const result = await this.db.query(`SELECT id, code, name, tax_id, is_active, profile_revision
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
       VALUES ($1, $2, $3, $4, $5, $6)`, [
            companyId,
            actorUserId,
            eventName,
            'companies',
            entityId,
            JSON.stringify(payload),
        ]);
    }
};
exports.CompaniesService = CompaniesService;
exports.CompaniesService = CompaniesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], CompaniesService);
//# sourceMappingURL=companies.service.js.map