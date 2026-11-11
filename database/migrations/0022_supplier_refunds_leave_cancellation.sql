BEGIN;
CREATE TABLE IF NOT EXISTS accounting_supplier_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    reference VARCHAR(64) NOT NULL,
    amount NUMERIC(18,4) NOT NULL CHECK(amount>0),
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id,reference)
);
CREATE INDEX IF NOT EXISTS idx_supplier_refunds_order ON accounting_supplier_refunds(company_id,purchase_order_id);
ALTER TABLE hr_leave_requests DROP CONSTRAINT IF EXISTS hr_leave_requests_status_check;
ALTER TABLE hr_leave_requests ADD CONSTRAINT hr_leave_requests_status_check
    CHECK(status IN ('requested','approved','rejected','cancelled'));
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
COMMIT;
