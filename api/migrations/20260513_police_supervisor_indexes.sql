-- Migration: 20260513_police_supervisor_indexes
-- Purpose: Safe spatial / lookup indexes that benefit the police-supervisor
-- module (officer location queries, incident geo lookups, zone targeting).
-- Each statement is idempotent. Spatial indexes that reference columns whose
-- presence is not guaranteed are wrapped in DO blocks so the migration is safe
-- to run on environments where the operational_alerts geometry columns were
-- not provisioned.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_accident_reports_incident_location_gist
  ON app.accident_reports
  USING GIST (incident_location);

CREATE INDEX IF NOT EXISTS idx_admin_areas_geom_gist
  ON gis.admin_areas
  USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_road_segments_geom_gist
  ON gis.road_segments
  USING GIST (geom);

-- officer_location_updates already gets a GIST index in
-- 20260422_police_module.sql (idx_officer_location_updates_location); keep this
-- here as a defensive idempotent re-declaration in case the older migration
-- was skipped on some environment.
CREATE INDEX IF NOT EXISTS idx_officer_location_updates_location_gist
  ON app.officer_location_updates
  USING GIST (location);

-- Supervisor officer-lookup acceleration: filtering by supervisor_user_id is
-- the hot path for /police/supervisor/officers and assignment routes.
CREATE INDEX IF NOT EXISTS idx_police_profiles_supervisor_user_id_btree
  ON app.police_profiles (supervisor_user_id)
  WHERE supervisor_user_id IS NOT NULL;

-- operational_alerts may or may not carry geometry columns depending on the
-- schema variant. Only create the GIST indexes if the columns exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'operational_alerts'
      AND column_name = 'geom'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_operational_alerts_geom_gist
             ON app.operational_alerts USING GIST (geom)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'operational_alerts'
      AND column_name = 'center'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_operational_alerts_center_gist
             ON app.operational_alerts USING GIST (center)';
  END IF;
END $$;

COMMIT;
