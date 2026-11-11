import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../common/database.service';
import { nextDocumentNumber } from '../common/document-sequence';
import type {
  AddCartItemInput,
  AuthUser,
  CheckoutCartInput,
  CreateCategoryInput,
  PublishListingInput,
  SubscribeInput,
  UpsertStorefrontSettingsInput,
} from './ecommerce.types';

type DbClient = Awaited<ReturnType<DatabaseService['connect']>>;

@Injectable()
export class EcommerceService {
  constructor(private readonly db: DatabaseService) {}

  async listFulfillments(user: AuthUser) {
    return (await this.db.query(
      `SELECT f.id,f.sales_order_id,so.order_number,c.name AS customer_name,f.delivery_method,f.address,f.phone,
              CASE WHEN so.status='cancelled' THEN 'cancelled' ELSE f.status END AS status,
              f.courier,f.tracking_code,f.updated_at
       FROM ecommerce_fulfillments f JOIN sales_orders so ON so.id=f.sales_order_id AND so.company_id=f.company_id
       JOIN customers c ON c.id=so.customer_id AND c.company_id=so.company_id
       WHERE f.company_id=$1 ORDER BY f.updated_at DESC LIMIT 500`, [user.companyId],
    )).rows;
  }

  async updateFulfillment(user: AuthUser, id: string, input: { status: string; expectedStatus: string; courier?: string; trackingCode?: string }) {
    if (!['preparing', 'ready', 'shipped', 'delivered'].includes(input.status) || typeof input.expectedStatus !== 'string' ||
        [input.courier, input.trackingCode].some(value => value !== undefined && (typeof value !== 'string' || value.length > 120))) {
      throw new BadRequestException('Invalid fulfillment status or tracking details.');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const source = await client.query<{ sales_order_id: string }>('SELECT sales_order_id FROM ecommerce_fulfillments WHERE id=$1 AND company_id=$2', [id, user.companyId]);
      if (!source.rows[0]) throw new NotFoundException('Fulfillment not found.');
      const order = await client.query<{ status: string }>('SELECT status FROM sales_orders WHERE id=$1 AND company_id=$2 FOR UPDATE', [source.rows[0].sales_order_id, user.companyId]);
      if (order.rows[0].status === 'cancelled') throw new BadRequestException('Order is cancelled.');
      const row = await client.query<{ status: string; delivery_method: string }>('SELECT status,delivery_method FROM ecommerce_fulfillments WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, user.companyId]);
      if (row.rows[0].status !== input.expectedStatus) throw new ConflictException('Fulfillment changed. Refresh first.');
      const path = row.rows[0].delivery_method === 'delivery' ? ['requested', 'preparing', 'shipped', 'delivered'] : ['requested', 'preparing', 'ready', 'delivered'];
      if (path[path.indexOf(row.rows[0].status) + 1] !== input.status) throw new BadRequestException('Invalid fulfillment transition.');
      if (input.status === 'shipped' || input.status === 'delivered') {
        const dispatch = await client.query(
          `SELECT id FROM inventory_reservations WHERE company_id=$1 AND sales_order_id=$2 AND status='fulfilled'`,
          [user.companyId, source.rows[0].sales_order_id],
        );
        if (!dispatch.rows.length) throw new BadRequestException('Confirm physical dispatch in inventory first.');
      }
      if (input.status === 'shipped' && (!input.courier?.trim() || !input.trackingCode?.trim())) throw new BadRequestException('Courier and tracking code are required for shipment.');
      await client.query(
        `UPDATE ecommerce_fulfillments SET status=$1,courier=COALESCE($2,courier),tracking_code=COALESCE($3,tracking_code),updated_at=NOW()
         WHERE id=$4 AND company_id=$5`,
        [input.status, input.courier?.trim() || null, input.trackingCode?.trim() || null, id, user.companyId],
      );
      await this.insertAuditTx(client, user.companyId, user.sub, 'ecommerce.fulfillment.update', id, { from: input.expectedStatus, to: input.status });
      await client.query('COMMIT');
      return { id, status: input.status };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async publicUnsubscribe(companyCode: string, token: string) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new BadRequestException('A valid private unsubscribe key is required.');
    const company = await this.resolveCompanyByCode(companyCode);
    const result = await this.db.query<{ id: string }>(
      `UPDATE ecommerce_subscribers SET status='unsubscribed',unsubscribed_at=COALESCE(unsubscribed_at,NOW()),updated_at=NOW()
       WHERE company_id=$1 AND unsubscribe_token_hash=$2 RETURNING id`, [company.id, this.hashSecret(token)],
    );
    if (!result.rows[0]) throw new NotFoundException('Unsubscribe key not found.');
    await this.db.query(
      `INSERT INTO audit_log(company_id,event_name,entity_name,entity_id) VALUES($1,$2,'ecommerce',$3)`,
      [company.id, 'ecommerce.subscription.self_unsubscribe', result.rows[0].id],
    );
    return { status: 'unsubscribed' };
  }

  async getAdminSettings(user: AuthUser) {
    const result = await this.db.query(
      `SELECT id, store_name, store_slug, currency_code, default_tax_rate_code, support_email, is_active, theme_json, updated_at
       FROM ecommerce_storefront_settings
       WHERE company_id = $1
       LIMIT 1`,
      [user.companyId],
    );
    return result.rows[0] ?? null;
  }

  async upsertAdminSettings(user: AuthUser, input: UpsertStorefrontSettingsInput) {
    if (!input.storeName?.trim() || !input.storeSlug?.trim()) {
      throw new BadRequestException('storeName and storeSlug are required.');
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(input.storeSlug.trim().toLowerCase())) {
      throw new BadRequestException('storeSlug must contain lowercase letters, numbers and internal hyphens.');
    }
    const currencyCode = (input.currencyCode ?? 'USD').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      throw new BadRequestException('currencyCode must be a valid code.');
    }
    const companyCurrency = await this.db.query<{ currency_code: string }>('SELECT currency_code FROM companies WHERE id=$1', [user.companyId]);
    if (companyCurrency.rows[0]?.currency_code !== currencyCode) {
      throw new BadRequestException('Store currency must match the company accounting currency. Currency conversion is not configured.');
    }
    if (input.supportEmail?.trim() && !this.isValidEmail(input.supportEmail.trim())) {
      throw new BadRequestException('supportEmail must be a valid email address.');
    }
    if (input.defaultTaxRateCode?.trim()) {
      const taxRate = await this.db.query(
        `SELECT id FROM tax_rates
         WHERE company_id = $1 AND code = $2 AND is_active = TRUE
         LIMIT 1`,
        [user.companyId, input.defaultTaxRateCode.trim()],
      );
      if (!taxRate.rows[0]) {
        throw new BadRequestException('defaultTaxRateCode must belong to this company and be active.');
      }
    }
    const theme = this.normalizeTheme(input.theme ?? {});
    try {
      const result = await this.db.query<{ id: string }>(
        `INSERT INTO ecommerce_storefront_settings
          (company_id, store_name, store_slug, currency_code, default_tax_rate_code, support_email, is_active, theme_json, created_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (company_id)
         DO UPDATE SET
           store_name = EXCLUDED.store_name,
           store_slug = EXCLUDED.store_slug,
           currency_code = EXCLUDED.currency_code,
           default_tax_rate_code = EXCLUDED.default_tax_rate_code,
           support_email = EXCLUDED.support_email,
           is_active = EXCLUDED.is_active,
           theme_json = EXCLUDED.theme_json,
           updated_at = NOW()
         RETURNING id`,
        [
          user.companyId,
          input.storeName.trim(),
          input.storeSlug.trim().toLowerCase(),
          currencyCode,
          input.defaultTaxRateCode?.trim() || null,
          input.supportEmail?.trim() || null,
          input.isActive ?? true,
          JSON.stringify(theme),
          user.sub,
        ],
      );
      await this.insertAudit(user, 'ecommerce.settings.upsert', result.rows[0].id, {
        store_slug: input.storeSlug.trim().toLowerCase(),
      });
      return { id: result.rows[0].id };
    } catch (error) {
      if (String(error).includes('ecommerce_storefront_settings_store_slug_key')) {
        throw new ConflictException('storeSlug already exists.');
      }
      throw error;
    }
  }

  async createCategory(user: AuthUser, input: CreateCategoryInput) {
    if (!input.code?.trim() || !input.name?.trim()) {
      throw new BadRequestException('code and name are required.');
    }
    try {
      const result = await this.db.query<{ id: string; code: string }>(
        `INSERT INTO ecommerce_categories
          (company_id, code, name, description, sort_order, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, code`,
        [
          user.companyId,
          input.code.trim().toUpperCase(),
          input.name.trim(),
          input.description ?? null,
          input.sortOrder ?? 100,
          user.sub,
        ],
      );
      await this.insertAudit(user, 'ecommerce.category.create', result.rows[0].id, { code: result.rows[0].code });
      return result.rows[0];
    } catch (error) {
      if (String(error).includes('ecommerce_categories_company_id_code_key')) {
        throw new ConflictException('Category code already exists.');
      }
      throw error;
    }
  }

  async listCategories(user: AuthUser) {
    const result = await this.db.query(
      `SELECT id, code, name, description, is_active, sort_order
       FROM ecommerce_categories
       WHERE company_id = $1
       ORDER BY sort_order ASC, name ASC`,
      [user.companyId],
    );
    return result.rows;
  }

  async publishListing(user: AuthUser, input: PublishListingInput) {
    if (!input.productId?.trim() || !input.slug?.trim() || !input.title?.trim()) {
      throw new BadRequestException('productId, slug and title are required.');
    }
    if (input.unitPrice < 0) {
      throw new BadRequestException('unitPrice cannot be negative.');
    }
    const product = await this.db.query<{ id: string; is_active: boolean }>(
      `SELECT id, is_active
       FROM products
       WHERE id = $1 AND company_id = $2
       LIMIT 1`,
      [input.productId, user.companyId],
    );
    if (!product.rows[0]) {
      throw new BadRequestException('Product does not belong to current company.');
    }
    if ((input.isPublished ?? true) && !product.rows[0].is_active) {
      throw new BadRequestException('Inactive products cannot be published.');
    }
    let categoryId: string | null = null;
    if (input.categoryCode?.trim()) {
      const category = await this.db.query<{ id: string }>(
        `SELECT id
         FROM ecommerce_categories
         WHERE company_id = $1 AND code = $2 AND is_active = TRUE
         LIMIT 1`,
        [user.companyId, input.categoryCode.trim().toUpperCase()],
      );
      if (!category.rows[0]) {
        throw new BadRequestException('Category code is invalid for this company.');
      }
      categoryId = category.rows[0].id;
    }

    try {
      const result = await this.db.query<{ id: string }>(
        `INSERT INTO ecommerce_product_listings
          (company_id, product_id, category_id, slug, title, short_description, long_description, unit_price, compare_at_price, featured_image_url, is_published, sort_order, created_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
         ON CONFLICT (company_id, product_id)
         DO UPDATE SET
           category_id = EXCLUDED.category_id,
           slug = EXCLUDED.slug,
           title = EXCLUDED.title,
           short_description = EXCLUDED.short_description,
           long_description = EXCLUDED.long_description,
           unit_price = EXCLUDED.unit_price,
           compare_at_price = EXCLUDED.compare_at_price,
           featured_image_url = EXCLUDED.featured_image_url,
           is_published = EXCLUDED.is_published,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()
         RETURNING id`,
        [
          user.companyId,
          input.productId,
          categoryId,
          input.slug.trim().toLowerCase(),
          input.title.trim(),
          input.shortDescription ?? null,
          input.longDescription ?? null,
          input.unitPrice,
          input.compareAtPrice ?? null,
          input.featuredImageUrl ?? null,
          input.isPublished ?? true,
          input.sortOrder ?? 100,
          user.sub,
        ],
      );
      await this.insertAudit(user, 'ecommerce.listing.upsert', result.rows[0].id, {
        product_id: input.productId,
        slug: input.slug.trim().toLowerCase(),
      });
      return { id: result.rows[0].id };
    } catch (error) {
      if (String(error).includes('ecommerce_product_listings_company_id_slug_key')) {
        throw new ConflictException('Listing slug already exists.');
      }
      throw error;
    }
  }

  async listAdminListings(user: AuthUser) {
    const result = await this.db.query(
      `SELECT l.id,
              l.product_id,
              p.sku,
              l.slug,
              l.title,
              l.short_description,
              l.long_description,
              l.unit_price,
              l.compare_at_price,
              l.featured_image_url,
              l.is_published,
              l.sort_order,
              c.code AS category_code,
              c.name AS category_name
       FROM ecommerce_product_listings l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN ecommerce_categories c ON c.id = l.category_id
       WHERE l.company_id = $1
       ORDER BY l.sort_order ASC, l.title ASC`,
      [user.companyId],
    );
    return result.rows;
  }

  async listAdminProducts(user: AuthUser) {
    const result = await this.db.query(
      `SELECT p.id, p.sku, p.name, p.description, p.unit_price, p.is_active,
              l.id AS listing_id, l.slug, l.title, l.short_description, l.long_description,
              l.unit_price AS listing_price, l.compare_at_price, l.featured_image_url,
              l.is_published, l.sort_order, c.code AS category_code, c.name AS category_name
       FROM products p
       LEFT JOIN ecommerce_product_listings l
         ON l.product_id = p.id AND l.company_id = p.company_id
       LEFT JOIN ecommerce_categories c
         ON c.id = l.category_id AND c.company_id = p.company_id
       WHERE p.company_id = $1
       ORDER BY p.name ASC`,
      [user.companyId],
    );
    return result.rows;
  }

  async getStorefront(companyCode: string, query?: string, categoryCode?: string) {
    const company = await this.resolveCompanyByCode(companyCode);
    const settings = await this.db.query(
      `SELECT s.store_name, s.store_slug, s.currency_code, s.support_email,
              s.theme_json, c.code AS company_code
       FROM ecommerce_storefront_settings s
       JOIN companies c ON c.id = s.company_id
       WHERE s.company_id = $1 AND s.is_active = TRUE AND c.is_active = TRUE
       LIMIT 1`,
      [company.id],
    );
    if (!settings.rows[0]) {
      throw new NotFoundException('Storefront is not configured for this company.');
    }

    const params: unknown[] = [company.id];
    let filters = 'WHERE l.company_id = $1 AND l.is_published = TRUE AND p.is_active = TRUE';
    if (query?.trim()) {
      params.push(`%${query.trim()}%`);
      filters += ` AND (l.title ILIKE $${params.length} OR p.sku ILIKE $${params.length})`;
    }
    if (categoryCode?.trim()) {
      params.push(categoryCode.trim().toUpperCase());
      filters += ` AND c.code = $${params.length}`;
    }

    const listings = await this.db.query(
      `SELECT l.id,
              l.slug,
              l.title,
              l.short_description,
              l.long_description,
              l.unit_price,
              l.compare_at_price,
              l.featured_image_url,
              l.sort_order,
              p.sku,
              c.code AS category_code,
              COALESCE(stock.available, 0)::text AS available_stock
       FROM ecommerce_product_listings l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN ecommerce_categories c ON c.id = l.category_id
       LEFT JOIN (
         SELECT company_id, product_id, SUM(on_hand - reserved) AS available
         FROM inventory_stock_balances
         WHERE location_code='MAIN'
         GROUP BY company_id, product_id
       ) stock ON stock.company_id = l.company_id AND stock.product_id = l.product_id
       ${filters}
       ORDER BY l.sort_order ASC, l.title ASC`,
      params,
    );

    const categories = await this.db.query(
      `SELECT code, name, description
       FROM ecommerce_categories
       WHERE company_id = $1 AND is_active = TRUE
       ORDER BY sort_order ASC, name ASC`,
      [company.id],
    );

    return {
      store: settings.rows[0],
      categories: categories.rows,
      products: listings.rows,
    };
  }

  async getStorefrontBySlug(storeSlug: string, query?: string, categoryCode?: string) {
    const company = await this.db.query<{ code: string }>(
      `SELECT c.code
       FROM ecommerce_storefront_settings s
       JOIN companies c ON c.id = s.company_id
       WHERE s.store_slug = $1 AND s.is_active = TRUE AND c.is_active = TRUE
       LIMIT 1`,
      [storeSlug.trim().toLowerCase()],
    );
    if (!company.rows[0]) {
      throw new NotFoundException('Storefront is not configured for this URL.');
    }
    return this.getStorefront(company.rows[0].code, query, categoryCode);
  }

  async createCart(companyCode: string) {
    const company = await this.resolveCompanyByCode(companyCode);
    const settings = await this.db.query<{ currency_code: string }>(
      `SELECT currency_code
       FROM ecommerce_storefront_settings
       WHERE company_id = $1 AND is_active = TRUE
       LIMIT 1`,
      [company.id],
    );
    if (!settings.rows[0]) {
      throw new NotFoundException('Storefront is not configured for this company.');
    }
    const token = `cart_${randomBytes(20).toString('hex')}`;
    const tokenHash = this.hashSecret(token);
    const prefix = token.slice(0, 12);
    const created = await this.db.query<{ id: string; currency_code: string }>(
      `INSERT INTO ecommerce_carts (company_id, cart_token_hash, cart_token_prefix, status, currency_code)
       VALUES ($1,$2,$3,'open',$4)
       RETURNING id, currency_code`,
      [company.id, tokenHash, prefix, settings.rows[0].currency_code],
    );
    return {
      cartId: created.rows[0].id,
      cartToken: token,
      currencyCode: created.rows[0].currency_code,
    };
  }

  async getCart(companyCode: string, cartId: string, cartToken: string) {
    const { companyId, cart } = await this.assertCartAccess(companyCode, cartId, cartToken);
    const items = await this.db.query(
      `SELECT ci.id,
              ci.listing_id,
              ci.product_id,
              ci.quantity,
              ci.unit_price,
              ci.line_total,
              l.slug,
              l.title
       FROM ecommerce_cart_items ci
       JOIN ecommerce_product_listings l ON l.id = ci.listing_id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at ASC`,
      [cart.id],
    );
    return {
      cart: {
        id: cart.id,
        status: cart.status,
        currencyCode: cart.currency_code,
        subtotal: cart.subtotal,
        taxTotal: cart.tax_total,
        grandTotal: cart.grand_total,
      },
      items: items.rows,
      companyId,
    };
  }

  async addCartItem(companyCode: string, cartId: string, cartToken: string, input: AddCartItemInput) {
    if (typeof input.listingId !== 'string' || !input.listingId.trim() ||
        typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity <= 0 ||
        Math.round(input.quantity * 10000) / 10000 !== input.quantity) {
      throw new BadRequestException('listingId and quantity > 0 are required.');
    }
    const { companyId, cart } = await this.assertCartAccess(companyCode, cartId, cartToken);
    if (cart.status !== 'open') {
      throw new BadRequestException('Cart is not open.');
    }

    const client = await this.db.connect();
    try {
    await client.query('BEGIN');
    const locked = await client.query<{ status: string }>('SELECT status FROM ecommerce_carts WHERE id=$1 AND company_id=$2 FOR UPDATE', [cart.id, companyId]);
    if (locked.rows[0]?.status !== 'open') throw new BadRequestException('Cart is not open.');
    const listing = await client.query<{
      id: string;
      product_id: string;
      unit_price: string;
      is_published: boolean;
      product_is_active: boolean;
    }>(
      `SELECT l.id, l.product_id, l.unit_price, l.is_published, p.is_active AS product_is_active
       FROM ecommerce_product_listings l
       JOIN products p ON p.id = l.product_id AND p.company_id = l.company_id
       WHERE l.id = $1 AND l.company_id = $2
       LIMIT 1`,
      [input.listingId, companyId],
    );
    if (!listing.rows[0] || !listing.rows[0].is_published || !listing.rows[0].product_is_active) {
      throw new NotFoundException('Listing not available.');
    }
    const quantity = Number(input.quantity);
    const available = await this.getAvailableStockTx(client, companyId, listing.rows[0].product_id);
    if (available < quantity) {
      throw new BadRequestException('Insufficient stock for this product.');
    }

    const unitPrice = Number(listing.rows[0].unit_price);
    const lineTotal = Number((unitPrice * quantity).toFixed(4));
    await client.query(
      `INSERT INTO ecommerce_cart_items (cart_id, listing_id, product_id, quantity, unit_price, line_total, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (cart_id, listing_id)
       DO UPDATE SET
         quantity = EXCLUDED.quantity,
         unit_price = EXCLUDED.unit_price,
         line_total = EXCLUDED.line_total,
         updated_at = NOW()`,
      [cart.id, listing.rows[0].id, listing.rows[0].product_id, quantity, unitPrice, lineTotal],
    );
    const totals = await this.computeCartTotalsWithTax(client, companyId, cart.id);
    await client.query('UPDATE ecommerce_carts SET subtotal=$1,tax_total=$2,grand_total=$3,updated_at=NOW() WHERE id=$4',
      [totals.subtotal, totals.taxTotal, totals.grandTotal, cart.id]);
    await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return this.getCart(companyCode, cartId, cartToken);
  }

  async removeCartItem(companyCode: string, cartId: string, cartToken: string, itemId: string) {
    const { companyId, cart } = await this.assertCartAccess(companyCode, cartId, cartToken);
    if (cart.status !== 'open') {
      throw new BadRequestException('Cart is not open.');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<{ status: string }>('SELECT status FROM ecommerce_carts WHERE id=$1 AND company_id=$2 FOR UPDATE', [cart.id, companyId]);
      if (locked.rows[0]?.status !== 'open') throw new BadRequestException('Cart is not open.');
      await client.query(`DELETE FROM ecommerce_cart_items WHERE id = $1 AND cart_id = $2`, [itemId, cart.id]);
      const totals = await this.computeCartTotalsWithTax(client, companyId, cart.id);
      await client.query('UPDATE ecommerce_carts SET subtotal=$1,tax_total=$2,grand_total=$3,updated_at=NOW() WHERE id=$4',
        [totals.subtotal, totals.taxTotal, totals.grandTotal, cart.id]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return this.getCart(companyCode, cartId, cartToken);
  }

  async checkoutCart(companyCode: string, cartId: string, cartToken: string, input: CheckoutCartInput) {
    if (typeof input.customerName !== 'string' || !input.customerName.trim() || input.customerName.length > 200 ||
        typeof input.customerEmail !== 'string' || !this.isValidEmail(input.customerEmail.trim()) ||
        (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 1000))) {
      throw new BadRequestException('customerName and customerEmail are required.');
    }
    const method = input.deliveryMethod ?? 'pickup';
    if (!['pickup', 'delivery'].includes(method) ||
        (input.deliveryAddress !== undefined && (typeof input.deliveryAddress !== 'string' || input.deliveryAddress.length > 1000)) ||
        (input.phone !== undefined && (typeof input.phone !== 'string' || input.phone.length > 40)) ||
        (method === 'delivery' && (!input.deliveryAddress?.trim() || !input.phone?.trim()))) {
      throw new BadRequestException('Delivery requires address and phone (maximum 1000 / 40 characters).');
    }
    const { companyId, cart } = await this.assertCartAccess(companyCode, cartId, cartToken);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<{ status: string; currency_code: string }>(
        'SELECT status,currency_code FROM ecommerce_carts WHERE id=$1 AND company_id=$2 FOR UPDATE', [cart.id, companyId],
      );
      if (locked.rows[0]?.status === 'checked_out') {
        const prior = await client.query<{ sales_order_id: string; checkout_number: string; order_number: string; subtotal: string; tax_total: string; grand_total: string }>(
          `SELECT ec.sales_order_id,ec.checkout_number,so.order_number,c.subtotal,c.tax_total,c.grand_total FROM ecommerce_checkouts ec
           JOIN ecommerce_carts c ON c.id=ec.cart_id JOIN sales_orders so ON so.id=ec.sales_order_id AND so.company_id=ec.company_id
           WHERE ec.company_id=$1 AND ec.cart_id=$2`, [companyId, cart.id],
        );
        if (!prior.rows[0]) throw new ConflictException('Checkout requires reconciliation.');
        await client.query('COMMIT');
        return { cartId: cart.id, orderId: prior.rows[0].sales_order_id, orderNumber: prior.rows[0].order_number, checkoutNumber: prior.rows[0].checkout_number,
          subtotal: Number(prior.rows[0].subtotal), taxTotal: Number(prior.rows[0].tax_total), grandTotal: Number(prior.rows[0].grand_total), replayed: true };
      }
      if (locked.rows[0]?.status !== 'open') throw new BadRequestException('Cart is not open.');
      const currency = await client.query<{ currency_code: string }>(
        `SELECT c.currency_code FROM companies c JOIN ecommerce_storefront_settings s ON s.company_id=c.id
         WHERE c.id=$1 AND s.is_active=TRUE AND c.currency_code=s.currency_code`, [companyId],
      );
      if (currency.rows[0]?.currency_code !== locked.rows[0].currency_code) throw new ConflictException('Store currency changed. Create a new cart.');
      const cartItems = await client.query<{
        listing_id: string;
        product_id: string;
        quantity: string;
        unit_price: string;
        line_total: string;
      }>(
        `SELECT listing_id, product_id, quantity, unit_price, line_total
         FROM ecommerce_cart_items
         WHERE cart_id = $1 ORDER BY product_id`,
        [cart.id],
      );
      if (cartItems.rows.length === 0) {
        throw new BadRequestException('Cart is empty.');
      }

      for (const item of cartItems.rows) {
        const current = await client.query<{ unit_price: string }>(
          `SELECT l.unit_price FROM ecommerce_product_listings l JOIN products p ON p.id=l.product_id AND p.company_id=l.company_id
           WHERE l.id=$1 AND l.company_id=$2 AND l.is_published=TRUE AND p.is_active=TRUE FOR SHARE OF l,p`,
          [item.listing_id, companyId],
        );
        if (!current.rows[0] || Number(current.rows[0].unit_price) !== Number(item.unit_price)) {
          throw new ConflictException('A product or price changed. Review the catalog and update your cart before confirming.');
        }
        const available = await this.getAvailableStockTx(client, companyId, item.product_id);
        if (available < Number(item.quantity)) {
          throw new BadRequestException(`Insufficient stock for product ${item.product_id}.`);
        }
      }

      const customerId = await this.resolveOrCreateCustomer(client, companyId, input);
      const { subtotal, taxTotal, grandTotal } = await this.computeCartTotalsWithTax(client, companyId, cart.id);
      const quoteNumber = await nextDocumentNumber(client, companyId, 'WEBQ');
      const orderNumber = await nextDocumentNumber(client, companyId, 'WEBO');
      const checkoutNumber = await nextDocumentNumber(client, companyId, 'CHKO');

      const quotation = await client.query<{ id: string }>(
        `INSERT INTO sales_quotations
          (company_id, customer_id, quotation_number, status, subtotal, tax_total, grand_total, notes, created_by, currency_code)
         VALUES ($1,$2,$3,'approved',$4,$5,$6,$7,NULL,(SELECT currency_code FROM ecommerce_carts WHERE id=$8))
         RETURNING id`,
        [companyId, customerId, quoteNumber, subtotal, taxTotal, grandTotal, input.notes ?? 'Checkout eCommerce', cart.id],
      );
      for (const item of cartItems.rows) {
        await client.query(
          `INSERT INTO sales_quotation_lines (quotation_id, product_id, quantity, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5)`,
          [quotation.rows[0].id, item.product_id, item.quantity, item.unit_price, item.line_total],
        );
      }

      const order = await client.query<{ id: string }>(
        `INSERT INTO sales_orders
          (company_id, customer_id, quotation_id, order_number, status, subtotal, tax_total, grand_total, created_by, currency_code)
         VALUES ($1,$2,$3,$4,'confirmed',$5,$6,$7,NULL,(SELECT currency_code FROM ecommerce_carts WHERE id=$8))
         RETURNING id`,
        [companyId, customerId, quotation.rows[0].id, orderNumber, subtotal, taxTotal, grandTotal, cart.id],
      );
      for (const item of cartItems.rows) {
        await client.query(
          `INSERT INTO sales_order_lines (order_id, product_id, quantity, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5)`,
          [order.rows[0].id, item.product_id, item.quantity, item.unit_price, item.line_total],
        );
      }

      await this.reserveSalesOrderStockTx(client, companyId, order.rows[0].id, 'MAIN');
      await client.query(
        `INSERT INTO ecommerce_fulfillments(company_id,sales_order_id,delivery_method,address,phone) VALUES($1,$2,$3,$4,$5)`,
        [companyId, order.rows[0].id, method, method === 'delivery' ? input.deliveryAddress!.trim() : null, input.phone?.trim() || null],
      );

      await client.query(
        `INSERT INTO ecommerce_checkouts
          (company_id, cart_id, sales_order_id, checkout_number, status, notes)
         VALUES ($1,$2,$3,$4,'completed',$5)`,
        [companyId, cart.id, order.rows[0].id, checkoutNumber, input.notes ?? null],
      );
      await client.query(
        `UPDATE ecommerce_carts
         SET status = 'checked_out',
             customer_name = $1,
             customer_email = $2,
             subtotal = $3,
             tax_total = $4,
             grand_total = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [input.customerName.trim(), input.customerEmail.trim().toLowerCase(), subtotal, taxTotal, grandTotal, cart.id],
      );

      await this.insertAuditTx(client, companyId, null, 'ecommerce.checkout.complete', cart.id, {
        order_id: order.rows[0].id,
        checkout_number: checkoutNumber,
      });

      await client.query('COMMIT');
      return {
        cartId: cart.id,
        checkoutNumber,
        orderId: order.rows[0].id,
        orderNumber,
        subtotal,
        taxTotal,
        grandTotal,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async subscribe(companyCode: string, input: SubscribeInput) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!email || email.length > 255 || !this.isValidEmail(email) ||
        (input.fullName !== undefined && (typeof input.fullName !== 'string' || input.fullName.length > 200)) ||
        (input.consentVersion !== undefined && (typeof input.consentVersion !== 'string' || !input.consentVersion.trim() || input.consentVersion.length > 32))) {
      throw new BadRequestException('A valid email is required.');
    }
    if (input.acceptsMarketing !== true) {
      throw new BadRequestException('acceptsMarketing must be true to subscribe.');
    }
    const company = await this.resolveCompanyByCode(companyCode);
    const customer = await this.db.query<{ id: string }>(
      `SELECT id
       FROM customers
       WHERE company_id = $1 AND email = $2
       LIMIT 1`,
      [company.id, email],
    );
    const unsubscribeToken = randomBytes(32).toString('hex');
    const result = await this.db.query<{ id: string; status: string }>(
      `INSERT INTO ecommerce_subscribers
        (company_id, customer_id, email, full_name, status, source, consent_version, consent_at, unsubscribed_at, updated_at,unsubscribe_token_hash)
       VALUES ($1,$2,$3,$4,'subscribed','storefront',$5,NOW(),NULL,NOW(),$6)
       ON CONFLICT (company_id, email)
       DO UPDATE SET
         customer_id = COALESCE(EXCLUDED.customer_id, ecommerce_subscribers.customer_id),
         full_name = COALESCE(EXCLUDED.full_name, ecommerce_subscribers.full_name),
         status = 'subscribed',
         consent_version = EXCLUDED.consent_version,
         consent_at = NOW(),
         unsubscribed_at = NULL,
         unsubscribe_token_hash = EXCLUDED.unsubscribe_token_hash,
         updated_at = NOW()
       RETURNING id, status`,
      [company.id, customer.rows[0]?.id ?? null, email, input.fullName?.trim() || null, input.consentVersion ?? 'v1', this.hashSecret(unsubscribeToken)],
    );
    await this.db.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [company.id, null, 'ecommerce.subscription.subscribe', 'ecommerce', result.rows[0].id, JSON.stringify({ email })],
    );
    return { id: result.rows[0].id, status: result.rows[0].status, unsubscribeToken };
  }

  async listSubscribers(user: AuthUser) {
    const result = await this.db.query(
      `SELECT id, customer_id, email, full_name, status, source, consent_version, consent_at, unsubscribed_at, created_at, updated_at
       FROM ecommerce_subscribers
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [user.companyId],
    );
    await this.insertAudit(user, 'ecommerce.subscription.list', user.companyId, { total: result.rows.length });
    return result.rows;
  }

  async unsubscribe(user: AuthUser, subscriberId: string) {
    const result = await this.db.query<{ id: string }>(
      `UPDATE ecommerce_subscribers
       SET status = 'unsubscribed', unsubscribed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'subscribed'
       RETURNING id`,
      [subscriberId, user.companyId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('Active subscriber not found.');
    }
    await this.insertAudit(user, 'ecommerce.subscription.unsubscribe', subscriberId, {});
    return { id: subscriberId, status: 'unsubscribed' };
  }

  private async resolveCompanyByCode(companyCode: string) {
    if (!companyCode?.trim()) {
      throw new BadRequestException('companyCode is required.');
    }
    const company = await this.db.query<{ id: string; code: string }>(
      `SELECT id, code
       FROM companies
       WHERE code = $1 AND is_active = TRUE
       LIMIT 1`,
      [companyCode.trim()],
    );
    if (!company.rows[0]) {
      throw new NotFoundException('Company storefront not found.');
    }
    return company.rows[0];
  }

  private async assertCartAccess(companyCode: string, cartId: string, cartToken: string) {
    if (!cartToken?.trim()) {
      throw new UnauthorizedException('Missing cart token.');
    }
    const company = await this.resolveCompanyByCode(companyCode);
    const tokenHash = this.hashSecret(cartToken.trim());
    const cartResult = await this.db.query<{
      id: string;
      status: string;
      currency_code: string;
      subtotal: string;
      tax_total: string;
      grand_total: string;
    }>(
      `SELECT id, status, currency_code, subtotal, tax_total, grand_total
       FROM ecommerce_carts
       WHERE id = $1 AND company_id = $2 AND cart_token_hash = $3
       LIMIT 1`,
      [cartId, company.id, tokenHash],
    );
    if (!cartResult.rows[0]) {
      throw new UnauthorizedException('Invalid cart token or cart id.');
    }
    return { companyId: company.id, cart: cartResult.rows[0] };
  }

  private hashSecret(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private normalizeTheme(input: Record<string, unknown>) {
    const text = (value: unknown, fallback: string, maximum: number) => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || value.length > maximum) {
        throw new BadRequestException('Store theme contains invalid text.');
      }
      return value.trim();
    };
    const color = (value: unknown, fallback: string) => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
        throw new BadRequestException('Store theme colors must use #RRGGBB format.');
      }
      return value;
    };
    const template = input['template'] ?? 'minimal';
    if (!['minimal', 'editorial', 'bold'].includes(String(template))) {
      throw new BadRequestException('Store theme template is invalid.');
    }
    const allowedSections = ['hero', 'categories', 'products', 'newsletter'];
    const rawSections = input['sections'];
    const sections = rawSections === undefined ? allowedSections : rawSections;
    if (!Array.isArray(sections) || sections.length > allowedSections.length ||
        sections.some(section => typeof section !== 'string' || !allowedSections.includes(section)) ||
        new Set(sections).size !== sections.length) {
      throw new BadRequestException('Store theme sections are invalid.');
    }
    if (input['showNewsletter'] !== undefined && typeof input['showNewsletter'] !== 'boolean') {
      throw new BadRequestException('Store theme newsletter visibility must be boolean.');
    }
    const rawImage = input['heroImageUrl'];
    let heroImageUrl = '';
    if (rawImage !== undefined) {
      if (typeof rawImage !== 'string' || rawImage.length > 2048) {
        throw new BadRequestException('Store hero image URL is invalid.');
      }
      if (rawImage.trim()) {
        let parsed: URL;
        try {
          parsed = new URL(rawImage.trim());
        } catch {
          throw new BadRequestException('Store hero image URL must be an absolute HTTPS URL.');
        }
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
          throw new BadRequestException('Store hero image URL must be a public HTTPS URL.');
        }
        heroImageUrl = parsed.toString();
      }
    }
    return {
      template,
      brandColor: color(input['brandColor'], '#2563eb'),
      accentColor: color(input['accentColor'], '#0f172a'),
      heroTitle: text(input['heroTitle'], '', 120),
      heroSubtitle: text(input['heroSubtitle'], '', 320),
      heroCtaText: text(input['heroCtaText'], 'Explorar catálogo', 48),
      heroImageUrl,
      announcement: text(input['announcement'], '', 140),
      footerText: text(input['footerText'], '', 240),
      sections,
      showNewsletter: input['showNewsletter'] === undefined ? true : input['showNewsletter'] === true,
    };
  }

