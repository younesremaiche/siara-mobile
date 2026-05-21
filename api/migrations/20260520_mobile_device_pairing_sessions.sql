-- Mobile device pairing sessions.
--
-- Lets a logged-in web user generate a short-lived QR code that the SIARA
-- mobile app can scan to register itself as a push destination for the same
-- user account. The QR only carries the pairing code (one-time, 5-minute
-- expiry); the Expo push token, JWT, etc. NEVER touch the QR.
--
-- See api/services/pushService.js (createMobileDevicePairingSession,
-- completeMobileDevicePairingSession) and api/contollers/push.js for the
-- routes that operate on this table.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app.mobile_device_pairing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Stores ONLY the SHA-256 hash of the pairing code. The raw code is sent
  -- once in the create response and again in the complete request.
  code_hash TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  device_id UUID,
  device_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Hashes are 64-char hex; treating them as globally unique prevents collisions
-- and lets the completion path locate a session by hash alone.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mobile_device_pairing_sessions_code_hash
  ON app.mobile_device_pairing_sessions (code_hash);

CREATE INDEX IF NOT EXISTS idx_mobile_device_pairing_sessions_user_status
  ON app.mobile_device_pairing_sessions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_mobile_device_pairing_sessions_expires_at
  ON app.mobile_device_pairing_sessions (expires_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_mobile_device_pairing_sessions_status'
      AND conrelid = 'app.mobile_device_pairing_sessions'::regclass
  ) THEN
    ALTER TABLE app.mobile_device_pairing_sessions
      ADD CONSTRAINT chk_mobile_device_pairing_sessions_status
      CHECK (status IN ('pending', 'completed', 'expired', 'cancelled'));
  END IF;
END;
$$;

COMMIT;
