BEGIN;

CREATE TABLE IF NOT EXISTS migration_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(128) NOT NULL UNIQUE,
  sha256 CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by VARCHAR(128) NOT NULL DEFAULT 'operator',
  environment VARCHAR(32) NOT NULL DEFAULT 'local',
  rollback_backup_path TEXT
);

CREATE TABLE IF NOT EXISTS saas_module_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  module_code VARCHAR(32) NOT NULL CHECK (module_code IN ('base','sales','purchases','inventory','accounting','store','people')),
  status VARCHAR(16) NOT NULL CHECK (status IN ('enabled','suspended','cancelled')),
  effective_at TIMESTAMPTZ NOT NULL,
  grace_until TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,module_code,effective_at)
);

CREATE TABLE IF NOT EXISTS saas_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saas_outbox_pending
  ON saas_outbox(status,available_at,created_at);

CREATE TABLE IF NOT EXISTS authorized_warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  location_code VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,location_code)
);

CREATE TABLE IF NOT EXISTS ecommerce_customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(160),
  verification_status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','disabled')),
  verification_token_hash VARCHAR(128),
  verification_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,email)
);

ALTER TABLE ecommerce_checkouts
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipping_quote_status VARCHAR(16) NOT NULL DEFAULT 'not_requested'
    CHECK (shipping_quote_status IN ('not_requested','pending','quoted','failed','expired'));

ALTER TABLE inventory_reservations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS hr_employee_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID NOT NULL REFERENCES hr_employees(id),
  user_id UUID NOT NULL REFERENCES users(id),
  binding_status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (binding_status IN ('active','disabled')),
  bound_by UUID NOT NULL REFERENCES users(id),
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMPTZ,
  reason TEXT,
  UNIQUE(company_id,employee_id),
  UNIQUE(company_id,user_id)
);

COMMIT;
