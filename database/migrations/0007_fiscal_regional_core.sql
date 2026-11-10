CREATE TABLE IF NOT EXISTS fiscal_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    country_code VARCHAR(2) NOT NULL CHECK (country_code IN ('GT', 'SV', 'DO')),
    provider_code VARCHAR(64) NOT NULL,
    environment VARCHAR(16) NOT NULL CHECK (environment IN ('sandbox', 'production')),
    endpoint_url TEXT NOT NULL,
    credentials_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, country_code)
);

CREATE TABLE IF NOT EXISTS fiscal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    sales_invoice_id UUID NOT NULL REFERENCES sales_invoices(id),
    country_code VARCHAR(2) NOT NULL CHECK (country_code IN ('GT', 'SV', 'DO')),
    provider_code VARCHAR(64) NOT NULL,
    document_type VARCHAR(32) NOT NULL DEFAULT 'invoice',
    series_number VARCHAR(32),
    control_number VARCHAR(64),
    external_uuid VARCHAR(128),
    status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected', 'error')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    provider_response JSONB,
    last_error TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, sales_invoice_id, country_code)
);

CREATE TABLE IF NOT EXISTS fiscal_transmissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_document_id UUID NOT NULL REFERENCES fiscal_documents(id) ON DELETE CASCADE,
    attempt_no INTEGER NOT NULL CHECK (attempt_no >= 1),
    status VARCHAR(24) NOT NULL CHECK (status IN ('submitted', 'accepted', 'rejected', 'error')),
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB,
    error_message TEXT,
    transmitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (fiscal_document_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_provider_configs_company ON fiscal_provider_configs(company_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_company ON fiscal_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_invoice ON fiscal_documents(sales_invoice_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_transmissions_document ON fiscal_transmissions(fiscal_document_id);
