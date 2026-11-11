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
const master_input_1 = require("./master-input");
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
        const values = (0, master_input_1.validateMaster)('customers', input);
        if (!input.code || !input.name) {
            throw new common_1.BadRequestException('Customer code and name are required.');
        }
        try {
            const result = await this.db.query(`INSERT INTO customers (company_id, code, name, email, tax_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, code, name`, [user.companyId, values['code'], values['name'], values['email'], values['taxId'], values['isActive']]);
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
        const result = await this.db.query(`SELECT id, sku, name, description, unit_price, is_active
       FROM products
       WHERE company_id = $1
       ORDER BY name ASC`, [user.companyId]);
        await this.logAudit(user, 'masters.products.list', { total: result.rows.length });
        return result.rows;
    }
    async createProduct(user, input) {
        const values = (0, master_input_1.validateMaster)('products', input);
        if (!input.sku || !input.name) {
            throw new common_1.BadRequestException('Product SKU and name are required.');
        }
        if (input.unitPrice < 0) {
            throw new common_1.BadRequestException('Product unitPrice cannot be negative.');
        }
        try {
            const result = await this.db.query(`INSERT INTO products (company_id, sku, name, description, unit_price, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, sku, name`, [
                user.companyId,
                values['sku'],
                values['name'],
                values['description'],
                values['unitPrice'],
                values['isActive'],
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
        const values = (0, master_input_1.validateMaster)('suppliers', input);
        if (!input.code || !input.name) {
            throw new common_1.BadRequestException('Supplier code and name are required.');
        }
        try {
            const result = await this.db.query(`INSERT INTO suppliers (company_id, code, name, email, tax_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, code, name`, [user.companyId, values['code'], values['name'], values['email'], values['taxId'], values['isActive']]);
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
        const values = (0, master_input_1.validateMaster)('tax-rates', input);
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
            const result = await this.db.query(`INSERT INTO tax_rates (company_id, code, name, rate, tax_type, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, code, name`, [user.companyId, values['code'], values['name'], values['rate'], values['taxType'], values['isActive']]);
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
    async updateRecord(user, kind, id, input) {
        const definition = (0, master_input_1.masterDefinition)(kind);
        const values = (0, master_input_1.validateMaster)(kind, input);
        const fields = { ...definition.fields, isActive: 'is_active' };
        const entries = Object.entries(fields);
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            if (kind === 'tax-rates' && values['isActive'] === false) {
                const settings = await client.query(`SELECT s.id FROM ecommerce_storefront_settings s JOIN tax_rates t
           ON t.company_id=s.company_id AND t.code=s.default_tax_rate_code
           WHERE t.id=$1 AND t.company_id=$2`, [id, user.companyId]);
                if (settings.rows.length)
                    throw new common_1.BadRequestException('Remove the default store tax before deactivating it.');
            }
            const current = await client.query(`SELECT * FROM ${definition.table} WHERE id=$1 AND company_id=$2 FOR UPDATE`, [id, user.companyId]);
            if (!current.rows[0])
                throw new common_1.NotFoundException('Record not found in current company.');
            const immutableKey = kind === 'products' ? 'sku' : 'code';
            if (current.rows[0][immutableKey] !== values[immutableKey]) {
                throw new common_1.BadRequestException('The reference code is immutable; deactivate it and create another record.');
            }
            const result = await client.query(`UPDATE ${definition.table} SET ${entries.map(([, column], index) => `${column}=$${index + 1}`).join(',')},
         updated_at=NOW() WHERE id=$${entries.length + 1} AND company_id=$${entries.length + 2} RETURNING id`, [...entries.map(([key]) => values[key]), id, user.companyId]);
            await client.query(`INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1,$2,'masters.update',$3,$4,$5)`, [user.companyId, user.sub, definition.table, id, JSON.stringify({ fields: Object.keys(values) })]);
            await client.query('COMMIT');
            return result.rows[0];
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (error.code === '23505')
                throw new common_1.ConflictException('Reference already exists.');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async importRecords(user, kind, records) {
        const definition = (0, master_input_1.masterDefinition)(kind);
        if (!Array.isArray(records) || !records.length || records.length > 200) {
            throw new common_1.BadRequestException('Import between 1 and 200 records at a time.');
        }
        const validated = records.map(record => (0, master_input_1.validateMaster)(kind, record));
        const entries = Object.entries({ ...definition.fields, isActive: 'is_active' });
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');
            for (const record of validated) {
                await client.query(`INSERT INTO ${definition.table}(company_id,${entries.map(([, column]) => column).join(',')})
           VALUES($1,${entries.map((_, index) => `$${index + 2}`).join(',')})`, [user.companyId, ...entries.map(([key]) => record[key])]);
            }
            await client.query(`INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
         VALUES($1::uuid,$2,'masters.import',$3,($1::uuid)::text,$4)`, [user.companyId, user.sub, definition.table, JSON.stringify({ count: validated.length })]);
            await client.query('COMMIT');
            return { imported: validated.length };
        }
        catch (error) {
            await client.query('ROLLBACK');
            if (error.code === '23505') {
                throw new common_1.ConflictException('Duplicate reference. No records were imported.');
            }
            throw error;
        }
        finally {
            client.release();
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