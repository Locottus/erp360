BEGIN;
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
    CHECK(status IN ('draft','ordered','partially_received','received','cancelled'));
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS payload JSONB;
CREATE TABLE IF NOT EXISTS purchase_receipt_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES purchase_receipts(id),
    order_line_id UUID NOT NULL REFERENCES purchase_order_lines(id),
    location_code VARCHAR(32) NOT NULL,
    quantity NUMERIC(18,4) NOT NULL CHECK(quantity>0),
    unit_cost NUMERIC(18,4) NOT NULL CHECK(unit_cost>=0),
    UNIQUE(receipt_id,order_line_id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_lines_order ON purchase_receipt_lines(order_line_id);
CREATE TABLE IF NOT EXISTS purchase_supplier_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    reference VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    payload JSONB NOT NULL,
    subtotal NUMERIC(18,4) NOT NULL DEFAULT 0,
    tax_total NUMERIC(18,4) NOT NULL DEFAULT 0,
    grand_total NUMERIC(18,4) NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id,reference)
);
CREATE TABLE IF NOT EXISTS purchase_supplier_return_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES purchase_supplier_returns(id),
    receipt_line_id UUID NOT NULL REFERENCES purchase_receipt_lines(id),
    quantity NUMERIC(18,4) NOT NULL CHECK(quantity>0),
    subtotal NUMERIC(18,4) NOT NULL CHECK(subtotal>=0),
    UNIQUE(return_id,receipt_line_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_return_lines_receipt ON purchase_supplier_return_lines(receipt_line_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_order ON purchase_supplier_returns(company_id,purchase_order_id);
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check CHECK (
    movement_type IN ('purchase_receipt','supplier_return','sale_reservation','sale_dispatch','reservation_release',
                     'adjustment_in','adjustment_out','transfer_in','transfer_out','count_in','count_out')
);
COMMIT;
