-- ============================================================================
-- CAR HIRE OS — SPRINT 7 MIGRATION: ENTITLEMENT ENGINE
-- Migration: 20260827_003_entitlement_engine.sql
-- ============================================================================

-- 1. Canonical Features Registry
CREATE TABLE IF NOT EXISTS saas_features (
  id VARCHAR(64) PRIMARY KEY,
  key VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(32) NOT NULL CHECK (type IN ('BOOLEAN', 'NUMERIC_LIMIT', 'USAGE_LIMIT', 'MODULE', 'ACTION', 'RESOURCE')),
  category VARCHAR(32) NOT NULL CHECK (category IN ('FLEET', 'ANALYTICS', 'WEBSITE', 'FINANCE', 'INTEGRATIONS', 'USERS', 'NOTIFICATIONS', 'GENERAL')),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPRECATED', 'DISABLED')),
  default_value JSONB,
  is_addon_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_features_key ON saas_features (key);
CREATE INDEX IF NOT EXISTS idx_saas_features_category ON saas_features (category);
CREATE INDEX IF NOT EXISTS idx_saas_features_status ON saas_features (status);

-- 2. Plan Features (Mapping Plan to Feature Limits/Config)
CREATE TABLE IF NOT EXISTS saas_plan_features (
  id VARCHAR(64) PRIMARY KEY,
  plan_id VARCHAR(64) NOT NULL REFERENCES saas_plans(id) ON DELETE CASCADE,
  feature_id VARCHAR(64) NOT NULL REFERENCES saas_features(id) ON DELETE CASCADE,
  feature_key VARCHAR(128) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  limit_value NUMERIC(19, 4),
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  configuration JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_plan_features_plan_feature UNIQUE(plan_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_saas_plan_features_plan_id ON saas_plan_features (plan_id);
CREATE INDEX IF NOT EXISTS idx_saas_plan_features_feature_key ON saas_plan_features (feature_key);

-- 3. Tenant Entitlements (Materialized/Assigned Tenant Entitlements)
CREATE TABLE IF NOT EXISTS saas_tenant_entitlements (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_id VARCHAR(64) NOT NULL REFERENCES saas_features(id) ON DELETE CASCADE,
  feature_key VARCHAR(128) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'PLAN' CHECK (source IN ('PLAN', 'ADDON', 'OVERRIDE', 'DEFAULT')),
  source_id VARCHAR(64),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  limit_value NUMERIC(19, 4),
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_entitlement_tenant_feature UNIQUE(tenant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_saas_tenant_entitlements_tenant_id ON saas_tenant_entitlements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_tenant_entitlements_feature_key ON saas_tenant_entitlements (feature_key);

-- 4. Entitlement Overrides (Admin Overrides for Exceptions)
CREATE TABLE IF NOT EXISTS saas_entitlement_overrides (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_id VARCHAR(64) REFERENCES saas_features(id) ON DELETE SET NULL,
  feature_key VARCHAR(128) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  limit_value NUMERIC(19, 4),
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_entitlement_overrides_tenant_id ON saas_entitlement_overrides (tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_entitlement_overrides_feature_key ON saas_entitlement_overrides (feature_key);
CREATE INDEX IF NOT EXISTS idx_saas_entitlement_overrides_status ON saas_entitlement_overrides (status);
CREATE INDEX IF NOT EXISTS idx_saas_entitlement_overrides_dates ON saas_entitlement_overrides (effective_from, effective_to);

-- 5. Entitlement Restrictions (Platform & Tenant Level Restrictions)
CREATE TABLE IF NOT EXISTS saas_entitlement_restrictions (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) REFERENCES tenants(id) ON DELETE CASCADE,
  scope VARCHAR(32) NOT NULL DEFAULT 'PLATFORM' CHECK (scope IN ('PLATFORM', 'TENANT')),
  feature_key VARCHAR(128) NOT NULL,
  restriction_type VARCHAR(32) NOT NULL DEFAULT 'BLOCK' CHECK (restriction_type IN ('BLOCK', 'FORCE_LIMIT')),
  enforced_limit NUMERIC(19, 4),
  reason TEXT NOT NULL,
  imposed_by VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LIFTED')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_restrictions_tenant_id ON saas_entitlement_restrictions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_restrictions_feature_key ON saas_entitlement_restrictions (feature_key);
CREATE INDEX IF NOT EXISTS idx_saas_restrictions_scope_status ON saas_entitlement_restrictions (scope, status);

-- 6. Entitlement Usage (Metered & High-Frequency Usage Tracking)
CREATE TABLE IF NOT EXISTS saas_entitlement_usage (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key VARCHAR(128) NOT NULL,
  period_key VARCHAR(64) NOT NULL DEFAULT 'CURRENT',
  period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_end TIMESTAMPTZ,
  current_usage NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
  last_increment_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_usage_period UNIQUE(tenant_id, feature_key, period_key)
);

CREATE INDEX IF NOT EXISTS idx_saas_usage_tenant_feature ON saas_entitlement_usage (tenant_id, feature_key);
CREATE INDEX IF NOT EXISTS idx_saas_usage_period_key ON saas_entitlement_usage (period_key);

-- 7. Feature Flags (Deployment/Rollout Flags separate from Entitlements)
CREATE TABLE IF NOT EXISTS feature_flags (
  id VARCHAR(64) PRIMARY KEY,
  key VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percentage INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags (key);
