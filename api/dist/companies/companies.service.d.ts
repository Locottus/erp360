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
    }>;
    getCompanyById(id: string, user: AuthenticatedUser): Promise<{
        id: string;
        code: string;
        name: string;
        tax_id: string | null;
        is_active: boolean;
    }>;
    private logAudit;
}
export {};
