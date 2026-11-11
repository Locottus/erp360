BEGIN;

CREATE TABLE IF NOT EXISTS platform_saas_operators (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'billing', 'viewer')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(180) NOT NULL,
    billing_email VARCHAR(255) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES saas_accounts(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    starts_on DATE NOT NULL,
    renews_on DATE NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (renews_on >= starts_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_saas_active_subscription_company
    ON saas_subscriptions(company_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_account
    ON saas_subscriptions(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saas_subscription_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES saas_subscriptions(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    renews_on DATE NOT NULL,
    reason TEXT NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, revision)
);

CREATE TABLE IF NOT EXISTS saas_subscription_revision_modules (
    revision_id UUID NOT NULL REFERENCES saas_subscription_revisions(id),
    code VARCHAR(32) NOT NULL CHECK (code IN ('base', 'sales', 'purchases', 'inventory', 'accounting', 'store', 'people')),
    price NUMERIC(18, 4) NOT NULL CHECK (price >= 0),
    PRIMARY KEY (revision_id, code)
);

CREATE TABLE IF NOT EXISTS saas_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES saas_subscriptions(id),
    reference VARCHAR(120) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    issued_on DATE NOT NULL DEFAULT CURRENT_DATE,
    due_on DATE NOT NULL,
    subtotal NUMERIC(18, 4) NOT NULL CHECK (subtotal >= 0),
    total NUMERIC(18, 4) NOT NULL CHECK (total >= 0),
    status VARCHAR(16) NOT NULL DEFAULT 'issued' CHECK (status = 'issued'),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, reference),
    CHECK (period_end >= period_start),
    CHECK (due_on >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_subscription
    ON saas_invoices(subscription_id, issued_on DESC);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_due
    ON saas_invoices(due_on);

CREATE TABLE IF NOT EXISTS saas_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES saas_invoices(id),
    module_code VARCHAR(32) NOT NULL CHECK (module_code IN ('base', 'sales', 'purchases', 'inventory', 'accounting', 'store', 'people')),
    description VARCHAR(180) NOT NULL,
    quantity NUMERIC(18, 4) NOT NULL DEFAULT 1 CHECK (quantity = 1),
    unit_price NUMERIC(18, 4) NOT NULL CHECK (unit_price >= 0),
    amount NUMERIC(18, 4) NOT NULL CHECK (amount >= 0),
    UNIQUE (invoice_id, module_code)
);

CREATE TABLE IF NOT EXISTS saas_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES saas_invoices(id),
    reference VARCHAR(120) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    paid_on DATE NOT NULL,
    method VARCHAR(16) NOT NULL CHECK (method IN ('transfer', 'cash', 'other')),
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (invoice_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_saas_payments_invoice ON saas_payments(invoice_id, paid_on);

CREATE TABLE IF NOT EXISTS saas_payment_allocations (
    payment_id UUID PRIMARY KEY REFERENCES saas_payments(id),
    invoice_id UUID NOT NULL REFERENCES saas_invoices(id),
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    UNIQUE (payment_id, invoice_id)
);

CREATE TABLE IF NOT EXISTS saas_payment_reversals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL UNIQUE REFERENCES saas_payments(id),
    reference VARCHAR(120) NOT NULL UNIQUE,
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_invoice_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES saas_invoices(id),
    reference VARCHAR(120) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    issued_on DATE NOT NULL,
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (invoice_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_saas_invoice_credits_invoice
    ON saas_invoice_credits(invoice_id, issued_on);

CREATE TABLE IF NOT EXISTS saas_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES saas_accounts(id),
    invoice_id UUID REFERENCES saas_invoices(id),
    collection_stage VARCHAR(8) CHECK (collection_stage IN ('D-3', 'D0', 'D+3', 'D+7')),
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('call', 'email', 'note', 'promise')),
    note TEXT NOT NULL,
    due_on DATE NOT NULL,
    promised_on DATE,
    owner_id UUID REFERENCES users(id),
    status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'paused')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((invoice_id IS NULL) = (collection_stage IS NULL)),
    UNIQUE (invoice_id, collection_stage)
);
CREATE INDEX IF NOT EXISTS idx_saas_followups_due
    ON saas_followups(status, due_on);
CREATE INDEX IF NOT EXISTS idx_saas_followups_account
    ON saas_followups(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saas_collection_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    as_of DATE NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_count INTEGER NOT NULL CHECK (created_count >= 0),
    skipped_paid INTEGER NOT NULL CHECK (skipped_paid >= 0),
    skipped_paused INTEGER NOT NULL CHECK (skipped_paused >= 0),
    followup_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE saas_collection_runs DROP CONSTRAINT IF EXISTS saas_collection_runs_as_of_key;
CREATE INDEX IF NOT EXISTS idx_saas_collection_runs_as_of ON saas_collection_runs(as_of, created_at DESC);

CREATE TABLE IF NOT EXISTS saas_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES saas_accounts(id),
    company_id UUID REFERENCES companies(id),
    actor_user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(120) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saas_audit_account
    ON saas_audit_events(account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_audit_company
    ON saas_audit_events(company_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION saas_reject_ledger_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SaaS ledger rows are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS saas_invoice_lines_immutable ON saas_invoice_lines;
CREATE TRIGGER saas_invoice_lines_immutable
    BEFORE UPDATE OR DELETE ON saas_invoice_lines
    FOR EACH ROW EXECUTE FUNCTION saas_reject_ledger_mutation();
DROP TRIGGER IF EXISTS saas_subscription_revisions_immutable ON saas_subscription_revisions;
CREATE TRIGGER saas_subscription_revisions_immutable
    BEFORE UPDATE OR DELETE ON saas_subscription_revisions
    FOR EACH ROW EXECUTE FUNCTION saas_reject_ledger_mutation();
DROP TRIGGER IF EXISTS saas_subscription_revision_modules_immutable ON saas_subscription_revision_modules;
CREATE TRIGGER saas_subscription_revision_modules_immutable
    BEFORE UPDATE OR DELETE ON saas_subscription_revision_modules
    FOR EACH ROW EXECUTE FUNCTION saas_reject_ledger_mutation();
DROP TRIGGER IF EXISTS saas_payments_immutable ON saas_payments;
CREATE TRIGGER saas_payments_immutable
    BEFORE UPDATE OR DELETE ON saas_payments
    FOR EACH ROW EXECUTE FUNCTION saas_reject_ledger_mutation();
DROP TRIGGER IF EXISTS saas_payment_allocations_immutable ON saas_payment_allocations;
CREATE TRIGGER saas_payment_allocations_immutable
    BEFORE UPDATE OR DELETE ON saas_payment_allocations
    FOR EACH ROW EXECUTE FUNCTION saas_reject_ledger_mutation();
DROP TRIGGER IF EXISTS saas_payment_reversals_immutable ON saas_payment_reversals;
CREATE TRIGGER saas_payment_reversals_immutable
    BEFORE UPDATE OR DELETE ON saas_payment_reversals
    FOR EACH ROW EXECUTE FUNCTION saas_reject_ledger_mutation();
DROP TRIGGER IF EXISTS saas_invoice_credits_immutable ON saas_invoice_credits;
CREATE TRIGGER saas_invoice_credits_immutable
    BEFORE UPDATE OR DELETE ON saas_invoice_credits
    FOR EACH ROW EXECUTE FUNCTION saas_reject_ledger_mutation();
DROP TRIGGER IF EXISTS saas_audit_events_immutable ON saas_audit_events;
CREATE TRIGGER saas_audit_events_immutable
    BEFORE UPDATE OR DELETE ON saas_audit_events
    FOR EACH ROW EXECUTE FUNCTION saas_reject_ledger_mutation();
DROP TRIGGER IF EXISTS saas_collection_runs_immutable ON saas_collection_runs;
CREATE TRIGGER saas_collection_runs_immutable
    BEFORE UPDATE OR DELETE ON saas_collection_runs
    FOR EACH ROW EXECUTE FUNCTION saas_reject_ledger_mutation();

COMMIT;
