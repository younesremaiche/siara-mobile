import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

let pendingNotificationTarget = null;

function buildNotificationRoute(notification) {
  const data = notification?.data || {};
  const rawUrl = String(
    notification?.data?.url
    || notification?.data?.reportUrl
    || notification?.data?.mapUrl
    || notification?.url
    || '/notifications',
  ).trim();
  const reportId = data.reportId || data.report_id || null;

  let pathname = '/notifications';
  try {
    pathname = new URL(rawUrl, 'https://siara.local').pathname || '/notifications';
  } catch (_error) {
    pathname = rawUrl.startsWith('/') ? rawUrl : '/notifications';
  }

  if (pathname.startsWith('/incident/') || reportId) {
    return {
      type: 'stack',
      routeName: 'IncidentDetail',
      params: {
        reportId: reportId || pathname.split('/').filter(Boolean).pop() || null,
        notificationId: notification?.id || data.notificationId || null,
      },
    };
  }

  if (pathname.startsWith('/alerts')) {
    return { type: 'stack', routeName: 'Alerts', params: {} };
  }

  if (pathname.startsWith('/map')) {
    return { type: 'tab', routeName: 'Map', params: {} };
  }

  if (pathname.startsWith('/profile')) {
    return { type: 'tab', routeName: 'Profile', params: {} };
  }

  return {
    type: 'stack',
    routeName: 'Notifications',
    params: {
      notificationId: notification?.id || data.notificationId || null,
    },
  };
}

function performNavigation(target) {
  if (!target) return false;

  if (target.type === 'tab') {
    navigationRef.navigate('UserStack', {
      screen: 'UserTabs',
      params: {
        screen: target.routeName,
        params: target.params || {},
      },
    });
    return true;
  }

  navigationRef.navigate(target.routeName, target.params || {});
  return true;
}

export function navigateFromNotification(notification) {
  const target = buildNotificationRoute(notification);
  if (!navigationRef.isReady()) {
    pendingNotificationTarget = target;
    return false;
  }
  return performNavigation(target);
}

export function flushPendingNotificationNavigation() {
  if (!pendingNotificationTarget || !navigationRef.isReady()) return;
  performNavigation(pendingNotificationTarget);
  pendingNotificationTarget = null;
}
