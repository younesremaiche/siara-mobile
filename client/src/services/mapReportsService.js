import {
  DEFAULT_RADIUS_KM as DEFAULT_REPORT_RADIUS_KM,
  listReports,
  normalizeReport,
  formatRelativeTime,
} from './reportsService';

export const DEFAULT_REPORT_LIMIT = 40;

export { DEFAULT_REPORT_RADIUS_KM, formatRelativeTime, normalizeReport };

function hasValidCoords(report) {
  return Number.isFinite(Number(report?.location?.lat)) && Number.isFinite(Number(report?.location?.lng));
}

export async function fetchNearbyReports({
  lat,
  lng,
  radiusKm = DEFAULT_REPORT_RADIUS_KM,
  limit = DEFAULT_REPORT_LIMIT,
  signal,
} = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return { reports: [], pagination: null, meta: null };
  }

  const payload = await listReports({
    feed: 'nearby',
    lat,
    lng,
    radiusKm,
    limit,
    signal,
  });

  return {
    reports: Array.isArray(payload?.reports) ? payload.reports.filter(hasValidCoords) : [],
    pagination: payload?.pagination || null,
    meta: payload?.meta || null,
  };
}
