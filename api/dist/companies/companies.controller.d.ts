import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { CompaniesService } from './companies.service';
export declare class CompaniesController {
    private readonly companiesService;
    constructor(companiesService: CompaniesService);
    getCurrentCompany(request: AuthenticatedRequest): Promise<{
        id: string;
        code: string;
        name: string;
        tax_id: string | null;
        is_active: boolean;
        profile_revision: number;
        currency_code: string;
        require_independent_purchase_approver: boolean;
    }>;
    updateCurrentCompany(request: AuthenticatedRequest, input: {
        name: string;
        taxId: string | null;
        expectedRevision: number;
        reason: string;
        requireIndependentPurchaseApprover?: boolean;
        currencyCode?: string;
    }): Promise<any>;
    getExchangeRates(request: AuthenticatedRequest): Promise<{
        id: string;
        from_currency: string;
        to_currency: string;
        rate: string;
        source: string;
        valid_from: string;
        valid_to: string | null;
    }[]>;
    setExchangeRate(request: AuthenticatedRequest, input: {
        currencyCode: string;
        rate: string | number;
        source?: string;
    }): Promise<{
        id: string;
        rate: string;
        fromCurrency: string;
        toCurrency: string;
    }>;
    getCompanyById(id: string, request: AuthenticatedRequest): Promise<{
        id: string;
        code: string;
        name: string;
        tax_id: string | null;
        is_active: boolean;
        profile_revision: number;
        currency_code: string;
        require_independent_purchase_approver: boolean;
    }>;
}