  private async getAvailableStock(companyId: string, productId: string) {
    const result = await this.db.query<{ available: string | null }>(
      `SELECT COALESCE(SUM(on_hand - reserved), 0)::text AS available
       FROM inventory_stock_balances
       WHERE company_id = $1 AND product_id = $2 AND location_code='MAIN'`,
      [companyId, productId],
    );
    return Number(result.rows[0].available ?? '0');
  }

  private async getAvailableStockTx(client: DbClient, companyId: string, productId: string) {
    const result = await client.query<{ available: string | null }>(
      `SELECT COALESCE(SUM(on_hand - reserved), 0)::text AS available
       FROM inventory_stock_balances
       WHERE company_id = $1 AND product_id = $2 AND location_code='MAIN'`,
      [companyId, productId],
    );
    return Number(result.rows[0].available ?? '0');
  }

  private async recalculateCartTotals(companyId: string, cartId: string) {
    const totals = await this.db.query<{ subtotal: string | null }>(
      `SELECT COALESCE(SUM(line_total), 0)::text AS subtotal
       FROM ecommerce_cart_items
       WHERE cart_id = $1`,
      [cartId],
    );
    const subtotal = Number(totals.rows[0].subtotal ?? '0');
    const taxRate = await this.resolveDefaultTaxRatePercent(companyId);
    const taxTotal = Number(((subtotal * taxRate) / 100).toFixed(4));
    const grandTotal = Number((subtotal + taxTotal).toFixed(4));
    await this.db.query(
      `UPDATE ecommerce_carts
       SET subtotal = $1, tax_total = $2, grand_total = $3, updated_at = NOW()
       WHERE id = $4`,
      [subtotal, taxTotal, grandTotal, cartId],
    );
  }

