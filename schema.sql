CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS patients (
    patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    sex VARCHAR(20) NOT NULL CHECK (sex IN ('Male', 'Female', 'Other', 'Decline to Answer')),
    phone_number VARCHAR(10) NOT NULL,
    address_line_1 VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state CHAR(2) NOT NULL,
    zip_code VARCHAR(10) NOT NULL,
    email VARCHAR(255),
    insurance_provider VARCHAR(255),
    insurance_member_id VARCHAR(100),
    preferred_language VARCHAR(100) NOT NULL DEFAULT 'English',
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_patients_last_name
    ON patients (LOWER(last_name));

CREATE INDEX IF NOT EXISTS idx_patients_date_of_birth
    ON patients (date_of_birth);

CREATE INDEX IF NOT EXISTS idx_patients_phone_number
    ON patients (phone_number);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patients_updated_at ON patients;

CREATE TRIGGER patients_updated_at
BEFORE UPDATE ON patients
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();