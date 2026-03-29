import { request as apiRequest } from './api';

const DEFAULT_FILTER = 'all';
const DEFAULT_SORT_FIELD = 'confidence';
const DEFAULT_SORT_DIR = 'desc';
const ALLOWED_FILTERS = new Set(['all', 'pending', 'ai-flagged', 'community', 'merged', 'archived']);
const ALLOWED_SORT_FIELDS = new Set([
  'id',
  'incidentType',
  'location',
  'severity',
  'confidence',
  'reporterScore',
  'createdAt',
  'status',
]);
const ALLOWED_CONFIDENCE_STATUSES = new Set(['completed', 'pending', 'failed']);

function normalizeApiError(error, fallbackMessage) {
  const nextError = new Error(
    error?.response?.message
      || error?.response?.error
      || error?.message
      || fallbackMessage
  );

  nextError.status = error?.status;
  nextError.code = error?.code;
  nextError.response = error?.response;

  return nextError;
}

function ensureNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function ensureNullableNumber(value, digits = null) {
  if (value == null || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (digits == null) {
    return numeric;
  }

  return Number(numeric.toFixed(digits));
}

function normalizeConfidenceStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_CONFIDENCE_STATUSES.has(normalized) ? normalized : null;
}

function normalizeCounts(counts) {
  return {
    all: ensureNumber(counts?.all, 0),
    pending: ensureNumber(counts?.pending, 0),
    'ai-flagged': ensureNumber(counts?.['ai-flagged'], 0),
    community: ensureNumber(counts?.community, 0),
    merged: ensureNumber(counts?.merged, 0),
    archived: ensureNumber(counts?.archived, 0),
    completedAiReports: ensureNumber(counts?.completedAiReports, 0),
  };
}

function normalizeIncidentRow(item) {
  return {
    reportId: item?.reportId || '',
    displayId: item?.displayId || 'Unknown',
    incidentType: item?.incidentType || 'Unknown',
    title: item?.title || '',
    location: item?.location || 'Unknown',
    severity: ['high', 'medium', 'low'].includes(item?.severity) ? item.severity : 'unknown',
    severitySource: item?.severitySource === 'ai' ? 'ai' : 'unknown',
    confidence: ensureNullableNumber(item?.confidence, 0),
    confidenceStatus: normalizeConfidenceStatus(item?.confidenceStatus),
    reporterScore: null,
    createdAt: item?.createdAt || null,
    ago: item?.ago || 'Unknown',
    status: item?.status ? String(item.status).toLowerCase() : 'unknown',
    openFlagCount: ensureNumber(item?.openFlagCount, 0),
    mergedIntoReportId: item?.mergedIntoReportId || null,
  };
}

function normalizeNearbyReport(item) {
  return {
    reportId: item?.reportId || '',
    displayId: item?.displayId || 'Unknown',
    location: item?.location || 'Unknown location',
    status: item?.status || 'pending',
    severity: ['high', 'medium', 'low'].includes(item?.severity) ? item.severity : 'low',
    distanceKm: ensureNullableNumber(item?.distanceKm, 1),
  };
}

function normalizeFlag(item) {
  return {
    id: item?.id || '',
    reason: item?.reason || 'flagged',
    comment: item?.comment || '',
    status: item?.status || 'open',
    createdAt: item?.createdAt || null,
    resolvedAt: item?.resolvedAt || null,
    flaggedBy: item?.flaggedBy || null,
    open: Boolean(item?.open),
  };
}

function normalizeReviewAction(item) {
  return {
    id: item?.id || '',
    action: item?.action || '',
    fromStatus: item?.fromStatus || null,
    toStatus: item?.toStatus || null,
    note: item?.note || '',
    createdAt: item?.createdAt || null,
    reviewedBy: item?.reviewedBy || 'Admin',
  };
}

function normalizeTimelineEntry(item) {
  return {
    id: item?.id || '',
    time: item?.time || null,
    timeLabel: item?.timeLabel || 'Unknown',
    event: item?.event || 'Update unavailable',
  };
}

function normalizeNote(item) {
  return {
    id: item?.id || '',
    author: item?.author || 'Admin',
    time: item?.time || null,
    text: item?.text || '',
  };
}

