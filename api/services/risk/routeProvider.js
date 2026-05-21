// OSRM-backed route provider.
// Owns the OSRM route cache, concurrency limiter, retry policy, and the
// straight-line fallback. Behavior preserved verbatim from models.js.

const axios = require("axios");
const {
  axiosTimeoutFor,
  isDeadlineExpired,
  makeDeadlineError,
} = require("../riskTimeouts");
const {
  safeNumber,
  roundNumber,
  parseBoundedNumber,
  haversineDistanceKm,
  dedupePathPoints,
  sleepMs,
  waitInLimiterQueue,
} = require("./riskCommon");

const OSRM_ROUTE_URL =
  process.env.OSRM_ROUTE_URL || "https://router.project-osrm.org/route/v1/driving";
const OSRM_TIMEOUT_MS = Number(process.env.OSRM_TIMEOUT_MS || 8000);
const OSRM_QUEUE_TIMEOUT_MS = Number(process.env.OSRM_QUEUE_TIMEOUT_MS || 2500);
const MAX_OSRM_CONCURRENCY = Number(process.env.MAX_OSRM_CONCURRENCY || 2);
const OSRM_ROUTE_CACHE_MAX = Number(process.env.OSRM_ROUTE_CACHE_MAX || 2000);
const DEBUG_OSRM = String(process.env.DEBUG_OSRM || "0") === "1";

const DEFAULT_GUIDE_ALTERNATIVE_ROUTES = Number(process.env.ROUTE_GUIDE_ALTERNATIVES || 3);
const MAX_GUIDE_ALTERNATIVE_ROUTES = Number(process.env.ROUTE_GUIDE_ALTERNATIVES_CAP || 5);

const osrmRouteCache = new Map();
let osrmActiveRequests = 0;
const osrmWaitQueue = [];

function roundCoordForOsrm(value) {
  const n = safeNumber(value);
  if (n == null) {
    return "nan";
  }
  return n.toFixed(5);
}

function osrmRouteCacheKey(origin, destination, alternatives = false) {
  return [
    OSRM_ROUTE_URL,
    roundCoordForOsrm(origin?.lat),
    roundCoordForOsrm(origin?.lng),
    roundCoordForOsrm(destination?.lat),
    roundCoordForOsrm(destination?.lng),
    "overview=full",
    "geometries=geojson",
    `alternatives=${alternatives ? "true" : "false"}`,
  ].join("|");
}

function clonePath(path) {
  if (!Array.isArray(path)) {
    return [];
  }
  return path.map((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      return point;
    }
    return [point[0], point[1]];
  });
}

function cloneOsrmRoute(route) {
  if (!route || typeof route !== "object") {
    return null;
  }
  return {
    ...route,
    path: clonePath(route.path),
  };
}

function cloneOsrmRoutes(routes) {
  if (!Array.isArray(routes)) {
    return [];
  }

  return routes.map((route) => cloneOsrmRoute(route)).filter(Boolean);
}

function pruneOsrmRouteCacheIfNeeded() {
  const maxSize = Math.max(1, Math.round(safeNumber(OSRM_ROUTE_CACHE_MAX) || 1));
  if (osrmRouteCache.size <= maxSize) {
    return;
  }

  const excess = osrmRouteCache.size - maxSize;
  const keys = osrmRouteCache.keys();
  for (let i = 0; i < excess; i += 1) {
    const key = keys.next().value;
    if (key == null) {
      break;
    }
    osrmRouteCache.delete(key);
  }
}

function setCachedOsrmRoutes(key, routes) {
  if (!key) {
    return;
  }
  osrmRouteCache.set(key, cloneOsrmRoutes(routes));
  pruneOsrmRouteCacheIfNeeded();
}

