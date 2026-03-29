const pool = require("../db");

const DASHBOARD_CACHE_TTL_MS = Math.max(
  60 * 1000,
  Number.parseInt(process.env.DASHBOARD_CACHE_TTL_MS || "180000", 10) || 180000,
);
const MAX_CACHE_ITEMS = 200;
const DASHBOARD_TIMEZONE = "Africa/Algiers";
const dashboardCache = new Map();

const USER_ZONE_SCOPE_CTE = `
  WITH active_alert_zones AS (
    SELECT
      ar.id AS alert_id,
      ar.name AS alert_name,
      az.id AS zone_id,
      az.display_name AS zone_display_name,
      az.zone_type,
      az.admin_area_id,
      az.road_segment_id,
      az.road_buffer_m,
      az.radius_m,
      az.center,
      az.geom AS custom_geom,
      aa.name AS admin_area_name,
      aa.geom AS admin_area_geom,
      rs.name AS road_segment_name,
      rs.ref AS road_segment_ref,
      rs.geom AS road_segment_geom
    FROM app.alert_rules ar
    LEFT JOIN app.alert_zones az
      ON az.alert_id = ar.id
    LEFT JOIN gis.admin_areas aa
      ON aa.id = az.admin_area_id
    LEFT JOIN gis.road_segments rs
      ON rs.id = az.road_segment_id
    WHERE ar.user_id = $1
      AND ar.status = 'active'
  ),
  user_zone_geoms AS (
    SELECT
      alert_id,
      zone_id,
      alert_name,
      COALESCE(
        NULLIF(TRIM(zone_display_name), ''),
        NULLIF(TRIM(admin_area_name), ''),
        NULLIF(TRIM(road_segment_name), ''),
        NULLIF(TRIM(road_segment_ref), ''),
        'Watched zone'
      ) AS zone_name,
      CASE
        WHEN custom_geom IS NOT NULL THEN custom_geom
        WHEN admin_area_geom IS NOT NULL THEN admin_area_geom
        WHEN center IS NOT NULL AND radius_m IS NOT NULL
          THEN ST_Buffer(center::geography, radius_m)::geometry
        WHEN road_segment_geom IS NOT NULL
          THEN ST_Buffer(road_segment_geom::geography, COALESCE(road_buffer_m, 120))::geometry
        ELSE NULL
      END AS geom
    FROM active_alert_zones
  )
`;

const FEATURE_LABELS = {
  Weather_Condition: "Weather condition",
  "Wind_Speed(mph)": "Wind speed",
  Wind_Direction: "Wind direction",
  "Visibility(mi)": "Visibility",
  "Temperature(F)": "Temperature",
  Humidity: "Humidity",
  "Humidity(%)": "Humidity",
  Pressure: "Pressure",
  "Pressure(in)": "Pressure",
  Traffic_Signal: "Signalized intersections",
  Crossing: "Pedestrian crossings",
  Junction: "Road junctions",
  Stop: "Stop controls",
  railway: "Rail crossings",
  precipitation: "Precipitation",
  wind_speed: "Wind speed",
  temperature: "Temperature",
  dow: "Weekly traffic pattern",
  month: "Seasonal pattern",
};

function logDashboard(event, details = {}) {
  if (process.env.DASHBOARD_DEBUG !== "true" && process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[dashboard]", event, details);
}

function roundNumber(value, digits = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const multiplier = 10 ** digits;
  return Math.round(parsed * multiplier) / multiplier;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  const numbers = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (numbers.length === 0) {
    return null;
  }

  const total = numbers.reduce((sum, value) => sum + value, 0);
  return total / numbers.length;
}

function sum(values) {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .reduce((total, value) => total + value, 0);
}

function normalizeRiskScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed <= 1.2) {
    return clamp(Math.round(parsed * 100), 0, 100);
  }

  return clamp(Math.round(parsed), 0, 100);
}

function riskLabel(score) {
  if (score == null) {
    return "Unavailable";
  }

  if (score >= 75) {
    return "High";
  }

  if (score >= 45) {
    return "Moderate";
  }

  return "Low";
}

function volatilityLabel(score) {
  if (score == null) {
    return "Unavailable";
  }

  if (score >= 60) {
    return "High Volatility";
  }

  if (score >= 30) {
    return "Medium Volatility";
  }

  return "Low Volatility";
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function formatRelativeTime(value) {
  const iso = toIsoOrNull(value);
  if (!iso) {
    return "Never";
  }

  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 0) {
    return "Just now";
  }

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < hourMs) {
    return `${Math.max(1, Math.round(diffMs / minuteMs))} min ago`;
  }

  if (diffMs < dayMs) {
    return `${Math.round(diffMs / hourMs)} h ago`;
  }

  return `${Math.round(diffMs / dayMs)} d ago`;
}

function buildLastSevenDates() {
  const dates = [];
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);

  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(base);
    day.setUTCDate(day.getUTCDate() - offset);
    dates.push(day.toISOString().slice(0, 10));
  }

  return dates;
}

