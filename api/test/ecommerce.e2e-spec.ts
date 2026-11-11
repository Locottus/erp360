import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('eCommerce storefront (e2e)', () => {
  let app: INestApplication<App>;
  let token = '';
  const suffix = Date.now().toString();
  const companyCode = `EC${suffix}`;
  const adminEmail = `admin.ecom.${suffix}@erp360.local`;
  const adminPassword = 'ChangeMe123!';
  let productId = '';
  let listingId = '';
  let cartId = '';
  let cartToken = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
      companyCode,
      companyName: `Store Company ${suffix}`,
      email: adminEmail,
      password: adminPassword,
      fullName: 'Store Admin',
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

  it('configures storefront and completes checkout', async () => {
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

    const product = await request(app.getHttpServer())
      .post('/masters/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sku: `SKU-EC-${suffix}`,
        name: 'Ecommerce Product',
        unitPrice: 25,
      })
      .expect(201);
    productId = product.body.id;

    await request(app.getHttpServer())
      .post('/inventory/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId,
        direction: 'in',
        quantity: 20,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/ecommerce/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storeName: `Store ${suffix}`,
        storeSlug: `store-${suffix}`,
        currencyCode: 'USD',
        defaultTaxRateCode: `VAT-${suffix}`,
        supportEmail: 'store@example.com',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/ecommerce/admin/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'GEAR',
        name: 'Gear',
      })
      .expect(201);

    const listing = await request(app.getHttpServer())
      .post('/ecommerce/admin/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId,
        slug: `product-${suffix}`,
        title: 'Ecommerce Product',
        categoryCode: 'GEAR',
        unitPrice: 25,
      })
      .expect(201);
    listingId = listing.body.id;

    const storefront = await request(app.getHttpServer())
      .get(`/ecommerce/storefront/${companyCode}`)
      .expect(200);
    expect(storefront.body.products.length).toBeGreaterThan(0);

    const sharedStorefront = await request(app.getHttpServer())
      .get(`/ecommerce/storefront/by-slug/store-${suffix}`)
      .expect(200);
    expect(sharedStorefront.body.store.company_code).toBe(companyCode);
    expect(sharedStorefront.body.products.some((item: { id: string }) => item.id === listingId)).toBe(true);

    const subscribed = await request(app.getHttpServer())
      .post(`/ecommerce/storefront/${companyCode}/subscribe`)
      .send({
        email: `sub.${suffix}@example.com`,
        fullName: 'Subscriber E2E',
        acceptsMarketing: true,
      })
      .expect(201);
    expect(subscribed.body.status).toBe('subscribed');

    const cart = await request(app.getHttpServer())
      .post(`/ecommerce/storefront/${companyCode}/carts`)
      .send({})
      .expect(201);
    cartId = cart.body.cartId;
    cartToken = cart.body.cartToken;

    await request(app.getHttpServer())
      .post(`/ecommerce/storefront/${companyCode}/carts/${cartId}/items`)
      .set('x-cart-token', cartToken)
      .send({
        listingId,
        quantity: 2,
      })
      .expect(201);

    const checkedOut = await request(app.getHttpServer())
      .post(`/ecommerce/storefront/${companyCode}/carts/${cartId}/checkout`)
      .set('x-cart-token', cartToken)
      .send({
        customerName: 'Store Customer',
        customerEmail: `buyer.${suffix}@example.com`,
        notes: 'Please ship soon',
      })
      .expect(201);

    expect(checkedOut.body.orderId).toBeTruthy();
    expect(checkedOut.body.orderNumber).toContain('WEBO-');
    expect(Number(checkedOut.body.grandTotal)).toBeGreaterThan(0);

    const database = app.get(DatabaseService);
    await database.query('UPDATE products SET is_active = FALSE WHERE id = $1', [productId]);
    const afterDeactivation = await request(app.getHttpServer())
      .get(`/ecommerce/storefront/by-slug/store-${suffix}`)
      .expect(200);
    expect(afterDeactivation.body.products.some((item: { id: string }) => item.id === listingId)).toBe(false);

    const secondCart = await request(app.getHttpServer())
      .post(`/ecommerce/storefront/${companyCode}/carts`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/ecommerce/storefront/${companyCode}/carts/${secondCart.body.cartId}/items`)
      .set('x-cart-token', secondCart.body.cartToken)
      .send({ listingId, quantity: 1 })
      .expect(404);

    const subscribers = await request(app.getHttpServer())
      .get('/ecommerce/admin/subscribers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(subscribers.body.length).toBeGreaterThan(0);
  });
});
