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
exports.RpcLegacyController = void 0;
const common_1 = require("@nestjs/common");
const rpc_legacy_service_1 = require("./rpc-legacy.service");
const xmlrpc_util_1 = require("./xmlrpc.util");
let RpcLegacyController = class RpcLegacyController {
    rpcService;
    constructor(rpcService) {
        this.rpcService = rpcService;
    }
    async xmlRpc(body, request) {
        try {
            const raw = typeof body === 'string'
                ? body
                : request.rawBody?.toString('utf-8') ??
                    (typeof body === 'object' && body !== null && 'xml' in body ? String(body['xml']) : '');
            const { methodName, params } = (0, xmlrpc_util_1.parseXmlRpcRequest)(raw);
            const value = await this.rpcService.execute(methodName, params);
            return (0, xmlrpc_util_1.buildXmlRpcResponse)(value);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown XML-RPC error';
            return (0, xmlrpc_util_1.buildXmlRpcFault)(message);
        }
    }
};
exports.RpcLegacyController = RpcLegacyController;
__decorate([
    (0, common_1.Post)('xmlrpc'),
    (0, common_1.HttpCode)(200),
    (0, common_1.Header)('Content-Type', 'text/xml'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RpcLegacyController.prototype, "xmlRpc", null);
exports.RpcLegacyController = RpcLegacyController = __decorate([
    (0, common_1.Controller)('rpc'),
    __metadata("design:paramtypes", [rpc_legacy_service_1.RpcLegacyService])
], RpcLegacyController);
//# sourceMappingURL=rpc-legacy.controller.js.map