function formatRoadLabel(row) {
  if (row?.road_label) {
    return row.road_label;
  }

  const name = String(row?.road_name || "").trim();
  const ref = String(row?.road_ref || "").trim();
  const roadClass = String(row?.road_class || "road").trim();

  if (name && ref) {
    return `${name} (${ref})`;
  }

  if (name) {
    return name;
  }

  if (ref) {
    return ref;
  }

  return `${roadClass.charAt(0).toUpperCase()}${roadClass.slice(1)} #${row?.road_segment_id || "n/a"}`;
}

function normalizeSeverity(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 3) {
      return "high";
    }
    if (numeric >= 2) {
      return "medium";
    }
    if (numeric >= 1) {
      return "low";
    }
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  if (normalized === "moderate") {
    return "medium";
  }
  return "medium";
}

function severityRank(value) {
  const severity = normalizeSeverity(value);
  if (severity === "high") {
    return 3;
  }
  if (severity === "medium") {
    return 2;
  }
  return 1;
}

function highestSeverity(severityLevels = []) {
  if (severityLevels.includes("high")) {
    return "high";
  }
  if (severityLevels.includes("medium")) {
    return "medium";
  }
  return "low";
}

function resolvePrimaryRole(roles = []) {
  if (roles.includes("citizen")) {
    return "citizen";
  }
  if (roles.includes("admin")) {
    return "admin";
  }
  return roles[0] || "user";
}

function getCacheKey(userId) {
  return String(userId || "");
}

function pruneCache() {
  if (dashboardCache.size <= MAX_CACHE_ITEMS) {
    return;
  }

  const overflow = dashboardCache.size - MAX_CACHE_ITEMS;
  const iterator = dashboardCache.keys();

  for (let index = 0; index < overflow; index += 1) {
    const next = iterator.next();
    if (next.done) {
      break;
    }
    dashboardCache.delete(next.value);
  }
}

function getCachedDashboard(userId) {
  const key = getCacheKey(userId);
  const cached = dashboardCache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    dashboardCache.delete(key);
    return null;
  }

  return cached.payload;
}

function setCachedDashboard(userId, payload) {
  const key = getCacheKey(userId);
  dashboardCache.set(key, {
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    payload,
  });
  pruneCache();
}

function buildDefaultTrend() {
  return buildLastSevenDates().map(() => null);
}

function buildIncidentRiskTrend(incidents = []) {
  const dailyWeights = new Map();
  const dailyCounts = new Map();

  for (const incident of incidents) {
    const iso = toIsoOrNull(incident.occurred_at || incident.created_at);
    if (!iso) {
      continue;
    }

    const dateKey = iso.slice(0, 10);
    const severity = normalizeSeverity(incident.severity_hint);
    const weight = severity === "high" ? 28 : severity === "medium" ? 16 : 8;

    dailyWeights.set(dateKey, (dailyWeights.get(dateKey) || 0) + weight);
    dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1);
  }

  return buildLastSevenDates().map((dateKey) => {
    const weighted = dailyWeights.get(dateKey) || 0;
    const count = dailyCounts.get(dateKey) || 0;
    if (count === 0) {
      return 0;
    }
    return clamp(Math.round(weighted + count * 6), 0, 100);
  });
}

function bucketPredictionsByDay(predictions = []) {
  const buckets = new Map();

  for (const prediction of predictions) {
    const iso = toIsoOrNull(prediction.time_bucket || prediction.predicted_at);
    if (!iso) {
      continue;
    }

    const dateKey = iso.slice(0, 10);
    const score = normalizeRiskScore(prediction.risk_score);
    if (score == null) {
      continue;
    }

    const bucket = buckets.get(dateKey) || [];
    bucket.push(score);
    buckets.set(dateKey, bucket);
  }

  return buildLastSevenDates().map((dateKey) => {
    const scores = buckets.get(dateKey) || [];
    const avgScore = average(scores);
    return avgScore == null ? null : Math.round(avgScore);
  });
}

function getLatestPredictionsByRoad(predictions = [], maxAgeHours = 24) {
  const limitDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const latestByRoad = new Map();

  for (const prediction of predictions) {
    const roadSegmentId = prediction.road_segment_id;
    if (roadSegmentId == null) {
      continue;
    }

    const timestampIso = toIsoOrNull(prediction.time_bucket || prediction.predicted_at);
    if (!timestampIso) {
      continue;
    }

    const timestamp = new Date(timestampIso);
    if (timestamp < limitDate) {
      continue;
    }

    const current = latestByRoad.get(String(roadSegmentId));
    if (!current) {
      latestByRoad.set(String(roadSegmentId), prediction);
      continue;
    }

    const currentTimestamp = new Date(toIsoOrNull(current.time_bucket || current.predicted_at) || 0);
    if (timestamp > currentTimestamp) {
      latestByRoad.set(String(roadSegmentId), prediction);
    }
  }

  return [...latestByRoad.values()];
}

