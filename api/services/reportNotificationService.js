const pool = require("../db");
const { mapNotificationRow } = require("./notificationsService");

const LISTEN_CHANNEL = "siara_notification_created";
const NOTIFICATION_DEBUG_ENABLED =
  process.env.NODE_ENV !== "production"
  || process.env.NOTIFICATION_DEBUG === "true";

function normalizeJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function buildRealtimeNotificationPayload(notification) {
  if (!notification) {
    return null;
  }

  return {
    id: notification.id,
    userId: notification.userId,
    reportId: notification.reportId,
    operationalAlertId: notification.operationalAlertId || null,
    channel: notification.channel,
    status: notification.status,
    priority: notification.priority,
    createdAt: notification.createdAt,
    sentAt: notification.sentAt || null,
    deliveredAt: notification.deliveredAt || null,
    readAt: notification.readAt || null,
    eventType: notification.eventType,
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
  };
}

async function emitRealtimeNotification(notification, db = pool) {
  const payload = buildRealtimeNotificationPayload(notification);
  if (!payload?.id || !payload?.userId) {
    return;
  }

  await db.query(
    `
      select pg_notify($1::text, $2::text)
    `,
    [LISTEN_CHANNEL, JSON.stringify(payload)],
  );
}

async function fetchReportNotificationDiagnostics(reportId, db = pool) {
  const result = await db.query(
    `
      select
        (
          select count(*)::int
          from app.alert_trigger_log atl
          where atl.report_id = $1
        ) as matched_rule_count,
        (
          select count(*)::int
          from app.notifications n
          where n.report_id = $1
        ) as notification_count,
        coalesce(
          (
            select json_agg(distinct atl.alert_id)
            from app.alert_trigger_log atl
            where atl.report_id = $1
          ),
          '[]'::json
        ) as matched_alert_ids
    `,
    [reportId],
  );

  return result.rows[0] || {
    matched_rule_count: 0,
    notification_count: 0,
    matched_alert_ids: [],
  };
}

