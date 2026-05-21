// Lightweight client-side helpers for SIARA risk/map services.
// Three concerns kept deliberately small so individual services can compose them:
//   - rounded coordinate / bounds keys to dedupe near-identical requests
//   - jitter check to avoid re-firing on tiny GPS noise
//   - TTL cache with optional max size (LRU-ish eviction)

const EARTH_RADIUS_M = 6371000;

export function roundCoord(value, decimals = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** decimals;
  return Math.round(numeric * factor) / factor;
}

export function coordKey(lat, lng, decimals = 3) {
  const rLat = roundCoord(lat, decimals);
  const rLng = roundCoord(lng, decimals);
  if (rLat == null || rLng == null) return null;
  return `${rLat.toFixed(decimals)}:${rLng.toFixed(decimals)}`;
}

export function boundsKey(bounds, decimals = 2) {
  if (!bounds) return null;
  const north = roundCoord(bounds.north, decimals);
  const south = roundCoord(bounds.south, decimals);
  const east = roundCoord(bounds.east, decimals);
  const west = roundCoord(bounds.west, decimals);
  if ([north, south, east, west].some((value) => value == null)) return null;
  const zoom = Number.isFinite(Number(bounds.zoom)) ? Math.round(Number(bounds.zoom)) : 'z';
  return `${north}:${south}:${east}:${west}:${zoom}`;
}

export function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const lat1 = Number(a.lat ?? a.latitude);
  const lng1 = Number(a.lng ?? a.longitude);
  const lat2 = Number(b.lat ?? b.latitude);
  const lng2 = Number(b.lng ?? b.longitude);
  if ([lat1, lng1, lat2, lng2].some((value) => !Number.isFinite(value))) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Returns true when prev -> next is large enough to justify re-firing.
// 80m matches a typical urban-street GPS noise floor without ignoring real movement.
export function hasMovedBeyondJitter(prev, next, minMeters = 80) {
  if (!prev) return Boolean(next);
  if (!next) return false;
  return distanceMeters(prev, next) >= minMeters;
}

export class TtlCache {
  constructor({ ttlMs = 60_000, max = 64 } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.store = new Map();
  }

  get(key) {
    if (key == null) return null;
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.t > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    // Refresh LRU order.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.v;
  }

  set(key, value) {
    if (key == null) return;
    this.store.set(key, { v: value, t: Date.now() });
    while (this.store.size > this.max) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
  }

  invalidate(key) {
    if (key == null) return;
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

// Coalesces concurrent identical requests by key.
// runner: (key, signal) => Promise<value>
export function createInflightCoalescer() {
  const inflight = new Map();
  return async function coalesce(key, runner, { signal } = {}) {
    if (key == null) return runner(null, signal);
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = runner(key, signal).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  };
}

// Best-effort safe abort.
export function abortSilently(controller, reason) {
  if (!controller || controller.signal?.aborted) return;
  try {
    controller.abort(reason);
  } catch {
    try { controller.abort(); } catch { /* ignore */ }
  }
}

export function isAbortError(error) {
  return Boolean(error) && (error.name === 'AbortError' || error.code === 'ABORT_ERR');
}
