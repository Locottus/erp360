BEGIN;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3);
ALTER TABLE sales_quotations ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3);
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3);
CREATE TABLE IF NOT EXISTS sales_credit_notes(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id),
    credit_number VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    subtotal NUMERIC(18,4) NOT NULL,
    tax_total NUMERIC(18,4) NOT NULL,
    grand_total NUMERIC(18,4) NOT NULL,
    currency_code VARCHAR(3),
    stock_returned BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id,invoice_id),
    UNIQUE(company_id,credit_number)
);
COMMIT;
