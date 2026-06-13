import { request as apiRequest } from './api';

// Maps the screen's tab labels to the backend filter keys (GET /api/admin/users).
export const USER_FILTERS = {
  All: 'all',
  'At Risk': 'at-risk',
  'Top Contributors': 'trusted',
  Banned: 'banned',
  Admins: 'admin',
};

const ALLOWED_SORTS = new Set([
  'trust_asc',
  'trust_desc',
  'reports_desc',
  'created_desc',
  'last_active_desc',
]);

function normalizeApiError(error, fallbackMessage) {
  const nextError = new Error(
    error?.response?.message || error?.response?.error || error?.message || fallbackMessage,
  );
  nextError.status = error?.status;
  nextError.code = error?.code;
  nextError.response = error?.response;
  return nextError;
}

// Derive the screen's coarse risk bucket from the trust score (the backend has
// no single "risk" column; low trust == higher risk).
export function riskFromTrust(trustScore) {
  const score = Number(trustScore);
  if (!Number.isFinite(score)) return 'Medium';
  if (score >= 70) return 'Low';
  if (score >= 45) return 'Medium';
  if (score >= 20) return 'High';
  return 'Critical';
}

export async function fetchAdminUsers({ filter = 'all', sort = 'trust_asc', search, limit = 100, signal } = {}) {
  const params = new URLSearchParams();
  params.set('filter', filter);
  params.set('sort', ALLOWED_SORTS.has(sort) ? sort : 'trust_asc');
  if (limit) params.set('limit', String(limit));
  if (search) params.set('search', String(search));

  try {
    const data = await apiRequest(`/api/admin/users?${params}`, {
      method: 'GET',
      withAuth: true,
      signal,
    });
    return {
      users: Array.isArray(data?.users) ? data.users : [],
      counts: data?.counts || {},
      pagination: data?.pagination || null,
    };
  } catch (error) {
    throw normalizeApiError(error, 'Failed to load users.');
  }
}

// status: 'active' | 'warned' | 'banned'. For a temporary ban pass bannedUntil
// (ISO). For a warning pass warningReason.
export async function updateAdminUserStatus(userId, payload = {}) {
  try {
    const data = await apiRequest(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      withAuth: true,
      body: JSON.stringify(payload),
    });
    return data?.user || null;
  } catch (error) {
    throw normalizeApiError(error, 'Failed to update user status.');
  }
}

export async function updateAdminUserRoles(userId, roles) {
  try {
    const data = await apiRequest(`/api/admin/users/${userId}/roles`, {
      method: 'PATCH',
      withAuth: true,
      body: JSON.stringify({ roles }),
    });
    return data?.user || null;
  } catch (error) {
    throw normalizeApiError(error, 'Failed to update user roles.');
  }
}

export async function recalculateUserTrust(userId) {
  try {
    const data = await apiRequest(`/api/admin/users/${userId}/recalculate-trust`, {
      method: 'POST',
      withAuth: true,
    });
    return data?.user || null;
  } catch (error) {
    throw normalizeApiError(error, 'Failed to recalculate trust score.');
  }
}
