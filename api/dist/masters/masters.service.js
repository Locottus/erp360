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
exports.MastersService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../common/database.service");
let MastersService = class MastersService {
    db;
    constructor(db) {
        this.db = db;
    }
    async listCustomers(user) {
        const result = await this.db.query(`SELECT id, code, name, email, tax_id, is_active
       FROM customers
       WHERE company_id = $1
       ORDER BY name ASC`, [user.companyId]);
        await this.logAudit(user, 'masters.customers.list', { total: result.rows.length });
        return result.rows;
    }
    async createCustomer(user, input) {
        if (!input.code || !input.name) {
            throw new common_1.BadRequestException('Customer code and name are required.');
        }
        try {
            const result = await this.db.query(`INSERT INTO customers (company_id, code, name, email, tax_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, name`, [user.companyId, input.code.trim(), input.name.trim(), input.email ?? null, input.taxId ?? null]);
            await this.logAudit(user, 'masters.customer.create', { customer_id: result.rows[0].id });
            return result.rows[0];
        }
        catch (error) {
            if (String(error).includes('customers_company_id_code_key')) {
                throw new common_1.ConflictException('Customer code already exists for this company.');
            }
            throw error;
        }
    }
    async listProducts(user) {
        const result = await this.db.query(`SELECT id, sku, name, unit_price, is_active
       FROM products
       WHERE company_id = $1
       ORDER BY name ASC`, [user.companyId]);
        await this.logAudit(user, 'masters.products.list', { total: result.rows.length });
        return result.rows;
    }
    async createProduct(user, input) {
        if (!input.sku || !input.name) {
            throw new common_1.BadRequestException('Product SKU and name are required.');
        }
        if (input.unitPrice < 0) {
            throw new common_1.BadRequestException('Product unitPrice cannot be negative.');
        }
        try {
            const result = await this.db.query(`INSERT INTO products (company_id, sku, name, description, unit_price)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, sku, name`, [
                user.companyId,
                input.sku.trim(),
                input.name.trim(),
                input.description ?? null,
                input.unitPrice,
            ]);
            await this.logAudit(user, 'masters.product.create', { product_id: result.rows[0].id });
            return result.rows[0];
        }
        catch (error) {
            if (String(error).includes('products_company_id_sku_key')) {
                throw new common_1.ConflictException('Product SKU already exists for this company.');
            }
            throw error;
        }
    }
    async listSuppliers(user) {
        const result = await this.db.query(`SELECT id, code, name, email, tax_id, is_active
       FROM suppliers
       WHERE company_id = $1
       ORDER BY name ASC`, [user.companyId]);
        await this.logAudit(user, 'masters.suppliers.list', { total: result.rows.length });
        return result.rows;
    }
    async createSupplier(user, input) {
        if (!input.code || !input.name) {
            throw new common_1.BadRequestException('Supplier code and name are required.');
        }
        try {
            const result = await this.db.query(`INSERT INTO suppliers (company_id, code, name, email, tax_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, name`, [user.companyId, input.code.trim(), input.name.trim(), input.email ?? null, input.taxId ?? null]);
            await this.logAudit(user, 'masters.supplier.create', { supplier_id: result.rows[0].id });
            return result.rows[0];
        }
        catch (error) {
            if (String(error).includes('suppliers_company_id_code_key')) {
                throw new common_1.ConflictException('Supplier code already exists for this company.');
            }
            throw error;
        }
    }
    async listTaxRates(user) {
        const result = await this.db.query(`SELECT id, code, name, rate, tax_type, is_active
       FROM tax_rates
       WHERE company_id = $1
       ORDER BY code ASC`, [user.companyId]);
        await this.logAudit(user, 'masters.tax_rates.list', { total: result.rows.length });
        return result.rows;
    }
    async createTaxRate(user, input) {
        if (!input.code || !input.name) {
            throw new common_1.BadRequestException('Tax code and name are required.');
        }
        if (input.rate < 0 || input.rate > 100) {
            throw new common_1.BadRequestException('Tax rate must be between 0 and 100.');
        }
        if (!['vat', 'withholding', 'other'].includes(input.taxType)) {
            throw new common_1.BadRequestException('Invalid tax type.');
        }
        try {
            const result = await this.db.query(`INSERT INTO tax_rates (company_id, code, name, rate, tax_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, name`, [user.companyId, input.code.trim(), input.name.trim(), input.rate, input.taxType]);
            await this.logAudit(user, 'masters.tax_rate.create', { tax_rate_id: result.rows[0].id });
            return result.rows[0];
        }
        catch (error) {
            if (String(error).includes('tax_rates_company_id_code_key')) {
                throw new common_1.ConflictException('Tax code already exists for this company.');
            }
            throw error;
        }
    }
    async logAudit(user, eventName, payload) {
        await this.db.query(`INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`, [user.companyId, user.sub, eventName, 'masters', user.companyId, JSON.stringify(payload)]);
    }
};
exports.MastersService = MastersService;
exports.MastersService = MastersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], MastersService);
//# sourceMappingURL=masters.service.js.map