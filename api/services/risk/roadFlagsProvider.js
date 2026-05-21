// Overpass-backed OSM road flags provider.
// Owns the road-flag cache, Overpass concurrency limiter, and the post-call
// politeness gap. Behavior preserved verbatim from models.js.

const axios = require("axios");
const {
  axiosTimeoutFor,
  isDeadlineExpired,
} = require("../riskTimeouts");
const {
  safeNumber,
  clampNumber,
  validateLatLngStrict,
  waitInLimiterQueue,
} = require("./riskCommon");

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const OVERPASS_TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS || 7000);
const OVERPASS_GRID_DECIMALS = Number(process.env.OVERPASS_GRID_DECIMALS || 3);
const OVERPASS_SLEEP_MS = Number(process.env.OVERPASS_SLEEP_MS || 150);
const OVERPASS_QUEUE_TIMEOUT_MS = Number(process.env.OVERPASS_QUEUE_TIMEOUT_MS || 2500);
const ROAD_CACHE_MAX = Number(process.env.ROAD_CACHE_MAX || 5000);
const ENABLE_OSM_FLAGS = String(process.env.ENABLE_OSM_FLAGS || "1") === "1";
const DEBUG_OSM_FLAGS = String(process.env.DEBUG_OSM_FLAGS || "0") === "1";

const ROAD_FLAG_KEYS = [
  "Amenity",
  "Bump",
  "Crossing",
  "Give_Way",
  "Junction",
  "No_Exit",
  "Railway",
  "Roundabout",
  "Station",
  "Stop",
  "Traffic_Calming",
  "Traffic_Signal",
  "Turning_Loop",
];

const ROAD_FLAG_ZEROES = Object.freeze(
  ROAD_FLAG_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {}),
);

const roadCache = new Map();
let roadCacheHits = 0;
let roadCacheMisses = 0;
let overpassActiveRequests = 0;
const overpassWaitQueue = [];

function toBinaryRoadFlag(value) {
  if (value === true) return 1;
  if (value === false || value == null) return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) && value !== 0 ? 1 : 0;
  }

  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (!text) return 0;
    if (["true", "1", "yes", "y", "on"].includes(text)) return 1;
    if (["false", "0", "no", "n", "off"].includes(text)) return 0;

    const maybeNumber = safeNumber(text);
    return maybeNumber != null && maybeNumber !== 0 ? 1 : 0;
  }

  return 0;
}

function toRoadFlags(flags) {
  const obj = {};
  for (const key of ROAD_FLAG_KEYS) {
    const raw = flags?.[key];
    obj[key] = toBinaryRoadFlag(raw);
  }
  return obj;
}

function roadCacheKey(lat, lng) {
  const latNum = safeNumber(lat);
  const lngNum = safeNumber(lng);
  if (latNum == null || lngNum == null) {
    return "nan:nan";
  }

  const rawDecimals = safeNumber(OVERPASS_GRID_DECIMALS);
  const decimals = rawDecimals == null ? 3 : clampNumber(Math.round(rawDecimals), 0, 6);
  return `${latNum.toFixed(decimals)}:${lngNum.toFixed(decimals)}`;
}

function pruneRoadCacheIfNeeded() {
  const maxSizeRaw = safeNumber(ROAD_CACHE_MAX);
  const maxSize = maxSizeRaw == null ? 5000 : Math.max(1, Math.round(maxSizeRaw));
  if (roadCache.size <= maxSize) {
    return;
  }

  const excess = roadCache.size - maxSize;
  const keys = roadCache.keys();
  for (let i = 0; i < excess; i += 1) {
    const k = keys.next().value;
    if (k == null) {
      break;
    }
    roadCache.delete(k);
  }
}

function setCachedRoadFlags(key, flags) {
  if (!key) {
    return;
  }
  roadCache.set(key, toRoadFlags(flags || ROAD_FLAG_ZEROES));
  pruneRoadCacheIfNeeded();
}

function toLowerTag(value) {
  return String(value || "").trim().toLowerCase();
}

