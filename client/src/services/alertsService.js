import { request as apiRequest } from './api';
import { formatRelativeTime } from './reportsService';

function normalizeAlert(item) {
  return {
    id: String(item?.id || ''),
    name: String(item?.name || '').trim() || 'Untitled alert',
    status: String(item?.status || '').trim().toLowerCase() || 'active',
    incidentTypes: Array.isArray(item?.incidentTypes) ? item.incidentTypes : [],
    severityLevels: Array.isArray(item?.severityLevels) ? item.severityLevels : [],
    severity: String(item?.severity || item?.severityLevels?.[0] || '').trim().toLowerCase() || 'low',
    timeRangeType: item?.timeRangeType || 'all',
    customTimeStart: item?.customTimeStart || null,
    customTimeEnd: item?.customTimeEnd || null,
    timeWindow: item?.timeWindow || 'Any time',
    weatherRelated: Boolean(item?.weatherRelated),
    aiConfidenceMin: item?.aiConfidenceMin == null ? null : Number(item.aiConfidenceMin),
    frequencyType: item?.frequencyType || 'immediate',
    digestInterval: item?.digestInterval || null,
    muteDuplicates: Boolean(item?.muteDuplicates),
    // backend stores deliveryApp/Email/Sms; normalise both shapes
    notifications: {
      app:   Boolean(item?.deliveryApp   ?? item?.notifications?.app),
      email: Boolean(item?.deliveryEmail ?? item?.notifications?.email),
      sms:   Boolean(item?.deliverySms   ?? item?.notifications?.sms),
    },
    zone: item?.zone || null,
    area: item?.area || null,
    triggerCount: Number(item?.triggerCount || 0),
    lastTriggeredAt: item?.lastTriggeredAt || null,
    lastTriggered: item?.lastTriggered || formatRelativeTime(item?.lastTriggeredAt),
    recentTriggers: Array.isArray(item?.recentTriggers) ? item.recentTriggers : [],
    createdAt: item?.createdAt || null,
    updatedAt: item?.updatedAt || null,
  };
}

export async function fetchMyAlerts({ includeGeometry = false } = {}) {
  const query = includeGeometry ? '?includeGeometry=true' : '';
  const payload = await apiRequest(`/api/alerts${query}`, { method: 'GET', withAuth: true });
  return Array.isArray(payload?.items) ? payload.items.map(normalizeAlert) : [];
}

export async function fetchAlert(alertId, { includeGeometry = false } = {}) {
  const query = includeGeometry ? '?includeGeometry=true' : '';
  const payload = await apiRequest(`/api/alerts/${alertId}${query}`, { method: 'GET', withAuth: true });
  return normalizeAlert(payload?.item);
}

export async function createAlert(payload) {
  const response = await apiRequest('/api/alerts', {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify(payload),
  });
  return normalizeAlert(response?.item);
}

export async function updateAlert(alertId, payload) {
  const response = await apiRequest(`/api/alerts/${alertId}`, {
    method: 'PUT',
    withAuth: true,
    body: JSON.stringify(payload),
  });
  return normalizeAlert(response?.item);
}

// PATCH status — kept as both names for backward compat
export async function updateAlertStatus(alertId, status) {
  const response = await apiRequest(`/api/alerts/${alertId}/status`, {
    method: 'PATCH',
    withAuth: true,
    body: JSON.stringify({ status }),
  });
  return normalizeAlert(response?.item);
}
export { updateAlertStatus as setAlertStatus };

// DELETE — kept as both names for backward compat
export async function deleteMyAlert(alertId) {
  await apiRequest(`/api/alerts/${alertId}`, { method: 'DELETE', withAuth: true });
}
export { deleteMyAlert as deleteAlert };

export async function fetchWilayas() {
  const payload = await apiRequest('/api/admin-areas/wilayas', { method: 'GET', withAuth: true });
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function fetchCommunesByWilaya(wilayaId) {
  const payload = await apiRequest(`/api/admin-areas/${wilayaId}/communes`, { method: 'GET', withAuth: true });
  return Array.isArray(payload?.items) ? payload.items : [];
}

// ─── Payload builder ────────────────────────────────────────────────────────

export function buildAlertPayload(form) {
  const { frequencyType, digestInterval } = mapFrequency(form.frequencyChoice);
  return {
    name: String(form.name || '').trim(),
    incidentTypes: Array.from(form.incidentTypes || []),
    severityLevels: Array.from(form.severityLevels || []),
    timeRangeType: form.timeRange || 'all',
    customTimeStart: form.timeRange === 'custom' ? (form.customTimeStart || null) : null,
    customTimeEnd:   form.timeRange === 'custom' ? (form.customTimeEnd   || null) : null,
    frequencyType,
    digestInterval,
    weatherRelated: Boolean(form.weatherRelated),
    aiConfidenceMin: form.aiConfidenceMin ?? null,
    muteDuplicates: form.muteDuplicates !== false,
    deliveryApp:   form.deliveryApp   !== false,
    deliveryEmail: Boolean(form.deliveryEmail),
    deliverySms:   Boolean(form.deliverySms),
    zone: buildZone(form.zone),
  };
}

function mapFrequency(choice) {
  switch ((choice || 'instant').toLowerCase()) {
    case 'hourly': return { frequencyType: 'digest',    digestInterval: 'hourly' };
    case 'daily':  return { frequencyType: 'digest',    digestInterval: 'daily'  };
    case 'weekly': return { frequencyType: 'digest',    digestInterval: 'weekly' };
    case 'first':  return { frequencyType: 'first',     digestInterval: null     };
    default:       return { frequencyType: 'immediate', digestInterval: null     };
  }
}

function buildZone(zone) {
  if (!zone) throw new Error('Pick a zone before saving the alert.');
  if (zone.type === 'radius') {
    return {
      zoneType: 'radius',
      radiusM: Number(zone.radiusM),
      center: { lat: Number(zone.center?.lat), lng: Number(zone.center?.lng) },
      displayName: zone.displayName || null,
    };
  }
  if (zone.type === 'wilaya' || zone.type === 'commune') {
    return {
      zoneType: zone.type,
      adminAreaId: Number(zone.adminAreaId),
      wilayaId: zone.wilayaId ? Number(zone.wilayaId) : undefined,
      displayName: zone.displayName || null,
    };
  }
  throw new Error('Unsupported zone type.');
}

export { normalizeAlert };
