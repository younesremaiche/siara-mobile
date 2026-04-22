BEGIN;

INSERT INTO auth.roles (name)
SELECT 'police'
WHERE NOT EXISTS (
  SELECT 1
  FROM auth.roles
  WHERE lower(name) = 'police'
);

CREATE TABLE IF NOT EXISTS app.police_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  badge_number VARCHAR(100),
  rank VARCHAR(100),
  supervisor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  default_wilaya_id BIGINT REFERENCES gis.admin_areas (id) ON DELETE SET NULL,
  default_commune_id BIGINT REFERENCES gis.admin_areas (id) ON DELETE SET NULL,
  first_zone_selection_completed BOOLEAN NOT NULL DEFAULT FALSE,
  is_on_duty BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.police_work_zone_assignments (
  id BIGSERIAL PRIMARY KEY,
  officer_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  admin_area_id BIGINT NOT NULL REFERENCES gis.admin_areas (id) ON DELETE CASCADE,
  zone_level VARCHAR(20) NOT NULL CHECK (zone_level IN ('wilaya', 'commune')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.officer_location_updates (
  id BIGSERIAL PRIMARY KEY,
  officer_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  location GEOGRAPHY(Point, 4326) NOT NULL,
  accuracy_m NUMERIC(8, 2),
  heading NUMERIC(8, 2),
  speed_kmh NUMERIC(8, 2),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(50) NOT NULL DEFAULT 'device',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.incident_assignments (
  id BIGSERIAL PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES app.accident_reports (id) ON DELETE CASCADE,
  officer_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  assignment_type VARCHAR(30) NOT NULL DEFAULT 'manual' CHECK (assignment_type IN ('self', 'supervisor', 'manual')),
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'cancelled')),
  priority_override SMALLINT,
  note TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app.police_operation_history (
  id BIGSERIAL PRIMARY KEY,
  officer_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  report_id UUID REFERENCES app.accident_reports (id) ON DELETE SET NULL,
  alert_id UUID REFERENCES app.operational_alerts (id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL,
  from_status VARCHAR(50),
  to_status VARCHAR(50),
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.operational_alert_targets (
  id BIGSERIAL PRIMARY KEY,
  alert_id UUID NOT NULL REFERENCES app.operational_alerts (id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('officer', 'role', 'zone')),
  target_user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  target_role VARCHAR(100),
  admin_area_id BIGINT REFERENCES gis.admin_areas (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS app.accident_reports
  ADD COLUMN IF NOT EXISTS assigned_officer_id UUID,
  ADD COLUMN IF NOT EXISTS verified_by_officer_id UUID,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by_officer_id UUID,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_channel VARCHAR(50),
  ADD COLUMN IF NOT EXISTS reported_by_role_snapshot JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accident_reports_assigned_officer_id_fkey'
      AND conrelid = 'app.accident_reports'::regclass
  ) THEN
    ALTER TABLE app.accident_reports
      ADD CONSTRAINT accident_reports_assigned_officer_id_fkey
      FOREIGN KEY (assigned_officer_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accident_reports_verified_by_officer_id_fkey'
      AND conrelid = 'app.accident_reports'::regclass
  ) THEN
    ALTER TABLE app.accident_reports
      ADD CONSTRAINT accident_reports_verified_by_officer_id_fkey
      FOREIGN KEY (verified_by_officer_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accident_reports_resolved_by_officer_id_fkey'
      AND conrelid = 'app.accident_reports'::regclass
  ) THEN
    ALTER TABLE app.accident_reports
      ADD CONSTRAINT accident_reports_resolved_by_officer_id_fkey
      FOREIGN KEY (resolved_by_officer_id) REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_police_work_zone_active_level
  ON app.police_work_zone_assignments (officer_user_id, zone_level)
  WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_incident_assignments_active_officer
  ON app.incident_assignments (report_id, officer_user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_police_profiles_supervisor_user_id
  ON app.police_profiles (supervisor_user_id);

CREATE INDEX IF NOT EXISTS idx_police_work_zone_assignments_officer_user_id
  ON app.police_work_zone_assignments (officer_user_id);

CREATE INDEX IF NOT EXISTS idx_police_work_zone_assignments_admin_area_id
  ON app.police_work_zone_assignments (admin_area_id);

CREATE INDEX IF NOT EXISTS idx_police_work_zone_assignments_active
  ON app.police_work_zone_assignments (officer_user_id, is_active, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_officer_location_updates_officer_user_id
  ON app.officer_location_updates (officer_user_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_officer_location_updates_captured_at
  ON app.officer_location_updates (captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_officer_location_updates_location
  ON app.officer_location_updates
  USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_incident_assignments_report_id
  ON app.incident_assignments (report_id);

CREATE INDEX IF NOT EXISTS idx_incident_assignments_officer_user_id
  ON app.incident_assignments (officer_user_id);

CREATE INDEX IF NOT EXISTS idx_police_operation_history_officer_user_id
  ON app.police_operation_history (officer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_police_operation_history_report_id
  ON app.police_operation_history (report_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_police_operation_history_alert_id
  ON app.police_operation_history (alert_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_alert_targets_alert_id
  ON app.operational_alert_targets (alert_id);

CREATE INDEX IF NOT EXISTS idx_operational_alert_targets_admin_area_id
  ON app.operational_alert_targets (admin_area_id);

CREATE INDEX IF NOT EXISTS idx_operational_alert_targets_target_user_id
  ON app.operational_alert_targets (target_user_id);

CREATE INDEX IF NOT EXISTS idx_accident_reports_assigned_officer_id
  ON app.accident_reports (assigned_officer_id);

COMMIT;
