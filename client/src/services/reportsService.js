import { request as apiRequest } from './api';

export const PAGE_SIZE = 10;
export const DEFAULT_RADIUS_KM = 25;
export const REPORT_FEEDS = ['latest', 'nearby', 'verified', 'following'];
export const REPORT_SORTS = ['recent', 'severity'];
export const INCIDENT_TYPES = ['accident', 'traffic', 'danger', 'weather', 'roadworks', 'other'];
export const REPORT_SEVERITIES = ['low', 'medium', 'high'];

function ensureNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeSeverity(rawSeverity, rawHint) {
  const severity = String(rawSeverity || '').trim().toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(severity)) {
    return severity;
  }

  const hint = Number(rawHint);
  if (hint >= 4) return 'critical';
  if (hint >= 3) return 'high';
  if (hint >= 2) return 'medium';
  return 'low';
}

function normalizeMedia(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((mediaItem, index) => ({
      id: mediaItem?.id || `media-${index}`,
      mediaType: mediaItem?.mediaType || mediaItem?.media_type || 'image',
      url: mediaItem?.url || '',
      uploadedAt: mediaItem?.uploadedAt || mediaItem?.uploaded_at || null,
    }))
    .filter((mediaItem) => mediaItem.url);
}

function normalizeReporter(item) {
  const author = item?.reportedBy || item?.reported_by || null;
  if (!author && !item?.reportedById && !item?.reported_by_id) {
    return null;
  }

  return {
    id:
      author?.id
      ?? item?.reportedById
      ?? item?.reported_by_id
      ?? null,
    name: author?.name || item?.authorName || item?.reporterName || 'Citizen',
  };
}

export function formatRelativeTime(value) {
  if (!value) return 'Unknown time';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function normalizeReport(item) {
  const locationLat = ensureNumber(item?.location?.lat ?? item?.lat);
  const locationLng = ensureNumber(item?.location?.lng ?? item?.lng);
  const severityHint = ensureNumber(item?.severityHint ?? item?.severity_hint);
  const occurredAt = item?.occurredAt || item?.occurred_at || null;
  const createdAt = item?.createdAt || item?.created_at || null;
  const normalizedSeverity = normalizeSeverity(item?.severity, severityHint);

  return {
    id: String(item?.id || createdAt || Math.random()),
    incidentType: String(item?.incidentType || item?.incident_type || 'other').trim().toLowerCase() || 'other',
    title: String(item?.title || '').trim() || 'Untitled report',
    description: String(item?.description || '').trim(),
    status: String(item?.status || 'pending').trim().toLowerCase() || 'pending',
    severityHint,
    severity: normalizedSeverity,
    locationLabel: String(item?.locationLabel || item?.location?.label || item?.location_label || '').trim(),
    location:
      Number.isFinite(locationLat) && Number.isFinite(locationLng)
        ? { lat: locationLat, lng: locationLng }
        : null,
    occurredAt,
    createdAt,
    updatedAt: item?.updatedAt || item?.updated_at || null,
    distanceKm:
      item?.distanceKm == null
        ? null
        : Number(Number(item.distanceKm).toFixed(1)),
    reportedBy: normalizeReporter(item),
    media: normalizeMedia(item?.media),
    relativeTime: formatRelativeTime(occurredAt || createdAt),
  };
}

function normalizeReportListResponse(payload, params = {}) {
  return {
    reports: Array.isArray(payload?.reports) ? payload.reports.map(normalizeReport) : [],
    pagination: payload?.pagination || {
      limit: params.limit || PAGE_SIZE,
      offset: params.offset || 0,
      hasMore: false,
      returned: 0,
    },
    meta: payload?.meta || {
      feed: params.feed || 'latest',
      sort: params.sort || 'recent',
      followingSupported: true,
    },
  };
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  [
    'limit',
    'offset',
    'feed',
    'sort',
    'lat',
    'lng',
    'radiusKm',
  ].forEach((key) => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      query.append(key, String(params[key]));
    }
  });

  return query.toString();
}

function inferMimeType(uri) {
  const normalized = String(uri || '').toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function inferFileName(asset, index) {
  const existingName = String(asset?.fileName || asset?.name || '').trim();
  if (existingName) return existingName;

  const uri = String(asset?.uri || '');
  const uriName = uri.split('/').pop();
  if (uriName) return uriName;

  return `report-image-${index + 1}.jpg`;
}

function buildCreatePayload(data) {
  return {
    incidentType: data.incidentType,
    title: data.title,
    description: data.description || '',
    severity: data.severity,
    occurredAt: data.occurredAt || undefined,
    location: {
      lat: data.location?.lat,
      lng: data.location?.lng,
      label: data.location?.label || '',
    },
  };
}

export async function listReports(params = {}) {
  const query = buildQuery(params);
  const payload = await apiRequest(`/api/reports${query ? `?${query}` : ''}`, {
    method: 'GET',
    signal: params.signal,
  });

  return normalizeReportListResponse(payload, params);
}

export async function getReport(reportId) {
  const payload = await apiRequest(`/api/reports/${reportId}`, {
    method: 'GET',
  });

  return normalizeReport(payload?.report);
}

export async function createReport(data) {
  const payload = await apiRequest('/api/reports', {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify(buildCreatePayload(data)),
  });

  return normalizeReport(payload?.report);
}

export async function uploadReportMedia(reportId, files = []) {
  const formData = new FormData();

  files.forEach((asset, index) => {
    if (!asset?.uri) return;

    const mimeType =
      typeof asset?.mimeType === 'string' && asset.mimeType.includes('/')
        ? asset.mimeType
        : typeof asset?.type === 'string' && asset.type.includes('/')
          ? asset.type
          : inferMimeType(asset.uri);

    formData.append('images', {
      uri: asset.uri,
      name: inferFileName(asset, index),
      type: mimeType,
    });
  });

  const payload = await apiRequest(`/api/reports/${reportId}/media`, {
    method: 'POST',
    withAuth: true,
    body: formData,
  });

  return normalizeReport(payload?.report);
}
