BEGIN;

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS require_independent_purchase_approver BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
