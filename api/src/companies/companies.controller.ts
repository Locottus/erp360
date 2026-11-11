import { Body, Controller, Get, Patch, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { CompaniesService } from './companies.service';
import { Roles } from '../auth/roles.decorator';

@Controller('companies')
@UseGuards(AuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('current')
  getCurrentCompany(@Req() request: AuthenticatedRequest) {
    return this.companiesService.getCurrentCompany(request.user);
  }

  @Patch('current')
  @Roles('admin')
  updateCurrentCompany(@Req() request: AuthenticatedRequest,
    @Body() input: { name: string; taxId: string | null; expectedRevision: number; reason: string }) {
    return this.companiesService.updateCurrentCompany(request.user, input);
  }

  @Get(':id')
  getCompanyById(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.companiesService.getCompanyById(id, request.user);
  }
}
