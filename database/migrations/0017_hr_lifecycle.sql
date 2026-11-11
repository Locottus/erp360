BEGIN;
ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS hr_attendance_one_open
  ON hr_attendance(company_id,employee_id) WHERE status='open';
COMMIT;
