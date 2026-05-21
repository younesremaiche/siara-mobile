// Builds the danger row sent to the Flask /risk/* endpoints.
// Composes weather, twilight, and road-flag providers with allSettled fallbacks.
// Behavior preserved verbatim from models.js.

const {
  safeNumber,
  roundNumber,
  toIsoTimestamp,
  mphToKmh,
} = require("./riskCommon");
const { getWeatherFeatures, DEBUG_WEATHER_UNITS } = require("./weatherProvider");
const { getTwilightFields, buildTwilightFallback } = require("./twilightProvider");
const { getRoadFlagsAsync, toRoadFlags, ROAD_FLAG_ZEROES } = require("./roadFlagsProvider");

const DEBUG_DANGER_ROW = String(process.env.DEBUG_DANGER_ROW || "0") === "1";

function safeRowNumber(value, fallback = 0) {
  const n = safeNumber(value);
  return n == null ? fallback : n;
}

function safeRowCategory(value, fallback = "Unknown") {
  const text = String(value || "").trim();
  return text || fallback;
}

async function buildDangerRow({ lat, lng, timestamp, roadFlags, deadline = null }) {
  const timestampIso = toIsoTimestamp(timestamp);
  const rowLat = safeNumber(lat);
  const rowLng = safeNumber(lng);
  const [weatherResult, twilightResult, roadResult] = await Promise.allSettled([
    getWeatherFeatures(lat, lng, timestampIso, deadline),
    getTwilightFields(lat, lng, timestampIso, deadline),
    getRoadFlagsAsync(lat, lng, roadFlags, deadline),
  ]);

  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
  const twilight =
    twilightResult.status === "fulfilled"
      ? twilightResult.value
      : buildTwilightFallback(timestampIso);
  const resolvedRoadFlags =
    roadResult.status === "fulfilled" ? roadResult.value : toRoadFlags(ROAD_FLAG_ZEROES);

  if (weatherResult.status === "rejected") {
    console.warn(
      "[Node][danger-row] weather_fallback_zero",
      weatherResult.reason?.code || weatherResult.reason?.message || "unknown",
    );
  }

  const finalRow = {
    Start_Lat: rowLat,
    Start_Lng: rowLng,
    lat: rowLat,
    lng: rowLng,
    Start_Time: timestampIso,
    "Temperature(F)": safeRowNumber(weather?.["Temperature(F)"], 0),
    "Humidity(%)": safeRowNumber(weather?.["Humidity(%)"], 0),
    "Pressure(in)": safeRowNumber(weather?.["Pressure(in)"], 0),
    "Visibility(mi)": safeRowNumber(weather?.["Visibility(mi)"], 0),
    "Wind_Speed(mph)": safeRowNumber(weather?.["Wind_Speed(mph)"], 0),
    windspeed_10m: safeRowNumber(weather?.windspeed_10m, null),
    windspeed_10m_kmh: safeRowNumber(weather?.windspeed_10m_kmh, null),
    winddirection_10m: safeRowNumber(weather?.winddirection_10m, null),
    "Precipitation(in)": safeRowNumber(weather?.["Precipitation(in)"], 0),
    Wind_Direction: safeRowCategory(weather?.Wind_Direction, "Unknown"),
    Weather_Condition: safeRowCategory(weather?.Weather_Condition, "Unknown"),
    Sunrise_Sunset: safeRowCategory(twilight?.Sunrise_Sunset, "Night"),
    Civil_Twilight: safeRowCategory(twilight?.Civil_Twilight, "Night"),
    Nautical_Twilight: safeRowCategory(twilight?.Nautical_Twilight, "Night"),
    Astronomical_Twilight: safeRowCategory(twilight?.Astronomical_Twilight, "Night"),
    ...resolvedRoadFlags,
  };

  if (DEBUG_WEATHER_UNITS) {
    const windMph = safeNumber(finalRow["Wind_Speed(mph)"]);
    console.log("[Node][danger-row-wind]", {
      timestamp_iso: timestampIso,
      wind_mph: windMph == null ? null : roundNumber(windMph, 4),
      wind_kmh_from_mph: windMph == null ? null : roundNumber(mphToKmh(windMph), 4),
      windspeed_10m_kmh: finalRow.windspeed_10m_kmh,
      wind_direction_cardinal: finalRow.Wind_Direction,
      wind_direction_deg: finalRow.winddirection_10m,
    });
  }

  if (DEBUG_DANGER_ROW) {
    console.log("\n[DANGER ROW][FINAL INPUT TO FLASK]:", finalRow);
  }
  return finalRow;
}

module.exports = {
  DEBUG_DANGER_ROW,
  safeRowNumber,
  safeRowCategory,
  buildDangerRow,
};
