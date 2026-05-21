const pool = require("../db");

const EARTH_RADIUS_M = 6371000;
const DEFAULT_LOOKAHEAD_KM = 5;
const DEFAULT_PROXIMITY_M = 250;
const MAX_ALERTS = 8;

const safeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toRadians = (deg) => (deg * Math.PI) / 180;

const haversineMeters = (lat1, lng1, lat2, lng2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
};

const normalisePoint = (point) => {
  if (!point) return null;
  if (Array.isArray(point) && point.length >= 2) {
    const lat = safeNumber(point[0]);
    const lng = safeNumber(point[1]);
    return lat != null && lng != null ? [lat, lng] : null;
  }
  if (typeof point === "object") {
    const lat = safeNumber(point.lat ?? point.latitude);
    const lng = safeNumber(point.lng ?? point.longitude ?? point.lon);
    return lat != null && lng != null ? [lat, lng] : null;
  }
  return null;
};

const sliceAheadPath = (rawPath, userLocation, lookAheadKm) => {
  const path = (Array.isArray(rawPath) ? rawPath : [])
    .map(normalisePoint)
    .filter(Boolean);
  if (path.length < 2) return [];

  const userLoc = normalisePoint(userLocation);
  let startIndex = 0;
  if (userLoc) {
    let bestDist = Infinity;
    for (let i = 0; i < path.length; i += 1) {
      const dist = haversineMeters(userLoc[0], userLoc[1], path[i][0], path[i][1]);
      if (dist < bestDist) {
        bestDist = dist;
        startIndex = i;
      }
    }
  }

  const lookAheadMeters = Math.max(500, Number(lookAheadKm) * 1000 || DEFAULT_LOOKAHEAD_KM * 1000);
  const ahead = [path[startIndex]];
  let traversed = 0;
  for (let i = startIndex + 1; i < path.length; i += 1) {
    const prev = path[i - 1];
    const curr = path[i];
    traversed += haversineMeters(prev[0], prev[1], curr[0], curr[1]);
    ahead.push(curr);
    if (traversed >= lookAheadMeters) break;
  }
  return ahead;
};

const minDistanceToPathMeters = (lat, lng, path) => {
  let best = Infinity;
  for (let i = 0; i < path.length; i += 1) {
    const [plat, plng] = path[i];
    const dist = haversineMeters(lat, lng, plat, plng);
    if (dist < best) best = dist;
  }
  return best;
};

const cumulativeDistanceFromStart = (lat, lng, path) => {
  let cumulative = 0;
  let bestCumulative = 0;
  let best = Infinity;
  for (let i = 0; i < path.length; i += 1) {
    const [plat, plng] = path[i];
    if (i > 0) {
      cumulative += haversineMeters(path[i - 1][0], path[i - 1][1], plat, plng);
    }
    const dist = haversineMeters(lat, lng, plat, plng);
    if (dist < best) {
      best = dist;
      bestCumulative = cumulative;
    }
  }
  return bestCumulative;
};

const severityFromHint = (hint) => {
  const n = Number(hint);
  if (!Number.isFinite(n)) return "low";
  if (n >= 3) return "high";
  if (n === 2) return "medium";
  return "low";
};

const severityRank = (severity) => {
  switch (String(severity || "").toLowerCase()) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
};

