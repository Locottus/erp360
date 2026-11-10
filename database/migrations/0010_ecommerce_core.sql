CREATE TABLE IF NOT EXISTS ecommerce_storefront_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    store_name VARCHAR(180) NOT NULL,
    store_slug VARCHAR(64) NOT NULL,
    currency_code VARCHAR(8) NOT NULL DEFAULT 'USD',
    default_tax_rate_code VARCHAR(32),
    support_email VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    theme_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id),
    UNIQUE (store_slug)
);

CREATE TABLE IF NOT EXISTS ecommerce_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(32) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS ecommerce_product_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    product_id UUID NOT NULL REFERENCES products(id),
    category_id UUID REFERENCES ecommerce_categories(id),
    slug VARCHAR(120) NOT NULL,
    title VARCHAR(180) NOT NULL,
    short_description TEXT,
    long_description TEXT,
    unit_price NUMERIC(18, 4) NOT NULL CHECK (unit_price >= 0),
    compare_at_price NUMERIC(18, 4) CHECK (compare_at_price IS NULL OR compare_at_price >= unit_price),
    featured_image_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, product_id),
    UNIQUE (company_id, slug)
);

CREATE TABLE IF NOT EXISTS ecommerce_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    cart_token_hash TEXT NOT NULL UNIQUE,
    cart_token_prefix VARCHAR(16) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checked_out', 'abandoned')),
    currency_code VARCHAR(8) NOT NULL DEFAULT 'USD',
    customer_name VARCHAR(180),
    customer_email VARCHAR(255),
    subtotal NUMERIC(18, 4) NOT NULL DEFAULT 0,
    tax_total NUMERIC(18, 4) NOT NULL DEFAULT 0,
    grand_total NUMERIC(18, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ecommerce_cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES ecommerce_carts(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES ecommerce_product_listings(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(18, 4) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(18, 4) NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cart_id, listing_id)
);

CREATE TABLE IF NOT EXISTS ecommerce_checkouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    cart_id UUID NOT NULL REFERENCES ecommerce_carts(id),
    sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
    checkout_number VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, checkout_number),
    UNIQUE (cart_id),
    UNIQUE (sales_order_id)
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_categories_company ON ecommerce_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_listings_company ON ecommerce_product_listings(company_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_listings_category ON ecommerce_product_listings(category_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_carts_company ON ecommerce_carts(company_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_cart_items_cart ON ecommerce_cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_checkouts_company ON ecommerce_checkouts(company_id);
