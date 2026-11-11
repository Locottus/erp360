BEGIN;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS document_snapshot JSONB;
COMMIT;
