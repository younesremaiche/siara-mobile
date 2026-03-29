CREATE TABLE IF NOT EXISTS app.mobile_push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT 'android',
  provider VARCHAR(20) NOT NULL DEFAULT 'expo',
  app_version TEXT NULL,
  device_name TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ NULL,
  disabled_at TIMESTAMPTZ NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app.mobile_push_devices
  ADD COLUMN IF NOT EXISTS platform VARCHAR(20) NOT NULL DEFAULT 'android',
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'expo',
  ADD COLUMN IF NOT EXISTS app_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS device_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_mobile_push_devices_token
  ON app.mobile_push_devices (token);

CREATE INDEX IF NOT EXISTS idx_mobile_push_devices_user_active
  ON app.mobile_push_devices (user_id, is_active, updated_at DESC, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_mobile_push_devices_platform'
      AND conrelid = 'app.mobile_push_devices'::regclass
  ) THEN
    ALTER TABLE app.mobile_push_devices
      ADD CONSTRAINT chk_mobile_push_devices_platform
      CHECK (platform IN ('android', 'ios'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_mobile_push_devices_provider'
      AND conrelid = 'app.mobile_push_devices'::regclass
  ) THEN
    ALTER TABLE app.mobile_push_devices
      ADD CONSTRAINT chk_mobile_push_devices_provider
      CHECK (provider IN ('expo', 'fcm', 'apns'));
  END IF;
END $$;
