BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS profile_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS management_revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS inventory_reorder_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    product_id UUID NOT NULL REFERENCES products(id),
    location_code VARCHAR(32) NOT NULL,
    minimum_quantity NUMERIC(18,4) NOT NULL CHECK (minimum_quantity >= 0),
    target_quantity NUMERIC(18,4) NOT NULL CHECK (target_quantity >= minimum_quantity),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_by UUID NOT NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, product_id, location_code)
);

CREATE INDEX IF NOT EXISTS idx_journal_company_date
    ON accounting_journal_entries(company_id, entry_date, id) WHERE status = 'posted';
CREATE INDEX IF NOT EXISTS idx_journal_line_account ON accounting_journal_lines(account_id, journal_entry_id);

COMMIT;