async function runWithOsrmLimiter(task, { deadline = null } = {}) {
  const maxConcurrency = Math.max(1, Math.round(safeNumber(MAX_OSRM_CONCURRENCY) || 1));
  if (osrmActiveRequests >= maxConcurrency) {
    await waitInLimiterQueue(osrmWaitQueue, OSRM_QUEUE_TIMEOUT_MS, deadline, "osrm_queue");
  }

  osrmActiveRequests += 1;
  try {
    return await task();
  } finally {
    osrmActiveRequests = Math.max(0, osrmActiveRequests - 1);
    const next = osrmWaitQueue.shift();
    if (typeof next === "function") {
      next();
    }
  }
}

function buildOsrmPathSignature(path) {
  const normalizedPath = dedupePathPoints(path);
  if (!normalizedPath.length) {
    return "";
  }

  return normalizedPath
    .map((point) => `${point[0].toFixed(5)},${point[1].toFixed(5)}`)
    .join("|");
}

function decodeOsrmPathCoordinates(rawCoordinates) {
  if (!Array.isArray(rawCoordinates)) {
    return null;
  }

  const path = rawCoordinates
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null;
      }
      const lng = safeNumber(point[0]);
      const lat = safeNumber(point[1]);
      if (lat == null || lng == null) {
        return null;
      }
      return [lat, lng];
    })
    .filter(Boolean);

  return path.length >= 2 ? path : null;
}

function buildStraightLinePath(origin, destination) {
  return [
    [origin.lat, origin.lng],
    [destination.lat, destination.lng],
  ];
}

