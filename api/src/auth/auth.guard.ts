import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { ROLES_KEY } from './roles.decorator';

type RequestWithUser = Request & {
  user?: { sub: string; email: string; companyId: string; roles: string[] };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token.');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token.');
    }

    request.user = await this.authService.authenticateAccessToken(token);

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0) {
      const userRoles = request.user.roles || [];
      const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role));
      if (!hasRequiredRole) {
        throw new ForbiddenException('Insufficient role permissions.');
      }
    }

    return true;
  }
}
