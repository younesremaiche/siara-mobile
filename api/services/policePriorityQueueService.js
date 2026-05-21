const pool = require("../db");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const SEVERITY_BUCKET_FROM_HINT = (hint) => {
  const n = Number(hint);
  if (!Number.isFinite(n)) return "low";
  if (n >= 4) return "high";
  if (n === 3) return "medium";
  return "low";
};

const SEVERITY_BUCKET_RANK = {
  low: 0,
  medium: 30,
  high: 100,
};

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function ageHours(createdAt) {
  if (!createdAt) return null;
  const ms = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, ms / (1000 * 60 * 60));
}

function recencyBoost(hours) {
  if (hours == null) return 0;
  if (hours <= 1) return 30;
  if (hours <= 6) return 20;
  if (hours <= 24) return 10;
  if (hours <= 72) return 4;
  return 0;
}

function communityBoost(report) {
  const sawIt = safeNumber(report.saw_it_too_count);
  const likes = safeNumber(report.likes_count);
  const comments = safeNumber(report.comments_count);
  return Math.min(30, sawIt * 4 + likes * 2 + comments * 3);
}

function nearbyClusterBoost(densityRow) {
  const reports = safeNumber(densityRow?.reports_within_500m);
  const verified = safeNumber(densityRow?.verified_within_500m);
  return Math.min(20, reports * 2 + verified * 3);
}

function buildReasons(report, scoring) {
  const reasons = [];
  const sevBucket = SEVERITY_BUCKET_FROM_HINT(report.severity_hint);
  if (sevBucket === "high") {
    reasons.push({
      kind: "severity",
      label: "High severity",
    });
  }
  if (report.verified_by_officer_id) {
    reasons.push({ kind: "verified", label: "Police-verified" });
  }
  if (safeNumber(report.saw_it_too_count) >= 2) {
    reasons.push({
      kind: "community",
      label: `${report.saw_it_too_count} drivers confirmed`,
    });
  }
  if (safeNumber(scoring.densityRow?.reports_within_500m) >= 3) {
    reasons.push({
      kind: "cluster",
      label: `${scoring.densityRow.reports_within_500m} other reports nearby`,
    });
  }
  const hours = scoring.ageHours;
  if (hours != null && hours <= 1) {
    reasons.push({ kind: "recency", label: "Reported in the last hour" });
  } else if (hours != null && hours <= 6) {
    reasons.push({ kind: "recency", label: "Reported within the last 6 hours" });
  }
  if (String(report.review_verdict || "").toLowerCase() === "verified") {
    reasons.push({ kind: "verified", label: "Verified review" });
  }
  return reasons.slice(0, 5);
}

