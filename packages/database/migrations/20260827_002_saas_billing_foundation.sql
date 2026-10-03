-- ============================================================================
-- CAR HIRE OS — SPRINT 6 MIGRATION: SAAS BILLING & CONTROL PLANE FOUNDATION
-- Migration: 20260827_002_saas_billing_foundation.sql
-- ============================================================================

-- 1. Plans Table
CREATE TABLE IF NOT EXISTS saas_plans (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  price NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  monthly_price NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  annual_price NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  billing_interval VARCHAR(32) NOT NULL DEFAULT 'MONTHLY' CHECK (billing_interval IN ('MONTHLY', 'YEARLY', 'ANNUAL')),
  trial_duration_days INTEGER NOT NULL DEFAULT 14,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  max_vehicles INTEGER NOT NULL DEFAULT 10,
  max_members INTEGER NOT NULL DEFAULT 5,
  allow_custom_domain BOOLEAN NOT NULL DEFAULT FALSE,
  allow_double_entry_ledger BOOLEAN NOT NULL DEFAULT FALSE,
  allow_owner_settlements BOOLEAN NOT NULL DEFAULT FALSE,
  allow_public_website BOOLEAN NOT NULL DEFAULT TRUE,
  allow_mpesa_daraja BOOLEAN NOT NULL DEFAULT TRUE,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_plans_code ON saas_plans (code);
CREATE INDEX IF NOT EXISTS idx_saas_plans_status ON saas_plans (status);

-- 2. Subscriptions Table
CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_id VARCHAR(64) NOT NULL REFERENCES saas_plans(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'TRIAL' CHECK (
    status IN ('TRIAL', 'ACTIVE', 'RENEWAL_DUE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED', 'EXPIRED')
  ),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  renewal_due_at TIMESTAMPTZ,
  grace_ends_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  billing_interval VARCHAR(32) NOT NULL DEFAULT 'MONTHLY' CHECK (billing_interval IN ('MONTHLY', 'YEARLY', 'ANNUAL')),
  amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_tenant_id ON saas_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_status ON saas_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_current_period_end ON saas_subscriptions (current_period_end);

-- 3. Subscription Status History (Audit Log of Transitions)
CREATE TABLE IF NOT EXISTS saas_subscription_status_history (
  id VARCHAR(64) PRIMARY KEY,
  subscription_id VARCHAR(64) NOT NULL REFERENCES saas_subscriptions(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  previous_status VARCHAR(32),
  new_status VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  actor_type VARCHAR(32) NOT NULL CHECK (actor_type IN ('PLATFORM_STAFF', 'USER', 'SYSTEM')),
  actor_id VARCHAR(64),
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_sub_hist_sub_id ON saas_subscription_status_history (subscription_id);
CREATE INDEX IF NOT EXISTS idx_saas_sub_hist_tenant_id ON saas_subscription_status_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_sub_hist_occurred_at ON saas_subscription_status_history (occurred_at);

-- 4. SaaS Billing Accounts
CREATE TABLE IF NOT EXISTS saas_billing_accounts (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
  billing_email VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  tax_number VARCHAR(64),
  billing_address JSONB,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_billing_accounts_tenant_id ON saas_billing_accounts (tenant_id);

-- 5. SaaS Billing Invoices
CREATE TABLE IF NOT EXISTS saas_billing_invoices (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  billing_account_id VARCHAR(64) REFERENCES saas_billing_accounts(id),
  subscription_id VARCHAR(64) REFERENCES saas_subscriptions(id),
  invoice_number VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (
    status IN ('DRAFT', 'OPEN', 'ISSUED', 'PAID', 'OVERDUE', 'VOID', 'UNCOLLECTIBLE')
  ),
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  subtotal NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  tax NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  discount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  amount_paid NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  amount_due NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  billing_period_start TIMESTAMPTZ,
  billing_period_end TIMESTAMPTZ,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_billing_inv_tenant_id ON saas_billing_invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_billing_inv_status ON saas_billing_invoices (status);
CREATE INDEX IF NOT EXISTS idx_saas_billing_inv_due_at ON saas_billing_invoices (due_at);

-- 6. SaaS Billing Invoice Items
CREATE TABLE IF NOT EXISTS saas_billing_invoice_items (
  id VARCHAR(64) PRIMARY KEY,
  invoice_id VARCHAR(64) NOT NULL REFERENCES saas_billing_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(19, 4) NOT NULL DEFAULT 1.0000,
  unit_price NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  reference_type VARCHAR(64),
  reference_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_inv_items_inv_id ON saas_billing_invoice_items (invoice_id);

-- 7. SaaS Payment Records (Immutable Platform Ledger)
CREATE TABLE IF NOT EXISTS saas_payment_records (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_id VARCHAR(64) NOT NULL REFERENCES saas_billing_invoices(id) ON DELETE RESTRICT,
  provider VARCHAR(64) NOT NULL CHECK (
    provider IN ('STRIPE', 'MPESA_DARAJA', 'MANUAL_BANK', 'PESAPAL', 'DEVELOPMENT_MOCK')
  ),
  provider_reference VARCHAR(255) NOT NULL,
  amount NUMERIC(19, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  status VARCHAR(32) NOT NULL DEFAULT 'SUCCEEDED' CHECK (
    status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED')
  ),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by VARCHAR(64),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_payments_tenant_id ON saas_payment_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_payments_invoice_id ON saas_payment_records (invoice_id);
