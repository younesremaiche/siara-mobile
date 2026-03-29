BEGIN;

CREATE OR REPLACE FUNCTION app.create_notifications_from_report()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_notification RECORD;
BEGIN
  FOR inserted_notification IN
    WITH report_context AS (
      SELECT
        NEW.id AS report_id,
        NEW.reported_by,
        NEW.incident_type,
        COALESCE(NULLIF(BTRIM(NEW.location_label), ''), 'Selected area') AS location_label,
        NEW.occurred_at,
        NEW.created_at,
        NEW.severity_hint,
        CASE
          WHEN COALESCE(NEW.severity_hint, 0) >= 3 THEN 'high'
          WHEN NEW.severity_hint = 2 THEN 'medium'
          ELSE 'low'
        END AS severity_label,
        app.notification_priority_from_severity(NEW.severity_hint) AS priority,
        app.notification_danger_score_from_severity(NEW.severity_hint) AS danger_score,
        ST_Y(NEW.incident_location::geometry) AS lat,
        ST_X(NEW.incident_location::geometry) AS lng
    ),
    matching_alerts AS (
      SELECT
        ar.id AS alert_id,
        ar.user_id,
        ar.name AS alert_name,
        ar.frequency_type,
        COALESCE(
          NULLIF(BTRIM(az.display_name), ''),
          NULLIF(BTRIM(admin_area.name), ''),
          NULLIF(BTRIM(road_segment.name), ''),
          report_context.location_label,
          'your zone'
        ) AS zone_name
      FROM report_context
      JOIN app.alert_rules ar
        ON ar.status = 'active'
       AND ar.delivery_app = TRUE
       AND ar.frequency_type IN ('immediate', 'first')
      JOIN app.alert_zones az
        ON az.alert_id = ar.id
      LEFT JOIN gis.admin_areas admin_area
        ON admin_area.id = az.admin_area_id
      LEFT JOIN gis.road_segments road_segment
        ON road_segment.id = az.road_segment_id
      WHERE ar.user_id IS NOT NULL
        AND report_context.incident_type = ANY(ar.incident_types)
        AND report_context.severity_label = ANY(ar.severity_levels)
        AND app.alert_time_range_matches(
          ar.time_range_type,
          ar.custom_time_start,
          ar.custom_time_end,
          report_context.occurred_at
        )
        AND (
          (az.admin_area_id IS NOT NULL AND admin_area.geom IS NOT NULL AND ST_Intersects(admin_area.geom, NEW.incident_location::geometry))
          OR (az.center IS NOT NULL AND az.radius_m IS NOT NULL AND ST_DWithin(NEW.incident_location, az.center, az.radius_m))
          OR (az.geom IS NOT NULL AND ST_Intersects(az.geom, NEW.incident_location::geometry))
          OR (
            az.road_segment_id IS NOT NULL
            AND road_segment.geom IS NOT NULL
            AND ST_DWithin(
              NEW.incident_location,
              road_segment.geom::geography,
              COALESCE(az.road_buffer_m, 100)
            )
          )
        )
        AND (
          ar.frequency_type <> 'first'
          OR NOT EXISTS (
            SELECT 1
            FROM app.alert_trigger_log atl
            WHERE atl.alert_id = ar.id
          )
        )
    ),
    inserted_logs AS (
      INSERT INTO app.alert_trigger_log (
        alert_id,
        source_kind,
        report_id,
        matched_at,
        delivery_status,
        delivered_app,
        delivered_email,
        delivered_sms,
        dedupe_key,
        message_preview,
        metadata
      )
      SELECT
        matching_alerts.alert_id,
        'report',
        report_context.report_id,
        NOW(),
        'matched',
        FALSE,
        FALSE,
        FALSE,
        FORMAT('report:%s:alert:%s', report_context.report_id, matching_alerts.alert_id),
        LEFT(FORMAT('%s in %s', INITCAP(report_context.incident_type), matching_alerts.zone_name), 250),
        jsonb_build_object(
          'title', FORMAT('New incident in %s', matching_alerts.zone_name),
          'incidentType', report_context.incident_type,
          'severity', report_context.severity_label,
          'dangerScore', report_context.danger_score,
          'reportId', report_context.report_id,
          'zoneName', matching_alerts.zone_name
        )
      FROM matching_alerts
      CROSS JOIN report_context
      ON CONFLICT (alert_id, report_id)
        WHERE report_id IS NOT NULL
        DO NOTHING
      RETURNING alert_id
    ),
    notification_candidates AS (
      SELECT
        matching_alerts.user_id,
        (ARRAY_AGG(matching_alerts.zone_name ORDER BY matching_alerts.alert_id))[1] AS zone_name,
        ARRAY_AGG(matching_alerts.alert_id ORDER BY matching_alerts.alert_id) AS matched_alert_ids,
        ARRAY_AGG(matching_alerts.alert_name ORDER BY matching_alerts.alert_id) AS matched_alert_names
      FROM matching_alerts
      GROUP BY matching_alerts.user_id
    ),
    inserted_notifications AS (
      INSERT INTO app.notifications (
        user_id,
        report_id,
        channel,
        status,
        priority,
        created_at,
        event_type,
        title,
        body,
        data
      )
      SELECT
        notification_candidates.user_id,
        report_context.report_id,
        'websocket',
        'pending',
        report_context.priority,
        NOW(),
        'INCIDENT_REPORTED_IN_ZONE',
        FORMAT('New incident in %s', COALESCE(notification_candidates.zone_name, 'your area')),
        FORMAT(
          '%s reported at %s. Danger: %s%%.',
          INITCAP(report_context.incident_type),
          TO_CHAR(timezone('Africa/Algiers', report_context.occurred_at), 'HH24:MI'),
          report_context.danger_score
        ),
        jsonb_build_object(
          'reportId', report_context.report_id,
          'zoneName', notification_candidates.zone_name,
          'incidentType', report_context.incident_type,
          'severity', report_context.severity_label,
          'dangerScore', report_context.danger_score,
          'locationLabel', report_context.location_label,
          'mapUrl', FORMAT('/map?reportId=%s', report_context.report_id),
          'reportUrl', FORMAT('/incident/%s', report_context.report_id),
          'latitude', report_context.lat,
          'longitude', report_context.lng,
          'matchedAlertIds', notification_candidates.matched_alert_ids,
          'matchedAlertNames', notification_candidates.matched_alert_names
        )
      FROM notification_candidates
      CROSS JOIN report_context
      WHERE EXISTS (
        SELECT 1
        FROM inserted_logs
        JOIN matching_alerts
          ON matching_alerts.alert_id = inserted_logs.alert_id
        WHERE matching_alerts.user_id = notification_candidates.user_id
      )
      ON CONFLICT (user_id, report_id, channel) DO NOTHING
      RETURNING *
    )
    SELECT *
    FROM inserted_notifications
  LOOP
    PERFORM pg_notify(
      'siara_notification_created',
      json_build_object(
        'id', inserted_notification.id,
        'userId', inserted_notification.user_id,
        'reportId', inserted_notification.report_id,
        'channel', inserted_notification.channel,
        'status', inserted_notification.status,
        'priority', inserted_notification.priority,
        'createdAt', inserted_notification.created_at,
        'eventType', inserted_notification.event_type,
        'title', inserted_notification.title,
        'body', inserted_notification.body,
        'data', inserted_notification.data
      )::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;

COMMIT;
