BEGIN;

ALTER TABLE purchase_requests
    ADD COLUMN destination_location_code VARCHAR(32),
    ADD COLUMN expected_receipt_date DATE;

ALTER TABLE purchase_orders
    ADD COLUMN destination_location_code VARCHAR(32),
    ADD COLUMN expected_receipt_date DATE;

COMMIT;
