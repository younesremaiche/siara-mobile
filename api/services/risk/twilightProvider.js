// Sun/twilight provider backed by api.sunrise-sunset.org.
// Cached results stored verbatim, behavior preserved from models.js.

const axios = require("axios");
const {
  axiosTimeoutFor,
  isDeadlineExpired,
} = require("../riskTimeouts");
const { roundCoord } = require("./riskCommon");

const SUN_API_URL = "https://api.sunrise-sunset.org/json";
const SUN_TIMEOUT_MS = Number(process.env.SUN_TIMEOUT_MS || 8000);
const RISK_TIMEZONE = process.env.RISK_TIMEZONE || "Africa/Algiers";

const twilightCache = new Map();

function twilightCacheKey(lat, lng, iso) {
  return `${roundCoord(lat)}:${roundCoord(lng)}:${iso.slice(0, 10)}`;
}

function buildTwilightFallback(timestampIso) {
  const dt = new Date(timestampIso);
  const hour = dt.getHours();
  const day = hour >= 6 && hour < 18;
  const value = day ? "Day" : "Night";
  return {
    Sunrise_Sunset: value,
    Civil_Twilight: value,
    Nautical_Twilight: value,
    Astronomical_Twilight: value,
  };
}

function inRange(now, startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }
  return now >= start && now <= end;
}

function twilightFromSunData(sunResult, timestampIso) {
  const parsedTs = Date.parse(timestampIso);
  if (Number.isNaN(parsedTs)) {
    return buildTwilightFallback(timestampIso);
  }

  if (!sunResult) {
    return buildTwilightFallback(timestampIso);
  }

  return {
    Sunrise_Sunset: inRange(parsedTs, sunResult.sunrise, sunResult.sunset) ? "Day" : "Night",
    Civil_Twilight: inRange(
      parsedTs,
      sunResult.civil_twilight_begin,
      sunResult.civil_twilight_end,
    )
      ? "Day"
      : "Night",
    Nautical_Twilight: inRange(
      parsedTs,
      sunResult.nautical_twilight_begin,
      sunResult.nautical_twilight_end,
    )
      ? "Day"
      : "Night",
    Astronomical_Twilight: inRange(
      parsedTs,
      sunResult.astronomical_twilight_begin,
      sunResult.astronomical_twilight_end,
    )
      ? "Day"
      : "Night",
  };
}

async function getTwilightFields(lat, lng, timestampIso, deadline = null) {
  const key = twilightCacheKey(lat, lng, timestampIso);
  if (twilightCache.has(key)) {
    return twilightFromSunData(twilightCache.get(key), timestampIso);
  }

  const now = Date.parse(timestampIso);
  if (Number.isNaN(now)) {
    return buildTwilightFallback(timestampIso);
  }

  if (isDeadlineExpired(deadline)) {
    return buildTwilightFallback(timestampIso);
  }

  const date = timestampIso.slice(0, 10);

  try {
    const { data } = await axios.get(SUN_API_URL, {
      params: {
        lat,
        lng,
        date,
        formatted: 0,
        tzid: RISK_TIMEZONE,
      },
      timeout: axiosTimeoutFor(deadline, SUN_TIMEOUT_MS, { ceil: SUN_TIMEOUT_MS }),
    });

    if (!data || data.status !== "OK" || !data.results) {
      throw new Error(`Sun API error status=${data?.status || "UNKNOWN"}`);
    }

    twilightCache.set(key, data.results);
    return twilightFromSunData(data.results, timestampIso);
  } catch (error) {
    console.warn("[Node] sunrise-sunset fallback:", error.message);
    twilightCache.set(key, null);
    return buildTwilightFallback(timestampIso);
  }
}

module.exports = {
  SUN_API_URL,
  SUN_TIMEOUT_MS,
  RISK_TIMEZONE,
  getTwilightFields,
  buildTwilightFallback,
  twilightFromSunData,
  twilightCacheKey,
};