async function createNotificationsForReport(reportId, db = pool) {
  const result = await db.query(
    `
      with report_context as (
        select
          ar.id as report_id,
          ar.reported_by,
          ar.incident_type,
          coalesce(nullif(btrim(ar.location_label), ''), 'Selected area') as location_label,
          ar.occurred_at,
          ar.created_at,
          ar.severity_hint,
          ar.incident_location,
          ar.incident_location::geometry as incident_geometry,
          case
            when coalesce(ar.severity_hint, 0) >= 3 then 'high'
            when ar.severity_hint = 2 then 'medium'
            else 'low'
          end as severity_label,
          app.notification_priority_from_severity(ar.severity_hint) as priority,
          app.notification_danger_score_from_severity(ar.severity_hint) as danger_score,
          ST_Y(ar.incident_location::geometry) as lat,
          ST_X(ar.incident_location::geometry) as lng
        from app.accident_reports ar
        where ar.id = $1::uuid
        limit 1
      ),
      matched_commune as (
        select
          area.id as commune_id,
          area.name as commune_name,
          area.parent_id as wilaya_id
        from report_context
        join gis.admin_areas area
          on area.level = 'commune'
         and area.geom is not null
         and ST_Intersects(area.geom, report_context.incident_geometry)
        order by area.id asc
        limit 1
      ),
      matched_wilaya as (
        select
          area.id as wilaya_id,
          area.name as wilaya_name
        from report_context
        join gis.admin_areas area
          on area.level = 'wilaya'
         and area.geom is not null
         and ST_Intersects(area.geom, report_context.incident_geometry)
        order by area.id asc
        limit 1
      ),
      point_resolution as (
        select
          report_context.report_id,
          matched_commune.commune_id,
          matched_commune.commune_name,
          coalesce(commune_parent.id, matched_wilaya.wilaya_id) as wilaya_id,
          coalesce(commune_parent.name, matched_wilaya.wilaya_name) as wilaya_name
        from report_context
        left join matched_commune
          on true
        left join gis.admin_areas commune_parent
          on commune_parent.id = matched_commune.wilaya_id
        left join matched_wilaya
          on true
      ),
      matching_alerts as (
        select
          ar.id as alert_id,
          ar.user_id,
          ar.name as alert_name,
          ar.frequency_type,
          az.zone_type as zone_record_type,
          az.admin_area_id,
          coalesce(
            nullif(btrim(az.display_name), ''),
            nullif(btrim(subscribed_admin_area.name), ''),
            nullif(btrim(commune_area.name), ''),
            nullif(btrim(wilaya_area.name), ''),
            report_context.location_label,
            'your zone'
          ) as zone_name,
          case
            when az.zone_type = 'radius' then 'radius'
            when az.zone_type = 'admin_area'
              and az.admin_area_id is not null
              and az.admin_area_id = point_resolution.commune_id then 'commune'
            when az.zone_type = 'admin_area'
              and az.admin_area_id is not null
              and az.admin_area_id = point_resolution.wilaya_id then 'wilaya'
            when az.zone_type = 'admin_area' then 'admin_area_spatial_fallback'
            else 'other'
          end as match_scope
        from report_context
        join point_resolution
          on point_resolution.report_id = report_context.report_id
        join app.alert_rules ar
          on ar.status = 'active'
         and ar.delivery_app = true
         and ar.frequency_type in ('immediate', 'first')
        join app.alert_zones az
          on az.alert_id = ar.id
        left join gis.admin_areas commune_area
          on commune_area.id = point_resolution.commune_id
        left join gis.admin_areas wilaya_area
          on wilaya_area.id = point_resolution.wilaya_id
        left join gis.admin_areas subscribed_admin_area
          on subscribed_admin_area.id = az.admin_area_id
        where ar.user_id is not null
          and report_context.incident_type = any(ar.incident_types)
          and report_context.severity_label = any(ar.severity_levels)
          and app.alert_time_range_matches(
            ar.time_range_type,
            ar.custom_time_start,
            ar.custom_time_end,
            report_context.occurred_at
          )
          and (
            (
              az.zone_type = 'radius'
              and az.center is not null
              and az.radius_m is not null
              and ST_DWithin(report_context.incident_location, az.center, az.radius_m)
            )
            or (
              az.zone_type = 'admin_area'
              and az.admin_area_id is not null
              and (
                az.admin_area_id = point_resolution.commune_id
                or az.admin_area_id = point_resolution.wilaya_id
                or (
                  subscribed_admin_area.geom is not null
                  and ST_Intersects(subscribed_admin_area.geom, report_context.incident_geometry)
                )
              )
            )
          )
          and (
            ar.frequency_type <> 'first'
            or not exists (
              select 1
              from app.alert_trigger_log atl
              where atl.alert_id = ar.id
            )
          )
      ),
      inserted_logs as (
        insert into app.alert_trigger_log (
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
        select
          matching_alerts.alert_id,
          'report',
          report_context.report_id,
          now(),
          'matched',
          false,
          false,
          false,
          format('report:%s:alert:%s', report_context.report_id, matching_alerts.alert_id),
          left(format('%s in %s', initcap(report_context.incident_type), matching_alerts.zone_name), 250),
          jsonb_build_object(
            'title', format('New incident in %s', matching_alerts.zone_name),
            'incidentType', report_context.incident_type,
            'severity', report_context.severity_label,
            'dangerScore', report_context.danger_score,
            'reportId', report_context.report_id,
            'reportedBy', report_context.reported_by,
            'zoneName', matching_alerts.zone_name
          )
        from matching_alerts
        cross join report_context
        on conflict (alert_id, report_id)
          where report_id is not null
          do nothing
        returning alert_id
      ),
      notification_candidates as (
        select
          matching_alerts.user_id,
          (array_agg(matching_alerts.zone_name order by matching_alerts.alert_id))[1] as zone_name,
          array_agg(matching_alerts.alert_id order by matching_alerts.alert_id) as matched_alert_ids,
          array_agg(matching_alerts.alert_name order by matching_alerts.alert_id) as matched_alert_names
        from matching_alerts
        group by matching_alerts.user_id
      ),
      inserted_notifications as (
        insert into app.notifications (
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
        select
          notification_candidates.user_id,
          report_context.report_id,
          'websocket',
          'pending',
          report_context.priority,
          now(),
          'INCIDENT_REPORTED_IN_ZONE',
          format('New incident in %s', coalesce(notification_candidates.zone_name, 'your area')),
          format(
            '%s reported at %s. Danger: %s%%.',
            initcap(report_context.incident_type),
            to_char(timezone('Africa/Algiers', report_context.occurred_at), 'HH24:MI'),
            report_context.danger_score
          ),
          jsonb_build_object(
            'reportId', report_context.report_id,
            'reportedBy', report_context.reported_by,
            'zoneName', notification_candidates.zone_name,
            'incidentType', report_context.incident_type,
            'severity', report_context.severity_label,
            'dangerScore', report_context.danger_score,
            'locationLabel', report_context.location_label,
            'mapUrl', format('/map?reportId=%s', report_context.report_id),
            'reportUrl', format('/incident/%s', report_context.report_id),
            'latitude', report_context.lat,
            'longitude', report_context.lng,
            'matchedAlertIds', notification_candidates.matched_alert_ids,
            'matchedAlertNames', notification_candidates.matched_alert_names
          )
        from notification_candidates
        cross join report_context
        where exists (
          select 1
          from inserted_logs
          join matching_alerts
            on matching_alerts.alert_id = inserted_logs.alert_id
          where matching_alerts.user_id = notification_candidates.user_id
        )
        on conflict (user_id, report_id, channel) do nothing
        returning *
      )
      select
        (select count(*)::int from matching_alerts) as matched_alert_count,
        (select count(*)::int from inserted_logs) as inserted_log_count,
        (select commune_id from point_resolution limit 1) as matched_commune_id,
        (select commune_name from point_resolution limit 1) as matched_commune_name,
        (select wilaya_id from point_resolution limit 1) as matched_wilaya_id,
        (select wilaya_name from point_resolution limit 1) as matched_wilaya_name,
        coalesce(
          (select json_agg(row_to_json(inserted_notifications)) from inserted_notifications),
          '[]'::json
        ) as notifications,
        coalesce(
          (select json_agg(distinct matching_alerts.alert_id) from matching_alerts),
          '[]'::json
        ) as matched_alert_ids,
        coalesce(
          (select json_agg(distinct matching_alerts.user_id) from matching_alerts),
          '[]'::json
        ) as recipient_user_ids,
        coalesce(
          (
            select json_agg(distinct matching_alerts.alert_id)
            from matching_alerts
            where matching_alerts.zone_record_type = 'radius'
          ),
          '[]'::json
        ) as matched_radius_alert_ids,
        coalesce(
          (
            select json_agg(distinct matching_alerts.alert_id)
            from matching_alerts
            where matching_alerts.zone_record_type = 'admin_area'
          ),
          '[]'::json
        ) as matched_admin_area_alert_ids
    `,
    [reportId],
  );

  const row = result.rows[0] || {};
  const notifications = normalizeJsonArray(row.notifications)
    .map((item) => mapNotificationRow(item))
    .filter(Boolean);

  for (const notification of notifications) {
    await emitRealtimeNotification(notification, db);
  }

  const summary = {
    reportId,
    matchedAlertCount: Number(row.matched_alert_count || 0),
    insertedLogCount: Number(row.inserted_log_count || 0),
    insertedNotificationCount: notifications.length,
    matchedCommuneId: row.matched_commune_id != null ? Number(row.matched_commune_id) : null,
    matchedCommuneName: row.matched_commune_name || null,
    matchedWilayaId: row.matched_wilaya_id != null ? Number(row.matched_wilaya_id) : null,
    matchedWilayaName: row.matched_wilaya_name || null,
    matchedAlertIds: normalizeJsonArray(row.matched_alert_ids),
    matchedRadiusAlertIds: normalizeJsonArray(row.matched_radius_alert_ids),
    matchedAdminAreaAlertIds: normalizeJsonArray(row.matched_admin_area_alert_ids),
    recipientUserIds: normalizeJsonArray(row.recipient_user_ids),
    notifications,
  };

  if (NOTIFICATION_DEBUG_ENABLED) {
    console.info("[notifications] report_zone_resolution", {
      reportId: summary.reportId,
      matched_commune_id: summary.matchedCommuneId,
      matched_commune_name: summary.matchedCommuneName,
      matched_wilaya_id: summary.matchedWilayaId,
      matched_wilaya_name: summary.matchedWilayaName,
    });
    console.info("[notifications] notification_created_for_report", {
      reportId: summary.reportId,
      matchedAlertCount: summary.matchedAlertCount,
      insertedLogCount: summary.insertedLogCount,
      app_inserted_notification_count: summary.insertedNotificationCount,
      matchedAlertIds: summary.matchedAlertIds,
      matched_commune_id: summary.matchedCommuneId,
      matched_wilaya_id: summary.matchedWilayaId,
      matched_radius_alert_ids: summary.matchedRadiusAlertIds,
      matched_admin_area_alert_ids: summary.matchedAdminAreaAlertIds,
      final_recipient_user_ids: summary.recipientUserIds,
    });
  }

  return summary;
}

module.exports = {
  createNotificationsForReport,
  fetchReportNotificationDiagnostics,
};
