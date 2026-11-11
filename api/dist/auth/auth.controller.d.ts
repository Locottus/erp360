import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { BootstrapAdminInput, LoginInput } from './auth.types';
import type { AuthenticatedRequest } from './authenticated-request.type';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    bootstrapAdmin(body: BootstrapAdminInput, request: Request): Promise<{
        userId: string;
        companyId: string;
        roleId: string;
    }>;
    login(body: LoginInput, request: Request): Promise<{
        access_token: string;
        token_type: string;
        expires_in: number;
        user: {
            id: string;
            email: string;
            fullName: string;
            companyId: string;
            roles: string[];
        };
    }>;
    resetPassword(body: {
        token: string;
        password: string;
    }): Promise<{
        changed: boolean;
    }>;
    logout(request: AuthenticatedRequest): Promise<{
        revoked: boolean;
    }>;
    users(request: AuthenticatedRequest): Promise<import("pg").QueryResultRow[]>;
    createUser(request: AuthenticatedRequest, body: {
        email: string;
        fullName: string;
        roles: string[];
    }): Promise<{
        id: string;
        activationToken: string;
        expiresInHours: number;
    }>;
    updateUser(request: AuthenticatedRequest, id: string, body: {
        fullName: string;
        roles: string[];
        isActive: boolean;
        expectedRevision: number;
        reason: string;
    }): Promise<{
        id: string;
        revision: number;
    }>;
    issueReset(request: AuthenticatedRequest, id: string): Promise<{
        resetToken: string;
        expiresInHours: number;
    }>;
    revokeSessions(request: AuthenticatedRequest, id: string): Promise<{
        revoked: boolean;
    }>;
    me(request: AuthenticatedRequest): Promise<{
        id: string;
        email: string;
        fullName: string;
        companyId: string;
        roles: string[];
    }>;
    adminCheck(): {
        ok: boolean;
        role: string;
    };
}
