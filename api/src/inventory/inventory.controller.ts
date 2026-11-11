import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { StockAdjustmentInput } from './inventory.types';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('purchases/orders/:id/receipts')
  @Roles('admin')
  receiptDetails(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.purchaseReceiptDetails(request.user, id);
  }

  @Post('purchases/orders/:id/receipts')
  @Roles('admin')
  partialReceipt(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() input: Parameters<InventoryService['receivePartialPurchase']>[2]) {
    return this.inventoryService.receivePartialPurchase(request.user, id, input);
  }
  @Post('transfers')
  @Roles('admin')
  transfer(@Req() request: AuthenticatedRequest,
    @Body() input: Parameters<InventoryService['moveOrCount']>[2]) {
    return this.inventoryService.moveOrCount(request.user, 'transfer', input);
  }

  @Post('counts')
  @Roles('admin')
  count(@Req() request: AuthenticatedRequest,
    @Body() input: Parameters<InventoryService['moveOrCount']>[2]) {
    return this.inventoryService.moveOrCount(request.user, 'count', input);
  }

  @Post('purchases/orders/:id/receive')
  @Roles('admin')
  applyPurchaseReceipt(
    @Req() request: AuthenticatedRequest,
    @Param('id') purchaseOrderId: string,
    @Body() body: { locationCode?: string },
  ) {
    return this.inventoryService.receivePurchaseOrder(request.user, purchaseOrderId, body?.locationCode);
  }

  @Post('sales/orders/:id/reserve')
  @Roles('admin')
  applySalesReservation(
    @Req() request: AuthenticatedRequest,
    @Param('id') salesOrderId: string,
    @Body() body: { locationCode?: string },
  ) {
    return this.inventoryService.reserveSalesOrder(request.user, salesOrderId, body?.locationCode);
  }

  @Post('sales/orders/:id/dispatch')
  @Roles('admin')
  applySalesDispatch(
    @Req() request: AuthenticatedRequest,
    @Param('id') salesOrderId: string,
    @Body() body: { locationCode?: string },
  ) {
    return this.inventoryService.dispatchSalesOrder(request.user, salesOrderId, body?.locationCode);
  }

  @Post('adjustments')
  @Roles('admin')
  createAdjustment(@Req() request: AuthenticatedRequest, @Body() body: StockAdjustmentInput) {
    return this.inventoryService.adjustStock(request.user, body);
  }

  @Get('stock')
  listStock(@Req() request: AuthenticatedRequest, @Query('locationCode') locationCode?: string) {
    return this.inventoryService.listStockBalances(request.user, locationCode);
  }

  @Get('movements')
  listMovements(
    @Req() request: AuthenticatedRequest,
    @Query('productId') productId?: string,
    @Query('locationCode') locationCode?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.inventoryService.listMovements(request.user, { productId, locationCode, page, pageSize });
  }

  @Get('sales-orders')
  listSalesOrdersForFulfillment(@Req() request: AuthenticatedRequest) {
    return this.inventoryService.listSalesOrdersForFulfillment(request.user);
  }
}
