import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('Inventory cost layers', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let token: string;
  let customerId: string;
  let productId: string;
  const suffix = Date.now().toString();
  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }).send(body);

  async function createDispatchedOrder(number: string) {
    const quotation = await post('/commerce/sales/quotations', {
      quotationNumber: `Q-${number}`, customerId, lines: [{ productId, quantity: 1 }],
    }).expect(201);
    const order = await post(`/commerce/sales/quotations/${quotation.body.id}/confirm`, {
      orderNumber: `SO-${number}`,
    }).expect(201);
    await post(`/inventory/sales/orders/${order.body.orderId}/reserve`, { locationCode: 'COST' }).expect(201);
    await post(`/inventory/sales/orders/${order.body.orderId}/dispatch`, {}).expect(201);
    return order.body.orderId as string;
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DatabaseService);
    const email = `cost-${suffix}@example.test`;
    await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
      companyCode: `COST-${suffix}`, companyName: 'Cost layer test', email,
      fullName: 'Cost Administrator', password: 'CostLayerTest123!',
    }).expect(201);
    token = (await request(app.getHttpServer()).post('/auth/login').send({
      email, password: 'CostLayerTest123!',
    }).expect(201)).body.access_token;
    customerId = (await post('/masters/customers', {
      code: `CUSTOMER-${suffix}`, name: 'Cost customer',
    }).expect(201)).body.id;
    productId = (await post('/masters/products', {
      sku: `COST-${suffix}`, name: 'Costed product', unitPrice: 20,
    }).expect(201)).body.id;
    await post('/accounting/bootstrap-accounts', {}).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires explicit inbound cost and values weighted-average and FIFO dispatches from consumed layers', async () => {
    await post('/inventory/adjustments', {
      productId, direction: 'in', quantity: 1, locationCode: 'COST',
    }).expect(400);

    await post('/inventory/adjustments', {
      productId, direction: 'in', quantity: 2, unitCost: 5, locationCode: 'COST', notes: 'First cost lot',
    }).expect(201);
    await post('/inventory/adjustments', {
      productId, direction: 'in', quantity: 2, unitCost: 9, locationCode: 'COST', notes: 'Second cost lot',
    }).expect(201);

    const weightedOrder = await createDispatchedOrder(`WA-${suffix}`);
    const weighted = await db.query<{ unit_cost: string; total_cost: string; cost_policy: string }>(
      `SELECT unit_cost::text,total_cost::text,cost_policy
       FROM inventory_dispatch_costs WHERE sales_order_id=$1`,
      [weightedOrder],
    );
    expect(weighted.rows).toMatchObject([{ unit_cost: '7.0000', total_cost: '7.0000', cost_policy: 'weighted_average' }]);

    await request(app.getHttpServer()).patch('/companies/cost-policy').auth(token, { type: 'bearer' })
      .send({ policy: 'fifo', expectedRevision: 0, reason: 'Enable FIFO for isolated cost test' }).expect(200);
    const fifoOrder = await createDispatchedOrder(`FIFO-${suffix}`);
    const fifo = await db.query<{ unit_cost: string; total_cost: string; cost_policy: string }>(
      `SELECT unit_cost::text,total_cost::text,cost_policy
       FROM inventory_dispatch_costs WHERE sales_order_id=$1`,
      [fifoOrder],
    );
    expect(fifo.rows).toMatchObject([{ unit_cost: '5.0000', total_cost: '5.0000', cost_policy: 'fifo' }]);

    const journal = await db.query<{ debit: string; credit: string }>(
      `SELECT SUM(jl.debit)::text AS debit,SUM(jl.credit)::text AS credit
       FROM accounting_journal_entries je JOIN accounting_journal_lines jl ON jl.journal_entry_id=je.id
       WHERE je.company_id=(SELECT company_id FROM sales_orders WHERE id=$1)
         AND je.source_type='sale_dispatch' AND je.source_id=$1`,
      [fifoOrder],
    );
    expect(journal.rows[0]).toEqual({ debit: '5.0000', credit: '5.0000' });

    const remaining = await db.query<{ quantity: string }>(
      `SELECT SUM(quantity_remaining)::text AS quantity FROM inventory_cost_lots
       WHERE company_id=(SELECT company_id FROM sales_orders WHERE id=$1)
         AND product_id=$2 AND location_code='COST'`,
      [fifoOrder, productId],
    );
    expect(remaining.rows[0].quantity).toBe('2.0000');
  });
});
