BEGIN;

ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS google_sub TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

UPDATE auth.users
SET auth_provider = COALESCE(NULLIF(TRIM(auth_provider), ''), 'email')
WHERE auth_provider IS NULL
   OR TRIM(auth_provider) = '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_users_google_sub
  ON auth.users (google_sub)
  WHERE google_sub IS NOT NULL;

COMMIT;
