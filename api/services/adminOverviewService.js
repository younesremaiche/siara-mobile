const pool = require("../db");

const DASHBOARD_TIMEZONE = "Africa/Algiers";
const DEFAULT_RANGE = "24h";
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ACTIONABLE_REVIEW_QUEUE_STATUSES = ["pending", "flagged"];
const RANGE_CONFIG = Object.freeze({
  "1h": { ms: 60 * 60 * 1000, minutes: 60 },
  "24h": { ms: 24 * 60 * 60 * 1000, minutes: 1440 },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, minutes: 10080 },
  "30d": { ms: 30 * 24 * 60 * 60 * 1000, minutes: 43200 },
});

const NORMALIZED_CONFIDENCE_SQL = `
  CASE
    WHEN confidence_score IS NULL THEN NULL
    WHEN confidence_score <= 1.2 THEN confidence_score * 100
    ELSE confidence_score
  END
`;

function normalizeRange(range) {
  const normalized = String(range || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(RANGE_CONFIG, normalized)
    ? normalized
    : DEFAULT_RANGE;
}

function rangeToMinutes(range) {
  return RANGE_CONFIG[normalizeRange(range)].minutes;
}

function getRangeWindow(range, now = new Date()) {
  const normalizedRange = normalizeRange(range);
  const config = RANGE_CONFIG[normalizedRange];
  const currentStart = new Date(now.getTime() - config.ms);
  const previousStart = new Date(currentStart.getTime() - config.ms);

  return {
    range: normalizedRange,
    now,
    currentStart,
    previousStart,
    minutes: config.minutes,
  };
}

function roundNumber(value, digits = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const multiplier = 10 ** digits;
  return Math.round(parsed * multiplier) / multiplier;
}

function normalizeScoreValue(value, { digits = 0 } = {}) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = parsed <= 1.2 ? parsed * 100 : parsed;
  return roundNumber(normalized, digits);
}

function mapSeverityLabel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "low";
  }

  if (parsed >= 3) {
    return "high";
  }

  if (parsed === 2) {
    return "medium";
  }

  return "low";
}

function buildDisplayIncidentId(reportId) {
  const normalized = String(reportId || "").replace(/-/g, "").toUpperCase();
  if (!normalized) {
    return "INC-UNKNOWN";
  }

  return `INC-${normalized.slice(0, 6)}`;
}

