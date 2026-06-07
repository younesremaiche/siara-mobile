import { request as apiRequest } from './api';

function buildQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') q.append(k, String(v));
  });
  return q.toString();
}

export async function getSupervisorDashboard(params = {}) {
  const qs = buildQuery(params);
  return apiRequest(`/api/police/supervisor/dashboard${qs ? `?${qs}` : ''}`, {
    withAuth: true,
  });
}

export async function getSupervisorAnalytics(params = {}) {
  const qs = buildQuery(params);
  return apiRequest(`/api/police/supervisor/analytics${qs ? `?${qs}` : ''}`, {
    withAuth: true,
  });
}

export async function getSupervisorOfficers(params = {}) {
  const qs = buildQuery(params);
  const payload = await apiRequest(`/api/police/supervisor/officers${qs ? `?${qs}` : ''}`, {
    withAuth: true,
  });

  const officers = Array.isArray(payload?.officers)
    ? payload.officers
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];

  return {
    ...payload,
    officers,
    items: officers,
  };
}

export async function getSupervisorIncidents(params = {}) {
  const qs = buildQuery(params);
  const payload = await apiRequest(`/api/police/incidents${qs ? `?${qs}` : ''}`, {
    withAuth: true,
  });

  const incidents = Array.isArray(payload?.incidents)
    ? payload.incidents
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];

  return {
    ...payload,
    incidents,
    items: incidents,
  };
}

export async function getAssignableOfficers(incidentId) {
  const payload = await apiRequest(`/api/police/supervisor/incidents/${incidentId}/assignable-officers`, {
    withAuth: true,
  });

  const officers = Array.isArray(payload?.officers)
    ? payload.officers
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];

  return {
    ...payload,
    officers,
    items: officers,
  };
}

export async function assignOfficerToIncident(incidentId, officerId) {
  return apiRequest(`/api/police/supervisor/incidents/${incidentId}/assign`, {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify({ officerUserId: officerId }),
  });
}

export async function createSupervisorAlert(body = {}) {
  return apiRequest('/api/police/supervisor/alerts', {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify(body),
  });
}

export async function getSupervisorGlobalMap() {
  return apiRequest('/api/police/supervisor/global-map', {
    withAuth: true,
  });
}
