import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import type { ClosePeriodInput, RegisterInvoicePaymentInput } from './accounting.types';
import { AccountingService } from './accounting.service';

@Controller('accounting')
@UseGuards(AuthGuard)
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('bootstrap-accounts')
  @Roles('admin')
  bootstrapAccounts(@Req() request: AuthenticatedRequest) {
    return this.accountingService.bootstrapDefaultAccounts(request.user);
  }

  @Post('sales-invoices/:id/post')
  @Roles('admin')
  postSalesInvoice(@Req() request: AuthenticatedRequest, @Param('id') invoiceId: string) {
    return this.accountingService.postSalesInvoice(request.user, invoiceId);
  }

  @Post('sales-invoices/:id/payments')
  @Roles('admin')
  registerSalesInvoicePayment(
    @Req() request: AuthenticatedRequest,
    @Param('id') invoiceId: string,
    @Body() body: RegisterInvoicePaymentInput,
  ) {
    return this.accountingService.registerInvoicePayment(request.user, invoiceId, body);
  }

  @Post('purchase-orders/:id/post')
  @Roles('admin')
  postPurchaseOrder(@Req() request: AuthenticatedRequest, @Param('id') purchaseOrderId: string) {
    return this.accountingService.postPurchaseOrderAccrual(request.user, purchaseOrderId);
  }

  @Get('reports/trial-balance')
  getTrialBalance(
    @Req() request: AuthenticatedRequest,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.accountingService.getTrialBalance(request.user, fromDate, toDate);
  }

  @Post('periods/close')
  @Roles('admin')
  closePeriod(@Req() request: AuthenticatedRequest, @Body() body: ClosePeriodInput) {
    return this.accountingService.closePeriod(request.user, body);
  }
}
