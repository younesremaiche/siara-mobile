-- Notification orchestration schema additions.
--
-- Three tables backing the centralized notificationOrchestrator service:
--   1. app.user_last_known_location          — last GPS ping per user, for nearby-incident fan-out
--   2. app.notification_delivery_log         — per-channel delivery attempts with skip reasons
--   3. app.user_notification_category_preferences — per-category gating (8 categories x 4 channels)
--
-- All three are additive; nothing pre-existing is mutated.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- 1. user_last_known_location
-- ---------------------------------------------------------------------------
-- One row per user. Upserted whenever the web client (or future mobile client)
-- PUTs /api/users/me/location. The geography(Point,4326) column is the only
-- source the orchestrator uses to resolve "users within 5 km of an incident".
CREATE TABLE IF NOT EXISTS app.user_last_known_location (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  location     GEOGRAPHY(Point, 4326) NOT NULL,
  accuracy_m   NUMERIC(8, 2),
  source       VARCHAR(50),
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_last_known_location_geo
  ON app.user_last_known_location
  USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_user_last_known_location_captured_at
  ON app.user_last_known_location (captured_at DESC);

-- ---------------------------------------------------------------------------
-- 2. notification_delivery_log
-- ---------------------------------------------------------------------------
-- One row per per-platform delivery attempt for a notification. The orchestrator
-- writes a row for EACH platform it tried (in_app/web_push/mobile_push/email),
-- including skipped ones, so we can answer "why didn't user X get a push?".
CREATE TABLE IF NOT EXISTS app.notification_delivery_log (
  id                   BIGSERIAL PRIMARY KEY,
  notification_id      UUID REFERENCES app.notifications(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel              VARCHAR(30) NOT NULL,
  platform             VARCHAR(30),
  device_id            UUID,
  status               VARCHAR(30) NOT NULL DEFAULT 'pending',
  provider             VARCHAR(30),
  provider_message_id  TEXT,
  error_message        TEXT,
  attempted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at         TIMESTAMPTZ,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notification
  ON app.notification_delivery_log (notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_user_attempted
  ON app.notification_delivery_log (user_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_channel_status
  ON app.notification_delivery_log (channel, status);

-- ---------------------------------------------------------------------------
-- 3. user_notification_category_preferences
-- ---------------------------------------------------------------------------
-- Per-(user, category) toggles. The orchestrator reads this table to decide
-- whether each platform fires for a given event. Categories are an allowlist
-- enforced by application code (orchestrator NOTIFICATION_CATEGORIES constant);
-- we deliberately do not use a CHECK constraint so that adding a new category
-- later does not require a migration.
CREATE TABLE IF NOT EXISTS app.user_notification_category_preferences (
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category             TEXT NOT NULL,
  in_app_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  mobile_push_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  web_push_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  important_only       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_category_preferences_user
  ON app.user_notification_category_preferences (user_id);
