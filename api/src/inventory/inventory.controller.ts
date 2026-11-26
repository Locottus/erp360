import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { StockAdjustmentInput } from './inventory.types';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('warehouses')
  @Roles('admin', 'inventory')
  @Permissions('inventory.read')
  warehouses(@Req() request: AuthenticatedRequest) {
    return this.inventoryService.listWarehouses(request.user);
  }

  @Post('warehouses')
  @Roles('admin', 'inventory')
  @Permissions('inventory.write')
  upsertWarehouse(
    @Req() request: AuthenticatedRequest,
    @Body() input: { locationCode: string; name: string; isActive?: boolean },
  ) {
    return this.inventoryService.upsertWarehouse(request.user, input);
  }

  @Get('replenishment')
  @Roles('admin')
  @Permissions('inventory.replenishment.read')
  replenishment(
    @Req() request: AuthenticatedRequest,
    @Query('locationCode') locationCode?: string,
  ) {
    return this.inventoryService.listReplenishment(request.user, locationCode);
  }

  @Get('replenishment/:productId/purchase-commitments')
  @Roles('admin')
  @Permissions('inventory.replenishment.read')
  purchaseCommitments(
    @Req() request: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.inventoryService.purchaseCommitments(request.user, productId);
  }

  @Get('replenishment/:productId/purchase-planning')
  @Roles('admin')
  @Permissions('inventory.replenishment.read')
  purchasePlanning(
    @Req() request: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.inventoryService.purchasePlanning(request.user, productId);
  }

  @Get('replenishment/:productId/purchase-planning.csv')
  @Roles('admin')
  @Permissions('inventory.replenishment.read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="purchase-planning.csv"')
  @Header('Cache-Control', 'no-store')
  purchasePlanningCsv(
    @Req() request: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.inventoryService.purchasePlanningCsv(request.user, productId);
  }

  @Post('replenishment/:productId/proposals')
  @Roles('admin')
  @Permissions('inventory.write')
  createReplenishmentProposal(
    @Req() request: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body()
    input: Parameters<InventoryService['createReplenishmentProposal']>[2],
  ) {
    return this.inventoryService.createReplenishmentProposal(
      request.user,
      productId,
      input,
    );
  }

  @Patch('replenishment/:productId')
  @Roles('admin')
  @Permissions('inventory.write')
  setReplenishment(
    @Req() request: AuthenticatedRequest,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() input: Parameters<InventoryService['setReplenishment']>[2],
  ) {
    return this.inventoryService.setReplenishment(
      request.user,
      productId,
      input,
    );
  }

  @Get('purchases/orders/:id/receipts')
  @Roles('admin')
  @Permissions('inventory.read')
  receiptDetails(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventoryService.purchaseReceiptDetails(request.user, id);
  }

  @Post('purchases/orders/:id/receipts')
  @Roles('admin')
  @Permissions('inventory.confirm')
  partialReceipt(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: Parameters<InventoryService['receivePartialPurchase']>[2],
  ) {
    return this.inventoryService.receivePartialPurchase(
      request.user,
      id,
      input,
    );
  }
  @Post('transfers')
  @Roles('admin')
  @Permissions('inventory.write')
  transfer(
    @Req() request: AuthenticatedRequest,
    @Body() input: Parameters<InventoryService['moveOrCount']>[2],
  ) {
    return this.inventoryService.moveOrCount(request.user, 'transfer', input);
  }

  @Post('counts')
  @Roles('admin')
  @Permissions('inventory.write')
  count(
    @Req() request: AuthenticatedRequest,
    @Body() input: Parameters<InventoryService['moveOrCount']>[2],
  ) {
    return this.inventoryService.moveOrCount(request.user, 'count', input);
  }

  @Post('purchases/orders/:id/receive')
  @Roles('admin')
  @Permissions('inventory.confirm')
  applyPurchaseReceipt(
    @Req() request: AuthenticatedRequest,
    @Param('id') purchaseOrderId: string,
    @Body() body: { locationCode?: string },
  ) {
    return this.inventoryService.receivePurchaseOrder(
      request.user,
      purchaseOrderId,
      body?.locationCode,
    );
  }

  @Post('sales/orders/:id/reserve')
  @Roles('admin')
  @Permissions('inventory.confirm')
  applySalesReservation(
    @Req() request: AuthenticatedRequest,
    @Param('id') salesOrderId: string,
    @Body() body: { locationCode?: string },
  ) {
    return this.inventoryService.reserveSalesOrder(
      request.user,
      salesOrderId,
      body?.locationCode,
    );
  }

  @Post('sales/orders/:id/dispatch')
  @Roles('admin')
  @Permissions('inventory.confirm')
  applySalesDispatch(
    @Req() request: AuthenticatedRequest,
    @Param('id') salesOrderId: string,
    @Body() body: { locationCode?: string },
  ) {
    return this.inventoryService.dispatchSalesOrder(
      request.user,
      salesOrderId,
      body?.locationCode,
    );
  }

  @Post('adjustments')
  @Roles('admin')
  @Permissions('inventory.write')
  createAdjustment(
    @Req() request: AuthenticatedRequest,
    @Body() body: StockAdjustmentInput,
  ) {
    return this.inventoryService.adjustStock(request.user, body);
  }

  @Get('stock')
  @Permissions('inventory.read')
  listStock(
    @Req() request: AuthenticatedRequest,
    @Query('locationCode') locationCode?: string,
  ) {
    return this.inventoryService.listStockBalances(request.user, locationCode);
  }

  @Get('movements')
  @Permissions('inventory.read')
  listMovements(
    @Req() request: AuthenticatedRequest,
    @Query('productId') productId?: string,
    @Query('locationCode') locationCode?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.inventoryService.listMovements(request.user, {
      productId,
      locationCode,
      page,
      pageSize,
    });
  }

  @Get('reports/valuation-cogs')
  @Roles('admin')
  @Permissions('accounting.read')
  valuationAndCogs(
    @Req() request: AuthenticatedRequest,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('locationCode') locationCode?: string,
  ) {
    return this.inventoryService.valuationAndCogs(request.user, {
      fromDate,
      toDate,
      locationCode,
    });
  }

  @Get('sales-orders')
  @Roles('admin', 'sales')
  @Permissions('sales.read')
  listSalesOrdersForFulfillment(@Req() request: AuthenticatedRequest) {
    return this.inventoryService.listSalesOrdersForFulfillment(request.user);
  }
}
