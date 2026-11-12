import { BadRequestException } from '@nestjs/common';
import type { Message } from './assistant-inputs';

export const PROVIDERS = [
  { code: 'deepseek', label: 'DeepSeek', models: ['deepseek-flash', 'deepseek-v4-pro'] },
  { code: 'openai', label: 'OpenAI', models: ['gpt-5.4-mini', 'gpt-5.4'] },
  { code: 'claude', label: 'Claude', models: ['claude-haiku-5-5', 'claude-sonnet-5-5'] },
] as const;
export type ProviderCode = (typeof PROVIDERS)[number]['code'];
export type Completion = { text: string; promptTokens: number; completionTokens: number; truncated: boolean };
export interface AiProviderAdapter {
  complete(apiKey: string, model: string, messages: Message[], maxOutput: number): Promise<Completion>;
}
export function providerCode(value: unknown): ProviderCode {
  const provider = PROVIDERS.find(item => item.code === value);
  if (!provider) throw new BadRequestException('Proveedor de IA no permitido.');
  return provider.code;
}
export function defaultModel(provider: ProviderCode) {
  const definition = PROVIDERS.find(item => item.code === provider);
  if (!definition) throw new BadRequestException('Proveedor de IA no permitido.');
  return definition.models[0];
}
export function validModel(provider: ProviderCode, model: string) {
  return PROVIDERS.some(item => item.code === provider && item.models.some(value => value === model));
}
export class ProviderFailure extends Error {
  constructor(readonly code: string, readonly releaseReservation = false) { super(code); }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
}
export function parseChatCompletion(data: unknown, provider: ProviderCode, maxOutput: number): Completion {
  if (!isRecord(data) || !isRecord(data.usage) || !Array.isArray(data.choices)) throw new ProviderFailure(`${provider}_invalid_response`);
  const usage = data.usage;
  if (!isTokenCount(usage.prompt_tokens) || !isTokenCount(usage.completion_tokens) || !isTokenCount(usage.total_tokens) ||
      usage.total_tokens !== usage.prompt_tokens + usage.completion_tokens || usage.completion_tokens > maxOutput) {
    throw new ProviderFailure(`${provider}_invalid_usage`);
  }
  const choice: unknown = data.choices[0];
  const accepted = isRecord(choice) && ['stop', 'length'].includes(String(choice.finish_reason)) &&
    isRecord(choice.message) && typeof choice.message.content === 'string';
  return { text: accepted && isRecord(choice) && isRecord(choice.message) ? String(choice.message.content) : '',
    promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
    truncated: isRecord(choice) && choice.finish_reason === 'length' };
}
export async function providerJson(provider: ProviderCode, url: string, headers: Record<string, string>, body: object): Promise<unknown> {
  try {
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
      headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderFailure(`${provider}_http_${response.status}`, [400, 401, 402, 403, 404, 413, 422, 429].includes(response.status));
    }
    if (!response.body) throw new ProviderFailure(`${provider}_empty_response`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 65536) throw new ProviderFailure(`${provider}_response_too_large`);
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof ProviderFailure) throw error;
    throw new ProviderFailure(`${provider}_transport_or_parse_error`);
  }
}
