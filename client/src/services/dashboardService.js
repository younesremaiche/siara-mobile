import { request as apiRequest } from './api';

export async function fetchDashboard(options = {}) {
  const query = options.refresh ? '?refresh=true' : '';
  return apiRequest(`/api/dashboard${query}`, {
    method: 'GET',
    withAuth: true,
  });
}
