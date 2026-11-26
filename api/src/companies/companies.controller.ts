import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { CompaniesService } from './companies.service';
import { Roles } from '../auth/roles.decorator';
import { Permissions } from '../auth/permissions.decorator';

@Controller('companies')
@UseGuards(AuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('current')
  @Permissions('company.read')
  getCurrentCompany(@Req() request: AuthenticatedRequest) {
    return this.companiesService.getCurrentCompany(request.user);
  }

  @Patch('current')
  @Roles('admin')
  @Permissions('company.update')
  updateCurrentCompany(
    @Req() request: AuthenticatedRequest,
    @Body()
    input: {
      name: string;
      taxId: string | null;
      expectedRevision: number;
      reason: string;
      requireIndependentPurchaseApprover?: boolean;
      currencyCode?: string;
      quotationValidityDays?: number;
    },
  ) {
    return this.companiesService.updateCurrentCompany(request.user, input);
  }

  @Get('cost-policy')
  @Roles('admin', 'accountant')
  @Permissions('accounting.read')
  getCostPolicy(@Req() request: AuthenticatedRequest) {
    return this.companiesService.getCostPolicy(request.user);
  }

  @Patch('cost-policy')
  @Roles('admin', 'accountant')
  @Permissions('accounting.post')
  updateCostPolicy(
    @Req() request: AuthenticatedRequest,
    @Body()
    input: {
      policy: 'weighted_average' | 'fifo';
      expectedRevision: number;
      reason: string;
    },
  ) {
    return this.companiesService.updateCostPolicy(request.user, input);
  }

  @Get('currency-rates')
  @Roles('admin')
  @Permissions('accounting.read')
  getExchangeRates(@Req() request: AuthenticatedRequest) {
    return this.companiesService.getExchangeRates(request.user);
  }

  @Post('currency-rates')
  @Roles('admin')
  @Permissions('accounting.post')
  setExchangeRate(
    @Req() request: AuthenticatedRequest,
    @Body()
    input: { currencyCode: string; rate: string | number; source?: string },
  ) {
    return this.companiesService.setExchangeRate(request.user, input);
  }

  @Get(':id')
  @Permissions('company.read')
  getCompanyById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.companiesService.getCompanyById(id, request.user);
  }
}
