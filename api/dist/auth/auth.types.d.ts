export type AuthTokenPayload = {
    sub: string;
    email: string;
    companyId: string;
    roles: string[];
    permissions?: string[];
    sessionVersion?: number;
};
export type BootstrapAdminInput = {
    companyCode: string;
    companyName: string;
    email: string;
    password: string;
    fullName: string;
};
export type LoginInput = {
    email: string;
    password: string;
    mfaCode?: string;
};
