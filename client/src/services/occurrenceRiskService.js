// EXPERIMENTAL — accident-occurrence prediction.
// These endpoints back a clearly-labeled Phase 2 beta section in the UI.
// Do NOT call them automatically from any always-on flow (MapScreen, SiaraMap,
// background tasks, etc). They should only fire from a Phase 2 beta surface
// that the user has explicitly opened.
//
// Endpoint contract on the SIARA backend:
//   POST /api/occurrence-risk/segment    rule-based, single point/segment
//   POST /api/risk/occurrence/predict    trained beta model, batch (body: { rows: [...] })
//   GET  /api/risk/occurrence/metadata   model metadata (versions, feature names, etc.)
//
// All requests:
//   - go through services/api.js#request (the shared auth/JSON wrapper)
//   - accept an AbortController signal so callers can drop stale requests
//   - are 60s-cached by rounded lat/lng + horizon (the metadata cache is longer)

import { request } from './api';
import { TtlCache, coordKey } from '../utils/requestCache';

const OCCURRENCE_TTL_MS = 60_000;
const METADATA_TTL_MS = 10 * 60_000;

const occurrenceCache = new TtlCache({ ttlMs: OCCURRENCE_TTL_MS, max: 32 });
const metadataCache = new TtlCache({ ttlMs: METADATA_TTL_MS, max: 2 });

export const OCCURRENCE_UNAVAILABLE_CODE = 'OCCURRENCE_UNAVAILABLE';
export const OCCURRENCE_INPUT_REQUIRED_CODE = 'OCCURRENCE_INPUT_REQUIRED';

// UI helper: short string suitable for the beta disclaimer.
export const OCCURRENCE_BETA_DISCLAIMER =
  'Beta — accident occurrence forecasting is experimental. Do not rely on this number for safety-critical decisions.';

function buildUnavailableError(originalError) {
  const err = new Error('Occurrence forecasting is not available on this backend.');
  err.code = OCCURRENCE_UNAVAILABLE_CODE;
  err.cause = originalError;
  return err;
}

function tagUnavailable(error) {
  if (error?.status === 404) throw buildUnavailableError(error);
  throw error;
}

function buildInputRequiredError(message) {
  const err = new Error(message);
  err.code = OCCURRENCE_INPUT_REQUIRED_CODE;
  err.local = true;
  return err;
}

function positiveInteger(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function buildKey(prefix, { lat, lng, timestamp, extra }) {
  return `${prefix}:${coordKey(lat, lng, 3) || 'na'}:${timestamp || 'now'}:${extra || ''}`;
}

// ─── Rule-based, per-segment ────────────────────────────────────────────────
// POST /api/occurrence-risk/segment
// Caller passes a single point (with optional segment_id) and gets back the
// rule-based occurrence likelihood for that segment.
export async function fetchOccurrenceRiskSegment({
  roadSegmentId,
  road_segment_id,
  lat,
  lng,
  segment_id,
  segmentId,
  timeBucket,
  time_bucket,
  weather,
  context,
  personalize = true,
  persist = true,
  timestamp,
  horizon_minutes,
  signal,
  force = false,
  ...rest
} = {}) {
  const validRoadSegmentId = positiveInteger(
    roadSegmentId ?? road_segment_id ?? segmentId ?? segment_id,
  );
  if (!validRoadSegmentId) {
    throw buildInputRequiredError('Beta model needs a road segment and time-window features before prediction.');
  }

  const bucket = timeBucket || time_bucket || timestamp || new Date().toISOString().slice(0, 13);
  const cacheKey = buildKey('occ-segment', {
    lat: validRoadSegmentId,
    lng: 0,
    timestamp: bucket,
    extra: `${horizon_minutes || ''}`,
  });
  if (!force) {
    const cached = occurrenceCache.get(cacheKey);
    if (cached) return cached;
  }

  const body = {
    roadSegmentId: validRoadSegmentId,
    timeBucket: bucket,
    ...(weather ? { weather } : {}),
    ...(context ? { context } : {}),
    personalize: Boolean(personalize),
    persist: Boolean(persist),
    ...(horizon_minutes != null ? { horizon_minutes } : {}),
    ...rest,
  };

  try {
    const result = await request('/api/occurrence-risk/segment', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
    occurrenceCache.set(cacheKey, result);
    return result;
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    tagUnavailable(error);
  }
}

// ─── Trained beta model, batch ──────────────────────────────────────────────
// POST /api/risk/occurrence/predict   body: { rows: [{...}, ...] }
// Each row should at minimum carry lat/lng; backend accepts extra fields like
// timestamp, horizon_minutes, weather, segment_id. Returns predictions in
// row order under `predictions` (or `results`, depending on backend version).
export async function predictOccurrenceRiskBatch({
  rows,
  signal,
  force = false,
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('predictOccurrenceRiskBatch: rows[] is required');
  }

  const normalisedRows = rows
    .map((row) => {
      const lat = Number(row?.lat ?? row?.latitude);
      const lng = Number(row?.lng ?? row?.lon ?? row?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { ...row, lat, lng };
    })
    .filter(Boolean);

  if (normalisedRows.length === 0) {
    throw new Error('predictOccurrenceRiskBatch: no rows with valid coordinates');
  }

  // Stable key so re-ordering identical rows still hits cache.
  const cacheKey = `occ-predict:${normalisedRows
    .map((row) => `${row.lat.toFixed(3)},${row.lng.toFixed(3)}@${row.timestamp || 'now'}#${row.horizon_minutes || ''}`)
    .sort()
    .join('|')}`;

  if (!force) {
    const cached = occurrenceCache.get(cacheKey);
    if (cached) return cached;
  }

  try {
    const result = await request('/api/risk/occurrence/predict', {
      method: 'POST',
      body: JSON.stringify({ rows: normalisedRows }),
      signal,
    });
    occurrenceCache.set(cacheKey, result);
    return result;
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    tagUnavailable(error);
  }
}

// Convenience wrapper around predictOccurrenceRiskBatch for a single point.
export async function predictOccurrenceRiskPoint({
  lat,
  lng,
  timestamp,
  horizon_minutes,
  signal,
  force = false,
  ...rest
} = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error('predictOccurrenceRiskPoint: invalid coordinates');
  }
  const row = {
    lat: Number(lat),
    lng: Number(lng),
    ...(timestamp ? { timestamp } : {}),
    ...(horizon_minutes != null ? { horizon_minutes } : {}),
    ...rest,
  };
  const response = await predictOccurrenceRiskBatch({ rows: [row], signal, force });
  // Normalize: return the first prediction so single-point callers don't have
  // to unwrap. Backend may use `predictions`, `results`, or `data`.
  const list =
    (Array.isArray(response?.predictions) && response.predictions)
    || (Array.isArray(response?.results) && response.results)
    || (Array.isArray(response?.data) && response.data)
    || [];
  return list[0] ?? response;
}

// ─── Model metadata ─────────────────────────────────────────────────────────
// GET /api/risk/occurrence/metadata
export async function fetchOccurrenceMetadata({ signal, force = false } = {}) {
  const cacheKey = 'occ-metadata';
  if (!force) {
    const cached = metadataCache.get(cacheKey);
    if (cached) return cached;
  }
  try {
    const result = await request('/api/risk/occurrence/metadata', {
      method: 'GET',
      signal,
    });
    metadataCache.set(cacheKey, result);
    return result;
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    tagUnavailable(error);
  }
}

export function clearOccurrenceCaches() {
  occurrenceCache.clear();
  metadataCache.clear();
}
