-- ============================================================================
-- CAR HIRE OS — MIGRATION 011: MEDIA ASSETS, DERIVATIVES & PROCESSING
-- (ARCH-001, DATA-001, DATA-002 §12, SEC-001, DEV-006, DEV-011)
-- ============================================================================

-- 1. Media Assets Aggregate (Domain media reference linked to immutable File)
CREATE TABLE IF NOT EXISTS "media_assets" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "source_file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE RESTRICT,
    "media_type" VARCHAR(50) NOT NULL DEFAULT 'IMAGE',
    "classification" VARCHAR(50) NOT NULL DEFAULT 'PRIVATE',
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "processing_profile" VARCHAR(100) NOT NULL,
    "profile_version" INT NOT NULL DEFAULT 1,
    "dominant_color" VARCHAR(20) NULL,
    "blur_hash" VARCHAR(100) NULL,
    "width" INT NULL,
    "height" INT NULL,
    "exif_stripped" BOOLEAN NOT NULL DEFAULT TRUE,
    "version" INT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6) NULL,
    CONSTRAINT "uq_media_assets_tenant_file_profile" UNIQUE ("tenant_id", "source_file_id", "processing_profile")
);

CREATE INDEX IF NOT EXISTS "idx_media_assets_tenant_status" ON "media_assets" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_media_assets_source_file" ON "media_assets" ("tenant_id", "source_file_id");
CREATE INDEX IF NOT EXISTS "idx_media_assets_profile" ON "media_assets" ("tenant_id", "processing_profile");

-- 2. Media Derivatives (Physical transformed variants: thumbnails, responsive sizes, webp, avif)
CREATE TABLE IF NOT EXISTS "media_derivatives" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "media_asset_id" UUID NOT NULL REFERENCES "media_assets"("id") ON DELETE CASCADE,
    "source_file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE RESTRICT,
    "profile_name" VARCHAR(100) NOT NULL,
    "profile_version" INT NOT NULL DEFAULT 1,
    "variant_name" VARCHAR(100) NOT NULL,
    "format" VARCHAR(20) NOT NULL,
    "width" INT NOT NULL CHECK ("width" > 0),
    "height" INT NOT NULL CHECK ("height" > 0),
    "size_bytes" BIGINT NOT NULL CHECK ("size_bytes" >= 0),
    "object_key" VARCHAR(500) NOT NULL,
    "storage_bucket" VARCHAR(100) NOT NULL,
    "storage_provider" VARCHAR(50) NOT NULL DEFAULT 's3',
    "checksum" VARCHAR(64) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "quality" INT NOT NULL CHECK ("quality" >= 1 AND "quality" <= 100),
    "status" VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
    "is_public" BOOLEAN NOT NULL DEFAULT FALSE,
    "version" INT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMPTZ(6) NULL,
    "superseded_at" TIMESTAMPTZ(6) NULL,
    "deleted_at" TIMESTAMPTZ(6) NULL,
    CONSTRAINT "uq_media_derivatives_unique" UNIQUE ("tenant_id", "source_file_id", "profile_name", "profile_version", "variant_name")
);

CREATE INDEX IF NOT EXISTS "idx_media_derivatives_asset" ON "media_derivatives" ("tenant_id", "media_asset_id");
CREATE INDEX IF NOT EXISTS "idx_media_derivatives_lookup" ON "media_derivatives" ("tenant_id", "profile_name", "variant_name", "status");
CREATE INDEX IF NOT EXISTS "idx_media_derivatives_public" ON "media_derivatives" ("is_public") WHERE "status" = 'AVAILABLE';

-- 3. Media Processing Requests (Lifecycle tracking and asynchronous idempotency)
CREATE TABLE IF NOT EXISTS "media_processing_requests" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "source_file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
    "media_asset_id" UUID NULL REFERENCES "media_assets"("id") ON DELETE SET NULL,
    "profile_name" VARCHAR(100) NOT NULL,
    "profile_version" INT NOT NULL DEFAULT 1,
    "requested_variants" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "attempts" INT NOT NULL DEFAULT 0,
    "max_attempts" INT NOT NULL DEFAULT 3,
    "error_message" TEXT NULL,
    "error_code" VARCHAR(100) NULL,
    "started_at" TIMESTAMPTZ(6) NULL,
    "completed_at" TIMESTAMPTZ(6) NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_media_processing_requests_tenant_status" ON "media_processing_requests" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_media_processing_requests_source" ON "media_processing_requests" ("tenant_id", "source_file_id");

-- 4. Media Storage Reconciliation Issues
CREATE TABLE IF NOT EXISTS "media_reconciliation_issues" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "media_asset_id" UUID NULL REFERENCES "media_assets"("id") ON DELETE CASCADE,
    "media_derivative_id" UUID NULL REFERENCES "media_derivatives"("id") ON DELETE CASCADE,
    "object_key" VARCHAR(500) NOT NULL,
    "issue_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'DETECTED',
    "details" JSONB NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6) NULL
);

CREATE INDEX IF NOT EXISTS "idx_media_recon_tenant_status" ON "media_reconciliation_issues" ("tenant_id", "status");

-- 5. Vehicle Media Join Table (Primary vehicle photo and sorted gallery ordering)
CREATE TABLE IF NOT EXISTS "vehicle_media" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "vehicle_id" UUID NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,
    "media_asset_id" UUID NOT NULL REFERENCES "media_assets"("id") ON DELETE CASCADE,
    "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
    "sort_order" INT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_vehicle_media_asset" UNIQUE ("tenant_id", "vehicle_id", "media_asset_id")
);

CREATE INDEX IF NOT EXISTS "idx_vehicle_media_vehicle" ON "vehicle_media" ("tenant_id", "vehicle_id", "sort_order");
CREATE INDEX IF NOT EXISTS "idx_vehicle_media_primary" ON "vehicle_media" ("tenant_id", "vehicle_id") WHERE "is_primary" = TRUE;

-- 6. Row-Level Security (RLS) policies for multi-tenancy
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_derivatives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_processing_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_reconciliation_issues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle_media" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_assets_tenant_isolation" ON "media_assets"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY "media_derivatives_tenant_isolation" ON "media_derivatives"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY "media_processing_requests_tenant_isolation" ON "media_processing_requests"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY "media_reconciliation_issues_tenant_isolation" ON "media_reconciliation_issues"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY "vehicle_media_tenant_isolation" ON "vehicle_media"
    USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
