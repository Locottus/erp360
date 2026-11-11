import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Inventory and billing workflows (e2e)', () => {
  let app: INestApplication<App>;
  let token = '';
  let otherCompanyToken = '';
  let customerId = '';
  let productId = '';
  let salesOrderId = '';
  const suffix = Date.now().toString();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
      companyCode: `INV${suffix}`,
      companyName: `Inventory billing ${suffix}`,
      email: `inventory.${suffix}@erp360.local`,
      password: 'ChangeMe123!',
      fullName: 'Inventory Billing E2E',
    }).expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({
      email: `inventory.${suffix}@erp360.local`,
      password: 'ChangeMe123!',
    }).expect(201);
    token = login.body.access_token;

    await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
      companyCode: `OTH${suffix}`,
      companyName: `Other tenant ${suffix}`,
      email: `other.${suffix}@erp360.local`,
      password: 'ChangeMe123!',
      fullName: 'Other Tenant E2E',
    }).expect(201);
    const otherLogin = await request(app.getHttpServer()).post('/auth/login').send({
      email: `other.${suffix}@erp360.local`,
      password: 'ChangeMe123!',
    }).expect(201);
    otherCompanyToken = otherLogin.body.access_token;

    const customer = await request(app.getHttpServer()).post('/masters/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `C-${suffix}`, name: 'Inventory billing customer', email: `c-${suffix}@example.test` })
      .expect(201);
    customerId = customer.body.id;
    const product = await request(app.getHttpServer()).post('/masters/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: `SKU-${suffix}`, name: 'Ledger product', unitPrice: 50 })
      .expect(201);
    productId = product.body.id;
    await request(app.getHttpServer()).post('/inventory/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, direction: 'in', quantity: 10, locationCode: 'WH-A', notes: 'Opening e2e balance' })
      .expect(201);
    const quotation = await request(app.getHttpServer()).post('/commerce/sales/quotations')
      .set('Authorization', `Bearer ${token}`)
      .send({ quotationNumber: `Q-${suffix}`, customerId, lines: [{ productId, quantity: 2 }] })
      .expect(201);
    const order = await request(app.getHttpServer()).post(`/commerce/sales/quotations/${quotation.body.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNumber: `SO-${suffix}` })
      .expect(201);
    salesOrderId = order.body.orderId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps tenant-scoped ledger, fulfillment location, invoices and concurrent payments consistent', async () => {
    const movements = await request(app.getHttpServer())
      .get(`/inventory/movements?productId=${productId}&locationCode=WH-A&page=1&pageSize=1`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(movements.body.total).toBe(1);
    expect(movements.body.items[0].movement_type).toBe('adjustment_in');

    await request(app.getHttpServer())
      .get('/inventory/movements?productId=not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const otherMovements = await request(app.getHttpServer())
      .get('/inventory/movements')
      .set('Authorization', `Bearer ${otherCompanyToken}`)
      .expect(200);
    expect(otherMovements.body.items).toHaveLength(0);
    const otherOrders = await request(app.getHttpServer())
      .get('/inventory/sales-orders')
      .set('Authorization', `Bearer ${otherCompanyToken}`)
      .expect(200);
    expect(otherOrders.body).toHaveLength(0);
    const otherSales = await request(app.getHttpServer())
      .get('/commerce/sales/orders')
      .set('Authorization', `Bearer ${otherCompanyToken}`)
      .expect(200);
    expect(otherSales.body).toHaveLength(0);

    const reserve = () => request(app.getHttpServer())
      .post(`/inventory/sales/orders/${salesOrderId}/reserve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationCode: 'WH-A' });
    const reserveResults = await Promise.all([reserve(), reserve()]);
    expect(reserveResults.map(result => result.status).sort()).toEqual([201, 400]);

    const fulfillment = await request(app.getHttpServer())
      .get('/inventory/sales-orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const orderRow = fulfillment.body.find((row: { id: string }) => row.id === salesOrderId);
    expect(orderRow).toMatchObject({ reservation_status: 'reserved', reservation_location: 'WH-A' });

    await request(app.getHttpServer())
      .post(`/inventory/sales/orders/${salesOrderId}/dispatch`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationCode: 'WH-B' })
      .expect(400);
    const unchangedStock = await request(app.getHttpServer())
      .get('/inventory/stock?locationCode=WH-A')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Number(unchangedStock.body[0].on_hand)).toBe(10);
    expect(Number(unchangedStock.body[0].reserved)).toBe(2);

    await request(app.getHttpServer())
      .post(`/inventory/sales/orders/${salesOrderId}/dispatch`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    const dispatch = await request(app.getHttpServer())
      .get(`/inventory/movements?productId=${productId}&locationCode=WH-A&pageSize=10`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dispatch.body.items.some((row: { movement_type: string; location_code: string }) =>
      row.movement_type === 'sale_dispatch' && row.location_code === 'WH-A')).toBe(true);
    const firstMovementPage = await request(app.getHttpServer())
      .get(`/inventory/movements?productId=${productId}&locationCode=WH-A&page=1&pageSize=2`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const secondMovementPage = await request(app.getHttpServer())
      .get(`/inventory/movements?productId=${productId}&locationCode=WH-A&page=2&pageSize=2`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(firstMovementPage.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(firstMovementPage.body.items).toHaveLength(2);
    expect(secondMovementPage.body.items).toHaveLength(1);
    expect(firstMovementPage.body.items[0].id).not.toBe(secondMovementPage.body.items[0].id);
    const dispatchedStock = await request(app.getHttpServer())
      .get('/inventory/stock?locationCode=WH-A')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Number(dispatchedStock.body[0].on_hand)).toBe(8);
    expect(Number(dispatchedStock.body[0].reserved)).toBe(0);

    const issueInvoice = () => request(app.getHttpServer())
      .post(`/commerce/sales/orders/${salesOrderId}/invoice`)
      .set('Authorization', `Bearer ${token}`)
      .send({ invoiceNumber: `INV-${suffix}` });
    const issueResults = await Promise.all([issueInvoice(), issueInvoice()]);
    expect(issueResults.map(result => result.status).sort()).toEqual([201, 400]);

    const invoices = await request(app.getHttpServer())
      .get('/commerce/sales/invoices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const invoice = invoices.body.find((row: { sales_order_id: string }) => row.sales_order_id === salesOrderId);
    expect(invoice).toMatchObject({ is_posted: false, balance_due: '100.0000' });
    expect(invoice.total_paid).toBe('0');
    const otherInvoices = await request(app.getHttpServer())
      .get('/commerce/sales/invoices')
      .set('Authorization', `Bearer ${otherCompanyToken}`)
      .expect(200);
    expect(otherInvoices.body).toHaveLength(0);

    await request(app.getHttpServer()).post('/accounting/bootstrap-accounts')
      .set('Authorization', `Bearer ${token}`).send({}).expect(201);
    await request(app.getHttpServer()).post(`/accounting/sales-invoices/${invoice.id}/post`)
      .set('Authorization', `Bearer ${token}`).send({}).expect(201);

    const payment = (reference: string) => request(app.getHttpServer())
      .post(`/accounting/sales-invoices/${invoice.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentReference: reference, amount: 70 });
    const paymentResults = await Promise.all([payment(`PAY-A-${suffix}`), payment(`PAY-B-${suffix}`)]);
    expect(paymentResults.map(result => result.status).sort()).toEqual([201, 400]);

    const finalInvoices = await request(app.getHttpServer())
      .get('/commerce/sales/invoices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const finalInvoice = finalInvoices.body.find((row: { id: string }) => row.id === invoice.id);
    expect(Number(finalInvoice.total_paid)).toBe(70);
    expect(Number(finalInvoice.balance_due)).toBe(30);
    expect(finalInvoice.is_posted).toBe(true);

    const paymentEndpoint = `/accounting/sales-invoices/${invoice.id}/payments`;
    await request(app.getHttpServer()).post(paymentEndpoint).set('Authorization', `Bearer ${token}`)
      .send({ paymentReference: `TOO-PRECISE-${suffix}`, amount: 0.00001 }).expect(400);
    const partial = await request(app.getHttpServer()).post(paymentEndpoint).set('Authorization', `Bearer ${token}`)
      .send({ paymentReference: `PARTIAL-${suffix}`, amount: 29.9999 }).expect(201);
    expect(partial.body.remainingBalance).toBe(0.0001);
    const beforeFinal = await request(app.getHttpServer()).get('/commerce/sales/invoices')
      .set('Authorization', `Bearer ${token}`).expect(200);
    const unpaid = beforeFinal.body.find((row: { id: string }) => row.id === invoice.id);
    expect(unpaid.status).not.toBe('paid');
    expect(unpaid.balance_due).toBe('0.0001');
    await request(app.getHttpServer()).post(paymentEndpoint).set('Authorization', `Bearer ${token}`)
      .send({ paymentReference: `OVER-${suffix}`, amount: 0.0002 }).expect(400);
    const lastPayments = await Promise.all(['A', 'B'].map(reference => request(app.getHttpServer())
      .post(paymentEndpoint).set('Authorization', `Bearer ${token}`)
      .send({ paymentReference: `LAST-${reference}-${suffix}`, amount: 0.0001 })));
    expect(lastPayments.map(result => result.status).sort()).toEqual([201, 400]);
    const completed = await request(app.getHttpServer()).get('/commerce/sales/invoices')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(completed.body.find((row: { id: string }) => row.id === invoice.id).status).toBe('paid');
  });
});
