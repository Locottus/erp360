import { Body, Controller, Get, Post, Patch, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import type { BootstrapAdminInput, LoginInput } from './auth.types';
import { Roles } from './roles.decorator';
import type { AuthenticatedRequest } from './authenticated-request.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap-admin')
  bootstrapAdmin(@Body() body: BootstrapAdminInput, @Req() request: Request) {
    return this.authService.bootstrapAdmin(body, request.header('x-correlation-id') || undefined);
  }

  @Post('login')
  login(@Body() body: LoginInput, @Req() request: Request) {
    return this.authService.login(body, request.header('x-correlation-id') || undefined);
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

  @Get('users')
  @UseGuards(AuthGuard)
  @Roles('admin')
  users(@Req() request: AuthenticatedRequest) { return this.authService.listUsers(request.user); }

  @Post('users')
  @UseGuards(AuthGuard)
  @Roles('admin')
  createUser(@Req() request: AuthenticatedRequest, @Body() body: { email: string; fullName: string; roles: string[] }) {
    return this.authService.createUser(request.user, body);
  }

  @Patch('users/:id')
  @UseGuards(AuthGuard)
  @Roles('admin')
  updateUser(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { fullName: string; roles: string[]; isActive: boolean }) {
    return this.authService.updateUser(request.user, id, body);
  }

  @Post('users/:id/reset-password')
  @UseGuards(AuthGuard)
  @Roles('admin')
  issueReset(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.authService.issuePasswordReset(request.user, id);
  }

  @Post('users/:id/revoke-sessions')
  @UseGuards(AuthGuard)
  @Roles('admin')
  revokeSessions(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
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
  adminCheck() {
    return { ok: true, role: 'admin' };
  }
}
