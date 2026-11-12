"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantModule = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const auth_service_1 = require("../auth/auth.service");
const database_service_1 = require("../common/database.service");
const saas_operator_guard_1 = require("../saas/saas-operator.guard");
const assistant_controller_1 = require("./assistant.controller");
const assistant_service_1 = require("./assistant.service");
const deepseek_provider_1 = require("./deepseek.provider");
const openai_provider_1 = require("./openai.provider");
const claude_provider_1 = require("./claude.provider");
const ai_provider_service_1 = require("./ai-provider.service");
const assistant_diagnostics_service_1 = require("./assistant-diagnostics.service");
let AssistantModule = class AssistantModule {
};
exports.AssistantModule = AssistantModule;
exports.AssistantModule = AssistantModule = __decorate([
    (0, common_1.Module)({
        controllers: [assistant_controller_1.AssistantController, assistant_controller_1.AssistantOperatorController],
        providers: [assistant_service_1.AssistantService, assistant_diagnostics_service_1.AssistantDiagnosticsService, ai_provider_service_1.AiProviderService, deepseek_provider_1.DeepSeekProvider, openai_provider_1.OpenAiProvider, claude_provider_1.ClaudeProvider, database_service_1.DatabaseService, auth_service_1.AuthService, auth_guard_1.AuthGuard, saas_operator_guard_1.SaasOperatorGuard],
    })
], AssistantModule);
//# sourceMappingURL=assistant.module.js.map