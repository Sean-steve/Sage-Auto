-- ============================================================================
-- CAR HIRE OS — MIGRATION 010: SECURE FILES, PRIVATE OBJECT ACCESS & DOCUMENTS
-- (ARCH-001, SEC-001-008, DATA-001, DATA-002 §12, DEV-001-011)
-- ============================================================================

-- 1. Files metadata table (S3/MinIO reference, immutable properties, scan & integrity)
CREATE TABLE IF NOT EXISTS "files" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "storage_provider" VARCHAR(50) NOT NULL DEFAULT 's3',
    "bucket" VARCHAR(100) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "sanitized_filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "detected_content_type" VARCHAR(100) NULL,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "checksum_algorithm" VARCHAR(50) NOT NULL DEFAULT 'sha256',
    "checksum" VARCHAR(64) NULL,
    "classification" VARCHAR(50) NOT NULL DEFAULT 'PRIVATE',
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING_UPLOAD',
    "scan_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "uploaded_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "version" INT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ(6) NULL,
    "scanned_at" TIMESTAMPTZ(6) NULL,
    "archived_at" TIMESTAMPTZ(6) NULL,
    "deleted_at" TIMESTAMPTZ(6) NULL,
    CONSTRAINT "uq_files_tenant_object_key" UNIQUE ("tenant_id", "object_key")
);

CREATE INDEX IF NOT EXISTS "idx_files_tenant_status" ON "files" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_files_tenant_created" ON "files" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_files_scan_status" ON "files" ("scan_status") WHERE "status" = 'SCANNING';

-- 2. File Upload Sessions (Pre-signed tickets, size quotas, reservation state)
CREATE TABLE IF NOT EXISTS "file_upload_sessions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" VARCHAR(100) NOT NULL,
    "resource_role" VARCHAR(50) NOT NULL,
    "classification" VARCHAR(50) NOT NULL DEFAULT 'PRIVATE',
    "original_filename" VARCHAR(255) NOT NULL,
    "declared_content_type" VARCHAR(100) NOT NULL,
    "max_size_bytes" BIGINT NOT NULL,
    "reserved_bytes" BIGINT NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "upload_url" TEXT NOT NULL,
    "upload_method" VARCHAR(10) NOT NULL DEFAULT 'PUT',
    "status" VARCHAR(50) NOT NULL DEFAULT 'INITIATED',
    "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "idempotency_key" VARCHAR(255) NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ(6) NULL,
    "cancelled_at" TIMESTAMPTZ(6) NULL
);

CREATE INDEX IF NOT EXISTS "idx_file_upload_sessions_tenant_status" ON "file_upload_sessions" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_file_upload_sessions_expires" ON "file_upload_sessions" ("status", "expires_at");
CREATE INDEX IF NOT EXISTS "idx_file_upload_sessions_idempotency" ON "file_upload_sessions" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- 3. File Scan Records (Malware, antivirus, and payload analysis)
CREATE TABLE IF NOT EXISTS "file_scan_records" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
    "scanner_engine" VARCHAR(100) NOT NULL,
    "scanner_version" VARCHAR(50) NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "findings" JSONB NULL,
    "attempt" INT NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6) NULL
);

CREATE INDEX IF NOT EXISTS "idx_file_scan_records_file" ON "file_scan_records" ("file_id");
CREATE INDEX IF NOT EXISTS "idx_file_scan_records_tenant" ON "file_scan_records" ("tenant_id", "status");

-- 4. Enterprise Documents Aggregate
CREATE TABLE IF NOT EXISTS "documents" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "document_type" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "current_version_id" UUID NULL,
    "current_version_number" INT NOT NULL DEFAULT 1,
    "classification" VARCHAR(50) NOT NULL DEFAULT 'PRIVATE',
    "issued_at" TIMESTAMPTZ(6) NULL,
    "expires_at" TIMESTAMPTZ(6) NULL,
    "created_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "version" INT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6) NULL
);

CREATE INDEX IF NOT EXISTS "idx_documents_tenant_resource" ON "documents" ("tenant_id", "resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "idx_documents_tenant_status" ON "documents" ("tenant_id", "status");

-- 5. Document Versions (Immutable historical snapshots and file linkages)
CREATE TABLE IF NOT EXISTS "document_versions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "document_id" UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
    "version_number" INT NOT NULL,
    "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE RESTRICT,
    "uploaded_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "change_reason" VARCHAR(255) NULL,
    "metadata_snapshot" JSONB NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(6) NULL,
    CONSTRAINT "uq_document_versions_doc_version" UNIQUE ("document_id", "version_number")
);

CREATE INDEX IF NOT EXISTS "idx_document_versions_tenant_doc" ON "document_versions" ("tenant_id", "document_id");

-- Add foreign key from documents.current_version_id to document_versions.id
ALTER TABLE "documents"
  ADD CONSTRAINT "fk_documents_current_version"
  FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL;

-- 6. File Resource Links (Polymorphic binding between files and business entities)
CREATE TABLE IF NOT EXISTS "file_resource_links" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" VARCHAR(100) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_file_resource_links_file_role" UNIQUE ("file_id", "resource_type", "resource_id", "role")
);

CREATE INDEX IF NOT EXISTS "idx_file_resource_links_resource" ON "file_resource_links" ("tenant_id", "resource_type", "resource_id");

-- 7. File Access Audit Records (Zero-Trust download auditing and access forensics)
CREATE TABLE IF NOT EXISTS "file_access_records" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
    "actor_id" VARCHAR(100) NOT NULL,
    "actor_type" VARCHAR(50) NOT NULL DEFAULT 'USER',
    "access_type" VARCHAR(50) NOT NULL,
    "resource_type" VARCHAR(50) NULL,
    "resource_id" VARCHAR(100) NULL,
    "ip_address" VARCHAR(100) NULL,
    "user_agent" TEXT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_file_access_records_file" ON "file_access_records" ("tenant_id", "file_id", "created_at");

-- 8. Storage Reconciliation Issues (Discrepancies, missing objects, orphans)
CREATE TABLE IF NOT EXISTS "storage_reconciliation_issues" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
    "file_id" UUID NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "issue_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'DETECTED',
    "details" JSONB NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6) NULL
);

CREATE INDEX IF NOT EXISTS "idx_storage_reconciliation_issues_tenant" ON "storage_reconciliation_issues" ("tenant_id", "status");