function getPreviousPredictionByRoad(predictions = []) {
  const sorted = [...predictions].sort((left, right) => {
    const leftTime = new Date(toIsoOrNull(left.time_bucket || left.predicted_at) || 0).getTime();
    const rightTime = new Date(toIsoOrNull(right.time_bucket || right.predicted_at) || 0).getTime();
    return rightTime - leftTime;
  });

  const map = new Map();
  const seenLatest = new Set();

  for (const prediction of sorted) {
    const roadSegmentId = String(prediction.road_segment_id || "");
    if (!roadSegmentId) {
      continue;
    }

    if (!seenLatest.has(roadSegmentId)) {
      seenLatest.add(roadSegmentId);
      continue;
    }

    if (!map.has(roadSegmentId)) {
      map.set(roadSegmentId, prediction);
    }
  }

  return map;
}

function getProfile(sources) {
  const user = sources.profile || {};
  return {
    name: user.name || "SIARA User",
    role: resolvePrimaryRole(user.roles),
    monitoredZones: Number(user.monitoredZones || 0),
    activeAlerts: Number(user.activeAlerts || 0),
  };
}

function getCurrentRiskOverview(sources) {
  const latestPredictions = getLatestPredictionsByRoad(sources.predictions);
  const predictionTrend = bucketPredictionsByDay(sources.predictions);
  const incidentTrend = buildIncidentRiskTrend(sources.incidents);
  const trend7d = predictionTrend.some((value) => value != null)
    ? predictionTrend.map((value, index) => (value == null ? incidentTrend[index] : value))
    : incidentTrend;

  const latestScore = average(
    latestPredictions
      .map((prediction) => normalizeRiskScore(prediction.risk_score))
      .filter((value) => value != null),
  );
  const fallbackLatest = trend7d[trend7d.length - 1];
  const score = latestScore == null ? fallbackLatest : Math.round(latestScore);
  const yesterday = trend7d[trend7d.length - 2];
  const changeVsYesterday = score != null && yesterday != null ? Math.round(score - yesterday) : null;
  const aiConfidence = average(
    latestPredictions
      .map((prediction) => {
        const value = Number(prediction.confidence_score);
        if (!Number.isFinite(value)) {
          return null;
        }
        return value <= 1.2 ? value * 100 : value;
      })
      .filter((value) => value != null),
  );
  const updatedAt = latestPredictions
    .map((prediction) => toIsoOrNull(prediction.time_bucket || prediction.predicted_at))
    .filter(Boolean)
    .sort();
  const latestUpdatedAt = updatedAt.length > 0 ? updatedAt[updatedAt.length - 1] : null;

  return {
    score: score ?? null,
    label: riskLabel(score),
    changeVsYesterday,
    aiConfidence: aiConfidence == null ? null : Math.round(aiConfidence),
    updatedAt: latestUpdatedAt,
    trend7d: trend7d.map((value) => (value == null ? 0 : Math.round(value))),
  };
}

function getRiskVolatilityIndex(sources, currentRiskOverview) {
  const trend7d = Array.isArray(currentRiskOverview?.trend7d)
    ? currentRiskOverview.trend7d
    : buildDefaultTrend();
  const absoluteChanges = [];

  for (let index = 1; index < trend7d.length; index += 1) {
    const currentValue = Number(trend7d[index]);
    const previousValue = Number(trend7d[index - 1]);
    if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
      absoluteChanges.push(0);
      continue;
    }
    absoluteChanges.push(Math.abs(currentValue - previousValue));
  }

  const volatilityTrend = trend7d.map((value, index) => {
    if (index === 0) {
      return 0;
    }
    const previousValue = Number(trend7d[index - 1]);
    const currentValue = Number(value);
    if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue)) {
      return 0;
    }
    return Math.round(Math.abs(currentValue - previousValue) * 2.5);
  });

  const score = clamp(Math.round((average(absoluteChanges) || 0) * 5), 0, 100);
  const change24h = volatilityTrend.length >= 2
    ? Math.round(volatilityTrend[volatilityTrend.length - 1] - volatilityTrend[volatilityTrend.length - 2])
    : null;

  return {
    score,
    label: volatilityLabel(score),
    change24h,
    trend7d: volatilityTrend,
  };
}

function getSeverityPressure(sources) {
  const now = Date.now();
  const recentWindowStart = now - (7 * 24 * 60 * 60 * 1000);
  const previousWindowStart = now - (14 * 24 * 60 * 60 * 1000);

  const buildCounts = (rows) => ({
    high: rows.filter((row) => normalizeSeverity(row.severity_hint) === "high").length,
    medium: rows.filter((row) => normalizeSeverity(row.severity_hint) === "medium").length,
    low: rows.filter((row) => normalizeSeverity(row.severity_hint) === "low").length,
  });

  const recentIncidents = sources.incidents.filter((incident) => {
    const timestamp = new Date(toIsoOrNull(incident.occurred_at || incident.created_at) || 0).getTime();
    return timestamp >= recentWindowStart;
  });
  const previousIncidents = sources.incidents.filter((incident) => {
    const timestamp = new Date(toIsoOrNull(incident.occurred_at || incident.created_at) || 0).getTime();
    return timestamp >= previousWindowStart && timestamp < recentWindowStart;
  });

  const recentCounts = buildCounts(recentIncidents);
  const previousCounts = buildCounts(previousIncidents);
  const recentTotal = Object.values(recentCounts).reduce((total, value) => total + value, 0);
  const previousTotal = Object.values(previousCounts).reduce((total, value) => total + value, 0);

  const toPct = (count, total) => (total > 0 ? Math.round((count / total) * 100) : 0);

  return {
    high: toPct(recentCounts.high, recentTotal),
    medium: toPct(recentCounts.medium, recentTotal),
    low: toPct(recentCounts.low, recentTotal),
    highChange: toPct(recentCounts.high, recentTotal) - toPct(previousCounts.high, previousTotal),
    mediumChange: toPct(recentCounts.medium, recentTotal) - toPct(previousCounts.medium, previousTotal),
    lowChange: toPct(recentCounts.low, recentTotal) - toPct(previousCounts.low, previousTotal),
  };
}

