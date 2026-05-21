// Pure helpers shared by the risk pipeline service modules.
// No network I/O lives here — only math, time, validation, cache, and limiter
// queue helpers. Behavior is preserved verbatim from models.js.

const EARTH_RADIUS_KM = 6371;

const { makeQueueTimeoutError } = require("../riskTimeouts");

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundNumber(value, digits = 2) {
  const n = safeNumber(value);
  if (n == null) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function parseBoundedNumber(value, fallback, { min, max, integer = false }) {
  const n = safeNumber(value);
  if (n == null) {
    return fallback;
  }
  const bounded = clampNumber(n, min, max);
  return integer ? Math.round(bounded) : bounded;
}

function cToF(celsius) {
  return (celsius * 9) / 5 + 32;
}

function hPaToInHg(hPa) {
  return hPa * 0.0295299830714;
}

function mpsToMph(mps) {
  return mps * 2.2369362921;
}

function kmhToMph(kmh) {
  const n = safeNumber(kmh);
  return n == null ? null : n * 0.621371;
}

function mphToKmh(mph) {
  const n = safeNumber(mph);
  return n == null ? null : n / 0.621371;
}

function mmToIn(mm) {
  return mm / 25.4;
}

function metersToMiles(meters) {
  return meters / 1609.344;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function haversineDistanceKm(aLat, aLng, bLat, bLng) {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function destinationFromBearing(originLat, originLng, bearingDeg, distanceKm) {
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(originLat);
  const lng1 = toRadians(originLng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: toDegrees(lat2),
    lng: toDegrees(lng2),
  };
}

function normalizeDangerLevel(level, dangerPercent = null) {
  const text = String(level || "").trim().toLowerCase();
  if (text === "unknown" || text === "unavailable") {
    return "unknown";
  }
  if (text === "extreme" || text === "high" || text === "moderate" || text === "low") {
    return text;
  }

  const percent = safeNumber(dangerPercent);
  if (percent == null) {
    return "low";
  }
  if (percent < 25) return "low";
  if (percent < 50) return "moderate";
  if (percent < 75) return "high";
  return "extreme";
}

function normalizeLatLngPoint(point) {
  if (!Array.isArray(point) || point.length < 2) {
    return null;
  }
  const lat = safeNumber(point[0]);
  const lng = safeNumber(point[1]);
  if (lat == null || lng == null) {
    return null;
  }
  return [lat, lng];
}

function dedupePathPoints(path) {
  if (!Array.isArray(path)) {
    return [];
  }

  const deduped = [];
  const seen = new Set();
  for (const rawPoint of path) {
    const point = normalizeLatLngPoint(rawPoint);
    if (!point) {
      continue;
    }
    const key = `${point[0].toFixed(6)}:${point[1].toFixed(6)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(point);
  }
  return deduped;
}

function isValidLatitude(lat) {
  return lat >= -90 && lat <= 90;
}

function isValidLongitude(lng) {
  return lng >= -180 && lng <= 180;
}

function validateLatLng(body) {
  const lat = safeNumber(body?.lat);
  const lng = safeNumber(body?.lng);
  if (lat == null || lng == null) {
    return null;
  }
  return { lat, lng };
}

function validateLatLngStrict(body) {
  const point = validateLatLng(body);
  if (!point) {
    return null;
  }
  if (!isValidLatitude(point.lat) || !isValidLongitude(point.lng)) {
    return null;
  }
  return point;
}

function toIsoTimestamp(input) {
  if (!input) {
    return new Date().toISOString();
  }
  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) {
    return new Date().toISOString();
  }
  return dt.toISOString();
}

function roundCoord(value) {
  const n = safeNumber(value);
  if (n == null) {
    return "nan";
  }
  return n.toFixed(3);
}

function floorToHourMs(ms) {
  return Math.floor(ms / (60 * 60 * 1000)) * (60 * 60 * 1000);
}

function floorToBucketMs(ms, bucketMsRaw) {
  const bucketMs = Math.max(60 * 1000, Math.round(safeNumber(bucketMsRaw) || 60 * 1000));
  return Math.floor(ms / bucketMs) * bucketMs;
}

function roundToHourMs(ms) {
  return Math.round(ms / (60 * 60 * 1000)) * (60 * 60 * 1000);
}

function snapToNearestHourIso(input) {
  const parsedMs = Date.parse(input || "");
  const fallbackMs = Date.now();
  const sourceMs = Number.isNaN(parsedMs) ? fallbackMs : parsedMs;
  return new Date(roundToHourMs(sourceMs)).toISOString();
}

function buildHourlyIsoPoints(startIso, hours = 24) {
  const parsedMs = Date.parse(startIso);
  if (Number.isNaN(parsedMs)) {
    return [];
  }

  const points = [];
  for (let i = 0; i < hours; i += 1) {
    points.push(new Date(parsedMs + i * 60 * 60 * 1000).toISOString());
  }
  return points;
}

function formatHourLabel(timeIso) {
  const dt = new Date(timeIso);
  if (Number.isNaN(dt.getTime())) {
    return "n/a";
  }
  return dt.toISOString().slice(11, 16);
}

function pruneCacheMapIfNeeded(cacheMap, maxSizeRaw) {
  const maxSize = Math.max(1, Math.round(safeNumber(maxSizeRaw) || 1));
  if (cacheMap.size <= maxSize) {
    return;
  }

  const excess = cacheMap.size - maxSize;
  const keys = cacheMap.keys();
  for (let i = 0; i < excess; i += 1) {
    const key = keys.next().value;
    if (key == null) {
      break;
    }
    cacheMap.delete(key);
  }
}

function setCacheEntry(cacheMap, key, value, maxSizeRaw) {
  if (!key) {
    return;
  }
  cacheMap.set(key, value);
  pruneCacheMapIfNeeded(cacheMap, maxSizeRaw);
}

function getCacheEntry(cacheMap, key) {
  if (!cacheMap.has(key)) {
    return null;
  }

  const rawValue = cacheMap.get(key);
  if (
    rawValue &&
    typeof rawValue === "object" &&
    Object.prototype.hasOwnProperty.call(rawValue, "__cacheValue")
  ) {
    const expiresAt = safeNumber(rawValue.__cacheExpiresAt);
    if (expiresAt != null && Date.now() > expiresAt) {
      cacheMap.delete(key);
      return null;
    }
    return rawValue.__cacheValue;
  }

  return rawValue;
}

function setCacheEntryWithTtl(cacheMap, key, value, maxSizeRaw, ttlMsRaw) {
  const ttlMs = safeNumber(ttlMsRaw);
  if (ttlMs == null || ttlMs <= 0) {
    setCacheEntry(cacheMap, key, value, maxSizeRaw);
    return;
  }

  setCacheEntry(
    cacheMap,
    key,
    {
      __cacheValue: value,
      __cacheExpiresAt: Date.now() + ttlMs,
    },
    maxSizeRaw,
  );
}

function cloneJsonSafe(value) {
  if (value == null) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

function isTimeoutLikeError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "ECONNABORTED" ||
    error?.code === "ETIMEDOUT" ||
    /timeout/i.test(message) ||
    /timed out/i.test(message)
  );
}

function sleepMs(ms) {
  const delay = safeNumber(ms);
  if (delay == null || delay <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, Math.round(delay)));
}

function waitInLimiterQueue(queue, queueTimeoutMs, deadline, label) {
  const remaining = deadline ? deadline.remaining() : Infinity;
  const waitMs = Math.max(
    0,
    Math.min(
      Number.isFinite(queueTimeoutMs) && queueTimeoutMs > 0 ? queueTimeoutMs : 0,
      Number.isFinite(remaining) ? remaining : queueTimeoutMs,
    ),
  );
  return new Promise((resolve, reject) => {
    let settled = false;
    const entry = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    queue.push(entry);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const idx = queue.indexOf(entry);
      if (idx >= 0) queue.splice(idx, 1);
      reject(makeQueueTimeoutError(label));
    }, waitMs);
  });
}

module.exports = {
  // Conversions
  cToF,
  hPaToInHg,
  mpsToMph,
  kmhToMph,
  mphToKmh,
  mmToIn,
  metersToMiles,
  toRadians,
  toDegrees,
  // Geometry
  haversineDistanceKm,
  destinationFromBearing,
  // Numbers
  safeNumber,
  clampNumber,
  roundNumber,
  parseBoundedNumber,
  // Time
  toIsoTimestamp,
  floorToHourMs,
  floorToBucketMs,
  roundToHourMs,
  snapToNearestHourIso,
  buildHourlyIsoPoints,
  formatHourLabel,
  // Validation
  isValidLatitude,
  isValidLongitude,
  validateLatLng,
  validateLatLngStrict,
  normalizeLatLngPoint,
  // Path
  dedupePathPoints,
  // Cache
  pruneCacheMapIfNeeded,
  setCacheEntry,
  getCacheEntry,
  setCacheEntryWithTtl,
  // Misc
  roundCoord,
  cloneJsonSafe,
  normalizeDangerLevel,
  isTimeoutLikeError,
  sleepMs,
  waitInLimiterQueue,
};
