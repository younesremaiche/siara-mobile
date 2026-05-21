const createError = require("http-errors");

const pool = require("../db");
const { hasAnyRole, POLICE_SUPERVISOR_ROLE_NAMES, hasRole } = require("../contollers/verifytoken");

function normalizeRoleName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function assertSupervisorUser(user) {
  const isSupervisor =
    hasAnyRole(user, POLICE_SUPERVISOR_ROLE_NAMES) || hasRole(user, "admin");

  if (!isSupervisor) {
    throw createError(403, "Supervisor access is required");
  }
}

function getSupervisorZoneFilter(query, isAdmin) {
  return {
    wilayaId: !isAdmin && query.wilayaId ? Number(query.wilayaId) : null,
    communeId: !isAdmin && query.communeId ? Number(query.communeId) : null,
  };
}

async function getSupervisorDashboard(supervisorUser, query = {}, db = pool) {
  assertSupervisorUser(supervisorUser);

  const isAdmin = hasRole(supervisorUser, "admin");

  const [
    statsResult,
    officerResult,
    highSeverityResult,
    activityResult,
    mapResult,
  ] = await Promise.all([
    db.query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE ar.status NOT IN ('resolved', 'rejected', 'archived')
          )::int AS active_count,
          COUNT(*) FILTER (
            WHERE ar.status NOT IN ('resolved', 'rejected', 'archived')
              AND COALESCE(ar.severity_hint, 0) >= 3
          )::int AS high_severity_count,
          COUNT(*) FILTER (
            WHERE ar.status = 'pending'
          )::int AS pending_verification_count,
          ROUND(
            AVG(
              EXTRACT(EPOCH FROM (
                COALESCE(ar.verified_at, ar.updated_at) - ar.created_at
              )) * 1000
            ) FILTER (WHERE ar.status IN ('verified', 'resolved'))
          )::bigint AS avg_response_time_ms
        FROM app.accident_reports ar
        WHERE ar.created_at >= NOW() - INTERVAL '30 days'
      `,
    ),
    db.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE pp.is_on_duty = TRUE)::int AS on_duty,
          COUNT(*) FILTER (WHERE pp.is_on_duty = FALSE)::int AS off_duty,
          COUNT(*)::int AS total
        FROM app.police_profiles pp
        JOIN auth.users u ON u.id = pp.user_id
        WHERE u.is_active = TRUE
      `,
    ),
    db.query(
      `
        SELECT
          ar.id,
          ar.title,
          ar.status,
          ar.severity_hint,
          ar.location_label,
          ar.occurred_at,
          ar.created_at,
          ST_Y(ar.incident_location::geometry) AS lat,
          ST_X(ar.incident_location::geometry) AS lng,
          CONCAT_WS(' ', assigned.first_name, assigned.last_name) AS assigned_officer_name
        FROM app.accident_reports ar
        LEFT JOIN auth.users assigned ON assigned.id = ar.assigned_officer_id
        WHERE ar.status NOT IN ('resolved', 'rejected', 'archived')
          AND COALESCE(ar.severity_hint, 0) >= 3
        ORDER BY COALESCE(ar.severity_hint, 0) DESC, ar.created_at DESC
        LIMIT 8
      `,
    ),
    db.query(
      `
        SELECT
          h.action_type,
          h.note,
          h.created_at,
          CONCAT_WS(' ', u.first_name, u.last_name) AS officer_name,
          ar.title AS report_title
        FROM app.police_operation_history h
        LEFT JOIN auth.users u ON u.id = h.officer_user_id
        LEFT JOIN app.accident_reports ar ON ar.id = h.report_id
        WHERE h.action_type != 'location_update'
        ORDER BY h.created_at DESC
        LIMIT 15
      `,
    ),
    db.query(
      `
        SELECT
          ar.id,
          ar.title,
          ar.status,
          ar.severity_hint,
          ST_Y(ar.incident_location::geometry) AS lat,
          ST_X(ar.incident_location::geometry) AS lng,
          ar.location_label,
          CONCAT_WS(' ', assigned.first_name, assigned.last_name) AS assigned_officer_name
        FROM app.accident_reports ar
        LEFT JOIN auth.users assigned ON assigned.id = ar.assigned_officer_id
        WHERE ar.status NOT IN ('resolved', 'rejected', 'archived')
          AND ar.incident_location IS NOT NULL
        ORDER BY COALESCE(ar.severity_hint, 0) DESC, ar.created_at DESC
        LIMIT 100
      `,
    ),
  ]);

  const stats = statsResult.rows[0] || {};
  const officerStats = officerResult.rows[0] || {};

  return {
    stats: {
      activeIncidents: Number(stats.active_count || 0),
      highSeverityIncidents: Number(stats.high_severity_count || 0),
      pendingVerification: Number(stats.pending_verification_count || 0),
      activeOfficers: Number(officerStats.on_duty || 0),
      totalOfficers: Number(officerStats.total || 0),
      avgResponseTimeMs: stats.avg_response_time_ms ? Number(stats.avg_response_time_ms) : null,
    },
    officerStatus: {
      onDuty: Number(officerStats.on_duty || 0),
      offDuty: Number(officerStats.off_duty || 0),
      total: Number(officerStats.total || 0),
    },
    highSeverityIncidents: highSeverityResult.rows.map((row) => ({
      id: row.id,
      title: row.title || "",
      status: row.status,
      severity: row.severity_hint >= 3 ? "high" : "medium",
      severityHint: Number(row.severity_hint || 0),
      locationLabel: row.location_label || "",
      assignedOfficerName: row.assigned_officer_name || null,
      occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      location: {
        lat: row.lat == null ? null : Number(row.lat),
        lng: row.lng == null ? null : Number(row.lng),
      },
    })),
    recentActivity: activityResult.rows.map((row) => ({
      actionType: row.action_type,
      note: row.note || null,
      officerName: row.officer_name || "Unknown Officer",
      reportTitle: row.report_title || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    })),
    mapMarkers: mapResult.rows.map((row) => ({
      id: row.id,
      title: row.title || "",
      status: row.status,
      severityHint: Number(row.severity_hint || 0),
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      locationLabel: row.location_label || "",
      assignedOfficerName: row.assigned_officer_name || null,
    })),
  };
}

