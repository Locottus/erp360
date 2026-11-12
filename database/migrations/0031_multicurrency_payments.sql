BEGIN;

ALTER TABLE accounting_payments
  ADD COLUMN IF NOT EXISTS payment_currency_code VARCHAR(3),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS amount_base NUMERIC(18,4);

UPDATE accounting_payments p
SET payment_currency_code = COALESCE(i.currency_code, c.currency_code, 'USD'),
    exchange_rate = COALESCE(p.exchange_rate, 1),
    amount_base = COALESCE(p.amount_base, p.amount)
FROM sales_invoices i, companies c
WHERE i.id = p.invoice_id
  AND c.id = p.company_id
  AND (
    p.payment_currency_code IS NULL OR
    p.exchange_rate IS NULL OR
    p.amount_base IS NULL
  );

ALTER TABLE accounting_payments
  ALTER COLUMN payment_currency_code SET NOT NULL,
  ALTER COLUMN exchange_rate SET NOT NULL,
  ALTER COLUMN amount_base SET NOT NULL,
  ALTER COLUMN exchange_rate SET DEFAULT 1;

ALTER TABLE accounting_payments
  DROP CONSTRAINT IF EXISTS accounting_payments_exchange_rate_check,
  DROP CONSTRAINT IF EXISTS accounting_payments_amount_base_check;

ALTER TABLE accounting_payments
  ADD CONSTRAINT accounting_payments_exchange_rate_check CHECK (exchange_rate > 0),
  ADD CONSTRAINT accounting_payments_amount_base_check CHECK (amount_base > 0);

ALTER TABLE accounting_supplier_payments
  ADD COLUMN IF NOT EXISTS payment_currency_code VARCHAR(3),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS amount_base NUMERIC(18,4);

UPDATE accounting_supplier_payments p
SET payment_currency_code = COALESCE(po.currency_code, c.currency_code, 'USD'),
    exchange_rate = COALESCE(p.exchange_rate, 1),
    amount_base = COALESCE(p.amount_base, p.amount)
FROM purchase_orders po, companies c
WHERE po.id = p.purchase_order_id
  AND c.id = p.company_id
  AND (
    p.payment_currency_code IS NULL OR
    p.exchange_rate IS NULL OR
    p.amount_base IS NULL
  );

ALTER TABLE accounting_supplier_payments
  ALTER COLUMN payment_currency_code SET NOT NULL,
  ALTER COLUMN exchange_rate SET NOT NULL,
  ALTER COLUMN amount_base SET NOT NULL,
  ALTER COLUMN exchange_rate SET DEFAULT 1;

ALTER TABLE accounting_supplier_payments
  DROP CONSTRAINT IF EXISTS accounting_supplier_payments_exchange_rate_check,
  DROP CONSTRAINT IF EXISTS accounting_supplier_payments_amount_base_check;

ALTER TABLE accounting_supplier_payments
  ADD CONSTRAINT accounting_supplier_payments_exchange_rate_check CHECK (exchange_rate > 0),
  ADD CONSTRAINT accounting_supplier_payments_amount_base_check CHECK (amount_base > 0);

CREATE INDEX IF NOT EXISTS idx_accounting_payments_currency
  ON accounting_payments(company_id, payment_currency_code, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_supplier_payments_currency
  ON accounting_supplier_payments(company_id, payment_currency_code, created_at DESC);

COMMIT;
