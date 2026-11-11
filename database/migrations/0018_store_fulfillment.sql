BEGIN;
ALTER TABLE ecommerce_subscribers ADD COLUMN IF NOT EXISTS unsubscribe_token_hash VARCHAR(64);
CREATE TABLE IF NOT EXISTS ecommerce_fulfillments(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  delivery_method VARCHAR(16) NOT NULL CHECK(delivery_method IN ('pickup','delivery')),
  address TEXT,
  phone VARCHAR(40),
  status VARCHAR(16) NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','preparing','ready','shipped','delivered')),
  courier VARCHAR(120),
  tracking_code VARCHAR(120),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,sales_order_id)
);
COMMIT;
