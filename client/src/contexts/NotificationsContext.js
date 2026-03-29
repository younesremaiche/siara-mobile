import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../stores/authStore';
import {
  buildNotificationFromPushPayload,
  countUnreadNotifications,
  markNotificationsRead,
  normalizeNotification,
  upsertNotificationItem,
} from '../utils/notifications';
import {
  fetchNotifications,
  fetchNotificationPreferences,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  unregisterMobilePushDevice,
  updateNotificationPreferences,
} from '../services/notificationsService';
import { connectNotificationSocket, disconnectNotificationSocket } from '../services/notificationSocketService';
import { clearStoredPushRegistration } from '../services/mobilePushService';
import { navigateFromNotification } from '../navigation/navigationService';
import InAppNotificationBanner from '../components/notifications/InAppNotificationBanner';
import usePushRegistration from '../hooks/usePushRegistration';

const NotificationsContext = createContext(null);

function buildForegroundNotification(notificationResponse) {
  const content = notificationResponse?.request?.content || notificationResponse?.content || null;
  if (!content) return null;

  return buildNotificationFromPushPayload({
    notificationId: content.data?.notificationId || content.data?.id || null,
    eventType: content.data?.eventType || null,
    title: content.title,
    body: content.body,
    url: content.data?.url || '/notifications',
    priority: content.data?.priority || 2,
    zoneName: content.data?.zoneName || null,
    data: content.data || {},
  });
}