function buildOverpassRoadFlagsQuery(lat, lng) {
  const latText = Number(lat).toFixed(6);
  const lngText = Number(lng).toFixed(6);
  const timeoutSeconds = Math.max(5, Math.ceil(OVERPASS_TIMEOUT_MS / 1000));

  return `
[out:json][timeout:${timeoutSeconds}];
(
  node(around:35,${latText},${lngText})[highway=traffic_signals];
  node(around:35,${latText},${lngText})[highway=stop];
  node(around:35,${latText},${lngText})[highway=give_way];
  node(around:35,${latText},${lngText})[highway=crossing];
  node(around:35,${latText},${lngText})[crossing];
  way(around:35,${latText},${lngText})[crossing];
  node(around:35,${latText},${lngText})[traffic_calming];
  way(around:35,${latText},${lngText})[traffic_calming];
  node(around:60,${latText},${lngText})[railway];
  way(around:60,${latText},${lngText})[railway];
  way(around:60,${latText},${lngText})[junction];
  way(around:60,${latText},${lngText})[junction=roundabout];
  node(around:120,${latText},${lngText})[highway=motorway_junction];
  node(around:60,${latText},${lngText})[noexit=yes];
  way(around:60,${latText},${lngText})[noexit=yes];
  node(around:120,${latText},${lngText})[amenity];
  way(around:120,${latText},${lngText})[amenity];
  node(around:120,${latText},${lngText})[railway=station];
  way(around:120,${latText},${lngText})[railway=station];
  node(around:120,${latText},${lngText})[public_transport=station];
  way(around:120,${latText},${lngText})[public_transport=station];
  node(around:120,${latText},${lngText})[amenity=bus_station];
  way(around:120,${latText},${lngText})[amenity=bus_station];
  node(around:35,${latText},${lngText})[highway=turning_loop];
  way(around:35,${latText},${lngText})[highway=turning_loop];
);
out tags;
`.trim();
}

function parseOverpassRoadFlags(elements) {
  const flags = { ...ROAD_FLAG_ZEROES };
  const items = Array.isArray(elements) ? elements : [];

  for (const element of items) {
    const tags = element?.tags;
    if (!tags || typeof tags !== "object") {
      continue;
    }

    const highwayTag = toLowerTag(tags.highway);
    const junctionTag = toLowerTag(tags.junction);
    const trafficCalmingTag = toLowerTag(tags.traffic_calming);
    const crossingTag = String(tags.crossing || "").trim();
    const railwayTag = toLowerTag(tags.railway);
    const amenityTag = toLowerTag(tags.amenity);
    const publicTransportTag = toLowerTag(tags.public_transport);
    const noExitTag = toLowerTag(tags.noexit);

    if (highwayTag === "traffic_signals") flags.Traffic_Signal = 1;
    if (highwayTag === "stop") flags.Stop = 1;
    if (highwayTag === "give_way") flags.Give_Way = 1;
    if (highwayTag === "turning_loop") flags.Turning_Loop = 1;
    if (highwayTag === "crossing" || crossingTag) flags.Crossing = 1;
    if (highwayTag === "motorway_junction") flags.Junction = 1;

    if (junctionTag) flags.Junction = 1;
    if (junctionTag === "roundabout") {
      flags.Roundabout = 1;
      flags.Junction = 1;
    }

    if (trafficCalmingTag) {
      flags.Traffic_Calming = 1;
      if (["hump", "bump", "table", "yes"].includes(trafficCalmingTag)) {
        flags.Bump = 1;
      }
    }

    if (railwayTag) flags.Railway = 1;
    if (railwayTag === "station") flags.Station = 1;

    if (amenityTag) flags.Amenity = 1;
    if (amenityTag === "bus_station") flags.Station = 1;
    if (publicTransportTag === "station") flags.Station = 1;

    if (noExitTag === "yes") flags.No_Exit = 1;
  }

  if (flags.Roundabout === 1) {
    flags.Junction = 1;
  }

  return toRoadFlags(flags);
}