function getMostVolatileZoneToday(sources) {
  const item = sources.mostVolatileZone || null;
  if (!item) {
    return null;
  }

  return {
    name: item.zone_name,
    risk: normalizeRiskScore(item.current_score),
    change: normalizeRiskScore(item.volatility_score),
    alertId: item.alert_id || null,
    mapUrl: item.alert_id ? `/map?alert=${item.alert_id}` : "/map",
  };
}

function getTopContributingFactors(sources) {
  if (sources.explanations.length === 0) {
    const fallback = [];
    const incidentTypes = new Map();

    for (const incident of sources.incidents) {
      const key = String(incident.incident_type || "Incident pressure").trim() || "Incident pressure";
      incidentTypes.set(key, (incidentTypes.get(key) || 0) + severityRank(incident.severity_hint));
    }

    const totalWeight = sum([...incidentTypes.values()]);
    for (const [name, weight] of [...incidentTypes.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4)) {
      fallback.push({
        name,
        impactPct: totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : null,
      });
    }

    return fallback;
  }

  const grouped = new Map();

  for (const explanation of sources.explanations) {
    const featureName = String(explanation.feature_name || "").trim();
    if (!featureName) {
      continue;
    }

    const current = grouped.get(featureName) || {
      featureName,
      sumAbsShap: 0,
      count: 0,
    };

    current.sumAbsShap += Math.abs(Number(explanation.shap_value) || 0);
    current.count += 1;
    grouped.set(featureName, current);
  }

  const ranked = [...grouped.values()]
    .map((item) => ({
      name: FEATURE_LABELS[item.featureName] || item.featureName.replace(/_/g, " "),
      weight: item.sumAbsShap,
    }))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 4);

  const totalWeight = sum(ranked.map((item) => item.weight));

  return ranked.map((item) => ({
    name: item.name,
    impactPct: totalWeight > 0 ? Math.max(1, Math.round((item.weight / totalWeight) * 100)) : null,
  }));
}

function getIncidentDistribution24h(sources) {
  const buckets = [
    { bucket: "00:00-06:00", start: 0, end: 6, incidents: 0 },
    { bucket: "06:00-12:00", start: 6, end: 12, incidents: 0 },
    { bucket: "12:00-18:00", start: 12, end: 18, incidents: 0 },
    { bucket: "18:00-24:00", start: 18, end: 24, incidents: 0 },
  ];
  const windowStart = Date.now() - (24 * 60 * 60 * 1000);

  for (const incident of sources.incidents) {
    const iso = toIsoOrNull(incident.occurred_at || incident.created_at);
    if (!iso) {
      continue;
    }

    const timestamp = new Date(iso).getTime();
    if (timestamp < windowStart) {
      continue;
    }

    const local = new Date(new Date(iso).toLocaleString("en-US", { timeZone: DASHBOARD_TIMEZONE }));
    const hour = local.getHours();
    const bucket = buckets.find((candidate) => hour >= candidate.start && hour < candidate.end);
    if (bucket) {
      bucket.incidents += 1;
    }
  }

  return buckets.map((bucket) => ({
    bucket: bucket.bucket.replace("-", "\u2013"),
    incidents: bucket.incidents,
  }));
}

function getHighRiskRoadRanking(sources) {
  const latestByRoad = getLatestPredictionsByRoad(sources.predictions, 48);
  const previousByRoad = getPreviousPredictionByRoad(sources.predictions);

  return latestByRoad
    .map((prediction) => {
      const currentScore = normalizeRiskScore(prediction.risk_score);
      const previous = previousByRoad.get(String(prediction.road_segment_id));
      const previousScore = previous ? normalizeRiskScore(previous.risk_score) : null;

      return {
        roadSegmentId: prediction.road_segment_id,
        road: formatRoadLabel(prediction),
        riskScore: currentScore,
        change: currentScore != null && previousScore != null ? Math.round(currentScore - previousScore) : null,
        mapUrl: "/map",
      };
    })
    .filter((item) => item.riskScore != null)
    .sort((left, right) => {
      if (right.riskScore !== left.riskScore) {
        return right.riskScore - left.riskScore;
      }
      return (right.change || 0) - (left.change || 0);
    })
    .slice(0, 5)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
    }));
}

