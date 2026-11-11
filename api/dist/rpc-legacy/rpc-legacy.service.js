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
exports.RpcLegacyService = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("../auth/auth.service");
const database_service_1 = require("../common/database.service");
let RpcLegacyService = class RpcLegacyService {
    db;
    authService;
    constructor(db, authService) {
        this.db = db;
        this.authService = authService;
    }
    async execute(methodName, params) {
        switch (methodName) {
            case 'common.authenticate':
                return this.authenticate(params);
            case 'object.execute_kw':
                return this.executeKw(params);
            default:
                throw new common_1.BadRequestException(`Unsupported XML-RPC method: ${methodName}`);
        }
    }
    async authenticate(params) {
        const email = String(params[0] ?? '').trim().toLowerCase();
        const password = String(params[1] ?? '');
        if (!email || !password) {
            throw new common_1.BadRequestException('common.authenticate requires email and password.');
        }
        const login = await this.authService.login({ email, password });
        return {
            uid: login.user.id,
            company_id: login.user.companyId,
            token: login.access_token,
            roles: login.user.roles,
        };
    }
    async executeKw(params) {
        const token = String(params[0] ?? '').trim();
        const model = String(params[1] ?? '').trim();
        const method = String(params[2] ?? '').trim();
        const payload = params[3] ?? {};
        if (!token || !model || !method) {
            throw new common_1.BadRequestException('object.execute_kw requires token, model and method.');
        }
        let auth;
        try {
            auth = await this.authService.authenticateAccessToken(token);
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid RPC token.');
        }
        return this.dispatch(auth, model, method, payload);
    }
    async dispatch(auth, model, method, payload) {
        if (model === 'res.company' && method === 'current') {
            const company = await this.db.query(`SELECT id, code, name, tax_id, is_active
         FROM companies
         WHERE id = $1
         LIMIT 1`, [auth.companyId]);
            return company.rows[0] ?? null;
        }
        if (model === 'hr.employee' && method === 'search_read') {
            const employees = await this.db.query(`SELECT id, employee_code, full_name, email, job_title, hire_date, status
         FROM hr_employees
         WHERE company_id = $1
         ORDER BY full_name ASC`, [auth.companyId]);
            return employees.rows;
        }
        if (model === 'sale.order' && method === 'search_read') {
            const limitRaw = payload['limit'];
            const parsedLimit = Number(limitRaw);
            const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
            const sales = await this.db.query(`SELECT id, order_number, status, subtotal, tax_total, grand_total, created_at
         FROM sales_orders
         WHERE company_id = $1
         ORDER BY created_at DESC
         LIMIT $2`, [auth.companyId, Math.min(Math.max(limit, 1), 200)]);
            return sales.rows;
        }
        throw new common_1.BadRequestException(`Unsupported RPC model/method: ${model}.${method}`);
    }
};
exports.RpcLegacyService = RpcLegacyService;
exports.RpcLegacyService = RpcLegacyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        auth_service_1.AuthService])
], RpcLegacyService);
//# sourceMappingURL=rpc-legacy.service.js.map