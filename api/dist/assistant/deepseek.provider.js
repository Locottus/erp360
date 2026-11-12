"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepSeekProvider = void 0;
const common_1 = require("@nestjs/common");
const ai_providers_1 = require("./ai-providers");
let DeepSeekProvider = class DeepSeekProvider {
    async complete(apiKey, model, messages, maxOutput) {
        const data = await (0, ai_providers_1.providerJson)('deepseek', 'https://api.deepseek.com/chat/completions', { Authorization: `Bearer ${apiKey}` }, { model, messages, stream: false, max_tokens: maxOutput, thinking: { type: 'disabled' } });
        return (0, ai_providers_1.parseChatCompletion)(data, 'deepseek', maxOutput);
    }
};
exports.DeepSeekProvider = DeepSeekProvider;
exports.DeepSeekProvider = DeepSeekProvider = __decorate([
    (0, common_1.Injectable)()
], DeepSeekProvider);
//# sourceMappingURL=deepseek.provider.js.map