function normalizeOsrmRoutes(routes) {
  if (!Array.isArray(routes)) {
    return [];
  }

  const normalizedRoutes = [];
  const seen = new Set();

  for (const route of routes) {
    const path = decodeOsrmPathCoordinates(route?.geometry?.coordinates);
    if (!path) {
      continue;
    }

    const distanceMeters = safeNumber(route?.distance);
    const durationSeconds = safeNumber(route?.duration);
    const signature = [
      buildOsrmPathSignature(path),
      distanceMeters == null ? "na" : roundNumber(distanceMeters, 0),
      durationSeconds == null ? "na" : roundNumber(durationSeconds, 0),
    ].join("|");

    if (!signature || seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    normalizedRoutes.push({
      route_id: `osrm_${normalizedRoutes.length + 1}`,
      path,
      routing_source: "osrm",
      route_warning: null,
      distance_km: distanceMeters == null ? null : roundNumber(distanceMeters / 1000, 2),
      duration_min: durationSeconds == null ? null : roundNumber(durationSeconds / 60, 2),
    });
  }

  return normalizedRoutes;
}

function isOsrmRetryableError(error) {
  if (!error) return false;
  if (error.code === "QUEUE_TIMEOUT" || error.code === "DEADLINE_EXCEEDED") {
    return false;
  }
  if (
    error.code === "ECONNABORTED" ||
    error.code === "ETIMEDOUT" ||
    error.code === "ECONNREFUSED" ||
    error.code === "ECONNRESET" ||
    error.code === "ENOTFOUND"
  ) {
    return true;
  }
  if (!error.response) {
    return true;
  }
  const status = error.response.status;
  return status >= 500 && status < 600;
}

async function fetchOsrmRoutes(origin, destination, deadline = null) {
  const cacheKey = osrmRouteCacheKey(origin, destination, true);
  if (osrmRouteCache.has(cacheKey)) {
    if (DEBUG_OSRM) {
      console.log(`[Node][osrm] source=cache key=${cacheKey}`);
    }
    return cloneOsrmRoutes(osrmRouteCache.get(cacheKey));
  }

  const url = `${OSRM_ROUTE_URL}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (isDeadlineExpired(deadline)) {
      lastError = lastError || makeDeadlineError("osrm");
      break;
    }
    try {
      const { data } = await runWithOsrmLimiter(
        () =>
          axios.get(url, {
            params: {
              overview: "full",
              geometries: "geojson",
              steps: false,
              alternatives: true,
            },
            timeout: axiosTimeoutFor(deadline, OSRM_TIMEOUT_MS, { ceil: OSRM_TIMEOUT_MS }),
          }),
        { deadline },
      );

      if (data?.code && data.code !== "Ok") {
        throw new Error(`OSRM returned code=${data.code}`);
      }

      const normalizedRoutes = normalizeOsrmRoutes(data?.routes);
      if (!normalizedRoutes.length) {
        throw new Error("OSRM route geometry unavailable");
      }

      setCachedOsrmRoutes(cacheKey, normalizedRoutes);
      if (DEBUG_OSRM) {
        console.log(`[Node][osrm] source=remote key=${cacheKey} attempt=${attempt}`);
      }
      return cloneOsrmRoutes(normalizedRoutes);
    } catch (error) {
      lastError = error;
      if (DEBUG_OSRM) {
        console.log(
          `[Node][osrm] source=error key=${cacheKey} attempt=${attempt} message=${error.message}`,
        );
      }
      if (attempt >= 2) break;
      if (!isOsrmRetryableError(error)) break;
      if (isDeadlineExpired(deadline)) break;
      await sleepMs(120);
    }
  }

  const wrapped = new Error(`OSRM route lookup failed: ${lastError?.message || "unknown_error"}`);
  wrapped.isOsrmError = true;
  throw wrapped;
}

async function fetchOsrmRoute(origin, destination, deadline = null) {
  const routes = await fetchOsrmRoutes(origin, destination, deadline);
  const primaryRoute = routes[0] || null;
  if (!primaryRoute) {
    const wrapped = new Error("OSRM route lookup failed: route not found");
    wrapped.isOsrmError = true;
    throw wrapped;
  }
  return cloneOsrmRoute(primaryRoute);
}

async function getOsrmRouteAlternatives(
  origin,
  destination,
  maxRoutes = DEFAULT_GUIDE_ALTERNATIVE_ROUTES,
  deadline = null,
) {
  try {
    const routes = await fetchOsrmRoutes(origin, destination, deadline);
    const limitedCount = parseBoundedNumber(maxRoutes, DEFAULT_GUIDE_ALTERNATIVE_ROUTES, {
      min: 1,
      max: MAX_GUIDE_ALTERNATIVE_ROUTES,
      integer: true,
    });
    return routes.slice(0, limitedCount).map((route, index) => ({
      ...route,
      route_id: route?.route_id || `osrm_${index + 1}`,
    }));
  } catch (error) {
    const wrapped = new Error(`OSRM route lookup failed: ${error.message}`);
    wrapped.isOsrmError = true;
    throw wrapped;
  }
}

async function getOsrmRoutePath(origin, destination, deadline = null) {
  try {
    return await fetchOsrmRoute(origin, destination, deadline);
  } catch (error) {
    const wrapped = new Error(`OSRM route lookup failed: ${error.message}`);
    wrapped.isOsrmError = true;
    throw wrapped;
  }
}

async function getRoutePathWithFallback(origin, destination, deadline = null) {
  const straightDistanceKm = haversineDistanceKm(
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng,
  );

  try {
    const routed = await fetchOsrmRoute(origin, destination, deadline);
    return {
      path: routed.path,
      distance_km: roundNumber(
        routed.distance_km == null ? straightDistanceKm : routed.distance_km,
        2,
      ),
      routing_source: "osrm",
      route_warning: null,
    };
  } catch (error) {
    if (DEBUG_OSRM) {
      console.warn(`[Node][osrm] fallback destination=${destination.id} message=${error.message}`);
    }
    return {
      path: buildStraightLinePath(origin, destination),
      distance_km: roundNumber(straightDistanceKm, 2),
      routing_source: "straight_line",
      route_warning: "osrm_failed",
    };
  }
}

module.exports = {
  OSRM_ROUTE_URL,
  OSRM_TIMEOUT_MS,
  DEBUG_OSRM,
  DEFAULT_GUIDE_ALTERNATIVE_ROUTES,
  MAX_GUIDE_ALTERNATIVE_ROUTES,
  buildStraightLinePath,
  fetchOsrmRoute,
  getOsrmRouteAlternatives,
  getOsrmRoutePath,
  getRoutePathWithFallback,
};
