import * as Location from 'expo-location';
import { request as apiRequest } from './api';

function ensureNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') {
      return;
    }

    query.append(key, String(value));
  });

  return query.toString();
}

export function formatPoliceDateTime(value) {
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

export function formatPoliceRelativeTime(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function normalizePerson(person) {
  if (!person || typeof person !== 'object') {
    return null;
  }

  return {
    ...person,
    name: person.name || person.email || 'Officer',
  };
}

function normalizeZone(zone) {
  if (!zone || typeof zone !== 'object') {
    return null;
  }

  return {
    id: zone.id == null ? null : Number(zone.id),
    name: zone.name || '',
    level: zone.level || null,
    parentId: zone.parentId == null ? null : Number(zone.parentId),
    parentName: zone.parentName || null,
  };
}

function buildIncidentLocationText(item) {
  return [
    item.locationLabel,
    item.commune?.name,
    item.wilaya?.name,
  ].filter(Boolean).join(', ') || 'Unknown location';
}

function normalizeIncident(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const occurredAt = item.occurredAt || item.createdAt || null;

  return {
    ...item,
    id: item.id,
    displayId: item.displayId || item.id,
    title: item.title || item.incidentType || 'Incident',
    description: item.description || '',
    severity: String(item.severity || 'low').toLowerCase(),
    status: String(item.status || 'pending').toLowerCase(),
    incidentType: item.incidentType || 'incident',
    occurredAt,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    location: {
      lat: ensureNumber(item.location?.lat),
      lng: ensureNumber(item.location?.lng),
    },
    locationLabel: item.locationLabel || '',
    locationText: buildIncidentLocationText(item),
    timeAgo: formatPoliceRelativeTime(occurredAt),
    occurredAtLabel: formatPoliceDateTime(occurredAt),
    distanceMeters: ensureNumber(item.distanceMeters),
    distanceLabel: item.distanceMeters == null ? '' : `${Math.round(Number(item.distanceMeters))} m`,
    sourceChannel: item.sourceChannel || null,
    fieldNoteCount: Number(item.fieldNoteCount || 0),
    reportedBy: normalizePerson(item.reportedBy),
    assignedOfficer: normalizePerson(item.assignedOfficer),
    verifiedByOfficer: normalizePerson(item.verifiedByOfficer),
    resolvedByOfficer: normalizePerson(item.resolvedByOfficer),
    assignment: item.assignment || null,
    wilaya: normalizeZone(item.wilaya),
    commune: normalizeZone(item.commune),
    media: Array.isArray(item.media) ? item.media : [],
  };
}

function normalizeHistoryItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  return {
    ...item,
    id: item.id,
    actionType: item.actionType || 'update_status',
    createdAt: item.createdAt || null,
    createdAtLabel: formatPoliceDateTime(item.createdAt),
    officer: normalizePerson(item.officer),
  };
}

function normalizeAlert(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  return {
    ...item,
    id: item.id,
    title: item.title || 'Alert',
    description: item.description || '',
    severity: String(item.severity || 'medium').toLowerCase(),
    status: String(item.status || 'active').toLowerCase(),
    read: Boolean(item.read),
    expired: Boolean(item.expired),
    createdAt: item.createdAt || item.notificationCreatedAt || null,
    createdAtLabel: formatPoliceDateTime(item.createdAt || item.notificationCreatedAt || null),
  };
}

function normalizeOfficerContext(payload = {}) {
  return {
    officer: normalizePerson(payload.officer),
    workZone: {
      wilaya: normalizeZone(payload.workZone?.wilaya),
      commune: normalizeZone(payload.workZone?.commune),
      activeAdminAreaId: payload.workZone?.activeAdminAreaId == null ? null : Number(payload.workZone.activeAdminAreaId),
      firstZoneSelectionCompleted: Boolean(payload.workZone?.firstZoneSelectionCompleted),
    },
    latestLocation: payload.latestLocation || null,
    requiresZoneSelection: Boolean(payload.requiresZoneSelection),
  };
}

function normalizePagination(pagination = {}, defaults = {}) {
  return {
    page: Number(pagination.page || defaults.page || 1),
    pageSize: Number(pagination.pageSize || defaults.pageSize || 20),
    total: Number(pagination.total || 0),
    totalPages: Number(pagination.totalPages || 1),
    returned: Number(pagination.returned || 0),
  };
}

export async function getPoliceMe() {
  const payload = await apiRequest('/api/police/me', {
    method: 'GET',
    withAuth: true,
  });

  return normalizeOfficerContext(payload);
}

export async function getPoliceWorkZoneOptions(wilayaId = null) {
  const query = buildQuery(wilayaId ? { wilayaId } : {});
  const payload = await apiRequest(`/api/police/work-zone/options${query ? `?${query}` : ''}`, {
    method: 'GET',
    withAuth: true,
  });

  return {
    wilayas: Array.isArray(payload?.wilayas) ? payload.wilayas.map((item) => ({ id: Number(item.id), name: item.name || '' })) : [],
    communes: Array.isArray(payload?.communes) ? payload.communes.map((item) => ({ id: Number(item.id), name: item.name || '' })) : [],
    selectedWilayaId: payload?.selectedWilayaId == null ? null : Number(payload.selectedWilayaId),
    selectedCommuneId: payload?.selectedCommuneId == null ? null : Number(payload.selectedCommuneId),
  };
}

export async function updatePoliceWorkZone({ wilayaId, communeId }) {
  const payload = await apiRequest('/api/police/me/work-zone', {
    method: 'PUT',
    withAuth: true,
    body: JSON.stringify({ wilayaId, communeId }),
  });

  return normalizeOfficerContext(payload);
}

export async function updatePoliceLocation(locationPayload) {
  const payload = await apiRequest('/api/police/me/location', {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify(locationPayload),
  });

  return payload?.location || null;
}

export async function syncPoliceDeviceLocation() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    return {
      ok: false,
      reason: 'permission_denied',
    };
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  }).catch(() => null);

  if (!position?.coords) {
    return {
      ok: false,
      reason: 'unavailable',
    };
  }

  await updatePoliceLocation({
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyM: position.coords.accuracy,
    heading: position.coords.heading,
    speedKmh:
      position.coords.speed == null || Number.isNaN(Number(position.coords.speed))
        ? null
        : Number(position.coords.speed) * 3.6,
    capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
    source: 'mobile',
  });

  return {
    ok: true,
    coords: {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    },
  };
}

