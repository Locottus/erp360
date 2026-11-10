import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { StockAdjustmentInput } from './inventory.types';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

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
}
