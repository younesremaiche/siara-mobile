// SIARA risk-related endpoints routed through the central request wrapper.
// Adds:
//   - AbortController support so stale calls do not overwrite fresher ones
//   - a small TTL cache keyed by rounded lat/lng + minute-bucketed timestamp
//   - jitter de-dup so tiny GPS drift does not re-fire /api/risk/current
//
// Endpoints covered:
//   POST /api/risk/current
//   POST /api/risk/overlay
//   POST /api/risk/explain
//   POST /api/risk/nearby-zones
//   GET  /api/risk/forecast24h
//   POST /api/predictions/explain-risk

import { request } from './api';
import {
  TtlCache,
  coordKey,
  hasMovedBeyondJitter,
  isAbortError,
} from '../utils/requestCache';

const CURRENT_RISK_TTL_MS = 30_000;
const FORECAST_TTL_MS = 5 * 60_000;
const OVERLAY_TTL_MS = 60_000;
const NEARBY_ZONES_TTL_MS = 90_000;
const EXPLAIN_TTL_MS = 10 * 60_000;

const currentRiskCache = new TtlCache({ ttlMs: CURRENT_RISK_TTL_MS, max: 16 });
const forecastCache = new TtlCache({ ttlMs: FORECAST_TTL_MS, max: 16 });
const overlayCache = new TtlCache({ ttlMs: OVERLAY_TTL_MS, max: 32 });
const nearbyZonesCache = new TtlCache({ ttlMs: NEARBY_ZONES_TTL_MS, max: 24 });
const explainCache = new TtlCache({ ttlMs: EXPLAIN_TTL_MS, max: 64 });

let lastCurrentRiskPoint = null;

