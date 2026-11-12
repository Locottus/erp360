import type { Message } from './assistant-inputs';
import { type ProviderCode } from './ai-providers';
import { ClaudeProvider } from './claude.provider';
import { DeepSeekProvider } from './deepseek.provider';
import { OpenAiProvider } from './openai.provider';
export declare class AiProviderService {
    private readonly adapters;
    constructor(deepseek: DeepSeekProvider, openai: OpenAiProvider, claude: ClaudeProvider);
    complete(provider: ProviderCode, apiKey: string, model: string, messages: Message[], maxOutput: number): Promise<import("./ai-providers").Completion>;
}
