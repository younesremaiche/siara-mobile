import { Colors } from '../theme/colors';

export function normalizeNotification(input) {
  if (!input || typeof input !== 'object') return null;

  const data = input.data && typeof input.data === 'object' && !Array.isArray(input.data)
    ? input.data
    : {};

  const createdAt = input.createdAt || input.sentAt || input.deliveredAt || input.readAt || null;
  const priority = Number(input.priority ?? data.priority ?? 2);

  return {
    id: String(input.id || input.notificationId || data.notificationId || '').trim() || null,
    channel: input.channel || data.channel || 'push',
    status: input.status || (input.read || input.readAt ? 'read' : 'delivered'),
    priority: Number.isFinite(priority) ? priority : 2,
    createdAt,
    sentAt: input.sentAt || null,
    deliveredAt: input.deliveredAt || null,
    readAt: input.readAt || null,
    eventType: input.eventType || data.eventType || 'GENERAL_NOTIFICATION',
    title: String(input.title || '').trim(),
    body: String(input.body || '').trim(),
    data,
    read: Boolean(input.readAt || input.read),
  };
}

export function buildNotificationFromPushPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : {};

  return normalizeNotification({
    id: payload.notificationId || data.notificationId || null,
    channel: 'push',
    status: 'delivered',
    priority: payload.priority ?? data.priority ?? 2,
    createdAt: new Date().toISOString(),
    deliveredAt: new Date().toISOString(),
    eventType: payload.eventType || data.eventType || 'GENERAL_NOTIFICATION',
    title: payload.title,
    body: payload.body,
    data: {
      ...data,
      notificationId: payload.notificationId || data.notificationId || null,
      eventType: payload.eventType || data.eventType || null,
      url: payload.url || data.url || '/notifications',
      zoneName: payload.zoneName || data.zoneName || null,
    },
  });
}

export function sortNotifications(items = []) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || left?.sentAt || 0).getTime();
    const rightTime = new Date(right?.createdAt || right?.sentAt || 0).getTime();
    return rightTime - leftTime;
  });
}

export function countUnreadNotifications(items = []) {
  return items.reduce((count, item) => count + (item?.read ? 0 : 1), 0);
}

export function upsertNotificationItem(items = [], nextItem, { prepend = false } = {}) {
  const normalized = normalizeNotification(nextItem);
  if (!normalized?.id) return items;

  const nextItems = items.filter((item) => String(item?.id) !== normalized.id);
  return sortNotifications(prepend ? [normalized, ...nextItems] : [...nextItems, normalized]);
}

export function markNotificationsRead(items = [], ids = [], readAt = new Date().toISOString()) {
  const idSet = new Set((ids || []).map((id) => String(id)));
  return items.map((item) => {
    if (idSet.size > 0 && !idSet.has(String(item.id))) {
      return item;
    }
    return {
      ...item,
      read: true,
      readAt: item.readAt || readAt,
      deliveredAt: item.deliveredAt || readAt,
      status: 'read',
    };
  });
}

export function formatRelativeTime(value) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '';

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(timestamp));
}

export function groupNotificationsByDate(items = []) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });

  const sectionsByKey = new Map();
  sortNotifications(items).forEach((item) => {
    const date = new Date(item.createdAt || item.sentAt || Date.now());
    const key = Number.isNaN(date.getTime()) ? 'Unknown' : date.toDateString();
    if (!sectionsByKey.has(key)) {
      sectionsByKey.set(key, {
        title: key === new Date().toDateString()
          ? 'Today'
          : key === new Date(Date.now() - 86400000).toDateString()
            ? 'Yesterday'
            : formatter.format(date),
        data: [],
      });
    }
    sectionsByKey.get(key).data.push(item);
  });

  return Array.from(sectionsByKey.values());
}

export function getNotificationVisuals(notification) {
  const eventType = String(notification?.eventType || '').toUpperCase();
  const priority = Number(notification?.priority ?? 2);

  if (eventType.includes('ALERT') || eventType.includes('DANGER') || priority <= 1) {
    return {
      icon: 'warning',
      color: Colors.severityCritical,
      bg: 'rgba(239,68,68,0.12)',
      label: 'Alert',
    };
  }
  if (eventType.includes('INCIDENT') || eventType.includes('REPORT')) {
    return {
      icon: 'location',
      color: Colors.severityHigh,
      bg: 'rgba(249,115,22,0.12)',
      label: 'Incident',
    };
  }
  if (eventType.includes('RISK')) {
    return {
      icon: 'analytics',
      color: Colors.secondary,
      bg: 'rgba(29,78,216,0.12)',
      label: 'Risk',
    };
  }
  return {
    icon: 'notifications',
    color: Colors.primary,
    bg: Colors.violetLight,
    label: 'Update',
  };
}
