import { request as apiRequest } from './api';
import { formatRelativeTime } from './reportsService';

function normalizeAlert(item) {
  return {
    id: String(item?.id || ''),
    name: String(item?.name || '').trim() || 'Untitled alert',
    status: String(item?.status || '').trim().toLowerCase() || 'active',
    incidentTypes: Array.isArray(item?.incidentTypes) ? item.incidentTypes : [],
    severityLevels: Array.isArray(item?.severityLevels) ? item.severityLevels : [],
    severity: String(item?.severity || '').trim().toLowerCase() || 'low',
    timeRangeType: item?.timeRangeType || null,
    customTimeStart: item?.customTimeStart || null,
    customTimeEnd: item?.customTimeEnd || null,
    timeWindow: item?.timeWindow || 'Any time',
    weatherRelated: Boolean(item?.weatherRelated),
    aiConfidenceMin:
      item?.aiConfidenceMin == null
        ? null
        : Number(item.aiConfidenceMin),
    frequencyType: item?.frequencyType || null,
    digestInterval: item?.digestInterval || null,
    muteDuplicates: Boolean(item?.muteDuplicates),
    notifications: {
      app: Boolean(item?.notifications?.app),
      email: Boolean(item?.notifications?.email),
      sms: Boolean(item?.notifications?.sms),
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
  const payload = await apiRequest(`/api/alerts${query}`, {
    method: 'GET',
    withAuth: true,
  });

  return Array.isArray(payload?.items) ? payload.items.map(normalizeAlert) : [];
}

export async function fetchAlert(alertId, { includeGeometry = false } = {}) {
  const query = includeGeometry ? '?includeGeometry=true' : '';
  const payload = await apiRequest(`/api/alerts/${alertId}${query}`, {
    method: 'GET',
    withAuth: true,
  });

  return normalizeAlert(payload?.item);
}

export { normalizeAlert };
