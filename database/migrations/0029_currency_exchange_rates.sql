BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'USD';

CREATE TABLE IF NOT EXISTS currency_exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    rate NUMERIC(18,8) NOT NULL CHECK (rate > 0),
    source VARCHAR(64) NOT NULL DEFAULT 'manual',
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, from_currency, to_currency, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_currency_exchange_rates_company_id
  ON currency_exchange_rates(company_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_currency_exchange_rates_pair
  ON currency_exchange_rates(company_id, from_currency, to_currency, valid_from DESC);

COMMIT;
