import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { DatabaseService } from '../src/common/database.service';
import { DashboardModule } from '../src/dashboard/dashboard.module';

describe('Dashboard temporal (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let client: PoolClient;
  let companyId: string;

  beforeAll(async () => {
    db = new DatabaseService();
    client = await db.connect();
    await client.query('BEGIN');
    await client.query(`SET LOCAL TIME ZONE 'America/New_York'`);
    const company = await client.query<{ id: string }>(
      `INSERT INTO companies (code, name) VALUES ('DASH-' || left(gen_random_uuid()::text, 20), 'Dashboard test') RETURNING id`,
    );
    companyId = company.rows[0].id;
    const other = await client.query<{ id: string }>(
      `INSERT INTO companies (code, name) VALUES ('DASH-' || left(gen_random_uuid()::text, 20), 'Other tenant') RETURNING id`,
    );
    for (const id of [companyId, other.rows[0].id]) {
      const customer = await client.query<{ id: string }>(
        `INSERT INTO customers (company_id, code, name) VALUES ($1, 'C1', 'Test') RETURNING id`,
        [id],
      );
      const supplier = await client.query<{ id: string }>(
        `INSERT INTO suppliers (company_id, code, name) VALUES ($1, 'S1', 'Test') RETURNING id`,
        [id],
      );
      await client.query(
        `INSERT INTO sales_orders (company_id, customer_id, order_number, status, created_at) VALUES
          ($1, $2, 'current', 'confirmed', NOW()),
          ($1, $2, 'cancelled', 'cancelled', NOW()),
          ($1, $2, 'future', 'confirmed', NOW() + INTERVAL '2 years'),
          ($1, $2, 'old', 'confirmed', NOW() - INTERVAL '2 years')`,
        [id, customer.rows[0].id],
      );
      await client.query(
        `INSERT INTO purchase_orders (company_id, supplier_id, order_number, status, created_at)
         VALUES ($1, $2, 'current', 'ordered', NOW())`,
        [id, supplier.rows[0].id],
      );
    }

    const module = await Test.createTestingModule({
      imports: [DashboardModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        query: (sql: string, params: unknown[]) => client.query(sql, params),
      })
      .overrideProvider(AuthService)
      .useValue({
        authenticateAccessToken: async (role: string) => ({
          sub: 'test-user',
          email: 'dashboard@example.test',
          companyId,
          roles: [role],
        }),
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    if (db) await db.onModuleDestroy();
  });

  it.each([
    ['day', 14],
    ['week', 12],
    ['month', 12],
  ])(
    'fills %s buckets and excludes other tenants, cancelled and out-of-range orders',
    async (period, count) => {
      const result = await request(app.getHttpServer())
        .get(`/dashboard/overview?period=${period}&companyId=ignored`)
        .set('Authorization', 'Bearer admin')
        .expect(200);
      expect(result.body.timezone).toBe('UTC');
      expect(result.body.summary.customers).toBe(1);
      expect(result.body.series).toHaveLength(count);
      expect(
        result.body.series.reduce(
          (sum: number, row: { salesOrders: number }) => sum + row.salesOrders,
          0,
        ),
      ).toBe(1);
      expect(
        result.body.series.reduce(
          (sum: number, row: { purchaseOrders: number }) =>
            sum + row.purchaseOrders,
          0,
        ),
      ).toBe(1);
      expect(result.body.series[0].salesOrders).toBe(0);
      expect(result.body.series.at(-1).salesOrders).toBe(1);
    },
  );

  it.each(['sales', 'purchases', 'viewer'])(
    'returns only widgets allowed for %s',
    async (role) => {
      const result = await request(app.getHttpServer())
        .get('/dashboard/overview')
        .set('Authorization', `Bearer ${role}`)
        .expect(200);
      expect(result.body.summary.portalTokens).toBeNull();
      expect(result.body.summary.customers).toBe(role === 'sales' ? 1 : null);
      expect(result.body.summary.suppliers).toBe(
        role === 'purchases' ? 1 : null,
      );
      expect(result.body.series.at(-1).salesOrders).toBe(
        role === 'sales' ? 1 : null,
      );
      expect(result.body.series.at(-1).purchaseOrders).toBe(
        role === 'purchases' ? 1 : null,
      );
    },
  );

  it.each([
    ['day', 14],
    ['week', 12],
    ['month', 12],
  ])('honors the exact UTC lower boundary for %s', async (unit, buckets) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO sales_orders (company_id, customer_id, order_number, status, created_at)
         SELECT $1, customer_id, 'boundary-' || n, 'confirmed',
           (date_trunc($2, NOW() AT TIME ZONE 'UTC') - ($3::int - 1) * ('1 ' || $2)::interval
            - n * INTERVAL '1 microsecond') AT TIME ZONE 'UTC'
         FROM sales_orders CROSS JOIN generate_series(0, 1) n
         WHERE company_id = $1 AND order_number = 'current'
         RETURNING id`,
      [companyId, unit, buckets],
    );
    try {
      const result = await request(app.getHttpServer())
        .get(`/dashboard/overview?period=${unit}`)
        .set('Authorization', 'Bearer admin')
        .expect(200);
      expect(result.body.series[0].salesOrders).toBe(1);
      expect(
        result.body.series.reduce(
          (sum: number, row: { salesOrders: number }) => sum + row.salesOrders,
          0,
        ),
      ).toBe(2);
    } finally {
      await client.query(
        'DELETE FROM sales_orders WHERE id = ANY($1::uuid[])',
        [inserted.rows.map((row) => row.id)],
      );
    }
  });

  it('rejects invalid periods and anonymous requests', async () => {
    await request(app.getHttpServer())
      .get('/dashboard/overview?period=year')
      .set('Authorization', 'Bearer admin')
      .expect(400);
    await request(app.getHttpServer()).get('/dashboard/overview').expect(401);
  });
});
