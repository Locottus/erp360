BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS rbac_revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS company_permission_overrides (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  permission_code VARCHAR(96) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  effect VARCHAR(5) NOT NULL CHECK(effect IN ('grant', 'deny')),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(company_id, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_company_permission_overrides_permission
  ON company_permission_overrides(permission_code);

COMMIT;