async function getSupervisorAnalytics(supervisorUser, query = {}, db = pool) {
  assertSupervisorUser(supervisorUser);

  const days = Math.min(Math.max(Number(query.days || 30), 7), 90);

  const [
    byStatusResult,
    bySeverityResult,
    avgResponseResult,
    busiestZonesResult,
    officerWorkloadResult,
    trendResult,
  ] = await Promise.all([
    db.query(
      `
        SELECT status, COUNT(*)::int AS count
        FROM app.accident_reports
        WHERE created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY status
        ORDER BY count DESC
      `,
      [days],
    ),
    db.query(
      `
        SELECT
          CASE
            WHEN COALESCE(severity_hint, 0) >= 3 THEN 'high'
            WHEN COALESCE(severity_hint, 0) = 2 THEN 'medium'
            ELSE 'low'
          END AS severity,
          COUNT(*)::int AS count
        FROM app.accident_reports
        WHERE created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY severity
        ORDER BY MIN(COALESCE(severity_hint, 0)) DESC
      `,
      [days],
    ),
    db.query(
      `
        SELECT
          ROUND(
            AVG(
              EXTRACT(EPOCH FROM (
                COALESCE(verified_at, updated_at) - created_at
              )) * 1000
            ) FILTER (WHERE status IN ('verified', 'resolved'))
          )::bigint AS avg_ms,
          ROUND(
            AVG(
              EXTRACT(EPOCH FROM (
                resolved_at - created_at
              )) * 1000
            ) FILTER (WHERE status = 'resolved' AND resolved_at IS NOT NULL)
          )::bigint AS avg_resolution_ms,
          COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
          COUNT(*)::int AS total_count
        FROM app.accident_reports
        WHERE created_at >= NOW() - ($1 || ' days')::interval
      `,
      [days],
    ),
    db.query(
      `
        SELECT
          COALESCE(ar.location_label, 'Unknown') AS zone_name,
          COUNT(ar.id)::int AS incident_count
        FROM app.accident_reports ar
        WHERE ar.created_at >= NOW() - ($1 || ' days')::interval
          AND ar.location_label IS NOT NULL
          AND ar.location_label != ''
        GROUP BY ar.location_label
        ORDER BY incident_count DESC
        LIMIT 10
      `,
      [days],
    ),
    db.query(
      `
        SELECT
          CONCAT_WS(' ', u.first_name, u.last_name) AS officer_name,
          COUNT(ar.id) FILTER (WHERE ar.status NOT IN ('resolved', 'rejected', 'archived'))::int AS active_incidents,
          COUNT(ar.id)::int AS total_incidents
        FROM auth.users u
        JOIN auth.user_roles ur ON ur.user_id = u.id
        JOIN auth.roles r ON r.id = ur.role_id AND LOWER(r.name) = 'police'
        LEFT JOIN app.accident_reports ar
          ON ar.assigned_officer_id = u.id
          AND ar.created_at >= NOW() - ($1 || ' days')::interval
        WHERE u.is_active = TRUE
        GROUP BY u.id, u.first_name, u.last_name
        ORDER BY active_incidents DESC, total_incidents DESC
        LIMIT 10
      `,
      [days],
    ),
    db.query(
      `
        SELECT
          DATE_TRUNC('day', created_at AT TIME ZONE 'Africa/Algiers') AS day,
          COUNT(*)::int AS count
        FROM app.accident_reports
        WHERE created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY day
        ORDER BY day ASC
      `,
      [days],
    ),
  ]);

  const responseStats = avgResponseResult.rows[0] || {};
  const totalCount = Number(responseStats.total_count || 0);
  const resolvedCount = Number(responseStats.resolved_count || 0);

  return {
    period: { days },
    incidentsByStatus: byStatusResult.rows.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {}),
    incidentsBySeverity: bySeverityResult.rows.reduce((acc, row) => {
      acc[row.severity] = row.count;
      return acc;
    }, {}),
    responseMetrics: {
      avgResponseTimeMs: responseStats.avg_ms ? Number(responseStats.avg_ms) : null,
      avgResolutionTimeMs: responseStats.avg_resolution_ms
        ? Number(responseStats.avg_resolution_ms)
        : null,
      resolutionRate: totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0,
      totalIncidents: totalCount,
      resolvedIncidents: resolvedCount,
    },
    busiestZones: busiestZonesResult.rows.map((row) => ({
      name: row.zone_name,
      level: row.level,
      count: row.incident_count,
    })),
    officerWorkload: officerWorkloadResult.rows.map((row) => ({
      name: row.officer_name || "Unknown",
      activeIncidents: row.active_incidents,
      totalIncidents: row.total_incidents,
    })),
    trendByDay: trendResult.rows.map((row) => ({
      date: row.day ? new Date(row.day).toISOString().slice(0, 10) : null,
      count: row.count,
    })),
  };
}

