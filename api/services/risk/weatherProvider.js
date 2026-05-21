// Open-Meteo weather provider.
// Owns weather caches, snapshot picking, unit detection / normalization, and
// the danger-categorical-levels filter loaded from the model metadata.
// Behavior preserved verbatim from models.js.

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const {
  axiosTimeoutFor,
  isDeadlineExpired,
  makeDeadlineError,
} = require("../riskTimeouts");
const {
  safeNumber,
  roundNumber,
  cToF,
  hPaToInHg,
  mpsToMph,
  kmhToMph,
  mphToKmh,
  mmToIn,
  metersToMiles,
  roundCoord,
  floorToHourMs,
  floorToBucketMs,
  getCacheEntry,
  setCacheEntryWithTtl,
} = require("./riskCommon");

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_TIMEOUT_MS = Number(process.env.WEATHER_TIMEOUT_MS || 8000);
const WEATHER_PARAM_FAILURE_TTL_MS = Number(
  process.env.WEATHER_PARAM_FAILURE_TTL_MS || 60 * 60 * 1000,
);
const DEBUG_WEATHER_UNITS = String(process.env.DEBUG_WEATHER_UNITS || "0") === "1";

const MAX_CURRENT_WEATHER_CACHE = Number(process.env.MAX_CURRENT_WEATHER_CACHE || 1000);
const MAX_FORECAST_WEATHER_CACHE = Number(process.env.MAX_FORECAST_WEATHER_CACHE || 1000);
const MAX_WEATHER_FEATURE_CACHE = Number(process.env.MAX_WEATHER_FEATURE_CACHE || 2000);
const CURRENT_WEATHER_CACHE_TTL_MS = Number(
  process.env.CURRENT_WEATHER_CACHE_TTL_MS || 2 * 60 * 1000,
);
const FORECAST_WEATHER_CACHE_TTL_MS = Number(
  process.env.FORECAST_WEATHER_CACHE_TTL_MS || 10 * 60 * 1000,
);
const WEATHER_FEATURE_CACHE_TTL_MS = Number(
  process.env.WEATHER_FEATURE_CACHE_TTL_MS || 10 * 60 * 1000,
);

const DANGER_METADATA_PATH =
  process.env.DANGER_METADATA_PATH ||
  path.join(__dirname, "../../danger-zone-model/siara_v1_artifacts/siara_severe_metadata.json");

const weatherCache = new Map();
const currentWeatherCache = new Map();
const forecastWeatherCache = new Map();
const weatherSnapshotCache = new Map();

function buildAllowedCategorySet(values) {
  if (!Array.isArray(values)) {
    return null;
  }

  const normalized = values
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return normalized.length ? new Set(normalized) : null;
}

function loadDangerCategoricalLevelSets() {
  try {
    if (!fs.existsSync(DANGER_METADATA_PATH)) {
      return {
        weatherConditionAllowedSet: null,
        windDirectionAllowedSet: null,
      };
    }

    const raw = fs.readFileSync(DANGER_METADATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const levels = parsed?.categorical_levels || {};

    return {
      weatherConditionAllowedSet: buildAllowedCategorySet(levels?.Weather_Condition),
      windDirectionAllowedSet: buildAllowedCategorySet(levels?.Wind_Direction),
    };
  } catch (error) {
    console.warn("[Node] danger metadata load fallback:", error.message);
    return {
      weatherConditionAllowedSet: null,
      windDirectionAllowedSet: null,
    };
  }
}

const { weatherConditionAllowedSet, windDirectionAllowedSet } = loadDangerCategoricalLevelSets();
let weatherUnitsLogged = false;

function currentWeatherCacheKey(lat, lng, referenceIso = null) {
  const parsedMs = Date.parse(referenceIso || "");
  const sourceMs = Number.isNaN(parsedMs) ? Date.now() : parsedMs;
  const bucketIso = new Date(floorToBucketMs(sourceMs, 5 * 60 * 1000)).toISOString();
  return `${roundCoord(lat)}:${roundCoord(lng)}:${bucketIso}`;
}

function forecastWeatherCacheKey(lat, lng, startIso) {
  const parsedMs = Date.parse(startIso || "");
  const sourceMs = Number.isNaN(parsedMs) ? Date.now() : parsedMs;
  const hourBucket = new Date(floorToHourMs(sourceMs)).toISOString();
  return `${roundCoord(lat)}:${roundCoord(lng)}:${hourBucket}`;
}

function weatherCacheKey(lat, lng, iso) {
  const targetMs = Date.parse(iso);
  const nowMs = Date.now();
  const safeTargetMs = Number.isNaN(targetMs) ? nowMs : targetMs;
  const diffMs = Math.abs(safeTargetMs - nowMs);
  const useQuarterHourBucket = diffMs > 15 * 60 * 1000 && diffMs <= 3 * 60 * 60 * 1000;
  const bucketMs = useQuarterHourBucket ? 15 * 60 * 1000 : 60 * 60 * 1000;
  const bucketStart = Math.floor(safeTargetMs / bucketMs) * bucketMs;
  const bucketType = useQuarterHourBucket ? "m15" : "h1";
  return `${roundCoord(lat)}:${roundCoord(lng)}:${bucketType}:${new Date(bucketStart).toISOString()}`;
}

function mapWindDirection(degrees, windSpeedMph = null) {
  const d = safeNumber(degrees);
  const speed = safeNumber(windSpeedMph);

  if (speed != null && speed < 0.5) {
    return "CALM";
  }
  if (d == null) {
    return "Unknown";
  }

  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];

  const index = Math.round((((d % 360) + 360) % 360) / 22.5) % 16;
  return dirs[index];
}

