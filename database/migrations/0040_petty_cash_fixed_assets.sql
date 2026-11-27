BEGIN;

INSERT INTO permissions(code, resource, action, description)
VALUES
  ('petty_cash.read', 'petty_cash', 'read', 'Consultar fondos, vales y arqueos de caja chica'),
  ('petty_cash.manage', 'petty_cash', 'manage', 'Crear, abrir, arquear y cerrar fondos de caja chica'),
  ('petty_cash.disburse', 'petty_cash', 'disburse', 'Solicitar y cancelar vales de caja chica'),
  ('petty_cash.approve', 'petty_cash', 'approve', 'Aprobar, rechazar vales y reponer caja chica'),
  ('fixed_assets.read', 'fixed_assets', 'read', 'Consultar activos fijos y depreciacion'),
  ('fixed_assets.manage', 'fixed_assets', 'manage', 'Administrar categorias, altas, activacion y bajas de activos fijos'),
  ('fixed_assets.depreciate', 'fixed_assets', 'depreciate', 'Calcular, contabilizar y descartar depreciacion')
ON CONFLICT(code) DO UPDATE
SET resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS petty_cash_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  code VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  custodian_user_id UUID REFERENCES users(id),
  cash_account_id UUID NOT NULL REFERENCES accounting_accounts(id),
  imprest_amount NUMERIC(18,4) NOT NULL CHECK (imprest_amount > 0),
  self_approval_limit NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (self_approval_limit >= 0),
  balance NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  revision INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS petty_cash_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  fund_id UUID NOT NULL REFERENCES petty_cash_funds(id),
  voucher_number VARCHAR(48) NOT NULL,
  idempotency_key VARCHAR(80) NOT NULL,
  amount NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  expense_account_id UUID NOT NULL REFERENCES accounting_accounts(id),
  payee VARCHAR(160) NOT NULL,
  description VARCHAR(500) NOT NULL,
  receipt_reference VARCHAR(80) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by UUID NOT NULL REFERENCES users(id),
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  decision_reason VARCHAR(1000),
  journal_entry_id UUID REFERENCES accounting_journal_entries(id),
  replenishment_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, voucher_number),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS petty_cash_fund_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  fund_id UUID NOT NULL REFERENCES petty_cash_funds(id),
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('opening', 'replenishment', 'closing')),
  idempotency_key VARCHAR(80) NOT NULL,
  amount NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  counter_account_id UUID NOT NULL REFERENCES accounting_accounts(id),
  journal_entry_id UUID NOT NULL REFERENCES accounting_journal_entries(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, idempotency_key)
);

ALTER TABLE petty_cash_vouchers
  ADD CONSTRAINT petty_cash_vouchers_replenishment_fk
  FOREIGN KEY (replenishment_id) REFERENCES petty_cash_fund_movements(id);

CREATE TABLE IF NOT EXISTS petty_cash_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  fund_id UUID NOT NULL REFERENCES petty_cash_funds(id),
  counted_amount NUMERIC(18,4) NOT NULL CHECK (counted_amount >= 0),
  book_balance NUMERIC(18,4) NOT NULL,
  pending_amount NUMERIC(18,4) NOT NULL,
  difference NUMERIC(18,4) NOT NULL,
  notes VARCHAR(1000) NOT NULL,
  counted_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_petty_cash_vouchers_fund_status
  ON petty_cash_vouchers(fund_id, status);
CREATE INDEX IF NOT EXISTS idx_petty_cash_movements_fund
  ON petty_cash_fund_movements(fund_id, created_at);

CREATE TABLE IF NOT EXISTS fixed_asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  code VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  depreciation_method VARCHAR(16) NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line')),
  useful_life_months INTEGER NOT NULL CHECK (useful_life_months BETWEEN 1 AND 1200),
  asset_account_id UUID NOT NULL REFERENCES accounting_accounts(id),
  accumulated_account_id UUID NOT NULL REFERENCES accounting_accounts(id),
  expense_account_id UUID NOT NULL REFERENCES accounting_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  asset_code VARCHAR(48) NOT NULL,
  name VARCHAR(160) NOT NULL,
  category_id UUID NOT NULL REFERENCES fixed_asset_categories(id),
  idempotency_key VARCHAR(80) NOT NULL,
  acquisition_date DATE NOT NULL,
  in_service_date DATE NOT NULL,
  cost NUMERIC(18,4) NOT NULL CHECK (cost > 0),
  salvage_value NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  useful_life_months INTEGER NOT NULL CHECK (useful_life_months BETWEEN 1 AND 1200),
  asset_account_id UUID NOT NULL REFERENCES accounting_accounts(id),
  accumulated_account_id UUID NOT NULL REFERENCES accounting_accounts(id),
  expense_account_id UUID NOT NULL REFERENCES accounting_accounts(id),
  accumulated_depreciation NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (accumulated_depreciation >= 0),
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'disposed')),
  revision INTEGER NOT NULL DEFAULT 0,
  acquisition_entry_id UUID REFERENCES accounting_journal_entries(id),
  activated_by UUID REFERENCES users(id),
  activated_at TIMESTAMPTZ,
  disposed_at DATE,
  disposal_proceeds NUMERIC(18,4),
  disposal_entry_id UUID REFERENCES accounting_journal_entries(id),
  disposal_reason VARCHAR(1000),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, asset_code),
  UNIQUE (company_id, idempotency_key),
  CHECK (salvage_value < cost),
  CHECK (in_service_date >= acquisition_date)
);

CREATE TABLE IF NOT EXISTS fixed_asset_depreciation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  asset_id UUID NOT NULL REFERENCES fixed_assets(id),
  period_year INTEGER NOT NULL CHECK (period_year >= 2000),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  amount NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'void')),
  journal_entry_id UUID REFERENCES accounting_journal_entries(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  void_reason VARCHAR(1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_asset_depreciation_period
  ON fixed_asset_depreciation_lines(asset_id, period_year, period_month)
  WHERE status <> 'void';
CREATE INDEX IF NOT EXISTS idx_fixed_asset_depreciation_company_period
  ON fixed_asset_depreciation_lines(company_id, period_year, period_month, status);

COMMIT;
