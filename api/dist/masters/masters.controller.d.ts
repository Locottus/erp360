import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CreateCustomerInput, CreateProductInput, CreateSupplierInput, CreateTaxRateInput } from './masters.types';
import { MastersService } from './masters.service';
export declare class MastersController {
    private readonly mastersService;
    constructor(mastersService: MastersService);
    listCustomers(request: AuthenticatedRequest): Promise<{
        id: string;
        code: string;
        name: string;
        email: string | null;
        tax_id: string | null;
        is_active: boolean;
    }[]>;
    createCustomer(request: AuthenticatedRequest, body: CreateCustomerInput): Promise<{
        id: string;
        code: string;
        name: string;
    }>;
    listProducts(request: AuthenticatedRequest): Promise<{
        id: string;
        sku: string;
        name: string;
        unit_price: string;
        is_active: boolean;
    }[]>;
    createProduct(request: AuthenticatedRequest, body: CreateProductInput): Promise<{
        id: string;
        sku: string;
        name: string;
    }>;
    listSuppliers(request: AuthenticatedRequest): Promise<{
        id: string;
        code: string;
        name: string;
        email: string | null;
        tax_id: string | null;
        is_active: boolean;
    }[]>;
    createSupplier(request: AuthenticatedRequest, body: CreateSupplierInput): Promise<{
        id: string;
        code: string;
        name: string;
    }>;
    listTaxRates(request: AuthenticatedRequest): Promise<{
        id: string;
        code: string;
        name: string;
        rate: string;
        tax_type: string;
        is_active: boolean;
    }[]>;
    createTaxRate(request: AuthenticatedRequest, body: CreateTaxRateInput): Promise<{
        id: string;
        code: string;
        name: string;
    }>;
}
