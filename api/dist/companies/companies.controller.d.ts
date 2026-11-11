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
    }>;
    updateCurrentCompany(request: AuthenticatedRequest, input: {
        name: string;
        taxId: string | null;
        expectedRevision: number;
        reason: string;
    }): Promise<any>;
    getCompanyById(id: string, request: AuthenticatedRequest): Promise<{
        id: string;
        code: string;
        name: string;
        tax_id: string | null;
        is_active: boolean;
        profile_revision: number;
    }>;
}
