import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import type {
  AuthUser,
  CreateCustomerInput,
  CreateProductInput,
  CreateSupplierInput,
  CreateTaxRateInput,
} from './masters.types';

@Injectable()
export class MastersService {
  constructor(private readonly db: DatabaseService) {}

  async listCustomers(user: AuthUser) {
    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      email: string | null;
      tax_id: string | null;
      is_active: boolean;
    }>(
      `SELECT id, code, name, email, tax_id, is_active
       FROM customers
       WHERE company_id = $1
       ORDER BY name ASC`,
      [user.companyId],
    );
    await this.logAudit(user, 'masters.customers.list', { total: result.rows.length });
    return result.rows;
  }

  async createCustomer(user: AuthUser, input: CreateCustomerInput) {
    if (!input.code || !input.name) {
      throw new BadRequestException('Customer code and name are required.');
    }
    try {
      const result = await this.db.query<{
        id: string;
        code: string;
        name: string;
      }>(
        `INSERT INTO customers (company_id, code, name, email, tax_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, name`,
        [user.companyId, input.code.trim(), input.name.trim(), input.email ?? null, input.taxId ?? null],
      );
      await this.logAudit(user, 'masters.customer.create', { customer_id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      if (String(error).includes('customers_company_id_code_key')) {
        throw new ConflictException('Customer code already exists for this company.');
      }
      throw error;
    }
  }

  async listProducts(user: AuthUser) {
    const result = await this.db.query<{
      id: string;
      sku: string;
      name: string;
      unit_price: string;
      is_active: boolean;
    }>(
      `SELECT id, sku, name, unit_price, is_active
       FROM products
       WHERE company_id = $1
       ORDER BY name ASC`,
      [user.companyId],
    );
    await this.logAudit(user, 'masters.products.list', { total: result.rows.length });
    return result.rows;
  }

  async createProduct(user: AuthUser, input: CreateProductInput) {
    if (!input.sku || !input.name) {
      throw new BadRequestException('Product SKU and name are required.');
    }
    if (input.unitPrice < 0) {
      throw new BadRequestException('Product unitPrice cannot be negative.');
    }
    try {
      const result = await this.db.query<{
        id: string;
        sku: string;
        name: string;
      }>(
        `INSERT INTO products (company_id, sku, name, description, unit_price)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, sku, name`,
        [
          user.companyId,
          input.sku.trim(),
          input.name.trim(),
          input.description ?? null,
          input.unitPrice,
        ],
      );
      await this.logAudit(user, 'masters.product.create', { product_id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      if (String(error).includes('products_company_id_sku_key')) {
        throw new ConflictException('Product SKU already exists for this company.');
      }
      throw error;
    }
  }

  async listSuppliers(user: AuthUser) {
    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      email: string | null;
      tax_id: string | null;
      is_active: boolean;
    }>(
      `SELECT id, code, name, email, tax_id, is_active
       FROM suppliers
       WHERE company_id = $1
       ORDER BY name ASC`,
      [user.companyId],
    );
    await this.logAudit(user, 'masters.suppliers.list', { total: result.rows.length });
    return result.rows;
  }

  async createSupplier(user: AuthUser, input: CreateSupplierInput) {
    if (!input.code || !input.name) {
      throw new BadRequestException('Supplier code and name are required.');
    }
    try {
      const result = await this.db.query<{
        id: string;
        code: string;
        name: string;
      }>(
        `INSERT INTO suppliers (company_id, code, name, email, tax_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, name`,
        [user.companyId, input.code.trim(), input.name.trim(), input.email ?? null, input.taxId ?? null],
      );
      await this.logAudit(user, 'masters.supplier.create', { supplier_id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      if (String(error).includes('suppliers_company_id_code_key')) {
        throw new ConflictException('Supplier code already exists for this company.');
      }
      throw error;
    }
  }

  async listTaxRates(user: AuthUser) {
    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      rate: string;
      tax_type: string;
      is_active: boolean;
    }>(
      `SELECT id, code, name, rate, tax_type, is_active
       FROM tax_rates
       WHERE company_id = $1
       ORDER BY code ASC`,
      [user.companyId],
    );
    await this.logAudit(user, 'masters.tax_rates.list', { total: result.rows.length });
    return result.rows;
  }

  async createTaxRate(user: AuthUser, input: CreateTaxRateInput) {
    if (!input.code || !input.name) {
      throw new BadRequestException('Tax code and name are required.');
    }
    if (input.rate < 0 || input.rate > 100) {
      throw new BadRequestException('Tax rate must be between 0 and 100.');
    }
    if (!['vat', 'withholding', 'other'].includes(input.taxType)) {
      throw new BadRequestException('Invalid tax type.');
    }
    try {
      const result = await this.db.query<{
        id: string;
        code: string;
        name: string;
      }>(
        `INSERT INTO tax_rates (company_id, code, name, rate, tax_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, name`,
        [user.companyId, input.code.trim(), input.name.trim(), input.rate, input.taxType],
      );
      await this.logAudit(user, 'masters.tax_rate.create', { tax_rate_id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      if (String(error).includes('tax_rates_company_id_code_key')) {
        throw new ConflictException('Tax code already exists for this company.');
      }
      throw error;
    }
  }

  private async logAudit(user: AuthUser, eventName: string, payload: Record<string, unknown>) {
    await this.db.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.companyId, user.sub, eventName, 'masters', user.companyId, JSON.stringify(payload)],
    );
  }
}