export async function getPoliceDashboard() {
  const payload = await apiRequest('/api/police/dashboard', {
    method: 'GET',
    withAuth: true,
  });

  return {
    ...normalizeOfficerContext(payload),
    stats: {
      activeCount: Number(payload?.stats?.activeCount || 0),
      highPriorityCount: Number(payload?.stats?.highPriorityCount || 0),
      pendingVerificationCount: Number(payload?.stats?.pendingVerificationCount || 0),
      unreadAlertsCount: Number(payload?.stats?.unreadAlertsCount || 0),
    },
    activeIncidents: Array.isArray(payload?.activeIncidents) ? payload.activeIncidents.map(normalizeIncident).filter(Boolean) : [],
    nearbyIncidents: Array.isArray(payload?.nearbyIncidents) ? payload.nearbyIncidents.map(normalizeIncident).filter(Boolean) : [],
    nearbyLocationRequired: Boolean(payload?.nearbyLocationRequired),
    myIncidents: Array.isArray(payload?.myIncidents) ? payload.myIncidents.map(normalizeIncident).filter(Boolean) : [],
    recentHistory: Array.isArray(payload?.recentHistory) ? payload.recentHistory.map(normalizeHistoryItem).filter(Boolean) : [],
  };
}

export async function listPoliceIncidents(params = {}) {
  const query = buildQuery(params);
  const payload = await apiRequest(`/api/police/incidents${query ? `?${query}` : ''}`, {
    method: 'GET',
    withAuth: true,
  });

  return {
    items: Array.isArray(payload?.items) ? payload.items.map(normalizeIncident).filter(Boolean) : [],
    pagination: normalizePagination(payload?.pagination, params),
    scope: payload?.scope || params.scope || 'active',
    locationRequired: Boolean(payload?.locationRequired),
  };
}

