import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/common/database.service';

describe('Store checkout, fulfillment and self-service unsubscribe', () => {
  let app: INestApplication; let token: string; let otherToken: string;
  let listingId: string; let productId: string;
  const suffix = Date.now().toString(); const companyCode = `STORECTRL-${suffix}`;
  const admin = (path: string, data: object) => request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }).send(data);
  const publicPost = (path: string, data: object) => request(app.getHttpServer()).post(`/ecommerce/storefront/${companyCode}${path}`).send(data);
  const buyer = { customerName: 'Guest Customer', customerEmail: `guest-${suffix}@example.test` };
  async function cart() {
    const result = await publicPost('/carts', {}).expect(201);
    await publicPost(`/carts/${result.body.cartId}/items`, { listingId, quantity: 2 }).set('x-cart-token', result.body.cartToken).expect(201);
    return result.body as { cartId: string; cartToken: string };
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init();
    for (const other of [false, true]) {
      const email = `store-control-${other}-${suffix}@example.test`;
      await request(app.getHttpServer()).post('/auth/bootstrap-admin').send({
        companyCode: other ? `OTHERSTORE-${suffix}` : companyCode, companyName: 'Store control company',
        fullName: 'Store admin', email, password: 'StoreControls123!',
      }).expect(201);
      const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'StoreControls123!' }).expect(201);
      if (other) otherToken = login.body.access_token; else token = login.body.access_token;
    }
    productId = (await admin('/masters/products', { sku: 'PUBLIC', name: 'Public product', unitPrice: 10 }).expect(201)).body.id;
    await admin('/inventory/adjustments', { productId, quantity: 20, direction: 'in', locationCode: 'MAIN' }).expect(201);
    await admin('/inventory/adjustments', { productId, quantity: 10, direction: 'in', locationCode: 'WH-B' }).expect(201);
    await admin('/ecommerce/admin/settings', { storeName: 'Control Store', storeSlug: `control-${suffix}`, currencyCode: 'USD' }).expect(201);
    await admin('/ecommerce/admin/settings', { storeName: 'Control Store', storeSlug: `control-${suffix}`, currencyCode: 'EUR' }).expect(400);
    listingId = (await admin('/ecommerce/admin/listings', { productId, slug: 'public', title: 'Public product', unitPrice: 10 }).expect(201)).body.id;
  });
  afterAll(async () => { await app.close(); });

  it('uses only MAIN and serializes repeated checkout without duplicate orders or reservations', async () => {
    const catalog = await request(app.getHttpServer()).get(`/ecommerce/storefront/${companyCode}`).expect(200);
    expect(Number(catalog.body.products[0].available_stock)).toBe(20);
    const state = await cart();
    const checkout = () => publicPost(`/carts/${state.cartId}/checkout`, buyer).set('x-cart-token', state.cartToken);
    const results = await Promise.all([checkout(), checkout()]);
    expect(results.map(row => row.status)).toEqual([201, 201]);
    expect(results[0].body.orderId).toBe(results[1].body.orderId);
    expect(results[0].body.orderNumber).toBe(results[1].body.orderNumber);
    expect(results[0].body.grandTotal).toBe(results[1].body.grandTotal);
    await publicPost(`/carts/${state.cartId}/items`, { listingId, quantity: 3 }).set('x-cart-token', state.cartToken).expect(400);
    const balances = await request(app.getHttpServer()).get('/inventory/stock?locationCode=MAIN').auth(token, { type: 'bearer' }).expect(200);
    expect(Number(balances.body[0].reserved)).toBe(2);
  });

  it('revalidates publication and price and requires physical dispatch before shipping', async () => {
    const state = await cart();
    const db = app.get(DatabaseService);
    await db.query('UPDATE ecommerce_product_listings SET unit_price=12 WHERE id=$1', [listingId]);
    await publicPost(`/carts/${state.cartId}/checkout`, buyer).set('x-cart-token', state.cartToken).expect(409);
    await publicPost(`/carts/${state.cartId}/items`, { listingId, quantity: 2 }).set('x-cart-token', state.cartToken).expect(201);
    await db.query('UPDATE ecommerce_product_listings SET is_published=FALSE WHERE id=$1', [listingId]);
    await publicPost(`/carts/${state.cartId}/checkout`, buyer).set('x-cart-token', state.cartToken).expect(409);
    await db.query('UPDATE ecommerce_product_listings SET is_published=TRUE WHERE id=$1', [listingId]);
    await publicPost(`/carts/${state.cartId}/checkout`, { ...buyer, deliveryMethod: 'delivery' }).set('x-cart-token', state.cartToken).expect(400);
    const checkout = await publicPost(`/carts/${state.cartId}/checkout`, {
      ...buyer, deliveryMethod: 'delivery', deliveryAddress: 'Test warehouse address, test city', phone: '555-0100',
    }).set('x-cart-token', state.cartToken).expect(201);
    const list = await request(app.getHttpServer()).get('/ecommerce/admin/fulfillments').auth(token, { type: 'bearer' }).expect(200);
    const delivery = list.body.find((row: { sales_order_id: string }) => row.sales_order_id === checkout.body.orderId);
    const patch = (body: object) => request(app.getHttpServer()).patch(`/ecommerce/admin/fulfillments/${delivery.id}`).auth(token, { type: 'bearer' }).send(body);
    await request(app.getHttpServer()).patch(`/ecommerce/admin/fulfillments/${delivery.id}`).auth(otherToken, { type: 'bearer' })
      .send({ expectedStatus: 'requested', status: 'preparing' }).expect(404);
    await patch({ expectedStatus: 'requested', status: 'preparing' }).expect(200);
    await patch({ expectedStatus: 'requested', status: 'preparing' }).expect(409);
    const shipping = { expectedStatus: 'preparing', status: 'shipped', courier: 'Manual carrier', trackingCode: 'TEST-GUIDE' };
    await patch(shipping).expect(400);
    await admin(`/inventory/sales/orders/${checkout.body.orderId}/dispatch`, {}).expect(201);
    await patch(shipping).expect(200);
    await patch({ expectedStatus: 'shipped', status: 'delivered' }).expect(200);
    await patch({ expectedStatus: 'delivered', status: 'preparing' }).expect(400);
  });

  it('provides a private hashed unsubscribe key, keeps admin output clean and isolates companies', async () => {
    await publicPost('/subscribe', { email: 123, acceptsMarketing: true }).expect(400);
    await publicPost('/subscribe', { email: `subscriber-${suffix}@example.test`, fullName: {}, acceptsMarketing: true }).expect(400);
    const subscription = await publicPost('/subscribe', { email: `subscriber-${suffix}@example.test`, acceptsMarketing: true }).expect(201);
    expect(subscription.body.unsubscribeToken).toMatch(/^[a-f0-9]{64}$/);
    const subscribers = await request(app.getHttpServer()).get('/ecommerce/admin/subscribers').auth(token, { type: 'bearer' }).expect(200);
    expect(JSON.stringify(subscribers.body)).not.toContain(subscription.body.unsubscribeToken);
    expect(JSON.stringify(subscribers.body)).not.toContain('unsubscribe_token_hash');
    await request(app.getHttpServer()).post(`/ecommerce/storefront/OTHERSTORE-${suffix}/unsubscribe`)
      .send({ token: subscription.body.unsubscribeToken }).expect(404);
    await publicPost('/unsubscribe', { token: subscription.body.unsubscribeToken }).expect(201);
    await publicPost('/unsubscribe', { token: subscription.body.unsubscribeToken }).expect(201);
  });
});
