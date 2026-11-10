import { Controller, Get, Param } from '@nestjs/common';
import { PortalService } from './portal.service';

@Controller('portal/public')
export class PortalPublicController {
  constructor(private readonly portalService: PortalService) {}

  @Get(':token/summary')
  getPublicSummary(@Param('token') token: string) {
    return this.portalService.getPublicSummary(token);
  }
}
