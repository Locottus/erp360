import { Injectable } from '@nestjs/common';
import type { Message } from './assistant-inputs';
import { type AiProviderAdapter, type ProviderCode } from './ai-providers';
import { ClaudeProvider } from './claude.provider';
import { DeepSeekProvider } from './deepseek.provider';
import { OpenAiProvider } from './openai.provider';

@Injectable()
export class AiProviderService {
  private readonly adapters: Record<ProviderCode, AiProviderAdapter>;
  constructor(deepseek: DeepSeekProvider, openai: OpenAiProvider, claude: ClaudeProvider) {
    this.adapters = { deepseek, openai, claude };
  }
  complete(provider: ProviderCode, apiKey: string, model: string, messages: Message[], maxOutput: number) {
    return this.adapters[provider].complete(apiKey, model, messages, maxOutput);
  }
}
