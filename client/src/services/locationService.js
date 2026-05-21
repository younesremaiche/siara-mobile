// Location helpers — wraps the SIARA backend reverse-geocode endpoint
// (/api/location/reverse) and falls back to Nominatim when the backend is
// unavailable. Also exposes a small de-dup cache so reverse lookups during
// active navigation don't hammer either provider.

import { request } from './api';
import { NOMINATIM_URL } from '../utils/mapHelpers';
import { TtlCache, coordKey } from '../utils/requestCache';

const REVERSE_TTL_MS = 10 * 60_000;
const reverseCache = new TtlCache({ ttlMs: REVERSE_TTL_MS, max: 64 });

function buildBackendQuery({ lat, lng, lang }) {
  const params = new URLSearchParams({
    lat: String(Number(lat)),
    lng: String(Number(lng)),
  });
  if (lang) params.set('lang', lang);
  return params.toString();
}

async function tryBackendReverse({ lat, lng, lang, signal }) {
  try {
    return await request(`/api/location/reverse?${buildBackendQuery({ lat, lng, lang })}`, {
      method: 'GET',
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
}

async function tryNominatimReverse({ lat, lng, lang, signal }) {
  const url = `${NOMINATIM_URL.replace('/search', '/reverse')}?format=json&lat=${lat}&lon=${lng}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': lang || 'en',
      'User-Agent': 'SiaraMobile/1.0',
    },
    signal,
  });
  if (!response.ok) throw new Error(`Nominatim reverse failed (${response.status})`);
  return response.json();
}

// Reverse-geocodes a coordinate. Prefers the SIARA backend; falls back to
// public Nominatim if the backend errors or returns nothing. Cached for 10 min.
export async function reverseGeocode({ lat, lng, lang = 'en', signal, force = false } = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error('reverseGeocode: invalid coordinates');
  }

  const cacheKey = `${coordKey(lat, lng, 4)}:${lang}`;
  if (!force) {
    const cached = reverseCache.get(cacheKey);
    if (cached) return cached;
  }

  const backendResult = await tryBackendReverse({ lat, lng, lang, signal });
  if (backendResult && (backendResult.label || backendResult.address || backendResult.display_name)) {
    reverseCache.set(cacheKey, backendResult);
    return backendResult;
  }

  const fallback = await tryNominatimReverse({ lat, lng, lang, signal });
  reverseCache.set(cacheKey, fallback);
  return fallback;
}

// Convenience: pull the most "human" short label out of either provider's response.
export function pickLocationLabel(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.label) return String(payload.label);
  const address = payload.address || payload.location || {};
  return (
    address.city
    || address.town
    || address.village
    || address.suburb
    || address.county
    || address.state
    || payload.display_name
    || null
  );
}

export function clearReverseGeocodeCache() {
  reverseCache.clear();
}
