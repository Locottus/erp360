BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS inventory_cost_policy VARCHAR(24) NOT NULL DEFAULT 'weighted_average'
    CHECK (inventory_cost_policy IN ('weighted_average', 'fifo')),
  ADD COLUMN IF NOT EXISTS inventory_cost_policy_revision INTEGER NOT NULL DEFAULT 0
    CHECK (inventory_cost_policy_revision >= 0);

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS cost_policy VARCHAR(24),
  ADD COLUMN IF NOT EXISTS cost_posted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cost_source VARCHAR(32);

CREATE TABLE IF NOT EXISTS inventory_dispatch_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
  inventory_movement_id UUID NOT NULL REFERENCES inventory_movements(id),
  product_id UUID NOT NULL REFERENCES products(id),
  location_code VARCHAR(32) NOT NULL,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18,4) NOT NULL CHECK (unit_cost >= 0),
  total_cost NUMERIC(18,4) NOT NULL CHECK (total_cost >= 0),
  cost_policy VARCHAR(24) NOT NULL CHECK (cost_policy IN ('weighted_average', 'fifo')),
  cost_revision INTEGER NOT NULL DEFAULT 0 CHECK (cost_revision >= 0),
  source VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (inventory_movement_id)
);

CREATE TABLE IF NOT EXISTS inventory_cost_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  product_id UUID NOT NULL REFERENCES products(id),
  location_code VARCHAR(32) NOT NULL,
  purchase_receipt_line_id UUID REFERENCES purchase_receipt_lines(id),
  supplier_return_id UUID REFERENCES purchase_supplier_returns(id),
  quantity_remaining NUMERIC(18,4) NOT NULL CHECK (quantity_remaining >= 0),
  unit_cost NUMERIC(18,4) NOT NULL CHECK (unit_cost >= 0),
  source_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cost_revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bank_statement_lines
  ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending', 'matched', 'reconciled', 'difference')),
  ADD COLUMN IF NOT EXISTS matched_payment_id UUID,
  ADD COLUMN IF NOT EXISTS difference_amount NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reconciliation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_status
  ON bank_statement_lines(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_inventory_dispatch_costs_company_order
  ON inventory_dispatch_costs(company_id, sales_order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_cost_lots_fifo
  ON inventory_cost_lots(company_id, product_id, location_code, source_at, id)
  WHERE quantity_remaining > 0;

CREATE TABLE IF NOT EXISTS user_mfa_totp (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_encrypted TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at TIMESTAMPTZ,
  last_used_step BIGINT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_gateway_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  provider VARCHAR(64) NOT NULL,
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_gateway_events_company
  ON payment_gateway_events(company_id, created_at DESC);

ALTER TABLE fiscal_provider_configs
  ADD COLUMN IF NOT EXISTS certification_status VARCHAR(24) NOT NULL DEFAULT 'not_certified'
    CHECK (certification_status IN ('not_certified', 'certifying', 'certified')),
  ADD COLUMN IF NOT EXISTS certification_reference TEXT;

INSERT INTO roles(code, name) VALUES
  ('accountant', 'Contabilidad'),
  ('inventory', 'Inventario'),
  ('hr', 'Recursos Humanos')
ON CONFLICT (code) DO NOTHING;

INSERT INTO accounting_accounts(company_id,code,name,account_type,is_system)
SELECT id,'5100','Costo de ventas','expense',TRUE
FROM companies
ON CONFLICT(company_id,code) DO NOTHING;

COMMIT;
