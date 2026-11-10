import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';

type AuthenticatedUser = {
  sub: string;
  email: string;
  companyId: string;
  roles: string[];
};

@Injectable()
export class CompaniesService {
  constructor(private readonly db: DatabaseService) {}

  async getCurrentCompany(user: AuthenticatedUser) {
    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      tax_id: string | null;
      is_active: boolean;
    }>(
      `SELECT id, code, name, tax_id, is_active
       FROM companies
       WHERE id = $1
       LIMIT 1`,
      [user.companyId],
    );
    const company = result.rows[0];
    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    await this.logAudit(
      user.companyId,
      user.sub,
      'company.read.current',
      company.id,
      {
        role_count: user.roles.length,
      },
    );
    return company;
  }

  async getCompanyById(id: string, user: AuthenticatedUser) {
    const isAdmin = user.roles.includes('admin');
    if (!isAdmin && user.companyId !== id) {
      await this.logAudit(user.companyId, user.sub, 'company.read.denied_cross_company', id, {
        requested_company_id: id,
      });
      throw new ForbiddenException('You cannot access another company.');
    }

    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      tax_id: string | null;
      is_active: boolean;
    }>(
      `SELECT id, code, name, tax_id, is_active
       FROM companies
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    const company = result.rows[0];
    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    await this.logAudit(user.companyId, user.sub, 'company.read.by_id', company.id, {
      requested_company_id: id,
      is_admin: isAdmin,
    });
    return company;
  }

  private async logAudit(
    companyId: string,
    actorUserId: string,
    eventName: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await this.db.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [companyId, actorUserId, eventName, 'companies', entityId, JSON.stringify(payload)],
    );
  }
}
