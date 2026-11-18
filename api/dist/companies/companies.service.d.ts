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
        quotation_validity_days: number;
    }>;
    getCostPolicy(user: AuthenticatedUser): Promise<{
        policy: "weighted_average" | "fifo";
        revision: number;
    }>;
    updateCostPolicy(user: AuthenticatedUser, input: {
        policy: 'weighted_average' | 'fifo';
        expectedRevision: number;
        reason: string;
    }): Promise<{
        policy: "weighted_average" | "fifo";
        revision: number;
    }>;
    updateCurrentCompany(user: AuthenticatedUser, input: {
        name: string;
        taxId: string | null;
        expectedRevision: number;
        reason: string;
        requireIndependentPurchaseApprover?: boolean;
        currencyCode?: string;
        quotationValidityDays?: number;
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
        quotation_validity_days: number;
    }>;
    private logAudit;
}
export {};
