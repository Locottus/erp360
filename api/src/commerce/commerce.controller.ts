import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import type { CreatePurchaseRequestInput, CreateQuotationInput } from './commerce.types';
import { CommerceService } from './commerce.service';

@Controller('commerce')
@UseGuards(AuthGuard)
export class CommerceController {
  constructor(private readonly commerceService: CommerceService) {}

  @Post('sales/quotations')
  @Roles('admin')
  createQuotation(@Req() request: AuthenticatedRequest, @Body() body: CreateQuotationInput) {
    return this.commerceService.createQuotation(request.user, body);
  }

  @Get('sales/quotations')
  listQuotations(@Req() request: AuthenticatedRequest) {
    return this.commerceService.listQuotations(request.user);
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
  listPurchaseRequests(@Req() request: AuthenticatedRequest) {
    return this.commerceService.listPurchaseRequests(request.user);
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
