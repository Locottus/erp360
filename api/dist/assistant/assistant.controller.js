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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantOperatorController = exports.AssistantController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const saas_operator_guard_1 = require("../saas/saas-operator.guard");
const assistant_service_1 = require("./assistant.service");
const assistant_diagnostics_service_1 = require("./assistant-diagnostics.service");
const operator = (request) => ({ ...request.user, saasRole: request.saasRole });
let AssistantController = class AssistantController {
    assistant;
    diagnostics;
    constructor(assistant, diagnostics) {
        this.assistant = assistant;
        this.diagnostics = diagnostics;
    }
    diagnose(request, body) {
        return this.diagnostics.inspect(request.user, body);
    }
    usage(request) { return this.assistant.usage(request.user); }
    chat(request, body) { return this.assistant.chat(request.user, body); }
};
exports.AssistantController = AssistantController;
__decorate([
    (0, common_1.Post)('diagnostics'),
    (0, common_1.Header)('Cache-Control', 'no-store'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AssistantController.prototype, "diagnose", null);
__decorate([
    (0, common_1.Get)('usage'),
    (0, common_1.Header)('Cache-Control', 'no-store'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AssistantController.prototype, "usage", null);
__decorate([
    (0, common_1.Post)('chat'),
    (0, common_1.Header)('Cache-Control', 'no-store'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AssistantController.prototype, "chat", null);
exports.AssistantController = AssistantController = __decorate([
    (0, common_1.Controller)('assistant'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [assistant_service_1.AssistantService, assistant_diagnostics_service_1.AssistantDiagnosticsService])
], AssistantController);
let AssistantOperatorController = class AssistantOperatorController {
    assistant;
    constructor(assistant) {
        this.assistant = assistant;
    }
    types() { return this.assistant.types(); }
    options() { return this.assistant.options(); }
    saveType(request, body) { return this.assistant.saveType(operator(request), body); }
    company(request, id) { return this.assistant.company(operator(request), id); }
    config(request, id, provider) {
        return this.assistant.config(operator(request), id, provider);
    }
    saveConfig(request, id, body) { return this.assistant.saveConfig(operator(request), id, body); }
    assign(request, id, userId, body) {
        return this.assistant.assign(operator(request), id, userId, body);
    }
    purchase(request, id, body) { return this.assistant.purchase(operator(request), id, body); }
    reconcile(request, id, requestId, body) {
        return this.assistant.reconcile(operator(request), id, requestId, body);
    }
};
exports.AssistantOperatorController = AssistantOperatorController;
__decorate([
    (0, common_1.Get)('service-types'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AssistantOperatorController.prototype, "types", null);
__decorate([
    (0, common_1.Get)('options'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AssistantOperatorController.prototype, "options", null);
__decorate([
    (0, common_1.Post)('service-types'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AssistantOperatorController.prototype, "saveType", null);
__decorate([
    (0, common_1.Get)('companies/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AssistantOperatorController.prototype, "company", null);
__decorate([
    (0, common_1.Get)('companies/:id/provider'),
    (0, common_1.Header)('Cache-Control', 'no-store'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)('provider')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], AssistantOperatorController.prototype, "config", null);
__decorate([
    (0, common_1.Post)('companies/:id/provider'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AssistantOperatorController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Post)('companies/:id/users/:userId/service'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], AssistantOperatorController.prototype, "assign", null);
__decorate([
    (0, common_1.Post)('companies/:id/token-purchases'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AssistantOperatorController.prototype, "purchase", null);
__decorate([
    (0, common_1.Post)('companies/:id/requests/:requestId/reconcile'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('requestId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], AssistantOperatorController.prototype, "reconcile", null);
exports.AssistantOperatorController = AssistantOperatorController = __decorate([
    (0, common_1.Controller)('assistant/admin'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard, saas_operator_guard_1.SaasOperatorGuard),
    __metadata("design:paramtypes", [assistant_service_1.AssistantService])
], AssistantOperatorController);
//# sourceMappingURL=assistant.controller.js.map