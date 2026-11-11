import { DatabaseService } from '../common/database.service';
import type { AuthTokenPayload, BootstrapAdminInput, LoginInput } from './auth.types';
export declare class AuthService {
    private readonly db;
    constructor(db: DatabaseService);
    login(input: LoginInput, correlationId?: string): Promise<{
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
    verifyAccessToken(token: string): AuthTokenPayload;
    authenticateAccessToken(token: string): Promise<AuthTokenPayload>;
    revokeSessions(user: AuthTokenPayload, userId?: string): Promise<{
        revoked: boolean;
    }>;
    listUsers(user: AuthTokenPayload): Promise<import("pg").QueryResultRow[]>;
    createUser(user: AuthTokenPayload, input: {
        email: string;
        fullName: string;
        roles: string[];
    }): Promise<{
        id: string;
        activationToken: string;
        expiresInHours: number;
    }>;
    updateUser(user: AuthTokenPayload, id: string, input: {
        fullName: string;
        roles: string[];
        isActive: boolean;
        expectedRevision: number;
        reason: string;
    }): Promise<{
        id: string;
        revision: number;
    }>;
    issuePasswordReset(user: AuthTokenPayload, id: string): Promise<{
        resetToken: string;
        expiresInHours: number;
    }>;
    resetPassword(input: {
        token: string;
        password: string;
    }): Promise<{
        changed: boolean;
    }>;
    private validateIdentity;
    private hashResetToken;
    private auditIdentity;
    getCurrentUser(userId: string): Promise<{
        id: string;
        email: string;
        fullName: string;
        companyId: string;
        roles: string[];
    }>;
    bootstrapAdmin(input: BootstrapAdminInput, correlationId?: string): Promise<{
        userId: string;
        companyId: string;
        roleId: string;
    }>;
    private getJwtKeys;
    private getActiveJwtKey;
}
