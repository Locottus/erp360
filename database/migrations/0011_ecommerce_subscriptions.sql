CREATE TABLE IF NOT EXISTS ecommerce_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    customer_id UUID REFERENCES customers(id),
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(180),
    status VARCHAR(24) NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
    source VARCHAR(32) NOT NULL DEFAULT 'storefront',
    consent_version VARCHAR(32) NOT NULL DEFAULT 'v1',
    consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_subscribers_company ON ecommerce_subscribers(company_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_subscribers_customer ON ecommerce_subscribers(customer_id);
