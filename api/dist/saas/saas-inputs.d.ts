export declare const SAAS_MODULES: readonly ["base", "sales", "purchases", "inventory", "accounting", "store", "people"];
export type SaasModuleCode = (typeof SAAS_MODULES)[number];
export type SaasRole = 'owner' | 'billing' | 'viewer';
export type ModulePrice = {
    code: SaasModuleCode;
    price: string;
};
export declare function objectInput(input: unknown, label?: string): Record<string, unknown>;
export declare function requiredText(input: unknown, field: string, maxLength: number, options?: {
    lowerCase?: boolean;
}): string;
export declare function requiredDate(input: unknown, field: string): string;
export declare function requiredMoney(input: unknown, field: string, allowZero?: boolean): string;
export declare function requiredReference(input: unknown): string;
export declare function requiredReason(input: unknown, field?: string): string;
export declare function parseModulePrices(input: unknown): ModulePrice[];
export declare function requireSaasRole(role: SaasRole | null | undefined, write?: boolean): void;
