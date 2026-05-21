// Weather endpoints — currently a single GET, but kept in its own module so the
// UI can swap providers (e.g. hourly forecast) without touching call sites.
//
// Endpoint covered:
//   GET /api/weather/current?lat&lng&timestamp

import { request } from './api';
import { TtlCache, coordKey } from '../utils/requestCache';

const WEATHER_TTL_MS = 5 * 60_000;
const weatherCache = new TtlCache({ ttlMs: WEATHER_TTL_MS, max: 16 });

function minuteBucket(timestampIso) {
  if (!timestampIso) return 'now';
  const date = new Date(timestampIso);
  if (Number.isNaN(date.getTime())) return 'now';
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}`;
}

function normaliseWeatherArgs(input, lngArg, optionsArg = {}) {
  if (input && typeof input === 'object') return input;
  const options = optionsArg && typeof optionsArg === 'object'
    ? optionsArg
    : { timestamp: optionsArg };
  return { ...options, lat: input, lng: lngArg };
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normaliseWeatherResponse(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return {
    ...payload,
    temperature_c: numberOrNull(payload.temperature_c ?? payload.temperature ?? payload.temp_c),
    condition: payload.condition || payload.weather_condition || payload.weather || 'Weather',
    visibility_km: numberOrNull(payload.visibility_km ?? payload.visibility),
    wind_kmh: numberOrNull(payload.wind_kmh ?? payload.wind_speed_kmh ?? payload.wind_speed),
    wind_direction: payload.wind_direction ?? payload.wind_deg ?? null,
    humidity_pct: numberOrNull(payload.humidity_pct ?? payload.humidity),
    pressure_hpa: numberOrNull(payload.pressure_hpa ?? payload.pressure),
    precipitation_mm: numberOrNull(payload.precipitation_mm ?? payload.precipitation),
    timestamp_iso: payload.timestamp_iso ?? payload.timestamp ?? null,
    snapshot_time_iso: payload.snapshot_time_iso ?? null,
    snapshot_source: payload.snapshot_source ?? null,
    fetched_at_iso: payload.fetched_at_iso ?? null,
  };
}

export async function fetchCurrentWeather(input, lngArg, optionsArg) {
  const { lat, lng, timestamp, signal, force = false } = normaliseWeatherArgs(input, lngArg, optionsArg);
  const point = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    if (__DEV__) {
      console.log('[weather] request skipped', { lat, lng, reason: 'invalid coordinates' });
    }
    return null;
  }

  const ck = coordKey(point.lat, point.lng, 2);
  const cacheKey = `${ck}:${minuteBucket(timestamp)}`;
  if (!force) {
    const cached = weatherCache.get(cacheKey);
    if (cached) return cached;
  }

  const params = new URLSearchParams({
    lat: String(point.lat),
    lng: String(point.lng),
  });
  if (timestamp) params.set('timestamp', timestamp);

  if (__DEV__) {
    console.log('[weather] request', { lat: point.lat, lng: point.lng, timestamp: timestamp || null });
  }

  try {
    const result = await request(`/api/weather/current?${params.toString()}`, {
      method: 'GET',
      signal,
    });
    const normalised = normaliseWeatherResponse(result);
    if (__DEV__) {
      console.log('[weather] response keys/status', {
        status: normalised ? 'ok' : 'empty',
        keys: result && typeof result === 'object' ? Object.keys(result) : [],
      });
    }
    if (normalised) {
      weatherCache.set(cacheKey, normalised);
    }
    return normalised;
  } catch (error) {
    if (__DEV__) {
      console.log('[weather] response keys/status', {
        status: error?.status || 'error',
        keys: [],
      });
    }
    throw error;
  }
}

export function clearWeatherCache() {
  weatherCache.clear();
}

// Backward-compat helpers used by the live notification service. The original
// shape lives in siaraRiskApi.js — keep those functions as the canonical
// summarizers so callers don't need to reimplement them.
export { pickWeatherSummary } from './siaraRiskApi';
