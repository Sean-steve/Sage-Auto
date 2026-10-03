-- ============================================================================
-- CAR HIRE OS — MIGRATION 20260825_001: INITIAL PERSISTENCE FOUNDATION
-- Adheres to DATA-001, DATA-002, DATA-004, DEV-009
-- ============================================================================

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ----------------------------------------------------------------------------
-- 2. GLOBAL IDENTITY & USERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "email" VARCHAR(255) NOT NULL,
    "normalized_email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50) NULL,
    "avatar_url" VARCHAR(1000) NULL,
    "email_verified_at" TIMESTAMPTZ(6) NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "is_platform_staff" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6) NULL,
    CONSTRAINT "uq_users_email" UNIQUE ("email"),
    CONSTRAINT "uq_users_normalized_email" UNIQUE ("normalized_email")
);

CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users" ("status");
CREATE INDEX IF NOT EXISTS "idx_users_created_at" ON "users" ("created_at");

-- ----------------------------------------------------------------------------
-- 3. TENANTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "tenants" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "default_currency" VARCHAR(10) NOT NULL DEFAULT 'KES',
    "currency_symbol" VARCHAR(10) NOT NULL DEFAULT 'KSh',
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Africa/Nairobi',
    "country_code" VARCHAR(10) NOT NULL DEFAULT 'KE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6) NULL,
    CONSTRAINT "uq_tenants_slug" UNIQUE ("slug")
);

CREATE INDEX IF NOT EXISTS "idx_tenants_status" ON "tenants" ("status");

-- ----------------------------------------------------------------------------
-- 4. TENANT SETTINGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "tenant_settings" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "vat_rate_percent" NUMERIC(7, 4) NOT NULL DEFAULT 16.0000,
    "mpesa_paybill" VARCHAR(50) NULL,
    "mpesa_shortcode" VARCHAR(50) NULL,
    "mpesa_passkey_hash" VARCHAR(255) NULL,
    "mpesa_sandbox" BOOLEAN NOT NULL DEFAULT TRUE,
    "allowed_daily_km" INT NOT NULL DEFAULT 250,
    "excess_km_rate" NUMERIC(19, 4) NOT NULL DEFAULT 25.0000,
    "deposit_default_amount" NUMERIC(19, 4) NOT NULL DEFAULT 25000.0000,
    "cdw_daily_rate" NUMERIC(19, 4) NOT NULL DEFAULT 1500.0000,
    "enable_gps_tracking" BOOLEAN NOT NULL DEFAULT FALSE,
    "require_preauth_deposit" BOOLEAN NOT NULL DEFAULT TRUE,
    "flexible_config" JSONB NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_tenant_settings_tenant_id" UNIQUE ("tenant_id"),
    CONSTRAINT "fk_tenant_settings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 5. TENANT MEMBERSHIPS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "tenant_memberships" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'TENANT_OPERATOR',
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_tenant_memberships_tenant_user" UNIQUE ("tenant_id", "user_id"),
    CONSTRAINT "fk_tenant_memberships_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_tenant_memberships_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_tenant_memberships_tenant_id" ON "tenant_memberships" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_memberships_user_id" ON "tenant_memberships" ("user_id");

-- ----------------------------------------------------------------------------
-- 6. IDEMPOTENCY KEYS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "operation_scope" VARCHAR(100) NOT NULL,
    "request_hash" VARCHAR(255) NOT NULL,
    "response_status" INT NULL,
    "response_body" JSONB NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "uq_idempotency_keys_scope" UNIQUE ("idempotency_key", "operation_scope")
);

CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_tenant_id" ON "idempotency_keys" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_expires_at" ON "idempotency_keys" ("expires_at");

-- ----------------------------------------------------------------------------
-- 7. TRANSACTIONAL OUTBOX TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "outbox_events" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "event_type" VARCHAR(100) NOT NULL,
    "event_version" VARCHAR(20) NOT NULL DEFAULT 'v1',
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" VARCHAR(255) NOT NULL,
    "tenant_id" UUID NULL,
    "actor_id" UUID NULL,
    "correlation_id" VARCHAR(255) NULL,
    "causation_id" VARCHAR(255) NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "attempt_count" INT NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6) NULL,
    "last_error" TEXT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_outbox_events_status_available" ON "outbox_events" ("status", "available_at");
CREATE INDEX IF NOT EXISTS "idx_outbox_events_tenant_id" ON "outbox_events" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_outbox_events_aggregate" ON "outbox_events" ("aggregate_type", "aggregate_id");

-- ----------------------------------------------------------------------------
-- 8. WEBHOOK EVENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "provider" VARCHAR(50) NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(6) NULL,
    "processed_at" TIMESTAMPTZ(6) NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    "attempt_count" INT NOT NULL DEFAULT 0,
    "last_error" TEXT NULL,
    CONSTRAINT "uq_webhook_events_provider_event" UNIQUE ("provider", "provider_event_id")
);

CREATE INDEX IF NOT EXISTS "idx_webhook_events_status_received" ON "webhook_events" ("status", "received_at");

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NULL,
    "actor_type" VARCHAR(50) NOT NULL,
    "actor_id" UUID NULL,
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(255) NOT NULL,
    "request_id" VARCHAR(255) NULL,
    "before_snapshot" JSONB NULL,
    "after_snapshot" JSONB NULL,
    "metadata" JSONB NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_audit_logs_tenant_occurred" ON "audit_logs" ("tenant_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_resource" ON "audit_logs" ("resource_type", "resource_id");

-- ----------------------------------------------------------------------------
-- 10. SYSTEM HEALTH TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "system_health" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "service" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