function getRiskForecast48h(sources, currentRiskOverview, severityPressure) {
  const predictions = sources.predictions || [];
  const byHour = new Map();

  for (const prediction of predictions) {
    const iso = toIsoOrNull(prediction.time_bucket || prediction.predicted_at);
    const score = normalizeRiskScore(prediction.risk_score);
    if (!iso || score == null) {
      continue;
    }

    const local = new Date(new Date(iso).toLocaleString("en-US", { timeZone: DASHBOARD_TIMEZONE }));
    const hour = local.getHours();
    const bucket = byHour.get(hour) || [];
    bucket.push(score);
    byHour.set(hour, bucket);
  }

  const currentScore = Number(currentRiskOverview?.score || 0);
  const trend7d = Array.isArray(currentRiskOverview?.trend7d) ? currentRiskOverview.trend7d : [];
  const recentBaseline = average(trend7d.slice(-3)) || currentScore;
  const momentum = clamp(currentScore - recentBaseline, -15, 15);
  const pressureBias = ((severityPressure?.high || 0) - (severityPressure?.low || 0)) * 0.12;
  const now = new Date();
  const points = [];

  for (let offset = 0; offset <= 48; offset += 4) {
    const target = new Date(now.getTime() + offset * 60 * 60 * 1000);
    const targetLocal = new Date(target.toLocaleString("en-US", { timeZone: DASHBOARD_TIMEZONE }));
    const hourBucket = targetLocal.getHours();
    const historicalScore = average(byHour.get(hourBucket) || []);
    const baseScore = historicalScore == null ? currentScore : historicalScore;
    const weightedScore = offset === 0
      ? currentScore
      : clamp(
          Math.round((baseScore * 0.7) + (currentScore * 0.25) + (momentum * 0.5) + pressureBias),
          0,
          100,
        );

    points.push({
      label: offset === 0 ? "Now" : `+${offset}h`,
      value: weightedScore,
    });
  }

  const peakPoint = [...points].sort((left, right) => right.value - left.value)[0] || null;
  let note = "Forecast follows recent SIARA risk outputs across your watched context.";

  if (peakPoint && peakPoint.value >= 70) {
    note = `Elevated risk is most likely around ${peakPoint.label} based on recent SIARA model outputs.`;
  } else if (momentum >= 6) {
    note = "Risk remains above the recent baseline, with continued pressure over the next two days.";
  } else if (momentum <= -6) {
    note = "Risk eases toward the recent baseline, though watched zones still require monitoring.";
  }

  return {
    points,
    note,
  };
}

function getSystemOverview(sources) {
  const overview = sources.systemOverview || {};
  return {
    totalIncidents: Number(overview.total_incidents || 0),
    aiConfidence: overview.ai_confidence == null ? null : Math.round(Number(overview.ai_confidence)),
    changeVsLastWeek: overview.change_vs_last_week == null ? null : Math.round(Number(overview.change_vs_last_week)),
  };
}

function getActiveAlertsSummary(sources) {
  const summary = sources.alertSummary || {};
  const items = (sources.alerts || []).slice(0, 5).map((alert) => ({
    id: alert.id,
    title: alert.name,
    area: alert.area_name || "Watched zone",
    severity: alert.severity,
    lastTrigger: formatRelativeTime(alert.last_triggered_at),
    status: alert.status,
  }));

  return {
    triggeredThisWeek: Number(summary.triggered_this_week || 0),
    matchedHighSeverityPct:
      summary.matched_high_severity_pct == null
        ? null
        : Math.round(Number(summary.matched_high_severity_pct)),
    falseAlertRatio: null,
    items,
  };
}

function getExposureIndex(sources, profile, currentRiskOverview) {
  const monitoredZones = Number(profile?.monitoredZones || 0);
  const activeAlerts = Number(profile?.activeAlerts || 0);
  const riskScore = Number(currentRiskOverview?.score || 0);
  const score = clamp(Math.round((riskScore * 0.6) + (monitoredZones * 7) + (activeAlerts * 5)), 0, 100);

  return {
    label: riskLabel(score),
    score,
    monitoredZones,
    activeAlerts,
    commutePattern: "Not enough data",
  };
}

function getAiInsightOfWeek(
  sources,
  currentRiskOverview,
  mostVolatileZoneToday,
  topContributingFactors,
  incidentDistribution24h,
  severityPressure,
) {
  const items = [];
  const topFactor = topContributingFactors[0];
  const peakBucket = [...incidentDistribution24h].sort((left, right) => right.incidents - left.incidents)[0] || null;

  if (topFactor) {
    items.push(`${topFactor.name} is the strongest recent driver, contributing about ${topFactor.impactPct}% of tracked model influence.`);
  }

  if (mostVolatileZoneToday?.name) {
    items.push(`${mostVolatileZoneToday.name} shows the sharpest intraday movement, reaching risk ${mostVolatileZoneToday.risk}.`);
  }

  if (peakBucket && peakBucket.incidents > 0) {
    items.push(`Incidents clustered most in ${peakBucket.bucket}, keeping short-horizon pressure elevated.`);
  } else if ((severityPressure?.high || 0) > 0) {
    items.push(`High-severity incidents make up ${severityPressure.high}% of recent activity in the watched context.`);
  } else if (currentRiskOverview?.score != null) {
    items.push(`The current risk baseline sits at ${currentRiskOverview.score}, with ${currentRiskOverview.label.toLowerCase()} overall pressure.`);
  }

  return {
    title: "AI Insight of the Week",
    items: items.slice(0, 3),
  };
}

