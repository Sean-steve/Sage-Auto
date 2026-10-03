-- ============================================================================
-- SPRINT 12 MIGRATION: AVAILABILITY ENGINE & CONCURRENCY-SAFE VEHICLE ALLOCATION
-- DEV-006, DEV-007, DEV-009, BRS-001
-- ============================================================================

-- 1. Enable btree_gist extension for multi-column scalar + range GiST exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Vehicle Allocations Table (Authoritative Reservation & Allocation Ledger)
CREATE TABLE IF NOT EXISTS vehicle_allocations (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    allocation_type VARCHAR(32) NOT NULL, -- 'BOOKING', 'RENTAL', 'MAINTENANCE', 'MANUAL_BLOCK', 'TEMPORARY_HOLD'
    source_type VARCHAR(64),              -- 'BOOKING', 'RENTAL', 'MAINTENANCE_TICKET', 'MANUAL', etc.
    source_id VARCHAR(64),                -- booking UUID, maintenance UUID, etc.
    status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED', -- 'HELD', 'CONFIRMED', 'ACTIVE', 'RELEASED', 'EXPIRED', 'CANCELLED'
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    buffer_minutes INT NOT NULL DEFAULT 0,
    hold_expires_at TIMESTAMPTZ,
    hold_token VARCHAR(128),
    reason TEXT,
    notes TEXT,
    actor_user_id VARCHAR(64),
    version INT NOT NULL DEFAULT 1,
    released_at TIMESTAMPTZ,
    released_by VARCHAR(64),
    release_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_vehicle_allocation_interval CHECK (ends_at > starts_at),
    CONSTRAINT uq_no_overlapping_vehicle_allocations
        EXCLUDE USING gist (
            tenant_id WITH =,
            vehicle_id WITH =,
            tstzrange(starts_at, ends_at, '[)') WITH &&
        )
        WHERE (status IN ('HELD', 'CONFIRMED', 'ACTIVE'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_allocations_lookup 
    ON vehicle_allocations(tenant_id, vehicle_id, status);

CREATE INDEX IF NOT EXISTS idx_vehicle_allocations_time_range 
    ON vehicle_allocations USING gist (tenant_id, vehicle_id, tstzrange(starts_at, ends_at, '[)'));

CREATE INDEX IF NOT EXISTS idx_vehicle_allocations_source 
    ON vehicle_allocations(tenant_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_allocations_hold_token 
    ON vehicle_allocations(tenant_id, hold_token);

-- 3. Vehicle Availability Blocks (Operational, Maintenance, Impound, Cleaning, Admin blocks)
CREATE TABLE IF NOT EXISTS vehicle_availability_blocks (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    block_type VARCHAR(32) NOT NULL, -- 'MAINTENANCE', 'ACCIDENT', 'IMPOUND', 'COMPLIANCE', 'OPERATIONAL', 'PRIVATE_USE', 'CLEANING', 'ADMINISTRATIVE'
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'RELEASED', 'SCHEDULED'
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    notes TEXT,
    actor_user_id VARCHAR(64),
    released_at TIMESTAMPTZ,
    released_by VARCHAR(64),
    release_reason TEXT,
    allocation_id VARCHAR(64) REFERENCES vehicle_allocations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_vehicle_block_interval CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_blocks_lookup 
    ON vehicle_availability_blocks(tenant_id, vehicle_id, status);

CREATE INDEX IF NOT EXISTS idx_vehicle_blocks_time 
    ON vehicle_availability_blocks(tenant_id, starts_at, ends_at);

-- 4. Temporary Availability Holds Table
CREATE TABLE IF NOT EXISTS availability_holds (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    allocation_id VARCHAR(64) NOT NULL REFERENCES vehicle_allocations(id) ON DELETE CASCADE,
    hold_token VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CONVERTED', 'EXPIRED', 'RELEASED'
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    customer_id VARCHAR(64),
    booking_draft_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_holds_token 
    ON availability_holds(hold_token);

CREATE INDEX IF NOT EXISTS idx_availability_holds_expiry 
    ON availability_holds(tenant_id, status, expires_at);

-- 5. Enable Row-Level Security (RLS) on all availability tables
ALTER TABLE vehicle_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_holds ENABLE ROW LEVEL SECURITY;

-- 6. Define Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_vehicle_allocations ON vehicle_allocations;
CREATE POLICY tenant_isolation_vehicle_allocations ON vehicle_allocations
    USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_vehicle_availability_blocks ON vehicle_availability_blocks;
CREATE POLICY tenant_isolation_vehicle_availability_blocks ON vehicle_availability_blocks
    USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_availability_holds ON availability_holds;
CREATE POLICY tenant_isolation_availability_holds ON availability_holds
    USING (tenant_id = CURRENT_SETTING('app.current_tenant_id', true));
