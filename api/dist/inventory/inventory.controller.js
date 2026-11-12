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
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const inventory_service_1 = require("./inventory.service");
let InventoryController = class InventoryController {
    inventoryService;
    constructor(inventoryService) {
        this.inventoryService = inventoryService;
    }
    replenishment(request, locationCode) {
        return this.inventoryService.listReplenishment(request.user, locationCode);
    }
    purchaseCommitments(request, productId) {
        return this.inventoryService.purchaseCommitments(request.user, productId);
    }
    createReplenishmentProposal(request, productId, input) {
        return this.inventoryService.createReplenishmentProposal(request.user, productId, input);
    }
    setReplenishment(request, productId, input) {
        return this.inventoryService.setReplenishment(request.user, productId, input);
    }
    receiptDetails(request, id) {
        return this.inventoryService.purchaseReceiptDetails(request.user, id);
    }
    partialReceipt(request, id, input) {
        return this.inventoryService.receivePartialPurchase(request.user, id, input);
    }
    transfer(request, input) {
        return this.inventoryService.moveOrCount(request.user, 'transfer', input);
    }
    count(request, input) {
        return this.inventoryService.moveOrCount(request.user, 'count', input);
    }
    applyPurchaseReceipt(request, purchaseOrderId, body) {
        return this.inventoryService.receivePurchaseOrder(request.user, purchaseOrderId, body?.locationCode);
    }
    applySalesReservation(request, salesOrderId, body) {
        return this.inventoryService.reserveSalesOrder(request.user, salesOrderId, body?.locationCode);
    }
    applySalesDispatch(request, salesOrderId, body) {
        return this.inventoryService.dispatchSalesOrder(request.user, salesOrderId, body?.locationCode);
    }
    createAdjustment(request, body) {
        return this.inventoryService.adjustStock(request.user, body);
    }
    listStock(request, locationCode) {
        return this.inventoryService.listStockBalances(request.user, locationCode);
    }
    listMovements(request, productId, locationCode, page, pageSize) {
        return this.inventoryService.listMovements(request.user, { productId, locationCode, page, pageSize });
    }
    valuationAndCogs(request, fromDate, toDate, locationCode) {
        return this.inventoryService.valuationAndCogs(request.user, { fromDate, toDate, locationCode });
    }
    listSalesOrdersForFulfillment(request) {
        return this.inventoryService.listSalesOrdersForFulfillment(request.user);
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Get)('replenishment'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('locationCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "replenishment", null);
__decorate([
    (0, common_1.Get)('replenishment/:productId/purchase-commitments'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('productId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "purchaseCommitments", null);
__decorate([
    (0, common_1.Post)('replenishment/:productId/proposals'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('productId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createReplenishmentProposal", null);
__decorate([
    (0, common_1.Patch)('replenishment/:productId'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('productId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "setReplenishment", null);
__decorate([
    (0, common_1.Get)('purchases/orders/:id/receipts'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "receiptDetails", null);
__decorate([
    (0, common_1.Post)('purchases/orders/:id/receipts'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "partialReceipt", null);
__decorate([
    (0, common_1.Post)('transfers'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "transfer", null);
__decorate([
    (0, common_1.Post)('counts'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "count", null);
__decorate([
    (0, common_1.Post)('purchases/orders/:id/receive'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "applyPurchaseReceipt", null);
__decorate([
    (0, common_1.Post)('sales/orders/:id/reserve'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "applySalesReservation", null);
__decorate([
    (0, common_1.Post)('sales/orders/:id/dispatch'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "applySalesDispatch", null);
__decorate([
    (0, common_1.Post)('adjustments'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "createAdjustment", null);
__decorate([
    (0, common_1.Get)('stock'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('locationCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listStock", null);
__decorate([
    (0, common_1.Get)('movements'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('productId')),
    __param(2, (0, common_1.Query)('locationCode')),
    __param(3, (0, common_1.Query)('page')),
    __param(4, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listMovements", null);
__decorate([
    (0, common_1.Get)('reports/valuation-cogs'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('fromDate')),
    __param(2, (0, common_1.Query)('toDate')),
    __param(3, (0, common_1.Query)('locationCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "valuationAndCogs", null);
__decorate([
    (0, common_1.Get)('sales-orders'),
    (0, roles_decorator_1.Roles)('admin', 'sales'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InventoryController.prototype, "listSalesOrdersForFulfillment", null);
exports.InventoryController = InventoryController = __decorate([
    (0, common_1.Controller)('inventory'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map