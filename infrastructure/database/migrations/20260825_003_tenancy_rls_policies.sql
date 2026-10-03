-- ============================================================================
-- CAR HIRE OS — MIGRATION 20260825_003: TENANCY, MEMBERSHIP & RLS POLICIES
-- Adheres to DEV-004, DEV-009, DATA-001, DATA-002, DATA-004 & Tenant Isolation Spec
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS SESSION HELPER FUNCTIONS (FAIL-CLOSED)
-- ----------------------------------------------------------------------------

-- Helper to safely extract current tenant UUID from local session transaction
CREATE OR REPLACE FUNCTION app_current_tenant_id()
RETURNS UUID AS $$
DECLARE
    tenant_str TEXT;
BEGIN
    tenant_str := NULLIF(current_setting('app.current_tenant_id', true), '');
    IF tenant_str IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN tenant_str::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper to safely check if explicit platform bypass is granted (superadmin break-glass)
CREATE OR REPLACE FUNCTION app_is_platform_bypass()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(current_setting('app.is_platform_bypass', true) = 'true', FALSE);
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2. ENABLE ROW-LEVEL SECURITY ON TENANT-SCOPED TABLES
-- ----------------------------------------------------------------------------

ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;

ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_memberships" FORCE ROW LEVEL SECURITY;

ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. RLS POLICIES: TENANT SETTINGS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_settings_isolation_policy ON "tenant_settings";
CREATE POLICY tenant_settings_isolation_policy ON "tenant_settings"
    AS RESTRICTIVE
    FOR ALL
    USING (
        app_is_platform_bypass() OR 
        ("tenant_id" = app_current_tenant_id() AND app_current_tenant_id() IS NOT NULL)
    )
    WITH CHECK (
        app_is_platform_bypass() OR 
        ("tenant_id" = app_current_tenant_id() AND app_current_tenant_id() IS NOT NULL)
    );

-- ----------------------------------------------------------------------------
-- 4. RLS POLICIES: TENANT MEMBERSHIPS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_memberships_isolation_policy ON "tenant_memberships";
CREATE POLICY tenant_memberships_isolation_policy ON "tenant_memberships"
    AS RESTRICTIVE
    FOR ALL
    USING (
        app_is_platform_bypass() OR
        ("tenant_id" = app_current_tenant_id() AND app_current_tenant_id() IS NOT NULL)
    )
    WITH CHECK (
        app_is_platform_bypass() OR
        ("tenant_id" = app_current_tenant_id() AND app_current_tenant_id() IS NOT NULL)
    );

-- ----------------------------------------------------------------------------
-- 5. RLS POLICIES: IDEMPOTENCY KEYS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS idempotency_keys_isolation_policy ON "idempotency_keys";
CREATE POLICY idempotency_keys_isolation_policy ON "idempotency_keys"
    AS RESTRICTIVE
    FOR ALL
    USING (
        app_is_platform_bypass() OR
        "tenant_id" IS NULL OR
        ("tenant_id" = app_current_tenant_id() AND app_current_tenant_id() IS NOT NULL)
    )
    WITH CHECK (
        app_is_platform_bypass() OR
        "tenant_id" IS NULL OR
        ("tenant_id" = app_current_tenant_id() AND app_current_tenant_id() IS NOT NULL)
    );
