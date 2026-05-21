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

export async function fetchCurrentWeather({ lat, lng, timestamp, signal, force = false } = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error('fetchCurrentWeather: invalid coordinates');
  }

  const ck = coordKey(lat, lng, 2);
  const cacheKey = `${ck}:${minuteBucket(timestamp)}`;
  if (!force) {
    const cached = weatherCache.get(cacheKey);
    if (cached) return cached;
  }

  const params = new URLSearchParams({
    lat: String(Number(lat)),
    lng: String(Number(lng)),
  });
  if (timestamp) params.set('timestamp', timestamp);

  const result = await request(`/api/weather/current?${params.toString()}`, {
    method: 'GET',
    signal,
  });
  weatherCache.set(cacheKey, result);
  return result;
}

export function clearWeatherCache() {
  weatherCache.clear();
}

// Backward-compat helpers used by the live notification service. The original
// shape lives in siaraRiskApi.js — keep those functions as the canonical
// summarizers so callers don't need to reimplement them.
export { pickWeatherSummary } from './siaraRiskApi';
