import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request.type';
import { Roles } from '../auth/roles.decorator';
import type { CreatePortalTokenInput } from './portal.types';
import { PortalService } from './portal.service';

@Controller('portal')
@UseGuards(AuthGuard)
export class PortalAdminController {
  constructor(private readonly portalService: PortalService) {}

  @Post('access-tokens')
  @Roles('admin')
  createAccessToken(@Req() request: AuthenticatedRequest, @Body() body: CreatePortalTokenInput) {
    return this.portalService.createAccessToken(request.user, body);
  }

  @Get('access-tokens')
  @Roles('admin')
  listAccessTokens(@Req() request: AuthenticatedRequest, @Query('customerId') customerId?: string) {
    return this.portalService.listAccessTokens(request.user, customerId);
  }

  @Post('access-tokens/:id/revoke')
  @Roles('admin')
  revokeAccessToken(@Req() request: AuthenticatedRequest, @Param('id') tokenId: string) {
    return this.portalService.revokeAccessToken(request.user, tokenId);
  }
}
