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
  return apiRequest(`/api/police/supervisor/dashboard${qs ? `?${qs}` : ''}`);
}

export async function getSupervisorAnalytics(params = {}) {
  const qs = buildQuery(params);
  return apiRequest(`/api/police/supervisor/analytics${qs ? `?${qs}` : ''}`);
}

export async function getSupervisorOfficers(params = {}) {
  const qs = buildQuery(params);
  return apiRequest(`/api/police/supervisor/officers${qs ? `?${qs}` : ''}`);
}

export async function getSupervisorIncidents(params = {}) {
  const qs = buildQuery(params);
  return apiRequest(`/api/police/incidents${qs ? `?${qs}` : ''}`);
}

export async function getAssignableOfficers(incidentId) {
  return apiRequest(`/api/police/supervisor/incidents/${incidentId}/assignable-officers`);
}

export async function assignOfficerToIncident(incidentId, officerId) {
  return apiRequest(`/api/police/supervisor/incidents/${incidentId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ officerId }),
  });
}

export async function createSupervisorAlert(body = {}) {
  return apiRequest('/api/police/supervisor/alerts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getSupervisorGlobalMap() {
  return apiRequest('/api/police/supervisor/global-map');
}
