import { Injectable } from '@nestjs/common';
import type { Message } from './assistant-inputs';
import { type AiProviderAdapter, parseChatCompletion, providerJson } from './ai-providers';

@Injectable()
export class DeepSeekProvider implements AiProviderAdapter {
  async complete(apiKey: string, model: string, messages: Message[], maxOutput: number) {
    const data = await providerJson('deepseek', 'https://api.deepseek.com/chat/completions',
      { Authorization: `Bearer ${apiKey}` },
      { model, messages, stream: false, max_tokens: maxOutput, thinking: { type: 'disabled' } });
    return parseChatCompletion(data, 'deepseek', maxOutput);
  }
}
