import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { CompaniesService } from './companies.service';

@Controller('companies')
@UseGuards(AuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('current')
  getCurrentCompany(@Req() request: AuthenticatedRequest) {
    return this.companiesService.getCurrentCompany(request.user);
  }

  @Get(':id')
  getCompanyById(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.companiesService.getCompanyById(id, request.user);
  }
}
