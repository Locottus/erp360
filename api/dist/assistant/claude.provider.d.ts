import type { Message } from './assistant-inputs';
import { type AiProviderAdapter } from './ai-providers';
export declare class ClaudeProvider implements AiProviderAdapter {
    complete(apiKey: string, model: string, messages: Message[], maxOutput: number): Promise<{
        text: string;
        promptTokens: number;
        completionTokens: number;
        truncated: boolean;
    }>;
}