async function fetchProfileContext(userId, db = pool) {
  const result = await db.query(
    `
      WITH role_rows AS (
        SELECT
          ur.user_id,
          array_agg(distinct r.name order by r.name) filter (where r.name is not null) AS roles
        FROM auth.user_roles ur
        JOIN auth.roles r
          ON r.id = ur.role_id
        WHERE ur.user_id = $1
        GROUP BY ur.user_id
      ),
      active_alerts AS (
        SELECT id
        FROM app.alert_rules
        WHERE user_id = $1
          AND status = 'active'
      ),
      active_zone_rows AS (
        SELECT az.id
        FROM app.alert_zones az
        JOIN active_alerts aa
          ON aa.id = az.alert_id
      ),
      scoped_zone_rows AS (
        ${USER_ZONE_SCOPE_CTE.replace(/^WITH /, "")}
        SELECT count(distinct zone_id)::int AS scoped_zone_count
        FROM user_zone_geoms
        WHERE geom IS NOT NULL
      )
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        COALESCE(role_rows.roles, '{}'::varchar[]) AS roles,
        (SELECT count(*)::int FROM active_alerts) AS active_alert_count,
        (SELECT count(*)::int FROM active_zone_rows) AS monitored_zone_count,
        (SELECT scoped_zone_count FROM scoped_zone_rows) AS scoped_zone_count
      FROM auth.users u
      LEFT JOIN role_rows
        ON role_rows.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId],
  );

  const row = result.rows[0] || null;
  if (!row) {
    throw new Error("Dashboard user not found");
  }

  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email || "SIARA User";
  return {
    id: row.id,
    name,
    roles: Array.isArray(row.roles) ? row.roles : [],
    activeAlerts: Number(row.active_alert_count || 0),
    monitoredZones: Number(row.monitored_zone_count || 0),
    scopedZones: Number(row.scoped_zone_count || 0),
  };
}

async function fetchAlerts(userId, db = pool) {
  const result = await db.query(
    `
      SELECT
        ar.id,
        ar.name,
        ar.status,
        ar.severity_levels,
        COALESCE(
          NULLIF(TRIM(az.display_name), ''),
          NULLIF(TRIM(aa.name), ''),
          'Watched zone'
        ) AS area_name,
        count(atl.*)::int AS trigger_count,
        max(atl.matched_at) AS last_triggered_at
      FROM app.alert_rules ar
      LEFT JOIN app.alert_zones az
        ON az.alert_id = ar.id
      LEFT JOIN gis.admin_areas aa
        ON aa.id = az.admin_area_id
      LEFT JOIN app.alert_trigger_log atl
        ON atl.alert_id = ar.id
      WHERE ar.user_id = $1
        AND ar.status = 'active'
      GROUP BY ar.id, az.id, aa.id
      ORDER BY max(atl.matched_at) DESC NULLS LAST, ar.created_at DESC
    `,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    area_name: row.area_name,
    severity: highestSeverity(Array.isArray(row.severity_levels) ? row.severity_levels : []),
    trigger_count: Number(row.trigger_count || 0),
    last_triggered_at: row.last_triggered_at || null,
  }));
}

async function fetchAlertSummary(userId, db = pool) {
  const result = await db.query(
    `
      SELECT
        count(*)::int AS triggered_this_week,
        round(
          100.0 * count(*) filter (
            where coalesce(rep.severity_hint, 2) >= 3
          ) / nullif(count(*), 0),
          0
        ) AS matched_high_severity_pct
      FROM app.alert_trigger_log atl
      JOIN app.alert_rules ar
        ON ar.id = atl.alert_id
      LEFT JOIN app.accident_reports rep
        ON rep.id = atl.report_id
      WHERE ar.user_id = $1
        AND atl.matched_at >= now() - interval '7 days'
    `,
    [userId],
  );

  return result.rows[0] || {
    triggered_this_week: 0,
    matched_high_severity_pct: null,
  };
}

async function fetchScopedPredictions(userId, scopeByZones, db = pool) {
  const result = await db.query(
    `
      ${USER_ZONE_SCOPE_CTE}
      SELECT
        rp.id,
        rp.road_segment_id,
        rp.time_bucket,
        rp.predicted_at,
        rp.risk_score,
        rp.risk_level,
        rp.confidence_score,
        rp.source_type,
        rp.status,
        COALESCE(
          NULLIF(TRIM(rs.name), ''),
          NULLIF(TRIM(rs.ref), ''),
          INITCAP(COALESCE(rs.road_class, 'road')) || ' #' || rs.id::text
        ) AS road_label,
        rs.name AS road_name,
        rs.ref AS road_ref,
        rs.road_class
      FROM ml.risk_predictions rp
      JOIN gis.road_segments rs
        ON rs.id = rp.road_segment_id
      WHERE rp.time_bucket >= now() - interval '8 days'
        AND (
          $2::boolean = false
          OR EXISTS (
            SELECT 1
            FROM user_zone_geoms uz
            WHERE uz.geom IS NOT NULL
              AND ST_Intersects(uz.geom, rs.geom)
          )
        )
      ORDER BY rp.time_bucket DESC, rp.predicted_at DESC, rp.id DESC
    `,
    [userId, scopeByZones],
  );

  return result.rows;
}

async function fetchScopedExplanations(userId, scopeByZones, db = pool) {
  const result = await db.query(
    `
      ${USER_ZONE_SCOPE_CTE}
      SELECT
        pe.id,
        pe.prediction_id,
        pe.feature_name,
        pe.shap_value,
        pe.direction,
        pe.rank_order
      FROM ml.prediction_explanations pe
      JOIN ml.risk_predictions rp
        ON rp.id = pe.prediction_id
      JOIN gis.road_segments rs
        ON rs.id = rp.road_segment_id
      WHERE rp.time_bucket >= now() - interval '7 days'
        AND (
          $2::boolean = false
          OR EXISTS (
            SELECT 1
            FROM user_zone_geoms uz
            WHERE uz.geom IS NOT NULL
              AND ST_Intersects(uz.geom, rs.geom)
          )
        )
      ORDER BY rp.time_bucket DESC, pe.rank_order ASC, pe.id ASC
    `,
    [userId, scopeByZones],
  );

  return result.rows;
}

async function fetchScopedIncidents(userId, scopeByZones, db = pool) {
  const result = await db.query(
    `
      ${USER_ZONE_SCOPE_CTE}
      SELECT
        ar.id,
        ar.incident_type,
        ar.severity_hint,
        ar.location_label,
        ar.occurred_at,
        ar.created_at,
        ar.updated_at
      FROM app.accident_reports ar
      WHERE coalesce(ar.occurred_at, ar.created_at) >= now() - interval '14 days'
        AND (
          $2::boolean = false
          OR EXISTS (
            SELECT 1
            FROM user_zone_geoms uz
            WHERE uz.geom IS NOT NULL
              AND ar.incident_location IS NOT NULL
              AND ST_Intersects(uz.geom, ar.incident_location::geometry)
          )
        )
      ORDER BY coalesce(ar.occurred_at, ar.created_at) DESC, ar.id DESC
    `,
    [userId, scopeByZones],
  );

  return result.rows;
}

async function fetchMostVolatileZoneToday(userId, db = pool) {
  const result = await db.query(
    `
      ${USER_ZONE_SCOPE_CTE}
      , zone_predictions AS (
        SELECT
          uz.alert_id,
          uz.zone_id,
          uz.zone_name,
          rp.road_segment_id,
          rp.time_bucket,
          rp.predicted_at,
          rp.risk_score,
          row_number() over (
            partition by uz.zone_id, rp.road_segment_id
            order by rp.time_bucket desc, rp.predicted_at desc, rp.id desc
          ) AS row_rank
        FROM user_zone_geoms uz
        JOIN gis.road_segments rs
          ON uz.geom IS NOT NULL
         AND ST_Intersects(uz.geom, rs.geom)
        JOIN ml.risk_predictions rp
          ON rp.road_segment_id = rs.id
        WHERE (rp.time_bucket at time zone '${DASHBOARD_TIMEZONE}')::date = (now() at time zone '${DASHBOARD_TIMEZONE}')::date
      )
      SELECT
        alert_id,
        zone_id,
        zone_name,
        avg(risk_score) filter (where row_rank = 1) AS current_score,
        (max(risk_score) - min(risk_score)) AS volatility_score
      FROM zone_predictions
      GROUP BY alert_id, zone_id, zone_name
      HAVING count(*) > 0
      ORDER BY volatility_score DESC NULLS LAST, current_score DESC NULLS LAST, zone_name ASC
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] || null;
}