async function getSupervisorGlobalMap(supervisorUser, db = pool) {
  assertSupervisorUser(supervisorUser);

  const [incidentsResult, officersResult] = await Promise.all([
    db.query(
      `
        SELECT
          ar.id,
          ar.title,
          ar.status,
          ar.severity_hint,
          ar.location_label,
          ar.occurred_at,
          ar.created_at,
          ST_Y(ar.incident_location::geometry) AS lat,
          ST_X(ar.incident_location::geometry) AS lng,
          CONCAT_WS(' ', assigned.first_name, assigned.last_name) AS assigned_officer_name,
          assigned.id AS assigned_officer_id
        FROM app.accident_reports ar
        LEFT JOIN auth.users assigned ON assigned.id = ar.assigned_officer_id
        WHERE ar.status NOT IN ('resolved', 'rejected', 'archived')
          AND ar.incident_location IS NOT NULL
        ORDER BY COALESCE(ar.severity_hint, 0) DESC, ar.created_at DESC
        LIMIT 200
      `,
    ),
    db.query(
      `
        SELECT
          u.id,
          CONCAT_WS(' ', u.first_name, u.last_name) AS full_name,
          pp.badge_number,
          pp.rank,
          pp.is_on_duty,
          ST_Y(latest_loc.location::geometry) AS lat,
          ST_X(latest_loc.location::geometry) AS lng,
          latest_loc.captured_at,
          active_commune.name AS commune_name,
          active_wilaya.name AS wilaya_name
        FROM app.police_profiles pp
        JOIN auth.users u ON u.id = pp.user_id
        LEFT JOIN LATERAL (
          SELECT *
          FROM app.officer_location_updates loc
          WHERE loc.officer_user_id = u.id
          ORDER BY loc.captured_at DESC, loc.id DESC
          LIMIT 1
        ) latest_loc ON TRUE
        LEFT JOIN app.police_work_zone_assignments wza_commune
          ON wza_commune.officer_user_id = u.id
         AND wza_commune.zone_level = 'commune'
         AND wza_commune.is_active = TRUE
        LEFT JOIN gis.admin_areas active_commune ON active_commune.id = wza_commune.admin_area_id
        LEFT JOIN app.police_work_zone_assignments wza_wilaya
          ON wza_wilaya.officer_user_id = u.id
         AND wza_wilaya.zone_level = 'wilaya'
         AND wza_wilaya.is_active = TRUE
        LEFT JOIN gis.admin_areas active_wilaya ON active_wilaya.id = wza_wilaya.admin_area_id
        WHERE u.is_active = TRUE
        ORDER BY pp.is_on_duty DESC, u.first_name ASC
      `,
    ),
  ]);

  return {
    incidents: incidentsResult.rows.map((row) => ({
      id: row.id,
      title: row.title || "",
      status: row.status,
      severityHint: Number(row.severity_hint || 0),
      severity:
        row.severity_hint >= 3
          ? "high"
          : row.severity_hint >= 2
            ? "medium"
            : "low",
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      locationLabel: row.location_label || "",
      assignedOfficerName: row.assigned_officer_name || null,
      assignedOfficerId: row.assigned_officer_id || null,
      occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    })),
    officers: officersResult.rows.map((row) => ({
      id: row.id,
      name: row.full_name || "Officer",
      badgeNumber: row.badge_number || null,
      rank: row.rank || null,
      isOnDuty: Boolean(row.is_on_duty),
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      locationCapturedAt: row.captured_at ? new Date(row.captured_at).toISOString() : null,
      communeName: row.commune_name || null,
      wilayaName: row.wilaya_name || null,
    })),
  };
}

module.exports = {
  getSupervisorDashboard,
  getSupervisorAnalytics,
  getSupervisorGlobalMap,
};
