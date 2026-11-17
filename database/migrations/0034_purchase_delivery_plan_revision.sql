BEGIN;

ALTER TABLE purchase_requests
    ADD COLUMN delivery_plan_revision INTEGER NOT NULL DEFAULT 0
    CHECK (delivery_plan_revision >= 0);

ALTER TABLE purchase_orders
    ADD COLUMN delivery_plan_revision INTEGER NOT NULL DEFAULT 0
    CHECK (delivery_plan_revision >= 0);

COMMIT;
