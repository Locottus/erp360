import type { AuthTokenPayload } from '../auth/auth.types';
import { DatabaseService } from '../common/database.service';
import { type SaasRole } from '../saas/saas-inputs';
import { AiProviderService } from './ai-provider.service';
import { AssistantDiagnosticsService } from './assistant-diagnostics.service';
type Operator = AuthTokenPayload & {
    saasRole?: SaasRole;
};
type Plan = {
    code: string;
    name: string;
    monthly_tokens: number;
    max_output_tokens: number;
    enabled: boolean;
    revision: number;
};
export declare class AssistantService {
    private readonly db;
    private readonly provider;
    private readonly diagnostics;
    private readonly logger;
    constructor(db: DatabaseService, provider: AiProviderService, diagnostics: AssistantDiagnosticsService);
    private transaction;
    private lockCompany;
    private month;
    private audit;
    private quota;
    usage(user: AuthTokenPayload): Promise<{
        enabled: boolean;
        service: {
            code: string;
            name: string;
            maxOutputTokens: number;
        } | null;
        provider: "deepseek" | "openai" | "claude";
        model: string;
        blockReason: string | null;
        month: string;
        includedTokens: number;
        extraTokens: number;
        limitTokens: number;
        promptTokens: number;
        completionTokens: number;
        usedTokens: number;
        reservedTokens: number;
        availableTokens: number;
    }>;
    chat(user: AuthTokenPayload, input: unknown): Promise<{
        requestId: string;
        text: string;
        provider: "deepseek" | "openai" | "claude";
        diagnostic: import("./assistant-diagnostics.service").DiagnosticReport | undefined;
        truncated: boolean;
        tokens: {
            prompt: number;
            completion: number;
            total: number;
        };
        usage: {
            enabled: boolean;
            service: {
                code: string;
                name: string;
                maxOutputTokens: number;
            } | null;
            provider: "deepseek" | "openai" | "claude";
            model: string;
            blockReason: string | null;
            month: string;
            includedTokens: number;
            extraTokens: number;
            limitTokens: number;
            promptTokens: number;
            completionTokens: number;
            usedTokens: number;
            reservedTokens: number;
            availableTokens: number;
        };
    }>;
    private settle;
    types(): Promise<Plan[]>;
    options(): {
        providers: readonly [{
            readonly code: "deepseek";
            readonly label: "DeepSeek";
            readonly models: readonly ["deepseek-flash", "deepseek-v4-pro"];
        }, {
            readonly code: "openai";
            readonly label: "OpenAI";
            readonly models: readonly ["gpt-5.4-mini", "gpt-5.4"];
        }, {
            readonly code: "claude";
            readonly label: "Claude";
            readonly models: readonly ["claude-haiku-5-5", "claude-sonnet-5-5"];
        }];
    };
    saveType(user: Operator, input: unknown): Promise<Plan>;
    company(user: Operator, companyId: string): Promise<{
        usage: {
            month: string;
            includedTokens: number;
            extraTokens: number;
            limitTokens: number;
            promptTokens: number;
            completionTokens: number;
            usedTokens: number;
            reservedTokens: number;
            availableTokens: number;
        };
        users: any[];
        requests: any[];
        purchases: any[];
    }>;
    config(user: Operator, companyId: string, selection?: unknown): Promise<{
        provider: "deepseek" | "openai" | "claude";
        model: string;
        enabled: boolean;
        keyConfigured: boolean;
        revision: number;
    }>;
    saveConfig(user: Operator, companyId: string, input: unknown): Promise<{
        provider: "deepseek" | "openai" | "claude";
        model: string;
        enabled: boolean;
        keyConfigured: boolean;
        revision: number;
    }>;
    assign(user: Operator, companyId: string, userId: string, input: unknown): Promise<any>;
    purchase(user: Operator, companyId: string, input: unknown): Promise<{
        purchase: any;
        usage: {
            month: string;
            includedTokens: number;
            extraTokens: number;
            limitTokens: number;
            promptTokens: number;
            completionTokens: number;
            usedTokens: number;
            reservedTokens: number;
            availableTokens: number;
        };
    }>;
    reconcile(user: Operator, companyId: string, requestId: string, input: unknown): Promise<{
        requestId: string;
        promptTokens: number;
        completionTokens: number;
    }>;
}
export {};
