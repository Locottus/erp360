"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiProviderService = void 0;
const common_1 = require("@nestjs/common");
const claude_provider_1 = require("./claude.provider");
const deepseek_provider_1 = require("./deepseek.provider");
const openai_provider_1 = require("./openai.provider");
let AiProviderService = class AiProviderService {
    adapters;
    constructor(deepseek, openai, claude) {
        this.adapters = { deepseek, openai, claude };
    }
    complete(provider, apiKey, model, messages, maxOutput) {
        return this.adapters[provider].complete(apiKey, model, messages, maxOutput);
    }
};
exports.AiProviderService = AiProviderService;
exports.AiProviderService = AiProviderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [deepseek_provider_1.DeepSeekProvider, openai_provider_1.OpenAiProvider, claude_provider_1.ClaudeProvider])
], AiProviderService);
//# sourceMappingURL=ai-provider.service.js.map