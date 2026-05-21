// Risk pipeline controllers.
//
// All weather, twilight, road-flag, OSRM and Flask-client logic lives in
// `api/services/risk/*` provider modules. This file holds the Express
// handlers, route-guide response shaping, and a few process-local caches
// (route-guide cache, 24h forecast cache, segment-row cache) that are
// only consumed by these handlers.

const axios = require("axios");
const crypto = require("crypto");
const {
  parseNumericRoadSegmentId,
  persistPrediction,
  persistPredictionWithExplanation,
  persistPredictions,
} = require("../../services/riskPersistence");
const {
  safeNumber,
  roundNumber,
  parseBoundedNumber,
  toIsoTimestamp,
  floorToBucketMs,
  formatHourLabel,
  buildHourlyIsoPoints,
  haversineDistanceKm,
  destinationFromBearing,
  isValidLatitude,
  isValidLongitude,
  validateLatLng,
  validateLatLngStrict,
  normalizeLatLngPoint,
  dedupePathPoints,
  roundCoord,
  cloneJsonSafe,
  normalizeDangerLevel,
  isTimeoutLikeError,
  getCacheEntry,
  setCacheEntryWithTtl,
} = require("../../services/risk/riskCommon");
const {
  postToFlask,
  postToFlaskStream,
  readStreamText,
  writeSse,
} = require("../../services/risk/mlClient");
const {
  ROAD_FLAG_ZEROES,
  toRoadFlags,
  getRoadFlagsAsync,
} = require("../../services/risk/roadFlagsProvider");
const {
  DEBUG_OSRM,
  DEFAULT_GUIDE_ALTERNATIVE_ROUTES,
  MAX_GUIDE_ALTERNATIVE_ROUTES,
  buildStraightLinePath,
  getOsrmRouteAlternatives,
  getRoutePathWithFallback,
} = require("../../services/risk/routeProvider");
const {
  extractForecastSnapshot,
  normalizeSnapshotForModelUnits,
  getUnitsForWeatherSource,
  buildModelWeatherRowFromSnapshot,
  getCurrentWeatherUi,
  getForecastWeatherSeries,
} = require("../../services/risk/weatherProvider");
const { getTwilightFields, buildTwilightFallback } = require("../../services/risk/twilightProvider");
const {
  predictPersonalizedOccurrenceForUser: predictOccurrenceForRouteSegments,
  trainedRiskLevelFromProbability,
  TRAINED_MODEL_PROBABILITY_WARNING,
} = require("../../services/occurrenceRiskService");
const {
  buildDangerRow,
  safeRowNumber,
  safeRowCategory,
} = require("../../services/risk/riskFeatureBuilder");

// ---------- Route-guide / forecast / segment-row tier configuration ----------

const NOMINATIM_TIMEOUT_MS = Number(process.env.NOMINATIM_TIMEOUT_MS || 8000);
const ENABLE_OSM_FLAGS_FOR_ROUTES =
  String(process.env.ENABLE_OSM_FLAGS_FOR_ROUTES || "0") === "1";
const DEBUG_FORECAST = String(process.env.DEBUG_FORECAST || "0") === "1";

const DEFAULT_NEARBY_RADIUS_KM = Number(process.env.NEARBY_RADIUS_KM || 25);
const DEFAULT_MAX_DESTINATIONS = Number(process.env.NEARBY_MAX_DESTINATIONS || 4);
const MAX_NEARBY_DESTINATIONS = Number(process.env.NEARBY_MAX_DESTINATIONS_CAP || 8);
const DEFAULT_ROUTE_SAMPLES = Number(process.env.NEARBY_ROUTE_SAMPLES || 5);
const MAX_ROUTE_SAMPLES = Number(process.env.NEARBY_ROUTE_SAMPLES_CAP || 12);
const DEFAULT_GUIDE_SAMPLE_COUNT = Number(process.env.ROUTE_GUIDE_SAMPLE_COUNT || 8);
// Hard cap for normal production traffic; explicitly bumped via env for
// load/regression testing only. Keeps backend from being asked for 40 samples
// when the frontend asks for ROUTE_SAMPLE_COUNT=12 etc.
const MAX_GUIDE_SAMPLE_COUNT = Number(process.env.ROUTE_GUIDE_SAMPLE_COUNT_CAP || 15);
// Cap on concurrent buildDangerRow() jobs per /risk/route request. Each job
// touches PostGIS + weather + (optional) Open-Meteo and can be heavy; running
// 15 in parallel hammered the DB and tripped ML timeouts. Defaults to 4.
const ROUTE_SAMPLE_BUILD_CONCURRENCY = Math.max(
  1,
  Number(process.env.ROUTE_SAMPLE_BUILD_CONCURRENCY || 4),
);

// Lightweight async pool. Preserves input order on the output and limits
// in-flight tasks to `limit`. Used to throttle buildDangerRow() calls per
// route request without changing the response shape.
async function runWithConcurrency(items, limit, worker) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const cap = Math.max(1, Number(limit) || 1);
  if (cap >= items.length) {
    return Promise.all(items.map((item, index) => worker(item, index)));
  }
  const results = new Array(items.length);
  let next = 0;
  const runOne = async () => {
    while (true) {
      const current = next;
      next += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  };
  const workers = [];
  for (let i = 0; i < cap; i += 1) workers.push(runOne());
  await Promise.all(workers);
  return results;
}

// Adaptive route sample count based on great-circle distance between origin
// and destination. Keeps the network responsive on short trips and only
// pays for extra samples on long ones. Caller can still override via
// req.body.sample_count (bounded by MAX_GUIDE_SAMPLE_COUNT).
function adaptiveRouteSampleCount(origin, destination) {
  if (!origin || !destination) return DEFAULT_GUIDE_SAMPLE_COUNT;
  const distanceKm = haversineDistanceKm(
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
  );
  if (!Number.isFinite(distanceKm)) return DEFAULT_GUIDE_SAMPLE_COUNT;
  if (distanceKm < 3) return 5;
  if (distanceKm < 15) return 8;
  return 12;
}
const ROUTE_GUIDE_CACHE_MAX = Number(process.env.ROUTE_GUIDE_CACHE_MAX || 200);
const ROUTE_GUIDE_CACHE_TTL_MS = Number(process.env.ROUTE_GUIDE_CACHE_TTL_MS || 5 * 60 * 1000);
const ROUTE_GUIDE_FALLBACK_CACHE_TTL_MS = Number(
  process.env.ROUTE_GUIDE_FALLBACK_CACHE_TTL_MS || 30 * 1000,
);
const ROUTE_GUIDE_TIME_BUCKET_MS = Number(
  process.env.ROUTE_GUIDE_TIME_BUCKET_MS || 5 * 60 * 1000,
);
const ROUTE_GUIDE_MAX_SCORING_ROUTES = Number(process.env.ROUTE_GUIDE_MAX_SCORING_ROUTES || 1);
const ROUTE_GUIDE_MAX_PATH_POINTS = Number(process.env.ROUTE_GUIDE_MAX_PATH_POINTS || 500);

const MAX_RISK_FORECAST_CACHE = Number(process.env.MAX_RISK_FORECAST_CACHE || 1000);
const RISK_FORECAST_BUCKET_MS = Number(process.env.RISK_FORECAST_BUCKET_MS || 5 * 60 * 1000);
const RISK_FORECAST_CACHE_TTL_MS = Number(process.env.RISK_FORECAST_CACHE_TTL_MS || 5 * 60 * 1000);

const MAX_SEGMENT_CACHE = 2000;

const routeGuideCache = new Map();
const riskForecastCache = new Map();
const segmentRowCache = new Map();

const FALLBACK_DESTINATIONS = Object.freeze([
  { id: "alger", name: "Alger", lat: 36.7538, lng: 3.0588 },
  { id: "oran", name: "Oran", lat: 35.6981, lng: -0.6348 },
  { id: "constantine", name: "Constantine", lat: 36.365, lng: 6.6147 },
  { id: "annaba", name: "Annaba", lat: 36.9, lng: 7.7669 },
  { id: "blida", name: "Blida", lat: 36.4701, lng: 2.8277 },
  { id: "setif", name: "Setif", lat: 36.1911, lng: 5.4137 },
  { id: "batna", name: "Batna", lat: 35.5559, lng: 6.1741 },
  { id: "bejaia", name: "Bejaia", lat: 36.7525, lng: 5.0556 },
  { id: "tebessa", name: "Tebessa", lat: 35.4042, lng: 8.1242 },
  { id: "jijel", name: "Jijel", lat: 36.8219, lng: 5.7667 },
  { id: "skikda", name: "Skikda", lat: 36.8775, lng: 6.9092 },
  { id: "tlemcen", name: "Tlemcen", lat: 34.8783, lng: -1.315 },
  { id: "sidi_bel_abbes", name: "Sidi Bel Abbes", lat: 35.1899, lng: -0.6308 },
  { id: "mostaganem", name: "Mostaganem", lat: 35.9371, lng: 0.0901 },
  { id: "tipaza", name: "Tipaza", lat: 36.5897, lng: 2.4475 },
  { id: "boumerdes", name: "Boumerdes", lat: 36.7564, lng: 3.4764 },
  { id: "tizi_ouzou", name: "Tizi Ouzou", lat: 36.7118, lng: 4.0459 },
  { id: "ghardaia", name: "Ghardaia", lat: 32.4909, lng: 3.6735 },
  { id: "biskra", name: "Biskra", lat: 34.8504, lng: 5.7281 },
  { id: "msila", name: "M'Sila", lat: 35.7047, lng: 4.5451 },
  { id: "chlef", name: "Chlef", lat: 36.1653, lng: 1.3345 },
]);

// ---------- Route-guide / cache key & hash helpers ----------