  private async resolveDefaultTaxRatePercent(companyId: string) {
    const settings = await this.db.query<{ default_tax_rate_code: string | null }>(
      `SELECT default_tax_rate_code
       FROM ecommerce_storefront_settings
       WHERE company_id = $1
       LIMIT 1`,
      [companyId],
    );
    const code = settings.rows[0]?.default_tax_rate_code;
    if (!code) {
      return 0;
    }
    const tax = await this.db.query<{ rate: string }>(
      `SELECT rate
       FROM tax_rates
       WHERE company_id = $1 AND code = $2 AND is_active = TRUE
       LIMIT 1`,
      [companyId, code],
    );
    return tax.rows[0] ? Number(tax.rows[0].rate) : 0;
  }

  private async computeCartTotalsWithTax(client: DbClient, companyId: string, cartId: string) {
    const totals = await client.query<{ subtotal: string | null }>(
      `SELECT COALESCE(SUM(line_total), 0)::text AS subtotal
       FROM ecommerce_cart_items
       WHERE cart_id = $1`,
      [cartId],
    );
    const subtotal = Number(totals.rows[0].subtotal ?? '0');
    const taxRate = await this.resolveDefaultTaxRatePercent(companyId);
    const taxTotal = Number(((subtotal * taxRate) / 100).toFixed(4));
    const grandTotal = Number((subtotal + taxTotal).toFixed(4));
    return { subtotal, taxTotal, grandTotal };
  }

