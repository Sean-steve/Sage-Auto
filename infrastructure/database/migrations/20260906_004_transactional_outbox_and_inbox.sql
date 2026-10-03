-- ============================================================================
-- CAR HIRE OS — MIGRATION 004: TRANSACTIONAL OUTBOX UPGRADE & EVENT INBOX
-- (BRS-002, DEV-010, DATA-002 §11)
-- ============================================================================

-- 1. Upgrade outbox_events with full tracing, claiming, and actor metadata
ALTER TABLE "outbox_events" 
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(100) NOT NULL DEFAULT 'carhire.api',
  ADD COLUMN IF NOT EXISTS "aggregate_version" INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "actor_type" VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN IF NOT EXISTS "support_actor_id" UUID NULL,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NULL,
  ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMPTZ(6) NULL,
  ADD COLUMN IF NOT EXISTS "claimed_by" VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMPTZ(6) NULL,
  ADD COLUMN IF NOT EXISTS "last_error_code" VARCHAR(100) NULL;

CREATE INDEX IF NOT EXISTS "idx_outbox_events_status_claimed" ON "outbox_events" ("status", "claimed_at");

-- 2. Create event_consumptions table for idempotent subscriber tracking
CREATE TABLE IF NOT EXISTS "event_consumptions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "consumer_name" VARCHAR(150) NOT NULL,
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "tenant_id" UUID NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PROCESSING',
    "attempt_count" INT NOT NULL DEFAULT 1,
    "processed_at" TIMESTAMPTZ(6) NULL,
    "last_error" TEXT NULL,
    "metadata" JSONB NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_event_consumptions_consumer_event" UNIQUE ("consumer_name", "event_id")
);

CREATE INDEX IF NOT EXISTS "idx_event_consumptions_tenant_id" ON "event_consumptions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_event_consumptions_consumer_status" ON "event_consumptions" ("consumer_name", "status");
