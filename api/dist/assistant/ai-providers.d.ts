import type { Message } from './assistant-inputs';
export declare const PROVIDERS: readonly [{
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
export type ProviderCode = (typeof PROVIDERS)[number]['code'];
export type Completion = {
    text: string;
    promptTokens: number;
    completionTokens: number;
    truncated: boolean;
};
export interface AiProviderAdapter {
    complete(apiKey: string, model: string, messages: Message[], maxOutput: number): Promise<Completion>;
}
export declare function providerCode(value: unknown): ProviderCode;
export declare function defaultModel(provider: ProviderCode): "deepseek-flash" | "gpt-5.4-mini" | "claude-haiku-5-5";
export declare function validModel(provider: ProviderCode, model: string): boolean;
export declare class ProviderFailure extends Error {
    readonly code: string;
    readonly releaseReservation: boolean;
    constructor(code: string, releaseReservation?: boolean);
}
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function isTokenCount(value: unknown): value is number;
export declare function parseChatCompletion(data: unknown, provider: ProviderCode, maxOutput: number): Completion;
export declare function providerJson(provider: ProviderCode, url: string, headers: Record<string, string>, body: object): Promise<unknown>;
