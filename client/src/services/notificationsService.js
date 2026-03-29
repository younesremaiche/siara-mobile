import { request } from './api';
import { normalizeNotification } from '../utils/notifications';

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export async function fetchNotifications({ limit = 50, offset = 0 } = {}) {
  const response = await request(`/api/notifications${buildQuery({ limit, offset })}`, {
    method: 'GET',
    withAuth: true,
  });

  return {
    items: Array.isArray(response?.items)
      ? response.items.map(normalizeNotification).filter(Boolean)
      : [],
    pagination: response?.pagination || null,
  };
}

export async function fetchUnreadNotificationCount() {
  const response = await request('/api/notifications/unread-count', {
    method: 'GET',
    withAuth: true,
  });
  return Number(response?.count || 0);
}

export async function markNotificationRead(notificationId) {
  const response = await request(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
    withAuth: true,
  });
  return normalizeNotification(response?.notification);
}

export async function markAllNotificationsRead() {
  const response = await request('/api/notifications/read-all', {
    method: 'PATCH',
    withAuth: true,
  });

  return {
    ok: Boolean(response?.ok),
    ids: Array.isArray(response?.ids) ? response.ids : [],
    readAt: response?.readAt || null,
    updatedCount: Number(response?.updatedCount || 0),
  };
}

export async function fetchNotificationPreferences() {
  const response = await request('/api/push/preferences', {
    method: 'GET',
    withAuth: true,
  });
  return response?.preferences || null;
}

export async function updateNotificationPreferences(patch) {
  const response = await request('/api/push/preferences', {
    method: 'PATCH',
    withAuth: true,
    body: JSON.stringify(patch || {}),
  });
  return response?.preferences || null;
}

export async function registerMobilePushDevice(payload) {
  const response = await request('/api/push/mobile/register', {
    method: 'POST',
    withAuth: true,
    body: JSON.stringify(payload || {}),
  });
  return response?.device || null;
}

export async function unregisterMobilePushDevice(token, accessToken = null) {
  const response = await request('/api/push/mobile/unregister', {
    method: 'DELETE',
    withAuth: true,
    accessToken,
    body: JSON.stringify({ token }),
  });
  return Boolean(response?.ok);
}
