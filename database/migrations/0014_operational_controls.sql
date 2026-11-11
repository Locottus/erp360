BEGIN;
CREATE TABLE IF NOT EXISTS document_sequences(
    company_id UUID NOT NULL REFERENCES companies(id),
    prefix VARCHAR(24) NOT NULL,
    last_value BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY(company_id,prefix)
);
CREATE TABLE IF NOT EXISTS inventory_operations(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    reference VARCHAR(64) NOT NULL,
    operation_type VARCHAR(24) NOT NULL CHECK(operation_type IN ('transfer','count')),
    payload JSONB NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id,reference)
);
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check CHECK (
    movement_type IN ('purchase_receipt','sale_reservation','sale_dispatch','reservation_release',
                     'adjustment_in','adjustment_out','transfer_in','transfer_out','count_in','count_out')
);
CREATE TABLE IF NOT EXISTS accounting_supplier_payments(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    payment_reference VARCHAR(64) NOT NULL,
    amount NUMERIC(18,4) NOT NULL CHECK(amount>0),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id,payment_reference)
);
ALTER TABLE accounting_period_closures DROP CONSTRAINT IF EXISTS accounting_period_closures_status_check;
ALTER TABLE accounting_period_closures ADD CONSTRAINT accounting_period_closures_status_check CHECK(status IN ('closed','reopened'));
ALTER TABLE accounting_period_closures ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;
ALTER TABLE accounting_period_closures ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES users(id);
ALTER TABLE accounting_period_closures ADD COLUMN IF NOT EXISTS reopen_reason TEXT;
CREATE OR REPLACE FUNCTION erp_assert_accounting_period_open() RETURNS trigger AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('accounting-period:' || NEW.company_id::text));
    IF EXISTS (
        SELECT 1 FROM accounting_period_closures
        WHERE company_id=NEW.company_id AND period_year=EXTRACT(YEAR FROM NEW.entry_date)
          AND period_month=EXTRACT(MONTH FROM NEW.entry_date) AND status='closed'
    ) THEN
        RAISE EXCEPTION 'Accounting period is closed' USING ERRCODE='P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS accounting_period_guard ON accounting_journal_entries;
CREATE TRIGGER accounting_period_guard BEFORE INSERT ON accounting_journal_entries
FOR EACH ROW EXECUTE FUNCTION erp_assert_accounting_period_open();
COMMIT;
