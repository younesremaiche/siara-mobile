import { request } from './api';
import { NOMINATIM_URL } from '../utils/mapHelpers';
import { normalizeNominatimResult } from '../utils/routeGuidance';

function friendlyRouteError(error) {
  const responseError = String(error?.response?.error || error?.response?.message || '').trim();
  const message = String(error?.message || '').trim();
  const raw = responseError || message;

  if (!raw) {
    return 'Route guidance is unavailable right now. Please try again in a moment.';
  }

  if (/osrm|route danger scoring failed|failed to build route alternatives/i.test(raw)) {
    return 'Route guidance is temporarily unavailable. Please try again shortly.';
  }

  if (/origin and destination/i.test(raw)) {
    return 'Choose a valid origin and destination to request guidance.';
  }

  return raw.replace(/^API \d+:\s*/i, '');
}

export async function searchGuidanceDestinations(query, options = {}) {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 2) {
    return [];
  }

  const limit = Math.max(1, Math.min(Number(options.limit) || 5, 8));
  const url = `${NOMINATIM_URL}?format=json&addressdetails=1&limit=${limit}&q=${encodeURIComponent(trimmed)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': 'SiaraMobile/1.0',
    },
  });

  if (!response.ok) {
    throw new Error('Destination search is unavailable right now.');
  }

  const payload = await response.json();
  return (Array.isArray(payload) ? payload : [])
    .map(normalizeNominatimResult)
    .filter(Boolean);
}

export async function requestRouteGuidance({
  origin,
  destination,
  timestamp,
  sample_count,
  max_alternatives,
}) {
  try {
    return await request('/api/risk/route', {
      method: 'POST',
      body: JSON.stringify({
        origin: {
          lat: origin?.lat,
          lng: origin?.lng,
        },
        destination: {
          name: destination?.name,
          lat: destination?.lat,
          lng: destination?.lng,
        },
        timestamp,
        sample_count,
        max_alternatives,
      }),
    });
  } catch (error) {
    throw new Error(friendlyRouteError(error));
  }
}
