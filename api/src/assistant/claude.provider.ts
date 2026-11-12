import { Injectable } from '@nestjs/common';
import type { Message } from './assistant-inputs';
import { type AiProviderAdapter, isRecord, isTokenCount, ProviderFailure, providerJson } from './ai-providers';

@Injectable()
export class ClaudeProvider implements AiProviderAdapter {
  async complete(apiKey: string, model: string, messages: Message[], maxOutput: number) {
    const data = await providerJson('claude', 'https://api.anthropic.com/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      { model, system: messages.filter(message => message.role === 'system').map(message => message.content).join('\n'),
        messages: messages.filter(message => message.role !== 'system'), stream: false, max_tokens: maxOutput });
    if (!isRecord(data) || !isRecord(data.usage)) throw new ProviderFailure('claude_invalid_response');
    const usage = data.usage;
    const created = usage.cache_creation_input_tokens === undefined ? 0 : usage.cache_creation_input_tokens;
    const cached = usage.cache_read_input_tokens === undefined ? 0 : usage.cache_read_input_tokens;
    if (!isTokenCount(usage.input_tokens) || !isTokenCount(usage.output_tokens) ||
        !isTokenCount(created) || !isTokenCount(cached) || usage.output_tokens > maxOutput) {
      throw new ProviderFailure('claude_invalid_usage');
    }
    const text = Array.isArray(data.content) && ['end_turn', 'max_tokens'].includes(String(data.stop_reason))
      ? data.content.filter(isRecord).filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n') : '';
    return { text, promptTokens: usage.input_tokens + created + cached,
      completionTokens: usage.output_tokens, truncated: data.stop_reason === 'max_tokens' };
  }
}