function formatAgo(value, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "\u2014";
  }

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  const days = Math.floor(diffMs / dayMs);
  const hours = Math.floor((diffMs % dayMs) / hourMs);
  const minutes = Math.floor((diffMs % hourMs) / minuteMs);

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${Math.max(1, minutes)}m`;
}

function formatPercentTrend(current, previous) {
  const currentValue = Number(current);
  const previousValue = Number(previous);

  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
    return null;
  }

  if (previousValue === 0) {
    if (currentValue === 0) {
      return "0%";
    }

    return "+100%";
  }

  const deltaPct = Math.round(((currentValue - previousValue) / previousValue) * 100);
  return `${deltaPct >= 0 ? "+" : ""}${deltaPct}%`;
}

function formatSignedCountTrend(current, previous) {
  const delta = Number(current) - Number(previous);
  if (!Number.isFinite(delta)) {
    return null;
  }

  if (delta === 0) {
    return "0";
  }

  return `${delta >= 0 ? "+" : ""}${delta}`;
}

function formatPendingTrend(current, previous) {
  const delta = Number(current) - Number(previous);
  if (!Number.isFinite(delta)) {
    return null;
  }

  if (delta === 0) {
    return "0 new";
  }

  return delta > 0 ? `+${delta} new` : `${delta}`;
}

function formatSignedDecimalTrend(current, previous, digits = 1) {
  const delta = roundNumber(Number(current) - Number(previous), digits);
  if (!Number.isFinite(delta)) {
    return null;
  }

  const fixed = Number(delta).toFixed(digits);
  if (Number(fixed) === 0) {
    return fixed;
  }

  return `${Number(fixed) > 0 ? "+" : ""}${fixed}`;
}

function formatAiTrend(current, previous) {
  if (current == null) {
    return null;
  }

  if (previous == null) {
    return "stable";
  }

  const delta = roundNumber(Number(current) - Number(previous), 1);
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.1) {
    return "stable";
  }

  const fixed = Math.abs(delta).toFixed(1);
  return `${delta > 0 ? "+" : "-"}${fixed} pts`;
}

function distributePercentages(counts) {
  const entries = Object.entries(counts).map(([key, count]) => ({
    key,
    count: Number(count || 0),
  }));
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);

  if (total <= 0) {
    return { high: 0, medium: 0, low: 0 };
  }

  const raw = entries.map((entry) => {
    const exact = (entry.count / total) * 100;
    return {
      key: entry.key,
      base: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });

  let remaining = 100 - raw.reduce((sum, entry) => sum + entry.base, 0);
  raw.sort((left, right) => right.remainder - left.remainder);

  for (let index = 0; index < raw.length && remaining > 0; index += 1) {
    raw[index].base += 1;
    remaining -= 1;
  }

  return raw.reduce((accumulator, entry) => {
    accumulator[entry.key] = entry.base;
    return accumulator;
  }, { high: 0, medium: 0, low: 0 });
}

function buildPluralText(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildCriticalAlerts({ oldHighPendingCount, lowConfidencePredictionCount }) {
  const alerts = [];

  if (Number(oldHighPendingCount || 0) > 0) {
    const count = Number(oldHighPendingCount || 0);
    alerts.push({
      type: "queue",
      text: `${buildPluralText(count, "unreviewed high-severity incident")} older than 1 hour`,
      count,
      action: "Review Queue",
      route: "/admin/incidents",
    });
  }

  if (Number(lowConfidencePredictionCount || 0) > 0) {
    const count = Number(lowConfidencePredictionCount || 0);
    alerts.push({
      type: "ai",
      text: `AI confidence below 70% on ${buildPluralText(count, "recent prediction")}`,
      count,
      action: "View AI",
      route: "/admin/ai",
    });
  }

  return alerts;
}

async function fetchOverviewSummary({ currentStart, previousStart, minutes }, db = pool) {
  const result = await db.query(
    `
      WITH report_stats AS (
        SELECT
          count(*) FILTER (WHERE ar.created_at >= $1)::int AS current_incidents,
          count(*) FILTER (
            WHERE ar.created_at >= $2
              AND ar.created_at < $1
          )::int AS previous_incidents,
          count(*) FILTER (
            WHERE ar.status = 'pending'
              AND ar.created_at >= $1
          )::int AS current_pending_review,
          count(*) FILTER (
            WHERE ar.status = 'pending'
              AND ar.created_at >= $2
              AND ar.created_at < $1
          )::int AS previous_pending_review
        FROM app.accident_reports ar
      ),
      prediction_stats AS (
        -- predicted_at best represents when a prediction was produced; time_bucket is a safe fallback for older rows.
        SELECT
          round(
            avg(${NORMALIZED_CONFIDENCE_SQL}) FILTER (
              WHERE COALESCE(rp.predicted_at, rp.time_bucket) >= $1
            )::numeric,
            1
          ) AS current_ai_confidence,
          round(
            avg(${NORMALIZED_CONFIDENCE_SQL}) FILTER (
              WHERE COALESCE(rp.predicted_at, rp.time_bucket) >= $2
                AND COALESCE(rp.predicted_at, rp.time_bucket) < $1
            )::numeric,
            1
          ) AS previous_ai_confidence,
          count(*) FILTER (
            WHERE ${NORMALIZED_CONFIDENCE_SQL} < 70
              AND COALESCE(rp.predicted_at, rp.time_bucket) >= $1
          )::int AS low_confidence_predictions
        FROM ml.risk_predictions rp
      ),
      queue_alert_stats AS (
        SELECT count(*)::int AS old_high_pending_count
        FROM app.accident_reports ar
        LEFT JOIN LATERAL (
          SELECT
            aia.predicted_severity
          FROM app.report_ai_assessments aia
          WHERE aia.report_id = ar.id
          ORDER BY aia.assessed_at DESC, aia.updated_at DESC
          LIMIT 1
        ) latest_assessment ON true
        WHERE ar.status = 'pending'
          AND ar.created_at <= now() - interval '1 hour'
          AND COALESCE(latest_assessment.predicted_severity, ar.severity_hint, 0) >= 3
      ),
      active_alert_stats AS (
        -- Trigger log rows represent alerts that actually fired, which matches this KPI better than saved rules.
        SELECT count(*)::int AS active_alert_count
        FROM app.alert_trigger_log atl
        WHERE atl.matched_at >= $1
      )
      SELECT
        report_stats.current_incidents,
        report_stats.previous_incidents,
        report_stats.current_pending_review,
        report_stats.previous_pending_review,
        prediction_stats.current_ai_confidence,
        prediction_stats.previous_ai_confidence,
        prediction_stats.low_confidence_predictions,
        queue_alert_stats.old_high_pending_count,
        active_alert_stats.active_alert_count,
        $3::int AS range_minutes
      FROM report_stats
      CROSS JOIN prediction_stats
      CROSS JOIN queue_alert_stats
      CROSS JOIN active_alert_stats
    `,
    [currentStart, previousStart, minutes],
  );

  return result.rows[0] || {
    current_incidents: 0,
    previous_incidents: 0,
    current_pending_review: 0,
    previous_pending_review: 0,
    current_ai_confidence: null,
    previous_ai_confidence: null,
    low_confidence_predictions: 0,
    old_high_pending_count: 0,
    active_alert_count: 0,
    range_minutes: minutes,
  };
}

async function fetchZoneInsights({ currentStart, previousStart }, db = pool) {
  const result = await db.query(
    `
      WITH zoned_reports AS (
        SELECT
          aa.id AS area_id,
          aa.name AS area_name,
          ar.created_at,
          COALESCE(latest_assessment.predicted_severity, ar.severity_hint, 0) AS severity_value
        FROM app.accident_reports ar
        LEFT JOIN LATERAL (
          SELECT
            aia.predicted_severity
          FROM app.report_ai_assessments aia
          WHERE aia.report_id = ar.id
          ORDER BY aia.assessed_at DESC, aia.updated_at DESC
          LIMIT 1
        ) latest_assessment ON true
        JOIN gis.admin_areas aa
          ON aa.level = 'commune'
         AND ar.incident_location IS NOT NULL
         AND ST_Intersects(aa.geom, ar.incident_location::geometry)
        WHERE ar.created_at >= $2
      ),
      current_top_zones AS (
        SELECT
          zr.area_id,
          zr.area_name,
          count(*)::int AS incidents,
          max(zr.created_at) AS latest_created_at
        FROM zoned_reports zr
        WHERE zr.created_at >= $1
        GROUP BY zr.area_id, zr.area_name
        ORDER BY incidents DESC, latest_created_at DESC, area_name ASC
        LIMIT 4
      )
      SELECT
        count(DISTINCT zr.area_id) FILTER (
          WHERE zr.created_at >= $1
            AND zr.severity_value >= 3
        )::int AS current_high_risk_zones,
        count(DISTINCT zr.area_id) FILTER (
          WHERE zr.created_at >= $2
            AND zr.created_at < $1
            AND zr.severity_value >= 3
        )::int AS previous_high_risk_zones,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'zone', ctz.area_name,
                'incidents', ctz.incidents
              )
              ORDER BY ctz.incidents DESC, ctz.latest_created_at DESC, ctz.area_name ASC
            )
            FROM current_top_zones ctz
          ),
          '[]'::json
        ) AS top_risk_zones
      FROM zoned_reports zr
    `,
    [currentStart, previousStart],
  );

  return result.rows[0] || {
    current_high_risk_zones: 0,
    previous_high_risk_zones: 0,
    top_risk_zones: [],
  };
}

async function fetchReviewQueue(now = new Date(), db = pool) {
  const result = await db.query(
    `
      SELECT
        ar.id AS report_id,
        COALESCE(NULLIF(BTRIM(ar.location_label), ''), 'Unknown location') AS location,
        ar.status,
        ar.created_at,
        ar.severity_hint,
        latest_assessment.predicted_severity AS ai_severity_value,
        CASE
          WHEN lower(coalesce(latest_assessment.assessment_status, '')) IN ('completed', 'pending', 'failed')
            THEN lower(latest_assessment.assessment_status)
          ELSE NULL
        END AS confidence_status,
        CASE
          WHEN lower(coalesce(latest_assessment.assessment_status, '')) = 'completed'
            AND latest_assessment.confidence_score IS NOT NULL
            AND latest_assessment.confidence_score <= 1.2
            THEN latest_assessment.confidence_score * 100
          WHEN lower(coalesce(latest_assessment.assessment_status, '')) = 'completed'
            THEN latest_assessment.confidence_score
          ELSE NULL
        END AS confidence,
        NULL::numeric AS reporter_score
      FROM app.accident_reports ar
      LEFT JOIN LATERAL (
        SELECT
          aia.predicted_severity,
          aia.confidence_score,
          aia.assessment_status,
          aia.assessed_at,
          aia.updated_at
        FROM app.report_ai_assessments aia
        WHERE aia.report_id = ar.id
        ORDER BY aia.assessed_at DESC, aia.updated_at DESC
        LIMIT 1
      ) latest_assessment ON true
      WHERE ar.status = ANY($1::text[])
      ORDER BY confidence DESC NULLS LAST, ar.created_at DESC, ar.id DESC
    `,
    [ACTIONABLE_REVIEW_QUEUE_STATUSES],
  );

  return result.rows.map((row) => {
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    const confidenceStatus = String(row.confidence_status || "").trim().toLowerCase() || null;
    const hasCompletedAssessment = confidenceStatus === "completed";
    const confidence = normalizeScoreValue(row.confidence, { digits: 0 });
    const severityValue = hasCompletedAssessment && row.ai_severity_value != null
      ? row.ai_severity_value
      : row.severity_hint;

    return {
      displayId: buildDisplayIncidentId(row.report_id),
      reportId: row.report_id,
      location: row.location,
      severity: mapSeverityLabel(severityValue),
      confidence,
      confidenceStatus,
      status: row.status,
      reporterScore: null,
      ago: formatAgo(createdAt, now),
      createdAt: createdAt ? createdAt.toISOString() : null,
    };
  });
}

async function fetchWeeklyVolume(currentStart, db = pool) {
  const result = await db.query(
    `
      SELECT
        EXTRACT(ISODOW FROM timezone($2, ar.created_at))::int AS weekday_index,
        count(*)::int AS incident_count
      FROM app.accident_reports ar
      WHERE ar.created_at >= $1
      GROUP BY weekday_index
    `,
    [currentStart, DASHBOARD_TIMEZONE],
  );

  const countByWeekday = new Map(
    result.rows.map((row) => [Number(row.weekday_index), Number(row.incident_count || 0)]),
  );

  return WEEKDAY_LABELS.map((label, index) => ({
    label,
    count: countByWeekday.get(index + 1) || 0,
  }));
}

async function fetchSeverityDistribution(currentStart, db = pool) {
  const result = await db.query(
    `
      SELECT
        count(*) FILTER (WHERE ar.severity_hint >= 3)::int AS high_count,
        count(*) FILTER (WHERE ar.severity_hint = 2)::int AS medium_count,
        count(*) FILTER (WHERE COALESCE(ar.severity_hint, 0) <= 1)::int AS low_count
      FROM app.accident_reports ar
      WHERE ar.created_at >= $1
    `,
    [currentStart],
  );

  const row = result.rows[0] || {
    high_count: 0,
    medium_count: 0,
    low_count: 0,
  };

  return distributePercentages({
    high: row.high_count,
    medium: row.medium_count,
    low: row.low_count,
  });
}

function buildKpis(summaryRow, zoneRow, rangeMinutes) {
  const incidents = Number(summaryRow.current_incidents || 0);
  const previousIncidents = Number(summaryRow.previous_incidents || 0);
  const pendingReview = Number(summaryRow.current_pending_review || 0);
  const previousPendingReview = Number(summaryRow.previous_pending_review || 0);
  const aiConfidence = roundNumber(summaryRow.current_ai_confidence, 1);
  const previousAiConfidence = roundNumber(summaryRow.previous_ai_confidence, 1);
  const highRiskZones = Number(zoneRow.current_high_risk_zones || 0);
  const previousHighRiskZones = Number(zoneRow.previous_high_risk_zones || 0);
  const activeAlerts = Number(summaryRow.active_alert_count || 0);
  const reportsPerMin = roundNumber(incidents / rangeMinutes, 1);
  const previousReportsPerMin = roundNumber(previousIncidents / rangeMinutes, 1);

  return {
    incidents: {
      value: incidents,
      trend: formatPercentTrend(incidents, previousIncidents),
    },
    pendingReview: {
      value: pendingReview,
      trend: formatPendingTrend(pendingReview, previousPendingReview),
    },
    aiConfidence: {
      value: aiConfidence,
      trend: formatAiTrend(aiConfidence, previousAiConfidence),
    },
    highRiskZones: {
      value: highRiskZones,
      trend: formatSignedCountTrend(highRiskZones, previousHighRiskZones),
    },
    activeAlerts: {
      value: activeAlerts,
      trend: "live",
    },
    reportsPerMin: {
      value: reportsPerMin,
      trend: formatSignedDecimalTrend(reportsPerMin, previousReportsPerMin, 1),
    },
  };
}

async function getAdminOverview(range, db = pool) {
  const window = getRangeWindow(range);
  const [summaryRow, zoneRow, reviewQueue, weeklyVolume, severityDistribution] = await Promise.all([
    fetchOverviewSummary(window, db),
    fetchZoneInsights(window, db),
    fetchReviewQueue(window.now, db),
    fetchWeeklyVolume(window.currentStart, db),
    fetchSeverityDistribution(window.currentStart, db),
  ]);

  const topRiskZones = Array.isArray(zoneRow.top_risk_zones)
    ? zoneRow.top_risk_zones
    : [];

  return {
    criticalAlerts: buildCriticalAlerts({
      oldHighPendingCount: summaryRow.old_high_pending_count,
      lowConfidencePredictionCount: summaryRow.low_confidence_predictions,
    }),
    kpis: buildKpis(summaryRow, zoneRow, window.minutes),
    reviewQueue,
    weeklyVolume,
    severityDistribution,
    topRiskZones: topRiskZones.map((zone, index) => ({
      zone: zone.zone,
      incidents: Number(zone.incidents || 0),
      risk: index < 2 ? "high" : "medium",
    })),
  };
}

module.exports = {
  buildDisplayIncidentId,
  formatAgo,
  getAdminOverview,
  mapSeverityLabel,
  normalizeRange,
  rangeToMinutes,
};