async function fetchSystemOverview(db = pool) {
  const result = await db.query(
    `
      WITH incident_windows AS (
        SELECT
          count(*) filter (where created_at >= now() - interval '7 days')::int AS current_week_incidents,
          count(*) filter (
            where created_at >= now() - interval '14 days'
              and created_at < now() - interval '7 days'
          )::int AS previous_week_incidents
        FROM app.accident_reports
      ),
      latest_predictions AS (
        SELECT
          avg(
            CASE
              WHEN confidence_score <= 1.2 THEN confidence_score * 100
              ELSE confidence_score
            END
          ) AS ai_confidence
        FROM (
          SELECT
            rp.*,
            row_number() over (
              partition by rp.road_segment_id
              order by rp.time_bucket desc, rp.predicted_at desc, rp.id desc
            ) AS row_rank
          FROM ml.risk_predictions rp
          WHERE rp.time_bucket >= now() - interval '24 hours'
        ) ranked
        WHERE ranked.row_rank = 1
      )
      SELECT
        (SELECT count(*)::int FROM app.accident_reports) AS total_incidents,
        (SELECT ai_confidence FROM latest_predictions) AS ai_confidence,
        CASE
          WHEN incident_windows.previous_week_incidents = 0
            THEN CASE
              WHEN incident_windows.current_week_incidents > 0 THEN 100
              ELSE 0
            END
          ELSE round(
            100.0 * (
              incident_windows.current_week_incidents - incident_windows.previous_week_incidents
            ) / incident_windows.previous_week_incidents,
            0
          )
        END AS change_vs_last_week
      FROM incident_windows
    `,
  );

  return result.rows[0] || {
    total_incidents: 0,
    ai_confidence: null,
    change_vs_last_week: null,
  };
}

