BEGIN;

ALTER TABLE companies
    ADD COLUMN quotation_validity_days INTEGER NOT NULL DEFAULT 0
    CHECK (quotation_validity_days BETWEEN 0 AND 3650);

COMMIT;
