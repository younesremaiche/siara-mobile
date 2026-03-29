import { request as apiRequest } from './api';

const DEFAULT_TAB = 'all';
const ALLOWED_TABS = new Set(['all', 'active', 'scheduled', 'expired', 'emergency', 'templates']);

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

function ensureBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeEvent(item) {
  return {
    id: ensureNumber(item?.id, 0),
    eventType: item?.eventType || 'unknown',
    fromStatus: item?.fromStatus || null,
    toStatus: item?.toStatus || null,
    note: item?.note || '',
    metadata: item?.metadata && typeof item.metadata === 'object' ? item.metadata : {},
    createdAt: item?.createdAt || null,
    actor: item?.actor || 'Admin',
  };
}

function normalizeAlertItem(item) {
  return {
    id: item?.id || '',
    displayId: item?.displayId || 'Unknown',
    title: item?.title || 'Operational alert',
    description: item?.description || 'No description available',
    zone: item?.zone || 'Unknown zone',
    zoneLabel: item?.zoneLabel || item?.zone || 'Unknown zone',
    severity: ['low', 'medium', 'high', 'critical'].includes(item?.severity) ? item.severity : 'low',
    type: item?.type || 'advisory',
    trigger: ['auto', 'manual', 'scheduled'].includes(item?.trigger) ? item.trigger : 'manual',
    duration: item?.duration || 'Unknown',
    audience: ensureNullableNumber(item?.audience),
    status: ['active', 'scheduled', 'expired', 'cancelled', 'draft'].includes(item?.status)
      ? item.status
      : 'draft',
    startsAt: item?.startsAt || null,
    endsAt: item?.endsAt || null,
    publishedAt: item?.publishedAt || null,
    cancelledAt: item?.cancelledAt || null,
    createdAt: item?.createdAt || null,
    updatedAt: item?.updatedAt || null,
    createdBy: item?.createdBy || 'Admin',
    updatedBy: item?.updatedBy || null,
    cancelledBy: item?.cancelledBy || null,
    createdById: item?.createdById || null,
    adminAreaId: ensureNullableNumber(item?.adminAreaId),
    adminArea: item?.adminArea && typeof item.adminArea === 'object'
      ? {
        id: ensureNullableNumber(item.adminArea.id),
        name: item.adminArea.name || 'Unknown zone',
        level: item.adminArea.level || null,
        parentId: ensureNullableNumber(item.adminArea.parentId),
        wilayaId: ensureNullableNumber(item.adminArea.wilayaId),
        wilayaName: item.adminArea.wilayaName || null,
      }
      : null,
    templateId: item?.templateId || null,
    templateName: item?.templateName || null,
    sourceType: item?.sourceType || 'manual',
    sourceReportId: item?.sourceReportId || null,
    zoneType: item?.zoneType || 'admin_area',
    audienceScope: item?.audienceScope || 'users_in_zone',
    notifyOnStart: ensureBoolean(item?.notifyOnStart, true),
    notifyOnExpire: ensureBoolean(item?.notifyOnExpire, false),
    sendPush: ensureBoolean(item?.sendPush, true),
    sendEmail: ensureBoolean(item?.sendEmail, false),
    sendSms: ensureBoolean(item?.sendSms, false),
    metadata: item?.metadata && typeof item.metadata === 'object' ? item.metadata : {},
    events: Array.isArray(item?.events) ? item.events.map(normalizeEvent) : [],
  };
}

function normalizeTemplate(item) {
  return {
    id: item?.id || '',
    name: item?.name || 'Template',
    description: item?.description || 'No description available',
    alertType: item?.alertType || 'advisory',
    defaultSeverity: ['low', 'medium', 'high', 'critical'].includes(item?.defaultSeverity)
      ? item.defaultSeverity
      : 'medium',
    defaultTitle: item?.defaultTitle || 'Untitled template',
    defaultMessage: item?.defaultMessage || 'No message template available',
    defaultDurationMinutes: ensureNumber(item?.defaultDurationMinutes, 0),
    defaultDuration: item?.defaultDuration || 'Unknown',
    sendPush: ensureBoolean(item?.sendPush, true),
    sendEmail: ensureBoolean(item?.sendEmail, false),
    sendSms: ensureBoolean(item?.sendSms, false),
  };
}

export function normalizeOperationalAlertTab(tab) {
  const normalized = String(tab || '').trim().toLowerCase();
  return ALLOWED_TABS.has(normalized) ? normalized : DEFAULT_TAB;
}

export async function fetchAdminOperationalAlerts(params = {}, options = {}) {
  const query = new URLSearchParams();
  query.set('tab', normalizeOperationalAlertTab(params.tab));
  query.set('search', params.search || '');
  query.set('page', String(Number.isInteger(params.page) ? params.page : 1));
  query.set('pageSize', String(Number.isInteger(params.pageSize) ? params.pageSize : 20));

  try {
    const response = await apiRequest(`/api/admin/operational-alerts?${query.toString()}`, {
      method: 'GET',
      withAuth: true,
      signal: options.signal,
    });

    return {
      items: Array.isArray(response?.items) ? response.items.map(normalizeAlertItem) : [],
      counts: {
        all: ensureNumber(response?.counts?.all, 0),
        active: ensureNumber(response?.counts?.active, 0),
        scheduled: ensureNumber(response?.counts?.scheduled, 0),
        expired: ensureNumber(response?.counts?.expired, 0),
        emergency: ensureNumber(response?.counts?.emergency, 0),
        templates: ensureNumber(response?.counts?.templates, 0),
      },
      pagination: {
        page: ensureNumber(response?.pagination?.page, 1),
        pageSize: ensureNumber(response?.pagination?.pageSize, 20),
        total: ensureNumber(response?.pagination?.total, 0),
        totalPages: ensureNumber(response?.pagination?.totalPages, 1),
        returned: ensureNumber(response?.pagination?.returned, 0),
      },
    };
  } catch (error) {
    throw normalizeApiError(error, 'Failed to load operational alerts');
  }
}

export async function fetchAdminOperationalAlert(id, options = {}) {
  try {
    const response = await apiRequest(`/api/admin/operational-alerts/${id}`, {
      method: 'GET',
      withAuth: true,
      signal: options.signal,
    });

    return normalizeAlertItem(response?.item);
  } catch (error) {
    throw normalizeApiError(error, 'Failed to load operational alert');
  }
}

export async function fetchOperationalAlertTemplates(options = {}) {
  try {
    const response = await apiRequest('/api/admin/operational-alert-templates', {
      method: 'GET',
      withAuth: true,
      signal: options.signal,
    });

    return Array.isArray(response?.items) ? response.items.map(normalizeTemplate) : [];
  } catch (error) {
    throw normalizeApiError(error, 'Failed to load operational alert templates');
  }
}

export async function fetchAdminOperationalAlertCounts(options = {}) {
  const payload = await fetchAdminOperationalAlerts({ pageSize: 1 }, options);
  return payload.counts;
}