  private async resolveOrCreateCustomer(client: DbClient, companyId: string, input: CheckoutCartInput) {
    const email = input.customerEmail.trim().toLowerCase();
    // Guest checkout must not attach an order to an existing identity using an unverified email/code.
    const customerCode = `ECOM-${randomBytes(12).toString('hex')}`;
    const created = await client.query<{ id: string }>(
      `INSERT INTO customers (company_id, code, name, email, tax_id, is_active)
       VALUES ($1,$2,$3,$4,$5,TRUE)
       RETURNING id`,
      [companyId, customerCode, input.customerName.trim(), email, input.customerTaxId ?? null],
    );
    return created.rows[0].id;
  }

  private async reserveSalesOrderStockTx(client: DbClient, companyId: string, salesOrderId: string, locationCode: string) {
    const lines = await client.query<{ product_id: string; quantity: string }>(
      `SELECT product_id, quantity
       FROM sales_order_lines
       WHERE order_id = $1 ORDER BY product_id`,
      [salesOrderId],
    );
    for (const line of lines.rows) {
      await client.query(
        `INSERT INTO inventory_stock_balances (company_id, location_code, product_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (company_id, location_code, product_id) DO NOTHING`,
        [companyId, locationCode, line.product_id],
      );
      const stock = await client.query<{ on_hand: string; reserved: string }>(
        `SELECT on_hand, reserved
         FROM inventory_stock_balances
         WHERE company_id = $1 AND location_code = $2 AND product_id = $3
         FOR UPDATE`,
        [companyId, locationCode, line.product_id],
      );
      const quantity = Number(line.quantity);
      const available = Number(stock.rows[0].on_hand) - Number(stock.rows[0].reserved);
      if (available < quantity) {
        throw new BadRequestException(`Insufficient stock for product ${line.product_id}.`);
      }
      await client.query(
        `UPDATE inventory_stock_balances
         SET reserved = reserved + $1, updated_at = NOW()
         WHERE company_id = $2 AND location_code = $3 AND product_id = $4`,
        [quantity, companyId, locationCode, line.product_id],
      );
      await client.query(
        `INSERT INTO inventory_reservations (company_id, sales_order_id, product_id, location_code, quantity, status)
         VALUES ($1,$2,$3,$4,$5,'reserved')`,
        [companyId, salesOrderId, line.product_id, locationCode, quantity],
      );
      await client.query(
        `INSERT INTO inventory_movements
          (company_id, location_code, product_id, movement_type, quantity, reference_type, reference_id, created_by)
         VALUES ($1,$2,$3,'sale_reservation',$4,'sales_order',$5,NULL)`,
        [companyId, locationCode, line.product_id, quantity, salesOrderId],
      );
    }
  }

  private async insertAudit(user: AuthUser, eventName: string, entityId: string, payload: Record<string, unknown>) {
    await this.db.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.companyId, user.sub, eventName, 'ecommerce', entityId, JSON.stringify(payload)],
    );
  }

  private async insertAuditTx(
    client: DbClient,
    companyId: string,
    actorUserId: string | null,
    eventName: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO audit_log (company_id, actor_user_id, event_name, entity_name, entity_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [companyId, actorUserId, eventName, 'ecommerce', entityId, JSON.stringify(payload)],
    );
  }
}
