import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { SaasRole } from '../saas/saas-inputs';
import { AssistantService } from './assistant.service';
import { AssistantDiagnosticsService } from './assistant-diagnostics.service';
type OperatorRequest = AuthenticatedRequest & {
    saasRole: SaasRole;
};
export declare class AssistantController {
    private readonly assistant;
    private readonly diagnostics;
    constructor(assistant: AssistantService, diagnostics: AssistantDiagnosticsService);
    diagnose(request: AuthenticatedRequest, body: unknown): Promise<import("./assistant-diagnostics.service").DiagnosticReport>;
    usage(request: AuthenticatedRequest): Promise<{
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
    chat(request: AuthenticatedRequest, body: unknown): Promise<{
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
}
export declare class AssistantOperatorController {
    private readonly assistant;
    constructor(assistant: AssistantService);
    types(): Promise<{
        code: string;
        name: string;
        monthly_tokens: number;
        max_output_tokens: number;
        enabled: boolean;
        revision: number;
    }[]>;
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
    saveType(request: OperatorRequest, body: unknown): Promise<{
        code: string;
        name: string;
        monthly_tokens: number;
        max_output_tokens: number;
        enabled: boolean;
        revision: number;
    }>;
    company(request: OperatorRequest, id: string): Promise<{
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
    config(request: OperatorRequest, id: string, provider?: string): Promise<{
        provider: "deepseek" | "openai" | "claude";
        model: string;
        enabled: boolean;
        keyConfigured: boolean;
        revision: number;
    }>;
    saveConfig(request: OperatorRequest, id: string, body: unknown): Promise<{
        provider: "deepseek" | "openai" | "claude";
        model: string;
        enabled: boolean;
        keyConfigured: boolean;
        revision: number;
    }>;
    assign(request: OperatorRequest, id: string, userId: string, body: unknown): Promise<any>;
    purchase(request: OperatorRequest, id: string, body: unknown): Promise<{
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
    reconcile(request: OperatorRequest, id: string, requestId: string, body: unknown): Promise<{
        requestId: string;
        promptTokens: number;
        completionTokens: number;
    }>;
}
export {};
