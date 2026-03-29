import { request as apiRequest } from './api';

const DEFAULT_RANGE = '24h';
const ALLOWED_RANGES = new Set(['1h', '24h', '7d', '30d']);
const DEFAULT_WEEKLY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

function normalizeReviewQueueItem(item) {
  return {
    displayId: item?.displayId || 'Unknown',
    reportId: item?.reportId || '',
    location: item?.location || 'Unknown',
    severity: ['high', 'medium', 'low'].includes(item?.severity) ? item.severity : 'unknown',
    confidence: ensureNullableNumber(item?.confidence, 0),
    confidenceStatus: ['completed', 'pending', 'failed'].includes(item?.confidenceStatus)
      ? item.confidenceStatus
      : null,
    status: item?.status ? String(item.status).toLowerCase() : 'unknown',
    reporterScore: null,
    ago: item?.ago || 'Unknown',
    createdAt: item?.createdAt || null,
  };
}

function normalizeCriticalAlert(item) {
  return {
    type: item?.type || 'unknown',
    text: item?.text || 'Alert unavailable',
    count: ensureNumber(item?.count, 0),
    action: item?.action || 'Open',
    route: typeof item?.route === 'string' ? item.route : null,
  };
}

function normalizeZone(item, index) {
  return {
    zone: item?.zone || 'Unknown zone',
    incidents: ensureNumber(item?.incidents, 0),
    risk: ['high', 'medium'].includes(item?.risk) ? item.risk : 'unknown',
  };
}

export function normalizeRange(range) {
  const normalized = String(range || '').trim().toLowerCase();
  return ALLOWED_RANGES.has(normalized) ? normalized : DEFAULT_RANGE;
}

export function normalizeOverviewResponse(data) {
  const weeklyByLabel = new Map(
    (Array.isArray(data?.weeklyVolume) ? data.weeklyVolume : []).map((entry) => [
      entry?.label,
      {
        label: entry?.label,
        count: ensureNumber(entry?.count, 0),
      },
    ])
  );

  return {
    criticalAlerts: Array.isArray(data?.criticalAlerts)
      ? data.criticalAlerts.map(normalizeCriticalAlert).filter((alert) => alert.text)
      : [],
    kpis: {
      incidents: {
        value: ensureNumber(data?.kpis?.incidents?.value, 0),
        trend: data?.kpis?.incidents?.trend ?? null,
      },
      pendingReview: {
        value: ensureNumber(data?.kpis?.pendingReview?.value, 0),
        trend: data?.kpis?.pendingReview?.trend ?? null,
      },
      aiConfidence: {
        value: ensureNullableNumber(data?.kpis?.aiConfidence?.value, 1),
        trend: data?.kpis?.aiConfidence?.trend ?? null,
      },
      highRiskZones: {
        value: ensureNumber(data?.kpis?.highRiskZones?.value, 0),
        trend: data?.kpis?.highRiskZones?.trend ?? null,
      },
      activeAlerts: {
        value: ensureNumber(data?.kpis?.activeAlerts?.value, 0),
        trend: data?.kpis?.activeAlerts?.trend ?? null,
      },
      reportsPerMin: {
        value: ensureNullableNumber(data?.kpis?.reportsPerMin?.value, 1) ?? 0,
        trend: data?.kpis?.reportsPerMin?.trend ?? null,
      },
    },
    reviewQueue: Array.isArray(data?.reviewQueue)
      ? data.reviewQueue.map(normalizeReviewQueueItem)
      : [],
    weeklyVolume: DEFAULT_WEEKLY_LABELS.map(
      (label) => weeklyByLabel.get(label) || { label, count: 0 }
    ),
    severityDistribution: {
      high: ensureNumber(data?.severityDistribution?.high, 0),
      medium: ensureNumber(data?.severityDistribution?.medium, 0),
      low: ensureNumber(data?.severityDistribution?.low, 0),
    },
    topRiskZones: Array.isArray(data?.topRiskZones)
      ? data.topRiskZones.map(normalizeZone)
      : [],
  };
}

export async function fetchAdminOverview(range = DEFAULT_RANGE, options = {}) {
  try {
    const response = await apiRequest(
      `/api/admin/overview?range=${encodeURIComponent(normalizeRange(range))}`,
      {
        method: 'GET',
        withAuth: true,
        signal: options.signal,
      }
    );

    return normalizeOverviewResponse(response);
  } catch (error) {
    throw normalizeApiError(error, 'Failed to load admin overview');
  }
}
