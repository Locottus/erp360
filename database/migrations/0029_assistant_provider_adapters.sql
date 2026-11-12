BEGIN;

ALTER TABLE assistant_provider_configs DROP CONSTRAINT IF EXISTS assistant_provider_configs_pkey;
ALTER TABLE assistant_provider_configs DROP CONSTRAINT IF EXISTS assistant_provider_configs_provider_check;
ALTER TABLE assistant_provider_configs DROP CONSTRAINT IF EXISTS assistant_provider_configs_model_check;
ALTER TABLE assistant_provider_configs ADD PRIMARY KEY(company_id,provider);
ALTER TABLE assistant_provider_configs ADD CONSTRAINT assistant_provider_configs_provider_check
    CHECK (provider IN ('deepseek','openai','claude'));
ALTER TABLE assistant_provider_configs ADD CONSTRAINT assistant_provider_configs_model_check CHECK (
    (provider='deepseek' AND model IN ('deepseek-flash','deepseek-v4-pro')) OR
    (provider='openai' AND model IN ('gpt-5.4-mini','gpt-5.4')) OR
    (provider='claude' AND model IN ('claude-haiku-5-5','claude-sonnet-5-5'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_active_provider
    ON assistant_provider_configs(company_id) WHERE enabled=TRUE;
ALTER TABLE assistant_requests ADD COLUMN IF NOT EXISTS provider VARCHAR(16) NOT NULL DEFAULT 'deepseek'
    CHECK (provider IN ('deepseek','openai','claude'));

COMMIT;
