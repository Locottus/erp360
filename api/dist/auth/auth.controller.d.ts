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
