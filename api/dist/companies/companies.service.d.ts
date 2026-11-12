import { DatabaseService } from '../common/database.service';
type AuthenticatedUser = {
    sub: string;
    email: string;
    companyId: string;
    roles: string[];
};
export declare class CompaniesService {
    private readonly db;
    constructor(db: DatabaseService);
    getCurrentCompany(user: AuthenticatedUser): Promise<{
        id: string;
        code: string;
        name: string;
        tax_id: string | null;
        is_active: boolean;
        profile_revision: number;
        currency_code: string;
        require_independent_purchase_approver: boolean;
    }>;
    updateCurrentCompany(user: AuthenticatedUser, input: {
        name: string;
        taxId: string | null;
        expectedRevision: number;
        reason: string;
        requireIndependentPurchaseApprover?: boolean;
        currencyCode?: string;
    }): Promise<any>;
    getExchangeRates(user: AuthenticatedUser): Promise<{
        id: string;
        from_currency: string;
        to_currency: string;
        rate: string;
        source: string;
        valid_from: string;
        valid_to: string | null;
    }[]>;
    setExchangeRate(user: AuthenticatedUser, input: {
        currencyCode: string;
        rate: string | number;
        source?: string;
    }): Promise<{
        id: string;
        rate: string;
        fromCurrency: string;
        toCurrency: string;
    }>;
    getCompanyById(id: string, user: AuthenticatedUser): Promise<{
        id: string;
        code: string;
        name: string;
        tax_id: string | null;
        is_active: boolean;
        profile_revision: number;
        currency_code: string;
        require_independent_purchase_approver: boolean;
    }>;
    private logAudit;
}
export {};
