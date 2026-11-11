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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { SaasOperatorGuard } from './saas-operator.guard';
import { SaasService } from './saas.service';
import type { SaasRole } from './saas-inputs';

type OperatorRequest = AuthenticatedRequest & { saasRole: SaasRole };

function operatorUser(request: OperatorRequest) {
  return { ...request.user, saasRole: request.saasRole };
}

@Controller('saas')
export class SaasIdentityController {
  constructor(private readonly saas: SaasService) {}

  @Get('operator')
  @UseGuards(AuthGuard)
  async operator(@Req() request: AuthenticatedRequest) {
    return {
      role: await this.saas.operatorRole(request.user),
      integrations: await this.saas.integrations(),
    };
  }

  @Get('subscription')
  @UseGuards(AuthGuard)
  subscription(@Req() request: AuthenticatedRequest) {
    return this.saas.getTenantSubscription(request.user.companyId);
  }
}

@Controller('saas')
@UseGuards(AuthGuard, SaasOperatorGuard)
export class SaasOperatorController {
  constructor(private readonly saas: SaasService) {}

  @Get('operators')
  operators() {
    return this.saas.listOperators();
  }

  @Get('portfolio')
  portfolio(@Query('asOf') asOf?: string) {
    return this.saas.portfolio(asOf);
  }

  @Get('portfolio.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="saas-portfolio.csv"')
  async portfolioCsv(
    @Query('asOf') asOf: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.type('text/csv');
    return this.saas.portfolioCsv(asOf);
  }

  @Get('accounts')
  accounts() {
    return this.saas.listAccounts();
  }

  @Post('accounts')
  createAccount(@Req() request: OperatorRequest, @Body() body: unknown) {
    return this.saas.createAccount(operatorUser(request), body);
  }

  @Get('accounts/:id')
  account(@Param('id', ParseUUIDPipe) id: string) {
    return this.saas.accountDetail(id);
  }

  @Get('companies')
  companies() {
    return this.saas.listCompanies();
  }

  @Post('subscriptions')
  createSubscription(@Req() request: OperatorRequest, @Body() body: unknown) {
    return this.saas.createSubscription(operatorUser(request), body);
  }

  @Patch('subscriptions/:id')
  updateSubscription(
    @Req() request: OperatorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.saas.updateSubscription(operatorUser(request), id, body);
  }

  @Post('subscriptions/:id/invoices')
  createInvoice(
    @Req() request: OperatorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.saas.createInvoice(operatorUser(request), id, body);
  }

  @Post('invoices/:id/payments')
  recordPayment(
    @Req() request: OperatorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.saas.recordPayment(operatorUser(request), id, body);
  }

  @Post('payments/:id/reverse')
  reversePayment(
    @Req() request: OperatorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.saas.reversePayment(operatorUser(request), id, body);
  }

  @Post('invoices/:id/credits')
  issueCredit(
    @Req() request: OperatorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.saas.issueCredit(operatorUser(request), id, body);
  }

  @Post('accounts/:id/followups')
  createFollowup(
    @Req() request: OperatorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.saas.createFollowup(operatorUser(request), id, body);
  }

  @Patch('followups/:id')
  updateFollowup(
    @Req() request: OperatorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.saas.updateFollowup(operatorUser(request), id, body);
  }

  @Get('followups/due')
  collectionQueue(@Query('asOf') asOf?: string) {
    return this.saas.collectionQueue(asOf);
  }

  @Post('collection-runs')
  collectionRun(@Req() request: OperatorRequest, @Body() body: unknown) {
    return this.saas.runCollection(operatorUser(request), body);
  }
}
