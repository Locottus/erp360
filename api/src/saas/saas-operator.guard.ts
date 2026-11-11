import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { DatabaseService } from '../common/database.service';
import type { SaasRole } from './saas-inputs';

type OperatorRequest = Request & {
  user?: { sub: string };
  saasRole?: SaasRole;
};

@Injectable()
export class SaasOperatorGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OperatorRequest>();
    if (!request.user?.sub) {
      throw new ForbiddenException('Authentication is required.');
    }
    const result = await this.db.query<{ role: SaasRole }>(
      `SELECT o.role
       FROM platform_saas_operators o
       JOIN users u ON u.id = o.user_id AND u.is_active = TRUE
       WHERE o.user_id = $1 AND o.enabled = TRUE`,
      [request.user.sub],
    );
    if (!result.rows[0]) {
      throw new ForbiddenException(
        'Enabled platform SaaS membership is required.',
      );
    }
    request.saasRole = result.rows[0].role;
    return true;
  }
}
