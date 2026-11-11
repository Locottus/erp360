import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../common/database.service';
import type { AuthUser, CreatePortalTokenInput } from './portal.types';

type DbClient = Awaited<ReturnType<DatabaseService['connect']>>;

@Injectable()
export class PortalService {
  constructor(private readonly db: DatabaseService) {}

  async createAccessToken(user: AuthUser, input: CreatePortalTokenInput) {
    if (!input.customerId?.trim()) {
      throw new BadRequestException('customerId is required.');
    }
    const expiresInDays = input.expiresInDays ?? 30;
    if (expiresInDays <= 0 || expiresInDays > 365) {
      throw new BadRequestException('expiresInDays must be between 1 and 365.');
    }
    const customer = await this.db.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name
       FROM customers
       WHERE id = $1 AND company_id = $2
       LIMIT 1`,
      [input.customerId, user.companyId],
    );
    if (!customer.rows[0]) {
      throw new NotFoundException('Customer not found for current company.');
    }

    const rawToken = `ptk_${randomBytes(24).toString('hex')}`;
    const tokenHash = this.hashToken(rawToken);
    const tokenPrefix = rawToken.slice(0, 12);
    const result = await this.db.query<{ id: string; expires_at: string }>(
      `INSERT INTO portal_access_tokens
        (company_id, customer_id, token_hash, token_prefix, status, expires_at, created_by)
       VALUES ($1,$2,$3,$4,'active', NOW() + ($5 || ' days')::interval, $6)
       RETURNING id, expires_at`,
      [user.companyId, input.customerId, tokenHash, tokenPrefix, expiresInDays.toString(), user.sub],
    );
    await this.insertAudit(user.companyId, user.sub, 'portal.token.create', result.rows[0].id, {
      customer_id: input.customerId,
      expires_in_days: expiresInDays,
    });
    return {
      id: result.rows[0].id,
      token: rawToken,
      tokenPrefix,
      expiresAt: result.rows[0].expires_at,
      customer: customer.rows[0],
    };
  }

  async listAccessTokens(user: AuthUser, customerId?: string) {
    const params: unknown[] = [user.companyId];
    let where = 'WHERE company_id = $1';
    if (customerId) {
      params.push(customerId);
      where += ` AND customer_id = $${params.length}`;
    }
    const result = await this.db.query(
      `SELECT id, customer_id, token_prefix, status, expires_at, last_used_at, revoked_at, created_at
       FROM portal_access_tokens
       ${where}
       ORDER BY created_at DESC`,
      params,
    );
    await this.insertAudit(user.companyId, user.sub, 'portal.token.list', user.companyId, {
      total: result.rows.length,
      customer_id: customerId ?? null,
    });
    return result.rows;
  }

  async revokeAccessToken(user: AuthUser, tokenId: string) {
    const result = await this.db.query<{ id: string }>(
      `UPDATE portal_access_tokens
       SET status = 'revoked', revoked_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'active'
       RETURNING id`,
      [tokenId, user.companyId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Active portal token not found.');
    }
    await this.insertAudit(user.companyId, user.sub, 'portal.token.revoke', tokenId, {});
    return { id: tokenId, status: 'revoked' };
  }

  async getPublicSummary(rawToken: string) {
    if (!rawToken?.trim()) {
      throw new UnauthorizedException('Portal token is required.');
    }
    const tokenHash = this.hashToken(rawToken.trim());
    const client = await this.db.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const token = await client.query<{
        id: string;
        company_id: string;
        customer_id: string;
        status: string;
        expires_at: string;
      }>(
        `SELECT id, company_id, customer_id, status, expires_at
         FROM portal_access_tokens
         WHERE token_hash = $1
         LIMIT 1 FOR UPDATE`,
        [tokenHash],
      );
      if (!token.rows[0]) {
        throw new UnauthorizedException('Portal token not found.');
      }
      const now = new Date();
      if (token.rows[0].status !== 'active') {
        throw new UnauthorizedException('Portal token is not active.');
      }
      if (new Date(token.rows[0].expires_at) < now) {
        await client.query(
          `UPDATE portal_access_tokens
           SET status = 'expired'
           WHERE id = $1`,
          [token.rows[0].id],
        );
        await client.query('COMMIT');
        committed = true;
        throw new UnauthorizedException('Portal token has expired.');
      }
      await client.query(`UPDATE portal_access_tokens SET last_used_at = NOW() WHERE id = $1`, [token.rows[0].id]);

      const customer = await client.query<{ id: string; code: string; name: string; email: string | null }>(
        `SELECT id, code, name, email
         FROM customers
         WHERE id = $1 AND company_id = $2
         LIMIT 1`,
        [token.rows[0].customer_id, token.rows[0].company_id],
      );
      const quotations = await client.query(
        `SELECT id, quotation_number, status, subtotal, tax_total, grand_total, created_at
         FROM sales_quotations
         WHERE company_id = $1 AND customer_id = $2
         ORDER BY created_at DESC
         LIMIT 20`,
        [token.rows[0].company_id, token.rows[0].customer_id],
      );
      const orders = await client.query(
        `SELECT id, order_number, status, subtotal, tax_total, grand_total, created_at
         FROM sales_orders
         WHERE company_id = $1 AND customer_id = $2
         ORDER BY created_at DESC
         LIMIT 20`,
        [token.rows[0].company_id, token.rows[0].customer_id],
      );
      const invoices = await client.query(
        `SELECT si.id, si.invoice_number, si.status, si.subtotal, si.tax_total, si.grand_total, si.issued_at
         FROM sales_invoices si
         JOIN sales_orders so ON so.id = si.order_id
         WHERE si.company_id = $1 AND so.customer_id = $2
         ORDER BY si.issued_at DESC
         LIMIT 20`,
        [token.rows[0].company_id, token.rows[0].customer_id],
      );

      await client.query('COMMIT');
      return {
        customer: customer.rows[0],
        quotations: quotations.rows,
        orders: orders.rows,
        invoices: invoices.rows,
      };
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async insertAudit(
    companyId: string,
    actorUserId: string | null,
    eventName: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await this.db.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [companyId, actorUserId, eventName, 'portal', entityId, JSON.stringify(payload)],
    );
  }
}
