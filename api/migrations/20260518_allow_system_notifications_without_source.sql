-- Allow system/test notifications (TEST_PUSH and friends) to be inserted with
-- both report_id and operational_alert_id NULL. The previous constraint required
-- exactly one source, which made /api/notifications/test impossible without
-- inventing a fake report_id — that would have been worse than relaxing the
-- constraint, since fake foreign keys break referential integrity downstream.
--
-- Real notifications (INCIDENT_REPORTED_IN_ZONE, POLICE_INCIDENT_ASSIGNED, ...)
-- still must have exactly one source; only the explicit allowlist of system
-- event types can skip both.

BEGIN;

ALTER TABLE app.notifications
DROP CONSTRAINT IF EXISTS notifications_one_source_check;

ALTER TABLE app.notifications
ADD CONSTRAINT notifications_one_source_check
CHECK (
  (
    ((report_id IS NOT NULL)::integer + (operational_alert_id IS NOT NULL)::integer) = 1
  )
  OR (
    report_id IS NULL
    AND operational_alert_id IS NULL
    AND event_type IN (
      'TEST_PUSH',
      'SYSTEM_NOTIFICATION',
      'NOTIFICATION_TEST',
      'ACCOUNT_NOTIFICATION_TEST'
    )
  )
);

COMMIT;
