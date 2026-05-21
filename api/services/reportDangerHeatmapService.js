const pool = require("../db");

// Heatmap shows ALL accident-type reports by default. The caller can opt
// into a time window via ?hours=24 / ?range=7d, but if no value is given we
// do NOT filter by time — every accident report in the database
// contributes to a cluster.
const MAX_HOURS = 24 * 365; // 1 year cap when an explicit window is given
const MIN_HOURS = 1;
const DEFAULT_DBSCAN_EPS_DEG = 0.0025; // ~250 m at the equator
const DBSCAN_MINPOINTS = 1;
const CLUSTER_RESULT_LIMIT = 2000;
const ACCIDENT_INCIDENT_TYPE = "accident";

// Severity colour stops used by the frontend ring renderer. Kept in sync with
// the heatmap legend in client/src/styles/AccidentHeatmap.css.
const SEVERITY_COLORS = {
  low: "#3B82F6",
  medium: "#FACC15",
  high: "#DC2626",
};

const SEVERITY_ORDER = ["high", "medium", "low"];
const SEVERITY_WEIGHTS = { low: 1, medium: 3, high: 8 };

function logHeatmap(message, payload) {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[report-danger-heatmap] ${message}`, payload || {});
  }
}

// Returns the requested time window in hours, or null if the caller did
// not supply one. A null result means "do not filter by time — show all
// accident reports".
function parseHoursFromRequest(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (!text || text === "all" || text === "any") return null;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(numeric)));
  }
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([hd])$/);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (Number.isFinite(amount) && amount > 0) {
      const hours = unit === "d" ? amount * 24 : amount;
      return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(hours)));
    }
  }
  return null;
}

function parseBounds(input) {
  if (!input || typeof input !== "object") return null;
  const north = Number(input.north);
  const south = Number(input.south);
  const east = Number(input.east);
  const west = Number(input.west);
  if (
    !Number.isFinite(north) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(west)
  ) {
    return null;
  }
  if (north <= south || east <= west) return null;
  return { north, south, east, west };
}

function clusterEpsForZoom(zoom) {
  // Smaller eps at high zooms (closer in) so nearby reports stay separate;
  // larger eps when zoomed out so distant reports merge into one circle.
  const value = Number(zoom);
  if (!Number.isFinite(value)) return DEFAULT_DBSCAN_EPS_DEG;
  if (value >= 16) return 0.0008;
  if (value >= 14) return 0.0015;
  if (value >= 12) return 0.0025;
  if (value >= 10) return 0.005;
  if (value >= 8) return 0.012;
  return 0.025;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function buildSeverityRatio(counts, total) {
  if (!total || total <= 0) {
    return { low: 0, medium: 0, high: 0 };
  }
  return {
    low: Number((counts.low / total).toFixed(4)),
    medium: Number((counts.medium / total).toFixed(4)),
    high: Number((counts.high / total).toFixed(4)),
  };
}

function pickDominantSeverity(counts) {
  let dominant = "low";
  let best = -1;
  for (const key of SEVERITY_ORDER) {
    const value = counts[key] || 0;
    if (value > best) {
      best = value;
      dominant = key;
    }
  }
  return dominant;
}

function buildColorStops(counts, total) {
  if (!total || total <= 0) {
    return [{ color: SEVERITY_COLORS.low, stop: 1 }];
  }
  // Concentric ring stops, ordered from center outward by severity.
  // The center represents the most severe slice (high → medium → low).
  // The frontend reads `stop` as a cumulative fraction [0..1] from the center.
  const stops = [];
  let cumulative = 0;
  for (const key of SEVERITY_ORDER) {
    const fraction = (counts[key] || 0) / total;
    if (fraction <= 0) continue;
    cumulative += fraction;
    stops.push({
      severity: key,
      color: SEVERITY_COLORS[key],
      stop: Math.min(1, Number(cumulative.toFixed(4))),
    });
  }
  if (stops.length === 0) {
    return [{ severity: "low", color: SEVERITY_COLORS.low, stop: 1 }];
  }
  // Make sure the outermost ring closes at exactly 1.
  stops[stops.length - 1].stop = 1;
  return stops;
}

function buildPopupSummary(counts, dominantSeverity, reportCount) {
  const parts = [];
  if (counts.high > 0) parts.push(`${counts.high} high`);
  if (counts.medium > 0) parts.push(`${counts.medium} medium`);
  if (counts.low > 0) parts.push(`${counts.low} low`);
  const summary = parts.join(", ") || "no severity data";
  return `${reportCount} report${reportCount === 1 ? "" : "s"} (${summary}). Dominant: ${dominantSeverity}.`;
}

function metersForRadiusPx(radiusPx, zoom) {
  // Approximate meters-per-pixel at this zoom. Web mercator at the equator
  // gives ~156543 m / 2^zoom per pixel. Good enough for rendering sized
  // circles at the cluster level.
  const safeZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 13;
  const metersPerPx = 156543.03 / Math.pow(2, safeZoom);
  return Math.round(radiusPx * metersPerPx);
}

async function getDangerHeatClusters({
  bounds = null,
  hours = null,
  zoom = null,
  minReports = 1,
} = {}) {
  // hours === null means "no time filter, show every accident report".
  const explicitHours = parseHoursFromRequest(hours);
  const safeBounds = parseBounds(bounds);
  const safeZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : null;
  const epsDeg = clusterEpsForZoom(safeZoom);
  const safeMinReports = Math.max(1, Math.round(Number(minReports) || 1));

  // Build params + filter SQL incrementally so the time clause is only
  // attached when the caller asked for one.
  const params = [ACCIDENT_INCIDENT_TYPE];
  const filters = [
    "ar.incident_location IS NOT NULL",
    "LOWER(COALESCE(ar.incident_type, '')) = $1",
    "COALESCE(ar.latest_predicted_label, 'real') NOT IN ('spam', 'out_of_context', 'invalid_location')",
  ];

  if (explicitHours != null) {
    params.push(`${explicitHours} hours`);
    filters.push(`ar.created_at >= now() - ($${params.length}::text)::interval`);
  }

  if (safeBounds) {
    params.push(safeBounds.west, safeBounds.south, safeBounds.east, safeBounds.north);
    const offset = params.length;
    filters.push(
      `ar.incident_location && ST_MakeEnvelope($${offset - 3}, $${offset - 2}, $${offset - 1}, $${offset}, 4326)::geography`,
    );
  }

  const whereSql = filters.map((clause) => `        AND ${clause}`).join("\n").replace(/^        AND /, "        ");

  // Severity bucketing for the 1-5 severity_hint scale, collapsed to 3 buckets:
  //   1-2 → low
  //   3   → medium
  //   4-5 → high
  const sql = `
    WITH source AS (
      SELECT
        ar.id,
        ar.incident_location::geometry AS geom,
        COALESCE(ar.severity_hint, 0) AS severity_hint,
        ar.created_at,
        ar.verified_by_officer_id,
        CASE
          WHEN COALESCE(ar.severity_hint, 0) >= 4 THEN 'high'
          WHEN ar.severity_hint = 3 THEN 'medium'
          ELSE 'low'
        END AS severity_bucket
      FROM app.accident_reports ar
      WHERE ${whereSql}
    ),
    clustered AS (
      SELECT
        ST_ClusterDBSCAN(geom, eps := ${Number(epsDeg).toFixed(6)}, minpoints := ${DBSCAN_MINPOINTS}) OVER () AS cluster_id,
        geom,
        severity_hint,
        severity_bucket,
        created_at,
        verified_by_officer_id
      FROM source
    )
    SELECT
      cluster_id,
      COUNT(*)::int AS report_count,
      COUNT(*) FILTER (WHERE severity_bucket = 'low')::int AS low_count,
      COUNT(*) FILTER (WHERE severity_bucket = 'medium')::int AS medium_count,
      COUNT(*) FILTER (WHERE severity_bucket = 'high')::int AS high_count,
      COUNT(*) FILTER (WHERE verified_by_officer_id IS NOT NULL)::int AS verified_count,
      MAX(severity_hint)::int AS max_severity,
      AVG(severity_hint)::float AS avg_severity,
      MAX(created_at) AS latest_report_at,
      ST_Y(ST_Centroid(ST_Collect(geom))) AS lat,
      ST_X(ST_Centroid(ST_Collect(geom))) AS lon,
      (SELECT COUNT(*)::int FROM source) AS source_total
    FROM clustered
    WHERE cluster_id IS NOT NULL
    GROUP BY cluster_id
    HAVING COUNT(*) >= ${safeMinReports}
    ORDER BY report_count DESC
    LIMIT ${CLUSTER_RESULT_LIMIT}
  `;

  let rows = [];
  try {
    const result = await pool.query(sql, params);
    rows = result.rows || [];
  } catch (error) {
    logHeatmap("dbscan_query_failed", { message: error?.message, code: error?.code });
    throw error;
  }

  const clusters = rows.map((row, index) => {
    const counts = {
      low: Number(row.low_count || 0),
      medium: Number(row.medium_count || 0),
      high: Number(row.high_count || 0),
    };
    const total = counts.low + counts.medium + counts.high;
    const reportCount = Number(row.report_count || 0);
    const dominantSeverity = pickDominantSeverity(counts);
    const ratio = buildSeverityRatio(counts, total || reportCount);
    const colorStops = buildColorStops(counts, total || reportCount);
    const dangerWeight =
      counts.low * SEVERITY_WEIGHTS.low +
      counts.medium * SEVERITY_WEIGHTS.medium +
      counts.high * SEVERITY_WEIGHTS.high;
    // Capped square-root scaling so a cluster of 1 still renders, and a
    // cluster of 100+ does not cover the whole map.
    const radiusPx = clamp(18 + Math.sqrt(reportCount) * 10, 22, 90);
    const radiusMeters = metersForRadiusPx(radiusPx, safeZoom ?? 13);

    return {
      id: `cluster-${row.cluster_id != null ? row.cluster_id : index + 1}`,
      lat: Number(row.lat),
      lon: Number(row.lon),
      reportCount,
      latestReportAt: row.latest_report_at
        ? new Date(row.latest_report_at).toISOString()
        : null,
      severityCounts: counts,
      severityRatio: ratio,
      dominantSeverity,
      averageSeverity:
        row.avg_severity != null ? Number(Number(row.avg_severity).toFixed(2)) : null,
      maxSeverity: Number(row.max_severity || 0),
      verifiedCount: Number(row.verified_count || 0),
      dangerWeight,
      radiusPx: Number(radiusPx.toFixed(1)),
      radiusMeters,
      colorStops,
      popupSummary: buildPopupSummary(counts, dominantSeverity, reportCount),
    };
  });

  const sourceTotal = Number(rows[0]?.source_total || 0);
  logHeatmap("computed_clusters", {
    incidentTypeColumn: "incident_type",
    incidentTypeFilter: ACCIDENT_INCIDENT_TYPE,
    rangeHours: explicitHours,
    timeFilterActive: explicitHours != null,
    boundsFilterActive: Boolean(safeBounds),
    zoom: safeZoom,
    sourceReportCount: sourceTotal,
    clusterCount: clusters.length,
    clusterLimit: CLUSTER_RESULT_LIMIT,
  });

  return {
    rangeHours: explicitHours,
    timeFilterActive: explicitHours != null,
    boundsFilterActive: Boolean(safeBounds),
    epsDegrees: epsDeg,
    minReports: safeMinReports,
    sourceReportCount: sourceTotal,
    severityColors: SEVERITY_COLORS,
    clusters,
  };
}

// Backwards-compatible visual helper kept for callers that may still rely on
// the old "danger weight → ring style" output. The frontend cluster renderer
// no longer uses this — it consumes severityCounts/colorStops directly.
function mapDangerWeightToVisuals(weight) {
  const value = Number(weight);
  if (!Number.isFinite(value) || value <= 0) {
    return { level: "low", radiusMeters: 80, fillOpacity: 0.2, color: SEVERITY_COLORS.low };
  }
  if (value >= 30) {
    return { level: "high", radiusMeters: 260, fillOpacity: 0.45, color: SEVERITY_COLORS.high };
  }
  if (value >= 10) {
    return { level: "medium", radiusMeters: 140, fillOpacity: 0.3, color: SEVERITY_COLORS.medium };
  }
  return { level: "low", radiusMeters: 80, fillOpacity: 0.2, color: SEVERITY_COLORS.low };
}

function buildClusterExplanation({
  reportCount,
  dominantSeverity,
  severityCounts,
  verifiedCount,
  peakHourRange,
  commonReportTypes,
}) {
  if (!reportCount) {
    return "No accident reports in this zone yet.";
  }
  const parts = [];
  parts.push(`${reportCount} accident ${reportCount === 1 ? "report" : "reports"} clustered here`);
  const severeCount = Number(severityCounts?.high || 0);
  if (severeCount > 0) {
    parts.push(
      `${severeCount} high-severity ${severeCount === 1 ? "report" : "reports"}`,
    );
  }
  if (peakHourRange?.startHour != null && peakHourRange?.endHour != null) {
    parts.push(
      `most reports happen between ${String(peakHourRange.startHour).padStart(2, "0")}:00 and ${String(peakHourRange.endHour).padStart(2, "0")}:00`,
    );
  }
  if (verifiedCount > 0) {
    parts.push(
      `${verifiedCount} ${verifiedCount === 1 ? "report was" : "reports were"} police-verified`,
    );
  }
  if (Array.isArray(commonReportTypes) && commonReportTypes.length > 0) {
    parts.push(
      `most common: ${commonReportTypes.slice(0, 2).map((t) => t.label || t.type).join(" and ")}`,
    );
  }
  if (parts.length === 1) {
    parts.push(`dominant severity is ${dominantSeverity || "low"}`);
  }
  return `${parts[0]}. Other factors: ${parts.slice(1).join(", ")}.`;
}

async function getClusterDetailByLocation({ lat, lng, radiusMeters, hours, limit = 30 } = {}) {
  const safeLat = Number(lat);
  const safeLng = Number(lng);
  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) {
    const error = new Error("lat and lng are required");
    error.status = 400;
    throw error;
  }
  const safeRadius = Math.max(50, Math.min(2000, Number(radiusMeters) || 250));
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));

  const params = [safeLng, safeLat, safeRadius, ACCIDENT_INCIDENT_TYPE];
  let timeClause = "";
  if (Number.isFinite(Number(hours)) && Number(hours) > 0) {
    const safeHours = Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(Number(hours))));
    params.push(safeHours);
    timeClause = `AND ar.created_at >= NOW() - ($${params.length}::int * INTERVAL '1 hour')`;
  }

  const detailSql = `
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
        EXTRACT(HOUR FROM ar.created_at AT TIME ZONE 'UTC')::int AS hour_utc,
        CASE
          WHEN COALESCE(ar.severity_hint, 0) >= 4 THEN 'high'
          WHEN ar.severity_hint = 3 THEN 'medium'
          ELSE 'low'
        END AS severity_bucket
      FROM app.accident_reports ar
      WHERE ar.incident_location IS NOT NULL
        AND LOWER(COALESCE(ar.incident_type, '')) = $4
        AND COALESCE(ar.latest_predicted_label, 'real') NOT IN ('spam', 'out_of_context', 'invalid_location')
        AND ST_DWithin(
          ar.incident_location::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
        ${timeClause}
    )
    SELECT
      (SELECT COUNT(*)::int FROM base) AS report_count,
      (SELECT COUNT(*)::int FROM base WHERE severity_bucket = 'low') AS low_count,
      (SELECT COUNT(*)::int FROM base WHERE severity_bucket = 'medium') AS medium_count,
      (SELECT COUNT(*)::int FROM base WHERE severity_bucket = 'high') AS high_count,
      (SELECT COUNT(*)::int FROM base WHERE verified_by_officer_id IS NOT NULL) AS verified_count,
      (SELECT MAX(created_at) FROM base) AS latest_report_at,
      (SELECT MIN(created_at) FROM base) AS earliest_report_at,
      (
        SELECT json_agg(row_to_json(t)) FROM (
          SELECT incident_type AS type, COUNT(*)::int AS count
          FROM base
          GROUP BY incident_type
          ORDER BY count DESC
          LIMIT 4
        ) t
      ) AS common_report_types,
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
          SELECT id, title, description, incident_type, severity_hint, created_at,
                 verified_by_officer_id, review_verdict, lat, lng, severity_bucket
          FROM base
          ORDER BY created_at DESC
          LIMIT ${safeLimit}
        ) t
      ) AS reports
  `;

  const result = await pool.query(detailSql, params);
  const row = result.rows[0] || {};
  const reportCount = Number(row.report_count || 0);

  const severityCounts = {
    low: Number(row.low_count || 0),
    medium: Number(row.medium_count || 0),
    high: Number(row.high_count || 0),
  };
  const dominantSeverity = pickDominantSeverity(severityCounts);
  const verifiedCount = Number(row.verified_count || 0);

  const hourDistribution = Array.isArray(row.hour_distribution) ? row.hour_distribution : [];
  let peakHourRange = null;
  if (hourDistribution.length > 0) {
    const topHour = Number(hourDistribution[0].hour);
    if (Number.isFinite(topHour)) {
      peakHourRange = {
        startHour: topHour,
        endHour: (topHour + 1) % 24,
        reportCount: Number(hourDistribution[0].count) || 0,
      };
    }
  }

  const commonReportTypesRaw = Array.isArray(row.common_report_types)
    ? row.common_report_types
    : [];
  const commonReportTypes = commonReportTypesRaw.map((t) => ({
    type: t.type || "unknown",
    label: String(t.type || "report").replace(/_/g, " "),
    count: Number(t.count || 0),
  }));

  const reports = (Array.isArray(row.reports) ? row.reports : []).map((r) => ({
    id: r.id,
    title: r.title || null,
    descriptionSnippet:
      typeof r.description === "string" ? r.description.slice(0, 240) : null,
    incidentType: r.incident_type || null,
    severityHint: Number(r.severity_hint || 0),
    severityBucket: r.severity_bucket || "low",
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    verifiedByPolice: Boolean(r.verified_by_officer_id),
    reviewVerdict: r.review_verdict || null,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
  }));

  const explanation = buildClusterExplanation({
    reportCount,
    dominantSeverity,
    severityCounts,
    verifiedCount,
    peakHourRange,
    commonReportTypes,
  });

  return {
    center: { lat: safeLat, lng: safeLng },
    radiusMeters: safeRadius,
    reportCount,
    severityCounts,
    dominantSeverity,
    verifiedCount,
    latestReportAt: row.latest_report_at
      ? new Date(row.latest_report_at).toISOString()
      : null,
    earliestReportAt: row.earliest_report_at
      ? new Date(row.earliest_report_at).toISOString()
      : null,
    peakHourRange,
    commonReportTypes,
    explanation,
    severityColors: SEVERITY_COLORS,
    reports,
  };
}

module.exports = {
  getDangerHeatClusters,
  getClusterDetailByLocation,
  mapDangerWeightToVisuals,
  parseHoursFromRequest,
  SEVERITY_COLORS,
};