async function fetchDashboardSources(userId, db = pool) {
  const profile = await fetchProfileContext(userId, db);
  const scopeByZones = profile.scopedZones > 0;

  const [
    alerts,
    alertSummary,
    predictions,
    explanations,
    incidents,
    mostVolatileZone,
    systemOverview,
  ] = await Promise.all([
    fetchAlerts(userId, db),
    fetchAlertSummary(userId, db),
    fetchScopedPredictions(userId, scopeByZones, db),
    fetchScopedExplanations(userId, scopeByZones, db),
    fetchScopedIncidents(userId, scopeByZones, db),
    fetchMostVolatileZoneToday(userId, db),
    fetchSystemOverview(db),
  ]);

  const sources = {
    profile,
    scopeMode: scopeByZones ? "watched_zones" : "global_fallback",
    alerts,
    alertSummary,
    predictions,
    explanations,
    incidents,
    mostVolatileZone,
    systemOverview,
  };

  logDashboard("source_data_loaded", {
    userId,
    scopeMode: sources.scopeMode,
    alerts: alerts.length,
    predictions: predictions.length,
    explanations: explanations.length,
    incidents: incidents.length,
    hasVolatileZone: Boolean(mostVolatileZone),
  });

  return sources;
}

async function getDashboard(userId, { forceRefresh = false } = {}, db = pool) {
  if (!forceRefresh) {
    const cached = getCachedDashboard(userId);
    if (cached) {
      logDashboard("cache_hit", { userId });
      return cached;
    }
  }

  logDashboard("cache_miss", { userId });
  const sources = await fetchDashboardSources(userId, db);
  const profile = getProfile(sources);
  const currentRiskOverview = getCurrentRiskOverview(sources);
  const riskVolatilityIndex = getRiskVolatilityIndex(sources, currentRiskOverview);
  const severityPressure = getSeverityPressure(sources);
  const mostVolatileZoneToday = getMostVolatileZoneToday(sources);
  const topContributingFactors = getTopContributingFactors(sources);
  const incidentDistribution24h = getIncidentDistribution24h(sources);
  const systemOverview = getSystemOverview(sources);
  const activeAlerts = getActiveAlertsSummary(sources);
  const highRiskRoadRanking = getHighRiskRoadRanking(sources);
  const riskForecast48h = getRiskForecast48h(sources, currentRiskOverview, severityPressure);
  const exposureIndex = getExposureIndex(sources, profile, currentRiskOverview);
  const aiInsightOfWeek = getAiInsightOfWeek(
    sources,
    currentRiskOverview,
    mostVolatileZoneToday,
    topContributingFactors,
    incidentDistribution24h,
    severityPressure,
  );

  const payload = {
    profile,
    currentRiskOverview,
    riskVolatilityIndex,
    severityPressure,
    mostVolatileZoneToday,
    aiInsightOfWeek,
    systemOverview,
    activeAlerts,
    riskForecast48h,
    highRiskRoadRanking,
    incidentDistribution24h,
    topContributingFactors,
    exposureIndex,
    quickActions: [
      { key: "report", label: "Report Incident", path: "/report" },
      { key: "alerts", label: "Create Alert", path: "/alerts/create" },
      { key: "quiz", label: "Driving Quiz", path: "/dashboard?action=quiz" },
    ],
    meta: {
      scopeMode: sources.scopeMode,
      cachedAt: new Date().toISOString(),
      cacheTtlMs: DASHBOARD_CACHE_TTL_MS,
    },
  };

  setCachedDashboard(userId, payload);
  return payload;
}

function clearDashboardCache(userId = null) {
  if (userId) {
    dashboardCache.delete(getCacheKey(userId));
    return;
  }

  dashboardCache.clear();
}

module.exports = {
  clearDashboardCache,
  fetchDashboardSources,
  getActiveAlertsSummary,
  getAiInsightOfWeek,
  getCurrentRiskOverview,
  getDashboard,
  getExposureIndex,
  getHighRiskRoadRanking,
  getIncidentDistribution24h,
  getMostVolatileZoneToday,
  getProfile,
  getRiskForecast48h,
  getRiskVolatilityIndex,
  getSeverityPressure,
  getSystemOverview,
  getTopContributingFactors,
};
