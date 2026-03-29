BEGIN;

CREATE TABLE IF NOT EXISTS app.user_security_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_password_reset_at TIMESTAMPTZ,
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app.user_security_state
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_password_reset_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS app.auth_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  purpose VARCHAR(30) NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  resend_available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app.auth_otp_codes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(30),
  ADD COLUMN IF NOT EXISTS code_hash TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS resend_available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE app.auth_otp_codes
SET email = COALESCE(email, ''),
    purpose = COALESCE(purpose, 'verify_email'),
    code_hash = COALESCE(code_hash, ''),
    expires_at = COALESCE(expires_at, NOW())
WHERE email IS NULL
   OR purpose IS NULL
   OR code_hash IS NULL
   OR expires_at IS NULL;

ALTER TABLE app.auth_otp_codes
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN purpose SET NOT NULL,
  ALTER COLUMN code_hash SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_email_purpose
  ON app.auth_otp_codes (email, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_user_purpose
  ON app.auth_otp_codes (user_id, purpose, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_auth_otp_codes_purpose'
      AND conrelid = 'app.auth_otp_codes'::regclass
  ) THEN
    ALTER TABLE app.auth_otp_codes
      ADD CONSTRAINT chk_auth_otp_codes_purpose
      CHECK (purpose IN ('verify_email', 'reset_password'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS app.password_reset_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app.password_reset_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE app.password_reset_sessions
SET email = COALESCE(email, ''),
    token_hash = COALESCE(token_hash, ''),
    expires_at = COALESCE(expires_at, NOW())
WHERE email IS NULL
   OR token_hash IS NULL
   OR expires_at IS NULL;

ALTER TABLE app.password_reset_sessions
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN token_hash SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_sessions_user
  ON app.password_reset_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.user_email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  transactional_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_summary_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  product_updates_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app.user_email_preferences
  ADD COLUMN IF NOT EXISTS transactional_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS weekly_summary_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS product_updates_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS app.email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  category VARCHAR(30) NOT NULL,
  template_key VARCHAR(50) NOT NULL,
  subject TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  provider_message_id TEXT,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

ALTER TABLE app.email_messages
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS category VARCHAR(30),
  ADD COLUMN IF NOT EXISTS template_key VARCHAR(50),
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

UPDATE app.email_messages
SET email = COALESCE(email, ''),
    category = COALESCE(category, 'transactional'),
    template_key = COALESCE(template_key, 'unknown'),
    subject = COALESCE(subject, '')
WHERE email IS NULL
   OR category IS NULL
   OR template_key IS NULL
   OR subject IS NULL;

ALTER TABLE app.email_messages
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN template_key SET NOT NULL,
  ALTER COLUMN subject SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_messages_user_created
  ON app.email_messages (user_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_email_messages_category'
      AND conrelid = 'app.email_messages'::regclass
  ) THEN
    ALTER TABLE app.email_messages
      ADD CONSTRAINT chk_email_messages_category
      CHECK (category IN ('transactional', 'summary', 'product_update', 'marketing'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_email_messages_status'
      AND conrelid = 'app.email_messages'::regclass
  ) THEN
    ALTER TABLE app.email_messages
      ADD CONSTRAINT chk_email_messages_status
      CHECK (status IN ('queued', 'sent', 'failed'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS app.user_oauth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app.user_oauth_identities
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider VARCHAR(30),
  ADD COLUMN IF NOT EXISTS provider_subject TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE app.user_oauth_identities
SET provider = COALESCE(provider, 'google'),
    provider_subject = COALESCE(provider_subject, '')
WHERE provider IS NULL
   OR provider_subject IS NULL;

ALTER TABLE app.user_oauth_identities
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN provider_subject SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_oauth_identities_provider_subject
  ON app.user_oauth_identities (provider, provider_subject);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_oauth_identities_user_provider
  ON app.user_oauth_identities (user_id, provider);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_user_oauth_identities_provider'
      AND conrelid = 'app.user_oauth_identities'::regclass
  ) THEN
    ALTER TABLE app.user_oauth_identities
      ADD CONSTRAINT chk_user_oauth_identities_provider
      CHECK (provider IN ('google'));
  END IF;
END;
$$;

COMMIT;