function mapWeatherCondition(code) {
  const c = safeNumber(code);
  if (c == null) {
    return "Unknown";
  }

  if (c === 0) return "Clear";
  if (c === 1) return "Fair";
  if (c === 2) return "Partly Cloudy";
  if (c === 3) return "Overcast";
  if ([45, 48].includes(c)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(c)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(c)) return "Snow";
  if ([95, 96, 99].includes(c)) return "Thunderstorm";
  return "Other";
}

function normalizeUnitText(unit) {
  return String(unit || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function detectWindUnitKind(unit) {
  const text = normalizeUnitText(unit);
  if (!text) return "unknown";
  if (text.includes("mph") || text.includes("milesperhour")) return "mph";
  if (
    text.includes("km/h") ||
    text.includes("km_h") ||
    text.includes("kmh") ||
    text.includes("kph") ||
    text.includes("kilometerperhour") ||
    text.includes("kilometreperhour")
  ) {
    return "kmh";
  }
  if (
    text.includes("m/s") ||
    text.includes("meterpersecond") ||
    text.includes("metrepersecond")
  ) {
    return "mps";
  }
  return "unknown";
}

function detectPrecipUnitKind(unit) {
  const text = normalizeUnitText(unit);
  if (!text) return "unknown";
  if (text === "in" || text.includes("inch")) return "inch";
  if (text === "mm" || text.includes("millimeter") || text.includes("millimetre")) return "mm";
  return "unknown";
}

function detectTemperatureUnitKind(unit) {
  const text = normalizeUnitText(unit);
  if (!text) return "unknown";
  if (text === "f" || text === "°f" || text.endsWith("f") || text.includes("fahrenheit")) {
    return "fahrenheit";
  }
  if (text === "c" || text === "°c" || text.endsWith("c") || text.includes("celsius")) {
    return "celsius";
  }
  return "unknown";
}

function detectPressureUnitKind(unit) {
  const text = normalizeUnitText(unit);
  if (!text) return "unknown";
  if (
    text === "inhg" ||
    text === "in" ||
    text.includes("mercury") ||
    text.includes("inchofmercury")
  ) {
    return "inhg";
  }
  if (text === "hpa" || text.includes("hectopascal")) {
    return "hpa";
  }
  return "unknown";
}

function detectVisibilityUnitKind(unit) {
  const text = normalizeUnitText(unit);
  if (!text) return "unknown";
  if (text === "mi" || text.includes("mile")) return "mile";
  if (text === "m" || text.includes("meter") || text.includes("metre")) return "meter";
  if (text === "km" || text.includes("kilometer") || text.includes("kilometre")) return "km";
  return "unknown";
}

function normalizeVisibilityToMiles(rawVisibility, unitKind, sourceLabel = "unknown") {
  const value = safeNumber(rawVisibility);
  if (value == null) {
    return null;
  }

  let normalizedMiles = value;
  if (unitKind === "meter") {
    normalizedMiles = metersToMiles(value);
  } else if (unitKind === "km") {
    normalizedMiles = value / 1.609344;
  } else if (unitKind === "mile") {
    normalizedMiles = value;
  }

  if (!Number.isFinite(normalizedMiles) || normalizedMiles < 0 || normalizedMiles > 100) {
    console.warn("[Node][visibility-guard] suspicious normalized visibility", {
      source: sourceLabel,
      raw_visibility: value,
      unit_kind: unitKind,
      normalized_miles: Number.isFinite(normalizedMiles) ? normalizedMiles : null,
    });
    return null;
  }

  return normalizedMiles;
}

function markSnapshotAsModelNormalized(snapshot, sourceLabel = "unknown") {
  if (!snapshot || typeof snapshot !== "object") {
    return snapshot;
  }

  Object.defineProperties(snapshot, {
    __model_units_normalized: {
      value: true,
      enumerable: false,
      configurable: true,
      writable: false,
    },
    __model_units_source: {
      value: sourceLabel,
      enumerable: false,
      configurable: true,
      writable: false,
    },
  });

  return snapshot;
}

function getUnitsForWeatherSource(data, source) {
  if (source === "current") {
    return data?.current_units || null;
  }
  if (source === "hourly") {
    return data?.hourly_units || null;
  }
  if (source === "minutely_15") {
    return data?.minutely_15_units || null;
  }
  return data?.current_units || data?.hourly_units || data?.minutely_15_units || null;
}

function normalizeSnapshotForModelUnits(snapshot, units, sourceLabel = "unknown") {
  if (!snapshot || typeof snapshot !== "object") {
    return snapshot;
  }
  if (snapshot.__model_units_normalized) {
    return snapshot;
  }

  const normalized = {
    ...snapshot,
  };
  const selectedWindUnit = units?.wind_speed_10m;
  const selectedPrecipUnit = units?.precipitation;
  const selectedTempUnit = units?.temperature_2m;
  const selectedPressureUnit = units?.pressure_msl;
  const selectedVisibilityUnit = units?.visibility;

  const windBefore = safeNumber(normalized.wind_speed_10m);
  const windUnitKind = detectWindUnitKind(selectedWindUnit);
  if (windBefore != null) {
    if (windUnitKind === "kmh") {
      normalized.wind_speed_10m = kmhToMph(windBefore);
    } else if (windUnitKind === "mps") {
      normalized.wind_speed_10m = mpsToMph(windBefore);
    }
  }

  const precipBefore = safeNumber(normalized.precipitation);
  const precipUnitKind = detectPrecipUnitKind(selectedPrecipUnit);
  if (precipBefore != null && precipUnitKind === "mm") {
    normalized.precipitation = mmToIn(precipBefore);
  }

  const tempBefore = safeNumber(normalized.temperature_2m);
  const tempUnitKind = detectTemperatureUnitKind(selectedTempUnit);
  if (tempBefore != null && tempUnitKind === "celsius") {
    normalized.temperature_2m = cToF(tempBefore);
  }

  const pressureBefore = safeNumber(normalized.pressure_msl);
  const pressureUnitKind = detectPressureUnitKind(selectedPressureUnit);
  if (pressureBefore != null && pressureUnitKind === "hpa") {
    normalized.pressure_msl = hPaToInHg(pressureBefore);
  }

  // UI weather stays metric for Algeria; model weather is normalized to U.S. customary units, and visibility is guarded before Flask input.
  const visibilityBefore = safeNumber(normalized.visibility);
  const visibilityUnitKind = detectVisibilityUnitKind(selectedVisibilityUnit);
  // Open-Meteo visibility is meter-based here and this pipeline does not set a dedicated visibility_unit.
  const resolvedVisibilityUnitKind =
    visibilityUnitKind === "unknown" ? "meter" : visibilityUnitKind;
  normalized.visibility = normalizeVisibilityToMiles(
    visibilityBefore,
    resolvedVisibilityUnitKind,
    sourceLabel,
  );
  console.log("[Node][visibility-normalize-debug]", {
    source: sourceLabel,
    selected_visibility_unit: selectedVisibilityUnit || null,
    resolved_visibility_unit: resolvedVisibilityUnitKind,
    raw_visibility: visibilityBefore,
    normalized_visibility_mi: normalized.visibility,
  });

  if (DEBUG_WEATHER_UNITS) {
    const windAfter = safeNumber(normalized.wind_speed_10m);
    const precipAfter = safeNumber(normalized.precipitation);
    const tempAfter = safeNumber(normalized.temperature_2m);
    const pressureAfter = safeNumber(normalized.pressure_msl);
    const visibilityAfter = safeNumber(normalized.visibility);
    console.log("[Node][weather-unit-guard]", {
      source: sourceLabel,
      units: {
        wind_speed_10m: selectedWindUnit || "n/a",
        precipitation: selectedPrecipUnit || "n/a",
        temperature_2m: selectedTempUnit || "n/a",
        pressure_msl: selectedPressureUnit || "n/a",
        visibility: selectedVisibilityUnit || "n/a",
      },
      wind: {
        before: windBefore == null ? null : roundNumber(windBefore, 4),
        after_mph: windAfter == null ? null : roundNumber(windAfter, 4),
      },
      precipitation: {
        before: precipBefore == null ? null : roundNumber(precipBefore, 4),
        after_in: precipAfter == null ? null : roundNumber(precipAfter, 4),
      },
      temperature: {
        before: tempBefore == null ? null : roundNumber(tempBefore, 4),
        after_f: tempAfter == null ? null : roundNumber(tempAfter, 4),
      },
      pressure: {
        before: pressureBefore == null ? null : roundNumber(pressureBefore, 4),
        after_inhg: pressureAfter == null ? null : roundNumber(pressureAfter, 4),
      },
      visibility: {
        before: visibilityBefore == null ? null : roundNumber(visibilityBefore, 4),
        after_mi: visibilityAfter == null ? null : roundNumber(visibilityAfter, 4),
      },
    });
  }

  return markSnapshotAsModelNormalized(normalized, sourceLabel);
}

function mapWeatherConditionLabel(code) {
  const normalized = mapWeatherCondition(code);
  const labels = {
    Clear: "Ciel degage",
    Fair: "Beau",
    "Partly Cloudy": "Partiellement nuageux",
    Overcast: "Couvert",
    Fog: "Brouillard",
    Drizzle: "Bruine",
    Rain: "Pluie",
    Snow: "Neige",
    Thunderstorm: "Orage",
    Other: "Variable",
    Unknown: "Inconnu",
  };
  return labels[normalized] || "Inconnu";
}

function clampCategoricalValue(
  value,
  allowedSet,
  { fallbackIfEmpty = "Unknown", fallbackIfDisallowed = "Unknown" } = {},
) {
  const normalized = String(value || "").trim();
  const candidate = normalized || fallbackIfEmpty;

  if (!allowedSet || allowedSet.size === 0) {
    return candidate;
  }
  if (allowedSet.has(candidate)) {
    return candidate;
  }
  if (allowedSet.has(fallbackIfDisallowed)) {
    return fallbackIfDisallowed;
  }
  if (allowedSet.has("Unknown")) {
    return "Unknown";
  }
  return candidate;
}

function findNearestIndexUnix(timeArraySeconds, targetSeconds) {
  if (!Array.isArray(timeArraySeconds) || timeArraySeconds.length === 0) {
    return -1;
  }

  const target = safeNumber(targetSeconds);
  if (target == null) {
    return 0;
  }

  let bestIndex = -1;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < timeArraySeconds.length; i += 1) {
    const candidate = safeNumber(timeArraySeconds[i]);
    if (candidate == null) {
      continue;
    }

    const diff = Math.abs(candidate - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function extractCurrentSnapshot(current) {
  if (!current || typeof current !== "object") {
    return null;
  }

  return {
    selected_time_unix: safeNumber(current.time),
    temperature_2m: safeNumber(current.temperature_2m),
    relative_humidity_2m: safeNumber(current.relative_humidity_2m),
    pressure_msl: safeNumber(current.pressure_msl),
    visibility: safeNumber(current.visibility),
    wind_speed_10m: safeNumber(current.wind_speed_10m),
    wind_direction_10m: safeNumber(current.wind_direction_10m),
    precipitation: safeNumber(current.precipitation),
    weather_code: safeNumber(current.weather_code),
  };
}

function extractForecastSnapshot(series, targetSeconds) {
  if (!series || typeof series !== "object") {
    return null;
  }

  const index = findNearestIndexUnix(series.time, targetSeconds);
  if (index < 0) {
    return null;
  }

  return {
    selected_time_unix: safeNumber(series.time?.[index]),
    temperature_2m: safeNumber(series.temperature_2m?.[index]),
    relative_humidity_2m: safeNumber(series.relative_humidity_2m?.[index]),
    pressure_msl: safeNumber(series.pressure_msl?.[index]),
    visibility: safeNumber(series.visibility?.[index]),
    wind_speed_10m: safeNumber(series.wind_speed_10m?.[index]),
    wind_direction_10m: safeNumber(series.wind_direction_10m?.[index]),
    precipitation: safeNumber(series.precipitation?.[index]),
    weather_code: safeNumber(series.weather_code?.[index]),
  };
}

function buildWeatherSourceOrder(absDiffSeconds, deltaSeconds = 0) {
  if (deltaSeconds > 0) {
    if (absDiffSeconds <= 3 * 60 * 60) {
      return ["minutely_15", "hourly", "current"];
    }
    return ["hourly", "minutely_15", "current"];
  }

  if (absDiffSeconds <= 15 * 60) {
    return ["current", "minutely_15", "hourly"];
  }
  if (absDiffSeconds <= 3 * 60 * 60) {
    return ["minutely_15", "hourly", "current"];
  }
  return ["hourly", "current", "minutely_15"];
}

function pickWeatherSnapshot(data, targetSeconds, absDiffSeconds, deltaSeconds = 0) {
  const orderedSources = buildWeatherSourceOrder(absDiffSeconds, deltaSeconds);
  for (const source of orderedSources) {
    if (source === "current") {
      const snapshot = extractCurrentSnapshot(data?.current);
      if (snapshot) {
        return { source: "current", snapshot };
      }
      continue;
    }

    const snapshot = extractForecastSnapshot(data?.[source], targetSeconds);
    if (snapshot) {
      return { source, snapshot };
    }
  }

  return {
    source: "fallback_empty",
    snapshot: {
      selected_time_unix: null,
      temperature_2m: null,
      relative_humidity_2m: null,
      pressure_msl: null,
      visibility: null,
      wind_speed_10m: null,
      wind_direction_10m: null,
      precipitation: null,
      weather_code: null,
    },
  };
}

function getBaseWeatherFieldList() {
  return [
    "temperature_2m",
    "relative_humidity_2m",
    "pressure_msl",
    "precipitation",
    "wind_speed_10m",
    "wind_direction_10m",
    "weather_code",
    "visibility",
  ];
}

function logModelWeatherUnitWarning(snapshot, sourceLabel = "unknown") {
  if (!snapshot || typeof snapshot !== "object" || snapshot.__model_units_normalized) {
    return;
  }

  console.warn("[Node][weather-unit-warning] model weather snapshot reached row builder without normalization", {
    source: sourceLabel,
    temperature_2m: safeNumber(snapshot?.temperature_2m),
    wind_speed_10m: safeNumber(snapshot?.wind_speed_10m),
    pressure_msl: safeNumber(snapshot?.pressure_msl),
    visibility: safeNumber(snapshot?.visibility),
    precipitation: safeNumber(snapshot?.precipitation),
  });
}

function buildModelWeatherRowFromSnapshot(snapshot, sourceLabel = "unknown") {
  logModelWeatherUnitWarning(snapshot, sourceLabel);

  const windSpeedMph = safeNumber(snapshot?.wind_speed_10m);
  const windSpeedKmh = windSpeedMph == null ? null : mphToKmh(windSpeedMph);
  const windDirectionDeg = safeNumber(snapshot?.wind_direction_10m);
  const weatherCode = safeNumber(snapshot?.weather_code);
  const mappedWeatherCondition = mapWeatherCondition(weatherCode);
  const mappedWindDirection = mapWindDirection(windDirectionDeg, windSpeedMph);
  const weatherCondition = clampCategoricalValue(
    mappedWeatherCondition,
    weatherConditionAllowedSet,
    {
      fallbackIfEmpty: "Unknown",
      fallbackIfDisallowed: "Other",
    },
  );
  const windDirection = clampCategoricalValue(mappedWindDirection, windDirectionAllowedSet, {
    fallbackIfEmpty: "Unknown",
    fallbackIfDisallowed: "Unknown",
  });

  return {
    // Algeria-facing UI stays metric; the model row must stay in the U.S. units used in training.
    "Temperature(F)": safeNumber(snapshot?.temperature_2m),
    "Humidity(%)": safeNumber(snapshot?.relative_humidity_2m),
    "Pressure(in)": safeNumber(snapshot?.pressure_msl),
    "Visibility(mi)": safeNumber(snapshot?.visibility),
    "Wind_Speed(mph)": windSpeedMph,
    windspeed_10m: windSpeedKmh,
    windspeed_10m_kmh: windSpeedKmh,
    winddirection_10m: windDirectionDeg,
    "Precipitation(in)": safeNumber(snapshot?.precipitation),
    Wind_Direction: windDirection,
    Weather_Condition: weatherCondition,
  };
}

const weatherUnsupported = {
  visibilityCurrentExpiresAt: 0,
  minutelyExpiresAt: 0,
};

function isWeatherFlagActive(field) {
  const expiresAt =
    field === "visibility"
      ? weatherUnsupported.visibilityCurrentExpiresAt
      : weatherUnsupported.minutelyExpiresAt;
  return expiresAt > Date.now();
}

function markWeatherFlag(field) {
  const expiresAt = Date.now() + WEATHER_PARAM_FAILURE_TTL_MS;
  if (field === "visibility") {
    weatherUnsupported.visibilityCurrentExpiresAt = expiresAt;
  } else if (field === "minutely_15") {
    weatherUnsupported.minutelyExpiresAt = expiresAt;
  }
}

async function fetchCurrentWeatherPayload(lat, lng, deadline) {
  const fields = getBaseWeatherFieldList();
  const seriesFields = fields.join(",");
  const buildParams = ({ skipVisibilityInCurrent = false, skipMinutely = false } = {}) => {
    const params = {
      latitude: lat,
      longitude: lng,
      current: skipVisibilityInCurrent
        ? fields.filter((field) => field !== "visibility").join(",")
        : seriesFields,
      hourly: seriesFields,
      forecast_days: 7,
      temperature_unit: "celsius",
      wind_speed_unit: "kmh",
      precipitation_unit: "mm",
      timezone: "auto",
      timeformat: "unixtime",
    };
    if (!skipMinutely) {
      params.minutely_15 = seriesFields;
    }
    return params;
  };

  let skipVisibilityInCurrent = isWeatherFlagActive("visibility");
  let skipMinutely = isWeatherFlagActive("minutely_15");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (isDeadlineExpired(deadline)) {
      throw makeDeadlineError("open_meteo");
    }
    const timeout = axiosTimeoutFor(deadline, WEATHER_TIMEOUT_MS, { ceil: WEATHER_TIMEOUT_MS });
    try {
      const response = await axios.get(OPEN_METEO_URL, {
        params: buildParams({ skipVisibilityInCurrent, skipMinutely }),
        timeout,
      });
      return response.data;
    } catch (error) {
      if (error?.response?.status !== 400) {
        throw error;
      }
      if (!skipVisibilityInCurrent) {
        skipVisibilityInCurrent = true;
        markWeatherFlag("visibility");
        continue;
      }
      if (!skipMinutely) {
        skipMinutely = true;
        markWeatherFlag("minutely_15");
        continue;
      }
      throw error;
    }
  }

  throw new Error("open_meteo_unrecoverable_400");
}

async function resolveWeatherSnapshot(lat, lng, timestampIso = null, deadline = null) {
  const cacheKey = currentWeatherCacheKey(lat, lng, timestampIso);
  const cached = getCacheEntry(weatherSnapshotCache, cacheKey);
  if (cached) {
    return cached;
  }

  const payload = await fetchCurrentWeatherPayload(lat, lng, deadline);
  if (DEBUG_WEATHER_UNITS && !weatherUnitsLogged) {
    weatherUnitsLogged = true;
    console.log("[Node][weather-units]", {
      current_units: payload?.current_units,
      hourly_units: payload?.hourly_units,
      minutely_15_units: payload?.minutely_15_units,
    });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const targetSecondsRaw = Math.floor(Date.parse(timestampIso || "") / 1000);
  const targetSeconds = Number.isFinite(targetSecondsRaw) ? targetSecondsRaw : nowSeconds;
  const deltaSeconds = targetSeconds - nowSeconds;
  const absDiffSeconds = Math.abs(deltaSeconds);
  const { source: weatherSource, snapshot } = pickWeatherSnapshot(
    payload,
    targetSeconds,
    absDiffSeconds,
    deltaSeconds,
  );
  const selectedUnits = getUnitsForWeatherSource(payload, weatherSource);
  const resolved = {
    weatherSource,
    snapshot,
    snapshotTimeIso:
      snapshot?.selected_time_unix == null
        ? null
        : new Date(snapshot.selected_time_unix * 1000).toISOString(),
    selectedUnits,
    targetSeconds,
  };

  setCacheEntryWithTtl(
    weatherSnapshotCache,
    cacheKey,
    resolved,
    MAX_CURRENT_WEATHER_CACHE,
    CURRENT_WEATHER_CACHE_TTL_MS,
  );
  return resolved;
}

function buildCurrentWeatherUiFromSnapshot(snapshot, weatherSource, targetSeconds) {
  const windSpeedKmh = safeNumber(snapshot.wind_speed_10m);
  const windSpeedMph = windSpeedKmh == null ? null : kmhToMph(windSpeedKmh);
  const rawVisibilityMeters = safeNumber(snapshot.visibility);

  return {
    temperature_c: roundNumber(snapshot.temperature_2m, 1),
    condition: mapWeatherConditionLabel(snapshot.weather_code),
    visibility_km:
      rawVisibilityMeters == null || rawVisibilityMeters < 0 || rawVisibilityMeters > 100000
        ? null
        : roundNumber(rawVisibilityMeters / 1000, 1),
    wind_kmh: roundNumber(windSpeedKmh, 1),
    wind_direction: mapWindDirection(snapshot.wind_direction_10m, windSpeedMph),
    // Numeric (degrees from North) for downstream models — `wind_direction`
    // above is the compass-letter label for the UI and is lossy.
    wind_direction_deg: safeNumber(snapshot.wind_direction_10m),
    humidity_pct: roundNumber(snapshot.relative_humidity_2m, 0),
    pressure_hpa: roundNumber(snapshot.pressure_msl, 1),
    precipitation_mm: roundNumber(snapshot.precipitation, 2),
    timestamp_iso: new Date(targetSeconds * 1000).toISOString(),
    snapshot_time_iso:
      snapshot?.selected_time_unix == null
        ? null
        : new Date(snapshot.selected_time_unix * 1000).toISOString(),
    snapshot_source: weatherSource,
    fetched_at_iso: new Date().toISOString(),
  };
}

async function getCurrentWeatherUi(lat, lng, timestampIso = null, deadline = null) {
  const cacheKey = currentWeatherCacheKey(lat, lng, timestampIso);
  const cached = getCacheEntry(currentWeatherCache, cacheKey);
  if (cached) {
    return cached;
  }

  const { weatherSource, snapshot, targetSeconds } = await resolveWeatherSnapshot(
    lat,
    lng,
    timestampIso,
    deadline,
  );
  const weather = buildCurrentWeatherUiFromSnapshot(snapshot, weatherSource, targetSeconds);

  setCacheEntryWithTtl(
    currentWeatherCache,
    cacheKey,
    weather,
    MAX_CURRENT_WEATHER_CACHE,
    CURRENT_WEATHER_CACHE_TTL_MS,
  );
  return weather;
}

async function getForecastWeatherSeries(lat, lng, startIso, deadline = null) {
  const cacheKey = forecastWeatherCacheKey(lat, lng, startIso);
  const cached = getCacheEntry(forecastWeatherCache, cacheKey);
  if (cached) {
    return cached;
  }

  if (isDeadlineExpired(deadline)) {
    throw makeDeadlineError("open_meteo_forecast");
  }

  const seriesFields = getBaseWeatherFieldList().join(",");
  const response = await axios.get(OPEN_METEO_URL, {
    params: {
      latitude: lat,
      longitude: lng,
      hourly: seriesFields,
      forecast_days: 2,
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      precipitation_unit: "inch",
      timezone: "GMT",
      timeformat: "unixtime",
    },
    timeout: axiosTimeoutFor(deadline, WEATHER_TIMEOUT_MS, { ceil: WEATHER_TIMEOUT_MS }),
  });

  const payload = response.data;
  setCacheEntryWithTtl(
    forecastWeatherCache,
    cacheKey,
    payload,
    MAX_FORECAST_WEATHER_CACHE,
    FORECAST_WEATHER_CACHE_TTL_MS,
  );
  return payload;
}

async function getWeatherFeatures(lat, lng, timestampIso, deadline = null) {
  const key = weatherCacheKey(lat, lng, timestampIso);
  const cached = getCacheEntry(weatherCache, key);
  if (cached) {
    return cached;
  }

  const {
    weatherSource,
    snapshot,
    snapshotTimeIso,
    selectedUnits,
    targetSeconds,
  } = await resolveWeatherSnapshot(lat, lng, timestampIso, deadline);
  if (DEBUG_WEATHER_UNITS) {
    console.log("[Node][raw-weather-before-normalize]", {
      source: weatherSource,
      selected_units: selectedUnits,
      visibility_raw: safeNumber(snapshot?.visibility),
      temperature_raw: safeNumber(snapshot?.temperature_2m),
      wind_raw: safeNumber(snapshot?.wind_speed_10m),
      pressure_raw: safeNumber(snapshot?.pressure_msl),
      precipitation_raw: safeNumber(snapshot?.precipitation),
    });
  }
  const normalizedSnapshot = normalizeSnapshotForModelUnits(
    snapshot,
    selectedUnits,
    weatherSource,
  );
  const uiWeather = buildCurrentWeatherUiFromSnapshot(snapshot, weatherSource, targetSeconds);

  if (DEBUG_WEATHER_UNITS) {
    console.log(
      `[Node][weather-select] source=${weatherSource} target=${new Date(
        targetSeconds * 1000,
      ).toISOString()} selected=${snapshotTimeIso || "n/a"}`,
    );
    console.log("[Node][weather-wind]", {
      source: weatherSource,
      selected_units: selectedUnits,
      raw_wind_speed: safeNumber(snapshot?.wind_speed_10m),
      normalized_wind_mph: safeNumber(normalizedSnapshot?.wind_speed_10m),
      normalized_wind_kmh: (() => {
        const mph = safeNumber(normalizedSnapshot?.wind_speed_10m);
        return mph == null ? null : roundNumber(mphToKmh(mph), 4);
      })(),
      wind_direction_deg: safeNumber(normalizedSnapshot?.wind_direction_10m),
    });
  }

  const row = buildModelWeatherRowFromSnapshot(normalizedSnapshot, weatherSource);
  console.log("[Node][weather-snapshot-consistency]", {
    source: weatherSource,
    snapshot_time_iso: snapshot?.selected_time_unix == null
      ? null
      : new Date(snapshot.selected_time_unix * 1000).toISOString(),
    raw_visibility_m: safeNumber(snapshot?.visibility),
    ui_visibility_km: uiWeather?.visibility_km ?? null,
    model_visibility_mi: row?.["Visibility(mi)"] ?? null,
  });

  setCacheEntryWithTtl(
    weatherCache,
    key,
    row,
    MAX_WEATHER_FEATURE_CACHE,
    WEATHER_FEATURE_CACHE_TTL_MS,
  );
  return row;
}

module.exports = {
  // Constants
  OPEN_METEO_URL,
  WEATHER_TIMEOUT_MS,
  DEBUG_WEATHER_UNITS,
  // Snapshot / row helpers needed by getRiskForecast24h controller
  extractForecastSnapshot,
  normalizeSnapshotForModelUnits,
  getUnitsForWeatherSource,
  buildModelWeatherRowFromSnapshot,
  // Public providers
  getCurrentWeatherUi,
  getForecastWeatherSeries,
  getWeatherFeatures,
};
