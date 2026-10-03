-- ============================================================================
-- CAR HIRE OS — SPRINT 9 MIGRATION: FLEET & VEHICLE OWNER BOUNDED CONTEXTS
-- Migration: 20260828_004_fleet_and_vehicle_owners.sql
-- ============================================================================

-- 1. Vehicle Categories
CREATE TABLE IF NOT EXISTS vehicle_categories (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  icon VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vehicle_categories_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_categories_tenant ON vehicle_categories (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_categories_status ON vehicle_categories (status);

-- 2. Vehicle Owners (Asset Investors & Fleet Partners)
CREATE TABLE IF NOT EXISTS vehicle_owners (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  owner_type VARCHAR(32) NOT NULL DEFAULT 'INDIVIDUAL' CHECK (owner_type IN ('INDIVIDUAL', 'COMPANY')),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  id_or_passport_number VARCHAR(64),
  tax_pin_number VARCHAR(64),
  payout_bank VARCHAR(128),
  payout_account_number VARCHAR(128),
  payout_mpesa_number VARCHAR(64),
  ownership_type VARCHAR(64) NOT NULL DEFAULT 'INDIVIDUAL',
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_owners_tenant_status ON vehicle_owners (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicle_owners_tenant_email ON vehicle_owners (tenant_id, email);

-- 3. Vehicles (Physical Managed Fleet Assets)
CREATE TABLE IF NOT EXISTS vehicles (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  registration_plate VARCHAR(64) NOT NULL,
  vin VARCHAR(128),
  make VARCHAR(64) NOT NULL,
  model VARCHAR(64) NOT NULL,
  year INTEGER NOT NULL,
  category_id VARCHAR(64) REFERENCES vehicle_categories(id) ON DELETE SET NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'SUV',
  color VARCHAR(64),
  transmission VARCHAR(32) NOT NULL DEFAULT 'Automatic',
  seats INTEGER NOT NULL DEFAULT 5,
  fuel_type VARCHAR(32) NOT NULL DEFAULT 'Petrol',
  odometer INTEGER NOT NULL DEFAULT 0,
  fuel_level INTEGER NOT NULL DEFAULT 100,
  daily_rate NUMERIC(19, 4) NOT NULL DEFAULT 0,
  excess_km_rate NUMERIC(19, 4) NOT NULL DEFAULT 0,
  allowed_daily_km INTEGER NOT NULL DEFAULT 250,
  lifecycle_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_status IN ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'SOLD', 'RETIRED', 'OPERATIONAL')),
  availability_status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE' CHECK (availability_status IN ('AVAILABLE', 'RESERVED', 'ON_RENT', 'MAINTENANCE', 'BLOCKED')),
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_url TEXT,
  current_location VARCHAR(255),
  is_published_to_website BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_driver_id VARCHAR(64),
  owner_id VARCHAR(64) REFERENCES vehicle_owners(id) ON DELETE SET NULL,
  active_ownership_id VARCHAR(64),
  insurance_expiry_date TIMESTAMPTZ,
  inspection_expiry_date TIMESTAMPTZ,
  last_service_mileage INTEGER,
  next_service_mileage INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vehicles_tenant_plate UNIQUE (tenant_id, registration_plate)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_lifecycle ON vehicles (tenant_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_availability ON vehicles (tenant_id, availability_status);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_category ON vehicles (tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_owner ON vehicles (tenant_id, owner_id);

-- 4. Vehicle Ownerships (Historical Lineage and Commercial Revenue-Share Agreements)
CREATE TABLE IF NOT EXISTS vehicle_ownerships (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  owner_id VARCHAR(64) NOT NULL REFERENCES vehicle_owners(id) ON DELETE CASCADE,
  ownership_type VARCHAR(64) NOT NULL CHECK (ownership_type IN ('COMPANY_OWNED', 'THIRD_PARTY_OWNED', 'LEASED', 'MANAGED', 'PARTNERSHIP', 'COMPANY', 'INDIVIDUAL')),
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  revenue_share_percent NUMERIC(7, 4) NOT NULL DEFAULT 75.0000,
  fixed_monthly_payout NUMERIC(19, 4),
  allowable_expense_deductions BOOLEAN NOT NULL DEFAULT TRUE,
  terms_snapshot TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_ownerships_tenant_vehicle ON vehicle_ownerships (tenant_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_ownerships_tenant_owner ON vehicle_ownerships (tenant_id, owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_active_ownership ON vehicle_ownerships (tenant_id, vehicle_id) WHERE (is_active = TRUE);

-- 5. Vehicle Documents (Compliance & Insurance Attachments Metadata)
CREATE TABLE IF NOT EXISTS vehicle_documents (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  document_type VARCHAR(64) NOT NULL,
  document_number VARCHAR(128),
  file_id VARCHAR(128),
  file_name VARCHAR(255),
  file_url TEXT,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'REJECTED')),
  verification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_tenant_vehicle ON vehicle_documents (tenant_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_expiry ON vehicle_documents (expires_at);

-- 6. Vehicle Mileage Records (Historical Telemetry & Audit Logs)
CREATE TABLE IF NOT EXISTS vehicle_mileage_records (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  recorded_mileage INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(64) NOT NULL DEFAULT 'MANUAL_AUDIT',
  recorded_by VARCHAR(64),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_mileage_records_vehicle ON vehicle_mileage_records (tenant_id, vehicle_id, recorded_at);

-- 7. Vehicle Fuel Records
CREATE TABLE IF NOT EXISTS vehicle_fuel_records (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  fuel_level_percent INTEGER NOT NULL,
  liters_added NUMERIC(10, 2),
  cost NUMERIC(19, 4),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(64),
  recorded_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_records_vehicle ON vehicle_fuel_records (tenant_id, vehicle_id, recorded_at);

-- 8. Vehicle Status History
CREATE TABLE IF NOT EXISTS vehicle_status_history (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  previous_lifecycle_status VARCHAR(32) NOT NULL,
  new_lifecycle_status VARCHAR(32) NOT NULL,
  previous_availability_status VARCHAR(32) NOT NULL,
  new_availability_status VARCHAR(32) NOT NULL,
  reason TEXT,
  actor_id VARCHAR(64),
  actor_name VARCHAR(255),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_status_history_vehicle ON vehicle_status_history (tenant_id, vehicle_id, timestamp);

-- 9. Row Level Security Policies
ALTER TABLE vehicle_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_ownerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_mileage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_fuel_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_status_history ENABLE ROW LEVEL SECURITY;
