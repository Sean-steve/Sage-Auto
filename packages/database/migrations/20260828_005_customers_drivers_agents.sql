-- ============================================================================
-- CAR HIRE OS — SPRINT 10 MIGRATION: CUSTOMERS, CORPORATE ACCOUNTS, DRIVERS & AGENTS
-- Migration: 20260828_005_customers_drivers_agents.sql
-- ============================================================================

-- 1. Corporate Accounts (B2B Credit & Fleet Partner Organizations)
CREATE TABLE IF NOT EXISTS corporate_accounts (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_number VARCHAR(64) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  registration_number VARCHAR(128) NOT NULL,
  tax_pin_number VARCHAR(64),
  contact_person VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  billing_address TEXT,
  credit_limit NUMERIC(19, 4) NOT NULL DEFAULT 0,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  discount_rate_percent NUMERIC(7, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_corporate_accounts_tenant_number UNIQUE (tenant_id, account_number),
  CONSTRAINT uq_corporate_accounts_tenant_reg UNIQUE (tenant_id, registration_number)
);

CREATE INDEX IF NOT EXISTS idx_corporate_accounts_tenant_status ON corporate_accounts (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_corporate_accounts_tenant_email ON corporate_accounts (tenant_id, email);

-- 2. Customers (Individual, VIP & Corporate Affiliated Renters)
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_number VARCHAR(64) NOT NULL,
  customer_type VARCHAR(32) NOT NULL DEFAULT 'INDIVIDUAL' CHECK (customer_type IN ('INDIVIDUAL', 'CORPORATE_AFFILIATED', 'VIP')),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  id_or_passport_number VARCHAR(64) NOT NULL,
  tax_pin_number VARCHAR(64),
  license_number VARCHAR(64) NOT NULL,
  license_expiry_date TIMESTAMPTZ NOT NULL,
  nationality VARCHAR(64),
  address TEXT,
  city VARCHAR(128),
  country VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESTRICTED', 'BLOCKED', 'INACTIVE')),
  verification_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED')),
  corporate_account_id VARCHAR(64) REFERENCES corporate_accounts(id) ON DELETE SET NULL,
  total_rentals_count INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC(3, 2),
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(64),
  emergency_contact_relationship VARCHAR(64),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_customers_tenant_number UNIQUE (tenant_id, customer_number),
  CONSTRAINT uq_customers_tenant_id_passport UNIQUE (tenant_id, id_or_passport_number)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_status ON customers (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_verification ON customers (tenant_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_email ON customers (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_corporate ON customers (tenant_id, corporate_account_id);

-- 3. Commercial & Designated Drivers
CREATE TABLE IF NOT EXISTS drivers (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  driver_number VARCHAR(64) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(64) NOT NULL,
  national_id VARCHAR(64),
  license_number VARCHAR(64) NOT NULL,
  license_classes JSONB NOT NULL DEFAULT '[]'::jsonb,
  license_expiry_date TIMESTAMPTZ NOT NULL,
  badge_number VARCHAR(64),
  medical_expiry_date TIMESTAMPTZ,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED')),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'OFF_DUTY', 'ON_TRIP', 'BLACKLISTED')),
  rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(64),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_drivers_tenant_number UNIQUE (tenant_id, driver_number),
  CONSTRAINT uq_drivers_tenant_license UNIQUE (tenant_id, license_number)
);

CREATE INDEX IF NOT EXISTS idx_drivers_tenant_status ON drivers (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_drivers_tenant_verification ON drivers (tenant_id, verification_status);

-- 4. Authorized Corporate Drivers (Connecting Corporate Accounts to Qualified Drivers / Personnel)
CREATE TABLE IF NOT EXISTS authorized_corporate_drivers (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  corporate_account_id VARCHAR(64) NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  driver_id VARCHAR(64) REFERENCES drivers(id) ON DELETE CASCADE,
  customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE CASCADE,
  role_title VARCHAR(128),
  is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_corp_drivers_tenant_corp ON authorized_corporate_drivers (tenant_id, corporate_account_id);

-- 5. Customer-Driver Relationships (e.g. Assigned Chauffeur / Family Member / Designated Driver)
CREATE TABLE IF NOT EXISTS customer_driver_relationships (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  driver_id VARCHAR(64) NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  relationship_type VARCHAR(64) NOT NULL DEFAULT 'PERSONAL_CHAUFFEUR',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cust_driver_rel_tenant_cust ON customer_driver_relationships (tenant_id, customer_id);

-- 6. Referral Agents & Booking Partners
CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_number VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  agency_name VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NOT NULL,
  commission_type VARCHAR(32) NOT NULL DEFAULT 'PERCENTAGE' CHECK (commission_type IN ('PERCENTAGE', 'FIXED_PER_BOOKING', 'TIERED')),
  commission_rate_percent NUMERIC(7, 4) NOT NULL DEFAULT 10.0000,
  fixed_commission_amount NUMERIC(19, 4),
  payout_bank VARCHAR(128),
  payout_account_number VARCHAR(128),
  payout_mpesa_number VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
  notes TEXT,
  total_referrals_count INTEGER NOT NULL DEFAULT 0,
  total_commission_earned NUMERIC(19, 4) NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_agents_tenant_number UNIQUE (tenant_id, agent_number)
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant_status ON agents (tenant_id, status);

-- 7. Party Documents (KYC & Verification Attachments for Customers, Drivers, Corporate Accounts, Agents)
CREATE TABLE IF NOT EXISTS party_documents (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE CASCADE,
  driver_id VARCHAR(64) REFERENCES drivers(id) ON DELETE CASCADE,
  corporate_account_id VARCHAR(64) REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  agent_id VARCHAR(64) REFERENCES agents(id) ON DELETE CASCADE,
  document_type VARCHAR(64) NOT NULL,
  document_number VARCHAR(128),
  file_id VARCHAR(128),
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'REJECTED')),
  verification_status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  verified_by VARCHAR(64),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_party_docs_tenant_customer ON party_documents (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_party_docs_tenant_driver ON party_documents (tenant_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_party_docs_tenant_corporate ON party_documents (tenant_id, corporate_account_id);

-- 8. Party Status History (Audit of Lifecycle State Changes)
CREATE TABLE IF NOT EXISTS party_status_history (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_type VARCHAR(32) NOT NULL CHECK (party_type IN ('CUSTOMER', 'DRIVER', 'CORPORATE_ACCOUNT', 'AGENT')),
  party_id VARCHAR(64) NOT NULL,
  previous_status VARCHAR(32) NOT NULL,
  new_status VARCHAR(32) NOT NULL,
  reason TEXT,
  actor_id VARCHAR(64),
  actor_name VARCHAR(255),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_party_status_history_party ON party_status_history (tenant_id, party_type, party_id, timestamp);

-- 9. Enable Row Level Security
ALTER TABLE corporate_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE authorized_corporate_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_driver_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_status_history ENABLE ROW LEVEL SECURITY;
