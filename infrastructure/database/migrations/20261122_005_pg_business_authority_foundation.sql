-- UX-D6: Native PostgreSQL business-record foundation.
-- Additive only: legacy SQLite-backed repositories are not switched by this SQL.
-- This migration must be applied after the original four checked migrations.

-- Prevent anyone with arbitrary SQL access from obtaining a platform bypass
-- merely by setting a custom GUC. Only a DBA-granted break-glass role may bypass.
CREATE OR REPLACE FUNCTION app_is_platform_bypass()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(
    current_setting('app.is_platform_bypass', true) = 'true'
    AND pg_has_role(session_user, to_regrole('sage_auto_breakglass'), 'member'),
    FALSE
  );
$$;

-- The original restrictive RLS policies need at least one permissive policy:
-- PostgreSQL otherwise rejects all rows, including legitimate tenant rows.
-- The restrictive tenant predicates remain in force and FORCE RLS stays enabled.
DROP POLICY IF EXISTS tenant_settings_tenant_entry_policy ON tenant_settings;
CREATE POLICY tenant_settings_tenant_entry_policy ON tenant_settings
  AS PERMISSIVE FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS tenant_memberships_tenant_entry_policy ON tenant_memberships;
CREATE POLICY tenant_memberships_tenant_entry_policy ON tenant_memberships
  AS PERMISSIVE FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS idempotency_keys_tenant_entry_policy ON idempotency_keys;
CREATE POLICY idempotency_keys_tenant_entry_policy ON idempotency_keys
  AS PERMISSIVE FOR ALL
  USING (TRUE) WITH CHECK (TRUE);

-- Explicit record authority for async repositories. One row = one tenant-scoped
-- domain aggregate. Payload stays JSONB until each domain is migrated to
-- typed normalized SQL. This is NOT a shadow/mirror of the SQLite database.
CREATE TABLE IF NOT EXISTS sage_business_records (
  tenant_id UUID NOT NULL,
  domain TEXT NOT NULL CHECK (domain ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  record_id TEXT NOT NULL CHECK (length(record_id) BETWEEN 1 AND 255),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  record_version BIGINT NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, domain, record_id),
  CONSTRAINT sage_business_records_tenant_payload_matches
    CHECK (payload->>'tenantId' = tenant_id::TEXT)
);

CREATE INDEX IF NOT EXISTS idx_sage_business_records_domain
  ON sage_business_records(tenant_id, domain, updated_at DESC, record_id);

-- Protect business identifiers against two independent workers racing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sage_business_payment_provider_tx
  ON sage_business_records (
    tenant_id,
    LOWER(payload->>'provider'),
    LOWER(payload->>'providerTransactionId')
  )
  WHERE domain = 'PAYMENT'
    AND NULLIF(payload->>'provider','') IS NOT NULL
    AND NULLIF(payload->>'providerTransactionId','') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sage_business_booking_number
  ON sage_business_records (tenant_id, LOWER(payload->>'bookingNumber'))
  WHERE domain = 'BOOKING' AND NULLIF(payload->>'bookingNumber','') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sage_business_plate
  ON sage_business_records (
    tenant_id,
    REGEXP_REPLACE(UPPER(payload->>'registrationPlate'), '\s+', '', 'g')
  )
  WHERE domain = 'VEHICLE' AND NULLIF(payload->>'registrationPlate','') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sage_business_invoice_number
  ON sage_business_records (tenant_id, LOWER(payload->>'invoiceNumber'))
  WHERE domain = 'INVOICE' AND NULLIF(payload->>'invoiceNumber','') IS NOT NULL;

-- An immutable tenant-keyed claim record supports one-time processing,
-- callbacks, refunds and external provider event deduplication.
CREATE TABLE IF NOT EXISTS sage_business_claims (
  tenant_id UUID NOT NULL,
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 128),
  claim_key TEXT NOT NULL CHECK (length(claim_key) BETWEEN 1 AND 255),
  request_hash TEXT NOT NULL CHECK (length(request_hash) BETWEEN 1 AND 255),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope, claim_key)
);

-- No overlapping allocations in independent processes, by the database.
CREATE TABLE IF NOT EXISTS sage_vehicle_allocations (
  tenant_id UUID NOT NULL,
  allocation_id TEXT NOT NULL CHECK (length(allocation_id) BETWEEN 1 AND 255),
  vehicle_id TEXT NOT NULL CHECK (length(vehicle_id) BETWEEN 1 AND 255),
  booking_id TEXT NOT NULL CHECK (length(booking_id) BETWEEN 1 AND 255),
  pickup_at TIMESTAMPTZ NOT NULL,
  return_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('HELD','RESERVED','ACTIVE','RELEASED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (return_at > pickup_at),
  PRIMARY KEY (tenant_id, allocation_id),
  CONSTRAINT sage_allocations_no_overlapping_vehicle_claims
    EXCLUDE USING gist (
      tenant_id WITH =,
      vehicle_id WITH =,
      tstzrange(pickup_at, return_at, '[)') WITH &&
    )
    WHERE (status IN ('HELD','RESERVED','ACTIVE'))
);

-- FORCE policy for runtime accounts including table owners. An unprivileged
-- account requires SET LOCAL app.current_tenant_id inside a transaction.
ALTER TABLE sage_business_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_business_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sage_business_records_isolation ON sage_business_records;
CREATE POLICY sage_business_records_isolation ON sage_business_records
  FOR ALL
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

ALTER TABLE sage_business_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_business_claims FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sage_business_claims_isolation ON sage_business_claims;
CREATE POLICY sage_business_claims_isolation ON sage_business_claims
  FOR ALL
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

ALTER TABLE sage_vehicle_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_vehicle_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sage_vehicle_allocations_isolation ON sage_vehicle_allocations;
CREATE POLICY sage_vehicle_allocations_isolation ON sage_vehicle_allocations
  FOR ALL
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

COMMENT ON TABLE sage_business_records IS
  'UX-D6 native PostgreSQL record foundation. NOT connected to legacy SQLite API repositories until controlled cutover.';
