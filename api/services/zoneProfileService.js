const pool = require("../db");

const DEFAULT_RADIUS_M = 500;
const MAX_RADIUS_M = 5000;
const MIN_RADIUS_M = 100;

const safeNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function pickDominantSeverity(counts) {
  const order = ["high", "medium", "low"];
  for (const sev of order) {
    if ((counts[sev] || 0) > 0) return sev;
  }
  return "low";
}

function severityFromHint(hint) {
  const n = Number(hint);
  if (!Number.isFinite(n)) return "low";
  if (n >= 4) return "high";
  if (n === 3) return "medium";
  return "low";
}

async function getZoneProfile({ lat, lng, radiusMeters } = {}) {
  const safeLat = safeNumber(lat);
  const safeLng = safeNumber(lng);
  if (safeLat == null || safeLng == null) {
    badRequest("lat and lng are required");
  }
  const safeRadius = Math.max(
    MIN_RADIUS_M,
    Math.min(MAX_RADIUS_M, Number(radiusMeters) || DEFAULT_RADIUS_M),
  );

  const sql = `
    WITH base AS (
      SELECT
        ar.id,
        ar.title,
        ar.description,
        ar.incident_type,
        ar.severity_hint,
        ar.created_at,
        ar.verified_by_officer_id,
        ar.review_verdict,
        ST_Y(ar.incident_location::geometry) AS lat,
        ST_X(ar.incident_location::geometry) AS lng,
        ar.location_label,
        EXTRACT(HOUR FROM ar.created_at AT TIME ZONE 'UTC')::int AS hour_utc,
        EXTRACT(DOW FROM ar.created_at AT TIME ZONE 'UTC')::int AS dow_utc,
        date_trunc('month', ar.created_at) AS month_bucket,
        CASE
          WHEN COALESCE(ar.severity_hint, 0) >= 4 THEN 'high'
          WHEN ar.severity_hint = 3 THEN 'medium'
          ELSE 'low'
        END AS severity_bucket
      FROM app.accident_reports ar
      WHERE ar.incident_location IS NOT NULL
        AND ST_DWithin(
          ar.incident_location::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
    )
    SELECT
      (SELECT COUNT(*)::int FROM base) AS total_count,
      (SELECT COUNT(*)::int FROM base WHERE severity_bucket = 'low') AS low_count,
      (SELECT COUNT(*)::int FROM base WHERE severity_bucket = 'medium') AS medium_count,
      (SELECT COUNT(*)::int FROM base WHERE severity_bucket = 'high') AS high_count,
      (SELECT COUNT(*)::int FROM base WHERE verified_by_officer_id IS NOT NULL) AS verified_count,
      (SELECT COUNT(*)::int FROM base WHERE created_at >= NOW() - INTERVAL '30 days') AS reports_last_30d,
      (SELECT COUNT(*)::int FROM base WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days') AS reports_prev_30d,
      (SELECT MAX(created_at) FROM base) AS latest_at,
      (
        SELECT json_agg(row_to_json(t)) FROM (
          SELECT incident_type AS type, COUNT(*)::int AS count
          FROM base
          GROUP BY incident_type
          ORDER BY count DESC
          LIMIT 5
        ) t
      ) AS common_types,
      (
        SELECT json_agg(row_to_json(t)) FROM (
          SELECT hour_utc AS hour, COUNT(*)::int AS count
          FROM base
          GROUP BY hour_utc
          ORDER BY count DESC
          LIMIT 3
        ) t
      ) AS hour_distribution,
      (
        SELECT json_agg(row_to_json(t)) FROM (
          SELECT dow_utc AS dow, COUNT(*)::int AS count
          FROM base
          GROUP BY dow_utc
          ORDER BY count DESC
          LIMIT 3
        ) t
      ) AS dow_distribution,
      (
        SELECT json_agg(row_to_json(t) ORDER BY t.month_bucket) FROM (
          SELECT month_bucket, COUNT(*)::int AS count
          FROM base
          WHERE created_at >= NOW() - INTERVAL '6 months'
          GROUP BY month_bucket
          ORDER BY month_bucket
        ) t
      ) AS monthly_trend,
      (
        SELECT json_agg(row_to_json(t)) FROM (
          SELECT id, title, severity_bucket, created_at, verified_by_officer_id IS NOT NULL AS verified, location_label
          FROM base
          ORDER BY created_at DESC
          LIMIT 8
        ) t
      ) AS recent_reports
  `;

  const result = await pool.query(sql, [safeLng, safeLat, safeRadius]);
  const row = result.rows[0] || {};

  const severityCounts = {
    low: Number(row.low_count) || 0,
    medium: Number(row.medium_count) || 0,
    high: Number(row.high_count) || 0,
  };
  const totalCount = Number(row.total_count) || 0;
  const dominantSeverity = pickDominantSeverity(severityCounts);

  const last30 = Number(row.reports_last_30d) || 0;
  const prev30 = Number(row.reports_prev_30d) || 0;
  let trend = "flat";
  let trendChangePercent = 0;
  if (prev30 === 0) {
    trend = last30 > 0 ? "increasing" : "flat";
    trendChangePercent = last30 > 0 ? 100 : 0;
  } else {
    const delta = ((last30 - prev30) / prev30) * 100;
    trendChangePercent = Math.round(delta);
    if (delta > 15) trend = "increasing";
    else if (delta < -15) trend = "decreasing";
  }

  const hourDistribution = Array.isArray(row.hour_distribution) ? row.hour_distribution : [];
  const peakHour = hourDistribution[0] ? Number(hourDistribution[0].hour) : null;
  const peakHourRange =
    peakHour != null && Number.isFinite(peakHour)
      ? {
          startHour: peakHour,
          endHour: (peakHour + 1) % 24,
          reportCount: Number(hourDistribution[0].count) || 0,
        }
      : null;

  const dowMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const peakDays = (Array.isArray(row.dow_distribution) ? row.dow_distribution : []).map((d) => ({
    label: dowMap[Number(d.dow)] || String(d.dow),
    count: Number(d.count) || 0,
  }));

  const commonReportTypes = (Array.isArray(row.common_types) ? row.common_types : []).map((t) => ({
    type: t.type || "unknown",
    label: String(t.type || "report").replace(/_/g, " "),
    count: Number(t.count) || 0,
  }));

  const monthlyTrend = (Array.isArray(row.monthly_trend) ? row.monthly_trend : []).map((m) => ({
    month: m.month_bucket ? new Date(m.month_bucket).toISOString().slice(0, 7) : null,
    count: Number(m.count) || 0,
  }));

  const recentReports = (Array.isArray(row.recent_reports) ? row.recent_reports : []).map((r) => ({
    reportId: r.id,
    title: r.title || `${severityFromHint(r.severity_hint)} report`,
    severityBucket: r.severity_bucket || "low",
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    verified: Boolean(r.verified),
    locationLabel: r.location_label || null,
  }));

  const avgRiskApprox = totalCount === 0
    ? 0
    : Math.min(
        100,
        Math.round(
          (severityCounts.low * 20 +
            severityCounts.medium * 45 +
            severityCounts.high * 85) /
            Math.max(1, totalCount),
        ),
      );

  return {
    center: { lat: safeLat, lng: safeLng },
    radiusMeters: safeRadius,
    reportCount: totalCount,
    avgRiskApprox,
    dominantSeverity,
    severityCounts,
    verifiedCount: Number(row.verified_count) || 0,
    latestReportAt: row.latest_at ? new Date(row.latest_at).toISOString() : null,
    reportsLast30Days: last30,
    reportsPrev30Days: prev30,
    trend,
    trendChangePercent,
    peakHourRange,
    peakDays,
    commonReportTypes,
    monthlyTrend,
    recentReports,
  };
}

module.exports = {
  getZoneProfile,
};
