-- Collapse severity vocabulary to three buckets: low, medium, high.
-- This migration:
--   1. Normalises any persisted severity strings ('critical' / 'extreme' / 'moderate')
--      to the new 3-bucket set in tables that store severity as free-form text.
--   2. Renames ml.zone_risk_summary.critical_alert_count -> high_severity_alert_count.
-- Apply manually (this repo has no migration runner).

BEGIN;

-- 1. Normalise persisted severity strings.
UPDATE app.operational_alerts
SET severity = CASE LOWER(severity)
    WHEN 'critical' THEN 'high'
    WHEN 'extreme'  THEN 'high'
    WHEN 'moderate' THEN 'medium'
    ELSE severity
END
WHERE LOWER(severity) IN ('critical', 'extreme', 'moderate');

-- Travel histories store overall_risk_level as free-form text.
UPDATE app.travel_histories
SET overall_risk_level = CASE LOWER(overall_risk_level)
    WHEN 'critical' THEN 'high'
    WHEN 'extreme'  THEN 'high'
    WHEN 'moderate' THEN 'medium'
    ELSE overall_risk_level
END
WHERE LOWER(overall_risk_level) IN ('critical', 'extreme', 'moderate');

-- 2. Rename the critical_alert_count column on the zone-risk summary table.
ALTER TABLE ml.zone_risk_summary
    RENAME COLUMN critical_alert_count TO high_severity_alert_count;

COMMIT;
