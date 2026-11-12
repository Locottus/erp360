import { randomBytes } from 'node:crypto';
import { DeepSeekProvider } from './deepseek.provider';
import { OpenAiProvider } from './openai.provider';
import { ClaudeProvider } from './claude.provider';
import { AiProviderService } from './ai-provider.service';
import { chatInput } from './assistant-inputs';
import { decryptApiKey, encryptApiKey } from './provider-credentials';
import { ProviderFailure } from './ai-providers';

describe('AI provider adapters', () => {
  const messages = [{ role: 'system' as const, content: 'Answer with general guidance.' }, { role: 'user' as const, content: 'Explain a validation error.' }];
  const secret = randomBytes(24).toString('hex');
  let fetchMock: jest.SpyInstance;
  let oldKey: string | undefined;
  beforeEach(() => {
    oldKey = process.env.ASSISTANT_CREDENTIAL_KEY;
    process.env.ASSISTANT_CREDENTIAL_KEY = randomBytes(32).toString('base64');
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
    if (oldKey === undefined) delete process.env.ASSISTANT_CREDENTIAL_KEY; else process.env.ASSISTANT_CREDENTIAL_KEY = oldKey;
  });
  function chatResponse(content: string | null = 'Synthetic response', finish = 'stop') {
    return new Response(JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120,
      prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40 }, choices: [{ message: { role: 'assistant', content }, finish_reason: finish }] }));
  }
  it('uses DeepSeek and OpenAI protocols without sending tools or persisting OpenAI conversations', async () => {
    fetchMock.mockResolvedValueOnce(chatResponse()).mockResolvedValueOnce(chatResponse());
    const service = new AiProviderService(new DeepSeekProvider(), new OpenAiProvider(), new ClaudeProvider());
    for (const provider of ['deepseek', 'openai'] as const) {
      const result = await service.complete(provider, secret, provider === 'openai' ? 'gpt-5.4-mini' : 'deepseek-flash', messages, 128);
      expect(result).toMatchObject({ promptTokens: 100, completionTokens: 20, text: 'Synthetic response' });
    }
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.openai.com/v1/chat/completions');
    const first: RequestInit = fetchMock.mock.calls[0][1];
    const second: RequestInit = fetchMock.mock.calls[1][1];
    expect(first.redirect).toBe('error');
    expect(first.headers).toMatchObject({ Authorization: `Bearer ${secret}` });
    expect(JSON.parse(String(first.body))).toMatchObject({ max_tokens: 128, thinking: { type: 'disabled' } });
    expect(JSON.parse(String(second.body))).toMatchObject({ max_completion_tokens: 128, reasoning_effort: 'none', store: false });
    expect(JSON.parse(String(second.body)).tools).toBeUndefined();
  });
  it('uses Claude system/header format and counts cached input as well as generated tokens', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      usage: { input_tokens: 30, output_tokens: 15, cache_creation_input_tokens: 40, cache_read_input_tokens: 50 },
      content: [{ type: 'thinking', thinking: 'Do not expose' }, { type: 'text', text: 'Synthetic Claude reply' }], stop_reason: 'end_turn',
    })));
    const result = await new ClaudeProvider().complete(secret, 'claude-haiku-5-5', messages, 128);
    expect(result).toEqual({ text: 'Synthetic Claude reply', promptTokens: 120, completionTokens: 15, truncated: false });
    const init: RequestInit = fetchMock.mock.calls[0][1];
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({ 'x-api-key': secret, 'anthropic-version': '2023-06-01' });
    expect(JSON.parse(String(init.body))).toMatchObject({ system: messages[0].content, messages: [messages[1]], max_tokens: 128 });
  });
  it('releases only definitive rejection reservations and never exposes provider error bodies', async () => {
    for (const status of [401, 429, 503]) {
      fetchMock.mockResolvedValueOnce(new Response(secret, { status }));
      await expect(new OpenAiProvider().complete(secret, 'gpt-5.4-mini', messages, 128))
        .rejects.toMatchObject({ code: `openai_http_${status}`, releaseReservation: status !== 503 });
    }
    fetchMock.mockRejectedValueOnce(new Error(secret));
    await expect(new ClaudeProvider().complete(secret, 'claude-haiku-5-5', messages, 128))
      .rejects.toMatchObject({ code: 'claude_transport_or_parse_error', releaseReservation: false });
  });
  it('rejects malformed token counters and oversized responses, but accounts for empty generated content', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 1 }, choices: [] })));
    await expect(new DeepSeekProvider().complete(secret, 'deepseek-flash', messages, 128)).rejects.toBeInstanceOf(ProviderFailure);
    fetchMock.mockResolvedValueOnce(new Response('x'.repeat(65537)));
    await expect(new DeepSeekProvider().complete(secret, 'deepseek-flash', messages, 128)).rejects.toMatchObject({ code: 'deepseek_response_too_large' });
    fetchMock.mockResolvedValueOnce(chatResponse(null, 'length'));
    expect(await new OpenAiProvider().complete(secret, 'gpt-5.4-mini', messages, 128)).toMatchObject({ text: '', promptTokens: 100, completionTokens: 20, truncated: true });
  });
  it('encrypts credentials bound to company and provider; missing or tampered keys fail explicitly', () => {
    const encrypted = encryptApiKey(secret, 'company-one', 'openai');
    expect(encrypted).not.toContain(secret);
    expect(decryptApiKey(encrypted, 'company-one', 'openai')).toBe(secret);
    expect(() => decryptApiKey(encrypted, 'company-two', 'openai')).toThrow('No se pudo descifrar');
    expect(() => decryptApiKey(encrypted, 'company-one', 'claude')).toThrow('No se pudo descifrar');
    delete process.env.ASSISTANT_CREDENTIAL_KEY;
    expect(() => encryptApiKey(secret, 'company-one', 'openai')).toThrow('Falta una clave');
  });
  it('requires explicit provider consent and sends only allowlisted context, not titles or identity', () => {
    const input = { requestId: '12345678-1234-1234-1234-123456789abc', provider: 'openai', consent: true,
      question: 'How do I review a validation error?', context: { screen: '/inventory', incident: null, title: secret, companyId: secret } };
    const parsed = chatInput(input);
    expect(JSON.stringify(parsed.messages)).not.toContain(secret);
    expect(() => chatInput({ ...input, consent: false })).toThrow('consentir');
    expect(() => chatInput({ ...input, provider: 'external-url' })).toThrow('Proveedor');
    expect(() => chatInput({ ...input, context: { screen: '/inventory?token=secret' } })).toThrow('Pantalla');
    expect(() => chatInput({ ...input, question: 'password=private_value' })).toThrow('Retira credenciales');
  });
});