function riskForecastCacheKey(lat, lng, startIso) {
  return `${roundCoord(lat)}:${roundCoord(lng)}:${startIso}`;
}

function routeGuideTimestampBucket(timestampIso) {
  const parsedMs = Date.parse(timestampIso || "");
  const sourceMs = Number.isNaN(parsedMs) ? Date.now() : parsedMs;
  const bucketMs = Math.max(60 * 1000, safeNumber(ROUTE_GUIDE_TIME_BUCKET_MS) || 5 * 60 * 1000);
  return new Date(floorToBucketMs(sourceMs, bucketMs)).toISOString();
}

function hashRouteGuideInput(input) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 24);
}

function buildRouteGuideRequestCacheKey({
  origin,
  destination,
  timestampIso,
  sampleCount,
  maxAlternatives,
}) {
  return hashRouteGuideInput({
    version: 2,
    origin: {
      lat: roundNumber(origin?.lat, 5),
      lng: roundNumber(origin?.lng, 5),
    },
    destination: {
      lat: roundNumber(destination?.lat, 5),
      lng: roundNumber(destination?.lng, 5),
      name: destination?.name ? String(destination.name).trim().slice(0, 80) : "",
    },
    timestamp_bucket: routeGuideTimestampBucket(timestampIso),
    sample_count: sampleCount,
    max_alternatives: maxAlternatives,
  });
}

