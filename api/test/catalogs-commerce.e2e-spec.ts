import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Catalogs + Commerce (e2e)', () => {
  let app: INestApplication<App>;
  let token = '';
  const suffix = Date.now().toString();
  const adminEmail = `admin.${suffix}@erp360.local`;
  const adminPassword = 'ChangeMe123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
      companyCode: `C${suffix}`,
      companyName: `Company ${suffix}`,
      email: adminEmail,
      password: adminPassword,
      fullName: 'E2E Admin',
    });

    const login = await request(app.getHttpServer()).post('/auth/login').send({
      email: adminEmail,
      password: adminPassword,
    });
    token = login.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('completes Lote 2 catalog flow', async () => {
    const customer = await request(app.getHttpServer())
      .post('/masters/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `CUST-${suffix}`,
        name: 'Customer E2E',
        email: 'customer.e2e@example.com',
      })
      .expect(201);

    const product = await request(app.getHttpServer())
      .post('/masters/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sku: `SKU-${suffix}`,
        name: 'Product E2E',
        unitPrice: 150,
      })
      .expect(201);

    const supplier = await request(app.getHttpServer())
      .post('/masters/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `SUP-${suffix}`,
        name: 'Supplier E2E',
        email: 'supplier.e2e@example.com',
      })
      .expect(201);

    const portalToken = await request(app.getHttpServer())
      .post('/portal/access-tokens')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customer.body.id,
        expiresInDays: 30,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/portal/public/${portalToken.body.token}/summary`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/portal/access-tokens/${portalToken.body.id}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .get(`/portal/public/${portalToken.body.token}/summary`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/masters/tax-rates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `VAT-${suffix}`,
        name: 'VAT 13',
        rate: 13,
        taxType: 'vat',
      })
      .expect(201);

    const customers = await request(app.getHttpServer())
      .get('/masters/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(customers.body.some((row: { id: string }) => row.id === customer.body.id)).toBe(true);

    const products = await request(app.getHttpServer())
      .get('/masters/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(products.body.some((row: { id: string }) => row.id === product.body.id)).toBe(true);

    const suppliers = await request(app.getHttpServer())
      .get('/masters/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(suppliers.body.some((row: { id: string }) => row.id === supplier.body.id)).toBe(true);
  });

  it('completes Lote 3 sales and purchase flow', async () => {
    const customers = await request(app.getHttpServer())
      .get('/masters/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const products = await request(app.getHttpServer())
      .get('/masters/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const suppliers = await request(app.getHttpServer())
      .get('/masters/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const taxRates = await request(app.getHttpServer())
      .get('/masters/tax-rates')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const quotation = await request(app.getHttpServer())
      .post('/commerce/sales/quotations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        quotationNumber: `Q-${suffix}`,
        customerId: customers.body[0].id,
        taxRateCode: taxRates.body[0].code,
        lines: [{ productId: products.body[0].id, quantity: 2 }],
      })
      .expect(201);

    const confirmed = await request(app.getHttpServer())
      .post(`/commerce/sales/quotations/${quotation.body.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNumber: `SO-${suffix}` })
      .expect(201);

    const issuedInvoice = await request(app.getHttpServer())
      .post(`/commerce/sales/orders/${confirmed.body.orderId}/invoice`)
      .set('Authorization', `Bearer ${token}`)
      .send({ invoiceNumber: `INV-${suffix}` })
      .expect(201);

    const purchaseRequest = await request(app.getHttpServer())
      .post('/commerce/purchases/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        requestNumber: `PR-${suffix}`,
        supplierId: suppliers.body[0].id,
        taxRateCode: taxRates.body[0].code,
        lines: [{ productId: products.body[0].id, quantity: 5 }],
      })
      .expect(201);

    const purchaseOrder = await request(app.getHttpServer())
      .post(`/commerce/purchases/requests/${purchaseRequest.body.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNumber: `PO-${suffix}` })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/commerce/purchases/orders/${purchaseOrder.body.purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ receiptNumber: `RCV-${suffix}` })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/inventory/purchases/orders/${purchaseOrder.body.purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationCode: 'MAIN' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/inventory/sales/orders/${confirmed.body.orderId}/reserve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationCode: 'MAIN' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/inventory/sales/orders/${confirmed.body.orderId}/dispatch`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationCode: 'MAIN' })
      .expect(201);

    const stock = await request(app.getHttpServer())
      .get('/inventory/stock?locationCode=MAIN')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(stock.body.length).toBeGreaterThan(0);
    expect(
      stock.body.some((row: { on_hand: string; reserved: string }) => Number(row.on_hand) >= 0 && Number(row.reserved) >= 0),
    ).toBe(true);

    await request(app.getHttpServer())
      .post('/accounting/bootstrap-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/accounting/sales-invoices/${issuedInvoice.body.invoiceId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/accounting/purchase-orders/${purchaseOrder.body.purchaseOrderId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/accounting/sales-invoices/${issuedInvoice.body.invoiceId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentReference: `PMT-${suffix}`,
        amount: Number(quotation.body.grandTotal),
      })
      .expect(201);

    const trialBalance = await request(app.getHttpServer())
      .get('/accounting/reports/trial-balance')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(trialBalance.body.totals.isBalanced).toBe(true);

    const now = new Date();
    const fiscalConfig = {
      countryCode: 'GT',
      providerCode: 'test-fel-provider',
      environment: 'sandbox',
      endpointUrl: 'https://sandbox.fel.local/api',
      credentials: { apiKey: 'demo' },
    };

    await request(app.getHttpServer())
      .post('/fiscal/providers/config')
      .set('Authorization', `Bearer ${token}`)
      .send(fiscalConfig)
      .expect(201);

    const fiscalDoc = await request(app.getHttpServer())
      .post(`/fiscal/invoices/${issuedInvoice.body.invoiceId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ countryCode: 'GT', documentType: 'invoice' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/fiscal/documents/${fiscalDoc.body.id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const fiscalList = await request(app.getHttpServer())
      .get('/fiscal/documents?countryCode=GT')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(fiscalList.body.length).toBeGreaterThan(0);

    const portalTokenFinal = await request(app.getHttpServer())
      .post('/portal/access-tokens')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: customers.body[0].id,
        expiresInDays: 30,
      })
      .expect(201);

    const portalSummary = await request(app.getHttpServer())
      .get(`/portal/public/${portalTokenFinal.body.token}/summary`)
      .expect(200);
    expect(portalSummary.body.orders.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post('/accounting/periods/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })
      .expect(201);
  });
});
