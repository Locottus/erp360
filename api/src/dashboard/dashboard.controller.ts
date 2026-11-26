import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { DashboardService } from './dashboard.service';
import { Permissions } from '../auth/permissions.decorator';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @Permissions('inventory.read')
  overview(
    @Req() request: AuthenticatedRequest,
    @Query('period') period?: string,
  ) {
    return this.dashboard.getOverview(request.user, period);
  }
}
