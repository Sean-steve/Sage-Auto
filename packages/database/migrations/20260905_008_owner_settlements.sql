-- ============================================================================
-- CAR HIRE OS — SPRINT 21 MIGRATION: VEHICLE OWNER SETTLEMENTS BOUNDED CONTEXT
-- Migration: 20260905_008_owner_settlements.sql
-- Owner Settlement Periods, Calculation Batches, Statements, Deductions,
-- Historical Term Snapshots, Approval/Dispute Workflows, and Payable Obligations
-- Strict NUMERIC(19,4) Money Standard, Immutable Snapshots & Row Level Security
-- ============================================================================

-- 1. Owner Settlement Periods Table
CREATE TABLE IF NOT EXISTS owner_settlement_periods (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  period_number VARCHAR(64) NOT NULL,
  period_type VARCHAR(32) NOT NULL DEFAULT 'MONTHLY' CHECK (period_type IN ('WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'CUSTOM')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLING', 'CLOSED', 'LOCKED')),
  description TEXT,
  settlement_count INTEGER NOT NULL DEFAULT 0,
  total_gross_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_owner_payout NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_operator_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_deductions NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  closed_at TIMESTAMPTZ,
  closed_by VARCHAR(64),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_period_number UNIQUE (tenant_id, period_number),
  CONSTRAINT chk_period_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_owner_settlement_periods_tenant ON owner_settlement_periods (tenant_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlement_periods_status ON owner_settlement_periods (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_owner_settlement_periods_dates ON owner_settlement_periods (tenant_id, start_date, end_date);

-- 2. Owner Settlement Batches Table
CREATE TABLE IF NOT EXISTS owner_settlement_batches (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  batch_number VARCHAR(64) NOT NULL,
  period_id VARCHAR(64) NOT NULL REFERENCES owner_settlement_periods(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  idempotency_key VARCHAR(128) NOT NULL,
  total_settlements INTEGER NOT NULL DEFAULT 0,
  total_eligible_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_owner_share NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_operator_share NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_deductions NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_net_payout NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  initiated_by VARCHAR(64) NOT NULL,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_batch_number UNIQUE (tenant_id, batch_number),
  CONSTRAINT uq_tenant_batch_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_owner_settlement_batches_tenant ON owner_settlement_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlement_batches_period ON owner_settlement_batches (tenant_id, period_id);

-- 3. Owner Settlements Table
CREATE TABLE IF NOT EXISTS owner_settlements (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  settlement_number VARCHAR(64) NOT NULL,
  owner_id VARCHAR(64) NOT NULL REFERENCES vehicle_owners(id) ON DELETE RESTRICT,
  period_id VARCHAR(64) REFERENCES owner_settlement_periods(id) ON DELETE RESTRICT,
  batch_id VARCHAR(64) REFERENCES owner_settlement_batches(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'CALCULATED', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'DISPUTED')
  ),
  -- Financial Aggregates (NUMERIC 19,4)
  total_eligible_rental_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_excluded_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  gross_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  owner_gross_revenue_share NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  operator_gross_revenue_share NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_owner_borne_expenses NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_shared_expenses NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_deductions NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_adjustments NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  net_payout_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  operator_net_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  carried_forward_balance NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  -- Commercial Terms Snapshot (Immutable truth frozen at calculation time)
  terms_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Workflow & Audit Metadata
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculated_by VARCHAR(64) NOT NULL,
  approved_at TIMESTAMPTZ,
  approved_by VARCHAR(64),
  disputed_at TIMESTAMPTZ,
  disputed_by VARCHAR(64),
  dispute_reason TEXT,
  dispute_resolved_at TIMESTAMPTZ,
  dispute_resolution_notes TEXT,
  payment_pending_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payout_reference VARCHAR(255),
  payout_method VARCHAR(64),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_settlement_number UNIQUE (tenant_id, settlement_number),
  CONSTRAINT uq_tenant_owner_period UNIQUE (tenant_id, owner_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_owner_settlements_tenant ON owner_settlements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlements_owner ON owner_settlements (tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlements_status ON owner_settlements (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_owner_settlements_period ON owner_settlements (tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlements_batch ON owner_settlements (tenant_id, batch_id);

-- 4. Owner Settlement Rental Lines Table
CREATE TABLE IF NOT EXISTS owner_settlement_rental_lines (
  id VARCHAR(64) PRIMARY KEY,
  settlement_id VARCHAR(64) NOT NULL REFERENCES owner_settlements(id) ON DELETE CASCADE,
  rental_id VARCHAR(64) NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
  contract_id VARCHAR(64),
  booking_id VARCHAR(64),
  vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  vehicle_plate VARCHAR(64) NOT NULL,
  rental_number VARCHAR(64) NOT NULL,
  rental_start_date TIMESTAMPTZ NOT NULL,
  rental_end_date TIMESTAMPTZ NOT NULL,
  eligible_days INTEGER NOT NULL DEFAULT 1,
  base_rental_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  excess_mileage_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total_rental_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  non_shareable_revenue NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  ownership_id VARCHAR(64) NOT NULL REFERENCES vehicle_ownerships(id) ON DELETE RESTRICT,
  revenue_share_percent NUMERIC(7, 4) NOT NULL,
  owner_share_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  operator_share_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_owner_settlement_rental_lines_settlement ON owner_settlement_rental_lines (settlement_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlement_rental_lines_rental ON owner_settlement_rental_lines (rental_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlement_rental_lines_vehicle ON owner_settlement_rental_lines (vehicle_id);

-- 5. Owner Settlement Expense Lines Table
CREATE TABLE IF NOT EXISTS owner_settlement_expense_lines (
  id VARCHAR(64) PRIMARY KEY,
  settlement_id VARCHAR(64) NOT NULL REFERENCES owner_settlements(id) ON DELETE CASCADE,
  expense_id VARCHAR(64) NOT NULL REFERENCES operational_expenses(id) ON DELETE RESTRICT,
  maintenance_id VARCHAR(64) REFERENCES maintenance_work_orders(id) ON DELETE RESTRICT,
  vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  vehicle_plate VARCHAR(64) NOT NULL,
  category VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  expense_date DATE NOT NULL,
  gross_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  allocation_type VARCHAR(32) NOT NULL CHECK (allocation_type IN ('OWNER_BORNE', 'OPERATOR_BORNE', 'SHARED')),
  owner_share_percent NUMERIC(7, 4) NOT NULL DEFAULT 100.0000,
  owner_deduction_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  operator_borne_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_owner_settlement_expense_lines_settlement ON owner_settlement_expense_lines (settlement_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlement_expense_lines_expense ON owner_settlement_expense_lines (expense_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlement_expense_lines_vehicle ON owner_settlement_expense_lines (vehicle_id);

-- 6. Owner Settlement Adjustment Lines Table
CREATE TABLE IF NOT EXISTS owner_settlement_adjustment_lines (
  id VARCHAR(64) PRIMARY KEY,
  settlement_id VARCHAR(64) NOT NULL REFERENCES owner_settlements(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL CHECK (type IN ('CREDIT_ADJUSTMENT', 'DEBIT_ADJUSTMENT', 'DISPUTE_SETTLEMENT', 'CARRYOVER_DEDUCTION', 'HOLD')),
  amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  reason TEXT NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_settlement_adjustment_lines_settlement ON owner_settlement_adjustment_lines (settlement_id);

-- 7. Owner Settlement Payable Obligations Table (Integration Boundary)
CREATE TABLE IF NOT EXISTS owner_settlement_payables (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  settlement_id VARCHAR(64) NOT NULL REFERENCES owner_settlements(id) ON DELETE RESTRICT,
  owner_id VARCHAR(64) NOT NULL REFERENCES vehicle_owners(id) ON DELETE RESTRICT,
  payable_number VARCHAR(64) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  recipient_name VARCHAR(255) NOT NULL,
  payout_method VARCHAR(64) NOT NULL DEFAULT 'BANK_TRANSFER' CHECK (
    payout_method IN ('BANK_TRANSFER', 'MPESA_PAYBILL', 'MPESA_B2C', 'MANUAL_CHECK', 'INTERNAL_TRANSFER')
  ),
  destination_bank VARCHAR(128),
  destination_account VARCHAR(128),
  destination_mpesa_number VARCHAR(64),
  tax_withholding_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  net_disbursement_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'QUEUED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED')
  ),
  external_payout_reference VARCHAR(255),
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  payout_initiated_at TIMESTAMPTZ,
  payout_completed_at TIMESTAMPTZ,
  created_by VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_payable_number UNIQUE (tenant_id, payable_number),
  CONSTRAINT uq_tenant_settlement_payable UNIQUE (tenant_id, settlement_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_settlement_payables_tenant ON owner_settlement_payables (tenant_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlement_payables_owner ON owner_settlement_payables (tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_settlement_payables_status ON owner_settlement_payables (tenant_id, status);

-- 8. Row Level Security Policies (Strict Tenant Isolation)
ALTER TABLE owner_settlement_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_settlement_rental_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_settlement_expense_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_settlement_adjustment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_settlement_payables ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_owner_settlement_periods ON owner_settlement_periods
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_owner_settlement_batches ON owner_settlement_batches
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_owner_settlements ON owner_settlements
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_owner_settlement_payables ON owner_settlement_payables
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));
