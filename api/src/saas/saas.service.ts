import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../common/database.service';
import type { AuthTokenPayload } from '../auth/auth.types';
import {
  objectInput,
  parseModulePrices,
  requiredDate,
  requiredMoney,
  requiredReason,
  requiredReference,
  requiredText,
  type ModulePrice,
  type SaasRole,
} from './saas-inputs';

type OperatorUser = AuthTokenPayload & { saasRole?: SaasRole };
type SqlQueryable = {
  query(text: string, values?: any[]): Promise<{ rows: any[] }>;
};
type SubscriptionRow = {
  id: string;
  account_id: string;
  company_id: string;
  currency: string;
  status: string;
  revision: number;
  starts_on: string;
  renews_on: string;
};
type QueueRow = {
  invoice_id: string;
  account_id: string;
  account_name: string;
  company_id: string;
  company_name: string;
  reference: string;
  currency: string;
  balance: string;
  due_on: string;
  days_overdue: number;
  stage: string;
  already_prepared: boolean;
  paused: boolean;
};

const MODULE_NAMES: Record<string, string> = {
  base: 'Base por empresa',
  sales: 'Ventas',
  purchases: 'Compras',
  inventory: 'Inventario',
  accounting: 'Contabilidad',
  store: 'Tienda online',
  people: 'Personas',
};

const COLLECTION_QUEUE_SQL = `
WITH invoice_amounts AS (
  SELECT i.id, i.subscription_id, i.reference, i.currency, i.due_on, i.total,
         s.account_id, s.company_id, a.name AS account_name,
         c.name AS company_name
  FROM saas_invoices i
  JOIN saas_subscriptions s ON s.id = i.subscription_id
  JOIN saas_accounts a ON a.id = s.account_id
  JOIN companies c ON c.id = s.company_id
  WHERE i.issued_on <= $1::date
), paid AS (
  SELECT p.invoice_id, SUM(p.amount) AS amount
  FROM saas_payments p
  WHERE p.paid_on <= $1::date
  GROUP BY p.invoice_id
), reversed AS (
  SELECT p.invoice_id, SUM(r.amount) AS amount
  FROM saas_payment_reversals r
  JOIN saas_payments p ON p.id = r.payment_id
  WHERE p.paid_on <= $1::date
    AND (r.created_at AT TIME ZONE 'UTC')::date <= $1::date
  GROUP BY p.invoice_id
), credited AS (
  SELECT cr.invoice_id, SUM(cr.amount) AS amount
  FROM saas_invoice_credits cr
  WHERE cr.issued_on <= $1::date
  GROUP BY cr.invoice_id
), balances AS (
  SELECT i.*,
         i.total - COALESCE(p.amount, 0) + COALESCE(r.amount, 0) - COALESCE(cr.amount, 0) AS balance,
         (i.due_on - $1::date) AS days_until_due
  FROM invoice_amounts i
  LEFT JOIN paid p ON p.invoice_id = i.id
  LEFT JOIN reversed r ON r.invoice_id = i.id
  LEFT JOIN credited cr ON cr.invoice_id = i.id
), staged AS (
  SELECT b.*,
         CASE
           WHEN days_until_due = 3 THEN 'D-3'
           WHEN days_until_due = 0 THEN 'D0'
           WHEN days_until_due = -3 THEN 'D+3'
           WHEN days_until_due <= -7 THEN 'D+7'
           ELSE NULL
         END AS stage
  FROM balances b
  WHERE balance > 0
)
SELECT s.id AS invoice_id, s.account_id, s.account_name, s.company_id, s.company_name,
       s.reference, s.currency, s.balance::text AS balance, s.due_on::text AS due_on,
       GREATEST($1::date - s.due_on, 0)::integer AS days_overdue,
       s.stage,
       EXISTS (
         SELECT 1 FROM saas_followups f
         WHERE f.invoice_id = s.id AND f.collection_stage = s.stage
       ) AS already_prepared,
       COALESCE((
         SELECT f.status = 'paused'
         FROM saas_followups f
         WHERE f.invoice_id = s.id AND f.collection_stage IS NOT NULL
         ORDER BY f.updated_at DESC, f.created_at DESC
         LIMIT 1
       ), FALSE) AS paused
FROM staged s
WHERE s.stage IS NOT NULL
ORDER BY s.due_on, s.account_name, s.reference`;

const COLLECTION_SETTLED_COUNT_SQL = `
SELECT COUNT(*)::integer AS count
FROM saas_invoices i
WHERE i.issued_on <= $1::date
  AND CASE
    WHEN i.due_on - $1::date = 3 THEN TRUE
    WHEN i.due_on - $1::date = 0 THEN TRUE
    WHEN i.due_on - $1::date = -3 THEN TRUE
    WHEN i.due_on - $1::date <= -7 THEN TRUE
    ELSE FALSE
  END
  AND i.total
    - COALESCE((
        SELECT SUM(p.amount) FROM saas_payments p
        WHERE p.invoice_id = i.id AND p.paid_on <= $1::date
      ), 0)
    + COALESCE((
        SELECT SUM(r.amount)
        FROM saas_payment_reversals r JOIN saas_payments p ON p.id = r.payment_id
        WHERE p.invoice_id = i.id AND p.paid_on <= $1::date
          AND (r.created_at AT TIME ZONE 'UTC')::date <= $1::date
      ), 0)
    - COALESCE((
        SELECT SUM(cr.amount) FROM saas_invoice_credits cr
        WHERE cr.invoice_id = i.id AND cr.issued_on <= $1::date
      ), 0) <= 0`;

@Injectable()
export class SaasService {
  constructor(private readonly db: DatabaseService) {}

  async operatorRole(user: AuthTokenPayload): Promise<SaasRole | null> {
    const result = await this.db.query<{ role: SaasRole }>(
      `SELECT role FROM platform_saas_operators WHERE user_id = $1 AND enabled = TRUE`,
      [user.sub],
    );
    return result.rows[0]?.role ?? null;
  }

  async integrations() {
    return {
      payments: 'not_configured',
      email: 'not_configured',
      enforcement: 'informational',
    } as const;
  }

  async listOperators() {
    const result = await this.db.query(
      `SELECT o.user_id, u.full_name, u.email, o.role
       FROM platform_saas_operators o
       JOIN users u ON u.id = o.user_id
       WHERE o.enabled = TRUE AND u.is_active = TRUE
       ORDER BY u.full_name, u.email`,
    );
    return result.rows;
  }

  async listAccounts() {
    const result = await this.db.query(
      `SELECT a.id, a.name, a.billing_email, a.created_at, a.updated_at,
              COUNT(DISTINCT s.id)::integer AS subscription_count
       FROM saas_accounts a
       LEFT JOIN saas_subscriptions s ON s.account_id = a.id
       GROUP BY a.id
       ORDER BY a.name, a.id`,
    );
    return result.rows;
  }

