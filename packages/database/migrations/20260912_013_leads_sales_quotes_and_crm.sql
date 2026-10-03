-- ============================================================================
-- CAR HIRE OS — MIGRATION 013: LEADS, SALES QUOTES, CRM PIPELINE & COMMERCIAL CONVERSION
-- Sprint 33: Bounded context schema for CRM leads, quotes, versioning, activities, tasks
-- ============================================================================

-- 1. Pipeline Stages
CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    is_won_stage BOOLEAN NOT NULL DEFAULT FALSE,
    is_lost_stage BOOLEAN NOT NULL DEFAULT FALSE,
    color_hex VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
    sla_hours INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crm_pipeline_stage_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_tenant ON crm_pipeline_stages(tenant_id, order_index);

-- 2. CRM Leads
CREATE TABLE IF NOT EXISTS crm_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_number VARCHAR(64) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'INDIVIDUAL',
    status VARCHAR(32) NOT NULL DEFAULT 'NEW',
    stage_id UUID REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL,
    first_name VARCHAR(120),
    last_name VARCHAR(120),
    company_name VARCHAR(255),
    tax_number VARCHAR(64),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(64),
    source VARCHAR(64) NOT NULL DEFAULT 'WEBSITE_ENQUIRY',
    source_details TEXT,
    assigned_user_id UUID,
    estimated_value NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    confidence_score INT NOT NULL DEFAULT 50,
    pickup_date TIMESTAMPTZ,
    return_date TIMESTAMPTZ,
    pickup_location VARCHAR(255),
    return_location VARCHAR(255),
    preferred_vehicle_category_id UUID,
    preferred_vehicle_id UUID,
    converted_customer_id UUID,
    converted_corporate_account_id UUID,
    converted_at TIMESTAMPTZ,
    loss_reason VARCHAR(64),
    loss_notes TEXT,
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crm_leads_tenant_number UNIQUE (tenant_id, lead_number)
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_status ON crm_leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_stage ON crm_leads(tenant_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_email ON crm_leads(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_crm_leads_assigned ON crm_leads(tenant_id, assigned_user_id);

-- 3. Sales Quotes
CREATE TABLE IF NOT EXISTS crm_sales_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    quote_number VARCHAR(64) NOT NULL,
    lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
    customer_id UUID,
    corporate_account_id UUID,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    current_version INT NOT NULL DEFAULT 1,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    valid_until TIMESTAMPTZ NOT NULL,
    pickup_date TIMESTAMPTZ NOT NULL,
    return_date TIMESTAMPTZ NOT NULL,
    pickup_location VARCHAR(255) NOT NULL,
    return_location VARCHAR(255) NOT NULL,
    vehicle_category_id UUID,
    vehicle_id UUID,
    public_token VARCHAR(128) NOT NULL UNIQUE,
    subtotal NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    tax_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    discount_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    deposit_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    grand_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    required_deposit_amount NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    payment_terms TEXT,
    converted_booking_id UUID,
    converted_at TIMESTAMPTZ,
    created_by VARCHAR(128) NOT NULL,
    assigned_user_id UUID,
    customer_notes TEXT,
    internal_notes TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crm_quotes_tenant_number UNIQUE (tenant_id, quote_number)
);

CREATE INDEX IF NOT EXISTS idx_crm_quotes_tenant_status ON crm_sales_quotes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_quotes_tenant_lead ON crm_sales_quotes(tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_quotes_public_token ON crm_sales_quotes(public_token);

-- 4. Quote Versions (Immutable Snapshots)
CREATE TABLE IF NOT EXISTS crm_quote_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    quote_id UUID NOT NULL REFERENCES crm_sales_quotes(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    subtotal NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    tax_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    discount_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    deposit_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    grand_total NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    terms_and_conditions TEXT,
    notes TEXT,
    created_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crm_quote_versions_number UNIQUE (tenant_id, quote_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_crm_quote_versions_lookup ON crm_quote_versions(tenant_id, quote_id);

-- 5. CRM Activities (Immutable Timeline)
CREATE TABLE IF NOT EXISTS crm_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type VARCHAR(32) NOT NULL,
    entity_id UUID NOT NULL,
    type VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    performed_by VARCHAR(128) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_lookup ON crm_activities(tenant_id, entity_type, entity_id, occurred_at DESC);

-- 6. CRM Tasks
CREATE TABLE IF NOT EXISTS crm_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type VARCHAR(32) NOT NULL,
    entity_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    assigned_user_id VARCHAR(128) NOT NULL,
    completed_at TIMESTAMPTZ,
    completed_by VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_lookup ON crm_tasks(tenant_id, assigned_user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_entity ON crm_tasks(tenant_id, entity_type, entity_id);
