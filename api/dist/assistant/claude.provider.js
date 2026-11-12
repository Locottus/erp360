"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeProvider = void 0;
const common_1 = require("@nestjs/common");
const ai_providers_1 = require("./ai-providers");
let ClaudeProvider = class ClaudeProvider {
    async complete(apiKey, model, messages, maxOutput) {
        const data = await (0, ai_providers_1.providerJson)('claude', 'https://api.anthropic.com/v1/messages', { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, { model, system: messages.filter(message => message.role === 'system').map(message => message.content).join('\n'),
            messages: messages.filter(message => message.role !== 'system'), stream: false, max_tokens: maxOutput });
        if (!(0, ai_providers_1.isRecord)(data) || !(0, ai_providers_1.isRecord)(data.usage))
            throw new ai_providers_1.ProviderFailure('claude_invalid_response');
        const usage = data.usage;
        const created = usage.cache_creation_input_tokens === undefined ? 0 : usage.cache_creation_input_tokens;
        const cached = usage.cache_read_input_tokens === undefined ? 0 : usage.cache_read_input_tokens;
        if (!(0, ai_providers_1.isTokenCount)(usage.input_tokens) || !(0, ai_providers_1.isTokenCount)(usage.output_tokens) ||
            !(0, ai_providers_1.isTokenCount)(created) || !(0, ai_providers_1.isTokenCount)(cached) || usage.output_tokens > maxOutput) {
            throw new ai_providers_1.ProviderFailure('claude_invalid_usage');
        }
        const text = Array.isArray(data.content) && ['end_turn', 'max_tokens'].includes(String(data.stop_reason))
            ? data.content.filter(ai_providers_1.isRecord).filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n') : '';
        return { text, promptTokens: usage.input_tokens + created + cached,
            completionTokens: usage.output_tokens, truncated: data.stop_reason === 'max_tokens' };
    }
};
exports.ClaudeProvider = ClaudeProvider;
exports.ClaudeProvider = ClaudeProvider = __decorate([
    (0, common_1.Injectable)()
], ClaudeProvider);
//# sourceMappingURL=claude.provider.js.map