import { DatabaseService } from '../common/database.service';
import type { AuthUser, CreatePortalTokenInput } from './portal.types';
export declare class PortalService {
    private readonly db;
    constructor(db: DatabaseService);
    createAccessToken(user: AuthUser, input: CreatePortalTokenInput): Promise<{
        id: string;
        token: string;
        tokenPrefix: string;
        expiresAt: string;
        customer: {
            id: string;
            code: string;
            name: string;
        };
    }>;
    listAccessTokens(user: AuthUser, customerId?: string): Promise<import("pg").QueryResultRow[]>;
    revokeAccessToken(user: AuthUser, tokenId: string): Promise<{
        id: string;
        status: string;
    }>;
    getPublicSummary(rawToken: string): Promise<{
        customer: {
            id: string;
            code: string;
            name: string;
            email: string | null;
        };
        quotations: any[];
        orders: any[];
        invoices: any[];
    }>;
    private hashToken;
    private insertAudit;
}