const fetchRecentReports = async ({ since, boundingBox }) => {
  const sinceParam = since ? new Date(since) : new Date(Date.now() - 60 * 60 * 1000);
  if (Number.isNaN(sinceParam.getTime())) {
    sinceParam.setTime(Date.now() - 60 * 60 * 1000);
  }
  // accident_reports has no lat/lng columns; coordinates live in
  // incident_location (geography Point, SRID 4326). We extract them via
  // ST_Y/ST_X as aliases so the JS-side proximity logic below stays
  // unchanged. Bounding-box pre-filter uses PostGIS envelope intersection
  // instead of a numeric BETWEEN clause.
  const params = [sinceParam.toISOString()];
  let bboxClause = "";
  if (boundingBox) {
    params.push(
      boundingBox.minLng,
      boundingBox.minLat,
      boundingBox.maxLng,
      boundingBox.maxLat,
    );
    const offset = params.length;
    bboxClause = `
        AND ar.incident_location && ST_MakeEnvelope(
          $${offset - 3}, $${offset - 2}, $${offset - 1}, $${offset}, 4326
        )::geography
    `;
  }

  const sql = `
    SELECT
      ar.id,
      ar.title,
      ar.description,
      ar.incident_type,
      ar.severity_hint,
      ST_Y(ar.incident_location::geometry) AS lat,
      ST_X(ar.incident_location::geometry) AS lng,
      ar.created_at,
      ar.review_verdict,
      ar.latest_predicted_label,
      ar.latest_spam_score
    FROM app.accident_reports ar
    WHERE ar.created_at >= $1
      AND ar.incident_location IS NOT NULL
      AND LOWER(COALESCE(ar.incident_type, '')) = 'accident'
      AND COALESCE(ar.latest_predicted_label, 'real')
          NOT IN ('spam', 'out_of_context', 'invalid_location')
      ${bboxClause}
    ORDER BY ar.created_at DESC
    LIMIT 200
  `;
  const result = await pool.query(sql, params);
  return result.rows || [];
};

const findRouteAlerts = async ({
  routeSnapshot,
  userLocation,
  destination,
  lookAheadKm,
  since,
} = {}) => {
  const path = Array.isArray(routeSnapshot?.path) ? routeSnapshot.path : [];
  const aheadPath = sliceAheadPath(path, userLocation, lookAheadKm);
  if (aheadPath.length < 2) {
    return { alerts: [], lookAheadKm: lookAheadKm || DEFAULT_LOOKAHEAD_KM };
  }

  const lats = aheadPath.map((p) => p[0]);
  const lngs = aheadPath.map((p) => p[1]);
  const proximityDeg = (DEFAULT_PROXIMITY_M / EARTH_RADIUS_M) * (180 / Math.PI) * 2;
  const boundingBox = {
    minLat: Math.min(...lats) - proximityDeg,
    maxLat: Math.max(...lats) + proximityDeg,
    minLng: Math.min(...lngs) - proximityDeg,
    maxLng: Math.max(...lngs) + proximityDeg,
  };

  const reports = await fetchRecentReports({ since, boundingBox });

  const alerts = [];
  for (const report of reports) {
    const lat = safeNumber(report.lat);
    const lng = safeNumber(report.lng);
    if (lat == null || lng == null) continue;
    const minDist = minDistanceToPathMeters(lat, lng, aheadPath);
    if (minDist > DEFAULT_PROXIMITY_M) continue;

    const distanceAheadMeters = Math.round(cumulativeDistanceFromStart(lat, lng, aheadPath));
    const severity = severityFromHint(report.severity_hint);

    alerts.push({
      id: `report-${report.id}`,
      reportId: report.id,
      type: "report",
      severity,
      title: report.title || titleFromIncidentType(report.incident_type),
      message:
        report.description ||
        `New ${severity} ${formatIncidentType(report.incident_type)} reported ahead.`,
      distanceAheadMeters,
      lat,
      lon: lng,
      createdAt: report.created_at,
      verifiedByPolice:
        String(report.review_verdict || "").toLowerCase() === "verified" ||
        String(report.review_verdict || "").toLowerCase() === "confirmed",
    });
  }

  alerts.sort((a, b) => {
    const rank = severityRank(b.severity) - severityRank(a.severity);
    if (rank !== 0) return rank;
    return (a.distanceAheadMeters || 0) - (b.distanceAheadMeters || 0);
  });

  return {
    alerts: alerts.slice(0, MAX_ALERTS),
    lookAheadKm:
      Number.isFinite(Number(lookAheadKm)) && Number(lookAheadKm) > 0
        ? Number(lookAheadKm)
        : DEFAULT_LOOKAHEAD_KM,
    destinationKnown: Boolean(destination),
  };
};

const titleFromIncidentType = (incidentType) => {
  const text = String(incidentType || "").trim().toLowerCase();
  if (!text) return "Incident reported";
  const formatted = text.replace(/_/g, " ");
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const formatIncidentType = (incidentType) => {
  const text = String(incidentType || "incident").trim().toLowerCase();
  return text.replace(/_/g, " ");
};

module.exports = {
  findRouteAlerts,
};
