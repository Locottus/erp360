import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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
