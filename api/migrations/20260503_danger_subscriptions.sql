-- Phase 13: per-user danger subscriptions for zones, routes, or points.
-- Geometry stored as JSON path + lat/lng centroid + radius for simplicity.
-- A future enhancement can add a PostGIS geometry column for spatial indexes.

CREATE TABLE IF NOT EXISTS app.danger_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('zone', 'route', 'point')),
  center_lat DOUBLE PRECISION NULL,
  center_lng DOUBLE PRECISION NULL,
  radius_meters INT NULL,
  geometry JSONB NULL,
  risk_threshold TEXT NOT NULL DEFAULT 'high' CHECK (risk_threshold IN ('low', 'moderate', 'high', 'extreme')),
  notify_on_reports BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_high_risk BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_police_verified BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_evaluated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS danger_subscriptions_user_idx
  ON app.danger_subscriptions(user_id, is_active, type);

CREATE INDEX IF NOT EXISTS danger_subscriptions_active_centroid_idx
  ON app.danger_subscriptions(is_active, center_lat, center_lng)
  WHERE is_active = TRUE;
