BEGIN;

ALTER TABLE inventory_cost_lots
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS source_id UUID;

ALTER TABLE inventory_reservations
  ADD COLUMN IF NOT EXISTS sales_order_line_id UUID REFERENCES sales_order_lines(id);

ALTER TABLE inventory_dispatch_costs
  ADD COLUMN IF NOT EXISTS sales_order_line_id UUID REFERENCES sales_order_lines(id);

CREATE TABLE IF NOT EXISTS inventory_dispatch_cost_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  dispatch_cost_id UUID NOT NULL REFERENCES inventory_dispatch_costs(id),
  cost_lot_id UUID NOT NULL REFERENCES inventory_cost_lots(id),
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18,4) NOT NULL CHECK (unit_cost >= 0),
  total_cost NUMERIC(18,4) NOT NULL CHECK (total_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_dispatch_cost_layers_dispatch
  ON inventory_dispatch_cost_layers(company_id, dispatch_cost_id);

ALTER TABLE sales_credit_notes
  DROP CONSTRAINT IF EXISTS sales_credit_notes_company_id_invoice_id_key;

CREATE TABLE IF NOT EXISTS sales_credit_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  credit_note_id UUID NOT NULL REFERENCES sales_credit_notes(id),
  order_line_id UUID NOT NULL REFERENCES sales_order_lines(id),
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC(18,4) NOT NULL CHECK (subtotal >= 0),
  tax_total NUMERIC(18,4) NOT NULL CHECK (tax_total >= 0),
  grand_total NUMERIC(18,4) NOT NULL CHECK (grand_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (credit_note_id, order_line_id)
);

ALTER TABLE sales_credit_stock_returns
  DROP CONSTRAINT IF EXISTS sales_credit_stock_returns_company_id_credit_note_id_key;

CREATE TABLE IF NOT EXISTS sales_credit_stock_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  return_id UUID NOT NULL REFERENCES sales_credit_stock_returns(id),
  credit_note_line_id UUID NOT NULL REFERENCES sales_credit_note_lines(id),
  inventory_movement_id UUID NOT NULL REFERENCES inventory_movements(id),
  dispatch_cost_layer_id UUID REFERENCES inventory_dispatch_cost_layers(id),
  cost_lot_id UUID NOT NULL REFERENCES inventory_cost_lots(id),
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18,4) NOT NULL CHECK (unit_cost >= 0),
  total_cost NUMERIC(18,4) NOT NULL CHECK (total_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_credit_stock_return_lines_credit
  ON sales_credit_stock_return_lines(company_id, credit_note_line_id);

ALTER TABLE purchase_request_lines
  ADD COLUMN IF NOT EXISTS destination_location_code VARCHAR(32),
  ADD COLUMN IF NOT EXISTS expected_receipt_date DATE;

ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS destination_location_code VARCHAR(32),
  ADD COLUMN IF NOT EXISTS expected_receipt_date DATE;

ALTER TABLE bank_account_statements
  ADD COLUMN IF NOT EXISTS import_format VARCHAR(32),
  ADD COLUMN IF NOT EXISTS import_sha256 CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_statements_import_hash
  ON bank_account_statements(bank_account_id,import_sha256)
  WHERE import_sha256 IS NOT NULL;

COMMIT;
