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
      currency_code: string;
      require_independent_purchase_approver: boolean;
    }>(
      `SELECT id, code, name, tax_id, is_active, profile_revision, currency_code, require_independent_purchase_approver
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
      requireIndependentPurchaseApprover?: boolean;
      currencyCode?: string;
    },
  ) {
    const revision = expectedRevision(input.expectedRevision);
    const reason = changeReason(input.reason);
    if (input.requireIndependentPurchaseApprover !== undefined &&
        typeof input.requireIndependentPurchaseApprover !== 'boolean') {
      throw new BadRequestException('requireIndependentPurchaseApprover must be boolean when provided.');
    }
    if (input.currencyCode !== undefined &&
        (typeof input.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(input.currencyCode.trim().toUpperCase()))) {
      throw new BadRequestException('currencyCode must be a 3-letter ISO code when provided.');
    }
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
    const currencyCode = input.currencyCode ? input.currencyCode.trim().toUpperCase() : undefined;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const before = await client.query<{
        name: string;
        tax_id: string | null;
        profile_revision: number;
        currency_code: string;
        require_independent_purchase_approver: boolean;
      }>(
        'SELECT name,tax_id,profile_revision,currency_code,require_independent_purchase_approver FROM companies WHERE id=$1 FOR UPDATE',
        [user.companyId],
      );
      if (!before.rows[0]) throw new NotFoundException('Company not found.');
      if (before.rows[0].profile_revision !== revision)
        throw new ConflictException('Company changed. Reload before editing.');
      const finalCurrencyCode = currencyCode ?? before.rows[0].currency_code;
      const requireIndependentApprover = input.requireIndependentPurchaseApprover ??
        before.rows[0].require_independent_purchase_approver;
      if (before.rows[0].name === name && before.rows[0].tax_id === taxId &&
          before.rows[0].currency_code === finalCurrencyCode &&
          before.rows[0].require_independent_purchase_approver === requireIndependentApprover)
        throw new ConflictException('No profile changes.');
      const updated = await client.query(
        `UPDATE companies SET name=$2,tax_id=$3,currency_code=$4,require_independent_purchase_approver=$5,
           profile_revision=profile_revision+1,updated_at=NOW()
           WHERE id=$1 RETURNING id,code,name,tax_id,currency_code,is_active,profile_revision,require_independent_purchase_approver`,
        [user.companyId, name, taxId, finalCurrencyCode, requireIndependentApprover],
      );
      await client.query(
        `INSERT INTO audit_log(company_id,actor_user_id,event_name,entity_name,entity_id,payload)
           VALUES($1::uuid,$2,'company.profile.update','companies',($1::uuid)::text,$3)`,
        [
          user.companyId,
          user.sub,
          JSON.stringify({
            before: before.rows[0],
            after: { name, tax_id: taxId, currency_code: finalCurrencyCode, profile_revision: revision + 1,
              require_independent_purchase_approver: requireIndependentApprover },
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

  async getExchangeRates(user: AuthenticatedUser) {
    const result = await this.db.query<{
      id: string;
      from_currency: string;
      to_currency: string;
      rate: string;
      source: string;
      valid_from: string;
      valid_to: string | null;
    }>(
      `SELECT id, from_currency, to_currency, rate::text AS rate, source, valid_from::text AS valid_from, valid_to::text AS valid_to
       FROM currency_exchange_rates
       WHERE company_id = $1
       ORDER BY valid_from DESC, id DESC`,
      [user.companyId],
    );
    return result.rows;
  }

  async setExchangeRate(user: AuthenticatedUser, input: { currencyCode: string; rate: string | number; source?: string }) {
    if (typeof input.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(input.currencyCode.trim().toUpperCase())) {
      throw new BadRequestException('currencyCode must be a valid ISO code.');
    }
    const rateValue = Number(input.rate);
    if (!Number.isFinite(rateValue) || rateValue <= 0) {
      throw new BadRequestException('rate must be a positive number.');
    }
    const company = await this.db.query<{ currency_code: string }>(
      'SELECT currency_code FROM companies WHERE id = $1 LIMIT 1',
      [user.companyId],
    );
    if (!company.rows[0]) throw new NotFoundException('Company not found.');
    const currencyCode = input.currencyCode.trim().toUpperCase();
    const fromCurrency = company.rows[0].currency_code;
    if (currencyCode === fromCurrency) {
      throw new BadRequestException('Base currency and quote currency cannot be the same.');
    }
    const result = await this.db.query<{ id: string; rate: string }>(
      `INSERT INTO currency_exchange_rates (company_id, from_currency, to_currency, rate, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, rate::text AS rate`,
      [user.companyId, fromCurrency, currencyCode, rateValue.toFixed(8), input.source?.trim() || 'manual', user.sub],
    );
    await this.logAudit(
      user.companyId,
      user.sub,
      'company.currency.rate.set',
      result.rows[0].id,
      {
        from_currency: fromCurrency,
        to_currency: currencyCode,
        rate: rateValue,
        source: input.source?.trim() || 'manual',
      },
    );
    return { id: result.rows[0].id, rate: result.rows[0].rate, fromCurrency, toCurrency: currencyCode };
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
      currency_code: string;
      require_independent_purchase_approver: boolean;
    }>(
      `SELECT id, code, name, tax_id, is_active, profile_revision, currency_code, require_independent_purchase_approver
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