function normalizeIncidentDetail(item) {
  return {
    reportId: item?.reportId || '',
    displayId: item?.displayId || 'Unknown',
    incidentType: item?.incidentType || 'Unknown',
    title: item?.title || '',
    description: item?.description || 'No description available',
    location: item?.location || 'Unknown location',
    coordinates: {
      lat: ensureNullableNumber(item?.coordinates?.lat),
      lng: ensureNullableNumber(item?.coordinates?.lng),
    },
    severity: ['high', 'medium', 'low'].includes(item?.severity) ? item.severity : 'low',
    severitySource: item?.severitySource === 'ai' ? 'ai' : 'hint',
    confidence: ensureNullableNumber(item?.confidence, 0),
    confidenceStatus: normalizeConfidenceStatus(item?.confidenceStatus),
    reporterScore: null,
    createdAt: item?.createdAt || null,
    occurredAt: item?.occurredAt || null,
    ago: item?.ago || 'Unknown',
    status: item?.status || 'pending',
    mergedIntoReportId: item?.mergedIntoReportId || null,
    mergedAt: item?.mergedAt || null,
    mergeReason: item?.mergeReason || '',
    openFlagCount: ensureNumber(item?.openFlagCount, 0),
    reporter: {
      id: item?.reporter?.id || null,
      name: item?.reporter?.name || 'Unknown reporter',
      email: item?.reporter?.email || null,
      totalReports: ensureNumber(item?.reporter?.totalReports, 0),
      joinedAt: item?.reporter?.joinedAt || null,
      reporterScore: null,
      accuracy: null,
    },
    aiAssessment: {
      status: normalizeConfidenceStatus(item?.aiAssessment?.status),
      confidence: ensureNullableNumber(item?.aiAssessment?.confidence, 0),
      severity: ['high', 'medium', 'low'].includes(item?.aiAssessment?.severity)
        ? item.aiAssessment.severity
        : null,
      assessedAt: item?.aiAssessment?.assessedAt || null,
      modelVersionId: item?.aiAssessment?.modelVersionId || null,
    },
    media: Array.isArray(item?.media)
      ? item.media.map((mediaItem) => ({
        id: mediaItem?.id || '',
        mediaType: mediaItem?.mediaType || 'image',
        url: mediaItem?.url || '',
        uploadedAt: mediaItem?.uploadedAt || null,
      }))
      : [],
    nearbyReports: Array.isArray(item?.nearbyReports) ? item.nearbyReports.map(normalizeNearbyReport) : [],
    flags: Array.isArray(item?.flags) ? item.flags.map(normalizeFlag) : [],
    reviewActions: Array.isArray(item?.reviewActions) ? item.reviewActions.map(normalizeReviewAction) : [],
    timeline: Array.isArray(item?.timeline) ? item.timeline.map(normalizeTimelineEntry) : [],
    notes: Array.isArray(item?.notes) ? item.notes.map(normalizeNote) : [],
  };
}

export function normalizeIncidentFilter(filter) {
  const normalized = String(filter || '').trim().toLowerCase();
  return ALLOWED_FILTERS.has(normalized) ? normalized : DEFAULT_FILTER;
}

export function normalizeIncidentSortField(sortField) {
  return ALLOWED_SORT_FIELDS.has(sortField) ? sortField : DEFAULT_SORT_FIELD;
}

export function normalizeIncidentSortDir(sortDir) {
  const normalized = String(sortDir || '').trim().toLowerCase();
  return normalized === 'asc' ? 'asc' : DEFAULT_SORT_DIR;
}

export async function fetchAdminIncidents(params = {}, options = {}) {
  const query = new URLSearchParams();
  query.set('filter', normalizeIncidentFilter(params.filter));
  query.set('search', params.search || '');
  query.set('sortField', normalizeIncidentSortField(params.sortField));
  query.set('sortDir', normalizeIncidentSortDir(params.sortDir));

  if (Number.isInteger(params.limit)) {
    query.set('limit', String(params.limit));
  }

  if (Number.isInteger(params.offset)) {
    query.set('offset', String(params.offset));
  }

  try {
    const response = await apiRequest(`/api/admin/incidents?${query.toString()}`, {
      method: 'GET',
      withAuth: true,
      signal: options.signal,
    });

    return {
      incidents: Array.isArray(response?.incidents)
        ? response.incidents.map(normalizeIncidentRow)
        : [],
      counts: normalizeCounts(response?.counts),
      meta: {
        filter: normalizeIncidentFilter(response?.meta?.filter || params.filter),
        search: response?.meta?.search || '',
        sortField: normalizeIncidentSortField(response?.meta?.sortField || params.sortField),
        sortDir: normalizeIncidentSortDir(response?.meta?.sortDir || params.sortDir),
        returned: ensureNumber(response?.meta?.returned, 0),
        completedAiReports: ensureNumber(response?.meta?.completedAiReports, 0),
      },
    };
  } catch (error) {
    throw normalizeApiError(error, 'Failed to load admin incidents');
  }
}

export async function fetchAdminIncidentCounts(options = {}) {
  const payload = await fetchAdminIncidents({ limit: 0 }, options);
  return payload.counts;
}

export async function fetchAdminIncident(reportId, options = {}) {
  try {
    const response = await apiRequest(`/api/admin/incidents/${reportId}`, {
      method: 'GET',
      withAuth: true,
      signal: options.signal,
    });

    return normalizeIncidentDetail(response?.incident);
  } catch (error) {
    throw normalizeApiError(error, 'Failed to load incident details');
  }
}

export async function submitAdminIncidentAction(reportId, payload) {
  try {
    const response = await apiRequest(`/api/admin/incidents/${reportId}/actions`, {
      method: 'POST',
      withAuth: true,
      body: JSON.stringify({
        action: payload?.action,
        note: payload?.note || null,
        severity: payload?.severity || null,
        mergeTargetReportId: payload?.mergeTargetReportId || null,
      }),
    });

    return normalizeIncidentDetail(response?.incident);
  } catch (error) {
    throw normalizeApiError(error, 'Failed to submit incident action');
  }
}
