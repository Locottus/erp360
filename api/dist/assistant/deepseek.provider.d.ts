import type { Message } from './assistant-inputs';
import { type AiProviderAdapter } from './ai-providers';
export declare class DeepSeekProvider implements AiProviderAdapter {
    complete(apiKey: string, model: string, messages: Message[], maxOutput: number): Promise<import("./ai-providers").Completion>;
}