  async createAccount(user: OperatorUser, input: unknown) {
    this.assertWrite(user);
    const body = objectInput(input);
    const name = requiredText(body.name, 'name', 180);
    const billingEmail = requiredText(body.billingEmail, 'billingEmail', 255, {
      lowerCase: true,
    });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
      throw new BadRequestException(
        'billingEmail must be a valid email address.',
      );
    }
    return this.transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO saas_accounts(name, billing_email, created_by)
         VALUES ($1, $2, $3) RETURNING id`,
        [name, billingEmail, user.sub],
      );
      const accountId = result.rows[0].id;
      await this.audit(client, user.sub, {
        accountId,
        action: 'account.created',
        entityType: 'account',
        entityId: accountId,
        payload: { name, billing_email: billingEmail },
      });
      return this.getAccountSummary(accountId, client);
    });
  }

  async listCompanies() {
    const result = await this.db.query(
      `SELECT id, code, name FROM companies ORDER BY name, code`,
    );
    return result.rows;
  }

  async createSubscription(user: OperatorUser, input: unknown) {
    this.assertWrite(user);
    const body = objectInput(input);
    const accountId = this.requiredUuid(body.accountId, 'accountId');
    const companyId = this.requiredUuid(body.companyId, 'companyId');
    const currency = body.currency;
    if (currency !== 'USD') {
      throw new BadRequestException(
        'Only USD is supported for SaaS contracts.',
      );
    }
    const modules = parseModulePrices(body.modules);
    const startsOn = requiredDate(body.startsOn, 'startsOn');
    const renewsOn = requiredDate(body.renewsOn, 'renewsOn');
    if (renewsOn < startsOn) {
      throw new BadRequestException(
        'renewsOn cannot be earlier than startsOn.',
      );
    }
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `saas-company:${companyId}`,
      ]);
      const company = await client.query(
        `SELECT id FROM companies WHERE id = $1 FOR UPDATE`,
        [companyId],
      );
      if (!company.rows[0]) {
        throw new NotFoundException('Company not found.');
      }
      const account = await client.query(
        `SELECT id FROM saas_accounts WHERE id = $1`,
        [accountId],
      );
      if (!account.rows[0]) {
        throw new NotFoundException('Billing account not found.');
      }
      const existing = await client.query(
        `SELECT id FROM saas_subscriptions WHERE company_id = $1 AND status = 'active'`,
        [companyId],
      );
      if (existing.rows[0]) {
        throw new ConflictException(
          'This company already has an active SaaS subscription.',
        );
      }
      const inserted = await client.query<{ id: string; subtotal: string }>(
        `INSERT INTO saas_subscriptions(account_id, company_id, currency, starts_on, renews_on, created_by)
         VALUES ($1, $2, 'USD', $3, $4, $5) RETURNING id`,
        [accountId, companyId, startsOn, renewsOn, user.sub],
      );
      const subscriptionId = inserted.rows[0].id;
      const revision = await client.query<{ id: string }>(
        `INSERT INTO saas_subscription_revisions(subscription_id, revision, renews_on, reason, created_by)
         VALUES ($1, 1, $2, 'Initial subscription', $3) RETURNING id`,
        [subscriptionId, renewsOn, user.sub],
      );
      await this.insertRevisionModules(client, revision.rows[0].id, modules);
      await this.audit(client, user.sub, {
        accountId,
        companyId,
        action: 'subscription.created',
        entityType: 'subscription',
        entityId: subscriptionId,
        payload: {
          revision: 1,
          modules,
          starts_on: startsOn,
          renews_on: renewsOn,
        },
      });
      return this.getSubscription(subscriptionId, client);
    });
  }

  async updateSubscription(user: OperatorUser, id: string, input: unknown) {
    this.assertWrite(user);
    const body = objectInput(input);
    const expectedRevision = this.requiredRevision(body.expectedRevision);
    const modules = parseModulePrices(body.modules);
    const renewsOn = requiredDate(body.renewsOn, 'renewsOn');
    const reason = requiredReason(body.reason);
    return this.transaction(async (client) => {
      const result = await client.query<SubscriptionRow>(
        `SELECT id, account_id, company_id, currency, status, revision, starts_on::text, renews_on::text
         FROM saas_subscriptions WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const subscription = result.rows[0];
      if (!subscription) {
        throw new NotFoundException('Subscription not found.');
      }
      if (subscription.status !== 'active') {
        throw new ConflictException(
          'Only an active subscription can be changed.',
        );
      }
      if (subscription.revision !== expectedRevision) {
        throw new ConflictException(
          'Subscription changed. Reload it before saving.',
        );
      }
      if (renewsOn < subscription.starts_on) {
        throw new BadRequestException(
          'renewsOn cannot be earlier than startsOn.',
        );
      }
      const nextRevision = expectedRevision + 1;
      const revision = await client.query<{ id: string }>(
        `INSERT INTO saas_subscription_revisions(subscription_id, revision, renews_on, reason, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [id, nextRevision, renewsOn, reason, user.sub],
      );
      await this.insertRevisionModules(client, revision.rows[0].id, modules);
      await client.query(
        `UPDATE saas_subscriptions SET revision = $2, renews_on = $3, updated_at = NOW()
         WHERE id = $1`,
        [id, nextRevision, renewsOn],
      );
      await this.audit(client, user.sub, {
        accountId: subscription.account_id,
        companyId: subscription.company_id,
        action: 'subscription.revised',
        entityType: 'subscription',
        entityId: id,
        payload: {
          revision: nextRevision,
          previous_revision: expectedRevision,
          modules,
          renews_on: renewsOn,
          reason,
        },
      });
      return this.getSubscription(id, client);
    });
  }

  async getTenantSubscription(companyId: string) {
    const result = await this.db.query(
      `SELECT s.id, s.account_id, s.company_id, s.currency, s.status, s.revision,
              s.starts_on::text AS starts_on, s.renews_on::text AS renews_on,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object('code', m.code, 'price', m.price::text) ORDER BY m.code)
                FROM saas_subscription_revisions r
                JOIN saas_subscription_revision_modules m ON m.revision_id = r.id
                WHERE r.subscription_id = s.id AND r.revision = s.revision
              ), '[]'::jsonb) AS modules
       FROM saas_subscriptions s
       WHERE s.company_id = $1 AND s.status = 'active'
       LIMIT 1`,
      [companyId],
    );
    const subscription = result.rows[0]
      ? { ...result.rows[0], access: 'informational' }
      : null;
    const companyResult = await this.db.query<{
      id: string;
      code: string;
      name: string;
    }>(`SELECT id, code, name FROM companies WHERE id = $1`, [companyId]);
    if (!companyResult.rows[0]) {
      throw new NotFoundException('Company not found.');
    }
    const usersResult = await this.db.query<{
      total_count: number;
      active_count: number;
    }>(
      `SELECT COUNT(*)::integer AS total_count,
              COUNT(*) FILTER (WHERE is_active)::integer AS active_count
       FROM users WHERE company_id = $1`,
      [companyId],
    );
    const asOf = await this.db.query<{ as_of: string }>(
      `SELECT (NOW() AT TIME ZONE 'UTC')::date::text AS as_of`,
    );
    const balance = await this.db.query<{
      open_balance: string;
      overdue_balance: string;
    }>(
      `WITH balances AS (
         SELECT i.id, i.total, i.due_on,
                i.total - COALESCE(p.amount, 0) + COALESCE(r.amount, 0) - COALESCE(cr.amount, 0) AS balance
         FROM saas_invoices i
         JOIN saas_subscriptions s ON s.id = i.subscription_id
         LEFT JOIN LATERAL (
           SELECT SUM(amount) AS amount FROM saas_payments
           WHERE invoice_id = i.id AND paid_on <= $2::date
         ) p ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(r.amount) AS amount
           FROM saas_payment_reversals r JOIN saas_payments pay ON pay.id = r.payment_id
           WHERE pay.invoice_id = i.id AND pay.paid_on <= $2::date
             AND (r.created_at AT TIME ZONE 'UTC')::date <= $2::date
         ) r ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(amount) AS amount FROM saas_invoice_credits
           WHERE invoice_id = i.id AND issued_on <= $2::date
         ) cr ON TRUE
         WHERE s.company_id = $1 AND i.issued_on <= $2::date
       )
       SELECT COALESCE(SUM(balance), 0)::text AS open_balance,
              COALESCE(SUM(balance) FILTER (WHERE due_on < $2::date), 0)::text AS overdue_balance
       FROM balances`,
      [companyId, asOf.rows[0].as_of],
    );
    return {
      subscription,
      company: companyResult.rows[0],
      users: usersResult.rows[0],
      balance: {
        currency: 'USD',
        ...balance.rows[0],
        as_of: asOf.rows[0].as_of,
      },
      access: 'informational' as const,
    };
  }

  async portfolio(asOfInput?: unknown) {
    const asOf =
      asOfInput === undefined
        ? await this.utcToday()
        : requiredDate(asOfInput, 'asOf');
    const clientsResult = await this.db.query(
      `WITH invoice_values AS (
         SELECT i.id, s.account_id, i.currency, i.due_on, i.issued_on, i.total,
                i.total - COALESCE(p.amount, 0) + COALESCE(r.amount, 0) - COALESCE(cr.amount, 0) AS balance
         FROM saas_invoices i
         JOIN saas_subscriptions s ON s.id = i.subscription_id
         LEFT JOIN LATERAL (
           SELECT SUM(amount) AS amount FROM saas_payments
           WHERE invoice_id = i.id AND paid_on <= $1::date
         ) p ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(r.amount) AS amount
           FROM saas_payment_reversals r JOIN saas_payments pay ON pay.id = r.payment_id
           WHERE pay.invoice_id = i.id AND pay.paid_on <= $1::date
             AND (r.created_at AT TIME ZONE 'UTC')::date <= $1::date
         ) r ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(amount) AS amount FROM saas_invoice_credits
           WHERE invoice_id = i.id AND issued_on <= $1::date
         ) cr ON TRUE
         WHERE i.issued_on <= $1::date
       ), account_balances AS (
         SELECT a.id AS account_id,
                COALESCE(SUM(v.balance), 0)::text AS open_balance,
                COALESCE(SUM(v.balance) FILTER (WHERE v.due_on < $1::date), 0)::text AS overdue_balance,
                COALESCE(MAX($1::date - v.due_on) FILTER (WHERE v.balance > 0 AND v.due_on < $1::date), 0)::integer AS days_overdue
         FROM saas_accounts a
         LEFT JOIN invoice_values v ON v.account_id = a.id AND v.balance > 0
         GROUP BY a.id
       ), subscription_modules AS (
         SELECT s.account_id,
                BOOL_OR(s.status = 'active') AS has_active_subscription,
                COUNT(*) > 0 AS has_subscription,
                ARRAY_AGG(DISTINCT m.code ORDER BY m.code) FILTER (WHERE s.status = 'active') AS modules
         FROM saas_subscriptions s
         LEFT JOIN saas_subscription_revisions r
           ON r.subscription_id = s.id AND r.revision = s.revision
         LEFT JOIN saas_subscription_revision_modules m ON m.revision_id = r.id
         GROUP BY s.account_id
       ), collected AS (
         SELECT s.account_id,
                SUM(p.amount - COALESCE(r.amount, 0)) AS collected_month
         FROM saas_payments p
         JOIN saas_invoices i ON i.id = p.invoice_id
         JOIN saas_subscriptions s ON s.id = i.subscription_id
         LEFT JOIN LATERAL (
           SELECT SUM(pr.amount) AS amount FROM saas_payment_reversals pr
           WHERE pr.payment_id = p.id AND (pr.created_at AT TIME ZONE 'UTC')::date <= $1::date
         ) r ON TRUE
         WHERE p.paid_on >= DATE_TRUNC('month', $1::date)::date
           AND p.paid_on <= $1::date
         GROUP BY s.account_id
       )
       SELECT a.id, a.name, a.billing_email, 'USD'::text AS currency,
              b.open_balance, b.overdue_balance, b.days_overdue,
              CASE WHEN COALESCE(sm.has_subscription, FALSE) = FALSE THEN 'no_contract'
                   WHEN b.overdue_balance::numeric > 0 THEN 'overdue'
                   ELSE 'al_dia' END AS status,
              COALESCE(sm.modules, ARRAY[]::text[]) AS modules,
              next_f.id AS next_followup_id,
              next_f.kind AS next_followup_kind,
              next_f.note AS next_followup_note,
              next_f.due_on::text AS next_followup_due_on,
              next_f.promised_on::text AS next_followup_promised_on,
              next_f.owner_id AS next_followup_owner_id,
              next_f.owner_name AS next_followup_owner_name,
              next_f.status AS next_followup_status,
              COALESCE(next_f.status = 'open' AND next_f.due_on < $1::date, FALSE) AS followup_overdue,
              COALESCE(c.collected_month, 0)::text AS collected_month
       FROM saas_accounts a
       JOIN account_balances b ON b.account_id = a.id
       LEFT JOIN subscription_modules sm ON sm.account_id = a.id
       LEFT JOIN collected c ON c.account_id = a.id
       LEFT JOIN LATERAL (
         SELECT f.id, f.kind, f.note, f.due_on, f.promised_on, f.owner_id,
                u.full_name AS owner_name, f.status
         FROM saas_followups f
         LEFT JOIN users u ON u.id = f.owner_id
         WHERE f.account_id = a.id AND f.status = 'open' AND f.created_at::date <= $1::date
         ORDER BY f.due_on, f.created_at
         LIMIT 1
       ) next_f ON TRUE
       ORDER BY a.name, a.id`,
      [asOf],
    );
    const totalsResult = await this.db.query(
      `WITH invoice_values AS (
         SELECT s.account_id, i.due_on,
                i.total - COALESCE(p.amount, 0) + COALESCE(r.amount, 0) - COALESCE(cr.amount, 0) AS balance
         FROM saas_invoices i
         JOIN saas_subscriptions s ON s.id = i.subscription_id
         LEFT JOIN LATERAL (
           SELECT SUM(amount) AS amount FROM saas_payments
           WHERE invoice_id = i.id AND paid_on <= $1::date
         ) p ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(r.amount) AS amount
           FROM saas_payment_reversals r JOIN saas_payments pay ON pay.id = r.payment_id
           WHERE pay.invoice_id = i.id AND pay.paid_on <= $1::date
             AND (r.created_at AT TIME ZONE 'UTC')::date <= $1::date
         ) r ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(amount) AS amount FROM saas_invoice_credits
           WHERE invoice_id = i.id AND issued_on <= $1::date
         ) cr ON TRUE
         WHERE i.issued_on <= $1::date
       ), account_totals AS (
         SELECT a.id,
                COALESCE(SUM(v.balance) FILTER (WHERE v.balance > 0), 0) AS open_balance,
                COALESCE(SUM(v.balance) FILTER (WHERE v.balance > 0 AND v.due_on < $1::date), 0) AS overdue_balance,
                COALESCE(SUM(v.balance) FILTER (WHERE v.balance > 0 AND $1::date - v.due_on BETWEEN 1 AND 30), 0) AS bucket_1_30,
                COALESCE(SUM(v.balance) FILTER (WHERE v.balance > 0 AND $1::date - v.due_on BETWEEN 31 AND 60), 0) AS bucket_31_60,
                COALESCE(SUM(v.balance) FILTER (WHERE v.balance > 0 AND $1::date - v.due_on BETWEEN 61 AND 90), 0) AS bucket_61_90,
                COALESCE(SUM(v.balance) FILTER (WHERE v.balance > 0 AND $1::date - v.due_on > 90), 0) AS bucket_90_plus
         FROM saas_accounts a LEFT JOIN invoice_values v ON v.account_id = a.id
         GROUP BY a.id
       ), subscriptions AS (
         SELECT a.id, COUNT(s.id) > 0 AS has_subscription
         FROM saas_accounts a LEFT JOIN saas_subscriptions s ON s.account_id = a.id
         GROUP BY a.id
       ), clients AS (
         SELECT t.*,
                CASE WHEN NOT sub.has_subscription THEN 'no_contract'
                     WHEN t.overdue_balance > 0 THEN 'overdue'
                     ELSE 'al_dia' END AS status
         FROM account_totals t JOIN subscriptions sub ON sub.id = t.id
       ), collected AS (
         SELECT s.account_id, SUM(p.amount - COALESCE(r.amount, 0)) AS amount
         FROM saas_payments p
         JOIN saas_invoices i ON i.id = p.invoice_id
         JOIN saas_subscriptions s ON s.id = i.subscription_id
         LEFT JOIN LATERAL (
           SELECT SUM(pr.amount) AS amount FROM saas_payment_reversals pr
           WHERE pr.payment_id = p.id AND (pr.created_at AT TIME ZONE 'UTC')::date <= $1::date
         ) r ON TRUE
         WHERE p.paid_on >= DATE_TRUNC('month', $1::date)::date AND p.paid_on <= $1::date
         GROUP BY s.account_id
       )
       SELECT 'USD'::text AS currency,
              COALESCE(SUM(c.open_balance), 0)::text AS open_balance,
              COALESCE(SUM(c.overdue_balance), 0)::text AS overdue_balance,
              COALESCE(SUM(c.bucket_1_30), 0)::text AS bucket_1_30,
              COALESCE(SUM(c.bucket_31_60), 0)::text AS bucket_31_60,
              COALESCE(SUM(c.bucket_61_90), 0)::text AS bucket_61_90,
              COALESCE(SUM(c.bucket_90_plus), 0)::text AS bucket_90_plus,
              COALESCE(SUM(col.amount), 0)::text AS collected_month,
              COUNT(*) FILTER (WHERE c.status = 'al_dia')::integer AS clients_current,
              COUNT(*) FILTER (WHERE c.status = 'overdue')::integer AS clients_overdue
       FROM clients c LEFT JOIN collected col ON col.account_id = c.id`,
      [asOf],
    );
    const clients = clientsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      billing_email: row.billing_email,
      currency: row.currency,
      open_balance: row.open_balance,
      overdue_balance: row.overdue_balance,
      days_overdue: row.days_overdue,
      status: row.status,
      modules: row.modules,
      next_followup: row.next_followup_id
        ? {
            id: row.next_followup_id,
            kind: row.next_followup_kind,
            note: row.next_followup_note,
            due_on: row.next_followup_due_on,
            promised_on: row.next_followup_promised_on,
            owner_id: row.next_followup_owner_id,
            owner_name: row.next_followup_owner_name,
            status: row.next_followup_status,
          }
        : null,
      followup_overdue: row.followup_overdue,
    }));
    return { as_of: asOf, clients, totals: totalsResult.rows };
  }

  async portfolioCsv(asOfInput?: unknown): Promise<string> {
    const report = await this.portfolio(asOfInput);
    const headers = [
      'id',
      'name',
      'billing_email',
      'currency',
      'open_balance',
      'overdue_balance',
      'days_overdue',
      'status',
      'modules',
      'next_followup',
      'followup_overdue',
    ];
    const csvCell = (value: unknown) => {
      let text = value === null || value === undefined ? '' : String(value);
      text = text.replace(/[\r\n\t]/g, ' ');
      if (/^[\s]*[=+\-@]/.test(text)) {
        text = `'${text}`;
      }
      return `"${text.replace(/"/g, '""')}"`;
    };
    const lines = [
      headers.map(csvCell).join(','),
      ...report.clients.map((client) =>
        [
          client.id,
          client.name,
          client.billing_email,
          client.currency,
          client.open_balance,
          client.overdue_balance,
          client.days_overdue,
          client.status,
          client.modules.join('|'),
          client.next_followup
            ? `${client.next_followup.due_on} ${client.next_followup.kind}: ${client.next_followup.note}`
            : '',
          client.followup_overdue,
        ]
          .map(csvCell)
          .join(','),
      ),
    ];
    return `\uFEFF${lines.join('\r\n')}`;
  }

  async collectionQueue(asOfInput?: unknown) {
    const asOf =
      asOfInput === undefined
        ? await this.utcToday()
        : requiredDate(asOfInput, 'asOf');
    const result = await this.db.query<QueueRow>(COLLECTION_QUEUE_SQL, [asOf]);
    return { as_of: asOf, items: result.rows };
  }

  async runCollection(user: OperatorUser, input: unknown) {
    this.assertWrite(user);
    const body = objectInput(input);
    const asOf = requiredDate(body.asOf, 'asOf');
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `saas-collection:${asOf}`,
      ]);
      const candidates = await client.query<QueueRow>(COLLECTION_QUEUE_SQL, [
        asOf,
      ]);
      const settled = await client.query<{ count: number }>(
        COLLECTION_SETTLED_COUNT_SQL,
        [asOf],
      );
      const followupIds: string[] = [];
      let skippedPaid = settled.rows[0].count;
      let skippedPaused = 0;
      for (const item of candidates.rows) {
        await this.lockInvoice(client, item.invoice_id);
        const currentBalance = await this.invoiceBalance(client, item.invoice_id);
        const current = await client.query<{ outstanding: boolean }>(
          'SELECT $1::numeric > 0 AS outstanding',
          [currentBalance],
        );
        if (!current.rows[0].outstanding) {
          skippedPaid += 1;
          continue;
        }
        if (item.paused) {
          skippedPaused += 1;
          continue;
        }
        if (item.already_prepared) {
          continue;
        }
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO saas_followups(
             account_id, invoice_id, collection_stage, kind, note, due_on,
             owner_id, created_by, updated_by
           )
           VALUES ($1, $2, $3, 'note', $4, $5, $6, $6, $6)
           ON CONFLICT (invoice_id, collection_stage) DO NOTHING
           RETURNING id`,
          [
            item.account_id,
            item.invoice_id,
            item.stage,
            `Prepare ${item.stage} follow-up for SaaS invoice ${item.reference}. No message was sent.`,
            asOf,
            user.sub,
          ],
        );
        if (!inserted.rows[0]) {
          continue;
        }
        followupIds.push(inserted.rows[0].id);
        await this.audit(client, user.sub, {
          accountId: item.account_id,
          companyId: item.company_id,
          action: 'collection.followup_prepared',
          entityType: 'followup',
          entityId: inserted.rows[0].id,
          payload: {
            invoice_id: item.invoice_id,
            stage: item.stage,
            as_of: asOf,
            message_sent: false,
          },
        });
      }
      const run = await client.query(
        `INSERT INTO saas_collection_runs(
           as_of, created_by, created_count, skipped_paid, skipped_paused, followup_ids
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id`,
        [
          asOf,
          user.sub,
          followupIds.length,
          skippedPaid,
          skippedPaused,
          JSON.stringify(followupIds),
        ],
      );
      await this.audit(client, user.sub, {
        action: 'collection.run_prepared',
        entityType: 'collection_run',
        entityId: run.rows[0].id,
        payload: {
          as_of: asOf,
          created: followupIds.length,
          skipped_paid: skippedPaid,
          skipped_paused: skippedPaused,
          message_sent: false,
        },
      });
      return {
        as_of: asOf,
        created: followupIds.length,
        skipped_paid: skippedPaid,
        skipped_paused: skippedPaused,
        already_run: followupIds.length === 0,
        followup_ids: followupIds,
      };
    });
  }

  async accountDetail(id: string) {
    const account = await this.db.query(
      `SELECT id, name, billing_email, created_at, updated_at
       FROM saas_accounts WHERE id = $1`,
      [id],
    );
    if (!account.rows[0]) {
      throw new NotFoundException('Billing account not found.');
    }
    const [subscriptions, invoices, payments, followups, audit, users] =
      await Promise.all([
        this.db.query(
          `SELECT s.id, s.account_id, s.company_id, c.code AS company_code, c.name AS company_name,
                s.currency, s.status, s.revision, s.starts_on::text AS starts_on, s.renews_on::text AS renews_on,
                s.created_at, s.updated_at,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object('code', m.code, 'price', m.price::text) ORDER BY m.code)
                  FROM saas_subscription_revisions r
                  JOIN saas_subscription_revision_modules m ON m.revision_id = r.id
                  WHERE r.subscription_id = s.id AND r.revision = s.revision
                ), '[]'::jsonb) AS modules,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'revision', r.revision, 'renews_on', r.renews_on::text, 'reason', r.reason,
                    'effective_at', r.effective_at, 'created_at', r.created_at,
                    'modules', COALESCE((
                      SELECT jsonb_agg(jsonb_build_object('code', m.code, 'price', m.price::text) ORDER BY m.code)
                      FROM saas_subscription_revision_modules m WHERE m.revision_id = r.id
                    ), '[]'::jsonb)
                  ) ORDER BY r.revision DESC)
                  FROM saas_subscription_revisions r WHERE r.subscription_id = s.id
                ), '[]'::jsonb) AS revisions,
                'informational'::text AS access
         FROM saas_subscriptions s JOIN companies c ON c.id = s.company_id
         WHERE s.account_id = $1 ORDER BY s.created_at DESC`,
          [id],
        ),
        this.db.query(
          `SELECT i.id, i.subscription_id, i.reference, i.currency, i.period_start::text AS period_start,
                i.period_end::text AS period_end, i.issued_on::text AS issued_on, i.due_on::text AS due_on,
                i.subtotal::text AS subtotal, i.total::text AS total, i.status, i.created_at,
                'manual_saas'::text AS document_kind, FALSE AS legal_invoice,
                'not_assessed'::text AS tax_status,
                COALESCE((SELECT SUM(p.amount) FROM saas_payments p WHERE p.invoice_id = i.id), 0)::text AS paid_amount,
                COALESCE((SELECT SUM(r.amount) FROM saas_payment_reversals r JOIN saas_payments p ON p.id = r.payment_id WHERE p.invoice_id = i.id), 0)::text AS reversed_amount,
                COALESCE((SELECT SUM(cr.amount) FROM saas_invoice_credits cr WHERE cr.invoice_id = i.id), 0)::text AS credited_amount,
                (i.total
                  - COALESCE((SELECT SUM(p.amount) FROM saas_payments p WHERE p.invoice_id = i.id), 0)
                  + COALESCE((SELECT SUM(r.amount) FROM saas_payment_reversals r JOIN saas_payments p ON p.id = r.payment_id WHERE p.invoice_id = i.id), 0)
                  - COALESCE((SELECT SUM(cr.amount) FROM saas_invoice_credits cr WHERE cr.invoice_id = i.id), 0)
                )::text AS balance,
                CASE
                  WHEN i.total - COALESCE((SELECT SUM(p.amount) FROM saas_payments p WHERE p.invoice_id = i.id), 0)
                     + COALESCE((SELECT SUM(r.amount) FROM saas_payment_reversals r JOIN saas_payments p ON p.id = r.payment_id WHERE p.invoice_id = i.id), 0)
                     - COALESCE((SELECT SUM(cr.amount) FROM saas_invoice_credits cr WHERE cr.invoice_id = i.id), 0) <= 0 THEN 'paid'
                  WHEN i.due_on < (NOW() AT TIME ZONE 'UTC')::date THEN 'overdue'
                  WHEN COALESCE((SELECT SUM(p.amount) FROM saas_payments p WHERE p.invoice_id = i.id), 0) > 0 THEN 'partial'
                  ELSE 'open'
                END AS payment_status,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'module_code', l.module_code, 'description', l.description,
                    'quantity', l.quantity::text, 'unit_price', l.unit_price::text, 'amount', l.amount::text
                  ) ORDER BY l.module_code)
                  FROM saas_invoice_lines l WHERE l.invoice_id = i.id
                ), '[]'::jsonb) AS lines,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'id', cr.id, 'reference', cr.reference, 'amount', cr.amount::text,
                    'issued_on', cr.issued_on::text, 'reason', cr.reason, 'created_at', cr.created_at
                  ) ORDER BY cr.issued_on DESC, cr.created_at DESC)
                  FROM saas_invoice_credits cr WHERE cr.invoice_id = i.id
                ), '[]'::jsonb) AS credits
         FROM saas_invoices i
         JOIN saas_subscriptions s ON s.id = i.subscription_id
         WHERE s.account_id = $1
         ORDER BY i.issued_on DESC, i.created_at DESC`,
          [id],
        ),
        this.db.query(
          `SELECT p.id, p.invoice_id, p.reference, p.amount::text AS amount, p.paid_on::text AS paid_on,
                p.method, p.reason, p.created_at,
                COALESCE(r.amount, 0)::text AS reversed_amount,
                a.amount::text AS allocation_amount,
                CASE WHEN r.id IS NULL THEN 'posted' ELSE 'reversed' END AS status
         FROM saas_payments p
         JOIN saas_payment_allocations a ON a.payment_id = p.id
         LEFT JOIN saas_payment_reversals r ON r.payment_id = p.id
         JOIN saas_invoices i ON i.id = p.invoice_id
         JOIN saas_subscriptions s ON s.id = i.subscription_id
         WHERE s.account_id = $1 ORDER BY p.paid_on DESC, p.created_at DESC`,
          [id],
        ),
        this.db.query(
          `SELECT f.id, f.account_id, f.invoice_id, f.collection_stage, f.kind, f.note,
                f.due_on::text AS due_on, f.promised_on::text AS promised_on, f.owner_id,
                u.full_name AS owner_name, u.email AS owner_email, f.status, f.revision,
                f.created_by, f.updated_by, f.created_at, f.updated_at
         FROM saas_followups f LEFT JOIN users u ON u.id = f.owner_id
         WHERE f.account_id = $1 ORDER BY f.due_on, f.created_at DESC`,
          [id],
        ),
        this.db.query(
          `SELECT e.id, e.account_id, e.company_id, e.actor_user_id, u.full_name AS actor_name,
                e.action, e.entity_type, e.entity_id, e.payload, e.occurred_at
         FROM saas_audit_events e JOIN users u ON u.id = e.actor_user_id
         WHERE e.account_id = $1 ORDER BY e.occurred_at DESC, e.id DESC`,
          [id],
        ),
        this.db.query(
          `SELECT DISTINCT u.id, u.full_name, u.email, u.is_active, s.company_id,
                c.code AS company_code, c.name AS company_name
         FROM saas_subscriptions s
         JOIN users u ON u.company_id = s.company_id
         JOIN companies c ON c.id = s.company_id
         WHERE s.account_id = $1
         ORDER BY c.name, u.full_name`,
          [id],
        ),
      ]);
    return {
      account: account.rows[0],
      subscriptions: subscriptions.rows,
      invoices: invoices.rows,
      payments: payments.rows,
      followups: followups.rows,
      audit: audit.rows,
      users: users.rows,
    };
  }

  async createInvoice(
    user: OperatorUser,
    subscriptionId: string,
    input: unknown,
  ) {
    this.assertWrite(user);
    const body = objectInput(input);
    const reference = requiredReference(body.reference);
    const periodStart = requiredDate(body.periodStart, 'periodStart');
    const periodEnd = requiredDate(body.periodEnd, 'periodEnd');
    const dueOn = requiredDate(body.dueOn, 'dueOn');
    if (periodEnd < periodStart || dueOn < periodStart) {
      throw new BadRequestException(
        'Invoice period and due date must not precede the period start.',
      );
    }
    return this.transaction(async (client) => {
      const subscriptionResult = await client.query<SubscriptionRow>(
        `SELECT id, account_id, company_id, currency, status, revision,
                starts_on::text AS starts_on, renews_on::text AS renews_on
         FROM saas_subscriptions WHERE id = $1 FOR UPDATE`,
        [subscriptionId],
      );
      const subscription = subscriptionResult.rows[0];
      if (!subscription) {
        throw new NotFoundException('Subscription not found.');
      }
      if (subscription.status !== 'active') {
        throw new ConflictException(
          'Invoices can only be issued against an active subscription.',
        );
      }
      const existing = await client.query<{
        id: string;
        period_start: string;
        period_end: string;
        due_on: string;
      }>(
        `SELECT id, period_start::text, period_end::text, due_on::text
         FROM saas_invoices WHERE subscription_id = $1 AND reference = $2`,
        [subscriptionId, reference],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (
          row.period_start !== periodStart ||
          row.period_end !== periodEnd ||
          row.due_on !== dueOn
        ) {
          throw new ConflictException(
            'Invoice reference already exists with different details.',
          );
        }
        return this.getInvoice(row.id, client);
      }
      const moduleResult = await client.query<{ code: string; price: string }>(
        `SELECT m.code, m.price::text AS price
         FROM saas_subscription_revisions r
         JOIN saas_subscription_revision_modules m ON m.revision_id = r.id
         WHERE r.subscription_id = $1 AND r.revision = $2
         ORDER BY m.code`,
        [subscriptionId, subscription.revision],
      );
      if (moduleResult.rows.length === 0) {
        throw new ConflictException(
          'The active subscription has no price snapshot.',
        );
      }
      const inserted = await client.query<{ id: string; subtotal: string }>(
        `INSERT INTO saas_invoices(
           subscription_id, reference, currency, period_start, period_end, issued_on,
           due_on, subtotal, total, created_by
         )
         SELECT $1, $2, $3, $4::date, $5::date, (NOW() AT TIME ZONE 'UTC')::date,
                $6::date, SUM(price), SUM(price), $7
         FROM saas_subscription_revision_modules m
         JOIN saas_subscription_revisions r ON r.id = m.revision_id
         WHERE r.subscription_id = $1 AND r.revision = $8
         RETURNING id, subtotal::text AS subtotal`,
        [
          subscriptionId,
          reference,
          subscription.currency,
          periodStart,
          periodEnd,
          dueOn,
          user.sub,
          subscription.revision,
        ],
      );
      const invoiceId = inserted.rows[0].id;
      for (const module of moduleResult.rows) {
        await client.query(
          `INSERT INTO saas_invoice_lines(invoice_id, module_code, description, quantity, unit_price, amount)
           VALUES ($1, $2, $3, 1, $4::numeric, $4::numeric)`,
          [invoiceId, module.code, MODULE_NAMES[module.code], module.price],
        );
      }
      await this.audit(client, user.sub, {
        accountId: subscription.account_id,
        companyId: subscription.company_id,
        action: 'invoice.issued',
        entityType: 'invoice',
        entityId: invoiceId,
        payload: {
          reference,
          period_start: periodStart,
          period_end: periodEnd,
          due_on: dueOn,
          snapshot_revision: subscription.revision,
          subtotal: inserted.rows[0].subtotal,
          taxes: 'not_assessed',
        },
      });
      return this.getInvoice(invoiceId, client);
    });
  }

  async recordPayment(user: OperatorUser, invoiceId: string, input: unknown) {
    this.assertWrite(user);
    const body = objectInput(input);
    const reference = requiredReference(body.reference);
    const amount = requiredMoney(body.amount, 'amount');
    const paidOn = requiredDate(body.paidOn, 'paidOn');
    if (paidOn > (await this.utcToday())) {
      throw new BadRequestException('paidOn cannot be in the future.');
    }
    if (!['transfer', 'cash', 'other'].includes(String(body.method))) {
      throw new BadRequestException('method must be transfer, cash, or other.');
    }
    const method = body.method as 'transfer' | 'cash' | 'other';
    const reason = requiredReason(body.reason);
    return this.transaction(async (client) => {
      const invoice = await this.lockInvoice(client, invoiceId);
      const duplicate = await client.query<{
        id: string;
        amount: string;
        paid_on: string;
        method: string;
        reason: string;
      }>(
        `SELECT id, amount::text, paid_on::text, method, reason
         FROM saas_payments WHERE invoice_id = $1 AND reference = $2`,
        [invoiceId, reference],
      );
      if (duplicate.rows[0]) {
        const old = duplicate.rows[0];
        if (
          old.amount !== amount ||
          old.paid_on !== paidOn ||
          old.method !== method ||
          old.reason !== reason
        ) {
          throw new ConflictException(
            'Payment reference already exists with different details.',
          );
        }
        return this.getPayment(old.id, client);
      }
      const balance = await this.invoiceBalance(client, invoiceId);
      const fits = await client.query<{ valid: boolean }>(
        `SELECT $1::numeric <= $2::numeric AND $2::numeric >= 0 AS valid`,
        [amount, balance],
      );
      if (!fits.rows[0].valid) {
        throw new ConflictException(
          'Payment amount exceeds the invoice balance.',
        );
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO saas_payments(invoice_id, reference, amount, paid_on, method, reason, created_by)
         VALUES ($1, $2, $3::numeric, $4::date, $5, $6, $7) RETURNING id`,
        [invoiceId, reference, amount, paidOn, method, reason, user.sub],
      );
      const paymentId = inserted.rows[0].id;
      await client.query(
        `INSERT INTO saas_payment_allocations(payment_id, invoice_id, amount)
         VALUES ($1, $2, $3::numeric)`,
        [paymentId, invoiceId, amount],
      );
      await this.audit(client, user.sub, {
        accountId: invoice.account_id,
        companyId: invoice.company_id,
        action: 'payment.recorded',
        entityType: 'payment',
        entityId: paymentId,
        payload: {
          invoice_id: invoiceId,
          reference,
          amount,
          paid_on: paidOn,
          method,
          reason,
        },
      });
      return this.getPayment(paymentId, client);
    });
  }

  async reversePayment(user: OperatorUser, paymentId: string, input: unknown) {
    this.assertWrite(user);
    const body = objectInput(input);
    const reference = requiredReference(body.reference);
    const reason = requiredReason(body.reason);
    return this.transaction(async (client) => {
      const lookup = await client.query<{ invoice_id: string }>(
        `SELECT invoice_id FROM saas_payments WHERE id = $1`,
        [paymentId],
      );
      if (!lookup.rows[0]) {
        throw new NotFoundException('Payment not found.');
      }
      const invoice = await this.lockInvoice(client, lookup.rows[0].invoice_id);
      const payment = await client.query<{ amount: string; reference: string }>(
        `SELECT amount::text, reference FROM saas_payments WHERE id = $1 FOR UPDATE`,
        [paymentId],
      );
      const previous = await client.query<{
        id: string;
        reference: string;
        amount: string;
        reason: string;
      }>(
        `SELECT id, reference, amount::text, reason
         FROM saas_payment_reversals WHERE payment_id = $1`,
        [paymentId],
      );
      if (previous.rows[0]) {
        const old = previous.rows[0];
        if (old.reference !== reference || old.reason !== reason) {
          throw new ConflictException('Payment has already been reversed.');
        }
        return this.getReversal(old.id, client);
      }
      const usedReference = await client.query(
        `SELECT id FROM saas_payment_reversals WHERE reference = $1`,
        [reference],
      );
      if (usedReference.rows[0]) {
        throw new ConflictException('Reversal reference is already in use.');
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO saas_payment_reversals(payment_id, reference, amount, reason, created_by)
         VALUES ($1, $2, $3::numeric, $4, $5) RETURNING id`,
        [paymentId, reference, payment.rows[0].amount, reason, user.sub],
      );
      await this.audit(client, user.sub, {
        accountId: invoice.account_id,
        companyId: invoice.company_id,
        action: 'payment.reversed',
        entityType: 'payment_reversal',
        entityId: inserted.rows[0].id,
        payload: {
          payment_id: paymentId,
          payment_reference: payment.rows[0].reference,
          reference,
          amount: payment.rows[0].amount,
          reason,
        },
      });
      return this.getReversal(inserted.rows[0].id, client);
    });
  }

  async issueCredit(user: OperatorUser, invoiceId: string, input: unknown) {
    this.assertWrite(user);
    const body = objectInput(input);
    const reference = requiredReference(body.reference);
    const amount = requiredMoney(body.amount, 'amount');
    const reason = requiredReason(body.reason);
    const issuedOn = requiredDate(body.issuedOn, 'issuedOn');
    if (issuedOn > (await this.utcToday())) {
      throw new BadRequestException('issuedOn cannot be in the future.');
    }
    return this.transaction(async (client) => {
      const invoice = await this.lockInvoice(client, invoiceId);
      const duplicate = await client.query<{
        id: string;
        amount: string;
        reason: string;
        issued_on: string;
      }>(
        `SELECT id, amount::text, reason, issued_on::text
         FROM saas_invoice_credits WHERE invoice_id = $1 AND reference = $2`,
        [invoiceId, reference],
      );
      if (duplicate.rows[0]) {
        const old = duplicate.rows[0];
        if (
          old.amount !== amount ||
          old.reason !== reason ||
          old.issued_on !== issuedOn
        ) {
          throw new ConflictException(
            'Credit reference already exists with different details.',
          );
        }
        return this.getCredit(old.id, client);
      }
      const balance = await this.invoiceBalance(client, invoiceId);
      const fits = await client.query<{ valid: boolean }>(
        `SELECT $1::numeric <= $2::numeric AND $2::numeric >= 0 AS valid`,
        [amount, balance],
      );
      if (!fits.rows[0].valid) {
        throw new ConflictException(
          'Credit amount exceeds the invoice balance.',
        );
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO saas_invoice_credits(invoice_id, reference, amount, issued_on, reason, created_by)
         VALUES ($1, $2, $3::numeric, $4::date, $5, $6) RETURNING id`,
        [invoiceId, reference, amount, issuedOn, reason, user.sub],
      );
      await this.audit(client, user.sub, {
        accountId: invoice.account_id,
        companyId: invoice.company_id,
        action: 'invoice.credit_issued',
        entityType: 'invoice_credit',
        entityId: inserted.rows[0].id,
        payload: {
          invoice_id: invoiceId,
          reference,
          amount,
          issued_on: issuedOn,
          reason,
        },
      });
      return this.getCredit(inserted.rows[0].id, client);
    });
  }

  async createFollowup(user: OperatorUser, accountId: string, input: unknown) {
    this.assertWrite(user);
    const body = objectInput(input);
    if (!['call', 'email', 'note', 'promise'].includes(String(body.kind))) {
      throw new BadRequestException(
        'kind must be call, email, note, or promise.',
      );
    }
    const kind = body.kind as 'call' | 'email' | 'note' | 'promise';
    const note = requiredText(body.note, 'note', 2000);
    const dueOn = requiredDate(body.dueOn, 'dueOn');
    const promisedOn =
      body.promisedOn === undefined || body.promisedOn === null
        ? null
        : requiredDate(body.promisedOn, 'promisedOn');
    const ownerId =
      body.ownerId === undefined || body.ownerId === null
        ? null
        : this.requiredUuid(body.ownerId, 'ownerId');
    return this.transaction(async (client) => {
      const account = await client.query(
        `SELECT id FROM saas_accounts WHERE id = $1`,
        [accountId],
      );
      if (!account.rows[0]) {
        throw new NotFoundException('Billing account not found.');
      }
      if (ownerId) {
        const owner = await client.query(
          `SELECT o.user_id
           FROM platform_saas_operators o JOIN users u ON u.id = o.user_id
           WHERE o.user_id = $1 AND o.enabled = TRUE AND u.is_active = TRUE`,
          [ownerId],
        );
        if (!owner.rows[0]) {
          throw new BadRequestException(
            'ownerId must belong to an enabled platform operator.',
          );
        }
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO saas_followups(
           account_id, kind, note, due_on, promised_on, owner_id, created_by, updated_by
         )
         VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $7) RETURNING id`,
        [accountId, kind, note, dueOn, promisedOn, ownerId, user.sub],
      );
      await this.audit(client, user.sub, {
        accountId,
        action: 'followup.created',
        entityType: 'followup',
        entityId: inserted.rows[0].id,
        payload: {
          kind,
          due_on: dueOn,
          promised_on: promisedOn,
          owner_id: ownerId,
          note,
        },
      });
      return this.getFollowup(inserted.rows[0].id, client);
    });
  }

  async updateFollowup(user: OperatorUser, followupId: string, input: unknown) {
    this.assertWrite(user);
    const body = objectInput(input);
    const expectedRevision = this.requiredRevision(body.expectedRevision);
    if (!['open', 'done', 'paused'].includes(String(body.status))) {
      throw new BadRequestException('status must be open, done, or paused.');
    }
    const status = body.status as 'open' | 'done' | 'paused';
    const note = requiredText(body.note, 'note', 2000);
    return this.transaction(async (client) => {
      const found = await client.query<{
        id: string;
        account_id: string;
        invoice_id: string | null;
        revision: number;
      }>(
        `SELECT id, account_id, invoice_id, revision
         FROM saas_followups WHERE id = $1 FOR UPDATE`,
        [followupId],
      );
      const followup = found.rows[0];
      if (!followup) {
        throw new NotFoundException('Follow-up not found.');
      }
      if (followup.revision !== expectedRevision) {
        throw new ConflictException(
          'Follow-up changed. Reload it before saving.',
        );
      }
      const updated = await client.query(
        `UPDATE saas_followups
         SET status = $2, note = $3, revision = revision + 1,
             updated_by = $4, updated_at = NOW()
         WHERE id = $1 RETURNING id`,
        [followupId, status, note, user.sub],
      );
      await this.audit(client, user.sub, {
        accountId: followup.account_id,
        action: 'followup.updated',
        entityType: 'followup',
        entityId: followupId,
        payload: {
          previous_revision: expectedRevision,
          revision: expectedRevision + 1,
          status,
          note,
          invoice_id: followup.invoice_id,
        },
      });
      return this.getFollowup(updated.rows[0].id, client);
    });
  }

  private async getAccountSummary(
    accountId: string,
    queryable: SqlQueryable = this.db,
  ) {
    const result = await queryable.query(
      `SELECT id, name, billing_email, created_at, updated_at
       FROM saas_accounts WHERE id = $1`,
      [accountId],
    );
    return result.rows[0];
  }

  private async getSubscription(
    subscriptionId: string,
    queryable: SqlQueryable = this.db,
  ) {
    const result = await queryable.query(
      `SELECT s.id, s.account_id, s.company_id, s.currency, s.status, s.revision,
              s.starts_on::text AS starts_on, s.renews_on::text AS renews_on,
              s.created_at, s.updated_at,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object('code', m.code, 'price', m.price::text) ORDER BY m.code)
                FROM saas_subscription_revisions r
                JOIN saas_subscription_revision_modules m ON m.revision_id = r.id
                WHERE r.subscription_id = s.id AND r.revision = s.revision
              ), '[]'::jsonb) AS modules,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'revision', r.revision, 'renews_on', r.renews_on::text, 'reason', r.reason,
                  'effective_at', r.effective_at, 'created_at', r.created_at,
                  'modules', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object('code', m.code, 'price', m.price::text) ORDER BY m.code)
                    FROM saas_subscription_revision_modules m WHERE m.revision_id = r.id
                  ), '[]'::jsonb)
                ) ORDER BY r.revision DESC)
                FROM saas_subscription_revisions r WHERE r.subscription_id = s.id
              ), '[]'::jsonb) AS revisions,
              'informational'::text AS access
       FROM saas_subscriptions s WHERE s.id = $1`,
      [subscriptionId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Subscription not found.');
    }
    return result.rows[0];
  }

  private async getInvoice(
    invoiceId: string,
    queryable: SqlQueryable = this.db,
  ) {
    const result = await queryable.query(
      `SELECT i.id, i.subscription_id, i.reference, i.currency,
              i.period_start::text AS period_start, i.period_end::text AS period_end,
              i.issued_on::text AS issued_on, i.due_on::text AS due_on,
              i.subtotal::text AS subtotal, i.total::text AS total, i.status,
              'manual_saas'::text AS document_kind, FALSE AS legal_invoice,
              'not_assessed'::text AS tax_status,
              i.created_at,
              COALESCE((SELECT SUM(p.amount) FROM saas_payments p WHERE p.invoice_id = i.id), 0)::text AS paid_amount,
              COALESCE((SELECT SUM(r.amount) FROM saas_payment_reversals r JOIN saas_payments p ON p.id = r.payment_id WHERE p.invoice_id = i.id), 0)::text AS reversed_amount,
              COALESCE((SELECT SUM(cr.amount) FROM saas_invoice_credits cr WHERE cr.invoice_id = i.id), 0)::text AS credited_amount,
              (i.total
                - COALESCE((SELECT SUM(p.amount) FROM saas_payments p WHERE p.invoice_id = i.id), 0)
                + COALESCE((SELECT SUM(r.amount) FROM saas_payment_reversals r JOIN saas_payments p ON p.id = r.payment_id WHERE p.invoice_id = i.id), 0)
                - COALESCE((SELECT SUM(cr.amount) FROM saas_invoice_credits cr WHERE cr.invoice_id = i.id), 0)
              )::text AS balance,
              CASE
                WHEN i.total - COALESCE((SELECT SUM(p.amount) FROM saas_payments p WHERE p.invoice_id = i.id), 0)
                   + COALESCE((SELECT SUM(r.amount) FROM saas_payment_reversals r JOIN saas_payments p ON p.id = r.payment_id WHERE p.invoice_id = i.id), 0)
                   - COALESCE((SELECT SUM(cr.amount) FROM saas_invoice_credits cr WHERE cr.invoice_id = i.id), 0) <= 0 THEN 'paid'
                WHEN i.due_on < (NOW() AT TIME ZONE 'UTC')::date THEN 'overdue'
                WHEN COALESCE((SELECT SUM(p.amount) FROM saas_payments p WHERE p.invoice_id = i.id), 0) > 0 THEN 'partial'
                ELSE 'open'
              END AS payment_status,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'module_code', l.module_code, 'description', l.description,
                  'quantity', l.quantity::text, 'unit_price', l.unit_price::text, 'amount', l.amount::text
                ) ORDER BY l.module_code)
                FROM saas_invoice_lines l WHERE l.invoice_id = i.id
              ), '[]'::jsonb) AS lines,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', cr.id, 'reference', cr.reference, 'amount', cr.amount::text,
                  'issued_on', cr.issued_on::text, 'reason', cr.reason, 'created_at', cr.created_at
                ) ORDER BY cr.issued_on DESC, cr.created_at DESC)
                FROM saas_invoice_credits cr WHERE cr.invoice_id = i.id
              ), '[]'::jsonb) AS credits
       FROM saas_invoices i WHERE i.id = $1`,
      [invoiceId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Invoice not found.');
    }
    return result.rows[0];
  }

  private async getPayment(
    paymentId: string,
    queryable: SqlQueryable = this.db,
  ) {
    const result = await queryable.query(
      `SELECT p.id, p.invoice_id, p.reference, p.amount::text AS amount, p.paid_on::text AS paid_on,
              p.method, p.reason, p.created_at,
              COALESCE(r.amount, 0)::text AS reversed_amount,
              a.amount::text AS allocation_amount,
              CASE WHEN r.id IS NULL THEN 'posted' ELSE 'reversed' END AS status
       FROM saas_payments p
       JOIN saas_payment_allocations a ON a.payment_id = p.id
       LEFT JOIN saas_payment_reversals r ON r.payment_id = p.id
       WHERE p.id = $1`,
      [paymentId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Payment not found.');
    }
    return result.rows[0];
  }

  private async getReversal(
    reversalId: string,
    queryable: SqlQueryable = this.db,
  ) {
    const result = await queryable.query(
      `SELECT r.id, r.payment_id, p.invoice_id, r.reference, r.amount::text AS amount,
              r.reason, r.created_by, r.created_at, 'reversed'::text AS status
       FROM saas_payment_reversals r JOIN saas_payments p ON p.id = r.payment_id
       WHERE r.id = $1`,
      [reversalId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Payment reversal not found.');
    }
    return result.rows[0];
  }

  private async getCredit(creditId: string, queryable: SqlQueryable = this.db) {
    const result = await queryable.query(
      `SELECT cr.id, cr.invoice_id, cr.reference, cr.amount::text AS amount,
              cr.issued_on::text AS issued_on, cr.reason, cr.created_by, cr.created_at
       FROM saas_invoice_credits cr WHERE cr.id = $1`,
      [creditId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Credit not found.');
    }
    return result.rows[0];
  }

  private async getFollowup(
    followupId: string,
    queryable: SqlQueryable = this.db,
  ) {
    const result = await queryable.query(
      `SELECT f.id, f.account_id, f.invoice_id, f.collection_stage, f.kind, f.note,
              f.due_on::text AS due_on, f.promised_on::text AS promised_on, f.owner_id,
              u.full_name AS owner_name, u.email AS owner_email, f.status, f.revision,
              f.created_by, f.updated_by, f.created_at, f.updated_at
       FROM saas_followups f LEFT JOIN users u ON u.id = f.owner_id
       WHERE f.id = $1`,
      [followupId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Follow-up not found.');
    }
    return result.rows[0];
  }

  private async lockInvoice(client: PoolClient, invoiceId: string) {
    const result = await client.query<{
      id: string;
      account_id: string;
      company_id: string;
      currency: string;
      total: string;
    }>(
      `SELECT i.id, s.account_id, s.company_id, i.currency, i.total::text AS total
       FROM saas_invoices i
       JOIN saas_subscriptions s ON s.id = i.subscription_id
       WHERE i.id = $1 FOR UPDATE OF i`,
      [invoiceId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Invoice not found.');
    }
    return result.rows[0];
  }

  private async invoiceBalance(
    client: PoolClient,
    invoiceId: string,
  ): Promise<string> {
    const result = await client.query<{ balance: string }>(
      `SELECT (i.total
         - COALESCE((SELECT SUM(p.amount) FROM saas_payments p WHERE p.invoice_id = i.id), 0)
         + COALESCE((SELECT SUM(r.amount) FROM saas_payment_reversals r
                     JOIN saas_payments p ON p.id = r.payment_id WHERE p.invoice_id = i.id), 0)
         - COALESCE((SELECT SUM(cr.amount) FROM saas_invoice_credits cr WHERE cr.invoice_id = i.id), 0)
       )::text AS balance
       FROM saas_invoices i WHERE i.id = $1`,
      [invoiceId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Invoice not found.');
    }
    return result.rows[0].balance;
  }

  private async insertRevisionModules(
    client: PoolClient,
    revisionId: string,
    modules: ModulePrice[],
  ) {
    for (const module of modules) {
      await client.query(
        `INSERT INTO saas_subscription_revision_modules(revision_id, code, price)
         VALUES ($1, $2, $3::numeric)`,
        [revisionId, module.code, module.price],
      );
    }
  }

  private async audit(
    client: PoolClient,
    actorUserId: string,
    event: {
      accountId?: string;
      companyId?: string;
      action: string;
      entityType: string;
      entityId?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    await client.query(
      `INSERT INTO saas_audit_events(
         account_id, company_id, actor_user_id, action, entity_type, entity_id, payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        event.accountId ?? null,
        event.companyId ?? null,
        actorUserId,
        event.action,
        event.entityType,
        event.entityId ?? null,
        JSON.stringify(event.payload ?? {}),
      ],
    );
  }

  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private assertWrite(user: OperatorUser) {
    if (!user.saasRole) {
      throw new ForbiddenException(
        'Enabled platform SaaS membership is required.',
      );
    }
    if (user.saasRole === 'viewer') {
      throw new ForbiddenException(
        'A billing or owner platform role is required for this action.',
      );
    }
  }

  private requiredUuid(input: unknown, field: string): string {
    if (
      typeof input !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input,
      )
    ) {
      throw new BadRequestException(`${field} must be a UUID.`);
    }
    return input;
  }

  private requiredRevision(input: unknown): number {
    if (!Number.isSafeInteger(input) || (input as number) < 1) {
      throw new BadRequestException(
        'expectedRevision must be a positive integer.',
      );
    }
    return input as number;
  }

  private async utcToday(): Promise<string> {
    const result = await this.db.query<{ today: string }>(
      `SELECT (NOW() AT TIME ZONE 'UTC')::date::text AS today`,
    );
    return result.rows[0].today;
  }
}
