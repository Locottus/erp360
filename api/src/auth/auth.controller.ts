import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import type { BootstrapAdminInput, LoginInput } from './auth.types';
import { Roles } from './roles.decorator';
import type { AuthenticatedRequest } from './authenticated-request.type';
import { Permissions } from './permissions.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap-admin')
  bootstrapAdmin(@Body() body: BootstrapAdminInput, @Req() request: Request) {
    return this.authService.bootstrapAdmin(
      body,
      request.header('x-correlation-id') || undefined,
    );
  }

  @Post('login')
  login(@Body() body: LoginInput, @Req() request: Request) {
    return this.authService.login(
      body,
      request.header('x-correlation-id') || undefined,
    );
  }

  @Post('reset-password')
  resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  logout(@Req() request: AuthenticatedRequest) {
    return this.authService.revokeSessions(request.user);
  }

  @Get('mfa/status')
  @UseGuards(AuthGuard)
  mfaStatus(@Req() request: AuthenticatedRequest) {
    return this.authService.getMfaStatus(request.user);
  }

  @Get('mfa/setup')
  @UseGuards(AuthGuard)
  mfaSetup(@Req() request: AuthenticatedRequest) {
    return this.authService.setupMfa(request.user);
  }

  @Post('mfa/verify')
  @UseGuards(AuthGuard)
  mfaVerify(
    @Req() request: AuthenticatedRequest,
    @Body() body: { code: string },
  ) {
    return this.authService.verifyMfa(request.user, body.code);
  }

  @Post('mfa/disable')
  @UseGuards(AuthGuard)
  mfaDisable(
    @Req() request: AuthenticatedRequest,
    @Body() body: { code: string },
  ) {
    return this.authService.disableMfa(request.user, body.code);
  }

  @Get('users')
  @UseGuards(AuthGuard)
  @Roles('admin')
  @Permissions('identity.users.read')
  users(@Req() request: AuthenticatedRequest) {
    return this.authService.listUsers(request.user);
  }

  @Post('users')
  @UseGuards(AuthGuard)
  @Roles('admin')
  @Permissions('identity.users.manage')
  createUser(
    @Req() request: AuthenticatedRequest,
    @Body() body: { email: string; fullName: string; roles: string[] },
  ) {
    return this.authService.createUser(request.user, body);
  }

  @Patch('users/:id')
  @UseGuards(AuthGuard)
  @Roles('admin')
  @Permissions('identity.users.manage')
  updateUser(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      fullName: string;
      roles: string[];
      isActive: boolean;
      expectedRevision: number;
      reason: string;
    },
  ) {
    return this.authService.updateUser(request.user, id, body);
  }

  @Get('rbac')
  @UseGuards(AuthGuard)
  @Roles('admin')
  @Permissions('identity.users.manage')
  rbac(@Req() request: AuthenticatedRequest) {
    return this.authService.getRbacState(request.user);
  }

  @Patch('rbac/overrides')
  @UseGuards(AuthGuard)
  @Roles('admin')
  @Permissions('identity.users.manage')
  updateRbacOverrides(
    @Req() request: AuthenticatedRequest,
    @Body()
    body: {
      expectedRevision: number;
      reason: string;
      overrides: Array<{ permissionCode: string; effect: 'grant' | 'deny' }>;
    },
  ) {
    return this.authService.updateRbacOverrides(request.user, body);
  }

  @Post('users/:id/reset-password')
  @UseGuards(AuthGuard)
  @Roles('admin')
  @Permissions('identity.users.manage')
  issueReset(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.authService.issuePasswordReset(request.user, id);
  }

  @Post('users/:id/reset-mfa')
  @UseGuards(AuthGuard)
  @Roles('admin')
  @Permissions('identity.users.manage')
  resetMfa(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: { expectedRevision: number; reason: string },
  ) {
    return this.authService.resetUserMfa(request.user, id, body);
  }

  @Post('users/:id/revoke-sessions')
  @UseGuards(AuthGuard)
  @Roles('admin')
  @Permissions('identity.sessions.revoke')
  revokeSessions(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.authService.revokeSessions(request.user, id);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(request.user.sub);
  }

  @Get('admin-check')
  @UseGuards(AuthGuard)
  @Roles('admin')
  @Permissions('identity.users.read')
  adminCheck() {
    return { ok: true, role: 'admin' };
  }
}
