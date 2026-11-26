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
            permissions: string[];
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
    mfaStatus(request: AuthenticatedRequest): Promise<{
        enabled: boolean;
        configured: boolean;
    }>;
    mfaSetup(request: AuthenticatedRequest): Promise<{
        enabled: boolean;
        configured: boolean;
        secret?: undefined;
        otpauthUri?: undefined;
    } | {
        enabled: boolean;
        configured: boolean;
        secret: string;
        otpauthUri: string;
    }>;
    mfaVerify(request: AuthenticatedRequest, body: {
        code: string;
    }): Promise<{
        enabled: boolean;
    }>;
    mfaDisable(request: AuthenticatedRequest, body: {
        code: string;
    }): Promise<{
        enabled: boolean;
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
    rbac(request: AuthenticatedRequest): Promise<{
        revision: number;
        permissions: {
            code: string;
            resource: string;
            action: string;
            description: string;
        }[];
        roles: {
            code: string;
            name: string;
            description: string;
        }[];
        overrides: {
            permission_code: string;
            effect: "grant" | "deny";
        }[];
    }>;
    updateRbacOverrides(request: AuthenticatedRequest, body: {
        expectedRevision: number;
        reason: string;
        overrides: Array<{
            permissionCode: string;
            effect: 'grant' | 'deny';
        }>;
    }): Promise<{
        revision: number;
    }>;
    issueReset(request: AuthenticatedRequest, id: string): Promise<{
        resetToken: string;
        expiresInHours: number;
    }>;
    resetMfa(request: AuthenticatedRequest, id: string, body: {
        expectedRevision: number;
        reason: string;
    }): Promise<{
        reset: boolean;
        revision: number;
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
        permissions: string[];
    }>;
    adminCheck(): {
        ok: boolean;
        role: string;
    };
}
