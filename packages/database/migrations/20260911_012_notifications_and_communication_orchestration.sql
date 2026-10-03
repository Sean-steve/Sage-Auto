-- ============================================================================
-- CAR HIRE OS — SPRINT 32 DATABASE MIGRATION
-- NOTIFICATIONS, COMMUNICATION ORCHESTRATION, TEMPLATES, PREFERENCES & RECEIPTS
-- ============================================================================

-- 1. Notification Templates
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('TRANSACTIONAL', 'OPERATIONAL', 'SECURITY', 'MARKETING')),
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'WHATSAPP')),
    subject_template TEXT,
    body_template TEXT NOT NULL,
    html_template TEXT,
    variables_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT,
    is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_template_tenant_key_channel UNIQUE NULLS NOT DISTINCT (tenant_id, key, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant ON notification_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates_key ON notification_templates(key);

-- 2. Notification Intents & Messages
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'WHATSAPP')),
    category VARCHAR(20) NOT NULL CHECK (category IN ('TRANSACTIONAL', 'OPERATIONAL', 'SECURITY', 'MARKETING')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'QUEUED', 'SENDING', 'PROVIDER_ACCEPTED', 'DELIVERED', 'FAILED', 'BOUNCED', 'REJECTED', 'SUPPRESSED')),
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('HIGH', 'NORMAL', 'LOW')),
    recipient VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    recipient_party_type VARCHAR(50),
    recipient_party_id VARCHAR(255),
    subject TEXT,
    body TEXT NOT NULL,
    rendered_html TEXT,
    template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
    template_key VARCHAR(100),
    template_version INT DEFAULT 1,
    variables JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(255) NOT NULL,
    correlation_id VARCHAR(255),
    causation_event_id VARCHAR(255),
    provider VARCHAR(50),
    provider_message_id VARCHAR(255),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notifications_tenant_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_recipient ON notifications(tenant_id, recipient);
CREATE INDEX IF NOT EXISTS idx_notifications_provider_msg_id ON notifications(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_notifications_correlation ON notifications(correlation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- 3. Delivery Receipts (Webhooks & Provider Acknowledgements)
CREATE TABLE IF NOT EXISTS notification_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_message_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL,
    event_type VARCHAR(50),
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_receipts_notif ON notification_receipts(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_receipts_tenant ON notification_receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_receipts_provider_msg ON notification_receipts(provider_message_id);

-- 4. Communication Preferences (Opt-ins & Opt-outs)
CREATE TABLE IF NOT EXISTS communication_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    party_type VARCHAR(50) NOT NULL,
    party_id VARCHAR(255) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    category VARCHAR(20) NOT NULL,
    opted_in BOOLEAN NOT NULL DEFAULT TRUE,
    source VARCHAR(100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_communication_preferences UNIQUE (tenant_id, party_id, channel, category)
);

CREATE INDEX IF NOT EXISTS idx_comm_preferences_tenant_party ON communication_preferences(tenant_id, party_id);
CREATE INDEX IF NOT EXISTS idx_comm_preferences_recipient ON communication_preferences(tenant_id, recipient);

-- 5. Notification Suppressions (Bounces, Unsubscribes, Blocks)
CREATE TABLE IF NOT EXISTS notification_suppressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('UNSUBSCRIBED', 'HARD_BOUNCE', 'SPAM_COMPLAINT', 'MANUAL_BLOCK')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_suppressions UNIQUE NULLS NOT DISTINCT (tenant_id, channel, recipient)
);

CREATE INDEX IF NOT EXISTS idx_notification_suppressions_lookup ON notification_suppressions(tenant_id, channel, recipient);

-- 6. Notification Provider Configurations
CREATE TABLE IF NOT EXISTS notification_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL,
    provider_name VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    sender_identifier VARCHAR(255),
    sender_name VARCHAR(255),
    credentials_masked JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_configs_tenant_channel_provider UNIQUE (tenant_id, channel, provider_name)
);

CREATE INDEX IF NOT EXISTS idx_provider_configs_tenant ON notification_provider_configs(tenant_id, channel);
