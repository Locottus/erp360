import type { ProviderCode } from './ai-providers';
export declare function encryptApiKey(secret: string, companyId: string, provider: ProviderCode): string;
export declare function decryptApiKey(value: string, companyId: string, provider: ProviderCode): string;