async function runWithOverpassLimiter(task, { deadline = null } = {}) {
  if (overpassActiveRequests >= 2) {
    await waitInLimiterQueue(
      overpassWaitQueue,
      OVERPASS_QUEUE_TIMEOUT_MS,
      deadline,
      "overpass_queue",
    );
  }

  overpassActiveRequests += 1;
  let releaseNext = null;
  const releaseSlot = () => {
    if (releaseNext) return;
    releaseNext = true;
    overpassActiveRequests = Math.max(0, overpassActiveRequests - 1);
    const next = overpassWaitQueue.shift();
    if (typeof next === "function") {
      next();
    }
  };
  try {
    return await task();
  } finally {
    if (OVERPASS_SLEEP_MS > 0) {
      setTimeout(releaseSlot, OVERPASS_SLEEP_MS).unref?.();
    } else {
      releaseSlot();
    }
  }
}

async function getRoadFlagsAsync(lat, lng, providedRoadFlags, deadline = null) {
  if (providedRoadFlags && typeof providedRoadFlags === "object") {
    const flags = toRoadFlags(providedRoadFlags);
    if (DEBUG_OSM_FLAGS) {
      console.log(`[Node][osm-flags] source=provided flags=${JSON.stringify(flags)}`);
    }
    return flags;
  }

  if (!ENABLE_OSM_FLAGS) {
    if (DEBUG_OSM_FLAGS) {
      console.log("[Node][osm-flags] source=fallback_zeroes reason=osm_disabled");
    }
    return toRoadFlags(ROAD_FLAG_ZEROES);
  }

  const point = validateLatLngStrict({ lat, lng });
  if (!point) {
    if (DEBUG_OSM_FLAGS) {
      console.log("[Node][osm-flags] source=fallback_zeroes reason=invalid_point");
    }
    return toRoadFlags(ROAD_FLAG_ZEROES);
  }

  const key = roadCacheKey(point.lat, point.lng);
  if (roadCache.has(key)) {
    roadCacheHits += 1;
    if (DEBUG_OSM_FLAGS) {
      console.log(
        `[Node][osm-flags] source=cache key=${key} hits=${roadCacheHits} misses=${roadCacheMisses}`,
      );
    }
    return roadCache.get(key);
  }

  if (isDeadlineExpired(deadline)) {
    if (DEBUG_OSM_FLAGS) {
      console.log(`[Node][osm-flags] source=fallback_zeroes key=${key} reason=deadline_expired`);
    }
    return toRoadFlags(ROAD_FLAG_ZEROES);
  }

  roadCacheMisses += 1;
  if (DEBUG_OSM_FLAGS) {
    console.log(
      `[Node][osm-flags] source=cache_miss key=${key} hits=${roadCacheHits} misses=${roadCacheMisses}`,
    );
  }

  let flags = toRoadFlags(ROAD_FLAG_ZEROES);
  let source = "overpass";
  let sourceError = "";
  try {
    const query = buildOverpassRoadFlagsQuery(point.lat, point.lng);
    const { data } = await runWithOverpassLimiter(
      () =>
        axios.post(OVERPASS_URL, query, {
          headers: { "Content-Type": "text/plain" },
          timeout: axiosTimeoutFor(deadline, OVERPASS_TIMEOUT_MS, { ceil: OVERPASS_TIMEOUT_MS }),
        }),
      { deadline },
    );

    flags = parseOverpassRoadFlags(data?.elements);
  } catch (error) {
    source = error?.code === "QUEUE_TIMEOUT" ? "fallback_queue_timeout" : "fallback_zeroes";
    sourceError = error?.message || "unknown_overpass_error";
    flags = toRoadFlags(ROAD_FLAG_ZEROES);
  }

  setCachedRoadFlags(key, flags);
  if (DEBUG_OSM_FLAGS) {
    if (source === "overpass") {
      console.log(`[Node][osm-flags] source=overpass key=${key} flags=${JSON.stringify(flags)}`);
    } else {
      console.log(
        `[Node][osm-flags] source=${source} key=${key} error=${sourceError} flags=${JSON.stringify(flags)}`,
      );
    }
  }

  return flags;
}

module.exports = {
  ROAD_FLAG_KEYS,
  ROAD_FLAG_ZEROES,
  ENABLE_OSM_FLAGS,
  DEBUG_OSM_FLAGS,
  toRoadFlags,
  getRoadFlagsAsync,
};