export async function getPoliceIncident(incidentId) {
  const payload = await apiRequest(`/api/police/incidents/${incidentId}`, {
    method: 'GET',
    withAuth: true,
  });

  return {
    incident: normalizeIncident(payload?.incident),
    nearbyIncidents: Array.isArray(payload?.nearbyIncidents) ? payload.nearbyIncidents.map(normalizeIncident).filter(Boolean) : [],
    history: Array.isArray(payload?.history) ? payload.history.map(normalizeHistoryItem).filter(Boolean) : [],
  };
}

async function runIncidentAction(incidentId, path, actionPayload = {}) {
  const payload = await apiRequest(`/api/police/incidents/${incidentId}/${path}`, {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify(actionPayload),
  });

  return {
    incident: normalizeIncident(payload?.incident),
    nearbyIncidents: Array.isArray(payload?.nearbyIncidents) ? payload.nearbyIncidents.map(normalizeIncident).filter(Boolean) : [],
    history: Array.isArray(payload?.history) ? payload.history.map(normalizeHistoryItem).filter(Boolean) : [],
  };
}

export function verifyPoliceIncident(incidentId, payload = {}) {
  return runIncidentAction(incidentId, 'verify', payload);
}

export function rejectPoliceIncident(incidentId, payload = {}) {
  return runIncidentAction(incidentId, 'reject', payload);
}

export function requestPoliceBackup(incidentId, payload = {}) {
  return runIncidentAction(incidentId, 'request-backup', payload);
}

export function assignSelfToPoliceIncident(incidentId, payload = {}) {
  return runIncidentAction(incidentId, 'assign-self', payload);
}

export function updatePoliceIncidentStatus(incidentId, payload = {}) {
  return runIncidentAction(incidentId, 'status', payload);
}

export function addPoliceFieldNote(incidentId, payload = {}) {
  return runIncidentAction(incidentId, 'field-note', payload);
}

export async function listPoliceAlerts(params = {}) {
  const query = buildQuery(params);
  const payload = await apiRequest(`/api/police/alerts${query ? `?${query}` : ''}`, {
    method: 'GET',
    withAuth: true,
  });

  return {
    items: Array.isArray(payload?.items) ? payload.items.map(normalizeAlert).filter(Boolean) : [],
    unreadCount: Number(payload?.unreadCount || 0),
    pagination: normalizePagination(payload?.pagination, params),
  };
}

export async function markPoliceAlertRead(alertId) {
  const payload = await apiRequest('/api/police/alerts/' + alertId + '/read', {
    method: 'PATCH',
    withAuth: true,
  });

  return {
    alert: normalizeAlert(payload?.alert),
    notification: payload?.notification || null,
  };
}
export async function listPoliceOperationHistory(params = {}) {
  const query = buildQuery(params);
  const payload = await apiRequest(`/api/police/operation-history${query ? `?${query}` : ''}`, {
    method: 'GET',
    withAuth: true,
  });

  return {
    items: Array.isArray(payload?.items) ? payload.items.map(normalizeHistoryItem).filter(Boolean) : [],
    pagination: normalizePagination(payload?.pagination, params),
  };
}


export async function createManualPoliceHistoryEntry(payload = {}) {
  const response = await apiRequest('/api/police/operation-history/manual', {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify(payload),
  });

  return {
    item: normalizeHistoryItem(response?.item),
  };
}

export async function createPoliceAlert(payload = {}) {
  const response = await apiRequest('/api/police/supervisor/alerts', {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify(payload),
  });

  return {
    alert: response?.alert || null,
  };
}