function limitRoutePathPoints(path, maxPointsRaw = ROUTE_GUIDE_MAX_PATH_POINTS) {
  const normalizedPath = dedupePathPoints(path);
  const maxPoints = Math.max(2, Math.round(safeNumber(maxPointsRaw) || 2));
  if (normalizedPath.length <= maxPoints) {
    return normalizedPath;
  }

  const limited = [];
  const seen = new Set();
  for (let i = 0; i < maxPoints; i += 1) {
    const index = Math.round((i * (normalizedPath.length - 1)) / (maxPoints - 1));
    const point = normalizedPath[index];
    if (!point) {
      continue;
    }
    const key = `${point[0].toFixed(6)}:${point[1].toFixed(6)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    limited.push(point);
  }

  return limited.length >= 2 ? limited : normalizedPath.slice(0, 2);
}

function buildRouteGuideGeometryHash(routes) {
  const payload = (Array.isArray(routes) ? routes : []).map((route) => ({
    route_id: route?.route_id || null,
    routing_source: route?.routing_source || null,
    distance_km: route?.distance_km == null ? null : roundNumber(route.distance_km, 3),
    duration_min: route?.duration_min == null ? null : roundNumber(route.duration_min, 3),
    path: limitRoutePathPoints(route?.path).map((point) => [
      roundNumber(point[0], 5),
      roundNumber(point[1], 5),
    ]),
  }));

  return hashRouteGuideInput(payload);
}

function getRouteGuideCache(key) {
  const cached = getCacheEntry(routeGuideCache, key);
  return cached ? cloneJsonSafe(cached) : null;
}

function setRouteGuideCache(key, payload, ttlMs = ROUTE_GUIDE_CACHE_TTL_MS) {
  if (!key || !payload) {
    return;
  }
  setCacheEntryWithTtl(
    routeGuideCache,
    key,
    cloneJsonSafe(payload),
    ROUTE_GUIDE_CACHE_MAX,
    ttlMs,
  );
}

function createRouteRiskTimer(requestId) {
  const startedAt = Date.now();
  let lastMarkAt = startedAt;
  const timings = {};

  const mark = (stage) => {
    const now = Date.now();
    timings[stage] = now - lastMarkAt;
    timings[`${stage}_total_ms`] = now - startedAt;
    lastMarkAt = now;
    console.log(
      `[Node][route-risk] request=${requestId} stage=${stage} ms=${timings[stage]} total_ms=${timings[`${stage}_total_ms`]}`,
    );
  };

  const finish = (status, extra = {}) => {
    console.log(
      `[Node][route-risk] request=${requestId} status=${status} total_ms=${Date.now() - startedAt} timings=${JSON.stringify(timings)} extra=${JSON.stringify(extra)}`,
    );
  };

  return { timings, mark, finish };
}

// ---------- Route-guide sampling helpers ----------

function buildSyntheticDestinations(origin, radiusKm, count, usedIds) {
  if (count <= 0) {
    return [];
  }

  const results = [];
  for (let i = 0; i < count; i += 1) {
    const bearing = ((360 / count) * i + 35) % 360;
    const distanceKm = Math.max(2, Math.min(radiusKm * (0.45 + i * 0.1), radiusKm - 0.5));
    if (distanceKm <= 0) {
      continue;
    }

    const point = destinationFromBearing(origin.lat, origin.lng, bearing, distanceKm);
    const id = `nearby_target_${i + 1}`;
    if (usedIds.has(id)) {
      continue;
    }
    if (!isValidLatitude(point.lat) || !isValidLongitude(point.lng)) {
      continue;
    }

    usedIds.add(id);
    results.push({
      id,
      name: `Nearby route ${i + 1}`,
      lat: point.lat,
      lng: point.lng,
      distance_km: roundNumber(
        haversineDistanceKm(origin.lat, origin.lng, point.lat, point.lng),
        2,
      ),
    });
  }
  return results;
}

function selectNearbyDestinations(origin, radiusKm, maxDestinations) {
  const usedIds = new Set();
  const fromCities = FALLBACK_DESTINATIONS
    .map((item) => {
      const distanceKm = haversineDistanceKm(origin.lat, origin.lng, item.lat, item.lng);
      return {
        ...item,
        distance_km: roundNumber(distanceKm, 2),
      };
    })
    .filter((item) => item.distance_km != null && item.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, maxDestinations)
    .map((item) => {
      usedIds.add(item.id);
      return item;
    });

  if (fromCities.length >= maxDestinations) {
    return fromCities;
  }

  const needed = maxDestinations - fromCities.length;
  const synthetic = buildSyntheticDestinations(origin, radiusKm, needed, usedIds);
  return [...fromCities, ...synthetic].slice(0, maxDestinations);
}

function buildEvenSampleIndices(totalPoints, requestedSamples) {
  if (totalPoints <= 0) {
    return [];
  }
  if (totalPoints === 1) {
    return [0];
  }

  const sampleCount = Math.max(2, Math.min(totalPoints, requestedSamples));
  const indices = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const idx = Math.round((i * (totalPoints - 1)) / (sampleCount - 1));
    if (indices.length === 0 || indices[indices.length - 1] !== idx) {
      indices.push(idx);
    }
  }

  if (indices[0] !== 0) {
    indices.unshift(0);
  }
  if (indices[indices.length - 1] !== totalPoints - 1) {
    indices.push(totalPoints - 1);
  }

  return indices;
}

function sampleRoutePoints(path, requestedSamples) {
  const normalizedPath = dedupePathPoints(path);
  if (normalizedPath.length === 0) {
    return [];
  }

  const indices = buildEvenSampleIndices(normalizedPath.length, requestedSamples);
  return indices.map((idx) => normalizedPath[idx]);
}

function sampleRouteIndices(pathLength, requestedSamples) {
  if (!Number.isFinite(pathLength) || pathLength <= 0) {
    return [];
  }
  if (pathLength === 1) {
    return [0];
  }

  const sampleCount = parseBoundedNumber(requestedSamples, DEFAULT_GUIDE_SAMPLE_COUNT, {
    min: 5,
    max: MAX_GUIDE_SAMPLE_COUNT,
    integer: true,
  });
  const targetCount = Math.max(2, Math.min(pathLength, sampleCount));

  const indices = [];
  for (let i = 0; i < targetCount; i += 1) {
    const idx = Math.round((i * (pathLength - 1)) / (targetCount - 1));
    if (indices.length === 0 || indices[indices.length - 1] !== idx) {
      indices.push(idx);
    }
  }

  if (indices[0] !== 0) {
    indices.unshift(0);
  }
  if (indices[indices.length - 1] !== pathLength - 1) {
    indices.push(pathLength - 1);
  }

  return indices;
}

function buildSamplePointsFromIndices(path, sampleIndices) {
  if (!Array.isArray(path) || !Array.isArray(sampleIndices)) {
    return [];
  }

  const points = [];
  for (const idx of sampleIndices) {
    const point = normalizeLatLngPoint(path[idx]);
    if (!point) {
      continue;
    }
    points.push(point);
  }
  return points;
}

function aggregateRouteSummary(samples) {
  const percents = samples
    .map((sample) => safeNumber(sample?.danger_percent))
    .filter((value) => value != null);

  if (!percents.length) {
    return {
      danger_percent: 0,
      danger_level: "low",
    };
  }

  const maxPercent = Math.max(...percents);
  const meanPercent = percents.reduce((acc, value) => acc + value, 0) / percents.length;
  const aggregated = roundNumber(0.6 * maxPercent + 0.4 * meanPercent, 2) ?? 0;

  return {
    danger_percent: aggregated,
    danger_level: normalizeDangerLevel(null, aggregated),
  };
}

function summarizeRouteSamples(samples) {
  return aggregateRouteSummary(samples);
}

function buildRouteGuideHash(origin, destination, timestampIso) {
  const input = [
    roundNumber(origin.lat, 5),
    roundNumber(origin.lng, 5),
    roundNumber(destination.lat, 5),
    roundNumber(destination.lng, 5),
    timestampIso,
  ].join("|");

  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 10);
}

function normalizeOverlaySamplePrediction(prediction) {
  const percentRaw = safeNumber(prediction?.danger_percent);
  const percent = percentRaw == null ? 0 : roundNumber(percentRaw, 2);
  const level = normalizeDangerLevel(prediction?.danger_level, percent);
  const confidence = safeNumber(prediction?.confidence);
  const quality = prediction?.quality == null ? null : String(prediction.quality);

  return {
    danger_percent: percent == null ? 0 : percent,
    danger_level: level,
    confidence: confidence == null ? null : roundNumber(confidence, 2),
    quality,
  };
}

async function scoreRouteSamplesWithOverlay({ sampledPoints, routeHash, timestampIso }) {
  const scoredRows = await Promise.all(
    sampledPoints.map(async ([lat, lng], idx) => {
      const sampleId = `route_${routeHash}_s${idx}`;
      const row = await buildDangerRow({
        lat,
        lng,
        timestamp: timestampIso,
        roadFlags: ENABLE_OSM_FLAGS_FOR_ROUTES ? null : ROAD_FLAG_ZEROES,
      });

      setCachedSegmentRow(sampleId, row);

      return {
        sample_id: sampleId,
        lat,
        lng,
        row,
        model_row: {
          segment_id: sampleId,
          ...row,
        },
      };
    }),
  );

  const overlayResponse = await postToFlask("/risk/overlay", {
    rows: scoredRows.map((item) => item.model_row),
  });

  const overlayResults = Array.isArray(overlayResponse?.data?.results)
    ? overlayResponse.data.results
    : [];
  const predictionBySampleId = new Map();

  for (let i = 0; i < overlayResults.length; i += 1) {
    const item = overlayResults[i];
    const sampleId = String(item?.segment_id ?? scoredRows[i]?.sample_id ?? "");
    if (!sampleId) {
      continue;
    }
    predictionBySampleId.set(sampleId, normalizeOverlaySamplePrediction(item));
  }

  const sampleRowById = new Map();
  const samples = scoredRows.map((item) => {
    const prediction =
      predictionBySampleId.get(item.sample_id) || {
        danger_percent: 0,
        danger_level: "low",
        confidence: null,
        quality: null,
      };

    sampleRowById.set(item.sample_id, item.row);

    return {
      segment_id: item.sample_id,
      sample_id: item.sample_id,
      lat: item.lat,
      lng: item.lng,
      danger_percent: prediction.danger_percent,
      danger_level: prediction.danger_level,
      confidence: prediction.confidence,
      quality: prediction.quality,
    };
  });

  return { samples, sampleRowById };
}

function buildRouteGuideSegments({
  fullPath,
  sampleIndices,
  samples,
  fallbackSummary,
  routeHash,
  sampleRowById,
  useStraightSegments = false,
}) {
  if (!Array.isArray(samples) || samples.length < 2 || !Array.isArray(sampleIndices)) {
    return [];
  }

  const fallbackPercent = safeNumber(fallbackSummary?.danger_percent) ?? 0;
  const fallbackLevel = normalizeDangerLevel(fallbackSummary?.danger_level, fallbackPercent);
  const segments = [];

  for (let i = 0; i < samples.length - 1 && i < sampleIndices.length - 1; i += 1) {
    const start = samples[i];
    const end = samples[i + 1];
    if (!start || !end) {
      continue;
    }

    const i0 = Math.max(0, Number(sampleIndices[i]));
    const i1 = Math.max(i0, Number(sampleIndices[i + 1]));
    const endPercent = safeNumber(end.danger_percent);
    const segmentPercent = endPercent == null ? fallbackPercent : roundNumber(endPercent, 2);
    const segmentLevel = normalizeDangerLevel(end.danger_level, segmentPercent);
    const segmentId = `route_${routeHash}_seg${i}`;

    if (sampleRowById?.has(end.sample_id)) {
      setCachedSegmentRow(segmentId, sampleRowById.get(end.sample_id));
    }

    let segmentPath = [];
    if (useStraightSegments) {
      segmentPath = [
        [start.lat, start.lng],
        [end.lat, end.lng],
      ];
    } else if (Array.isArray(fullPath)) {
      segmentPath = dedupePathPoints(fullPath.slice(i0, i1 + 1));
    }
    if (!Array.isArray(segmentPath) || segmentPath.length < 2) {
      segmentPath = [
        [start.lat, start.lng],
        [end.lat, end.lng],
      ];
    }

    segments.push({
      segment_id: segmentId,
      path: segmentPath,
      danger_percent: segmentPercent == null ? fallbackPercent : segmentPercent,
      danger_level: segmentLevel || fallbackLevel,
      sample_from: i,
      sample_to: i + 1,
    });
  }

  return segments;
}

function buildRiskUnavailableSummary(message) {
  return {
    danger_percent: null,
    danger_level: "unknown",
    riskAvailable: false,
    risk_available: false,
    message,
  };
}

function buildRiskUnavailableSamples({ routeHash, routeId, fullPath, sampleIndices }) {
  const sampledPoints = buildSamplePointsFromIndices(fullPath, sampleIndices);
  return sampledPoints.map(([lat, lng], sampleIndex) => ({
    segment_id: `route_${routeHash}_${routeId}_s${sampleIndex}`,
    sample_id: `route_${routeHash}_${routeId}_s${sampleIndex}`,
    lat,
    lng,
    danger_percent: null,
    danger_level: "unknown",
    confidence: null,
    quality: "risk_unavailable",
    riskAvailable: false,
    risk_available: false,
  }));
}

function buildRiskUnavailableSegments({ routeHash, routeId, fullPath, sampleIndices, samples }) {
  if (
    !Array.isArray(fullPath) ||
    fullPath.length < 2 ||
    !Array.isArray(sampleIndices) ||
    sampleIndices.length < 2 ||
    !Array.isArray(samples) ||
    samples.length < 2
  ) {
    return [];
  }

  const segments = [];
  for (let i = 0; i < samples.length - 1 && i < sampleIndices.length - 1; i += 1) {
    const start = samples[i];
    const end = samples[i + 1];
    if (!start || !end) {
      continue;
    }

    const i0 = Math.max(0, Number(sampleIndices[i]));
    const i1 = Math.max(i0, Number(sampleIndices[i + 1]));
    let segmentPath = dedupePathPoints(fullPath.slice(i0, i1 + 1));
    if (!Array.isArray(segmentPath) || segmentPath.length < 2) {
      segmentPath = [
        [start.lat, start.lng],
        [end.lat, end.lng],
      ];
    }

    segments.push({
      segment_id: `route_${routeHash}_${routeId}_seg${i}`,
      path: segmentPath,
      danger_percent: null,
      danger_level: "unknown",
      sample_from: i,
      sample_to: i + 1,
      riskAvailable: false,
      risk_available: false,
    });
  }

  return segments;
}

function buildRouteGuideResponsePayload({
  origin,
  destinationPoint,
  destinationName,
  routedRoutes,
  routeHash,
  routeRiskDataByRouteId,
  sampleCount = DEFAULT_GUIDE_SAMPLE_COUNT,
  message = null,
  riskAvailable = true,
  timings = null,
  cache = null,
  geometryHash = null,
}) {
  const routes = (Array.isArray(routedRoutes) ? routedRoutes : [])
    .map((route, routeIndex) => {
      const routeId = route?.route_id || `route_${routeIndex + 1}`;
      const fullPath = limitRoutePathPoints(route?.path);
      const sampleIndices = sampleRouteIndices(fullPath.length, sampleCount);
      const scoredData = routeRiskDataByRouteId?.get(routeId) || null;
      const routeRiskAvailable = riskAvailable && Boolean(scoredData) && scoredData?.riskAvailable !== false;
      const summary = routeRiskAvailable
        ? scoredData?.summary || aggregateRouteSummary(scoredData?.samples || [])
        : buildRiskUnavailableSummary(message || "Route loaded, but risk scoring is unavailable.");
      const samples = routeRiskAvailable
        ? scoredData?.samples || []
        : buildRiskUnavailableSamples({
            routeHash,
            routeId,
            fullPath,
            sampleIndices,
          });
      const segments = routeRiskAvailable
        ? scoredData?.segments || []
        : buildRiskUnavailableSegments({
            routeHash,
            routeId,
            fullPath,
            sampleIndices,
            samples,
          });

      return {
        route_id: routeId,
        destination: {
          name: destinationName || "Destination",
          lat: destinationPoint.lat,
          lng: destinationPoint.lng,
        },
        routing_source: route?.routing_source,
        route_warning: route?.route_warning || null,
        path: fullPath,
        sample_indices: routeRiskAvailable ? scoredData?.sampleIndices || sampleIndices : sampleIndices,
        samples,
        segments,
        summary: {
          ...summary,
          riskAvailable: routeRiskAvailable,
          risk_available: routeRiskAvailable,
        },
        distance_km: route?.distance_km,
        eta_min: route?.duration_min,
        duration_min: route?.duration_min,
        riskAvailable: routeRiskAvailable,
        risk_available: routeRiskAvailable,
        riskMessage: routeRiskAvailable ? null : message,
      };
    })
    .filter((route) => Array.isArray(route.path) && route.path.length >= 2);

  const primaryRoute = routes[0] || null;
  return {
    origin,
    destination: {
      name: destinationName || "Destination",
      lat: destinationPoint.lat,
      lng: destinationPoint.lng,
    },
    routing_source: primaryRoute?.routing_source || null,
    path: primaryRoute?.path || [],
    sample_indices: primaryRoute?.sample_indices || [],
    samples: primaryRoute?.samples || [],
    segments: primaryRoute?.segments || [],
    summary:
      primaryRoute?.summary ||
      buildRiskUnavailableSummary(message || "Route loaded, but risk scoring is unavailable."),
    distance_km: primaryRoute?.distance_km ?? null,
    eta_min: primaryRoute?.duration_min ?? null,
    duration_min: primaryRoute?.duration_min ?? null,
    route_warning: primaryRoute?.route_warning || null,
    routes,
    riskAvailable,
    risk_available: riskAvailable,
    message,
    cache,
    geometry_hash: geometryHash,
    timings,
  };
}

function buildRouteSegmentsFromSamples(samples, fallbackSummary) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return [];
  }

  const fallbackPercent = safeNumber(fallbackSummary?.danger_percent) ?? 0;
  const fallbackLevel = normalizeDangerLevel(fallbackSummary?.danger_level, fallbackPercent);

  const segments = [];
  for (let i = 0; i < samples.length - 1; i += 1) {
    const start = samples[i];
    const end = samples[i + 1];
    if (!start || !end) {
      continue;
    }

    const endPercent = safeNumber(end.danger_percent);
    const segmentPercent = endPercent == null ? fallbackPercent : roundNumber(endPercent, 2);
    const segmentLevel = normalizeDangerLevel(end.danger_level, segmentPercent);

    segments.push({
      path: [
        [start.lat, start.lng],
        [end.lat, end.lng],
      ],
      danger_percent: segmentPercent == null ? fallbackPercent : segmentPercent,
      danger_level: segmentLevel || fallbackLevel,
    });
  }

  return segments;
}

function buildRouteSegmentsFromIndexedPath({
  routeId,
  fullPath,
  sampleIndices,
  samples,
  fallbackSummary,
  useStraightSegments = false,
}) {
  if (
    !Array.isArray(samples) ||
    samples.length < 2 ||
    !Array.isArray(sampleIndices) ||
    sampleIndices.length < 2
  ) {
    return [];
  }

  const fallbackPercent = safeNumber(fallbackSummary?.danger_percent) ?? 0;
  const fallbackLevel = normalizeDangerLevel(fallbackSummary?.danger_level, fallbackPercent);
  const segments = [];

  for (let i = 0; i < samples.length - 1 && i < sampleIndices.length - 1; i += 1) {
    const start = samples[i];
    const end = samples[i + 1];
    if (!start || !end) {
      continue;
    }

    const i0 = Math.max(0, Number(sampleIndices[i]));
    const i1 = Math.max(i0, Number(sampleIndices[i + 1]));
    const endPercent = safeNumber(end.danger_percent);
    const segmentPercent = endPercent == null ? fallbackPercent : roundNumber(endPercent, 2);
    const segmentLevel = normalizeDangerLevel(end.danger_level, segmentPercent);

    let segmentPath = [];
    if (useStraightSegments) {
      segmentPath = [
        [start.lat, start.lng],
        [end.lat, end.lng],
      ];
    } else if (Array.isArray(fullPath)) {
      segmentPath = dedupePathPoints(fullPath.slice(i0, i1 + 1));
    }

    if (!Array.isArray(segmentPath) || segmentPath.length < 2) {
      segmentPath = [
        [start.lat, start.lng],
        [end.lat, end.lng],
      ];
    }

    segments.push({
      segment_id: `${routeId || "route"}:seg${i}`,
      path: segmentPath,
      danger_percent: segmentPercent == null ? fallbackPercent : segmentPercent,
      danger_level: segmentLevel || fallbackLevel,
      sample_from: i,
      sample_to: i + 1,
    });
  }

  return segments;
}

function pruneSegmentCacheIfNeeded() {
  if (segmentRowCache.size <= MAX_SEGMENT_CACHE) {
    return;
  }
  const excess = segmentRowCache.size - MAX_SEGMENT_CACHE;
  const keys = segmentRowCache.keys();
  for (let i = 0; i < excess; i += 1) {
    const k = keys.next().value;
    if (k == null) {
      break;
    }
    segmentRowCache.delete(k);
  }
}

function setCachedSegmentRow(segmentId, row) {
  if (segmentId == null) {
    return;
  }
  segmentRowCache.set(String(segmentId), row);
  pruneSegmentCacheIfNeeded();
}

// =============================================================================
// Controller exports
// =============================================================================

exports.predictDriverRisk = async (req, res) => {
  const body = req.body;
  if (body == null || typeof body !== "object" || Object.keys(body).length === 0) {
    return res.status(400).json({ error: "Empty request body" });
  }

  try {
    const response = await postToFlask("/predict", body);
    return res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const payload = err.response?.data || { error: "Model service error" };
    console.error("[Node] /predict error:", err.message);
    return res.status(status).json(payload);
  }
};

exports.predictDriverRiskStream = async (req, res) => {
  const body = req.body;
  if (body == null || typeof body !== "object" || Object.keys(body).length === 0) {
    return res.status(400).json({ error: "Empty request body" });
  }

  console.info("[Node] /predict/stream request started");

  try {
    const response = await postToFlaskStream("/predict/stream", body);
    if (response.status >= 400) {
      const text = await readStreamText(response.data);
      let payload = { error: "Quiz explanation stream failed" };
      try {
        payload = JSON.parse(text);
      } catch {
        payload.details = text || null;
      }
      return res.status(response.status).json(payload);
    }

    res.status(response.status);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    response.data.on("error", (error) => {
      console.error("[Node] /predict/stream upstream error:", error.message);
      if (!res.writableEnded) {
        writeSse(res, "error", { error: "Quiz explanation stream interrupted" });
        res.end();
      }
    });

    response.data.on("end", () => {
      console.info("[Node] /predict/stream completed");
    });

    req.on("close", () => {
      if (!res.writableEnded && response.data.destroy) {
        response.data.destroy();
      }
    });

    return response.data.pipe(res);
  } catch (err) {
    const status = err.response?.status || 500;
    const payload = err.response?.data || { error: "Quiz explanation stream failed" };
    console.error("[Node] /predict/stream error:", err.message);

    if (res.headersSent) {
      writeSse(res, "error", {
        error: payload?.error || "Quiz explanation stream failed",
      });
      return res.end();
    }

    return res.status(status).json(payload);
  }
};

exports.testQuizExplanation = async (req, res) => {
  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};

  try {
    const response = await postToFlask("/quiz/explanation/test", body);
    return res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const payload = err.response?.data || { error: "Quiz explanation test failed" };
    console.error("[Node] /quiz/explanation/test error:", err.message);
    return res.status(status).json(payload);
  }
};

exports.getCurrentWeather = async (req, res) => {
  const point = validateLatLngStrict(req.query);
  if (!point) {
    return res.status(400).json({ error: "valid lat and lng query params are required" });
  }

  try {
    const timestampIso = req.query?.timestamp ? toIsoTimestamp(req.query.timestamp) : null;
    const weather = await getCurrentWeatherUi(point.lat, point.lng, timestampIso, req.deadline);
    return res.json(weather);
  } catch (err) {
    const status = err.response?.status || 500;
    const payload = err.response?.data || { error: "Current weather fetch failed" };
    console.error("[Node] /api/weather/current error:", err.message);
    return res.status(status).json(payload);
  }
};

exports.getReversePlace = async (req, res) => {
  const point = validateLatLngStrict(req.query);
  if (!point) {
    return res.status(400).json({ error: "valid lat and lng query params are required" });
  }

  try {
    const response = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: {
        format: "jsonv2",
        lat: point.lat,
        lon: point.lng,
        zoom: 18,
        addressdetails: 1,
        namedetails: 1,
      },
      timeout: NOMINATIM_TIMEOUT_MS,
      headers: {
        Accept: "application/json",
        "User-Agent": "SIARA/1.0 (map reverse geocoding)",
      },
    });

    return res.json(response.data || {});
  } catch (err) {
    const status = err.response?.status || 500;
    const payload = err.response?.data || { error: "Reverse geocoding failed" };
    console.error("[Node] /api/location/reverse error:", err.message);
    return res.status(status).json(payload);
  }
};

exports.getRiskForecast24h = async (req, res) => {
  const point = validateLatLngStrict(req.query);
  if (!point) {
    return res.status(400).json({ error: "valid lat and lng query params are required" });
  }

  const timestampIso = toIsoTimestamp(req.query?.timestamp);
  const parsedTimestampMs = Date.parse(timestampIso);
  const safeTimestampMs = Number.isNaN(parsedTimestampMs) ? Date.now() : parsedTimestampMs;
  const deltaFromNowMs = Math.abs(safeTimestampMs - Date.now());
  const useMovingNowBucket = deltaFromNowMs <= 10 * 60 * 1000;
  const forecastAnchorMs = useMovingNowBucket
    ? floorToBucketMs(safeTimestampMs, RISK_FORECAST_BUCKET_MS)
    : safeTimestampMs;
  const forecastAnchorIso = new Date(forecastAnchorMs).toISOString();
  const cacheKey = riskForecastCacheKey(point.lat, point.lng, forecastAnchorIso);

  const deadline = req.deadline;

  try {
    const nowRoadFlags = await getRoadFlagsAsync(point.lat, point.lng, null, deadline);
    const nowRow = await buildDangerRow({
      lat: point.lat,
      lng: point.lng,
      timestamp: timestampIso,
      roadFlags: nowRoadFlags,
      deadline,
    });

    let cachedHourly = getCacheEntry(riskForecastCache, cacheKey) || null;
    let nowPredictionRaw = null;

    if (!cachedHourly) {
      const weatherSeries = await getForecastWeatherSeries(
        point.lat,
        point.lng,
        forecastAnchorIso,
        deadline,
      );
      const hourlyIsoPoints = buildHourlyIsoPoints(forecastAnchorIso, 24);
      const forecastRoadFlags = ENABLE_OSM_FLAGS_FOR_ROUTES
        ? nowRoadFlags
        : toRoadFlags(ROAD_FLAG_ZEROES);
      const rowPreview = [];
      const modelRows = [
        {
          segment_id: "__now__",
          ...nowRow,
        },
      ];

      const twilightSettled = await Promise.allSettled(
        hourlyIsoPoints.map((timeIso) =>
          getTwilightFields(point.lat, point.lng, timeIso, deadline),
        ),
      );

      for (let i = 0; i < hourlyIsoPoints.length; i += 1) {
        const timeIso = hourlyIsoPoints[i];
        const targetSeconds = Math.floor(Date.parse(timeIso) / 1000);
        const snapshot = extractForecastSnapshot(weatherSeries?.hourly, targetSeconds) || {};
        const normalizedSnapshot = normalizeSnapshotForModelUnits(
          snapshot,
          getUnitsForWeatherSource(weatherSeries, "hourly"),
          "hourly",
        );
        const weatherRow = buildModelWeatherRowFromSnapshot(normalizedSnapshot, "hourly");
        const twilightOutcome = twilightSettled[i];
        const twilightFields =
          twilightOutcome && twilightOutcome.status === "fulfilled"
            ? twilightOutcome.value
            : buildTwilightFallback(timeIso);

        const row = {
          Start_Time: timeIso,
          "Temperature(F)": safeRowNumber(weatherRow?.["Temperature(F)"], 0),
          "Humidity(%)": safeRowNumber(weatherRow?.["Humidity(%)"], 0),
          "Pressure(in)": safeRowNumber(weatherRow?.["Pressure(in)"], 0),
          "Visibility(mi)": safeRowNumber(weatherRow?.["Visibility(mi)"], 0),
          "Wind_Speed(mph)": safeRowNumber(weatherRow?.["Wind_Speed(mph)"], 0),
          windspeed_10m: safeRowNumber(weatherRow?.windspeed_10m, null),
          windspeed_10m_kmh: safeRowNumber(weatherRow?.windspeed_10m_kmh, null),
          winddirection_10m: safeRowNumber(weatherRow?.winddirection_10m, null),
          "Precipitation(in)": safeRowNumber(weatherRow?.["Precipitation(in)"], 0),
          Wind_Direction: safeRowCategory(weatherRow?.Wind_Direction, "Unknown"),
          Weather_Condition: safeRowCategory(weatherRow?.Weather_Condition, "Unknown"),
          Sunrise_Sunset: safeRowCategory(twilightFields?.Sunrise_Sunset, "Night"),
          Civil_Twilight: safeRowCategory(twilightFields?.Civil_Twilight, "Night"),
          Nautical_Twilight: safeRowCategory(twilightFields?.Nautical_Twilight, "Night"),
          Astronomical_Twilight: safeRowCategory(twilightFields?.Astronomical_Twilight, "Night"),
          ...forecastRoadFlags,
        };

        modelRows.push({
          segment_id: `h${i}`,
          ...row,
        });

        if (DEBUG_FORECAST && rowPreview.length < 2) {
          rowPreview.push({
            segment_id: `h${i}`,
            time_iso: timeIso,
            danger_inputs: {
              temperature_f: row["Temperature(F)"],
              humidity_pct: row["Humidity(%)"],
              weather_condition: row.Weather_Condition,
              wind_mph: row["Wind_Speed(mph)"],
              wind_kmh: row.windspeed_10m_kmh,
            },
          });
        }
      }

      const overlayResponse = await postToFlask("/risk/overlay", { rows: modelRows }, deadline);
      const overlayResults = Array.isArray(overlayResponse?.data?.results)
        ? overlayResponse.data.results
        : [];
      const overlayBySegment = new Map();
      for (let i = 0; i < overlayResults.length; i += 1) {
        const item = overlayResults[i];
        const fallbackId = i === 0 ? "__now__" : `h${i - 1}`;
        const segmentId = String(item?.segment_id ?? fallbackId);
        overlayBySegment.set(segmentId, item || {});
      }

      nowPredictionRaw = overlayBySegment.get("__now__") || null;

      const points = hourlyIsoPoints.map((timeIso, index) => {
        const normalized = normalizeOverlaySamplePrediction(overlayBySegment.get(`h${index}`) || {});
        return {
          time_iso: timeIso,
          time_label: formatHourLabel(timeIso),
          danger_percent: normalized.danger_percent,
          danger_level: normalized.danger_level,
        };
      });

      cachedHourly = {
        start_time_iso: forecastAnchorIso,
        horizon_hours: 24,
        points,
      };
      setCacheEntryWithTtl(
        riskForecastCache,
        cacheKey,
        cachedHourly,
        MAX_RISK_FORECAST_CACHE,
        RISK_FORECAST_CACHE_TTL_MS,
      );

      if (DEBUG_FORECAST) {
        console.log(
          `[Node][forecast24] timestampIso=${timestampIso} anchor=${forecastAnchorIso} bucket_mode=${useMovingNowBucket ? "moving_now" : "exact"} lat=${point.lat} lng=${point.lng}`,
        );
        console.log("[Node][forecast24] hourly_units:", weatherSeries?.hourly_units);
        console.log("[Node][forecast24] row_preview:", rowPreview);
      }
    } else {
      const overlayNowResponse = await postToFlask(
        "/risk/overlay",
        { rows: [{ segment_id: "__now__", ...nowRow }] },
        deadline,
      );
      nowPredictionRaw = Array.isArray(overlayNowResponse?.data?.results)
        ? overlayNowResponse.data.results[0] || null
        : null;
    }

    const normalizedNow = normalizeOverlaySamplePrediction(nowPredictionRaw || {});
    const nowPoint = {
      time_iso: timestampIso,
      time_label: formatHourLabel(timestampIso),
      danger_percent: normalizedNow.danger_percent,
      danger_level: normalizedNow.danger_level,
    };

    if (DEBUG_FORECAST) {
      console.log("[Node][forecast24] now_point:", nowPoint);
      console.log("[Node][forecast24] points_preview:", (cachedHourly?.points || []).slice(0, 2));
    }

    return res.json({
      lat: point.lat,
      lng: point.lng,
      now_point: nowPoint,
      start_time_iso: cachedHourly?.start_time_iso || forecastAnchorIso,
      horizon_hours: 24,
      points: Array.isArray(cachedHourly?.points) ? cachedHourly.points : [],
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const payload = err.response?.data || { error: "Risk forecast model service error" };
    console.error("[Node] /api/risk/forecast24h error:", err.message);
    return res.status(status).json(payload);
  }
};

exports.predictCurrentRisk = async (req, res) => {
  const point = validateLatLng(req.body);
  if (!point) {
    return res.status(400).json({ error: "lat and lng are required" });
  }

  const deadline = req.deadline;

  try {
    const row = await buildDangerRow({
      lat: point.lat,
      lng: point.lng,
      timestamp: req.body?.timestamp,
      roadFlags: req.body?.roadFlags,
      deadline,
    });

    const response = await postToFlask("/risk/current", row, deadline);
    const responseData =
      response?.data && typeof response.data === "object" ? { ...response.data } : {};

    try {
      const persistence = await persistPrediction({
        prediction: responseData,
        timestamp: row?.Start_Time || req.body?.timestamp,
        lat: point.lat,
        lng: point.lng,
        allowNearestSegmentLookup: true,
        context: "current",
      });

      if (persistence?.roadSegmentId) {
        responseData.road_segment_id = persistence.roadSegmentId;
      }
    } catch (persistError) {
      console.error("[Node] /api/risk/current persistence error:", persistError.message);
    }

    // Explicit semantic wrapper so the frontend never confuses this with the
    // occurrence model. danger_percent is a 0–100 relative severity score, NOT
    // a calibrated accident-occurrence probability — surface that intent in
    // the response shape itself instead of relying on UI labels alone.
    const dangerPercentNum = Number(responseData.danger_percent);
    const dangerScore = Number.isFinite(dangerPercentNum)
      ? Math.max(0, Math.min(1, dangerPercentNum / 100))
      : null;
    const confidenceNum = Number(responseData.confidence);
    responseData.dangerZoneRisk = {
      score: dangerScore,
      riskLevel: responseData.danger_level || null,
      confidence: Number.isFinite(confidenceNum) ? confidenceNum : null,
      modelVersion: responseData.model_version || "danger_zone_v1",
      source: "danger_zone_model",
      isCalibratedProbability: false,
      warning:
        "Relative danger score, not occurrence probability",
    };

    return res.json(responseData);
  } catch (err) {
    const status = err.response?.status || 500;
    const payload = err.response?.data || { error: "Risk current model service error" };
    console.error("[Node] /api/risk/current error:", err.message);
    return res.status(status).json(payload);
  }
};

exports.predictRiskOverlay = async (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows array is required" });
  }

  const invalid = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => validateLatLng(row) == null)
    .map(({ index }) => index);
  if (invalid.length > 0) {
    return res.status(400).json({ error: "each row needs lat/lng", invalid_indices: invalid });
  }

  const deadline = req.deadline;

  try {
    const modelRows = await Promise.all(
      rows.map(async (row, index) => {
        const point = validateLatLng(row);
        const fullRow = await buildDangerRow({
          lat: point.lat,
          lng: point.lng,
          timestamp: row?.timestamp || req.body?.timestamp,
          roadFlags: row?.roadFlags ?? (ENABLE_OSM_FLAGS_FOR_ROUTES ? null : ROAD_FLAG_ZEROES),
          deadline,
        });

        const segmentId = row.segment_id ?? row.segmentId ?? index;
        setCachedSegmentRow(segmentId, fullRow);

        return {
          segment_id: segmentId,
          ...fullRow,
        };
      }),
    );

    const response = await postToFlask("/risk/overlay", { rows: modelRows }, deadline);
    const responseData = response?.data || { count: 0, results: [] };

    try {
      const items = (Array.isArray(responseData?.results) ? responseData.results : [])
        .map((item, index) => ({
          prediction: item,
          timestamp: modelRows[index]?.Start_Time || req.body?.timestamp,
          roadSegmentId:
            item?.segment_id ?? modelRows[index]?.segment_id ?? rows[index]?.segment_id,
          lat: rows[index]?.lat ?? modelRows[index]?.lat,
          lng: rows[index]?.lng ?? modelRows[index]?.lng,
          allowNearestSegmentLookup: false,
          context: "overlay",
        }))
        .filter((item) => parseNumericRoadSegmentId(item.roadSegmentId));
      await persistPredictions(items);
    } catch (persistError) {
      console.error("[Node] /api/risk/overlay persistence error:", persistError.message);
    }

    return res.json(responseData);
  } catch (err) {
    const status = err.response?.status || 500;
    const payload = err.response?.data || { error: "Risk overlay model service error" };
    console.error("[Node] /api/risk/overlay error:", err.message);
    return res.status(status).json(payload);
  }
};

exports.predictRouteGuide = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString("hex");
  const timer = createRouteRiskTimer(requestId);
  const timeoutMessage = "Route loaded, but risk scoring timed out.";
  let origin = null;
  let destinationPoint = null;
  let destinationName = "Destination";
  let timestampIso = null;
  let sampleCount = DEFAULT_GUIDE_SAMPLE_COUNT;
  let maxAlternatives = DEFAULT_GUIDE_ALTERNATIVE_ROUTES;
  let routeHash = null;
  let requestCacheKey = null;
  let geometryCacheKey = null;
  let geometryHash = null;
  let routedRoutes = [];

  try {
    origin = validateLatLngStrict(req.body?.origin);
    destinationPoint = validateLatLngStrict(req.body?.destination);
    if (!origin || !destinationPoint) {
      timer.mark("request_parse");
      timer.finish("bad_request");
      return res.status(400).json({
        error: "origin and destination with valid lat/lng are required",
      });
    }

    destinationName = req.body?.destination?.name || "Destination";
    timestampIso = toIsoTimestamp(req.body?.timestamp);
    // Choose an adaptive sample count from origin→destination distance so
    // short trips don't pay for 12 PostGIS+weather lookups, and only let the
    // client override via req.body.sample_count if present.
    const adaptiveDefault = adaptiveRouteSampleCount(origin, destinationPoint);
    sampleCount = parseBoundedNumber(req.body?.sample_count, adaptiveDefault, {
      min: 5,
      max: MAX_GUIDE_SAMPLE_COUNT,
      integer: true,
    });
    maxAlternatives = parseBoundedNumber(
      req.body?.max_alternatives,
      DEFAULT_GUIDE_ALTERNATIVE_ROUTES,
      {
        min: 1,
        max: MAX_GUIDE_ALTERNATIVE_ROUTES,
        integer: true,
      },
    );
    routeHash = buildRouteGuideHash(
      origin,
      destinationPoint,
      routeGuideTimestampBucket(timestampIso),
    );
    requestCacheKey = buildRouteGuideRequestCacheKey({
      origin,
      destination: {
        ...destinationPoint,
        name: destinationName,
      },
      timestampIso,
      sampleCount,
      maxAlternatives,
    });
    timer.mark("request_parse");

    const requestCached = getRouteGuideCache(requestCacheKey);
    if (requestCached) {
      timer.mark("cache_lookup");
      timer.finish("cache_hit", { cache_key: requestCacheKey, source: "request" });
      return res.json({
        ...requestCached,
        cache: { hit: true, key: requestCacheKey, source: "route-guide-request" },
        timings: timer.timings,
      });
    }
    timer.mark("cache_lookup");

    try {
      routedRoutes = await getOsrmRouteAlternatives(
        origin,
        destinationPoint,
        maxAlternatives,
        req.deadline,
      );
    } catch (osrmError) {
      const straightDistanceKm = haversineDistanceKm(
        origin.lat,
        origin.lng,
        destinationPoint.lat,
        destinationPoint.lng,
      );
      if (DEBUG_OSRM) {
        console.warn("[Node][osrm] /api/risk/route fallback:", osrmError.message);
      }

      routedRoutes = [
        {
          route_id: "fallback_1",
          path: buildStraightLinePath(origin, destinationPoint),
          routing_source: "straight_line",
          distance_km: roundNumber(straightDistanceKm, 2),
          duration_min: null,
          route_warning: "osrm_failed",
        },
      ];
    }

    routedRoutes = routedRoutes
      .map((route, index) => ({
        ...route,
        route_id: route?.route_id || `route_${index + 1}`,
        path: limitRoutePathPoints(route?.path),
      }))
      .filter((route) => Array.isArray(route.path) && route.path.length >= 2);

    if (!routedRoutes.length) {
      timer.mark("route_geometry_processing");
      timer.finish("error", { reason: "empty_route_geometry" });
      return res.status(500).json({ error: "Failed to build route geometry" });
    }

    geometryHash = buildRouteGuideGeometryHash(routedRoutes);
    geometryCacheKey = hashRouteGuideInput({
      version: 2,
      geometry_hash: geometryHash,
      origin: {
        lat: roundNumber(origin.lat, 5),
        lng: roundNumber(origin.lng, 5),
      },
      destination: {
        lat: roundNumber(destinationPoint.lat, 5),
        lng: roundNumber(destinationPoint.lng, 5),
      },
      timestamp_bucket: routeGuideTimestampBucket(timestampIso),
      sample_count: sampleCount,
    });
    timer.mark("route_geometry_processing");

    const geometryCached = getRouteGuideCache(geometryCacheKey);
    if (geometryCached) {
      setRouteGuideCache(requestCacheKey, geometryCached);
      timer.finish("cache_hit", { cache_key: geometryCacheKey, source: "geometry" });
      return res.json({
        ...geometryCached,
        cache: { hit: true, key: geometryCacheKey, source: "route-guide-geometry" },
        timings: timer.timings,
      });
    }

    const maxScoringRoutes = parseBoundedNumber(
      ROUTE_GUIDE_MAX_SCORING_ROUTES,
      1,
      {
        min: 1,
        max: MAX_GUIDE_ALTERNATIVE_ROUTES,
        integer: true,
      },
    );
    const scoringRoutes = routedRoutes.slice(0, maxScoringRoutes);
    const sampleJobs = [];
    const routeSamplesByRouteId = new Map();
    const routeSampleMetaByRouteId = new Map();
    const seenSampleKeys = new Map();

    for (const route of scoringRoutes) {
      const fullPath = limitRoutePathPoints(route?.path);
      const sampleIndices = sampleRouteIndices(fullPath.length, sampleCount);
      const sampledPoints = buildSamplePointsFromIndices(fullPath, sampleIndices);

      if (sampledPoints.length < 2) {
        routeSamplesByRouteId.set(route.route_id, []);
        routeSampleMetaByRouteId.set(route.route_id, {
          fullPath,
          sampleIndices,
        });
        continue;
      }

      const routeSamples = sampledPoints.map(([lat, lng], sampleIndex) => {
        const sampleKey = `${roundNumber(lat, 5)}:${roundNumber(lng, 5)}`;
        const sampleId =
          seenSampleKeys.get(sampleKey) || `route_${routeHash}_${route.route_id}_s${sampleIndex}`;
        if (!seenSampleKeys.has(sampleKey)) {
          seenSampleKeys.set(sampleKey, sampleId);
          sampleJobs.push({
            sample_id: sampleId,
            route_id: route.route_id,
            sample_index: sampleIndex,
            lat,
            lng,
          });
        }
        return {
          sample_id: sampleId,
          lat,
          lng,
        };
      });

      routeSamplesByRouteId.set(route.route_id, routeSamples);
      routeSampleMetaByRouteId.set(route.route_id, {
        fullPath,
        sampleIndices,
      });
    }
    timer.mark("segment_matching");

    if (sampleJobs.length === 0) {
      const fallbackPayload = buildRouteGuideResponsePayload({
        origin,
        destinationPoint,
        destinationName,
        routedRoutes,
        routeHash,
        routeRiskDataByRouteId: new Map(),
        sampleCount,
        message: "Route loaded, but risk scoring could not sample enough points.",
        riskAvailable: false,
        timings: timer.timings,
        cache: { hit: false, key: requestCacheKey, source: "route-guide-request" },
        geometryHash,
      });
      setRouteGuideCache(requestCacheKey, fallbackPayload, ROUTE_GUIDE_FALLBACK_CACHE_TTL_MS);
      timer.mark("response_formatting");
      timer.finish("fallback", { reason: "no_sample_jobs" });
      return res.status(200).json(fallbackPayload);
    }

    let scoredRows = [];
    try {
      scoredRows = await runWithConcurrency(
        sampleJobs,
        ROUTE_SAMPLE_BUILD_CONCURRENCY,
        async (job) => {
          const row = await buildDangerRow({
            lat: job.lat,
            lng: job.lng,
            timestamp: timestampIso,
            roadFlags: ENABLE_OSM_FLAGS_FOR_ROUTES ? null : ROAD_FLAG_ZEROES,
            deadline: req.deadline,
          });

          setCachedSegmentRow(job.sample_id, row);

          return {
            ...job,
            row,
            model_row: {
              segment_id: job.sample_id,
              ...row,
            },
          };
        },
      );
      timer.mark("database_postgis_query");
    } catch (error) {
      timer.mark("database_postgis_query");
      throw error;
    }

    let overlayResponse = null;
    try {
      overlayResponse = await postToFlask(
        "/risk/overlay",
        { rows: scoredRows.map((item) => item.model_row) },
        req.deadline,
      );
      timer.mark("ml_risk_service_call");
    } catch (error) {
      timer.mark("ml_risk_service_call");
      throw error;
    }

    const overlayResults = Array.isArray(overlayResponse?.data?.results)
      ? overlayResponse.data.results
      : [];
    const predictionBySampleId = new Map();

    for (let i = 0; i < overlayResults.length; i += 1) {
      const item = overlayResults[i];
      const sampleId = String(item?.segment_id ?? scoredRows[i]?.sample_id ?? "");
      if (!sampleId) {
        continue;
      }
      predictionBySampleId.set(sampleId, normalizeOverlaySamplePrediction(item));
    }

    const sampleRowById = new Map();
    for (const item of scoredRows) {
      sampleRowById.set(item.sample_id, item.row);
    }

    const routeRiskDataByRouteId = new Map();
    for (const route of scoringRoutes) {
      const routeMeta = routeSampleMetaByRouteId.get(route.route_id) || {
        fullPath: limitRoutePathPoints(route?.path),
        sampleIndices: [],
      };
      const sampled = routeSamplesByRouteId.get(route.route_id) || [];
      const samples = sampled.map((sample) => {
        const prediction =
          predictionBySampleId.get(sample.sample_id) || {
            danger_percent: 0,
            danger_level: "low",
            confidence: null,
            quality: null,
          };

        return {
          segment_id: sample.sample_id,
          sample_id: sample.sample_id,
          lat: sample.lat,
          lng: sample.lng,
          danger_percent: prediction.danger_percent,
          danger_level: prediction.danger_level,
          confidence: prediction.confidence,
          quality: prediction.quality,
          riskAvailable: true,
          risk_available: true,
        };
      });

      const summary = aggregateRouteSummary(samples);
      const routeGuideHash = `${routeHash}_${route.route_id}`;
      const segments = buildRouteGuideSegments({
        fullPath: routeMeta.fullPath,
        sampleIndices: routeMeta.sampleIndices,
        samples,
        fallbackSummary: summary,
        routeHash: routeGuideHash,
        sampleRowById,
        useStraightSegments: route.routing_source === "straight_line",
      });

      routeRiskDataByRouteId.set(route.route_id, {
        riskAvailable: true,
        sampleIndices: routeMeta.sampleIndices,
        samples,
        segments,
        summary,
      });
    }

    const responsePayload = buildRouteGuideResponsePayload({
      origin,
      destinationPoint,
      destinationName,
      routedRoutes,
      routeHash,
      routeRiskDataByRouteId,
      sampleCount,
      riskAvailable: true,
      timings: timer.timings,
      cache: { hit: false, key: requestCacheKey, source: "route-guide-request" },
      geometryHash,
    });
    timer.mark("response_formatting");

    // ── Trained occurrence-model enrichment (additive, never breaks severity).
    //
    // Each route segment with a numeric `segment_id` gets an `occurrence` block
    // with modelOnly + personalized. The trained model lives in Flask; if it
    // is unreachable we skip enrichment silently — severity scoring is the
    // primary signal for navigation and must not be blocked by an occurrence
    // outage.
    try {
      const occurrenceUserId =
        req.user?.userId || req.user?.id || req.body?.user_id || req.body?.userId || null;
      const allSegmentIds = new Set();
      for (const route of responsePayload.routes || []) {
        for (const segment of route?.segments || []) {
          if (parseNumericRoadSegmentId(segment?.segment_id)) {
            allSegmentIds.add(String(segment.segment_id));
          }
        }
      }
      if (allSegmentIds.size > 0) {
        const occurrenceResult = await predictOccurrenceForRouteSegments({
          userId: occurrenceUserId,
          segmentIds: Array.from(allSegmentIds),
          targetTime: timestampIso || new Date(),
          weather: null,
          deadline: req.deadline,
        });
        if (occurrenceResult.available) {
          const bySegmentId = new Map(
            occurrenceResult.segments.map((entry) => [String(entry.road_segment_id), entry]),
          );
          for (const route of responsePayload.routes || []) {
            const modelOnlyProbs = [];
            const personalizedProbs = [];
            let highestModel = null;
            let highestPersonalized = null;
            for (const segment of route?.segments || []) {
              const occurrence = bySegmentId.get(String(segment?.segment_id));
              if (!occurrence) continue;
              segment.occurrence = {
                modelOnly: occurrence.modelOnly,
                personalized: occurrence.personalized,
                driver_meta: occurrence.driver_meta,
              };
              const modelProb = Number(occurrence.modelOnly?.calibrated_probability);
              const personalizedProb = Number(occurrence.personalized?.calibrated_probability);
              if (Number.isFinite(modelProb)) {
                modelOnlyProbs.push(modelProb);
                if (!highestModel || modelProb > highestModel.calibrated_probability) {
                  highestModel = {
                    segment_id: segment.segment_id,
                    calibrated_probability: modelProb,
                    risk_level: occurrence.modelOnly.risk_level,
                  };
                }
              }
              if (Number.isFinite(personalizedProb)) {
                personalizedProbs.push(personalizedProb);
                if (!highestPersonalized || personalizedProb > highestPersonalized.calibrated_probability) {
                  highestPersonalized = {
                    segment_id: segment.segment_id,
                    calibrated_probability: personalizedProb,
                    risk_level: occurrence.personalized.risk_level,
                  };
                }
              }
            }
            if (modelOnlyProbs.length > 0 || personalizedProbs.length > 0) {
              const avgModel = modelOnlyProbs.length
                ? modelOnlyProbs.reduce((sum, x) => sum + x, 0) / modelOnlyProbs.length
                : null;
              const avgPersonalized = personalizedProbs.length
                ? personalizedProbs.reduce((sum, x) => sum + x, 0) / personalizedProbs.length
                : null;
              const driverApplied = (route.segments || []).some(
                (segment) => segment?.occurrence?.personalized?.driver_behavior_applied,
              );
              route.occurrence_summary = {
                model_version: occurrenceResult.model_version,
                probability_warning: occurrenceResult.probability_warning,
                driver_behavior_applied: driverApplied,
                average_modelOnly_probability:
                  avgModel == null ? null : Number(avgModel.toFixed(6)),
                average_personalized_probability:
                  avgPersonalized == null ? null : Number(avgPersonalized.toFixed(6)),
                average_modelOnly_risk_level:
                  avgModel == null ? null : trainedRiskLevelFromProbability(avgModel),
                average_personalized_risk_level:
                  avgPersonalized == null ? null : trainedRiskLevelFromProbability(avgPersonalized),
                highest_modelOnly_segment: highestModel,
                highest_personalized_segment: highestPersonalized,
                segments_scored: modelOnlyProbs.length,
              };
            }
          }
          responsePayload.occurrence_model = {
            available: true,
            model_version: occurrenceResult.model_version,
            selected_model: occurrenceResult.selected_model,
            calibration_method: occurrenceResult.calibration_method,
            decision_threshold: occurrenceResult.decision_threshold,
            probability_warning: occurrenceResult.probability_warning,
            driver_profile: occurrenceResult.driver_profile,
          };
        } else {
          responsePayload.occurrence_model = {
            available: false,
            reason: occurrenceResult.error?.message || "Occurrence model unavailable",
            probability_warning: TRAINED_MODEL_PROBABILITY_WARNING,
          };
        }
      }
      timer.mark("occurrence_enrichment");
    } catch (occurrenceError) {
      console.warn(
        "[Node] /api/risk/route occurrence enrichment failed:",
        occurrenceError?.message || occurrenceError,
      );
      responsePayload.occurrence_model = {
        available: false,
        reason: occurrenceError?.message || "Occurrence enrichment failed",
        probability_warning: TRAINED_MODEL_PROBABILITY_WARNING,
      };
      timer.mark("occurrence_enrichment");
    }

    const persistItems = responsePayload.routes.flatMap((route) =>
      (Array.isArray(route?.segments) ? route.segments : [])
        .filter((segment) => parseNumericRoadSegmentId(segment?.segment_id))
        .map((segment) => {
          const segmentPath = Array.isArray(segment?.path) ? segment.path : [];
          const lastPoint = Array.isArray(segmentPath[segmentPath.length - 1])
            ? segmentPath[segmentPath.length - 1]
            : null;
          return {
            prediction: segment,
            timestamp: timestampIso,
            roadSegmentId: segment.segment_id,
            lat: lastPoint?.[0],
            lng: lastPoint?.[1],
            allowNearestSegmentLookup: false,
            context: "route",
          };
        }),
    );

    if (persistItems.length > 0) {
      void persistPredictions(persistItems).catch((persistError) => {
        console.error("[Node] /api/risk/route persistence error:", persistError.message);
      });
    }

    setRouteGuideCache(requestCacheKey, responsePayload);
    setRouteGuideCache(geometryCacheKey, responsePayload);
    timer.finish("success", {
      cache_key: requestCacheKey,
      geometry_key: geometryCacheKey,
      routes: routedRoutes.length,
      routes_scored: scoringRoutes.length,
      samples_scored: scoredRows.length,
    });
    return res.json(responsePayload);
  } catch (err) {
    const timeoutLike = isTimeoutLikeError(err);
    const routeIsUsable = Array.isArray(routedRoutes) && routedRoutes.length > 0;
    console.error("[Node] /api/risk/route scoring error:", err.message);

    if (timeoutLike && routeIsUsable && origin && destinationPoint) {
      const fallbackPayload = buildRouteGuideResponsePayload({
        origin,
        destinationPoint,
        destinationName,
        routedRoutes,
        routeHash: routeHash || buildRouteGuideHash(origin, destinationPoint, timestampIso),
        routeRiskDataByRouteId: new Map(),
        sampleCount,
        message: timeoutMessage,
        riskAvailable: false,
        timings: timer.timings,
        cache: { hit: false, key: requestCacheKey, source: "route-guide-timeout-fallback" },
        geometryHash,
      });
      if (requestCacheKey) {
        setRouteGuideCache(requestCacheKey, fallbackPayload, ROUTE_GUIDE_FALLBACK_CACHE_TTL_MS);
      }
      if (geometryCacheKey) {
        setRouteGuideCache(geometryCacheKey, fallbackPayload, ROUTE_GUIDE_FALLBACK_CACHE_TTL_MS);
      }
      timer.mark("response_formatting");
      timer.finish("timeout_fallback", {
        message: err.message,
        routes: routedRoutes.length,
      });
      return res.status(200).json(fallbackPayload);
    }

    timer.finish("error", {
      message: err.message,
      timeout: timeoutLike,
      route_usable: routeIsUsable,
    });
    return res.status(500).json({
      error: "Route danger scoring failed",
      riskAvailable: false,
      risk_available: false,
    });
  }
};

exports.predictNearbyZones = async (req, res) => {
  const origin = validateLatLngStrict(req.body);
  if (!origin) {
    return res.status(400).json({ error: "Valid lat and lng are required" });
  }

  const radiusKm = parseBoundedNumber(req.body?.radius_km, DEFAULT_NEARBY_RADIUS_KM, {
    min: 2,
    max: 100,
  });
  const maxDestinations = parseBoundedNumber(
    req.body?.max_destinations,
    DEFAULT_MAX_DESTINATIONS,
    {
      min: 1,
      max: MAX_NEARBY_DESTINATIONS,
      integer: true,
    },
  );
  const samplesPerRoute = parseBoundedNumber(
    req.body?.samples_per_route ?? req.body?.sample_points,
    DEFAULT_ROUTE_SAMPLES,
    {
      min: 2,
      max: MAX_ROUTE_SAMPLES,
      integer: true,
    },
  );
  const timestampIso = toIsoTimestamp(req.body?.timestamp);

  try {
    const destinations = selectNearbyDestinations(origin, radiusKm, maxDestinations);
    if (!destinations.length) {
      return res.json({ origin, routes: [] });
    }

    const routedRoutes = await Promise.all(
      destinations.map(async (destination, index) => {
        const routed = await getRoutePathWithFallback(origin, destination, req.deadline);
        return {
          route_id: `r${index + 1}`,
          destination: {
            id: destination.id,
            name: destination.name,
            lat: destination.lat,
            lng: destination.lng,
            distance_km: routed.distance_km,
          },
          path: routed.path,
          routing_source: routed.routing_source,
          route_warning: routed.route_warning || null,
        };
      }),
    );

    const sampleJobs = [];
    const routeSamplesByRouteId = new Map();
    const routeSampleMetaByRouteId = new Map();

    for (const route of routedRoutes) {
      const osrmPath = dedupePathPoints(route.path);
      const fallbackPath = dedupePathPoints(buildStraightLinePath(origin, route.destination));
      const fullPath = osrmPath.length >= 2 ? osrmPath : fallbackPath;
      const sampleIndices = sampleRouteIndices(fullPath.length, samplesPerRoute);
      const sampledPoints = buildSamplePointsFromIndices(fullPath, sampleIndices);
      if (sampledPoints.length === 0) {
        routeSamplesByRouteId.set(route.route_id, []);
        routeSampleMetaByRouteId.set(route.route_id, {
          fullPath,
          sampleIndices: [],
        });
        continue;
      }

      const routeSamples = sampledPoints.map(([lat, lng], sampleIndex) => {
        const sampleId = `${route.route_id}:s${sampleIndex}`;
        sampleJobs.push({
          sample_id: sampleId,
          route_id: route.route_id,
          sample_index: sampleIndex,
          lat,
          lng,
        });
        return { sample_id: sampleId, lat, lng };
      });

      routeSamplesByRouteId.set(route.route_id, routeSamples);
      routeSampleMetaByRouteId.set(route.route_id, {
        fullPath,
        sampleIndices,
      });
    }

    if (sampleJobs.length === 0) {
      const routes = routedRoutes.map((route) => ({
        ...route,
        sample_indices: [],
        summary: { danger_percent: 0, danger_level: "low" },
        segments: [],
        samples: [],
      }));
      return res.json({ origin, routes });
    }

    const modelRows = await runWithConcurrency(
      sampleJobs,
      ROUTE_SAMPLE_BUILD_CONCURRENCY,
      async (job) => {
        const row = await buildDangerRow({
          lat: job.lat,
          lng: job.lng,
          timestamp: timestampIso,
          roadFlags: ENABLE_OSM_FLAGS_FOR_ROUTES ? null : ROAD_FLAG_ZEROES,
          deadline: req.deadline,
        });
        return {
          segment_id: job.sample_id,
          ...row,
        };
      },
    );

    const overlayResponse = await postToFlask("/risk/overlay", { rows: modelRows }, req.deadline);
    const overlayResults = Array.isArray(overlayResponse?.data?.results)
      ? overlayResponse.data.results
      : [];

    const predictionBySampleId = new Map();
    for (let i = 0; i < overlayResults.length; i += 1) {
      const item = overlayResults[i];
      const sampleId = String(item?.segment_id ?? modelRows[i]?.segment_id ?? "");
      if (!sampleId) {
        continue;
      }
      predictionBySampleId.set(sampleId, normalizeOverlaySamplePrediction(item));
    }

    const routes = routedRoutes.map((route) => {
      const sampled = routeSamplesByRouteId.get(route.route_id) || [];
      const routeMeta = routeSampleMetaByRouteId.get(route.route_id) || {
        fullPath: dedupePathPoints(route.path),
        sampleIndices: [],
      };
      const samples = sampled.map((sample) => {
        const predicted =
          predictionBySampleId.get(sample.sample_id) || {
            danger_percent: 0,
            danger_level: "low",
            confidence: null,
            quality: null,
          };
        return {
          lat: sample.lat,
          lng: sample.lng,
          danger_percent: predicted.danger_percent,
          danger_level: predicted.danger_level,
          confidence: predicted.confidence,
          quality: predicted.quality,
        };
      });

      const summary = summarizeRouteSamples(samples);
      const segments = buildRouteSegmentsFromIndexedPath({
        routeId: route.route_id,
        fullPath: routeMeta.fullPath,
        sampleIndices: routeMeta.sampleIndices,
        samples,
        fallbackSummary: summary,
        useStraightSegments: route.routing_source === "straight_line",
      });

      return {
        ...route,
        path: routeMeta.fullPath,
        sample_indices: routeMeta.sampleIndices,
        summary,
        segments,
        samples,
      };
    });

    const responsePayload = {
      origin,
      routes,
    };

    try {
      const persistItems = routes.flatMap((route) =>
        (Array.isArray(route?.segments) ? route.segments : [])
          .filter((segment) => parseNumericRoadSegmentId(segment?.segment_id))
          .map((segment) => {
            const segmentPath = Array.isArray(segment?.path) ? segment.path : [];
            const lastPoint = Array.isArray(segmentPath[segmentPath.length - 1])
              ? segmentPath[segmentPath.length - 1]
              : null;
            return {
              prediction: segment,
              timestamp: timestampIso,
              roadSegmentId: segment.segment_id,
              lat: lastPoint?.[0],
              lng: lastPoint?.[1],
              allowNearestSegmentLookup: false,
              context: "nearby_zones",
            };
          }),
      );

      if (persistItems.length > 0) {
        await persistPredictions(persistItems);
      }
    } catch (persistError) {
      console.error("[Node] /api/risk/nearby-zones persistence error:", persistError.message);
    }

    return res.json(responsePayload);
  } catch (err) {
    console.error("[Node] /api/risk/nearby-zones error:", err.message);
    return res.status(500).json({ error: "Failed to compute nearby danger routes" });
  }
};

exports.predictRiskExplain = async (req, res) => {
  const segmentId = req.body?.segment_id ?? req.body?.segmentId;
  let row = null;

  if (req.body?.row && typeof req.body.row === "object") {
    row = req.body.row;
  } else if (segmentId != null && segmentRowCache.has(String(segmentId))) {
    row = segmentRowCache.get(String(segmentId));
  } else {
    const point = validateLatLng(req.body);
    if (!point) {
      return res.status(400).json({ error: "Provide segment_id from overlay cache or lat/lng" });
    }

    try {
      row = await buildDangerRow({
        lat: point.lat,
        lng: point.lng,
        timestamp: req.body?.timestamp,
        roadFlags: req.body?.roadFlags,
        deadline: req.deadline,
      });
      if (segmentId != null) {
        setCachedSegmentRow(segmentId, row);
      }
    } catch (err) {
      console.error("[Node] explain row build error:", err.message);
      return res.status(500).json({ error: "Failed to build explain row" });
    }
  }

  try {
    const response = await postToFlask(
      "/risk/explain",
      {
        row,
        top_k: req.body?.top_k,
      },
      req.deadline,
    );
    const responseData =
      response?.data && typeof response.data === "object" ? { ...response.data } : {};

    try {
      const persistence = await persistPredictionWithExplanation({
        prediction: responseData,
        explanation: responseData,
        timestamp: row?.Start_Time || req.body?.timestamp,
        roadSegmentId: segmentId,
        lat: row?.Start_Lat ?? row?.lat ?? req.body?.lat,
        lng: row?.Start_Lng ?? row?.lng ?? req.body?.lng,
        allowNearestSegmentLookup: true,
        limit: req.body?.top_k,
        context: "explain",
      });

      if (persistence?.roadSegmentId) {
        responseData.road_segment_id = persistence.roadSegmentId;
      }
    } catch (persistError) {
      console.error("[Node] /api/risk/explain persistence error:", persistError.message);
    }

    return res.json(responseData);
  } catch (err) {
    const status = err.response?.status || 500;
    const payload = err.response?.data || { error: "Risk explain model service error" };
    console.error("[Node] /api/risk/explain error:", err.message);
    return res.status(status).json(payload);
  }
};
