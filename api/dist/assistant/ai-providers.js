"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderFailure = exports.PROVIDERS = void 0;
exports.providerCode = providerCode;
exports.defaultModel = defaultModel;
exports.validModel = validModel;
exports.isRecord = isRecord;
exports.isTokenCount = isTokenCount;
exports.parseChatCompletion = parseChatCompletion;
exports.providerJson = providerJson;
const common_1 = require("@nestjs/common");
exports.PROVIDERS = [
    { code: 'deepseek', label: 'DeepSeek', models: ['deepseek-flash', 'deepseek-v4-pro'] },
    { code: 'openai', label: 'OpenAI', models: ['gpt-5.4-mini', 'gpt-5.4'] },
    { code: 'claude', label: 'Claude', models: ['claude-haiku-5-5', 'claude-sonnet-5-5'] },
];
function providerCode(value) {
    const provider = exports.PROVIDERS.find(item => item.code === value);
    if (!provider)
        throw new common_1.BadRequestException('Proveedor de IA no permitido.');
    return provider.code;
}
function defaultModel(provider) {
    const definition = exports.PROVIDERS.find(item => item.code === provider);
    if (!definition)
        throw new common_1.BadRequestException('Proveedor de IA no permitido.');
    return definition.models[0];
}
function validModel(provider, model) {
    return exports.PROVIDERS.some(item => item.code === provider && item.models.some(value => value === model));
}
class ProviderFailure extends Error {
    code;
    releaseReservation;
    constructor(code, releaseReservation = false) {
        super(code);
        this.code = code;
        this.releaseReservation = releaseReservation;
    }
}
exports.ProviderFailure = ProviderFailure;
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isTokenCount(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
}
function parseChatCompletion(data, provider, maxOutput) {
    if (!isRecord(data) || !isRecord(data.usage) || !Array.isArray(data.choices))
        throw new ProviderFailure(`${provider}_invalid_response`);
    const usage = data.usage;
    if (!isTokenCount(usage.prompt_tokens) || !isTokenCount(usage.completion_tokens) || !isTokenCount(usage.total_tokens) ||
        usage.total_tokens !== usage.prompt_tokens + usage.completion_tokens || usage.completion_tokens > maxOutput) {
        throw new ProviderFailure(`${provider}_invalid_usage`);
    }
    const choice = data.choices[0];
    const accepted = isRecord(choice) && ['stop', 'length'].includes(String(choice.finish_reason)) &&
        isRecord(choice.message) && typeof choice.message.content === 'string';
    return { text: accepted && isRecord(choice) && isRecord(choice.message) ? String(choice.message.content) : '',
        promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
        truncated: isRecord(choice) && choice.finish_reason === 'length' };
}
async function providerJson(provider, url, headers, body) {
    try {
        const response = await fetch(url, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
            headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new ProviderFailure(`${provider}_http_${response.status}`, [400, 401, 402, 403, 404, 413, 422, 429].includes(response.status));
        }
        if (!response.body)
            throw new ProviderFailure(`${provider}_empty_response`);
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done)
                    break;
                size += chunk.value.byteLength;
                if (size > 65536)
                    throw new ProviderFailure(`${provider}_response_too_large`);
                chunks.push(chunk.value);
            }
        }
        finally {
            await reader.cancel();
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch (error) {
        if (error instanceof ProviderFailure)
            throw error;
        throw new ProviderFailure(`${provider}_transport_or_parse_error`);
    }
}
//# sourceMappingURL=ai-providers.js.map