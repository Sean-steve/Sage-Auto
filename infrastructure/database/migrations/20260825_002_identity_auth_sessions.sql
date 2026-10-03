-- ============================================================================
-- CAR HIRE OS — MIGRATION 20260825_002: IDENTITY, AUTHENTICATION & SESSIONS
-- Adheres to DEV-004, SEC-007, DATA-002 §4, DEV-009
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AUTHENTICATION SESSIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "auth_sessions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "token_family_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6) NULL,
    "revocation_reason" VARCHAR(255) NULL,
    "ip_address" VARCHAR(100) NULL,
    "user_agent" VARCHAR(500) NULL,
    "device_label" VARCHAR(255) NULL,
    CONSTRAINT "fk_auth_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_auth_sessions_user_id" ON "auth_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_refresh_hash" ON "auth_sessions" ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_family_id" ON "auth_sessions" ("token_family_id");
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_expires_at" ON "auth_sessions" ("expires_at");

-- ----------------------------------------------------------------------------
-- 2. PASSWORD RESET TOKENS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6) NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_password_reset_tokens_hash" UNIQUE ("token_hash"),
    CONSTRAINT "fk_password_reset_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_user" ON "password_reset_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_hash" ON "password_reset_tokens" ("token_hash");

-- ----------------------------------------------------------------------------
-- 3. EMAIL VERIFICATION TOKENS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6) NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_email_verification_tokens_hash" UNIQUE ("token_hash"),
    CONSTRAINT "fk_email_verification_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_email_verification_tokens_user" ON "email_verification_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_email_verification_tokens_hash" ON "email_verification_tokens" ("token_hash");
