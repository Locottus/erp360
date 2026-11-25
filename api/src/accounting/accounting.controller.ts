import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { DatabaseService } from '../common/database.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import type { ClosePeriodInput, RegisterInvoicePaymentInput } from './accounting.types';
import { AccountingService } from './accounting.service';

@Controller('accounting')
@UseGuards(AuthGuard)
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('accounts')
  @Roles('admin')
  accounts(@Req() request: AuthenticatedRequest) {
    return this.accountingService.listAccounts(request.user);
  }

  @Get('reports/general-ledger')
  @Roles('admin')
  generalLedger(@Req() request: AuthenticatedRequest,
    @Query('accountCode') accountCode?: string, @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.accountingService.generalLedger(request.user, { accountCode, fromDate, toDate, page, pageSize });
  }

  @Get('reports/financial-statements')
  @Roles('admin')
  financialStatements(@Req() request: AuthenticatedRequest, @Query('asOfDate') asOfDate?: string,
    @Query('fromDate') fromDate?: string, @Query('toDate') toDate?: string) {
    return this.accountingService.getFinancialStatements(request.user, asOfDate, fromDate, toDate);
  }

  @Get('bank-accounts')
  @Roles('admin')
  bankAccounts(@Req() request: AuthenticatedRequest) {
    return this.accountingService.listBankAccounts(request.user);
  }

  @Get('bank-reconciliation-lines')
  @Roles('admin','accountant')
  bankReconciliationLines(@Req() request: AuthenticatedRequest) {
    return this.accountingService.listBankReconciliationLines(request.user);
  }

  @Post('bank-reconciliation-lines/:id/reconcile')
  @Roles('admin','accountant')
  reconcileBankLine(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() input: { matchedPaymentId?: string; status: 'matched' | 'reconciled' | 'difference'; reason: string; differenceAmount?: number }) {
    return this.accountingService.reconcileBankLine(request.user, id, input);
  }

  @Post('bank-accounts')
  @Roles('admin')
  upsertBankAccount(@Req() request: AuthenticatedRequest, @Body() input: { code: string; bankName: string; iban?: string; currencyCode?: string; isActive?: boolean }) {
    return this.accountingService.upsertBankAccount(request.user, input);
  }

  @Post('bank-accounts/:id/statements/import')
  @Roles('admin')
  importBankStatement(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() input: { statementReference: string; statementDate: string; openingBalance: string; closingBalance: string; csv: string }) {
    return this.accountingService.importBankStatement(request.user, id, input);
  }

  @Post('purchase-orders/:id/returns')
  @Roles('admin')
  returnToSupplier(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() input: Parameters<AccountingService['returnToSupplier']>[2]) {
    return this.accountingService.returnToSupplier(request.user, id, input);
  }
  @Post('sales-invoices/:id/credit')
  @Roles('admin')
  credit(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() input: { reason: string; returnStock: boolean; lines?: { orderLineId: string; quantity: number }[] }) {
    return this.accountingService.creditInvoice(request.user, id, input);
  }

  @Get('sales-invoices/:id/creditable-lines')
  @Roles('admin')
  creditableInvoiceLines(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.accountingService.creditableInvoiceLines(request.user, id);
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
    @Body() input: { reference: string; reason: string; lines?: { creditNoteLineId: string; quantity: number }[] }) {
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
  @Roles('admin')
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

@Controller('payments/webhooks')
export class PaymentWebhookController {
  constructor(private readonly db: DatabaseService) {}

  @Post(':provider')
  async receive(
    @Param('provider') provider: string,
    @Headers('x-company-code') companyCodeHeader: string | undefined,
    @Headers('x-signature') signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const providerCode = provider.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,64}$/.test(providerCode)) {
      throw new BadRequestException('Invalid payment provider.');
    }
    const companyCode = (companyCodeHeader ?? (typeof body.companyCode === 'string' ? body.companyCode : '')).trim();
    if (!companyCode) throw new BadRequestException('x-company-code is required.');
    const company = await this.db.query<{ id: string }>(
      'SELECT id FROM companies WHERE code=$1 AND is_active=TRUE',
      [companyCode],
    );
    if (!company.rows[0]) throw new BadRequestException('Active company not found.');
    const eventId = typeof body.eventId === 'string'
      ? body.eventId
      : typeof body.id === 'string' ? body.id : '';
    const eventType = typeof body.eventType === 'string'
      ? body.eventType
      : typeof body.type === 'string' ? body.type : 'unknown';
    if (!eventId || eventId.length > 128) throw new BadRequestException('eventId is required.');

    let signatureValid = false;
    const secretMap = this.readSecretMap();
    const secret = secretMap[providerCode];
    if (secret && signature) {
      const payload = JSON.stringify(body);
      const expected = createHmac('sha256', secret).update(payload, 'utf8').digest();
      const supplied = Buffer.from(signature.replace(/^sha256=/i, '').trim(), 'hex');
      signatureValid = supplied.length === expected.length &&
        timingSafeEqual(supplied, expected);
    }

    const insert = await this.db.query<{ id: string }>(
      `INSERT INTO payment_gateway_events
         (company_id,provider,event_id,event_type,signature_valid,payload,processed)
       VALUES($1,$2,$3,$4,$5,$6,FALSE)
       ON CONFLICT(provider,event_id) DO NOTHING
       RETURNING id`,
      [company.rows[0].id, providerCode, eventId, eventType, signatureValid, JSON.stringify(body)],
    );
    if (!insert.rows[0]) return { received: true, duplicate: true, signatureValid };
    if (!signatureValid) {
      return { received: true, duplicate: false, signatureValid: false, message: 'Evento retenido para revisión; no se aplicó ningún pago.' };
    }
    return { received: true, duplicate: false, signatureValid: true, message: 'Evento recibido. El procesamiento contable automático requiere una conciliación autorizada.' };
  }

  private readSecretMap(): Record<string, string> {
    try {
      const parsed = JSON.parse(process.env.PAYMENT_WEBHOOK_SECRETS_JSON || '{}') as Record<string, string>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
}
