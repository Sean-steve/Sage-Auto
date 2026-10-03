-- ============================================================================
-- CAR HIRE OS — SPRINT 19 MIGRATION: OPERATIONAL FINANCE BOUNDED CONTEXT
-- Migration: 20260904_007_operational_finance.sql
-- Invoicing, Line Items, Credit Notes, Expenses, Deposits & Refund Obligations
-- Strict NUMERIC(19,4) Decimal Standard, Immutable Documents & Tenant Isolation
-- ============================================================================

-- 1. Operational Invoices Table
CREATE TABLE IF NOT EXISTS operational_invoices (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_number VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  corporate_account_id VARCHAR(64) REFERENCES corporate_accounts(id) ON DELETE RESTRICT,
  rental_id VARCHAR(64) REFERENCES rentals(id) ON DELETE RESTRICT,
  booking_id VARCHAR(64) REFERENCES bookings(id) ON DELETE RESTRICT,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (
    status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOIDED')
  ),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  discount_total NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  tax_total NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  amount_paid NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  amount_credited NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  amount_outstanding NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  notes TEXT,
  billing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_invoice_number UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_operational_invoices_tenant ON operational_invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_operational_invoices_customer ON operational_invoices (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_operational_invoices_corp ON operational_invoices (tenant_id, corporate_account_id);
CREATE INDEX IF NOT EXISTS idx_operational_invoices_rental ON operational_invoices (tenant_id, rental_id);
CREATE INDEX IF NOT EXISTS idx_operational_invoices_status ON operational_invoices (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_operational_invoices_due ON operational_invoices (tenant_id, due_date);

-- 2. Operational Invoice Line Items Table
CREATE TABLE IF NOT EXISTS operational_invoice_lines (
  id VARCHAR(64) PRIMARY KEY,
  invoice_id VARCHAR(64) NOT NULL REFERENCES operational_invoices(id) ON DELETE CASCADE,
  line_type VARCHAR(64) NOT NULL CHECK (
    line_type IN (
      'RENTAL_BASE', 'RENTAL_EXTENSION', 'EXCESS_MILEAGE', 'FUEL_DEFICIT',
      'REFUELING_FEE', 'LATE_RETURN', 'DAMAGE_CHARGE', 'CLEANING_FEE',
      'TOLL_CHARGE', 'TRAFFIC_FINE', 'DELIVERY_COLLECTION', 'CUSTOM_FEE', 'DISCOUNT'
    )
  ),
  description VARCHAR(500) NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL DEFAULT 1.0000,
  unit_price NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  net_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  tax_rate NUMERIC(7, 4) NOT NULL DEFAULT 0.1600,
  tax_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  gross_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  source_type VARCHAR(64),
  source_id VARCHAR(64),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_operational_invoice_lines_invoice ON operational_invoice_lines (invoice_id);

-- 3. Invoice Status History Table
CREATE TABLE IF NOT EXISTS operational_invoice_status_history (
  id VARCHAR(64) PRIMARY KEY,
  invoice_id VARCHAR(64) NOT NULL REFERENCES operational_invoices(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  actor_user_id VARCHAR(64) NOT NULL,
  reason TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_op_inv_history_invoice ON operational_invoice_status_history (invoice_id);

-- 4. Credit Notes Table
CREATE TABLE IF NOT EXISTS credit_notes (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  credit_note_number VARCHAR(64) NOT NULL,
  invoice_id VARCHAR(64) NOT NULL REFERENCES operational_invoices(id) ON DELETE RESTRICT,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  rental_id VARCHAR(64) REFERENCES rentals(id) ON DELETE RESTRICT,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'VOIDED')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  subtotal NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  tax_total NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  total NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  issued_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_credit_note_number UNIQUE (tenant_id, credit_note_number)
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_tenant ON credit_notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON credit_notes (tenant_id, customer_id);

-- 5. Credit Note Line Items Table
CREATE TABLE IF NOT EXISTS credit_note_lines (
  id VARCHAR(64) PRIMARY KEY,
  credit_note_id VARCHAR(64) NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  invoice_line_id VARCHAR(64) REFERENCES operational_invoice_lines(id) ON DELETE SET NULL,
  description VARCHAR(500) NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL DEFAULT 1.0000,
  unit_price NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  net_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  tax_rate NUMERIC(7, 4) NOT NULL DEFAULT 0.1600,
  tax_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  gross_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000
);

CREATE INDEX IF NOT EXISTS idx_credit_note_lines_credit_note ON credit_note_lines (credit_note_id);

-- 6. Expense Categories Table
CREATE TABLE IF NOT EXISTS expense_categories (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_tax_deductible BOOLEAN NOT NULL DEFAULT TRUE,
  requires_vehicle_attribution BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_expense_category UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant ON expense_categories (tenant_id);

-- 7. Operational Expenses Table
CREATE TABLE IF NOT EXISTS operational_expenses (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  expense_number VARCHAR(64) NOT NULL,
  category VARCHAR(64) NOT NULL CHECK (
    category IN ('MAINTENANCE', 'FUEL', 'CLEANING', 'PARKING', 'TOLL', 'INSURANCE', 'LICENSING', 'OFFICE', 'DRIVER', 'MARKETING', 'OTHER')
  ),
  category_id VARCHAR(64) REFERENCES expense_categories(id) ON DELETE RESTRICT,
  vehicle_id VARCHAR(64) REFERENCES vehicles(id) ON DELETE RESTRICT,
  rental_id VARCHAR(64) REFERENCES rentals(id) ON DELETE RESTRICT,
  maintenance_id VARCHAR(64) REFERENCES maintenance_work_orders(id) ON DELETE RESTRICT,
  vehicle_owner_id VARCHAR(64) REFERENCES vehicle_owners(id) ON DELETE RESTRICT,
  supplier_id VARCHAR(64),
  payee_name VARCHAR(255),
  description TEXT NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  net_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  tax_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  gross_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (
    status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'VOIDED')
  ),
  receipt_file_reference VARCHAR(500),
  notes TEXT,
  owner_deductible BOOLEAN NOT NULL DEFAULT FALSE,
  created_by VARCHAR(64) NOT NULL,
  approved_by VARCHAR(64),
  approved_at TIMESTAMPTZ,
  rejected_by VARCHAR(64),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_expense_number UNIQUE (tenant_id, expense_number)
);

CREATE INDEX IF NOT EXISTS idx_operational_expenses_tenant ON operational_expenses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_operational_expenses_vehicle ON operational_expenses (tenant_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_operational_expenses_maint ON operational_expenses (tenant_id, maintenance_id);
CREATE INDEX IF NOT EXISTS idx_operational_expenses_owner ON operational_expenses (tenant_id, vehicle_owner_id);
CREATE INDEX IF NOT EXISTS idx_operational_expenses_status ON operational_expenses (tenant_id, status);

-- 8. Deposit Positions Table (Liabilities / Balance Tracking)
CREATE TABLE IF NOT EXISTS deposit_positions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  rental_id VARCHAR(64) NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
  booking_id VARCHAR(64) REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  required_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  received_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  held_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  applied_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  refund_due_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  refunded_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  forfeited_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(32) NOT NULL DEFAULT 'HELD' CHECK (
    status IN ('HELD', 'APPLIED', 'PARTIALLY_REFUNDED', 'REFUND_DUE', 'REFUNDED', 'FORFEITED')
  ),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_rental_deposit UNIQUE (tenant_id, rental_id)
);

CREATE INDEX IF NOT EXISTS idx_deposit_positions_tenant ON deposit_positions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_deposit_positions_rental ON deposit_positions (tenant_id, rental_id);
CREATE INDEX IF NOT EXISTS idx_deposit_positions_customer ON deposit_positions (tenant_id, customer_id);

-- 9. Refund Obligations Table
CREATE TABLE IF NOT EXISTS refund_obligations (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  rental_id VARCHAR(64) REFERENCES rentals(id) ON DELETE RESTRICT,
  invoice_id VARCHAR(64) REFERENCES operational_invoices(id) ON DELETE RESTRICT,
  deposit_position_id VARCHAR(64) REFERENCES deposit_positions(id) ON DELETE RESTRICT,
  customer_id VARCHAR(64) NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'CANCELLED')
  ),
  approved_by VARCHAR(64),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  external_reference VARCHAR(255),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_obligations_tenant ON refund_obligations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_refund_obligations_customer ON refund_obligations (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_refund_obligations_deposit ON refund_obligations (tenant_id, deposit_position_id);

-- 10. Financial Adjustments Table
CREATE TABLE IF NOT EXISTS financial_adjustments (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  invoice_id VARCHAR(64) NOT NULL REFERENCES operational_invoices(id) ON DELETE RESTRICT,
  type VARCHAR(32) NOT NULL CHECK (type IN ('DEBIT_ADJUSTMENT', 'WRITE_OFF', 'DISPUTE_HOLD')),
  amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  reason TEXT NOT NULL,
  approved_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_adjustments_invoice ON financial_adjustments (tenant_id, invoice_id);

-- 11. Row Level Security Policies
ALTER TABLE operational_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_invoice_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_operational_invoices ON operational_invoices
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_credit_notes ON credit_notes
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_expense_categories ON expense_categories
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_operational_expenses ON operational_expenses
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_deposit_positions ON deposit_positions
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_refund_obligations ON refund_obligations
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_financial_adjustments ON financial_adjustments
  FOR ALL USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));
