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
exports.PortalAdminController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const portal_service_1 = require("./portal.service");
let PortalAdminController = class PortalAdminController {
    portalService;
    constructor(portalService) {
        this.portalService = portalService;
    }
    createAccessToken(request, body) {
        return this.portalService.createAccessToken(request.user, body);
    }
    listAccessTokens(request, customerId) {
        return this.portalService.listAccessTokens(request.user, customerId);
    }
    revokeAccessToken(request, tokenId) {
        return this.portalService.revokeAccessToken(request.user, tokenId);
    }
};
exports.PortalAdminController = PortalAdminController;
__decorate([
    (0, common_1.Post)('access-tokens'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PortalAdminController.prototype, "createAccessToken", null);
__decorate([
    (0, common_1.Get)('access-tokens'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('customerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PortalAdminController.prototype, "listAccessTokens", null);
__decorate([
    (0, common_1.Post)('access-tokens/:id/revoke'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PortalAdminController.prototype, "revokeAccessToken", null);
exports.PortalAdminController = PortalAdminController = __decorate([
    (0, common_1.Controller)('portal'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [portal_service_1.PortalService])
], PortalAdminController);
//# sourceMappingURL=portal.admin.controller.js.map