export function NotificationsProvider({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accessToken = useAuthStore((state) => state.token);
  const pushRegistrationUserId = useAuthStore((state) => (
    state.user?.id || state.user?.userId || state.user?.user_id || null
  ));

  const socketRef = useRef(null);
  const lastKnownAccessTokenRef = useRef(null);
  const registeredPushTokenRef = useRef(null);
  const lastBannerRef = useRef({ id: null, shownAt: 0 });
  const handledResponseIdsRef = useRef(new Set());
  const itemsRef = useRef([]);

  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [preferences, setPreferences] = useState(null);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [pushRegistrationError, setPushRegistrationError] = useState('');
  const [bannerNotification, setBannerNotification] = useState(null);
  const [pushDiagnostics, setPushDiagnostics] = useState({
    permissionGranted: null,
    permissionStatus: null,
    projectId: null,
    projectIdPresent: false,
    expoPushToken: null,
    expoPushTokenPresent: false,
    backendTokenRegisterSucceeded: null,
    backendTokenRegisterFailed: false,
    backendRegisteredUserId: null,
    backendStoredTokenPreview: null,
    lastForegroundNotification: null,
    lastNotificationResponse: null,
    lastError: '',
  });

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  if (accessToken) {
    lastKnownAccessTokenRef.current = accessToken;
  }

  const applyItems = useCallback((nextItems) => {
    const normalizedItems = nextItems.map(normalizeNotification).filter(Boolean);
    itemsRef.current = normalizedItems;
    setItems(normalizedItems);
    setUnreadCount(countUnreadNotifications(normalizedItems));
  }, []);

  const mergeItem = useCallback((notification, options = {}) => {
    const normalized = normalizeNotification(notification);
    if (!normalized?.id) return null;

    setItems((current) => {
      const nextItems = upsertNotificationItem(current, normalized, options);
      itemsRef.current = nextItems;
      setUnreadCount(countUnreadNotifications(nextItems));
      return nextItems;
    });

    return normalized;
  }, []);

  const showBanner = useCallback((notification) => {
    if (!notification?.id) return;
    const now = Date.now();
    if (lastBannerRef.current.id === notification.id && now - lastBannerRef.current.shownAt < 3000) {
      return;
    }

    lastBannerRef.current = { id: notification.id, shownAt: now };
    setBannerNotification(notification);
  }, []);

  useEffect(() => {
    if (!bannerNotification) return undefined;
    const timer = setTimeout(() => setBannerNotification(null), 4500);
    return () => clearTimeout(timer);
  }, [bannerNotification]);

  const refreshInbox = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated) return;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const [notificationsResult, count, prefs] = await Promise.all([
        fetchNotifications({ limit: 50, offset: 0 }),
        fetchUnreadNotificationCount(),
        fetchNotificationPreferences(),
      ]);

      applyItems(notificationsResult.items || []);
      setUnreadCount(count);
      setPreferences(prefs);
    } catch (nextError) {
      setError(nextError.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyItems, isAuthenticated]);

  const markOneRead = useCallback(async (notificationId) => {
    const target = String(notificationId || '').trim();
    if (!target) return null;

    const socket = socketRef.current;
    try {
      if (socket?.connected) {
        const ack = await new Promise((resolve) => {
          socket.emit('notification:read', { notificationId: target }, resolve);
        });
        if (ack?.ok && ack.notification) {
          return mergeItem(ack.notification);
        }
      }

      const updated = await markNotificationRead(target);
      if (updated) {
        return mergeItem(updated);
      }
      return null;
    } catch (nextError) {
      setError(nextError.message || 'Failed to mark notification as read.');
      return null;
    }
  }, [mergeItem]);

  const markAllRead = useCallback(async () => {
    const socket = socketRef.current;
    try {
      if (socket?.connected) {
        const ack = await new Promise((resolve) => {
          socket.emit('notification:readAll', {}, resolve);
        });
        if (ack?.ok) {
          setItems((current) => {
            const nextItems = markNotificationsRead(current, ack.ids || [], ack.readAt || new Date().toISOString());
            setUnreadCount(0);
            return nextItems;
          });
          return true;
        }
      }

      const result = await markAllNotificationsRead();
      setItems((current) => {
        const nextItems = markNotificationsRead(current, result.ids || [], result.readAt || new Date().toISOString());
        setUnreadCount(0);
        return nextItems;
      });
      return Boolean(result.ok);
    } catch (nextError) {
      setError(nextError.message || 'Failed to mark all notifications as read.');
      return false;
    }
  }, []);

  const openNotification = useCallback(async (notification) => {
    const normalized = normalizeNotification(notification);
    if (!normalized) return;

    if (!normalized.read && normalized.id) {
      await markOneRead(normalized.id);
    }

    navigateFromNotification(normalized);
  }, [markOneRead]);

  const updatePreferences = useCallback(async (patch) => {
    setPreferencesLoading(true);
    try {
      const nextPreferences = await updateNotificationPreferences(patch);
      setPreferences(nextPreferences);
      return nextPreferences;
    } catch (nextError) {
      setError(nextError.message || 'Failed to update notification preferences.');
      throw nextError;
    } finally {
      setPreferencesLoading(false);
    }
  }, []);

  const handleRegisteredPushToken = useCallback((token) => {
    registeredPushTokenRef.current = token || null;
    setPushRegistrationError('');
  }, []);

  const pushRegistration = usePushRegistration({
    isAuthenticated,
    accessToken,
    userId: pushRegistrationUserId,
    onRegisteredToken: handleRegisteredPushToken,
    onDiagnostics: setPushDiagnostics,
  });

  useEffect(() => {
    setPushRegistrationError(pushRegistration.error || '');
    if (pushRegistration.error) {
      setPushDiagnostics((current) => ({
        ...current,
        lastError: pushRegistration.error,
      }));
    }
  }, [pushRegistration.error]);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectNotificationSocket(socketRef.current);
      socketRef.current = null;

      const previousToken = registeredPushTokenRef.current;
      const authToken = lastKnownAccessTokenRef.current;
      if (previousToken && authToken) {
        unregisterMobilePushDevice(previousToken, authToken)
          .catch(() => {})
          .finally(() => {
            clearStoredPushRegistration(previousToken).catch(() => {});
          });
      } else {
        clearStoredPushRegistration().catch(() => {});
      }

      registeredPushTokenRef.current = null;
      applyItems([]);
      setPreferences(null);
      setError('');
      setPushRegistrationError('');
      setPushDiagnostics({
        permissionGranted: null,
        permissionStatus: null,
        projectId: null,
        projectIdPresent: false,
        expoPushToken: null,
        expoPushTokenPresent: false,
        backendTokenRegisterSucceeded: null,
        backendTokenRegisterFailed: false,
        backendRegisteredUserId: null,
        backendStoredTokenPreview: null,
        lastForegroundNotification: null,
        lastNotificationResponse: null,
        lastError: '',
      });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    refreshInbox().catch(() => {});
  }, [applyItems, isAuthenticated, refreshInbox]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return undefined;

    const socket = connectNotificationSocket(accessToken, {
      onCreated: (payload, activeSocket) => {
        const nextItem = normalizeNotification(payload);
        const alreadyKnown = nextItem?.id
          ? itemsRef.current.some((existing) => existing.id === nextItem.id)
          : false;
        const item = mergeItem(payload, { prepend: true });
        if (item?.id) {
          activeSocket.emit('notification:delivered', { notificationId: item.id });
          if (!alreadyKnown) {
            showBanner(item);
          }
        }
      },
      onUpdated: (payload) => {
        mergeItem(payload);
      },
      onAllRead: (payload) => {
        setItems((current) => {
          const nextItems = markNotificationsRead(current, payload?.ids || [], payload?.readAt || new Date().toISOString());
          setUnreadCount(0);
          return nextItems;
        });
      },
      onError: (socketError) => {
        setError(socketError?.message || 'Notification connection failed.');
      },
    });

    socketRef.current = socket;
    return () => {
      disconnectNotificationSocket(socketRef.current);
      socketRef.current = null;
    };
  }, [accessToken, isAuthenticated, mergeItem, showBanner]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      if (__DEV__) {
        console.info('[push] foreground_notification_received', {
          identifier: notification?.request?.identifier || null,
          title: notification?.request?.content?.title || null,
          data: notification?.request?.content?.data || {},
        });
      }
      setPushDiagnostics((current) => ({
        ...current,
        lastForegroundNotification: {
          identifier: notification?.request?.identifier || null,
          title: notification?.request?.content?.title || null,
          data: notification?.request?.content?.data || {},
        },
      }));
      const item = buildForegroundNotification(notification);
      if (!item) return;
      mergeItem(item, { prepend: true });
      showBanner(item);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const notificationId = String(response?.notification?.request?.identifier || response?.notification?.request?.content?.data?.notificationId || '').trim();
      if (__DEV__) {
        console.info('[push] notification_response_received', {
          identifier: response?.notification?.request?.identifier || null,
          actionIdentifier: response?.actionIdentifier || null,
          data: response?.notification?.request?.content?.data || {},
        });
      }
      setPushDiagnostics((current) => ({
        ...current,
        lastNotificationResponse: {
          identifier: response?.notification?.request?.identifier || null,
          actionIdentifier: response?.actionIdentifier || null,
          data: response?.notification?.request?.content?.data || {},
        },
      }));
      if (notificationId && handledResponseIdsRef.current.has(notificationId)) {
        return;
      }
      if (notificationId) handledResponseIdsRef.current.add(notificationId);

      const item = buildForegroundNotification(response.notification);
      if (!item) return;
      mergeItem(item, { prepend: true });
      openNotification(item).catch(() => {});
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response?.notification) return;
        if (__DEV__) {
          console.info('[push] last_notification_response_found', {
            identifier: response?.notification?.request?.identifier || null,
            notificationId: response?.notification?.request?.content?.data?.notificationId || null,
          });
        }
        const item = buildForegroundNotification(response.notification);
        if (!item?.id || handledResponseIdsRef.current.has(item.id)) return;
        handledResponseIdsRef.current.add(item.id);
        mergeItem(item, { prepend: true });
        openNotification(item).catch(() => {});
      })
      .catch(() => {});

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [mergeItem, openNotification, showBanner]);

  const contextValue = useMemo(() => ({
    items,
    unreadCount,
    loading,
    refreshing,
    error,
    preferences,
    preferencesLoading,
    pushRegistrationError,
    pushDiagnostics,
    refreshNotifications: () => refreshInbox({ silent: true }),
    markNotificationRead: markOneRead,
    markAllRead,
    openNotification,
    updatePreferences,
    dismissBanner: () => setBannerNotification(null),
  }), [
    error,
    items,
    loading,
    markAllRead,
    markOneRead,
    openNotification,
    preferences,
    preferencesLoading,
    pushRegistrationError,
    pushDiagnostics,
    refreshInbox,
    refreshing,
    unreadCount,
    updatePreferences,
  ]);

  return (
    <NotificationsContext.Provider value={contextValue}>
      {children}
      <InAppNotificationBanner
        notification={bannerNotification}
        onPress={() => {
          if (!bannerNotification) return;
          openNotification(bannerNotification).catch(() => {});
          setBannerNotification(null);
        }}
        onDismiss={() => setBannerNotification(null)}
      />
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
}
