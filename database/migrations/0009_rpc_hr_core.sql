CREATE TABLE IF NOT EXISTS hr_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    employee_code VARCHAR(32) NOT NULL,
    full_name VARCHAR(180) NOT NULL,
    email VARCHAR(255),
    job_title VARCHAR(120),
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, employee_code)
);

CREATE TABLE IF NOT EXISTS hr_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    employee_id UUID NOT NULL REFERENCES hr_employees(id),
    check_in_at TIMESTAMPTZ NOT NULL,
    check_out_at TIMESTAMPTZ,
    total_minutes INTEGER CHECK (total_minutes IS NULL OR total_minutes >= 0),
    status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    employee_id UUID NOT NULL REFERENCES hr_employees(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(24) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected')),
    decision_note TEXT,
    decided_by UUID REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_hr_employees_company ON hr_employees(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_company ON hr_attendance(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_company ON hr_leave_requests(company_id);
