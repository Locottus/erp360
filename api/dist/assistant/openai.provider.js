"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiProvider = void 0;
const common_1 = require("@nestjs/common");
const ai_providers_1 = require("./ai-providers");
let OpenAiProvider = class OpenAiProvider {
    async complete(apiKey, model, messages, maxOutput) {
        const data = await (0, ai_providers_1.providerJson)('openai', 'https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${apiKey}` }, { model, messages, stream: false, store: false, max_completion_tokens: maxOutput, reasoning_effort: 'none' });
        return (0, ai_providers_1.parseChatCompletion)(data, 'openai', maxOutput);
    }
};
exports.OpenAiProvider = OpenAiProvider;
exports.OpenAiProvider = OpenAiProvider = __decorate([
    (0, common_1.Injectable)()
], OpenAiProvider);
//# sourceMappingURL=openai.provider.js.map