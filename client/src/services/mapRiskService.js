// Map-layer endpoints: heatmap clusters, alert zones, zone profiles.
// All requests are bounds-keyed so dragging the map a few pixels does not re-fire,
// and accept an AbortController signal so the latest request wins.
//
// Endpoints covered:
//   GET /api/map/report-danger-heatmap?north&south&east&west&hours&zoom
//   GET /alerts                         (existing legacy mount used for zone overlay)
//   GET /api/zone-profiles
//   POST /api/risk/overlay              (bounds-based variant — re-exported from riskService)

import { request } from './api';
import { TtlCache, boundsKey } from '../utils/requestCache';

const HEATMAP_TTL_MS = 60_000;
const ALERT_ZONES_TTL_MS = 90_000;
const ZONE_PROFILES_TTL_MS = 10 * 60_000;

const heatmapCache = new TtlCache({ ttlMs: HEATMAP_TTL_MS, max: 24 });
const alertZonesCache = new TtlCache({ ttlMs: ALERT_ZONES_TTL_MS, max: 4 });
const zoneProfilesCache = new TtlCache({ ttlMs: ZONE_PROFILES_TTL_MS, max: 4 });

export async function fetchHeatmapClusters({
  bounds,
  hours = 24,
  zoom,
  signal,
  force = false,
} = {}) {
  if (!bounds) throw new Error('fetchHeatmapClusters: bounds required');
  const cacheKey = `${boundsKey(bounds, 2)}:${hours}`;
  if (!force) {
    const cached = heatmapCache.get(cacheKey);
    if (cached) return cached;
  }

  const params = new URLSearchParams({
    north: String(bounds.north),
    south: String(bounds.south),
    east: String(bounds.east),
    west: String(bounds.west),
    hours: String(hours),
    zoom: String(zoom ?? bounds.zoom ?? 10),
  });
  const result = await request(`/api/map/report-danger-heatmap?${params}`, {
    method: 'GET',
    signal,
  });
  heatmapCache.set(cacheKey, result);
  return result;
}

// Note: the existing backend mounts a legacy /alerts (no /api prefix) used by
// the map overlay. Kept as-is so we don't break the running app.
export async function fetchAlertZonesOverlay({ signal, force = false } = {}) {
  const cacheKey = 'alert-zones-overlay';
  if (!force) {
    const cached = alertZonesCache.get(cacheKey);
    if (cached) return cached;
  }
  const result = await request('/alerts', { method: 'GET', signal });
  alertZonesCache.set(cacheKey, result);
  return result;
}

// GET /api/zone-profiles — long-cached, used for static zone metadata.
export async function fetchZoneProfiles({ signal, force = false } = {}) {
  const cacheKey = 'zone-profiles';
  if (!force) {
    const cached = zoneProfilesCache.get(cacheKey);
    if (cached) return cached;
  }
  const result = await request('/api/zone-profiles', { method: 'GET', signal });
  zoneProfilesCache.set(cacheKey, result);
  return result;
}

export function clearMapRiskCaches() {
  heatmapCache.clear();
  alertZonesCache.clear();
  zoneProfilesCache.clear();
}

// Re-export so callers that mainly think in "map-layer" terms can find the
// overlay-by-bounds variant alongside its peers.
export { fetchRiskOverlay } from './riskService';
