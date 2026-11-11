BEGIN;
CREATE TABLE IF NOT EXISTS sales_customer_refunds(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    credit_note_id UUID NOT NULL REFERENCES sales_credit_notes(id),
    reference VARCHAR(64) NOT NULL,
    amount NUMERIC(18,4) NOT NULL CHECK(amount>0),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id,reference)
);
COMMIT;
