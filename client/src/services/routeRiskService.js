// Route-level risk endpoints used by the guidance flow and turn-by-turn navigation.
//
// Endpoints covered:
//   POST /api/risk/route                    (re-exported via routeGuidanceService.requestRouteGuidance — kept here as a thin wrapper for parity with the task brief)
//   POST /api/risk/route/explain            ("Why this route?")
//   POST /api/risk/route/departure-options  ("Best time to leave")
//   POST /api/navigation/route-alerts       (look-ahead alerts during active navigation)
//
// Caching strategy:
//   - explain / departure-options key on route_id (or hash of origin+destination+timestamp)
//   - navigation/route-alerts is NOT cached — alerts must reflect live position
//   - all calls accept signal so stale requests can be aborted when user moves

import { request } from './api';
import { TtlCache, coordKey } from '../utils/requestCache';
import { requestRouteGuidance as requestRouteGuidanceImpl } from './routeGuidanceService';

const EXPLAIN_TTL_MS = 5 * 60_000;
const DEPARTURE_TTL_MS = 5 * 60_000;

const routeExplainCache = new TtlCache({ ttlMs: EXPLAIN_TTL_MS, max: 16 });
const departureCache = new TtlCache({ ttlMs: DEPARTURE_TTL_MS, max: 16 });

function hashRoute({ origin, destination, timestamp, route_id }) {
  if (route_id) return `id:${route_id}`;
  const oKey = coordKey(origin?.lat, origin?.lng, 3);
  const dKey = coordKey(destination?.lat, destination?.lng, 3);
  return `${oKey || 'na'}->${dKey || 'na'}@${timestamp || 'now'}`;
}

// POST /api/risk/route — thin wrapper around the retrying impl in routeGuidanceService.
export async function requestRouteRisk(payload) {
  return requestRouteGuidanceImpl(payload);
}

// POST /api/risk/route/explain — explain why this route was recommended.
export async function explainRouteRisk({
  route,
  route_id,
  origin,
  destination,
  timestamp,
  signal,
  force = false,
} = {}) {
  const cacheKey = hashRoute({
    origin: origin || route?.origin,
    destination: destination || route?.destination,
    timestamp,
    route_id: route_id || route?.route_id || route?.route_type,
  });

  if (!force) {
    const cached = routeExplainCache.get(cacheKey);
    if (cached) return cached;
  }

  const body = {
    ...(route ? { route } : {}),
    ...(route_id ? { route_id } : {}),
    ...(origin ? { origin } : {}),
    ...(destination ? { destination } : {}),
    ...(timestamp ? { timestamp } : {}),
  };

  const result = await request('/api/risk/route/explain', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
  routeExplainCache.set(cacheKey, result);
  return result;
}

// POST /api/risk/route/departure-options — "Best time to leave" card.
export async function fetchDepartureOptions({
  origin,
  destination,
  baseline_timestamp,
  window_hours,
  step_minutes,
  signal,
  force = false,
} = {}) {
  if (!origin || !destination) {
    throw new Error('fetchDepartureOptions: origin and destination required');
  }

  const cacheKey = `${hashRoute({ origin, destination, timestamp: baseline_timestamp })}:${window_hours || ''}:${step_minutes || ''}`;
  if (!force) {
    const cached = departureCache.get(cacheKey);
    if (cached) return cached;
  }

  const body = {
    origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
    destination: {
      ...(destination.name ? { name: destination.name } : {}),
      lat: Number(destination.lat),
      lng: Number(destination.lng),
    },
    ...(baseline_timestamp ? { baseline_timestamp } : {}),
    ...(window_hours != null ? { window_hours } : {}),
    ...(step_minutes != null ? { step_minutes } : {}),
  };

  const result = await request('/api/risk/route/departure-options', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
  departureCache.set(cacheKey, result);
  return result;
}

// Normalise an arbitrary route path into the [{lat,lng}, ...] shape the
// backend's routeSnapshot validator expects. Accepts either `[[lat,lng], ...]`
// or `[{lat,lng}, ...]` and filters out malformed points.
function normaliseRoutePath(path) {
  if (!Array.isArray(path)) return [];
  return path
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) {
        const lat = Number(point[0]);
        const lng = Number(point[1]);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      }
      if (point && typeof point === 'object') {
        const lat = Number(point.lat ?? point.latitude);
        const lng = Number(point.lng ?? point.lon ?? point.longitude);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      }
      return null;
    })
    .filter(Boolean);
}

// POST /api/navigation/route-alerts — look-ahead alerts.
// Caller dedupes by alert id to avoid showing the same notice twice.
// Backend requires `routeSnapshot.path` with ≥ 2 valid points; we surface
// that requirement up-front so callers can bail without burning a request.
export async function fetchNavigationRouteAlerts({
  route,
  route_id,
  position,
  heading_deg,
  speed_kmh,
  look_ahead_m = 2000,
  timestamp,
  exclude_ids,
  signal,
} = {}) {
  if (!position) {
    throw new Error('fetchNavigationRouteAlerts: position required');
  }

  const path = normaliseRoutePath(route?.path);
  if (path.length < 2) {
    const err = new Error('route path with at least 2 points is required');
    err.code = 'ROUTE_PATH_REQUIRED';
    throw err;
  }

  const routeSnapshot = {
    path,
    ...(route_id || route?.route_id ? { route_id: String(route_id || route?.route_id) } : {}),
    ...(route?.route_type ? { route_type: route.route_type } : {}),
    ...(route?.distance_km != null ? { distance_km: route.distance_km } : {}),
    ...(route?.eta_min != null ? { eta_min: route.eta_min } : {}),
    ...(Array.isArray(route?.segments) ? { segments: route.segments } : {}),
  };

  const body = {
    routeSnapshot,
    position: {
      lat: Number(position.lat ?? position.latitude),
      lng: Number(position.lng ?? position.longitude),
    },
    ...(Number.isFinite(Number(heading_deg)) ? { heading_deg: Number(heading_deg) } : {}),
    ...(Number.isFinite(Number(speed_kmh)) ? { speed_kmh: Number(speed_kmh) } : {}),
    look_ahead_m: Number(look_ahead_m) || 2000,
    ...(timestamp ? { timestamp } : {}),
    ...(Array.isArray(exclude_ids) && exclude_ids.length ? { exclude_ids } : {}),
  };

  return request('/api/navigation/route-alerts', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
}

export function clearRouteRiskCaches() {
  routeExplainCache.clear();
  departureCache.clear();
}
