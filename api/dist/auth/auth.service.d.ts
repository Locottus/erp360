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
