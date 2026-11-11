import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { changeReason, expectedRevision } from '../common/management-input';

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
      profile_revision: number;
    }>(
      `SELECT id, code, name, tax_id, is_active, profile_revision
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

  async updateCurrentCompany(
    user: AuthenticatedUser,
    input: {
      name: string;
      taxId: string | null;
      expectedRevision: number;
      reason: string;
    },
  ) {
    const revision = expectedRevision(input.expectedRevision);
    const reason = changeReason(input.reason);
    if (
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 160 ||
      /[\u0000-\u001f]/.test(input.name) ||
      (input.taxId !== null &&
        (typeof input.taxId !== 'string' ||
          !input.taxId.trim() ||
          input.taxId.length > 64 ||
          /[\u0000-\u001f]/.test(input.taxId)))
    ) {
      throw new BadRequestException(
        'A name (1 to 160 characters) and taxId (1 to 64 characters or explicit null) are required.',
      );
    }
    const name = input.name.trim();
    const taxId = input.taxId?.trim() ?? null;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const before = await client.query<{
        name: string;
        tax_id: string | null;
        profile_revision: number;
      }>(
        'SELECT name,tax_id,profile_revision FROM companies WHERE id=$1 FOR UPDATE',
        [user.companyId],
      );
      if (!before.rows[0]) throw new NotFoundException('Company not found.');
      if (before.rows[0].profile_revision !== revision)
        throw new ConflictException('Company changed. Reload before editing.');
      if (before.rows[0].name === name && before.rows[0].tax_id === taxId)
        throw new ConflictException('No profile changes.');
      const updated = await client.query(
        `UPDATE companies SET name=$2,tax_id=$3,profile_revision=profile_revision+1,updated_at=NOW()
           WHERE id=$1 RETURNING id,code,name,tax_id,is_active,profile_revision`,
        [user.companyId, name, taxId],
      );
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
           VALUES($1::uuid,$2,'company.profile.update','companies',($1::uuid)::text,$3)`,
        [
          user.companyId,
          user.sub,
          JSON.stringify({
            before: before.rows[0],
            after: { name, tax_id: taxId, profile_revision: revision + 1 },
            reason,
          }),
        ],
      );
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCompanyById(id: string, user: AuthenticatedUser) {
    const isAdmin = user.roles.includes('admin');
    if (user.companyId !== id) {
      await this.logAudit(
        user.companyId,
        user.sub,
        'company.read.denied_cross_company',
        id,
        {
          requested_company_id: id,
        },
      );
      throw new ForbiddenException('You cannot access another company.');
    }

    const result = await this.db.query<{
      id: string;
      code: string;
      name: string;
      tax_id: string | null;
      is_active: boolean;
      profile_revision: number;
    }>(
      `SELECT id, code, name, tax_id, is_active, profile_revision
       FROM companies
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    const company = result.rows[0];
    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    await this.logAudit(
      user.companyId,
      user.sub,
      'company.read.by_id',
      company.id,
      {
        requested_company_id: id,
        is_admin: isAdmin,
      },
    );
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
      [
        companyId,
        actorUserId,
        eventName,
        'companies',
        entityId,
        JSON.stringify(payload),
      ],
    );
  }
}
