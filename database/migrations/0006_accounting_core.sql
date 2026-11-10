CREATE TABLE IF NOT EXISTS accounting_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(32) NOT NULL,
    name VARCHAR(128) NOT NULL,
    account_type VARCHAR(24) NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS accounting_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    entry_number VARCHAR(64) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source_type VARCHAR(32) NOT NULL,
    source_id UUID,
    description TEXT,
    status VARCHAR(24) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'reversed')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, entry_number)
);

CREATE TABLE IF NOT EXISTS accounting_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES accounting_journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounting_accounts(id),
    line_description TEXT,
    debit NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    CHECK (
        (debit > 0 AND credit = 0) OR
        (credit > 0 AND debit = 0)
    )
);

CREATE TABLE IF NOT EXISTS accounting_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id),
    payment_reference VARCHAR(64) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(24) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'reconciled')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, payment_reference)
);

CREATE TABLE IF NOT EXISTS accounting_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id),
    payment_id UUID NOT NULL REFERENCES accounting_payments(id),
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, invoice_id, payment_id)
);

CREATE TABLE IF NOT EXISTS accounting_period_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    period_year INTEGER NOT NULL CHECK (period_year >= 2000),
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    status VARCHAR(24) NOT NULL DEFAULT 'closed' CHECK (status IN ('closed')),
    closed_by UUID REFERENCES users(id),
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_accounting_accounts_company ON accounting_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_entries_company ON accounting_journal_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_lines_entry ON accounting_journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_accounting_payments_company ON accounting_payments(company_id);
