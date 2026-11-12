BEGIN;

CREATE TABLE IF NOT EXISTS assistant_service_types (
    code VARCHAR(32) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    monthly_tokens INTEGER NOT NULL CHECK (monthly_tokens BETWEEN 1 AND 1000000000),
    max_output_tokens INTEGER NOT NULL CHECK (max_output_tokens BETWEEN 128 AND 4096),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);
INSERT INTO assistant_service_types(code,name,monthly_tokens,max_output_tokens)
VALUES ('standard','Asistente estándar',100000,1024),('premium','Asistente premium',500000,2048)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS assistant_user_services (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    service_code VARCHAR(32) NOT NULL REFERENCES assistant_service_types(code),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_by UUID NOT NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS assistant_provider_configs (
    company_id UUID PRIMARY KEY REFERENCES companies(id),
    provider VARCHAR(16) NOT NULL DEFAULT 'deepseek' CHECK (provider='deepseek'),
    model VARCHAR(32) NOT NULL DEFAULT 'deepseek-flash'
        CHECK (model IN ('deepseek-flash','deepseek-v4-pro')),
    encrypted_api_key TEXT,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_by UUID NOT NULL REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (NOT enabled OR encrypted_api_key IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS assistant_monthly_usage (
    company_id UUID NOT NULL REFERENCES companies(id),
    month_start DATE NOT NULL CHECK (EXTRACT(DAY FROM month_start)=1),
    prompt_tokens BIGINT NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
    completion_tokens BIGINT NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
    reserved_tokens BIGINT NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
    PRIMARY KEY(company_id,month_start)
);
CREATE TABLE IF NOT EXISTS assistant_requests (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id),
    user_id UUID NOT NULL REFERENCES users(id),
    month_start DATE NOT NULL,
    model VARCHAR(32) NOT NULL,
    reserved_tokens INTEGER NOT NULL CHECK (reserved_tokens > 0),
    prompt_tokens INTEGER CHECK (prompt_tokens >= 0),
    completion_tokens INTEGER CHECK (completion_tokens >= 0),
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','succeeded','failed','uncertain')),
    failure_code VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    FOREIGN KEY(company_id,month_start) REFERENCES assistant_monthly_usage(company_id,month_start),
    CHECK ((prompt_tokens IS NULL)=(completion_tokens IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_assistant_requests_usage
    ON assistant_requests(company_id,month_start,status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_user_pending
    ON assistant_requests(user_id) WHERE status='pending';

CREATE TABLE IF NOT EXISTS assistant_token_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    month_start DATE NOT NULL CHECK (EXTRACT(DAY FROM month_start)=1),
    tokens INTEGER NOT NULL CHECK (tokens BETWEEN 1 AND 1000000000),
    reference VARCHAR(120) NOT NULL,
    paid_amount NUMERIC(18,4) NOT NULL CHECK (paid_amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency='USD'),
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id,reference)
);

COMMIT;