function minuteBucket(timestampIso) {
  if (!timestampIso) return 'now';
  const date = new Date(timestampIso);
  if (Number.isNaN(date.getTime())) return 'now';
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}-${date.getUTCMinutes()}`;
}

function buildCurrentRiskKey({ lat, lng, timestamp }) {
  const ck = coordKey(lat, lng, 3);
  if (!ck) return null;
  return `${ck}:${minuteBucket(timestamp)}`;
}

function isAbortable(error) {
  return isAbortError(error);
}

// POST /api/risk/current with GPS jitter de-dup and minute-bucketed cache.
// Pass { force: true } to bypass cache/jitter (e.g. user-tapped Refresh).
export async function fetchCurrentRisk({
  lat,
  lng,
  timestamp,
  signal,
  force = false,
  minJitterMeters = 80,
} = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error('fetchCurrentRisk: invalid coordinates');
  }

  const point = { lat: Number(lat), lng: Number(lng) };
  const ts = timestamp || new Date().toISOString();
  const cacheKey = buildCurrentRiskKey({ lat: point.lat, lng: point.lng, timestamp: ts });

  if (!force) {
    const cached = currentRiskCache.get(cacheKey);
    if (cached) return cached;

    if (lastCurrentRiskPoint && !hasMovedBeyondJitter(lastCurrentRiskPoint, point, minJitterMeters)) {
      // Re-use the most recent cached result for the previous point if still warm.
      const prevKey = buildCurrentRiskKey({
        lat: lastCurrentRiskPoint.lat,
        lng: lastCurrentRiskPoint.lng,
        timestamp: ts,
      });
      const prevCached = currentRiskCache.get(prevKey);
      if (prevCached) return prevCached;
    }
  }

  try {
    const result = await request('/api/risk/current', {
      method: 'POST',
      body: JSON.stringify({ lat: point.lat, lng: point.lng, timestamp: ts }),
      signal,
    });
    currentRiskCache.set(cacheKey, result);
    lastCurrentRiskPoint = point;
    return result;
  } catch (error) {
    if (isAbortable(error)) throw error;
    throw error;
  }
}

export function invalidateCurrentRiskCache() {
  currentRiskCache.clear();
  lastCurrentRiskPoint = null;
}

// POST /api/risk/overlay — risk colouring for a batch of segments.
// Rows are sorted + hashed so re-ordering the same set still hits cache.
export async function fetchRiskOverlay({ timestamp, rows = [], signal, force = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return { results: [] };

  const normalizedRows = rows
    .map((row) => ({
      segment_id: String(row?.segment_id ?? row?.id ?? ''),
      lat: Number(row?.lat ?? row?.latitude),
      lng: Number(row?.lng ?? row?.longitude),
    }))
    .filter((row) => row.segment_id && Number.isFinite(row.lat) && Number.isFinite(row.lng));

  if (normalizedRows.length === 0) return { results: [] };

  const ts = timestamp || new Date().toISOString();
  const cacheKey = `${minuteBucket(ts)}:${normalizedRows
    .map((row) => `${row.segment_id}@${row.lat.toFixed(3)},${row.lng.toFixed(3)}`)
    .sort()
    .join('|')}`;

  if (!force) {
    const cached = overlayCache.get(cacheKey);
    if (cached) return cached;
  }

  const result = await request('/api/risk/overlay', {
    method: 'POST',
    body: JSON.stringify({ timestamp: ts, rows: normalizedRows }),
    signal,
  });
  overlayCache.set(cacheKey, result);
  return result;
}

// POST /api/risk/explain — per-segment SHAP/XAI explanation.
export async function fetchRiskExplanation({
  segment_id,
  lat,
  lng,
  timestamp,
  top_k = 8,
  signal,
} = {}) {
  if (!segment_id) throw new Error('fetchRiskExplanation: segment_id is required');

  const ts = timestamp || new Date().toISOString();
  const ck = coordKey(lat, lng, 3);
  const cacheKey = `${segment_id}:${ck || 'na'}:${minuteBucket(ts)}:${top_k}`;
  const cached = explainCache.get(cacheKey);
  if (cached) return cached;

  const body = { segment_id: String(segment_id), timestamp: ts, top_k };
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    body.lat = Number(lat);
    body.lng = Number(lng);
  }

  const result = await request('/api/risk/explain', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
  explainCache.set(cacheKey, result);
  return result;
}

// POST /api/risk/nearby-zones — uses rounded lat/lng key so small moves reuse the result.
export async function fetchNearbyZones({
  lat,
  lng,
  radius_km,
  max_destinations,
  timestamp,
  signal,
  force = false,
  ...rest
} = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error('fetchNearbyZones: invalid coordinates');
  }

  const ck = coordKey(lat, lng, 3);
  const ts = timestamp || new Date().toISOString();
  const cacheKey = `${ck}:${radius_km || ''}:${max_destinations || ''}:${minuteBucket(ts)}`;

  if (!force) {
    const cached = nearbyZonesCache.get(cacheKey);
    if (cached) return cached;
  }

  const payload = {
    lat: Number(lat),
    lng: Number(lng),
    timestamp: ts,
    ...(radius_km != null ? { radius_km } : {}),
    ...(max_destinations != null ? { max_destinations } : {}),
    ...rest,
  };

  const result = await request('/api/risk/nearby-zones', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
  nearbyZonesCache.set(cacheKey, result);
  return result;
}

function normaliseForecastArgs(input, lngArg, optionsArg = {}) {
  if (input && typeof input === 'object') return input;
  const options = optionsArg && typeof optionsArg === 'object'
    ? optionsArg
    : { timestamp: optionsArg };
  return { ...options, lat: input, lng: lngArg };
}

function normaliseForecastPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const points = Array.isArray(payload.points) ? payload.points : [];
  const nowPoint = payload.now_point && typeof payload.now_point === 'object'
    ? payload.now_point
    : null;
  return {
    ...payload,
    now_point: nowPoint,
    points,
  };
}

// GET /api/risk/forecast24h?lat&lng&lon&timestamp
export async function fetchRiskForecast24h(input, lngArg, optionsArg) {
  const { lat, lng, timestamp, signal, force = false } = normaliseForecastArgs(input, lngArg, optionsArg);
  const point = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    if (__DEV__) {
      console.log('[forecast24h] request skipped', { lat, lng, reason: 'invalid coordinates' });
    }
    return { now_point: null, points: [] };
  }

  const ck = coordKey(point.lat, point.lng, 2);
  const ts = timestamp || new Date().toISOString();
  const cacheKey = `${ck}:${minuteBucket(ts)}`;
  if (!force) {
    const cached = forecastCache.get(cacheKey);
    if (cached) return cached;
  }

  const query = new URLSearchParams({
    lat: String(point.lat),
    lng: String(point.lng),
    lon: String(point.lng),
    timestamp: ts,
  }).toString();

  if (__DEV__) {
    console.log('[forecast24h] request', { lat: point.lat, lng: point.lng, timestamp: ts });
  }

  try {
    const result = await request(`/api/risk/forecast24h?${query}`, { method: 'GET', signal });
    const normalised = normaliseForecastPayload(result);
    const pointsLength = normalised?.points?.length || 0;
    const hasNowPoint = Boolean(normalised?.now_point);
    if (__DEV__) {
      console.log('[forecast24h] response', { hasNowPoint, pointsLength });
    }
    if (normalised && (hasNowPoint || pointsLength > 0)) {
      forecastCache.set(cacheKey, normalised);
    }
    return normalised || { now_point: null, points: [] };
  } catch (error) {
    if (__DEV__) {
      console.log('[forecast24h] response', {
        hasNowPoint: false,
        pointsLength: 0,
        status: error?.status || 'error',
      });
    }
    throw error;
  }
}

// POST /api/predictions/explain-risk — concise "Why?" explanation.
// Caller passes the most recent risk + weather payloads so the backend can
// produce a focused explanation without re-running the model.
export async function explainRisk({
  risk,
  weather,
  xai,
  rawPrediction,
  lat,
  lng,
  timestamp,
  signal,
} = {}) {
  const payload = {
    ...(risk ? { risk } : {}),
    ...(weather ? { weather } : {}),
    ...(xai ? { xai } : {}),
    ...(rawPrediction ? { rawPrediction } : {}),
    ...(Number.isFinite(Number(lat)) ? { lat: Number(lat) } : {}),
    ...(Number.isFinite(Number(lng)) ? { lng: Number(lng) } : {}),
    ...(timestamp ? { timestamp } : {}),
  };

  return request('/api/predictions/explain-risk', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export function clearRiskCaches() {
  currentRiskCache.clear();
  forecastCache.clear();
  overlayCache.clear();
  nearbyZonesCache.clear();
  explainCache.clear();
  lastCurrentRiskPoint = null;
}
