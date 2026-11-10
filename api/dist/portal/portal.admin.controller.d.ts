import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CreatePortalTokenInput } from './portal.types';
import { PortalService } from './portal.service';
export declare class PortalAdminController {
    private readonly portalService;
    constructor(portalService: PortalService);
    createAccessToken(request: AuthenticatedRequest, body: CreatePortalTokenInput): Promise<{
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
    listAccessTokens(request: AuthenticatedRequest, customerId?: string): Promise<import("pg").QueryResultRow[]>;
    revokeAccessToken(request: AuthenticatedRequest, tokenId: string): Promise<{
        id: string;
        status: string;
    }>;
}
