import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../common/database.service';

@Injectable()
export class RpcLegacyService {
  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  async execute(methodName: string, params: unknown[]) {
    switch (methodName) {
      case 'common.authenticate':
        return this.authenticate(params);
      case 'object.execute_kw':
        return this.executeKw(params);
      default:
        throw new BadRequestException(`Unsupported XML-RPC method: ${methodName}`);
    }
  }

  private async authenticate(params: unknown[]) {
    const email = String(params[0] ?? '').trim().toLowerCase();
    const password = String(params[1] ?? '');
    if (!email || !password) {
      throw new BadRequestException('common.authenticate requires email and password.');
    }
    const login = await this.authService.login({ email, password });
    return {
      uid: login.user.id,
      company_id: login.user.companyId,
      token: login.access_token,
      roles: login.user.roles,
    };
  }

  private async executeKw(params: unknown[]) {
    const token = String(params[0] ?? '').trim();
    const model = String(params[1] ?? '').trim();
    const method = String(params[2] ?? '').trim();
    const payload = (params[3] as Record<string, unknown>) ?? {};
    if (!token || !model || !method) {
      throw new BadRequestException('object.execute_kw requires token, model and method.');
    }
    let auth: { sub: string; companyId: string; roles: string[] };
    try {
      auth = await this.authService.authenticateAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid RPC token.');
    }
    return this.dispatch(auth, model, method, payload);
  }

  private async dispatch(
    auth: { sub: string; companyId: string; roles: string[] },
    model: string,
    method: string,
    payload: Record<string, unknown>,
  ) {
    if (model === 'res.company' && method === 'current') {
      const company = await this.db.query(
        `SELECT id, code, name, tax_id, is_active
         FROM companies
         WHERE id = $1
         LIMIT 1`,
        [auth.companyId],
      );
      return company.rows[0] ?? null;
    }

    if (model === 'hr.employee' && method === 'search_read') {
      if (!auth.roles.includes('admin')) {
        throw new ForbiddenException('Insufficient role permissions.');
      }
      const employees = await this.db.query(
        `SELECT id, employee_code, full_name, email, job_title, hire_date, status
         FROM hr_employees
         WHERE company_id = $1
         ORDER BY full_name ASC`,
        [auth.companyId],
      );
      return employees.rows;
    }

    if (model === 'sale.order' && method === 'search_read') {
      if (!auth.roles.some((role) => ['admin', 'sales'].includes(role))) {
        throw new ForbiddenException('Insufficient role permissions.');
      }
      const limitRaw = payload['limit'];
      const parsedLimit = Number(limitRaw);
      const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
      const sales = await this.db.query(
        `SELECT id, order_number, status, subtotal, tax_total, grand_total, created_at
         FROM sales_orders
         WHERE company_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [auth.companyId, Math.min(Math.max(limit, 1), 200)],
      );
      return sales.rows;
    }

    throw new BadRequestException(`Unsupported RPC model/method: ${model}.${method}`);
  }
}
