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
exports.PortalService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const database_service_1 = require("../common/database.service");
let PortalService = class PortalService {
    db;
    constructor(db) {
        this.db = db;
    }
    async createAccessToken(user, input) {
        if (!input.customerId?.trim()) {
            throw new common_1.BadRequestException('customerId is required.');
        }
        const expiresInDays = input.expiresInDays ?? 30;
        if (expiresInDays <= 0 || expiresInDays > 365) {
            throw new common_1.BadRequestException('expiresInDays must be between 1 and 365.');
        }
        const customer = await this.db.query(`SELECT id, code, name
       FROM customers
       WHERE id = $1 AND company_id = $2
       LIMIT 1`, [input.customerId, user.companyId]);
        if (!customer.rows[0]) {
            throw new common_1.NotFoundException('Customer not found for current company.');
        }
        const rawToken = `ptk_${(0, crypto_1.randomBytes)(24).toString('hex')}`;
        const tokenHash = this.hashToken(rawToken);
        const tokenPrefix = rawToken.slice(0, 12);
        const result = await this.db.query(`INSERT INTO portal_access_tokens
        (company_id, customer_id, token_hash, token_prefix, status, expires_at, created_by)
       VALUES ($1,$2,$3,$4,'active', NOW() + ($5 || ' days')::interval, $6)
       RETURNING id, expires_at`, [user.companyId, input.customerId, tokenHash, tokenPrefix, expiresInDays.toString(), user.sub]);
        await this.insertAudit(user.companyId, user.sub, 'portal.token.create', result.rows[0].id, {
            customer_id: input.customerId,
            expires_in_days: expiresInDays,
        });
        return {
            id: result.rows[0].id,
            token: rawToken,
            tokenPrefix,
            expiresAt: result.rows[0].expires_at,
            customer: customer.rows[0],
        };
    }
    async listAccessTokens(user, customerId) {
        const params = [user.companyId];
        let where = 'WHERE company_id = $1';
        if (customerId) {
            params.push(customerId);
            where += ` AND customer_id = $${params.length}`;
        }
        const result = await this.db.query(`SELECT id, customer_id, token_prefix, status, expires_at, last_used_at, revoked_at, created_at
       FROM portal_access_tokens
       ${where}
       ORDER BY created_at DESC`, params);
        await this.insertAudit(user.companyId, user.sub, 'portal.token.list', user.companyId, {
            total: result.rows.length,
            customer_id: customerId ?? null,
        });
        return result.rows;
    }
    async revokeAccessToken(user, tokenId) {
        const result = await this.db.query(`UPDATE portal_access_tokens
       SET status = 'revoked', revoked_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'active'
       RETURNING id`, [tokenId, user.companyId]);
        if (!result.rows[0]) {
            throw new common_1.NotFoundException('Active portal token not found.');
        }
        await this.insertAudit(user.companyId, user.sub, 'portal.token.revoke', tokenId, {});
        return { id: tokenId, status: 'revoked' };
    }
    async getPublicSummary(rawToken) {
        if (!rawToken?.trim()) {
            throw new common_1.UnauthorizedException('Portal token is required.');
        }
        const tokenHash = this.hashToken(rawToken.trim());
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            const token = await client.query(`SELECT id, company_id, customer_id, status, expires_at
         FROM portal_access_tokens
         WHERE token_hash = $1
         LIMIT 1`, [tokenHash]);
            if (!token.rows[0]) {
                throw new common_1.UnauthorizedException('Portal token not found.');
            }
            const now = new Date();
            if (token.rows[0].status !== 'active') {
                throw new common_1.UnauthorizedException('Portal token is not active.');
            }
            if (new Date(token.rows[0].expires_at) < now) {
                await client.query(`UPDATE portal_access_tokens
           SET status = 'expired'
           WHERE id = $1`, [token.rows[0].id]);
                throw new common_1.UnauthorizedException('Portal token has expired.');
            }
            await client.query(`UPDATE portal_access_tokens SET last_used_at = NOW() WHERE id = $1`, [token.rows[0].id]);
            const customer = await client.query(`SELECT id, code, name, email
         FROM customers
         WHERE id = $1 AND company_id = $2
         LIMIT 1`, [token.rows[0].customer_id, token.rows[0].company_id]);
            const quotations = await client.query(`SELECT id, quotation_number, status, subtotal, tax_total, grand_total, created_at
         FROM sales_quotations
         WHERE company_id = $1 AND customer_id = $2
         ORDER BY created_at DESC
         LIMIT 20`, [token.rows[0].company_id, token.rows[0].customer_id]);
            const orders = await client.query(`SELECT id, order_number, status, subtotal, tax_total, grand_total, created_at
         FROM sales_orders
         WHERE company_id = $1 AND customer_id = $2
         ORDER BY created_at DESC
         LIMIT 20`, [token.rows[0].company_id, token.rows[0].customer_id]);
            const invoices = await client.query(`SELECT si.id, si.invoice_number, si.status, si.subtotal, si.tax_total, si.grand_total, si.issued_at
         FROM sales_invoices si
         JOIN sales_orders so ON so.id = si.order_id
         WHERE si.company_id = $1 AND so.customer_id = $2
         ORDER BY si.issued_at DESC
         LIMIT 20`, [token.rows[0].company_id, token.rows[0].customer_id]);
            await client.query('COMMIT');
            return {
                customer: customer.rows[0],
                quotations: quotations.rows,
                orders: orders.rows,
                invoices: invoices.rows,
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    hashToken(value) {
        return (0, crypto_1.createHash)('sha256').update(value).digest('hex');
    }
    async insertAudit(companyId, actorUserId, eventName, entityId, payload) {
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`, [companyId, actorUserId, eventName, 'portal', entityId, JSON.stringify(payload)]);
    }
};
exports.PortalService = PortalService;
exports.PortalService = PortalService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], PortalService);
//# sourceMappingURL=portal.service.js.map