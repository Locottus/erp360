BEGIN;

CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    code VARCHAR(32) NOT NULL,
    bank_name VARCHAR(128) NOT NULL,
    iban VARCHAR(64),
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS bank_account_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
    statement_reference VARCHAR(64) NOT NULL,
    statement_date DATE NOT NULL,
    opening_balance NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
    closing_balance NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (closing_balance >= 0),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, bank_account_id, statement_reference)
);

CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES bank_account_statements(id) ON DELETE CASCADE,
    line_type VARCHAR(16) NOT NULL CHECK (line_type IN ('debit', 'credit')),
    reference VARCHAR(64) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    booked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    counterpart_reference VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (statement_id, reference)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_company ON bank_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_account_statements_company ON bank_account_statements(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_statement ON bank_statement_lines(statement_id);

COMMIT;
