import { DatabaseService } from '../common/database.service';
import type { AuthUser, CreateCustomerInput, CreateProductInput, CreateSupplierInput, CreateTaxRateInput } from './masters.types';
export declare class MastersService {
    private readonly db;
    constructor(db: DatabaseService);
    listCustomers(user: AuthUser): Promise<{
        id: string;
        code: string;
        name: string;
        email: string | null;
        tax_id: string | null;
        is_active: boolean;
    }[]>;
    createCustomer(user: AuthUser, input: CreateCustomerInput): Promise<{
        id: string;
        code: string;
        name: string;
    }>;
    listProducts(user: AuthUser): Promise<{
        id: string;
        sku: string;
        name: string;
        unit_price: string;
        is_active: boolean;
    }[]>;
    createProduct(user: AuthUser, input: CreateProductInput): Promise<{
        id: string;
        sku: string;
        name: string;
    }>;
    listSuppliers(user: AuthUser): Promise<{
        id: string;
        code: string;
        name: string;
        email: string | null;
        tax_id: string | null;
        is_active: boolean;
    }[]>;
    createSupplier(user: AuthUser, input: CreateSupplierInput): Promise<{
        id: string;
        code: string;
        name: string;
    }>;
    listTaxRates(user: AuthUser): Promise<{
        id: string;
        code: string;
        name: string;
        rate: string;
        tax_type: string;
        is_active: boolean;
    }[]>;
    createTaxRate(user: AuthUser, input: CreateTaxRateInput): Promise<{
        id: string;
        code: string;
        name: string;
    }>;
    updateRecord(user: AuthUser, kind: string, id: string, input: unknown): Promise<any>;
    importRecords(user: AuthUser, kind: string, records: unknown): Promise<{
        imported: number;
    }>;
    private logAudit;
}
