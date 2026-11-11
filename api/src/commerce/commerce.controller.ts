import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards, StreamableFile } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CreatePurchaseRequestInput, CreateQuotationInput } from './commerce.types';
import { CommerceService } from './commerce.service';

@Controller('commerce')
@UseGuards(AuthGuard)
export class CommerceController {
  constructor(private readonly commerceService: CommerceService) {}

  @Post('sales/orders/:id/cancel')
  @Roles('admin')
  cancelSale(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: { reason: string }) {
    return this.commerceService.cancelOrder(request.user, id, 'sales', input.reason);
  }

  @Post('purchases/orders/:id/cancel')
  @Roles('admin')
  cancelPurchase(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: { reason: string }) {
    return this.commerceService.cancelOrder(request.user, id, 'purchase', input.reason);
  }

  @Get('sales/invoices/:id/pdf')
  @Roles('admin', 'sales')
  async invoicePdf(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return new StreamableFile(await this.commerceService.invoicePdf(request.user, id),
      { type: 'application/pdf', disposition: 'attachment; filename="factura-comercial.pdf"' });
  }

  @Post('sales/quotations')
  @Roles('admin')
  createQuotation(@Req() request: AuthenticatedRequest, @Body() body: CreateQuotationInput) {
    return this.commerceService.createQuotation(request.user, body);
  }

  @Get('sales/quotations')
  @Roles('admin', 'sales')
  listQuotations(@Req() request: AuthenticatedRequest) {
    return this.commerceService.listQuotations(request.user);
  }

  @Get('sales/orders')
  @Roles('admin', 'sales')
  listSalesOrders(@Req() request: AuthenticatedRequest) {
    return this.commerceService.listSalesOrders(request.user);
  }

  @Get('sales/invoices')
  @Roles('admin', 'sales')
  listSalesInvoices(@Req() request: AuthenticatedRequest) {
    return this.commerceService.listSalesInvoices(request.user);
  }

  @Post('sales/quotations/:id/confirm')
  @Roles('admin')
  confirmQuotation(
    @Req() request: AuthenticatedRequest,
    @Param('id') quotationId: string,
    @Body() body: { orderNumber: string },
  ) {
    return this.commerceService.confirmQuotation(request.user, quotationId, body?.orderNumber);
  }

  @Patch('sales/quotations/:id/validity')
  @Roles('admin')
  reviseQuotationValidity(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { validUntil: string | null; expectedRevision: number; reason: string },
  ) {
    return this.commerceService.reviseQuotationValidity(request.user, id, body);
  }

  @Post('sales/orders/:id/invoice')
  @Roles('admin')
  issueInvoice(
    @Req() request: AuthenticatedRequest,
    @Param('id') salesOrderId: string,
    @Body() body: { invoiceNumber: string },
  ) {
    return this.commerceService.issueInvoice(request.user, salesOrderId, body?.invoiceNumber);
  }

  @Post('purchases/requests')
  @Roles('admin')
  createPurchaseRequest(@Req() request: AuthenticatedRequest, @Body() body: CreatePurchaseRequestInput) {
    return this.commerceService.createPurchaseRequest(request.user, body);
  }

  @Get('purchases/requests')
  @Roles('admin', 'purchases')
  listPurchaseRequests(@Req() request: AuthenticatedRequest) {
    return this.commerceService.listPurchaseRequests(request.user);
  }

  @Get('purchases/requests/:id')
  @Roles('admin', 'purchases')
  purchaseRequestDetails(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerceService.purchaseRequestDetails(request.user, id);
  }

  @Post('purchases/requests/:id/reject')
  @Roles('admin')
  rejectPurchaseRequest(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() input: { reason: string }) {
    return this.commerceService.rejectPurchaseRequest(request.user, id, input);
  }

  @Post('purchases/requests/:id/approve')
  @Roles('admin')
  approvePurchaseRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') requestId: string,
    @Body() body: { orderNumber: string },
  ) {
    return this.commerceService.approvePurchaseRequest(request.user, requestId, body?.orderNumber);
  }

  @Post('purchases/orders/:id/receive')
  @Roles('admin')
  receivePurchaseOrder(
    @Req() request: AuthenticatedRequest,
    @Param('id') purchaseOrderId: string,
    @Body() body: { receiptNumber: string },
  ) {
    return this.commerceService.receivePurchaseOrder(request.user, purchaseOrderId, body?.receiptNumber);
  }
}
