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
    }>;
    updateCurrentCompany(user: AuthenticatedUser, input: {
        name: string;
        taxId: string | null;
        expectedRevision: number;
        reason: string;
    }): Promise<any>;
    getCompanyById(id: string, user: AuthenticatedUser): Promise<{
        id: string;
        code: string;
        name: string;
        tax_id: string | null;
        is_active: boolean;
        profile_revision: number;
    }>;
    private logAudit;
}
export {};