async function getPriorityQueue({ limit = DEFAULT_LIMIT, includeStatuses = ["pending", "under_review"] } = {}) {
  const safeLimit = clamp(Number(limit) || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const statuses = Array.isArray(includeStatuses) && includeStatuses.length > 0
    ? includeStatuses
    : ["pending", "under_review"];

  const sql = `
    WITH recent AS (
      SELECT
        ar.id,
        ar.title,
        ar.description,
        ar.incident_type,
        ar.severity_hint,
        ar.status,
        ar.review_verdict,
        ar.created_at,
        ar.location_label,
        ST_Y(ar.incident_location::geometry) AS lat,
        ST_X(ar.incident_location::geometry) AS lng,
        ar.assigned_officer_id,
        ar.verified_by_officer_id,
        ar.verified_at,
        ar.comments_count,
        ar.likes_count,
        ar.saw_it_too_count,
        ar.latest_predicted_label,
        ar.latest_spam_score,
        ar.incident_location
      FROM app.accident_reports ar
      WHERE ar.status = ANY ($1::text[])
        AND ar.incident_location IS NOT NULL
        AND COALESCE(ar.latest_predicted_label, 'real') <> 'spam'
      ORDER BY ar.created_at DESC
      LIMIT 200
    ),
    density AS (
      SELECT
        r.id,
        (
          SELECT COUNT(*)::int
          FROM app.accident_reports nb
          WHERE nb.id <> r.id
            AND nb.incident_location IS NOT NULL
            AND nb.created_at >= NOW() - INTERVAL '7 days'
            AND ST_DWithin(
              nb.incident_location::geography,
              r.incident_location::geography,
              500
            )
        ) AS reports_within_500m,
        (
          SELECT COUNT(*)::int
          FROM app.accident_reports nbv
          WHERE nbv.id <> r.id
            AND nbv.incident_location IS NOT NULL
            AND nbv.verified_by_officer_id IS NOT NULL
            AND nbv.created_at >= NOW() - INTERVAL '14 days'
            AND ST_DWithin(
              nbv.incident_location::geography,
              r.incident_location::geography,
              500
            )
        ) AS verified_within_500m
      FROM recent r
    )
    SELECT
      r.*,
      d.reports_within_500m,
      d.verified_within_500m
    FROM recent r
    LEFT JOIN density d ON d.id = r.id
  `;

  const result = await pool.query(sql, [statuses]);
  const rows = result.rows || [];

  const items = rows.map((row) => {
    const sevBucket = SEVERITY_BUCKET_FROM_HINT(row.severity_hint);
    const sevBase = SEVERITY_BUCKET_RANK[sevBucket] || 0;
    const ageH = ageHours(row.created_at);
    const recency = recencyBoost(ageH);
    const community = communityBoost(row);
    const cluster = nearbyClusterBoost({
      reports_within_500m: row.reports_within_500m,
      verified_within_500m: row.verified_within_500m,
    });
    const verifiedBoost = row.verified_by_officer_id ? 10 : 0;
    const spamPenalty = (() => {
      const label = String(row.latest_predicted_label || "").toLowerCase();
      const spam = Number(row.latest_spam_score) || 0;
      if (label === "spam" || spam >= 75) return 40;
      if (spam >= 55) return 18;
      return 0;
    })();
    const score = clamp(
      Math.round(sevBase + recency + community + cluster + verifiedBoost - spamPenalty),
      0,
      200,
    );

    const priorityLevel = (() => {
      if (score >= 110) return "P1";
      if (score >= 70) return "P2";
      if (score >= 40) return "P3";
      return "P4";
    })();

    return {
      reportId: row.id,
      title: row.title || `${SEVERITY_BUCKET_FROM_HINT(row.severity_hint).toUpperCase()} ${String(row.incident_type || "incident").replace(/_/g, " ")}`,
      descriptionSnippet:
        typeof row.description === "string" ? row.description.slice(0, 200) : null,
      incidentType: row.incident_type || null,
      severity: sevBucket,
      severityHint: Number(row.severity_hint) || 0,
      status: row.status,
      reviewVerdict: row.review_verdict || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      locationLabel: row.location_label || null,
      lat: row.lat != null ? Number(row.lat) : null,
      lng: row.lng != null ? Number(row.lng) : null,
      assignedOfficerId: row.assigned_officer_id || null,
      verifiedByOfficerId: row.verified_by_officer_id || null,
      verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
      sawItTooCount: Number(row.saw_it_too_count) || 0,
      commentsCount: Number(row.comments_count) || 0,
      likesCount: Number(row.likes_count) || 0,
      reportsWithin500m: Number(row.reports_within_500m) || 0,
      verifiedWithin500m: Number(row.verified_within_500m) || 0,
      priorityScore: score,
      priorityLevel,
      reasons: buildReasons(row, {
        densityRow: {
          reports_within_500m: row.reports_within_500m,
          verified_within_500m: row.verified_within_500m,
        },
        ageHours: ageH,
      }),
    };
  });

  items.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    items: items.slice(0, safeLimit),
    pagination: { limit: safeLimit, total: items.length },
  };
}

module.exports = {
  getPriorityQueue,
};
