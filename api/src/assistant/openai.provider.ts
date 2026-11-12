import { Injectable } from '@nestjs/common';
import type { Message } from './assistant-inputs';
import { type AiProviderAdapter, parseChatCompletion, providerJson } from './ai-providers';

@Injectable()
export class OpenAiProvider implements AiProviderAdapter {
  async complete(apiKey: string, model: string, messages: Message[], maxOutput: number) {
    const data = await providerJson('openai', 'https://api.openai.com/v1/chat/completions',
      { Authorization: `Bearer ${apiKey}` },
      { model, messages, stream: false, store: false, max_completion_tokens: maxOutput, reasoning_effort: 'none' });
    return parseChatCompletion(data, 'openai', maxOutput);
  }
}
