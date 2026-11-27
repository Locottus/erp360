import { Body, Controller, Get, Header, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { Permissions } from '../auth/permissions.decorator';
import { PettyCashService } from './petty-cash.service';

@Controller('petty-cash')
@UseGuards(AuthGuard)
export class PettyCashController {
  constructor(private readonly pettyCash: PettyCashService) {}

  @Get('funds')
  @Permissions('petty_cash.read')
  @Header('Cache-Control', 'no-store')
  funds(@Req() request: AuthenticatedRequest) {
    return this.pettyCash.listFunds(request.user);
  }

  @Get('funds/:id')
  @Permissions('petty_cash.read')
  @Header('Cache-Control', 'no-store')
  fund(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.pettyCash.getFund(request.user, id);
  }

  @Get('vouchers')
  @Permissions('petty_cash.read')
  @Header('Cache-Control', 'no-store')
  vouchers(@Req() request: AuthenticatedRequest, @Query('status') status?: string) {
    return this.pettyCash.listVouchers(request.user, status);
  }

  @Post('funds')
  @Permissions('petty_cash.manage')
  createFund(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.pettyCash.createFund(request.user, body);
  }

  @Post('funds/:id/open')
  @Permissions('petty_cash.manage')
  open(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.pettyCash.openFund(request.user, id, body);
  }

  @Post('funds/:id/counts')
  @Permissions('petty_cash.manage')
  count(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.pettyCash.registerCount(request.user, id, body);
  }

  @Post('funds/:id/close')
  @Permissions('petty_cash.manage')
  close(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.pettyCash.closeFund(request.user, id, body);
  }

  @Post('funds/:id/vouchers')
  @Permissions('petty_cash.disburse')
  createVoucher(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.pettyCash.createVoucher(request.user, id, body);
  }

  @Post('vouchers/:id/cancel')
  @Permissions('petty_cash.disburse')
  cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.pettyCash.cancelVoucher(request.user, id, body);
  }

  @Post('vouchers/:id/approve')
  @Permissions('petty_cash.approve')
  approve(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.pettyCash.approveVoucher(request.user, id);
  }

  @Post('vouchers/:id/reject')
  @Permissions('petty_cash.approve')
  reject(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.pettyCash.rejectVoucher(request.user, id, body);
  }

  @Post('funds/:id/replenish')
  @Permissions('petty_cash.approve')
  replenish(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.pettyCash.replenish(request.user, id, body);
  }
}
