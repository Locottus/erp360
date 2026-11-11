BEGIN;

CREATE TABLE IF NOT EXISTS replenishment_purchase_proposals (
    request_id UUID PRIMARY KEY REFERENCES purchase_requests(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    rule_id UUID NOT NULL REFERENCES inventory_reorder_rules(id),
    rule_revision INTEGER NOT NULL,
    location_code VARCHAR(32) NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replenishment_proposals_rule
    ON replenishment_purchase_proposals(company_id, rule_id);

COMMIT;
