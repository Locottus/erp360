import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import type { ClosePeriodInput, RegisterInvoicePaymentInput } from './accounting.types';
import { AccountingService } from './accounting.service';

@Controller('accounting')
@UseGuards(AuthGuard)
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('purchase-orders/:id/returns')
  @Roles('admin')
  returnToSupplier(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() input: Parameters<AccountingService['returnToSupplier']>[2]) {
    return this.accountingService.returnToSupplier(request.user, id, input);
  }
  @Post('sales-invoices/:id/credit')
  @Roles('admin')
  credit(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: { reason: string; returnStock: boolean }) {
    return this.accountingService.creditInvoice(request.user, id, input);
  }

  @Get('credits')
  @Roles('admin')
  credits(@Req() request: AuthenticatedRequest) { return this.accountingService.listCredits(request.user); }

  @Post('credits/:id/refunds')
  @Roles('admin')
  refund(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: RegisterInvoicePaymentInput) {
    return this.accountingService.refundCredit(request.user, id, input);
  }

  @Post('credits/:id/stock-return')
  @Roles('admin')
  returnCreditedStock(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() input: { reference: string; reason: string }) {
    return this.accountingService.returnCreditedStock(request.user, id, input);
  }
  @Get('payables')
  @Roles('admin')
  payables(@Req() request: AuthenticatedRequest) { return this.accountingService.listPayables(request.user); }

  @Get('purchase-orders/:id/refunds')
  @Roles('admin')
  supplierRefunds(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.accountingService.supplierRefundHistory(request.user, id);
  }

  @Post('purchase-orders/:id/refunds')
  @Roles('admin')
  supplierRefund(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() input: Parameters<AccountingService['receiveSupplierRefund']>[2]) {
    return this.accountingService.receiveSupplierRefund(request.user, id, input);
  }
  @Post('purchase-orders/:id/payments')
  @Roles('admin')
  paySupplier(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: RegisterInvoicePaymentInput) {
    return this.accountingService.paySupplier(request.user, id, input);
  }

  @Get('periods')
  @Roles('admin')
  periods(@Req() request: AuthenticatedRequest) { return this.accountingService.listPeriods(request.user); }

  @Post('periods/reopen')
  @Roles('admin')
  reopen(@Req() request: AuthenticatedRequest, @Body() input: ClosePeriodInput & { reason: string }) {
    return this.accountingService.reopenPeriod(request.user, input);
  }

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
