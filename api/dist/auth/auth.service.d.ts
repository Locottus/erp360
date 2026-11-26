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
            permissions: string[];
        };
    }>;
    verifyAccessToken(token: string): AuthTokenPayload;
    authenticateAccessToken(token: string): Promise<AuthTokenPayload>;
    getEffectivePermissions(userId: string, companyId: string): Promise<string[]>;
    getRbacState(user: AuthTokenPayload): Promise<{
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
    updateRbacOverrides(user: AuthTokenPayload, input: {
        expectedRevision: number;
        reason: string;
        overrides: Array<{
            permissionCode: string;
            effect: 'grant' | 'deny';
        }>;
    }): Promise<{
        revision: number;
    }>;
    getMfaStatus(user: AuthTokenPayload): Promise<{
        enabled: boolean;
        configured: boolean;
    }>;
    setupMfa(user: AuthTokenPayload): Promise<{
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
    verifyMfa(user: AuthTokenPayload, code: string): Promise<{
        enabled: boolean;
    }>;
    disableMfa(user: AuthTokenPayload, code: string): Promise<{
        enabled: boolean;
    }>;
    private mfaKey;
    private encryptMfaSecret;
    private decryptMfaSecret;
    private randomBase32;
    private base32Decode;
    private verifyTotp;
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
    resetUserMfa(user: AuthTokenPayload, id: string, input: {
        expectedRevision: number;
        reason: string;
    }): Promise<{
        reset: boolean;
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
        permissions: string[];
    }>;
    bootstrapAdmin(input: BootstrapAdminInput, correlationId?: string): Promise<{
        userId: string;
        companyId: string;
        roleId: string;
    }>;
    private getJwtKeys;
    private getActiveJwtKey;
}
