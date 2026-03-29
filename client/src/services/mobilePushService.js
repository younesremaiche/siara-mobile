import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { API_BASE_URL, HEALTHCHECK_URL } from '../config/api';

const PUSH_REGISTRATION_CACHE_KEY = 'siara-mobile-push-registration';
const PUSH_REGISTRATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
export const DEFAULT_NOTIFICATION_CHANNEL_ID = 'default';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function previewToken(value) {
  const token = String(value || '').trim();
  if (!token) return null;
  if (token.length <= 18) return token;
  return `${token.slice(0, 12)}...${token.slice(-6)}`;
}

function serializeErrorDetails(error) {
  const normalized = error && typeof error === 'object' ? error : {};
  let serialized = null;

  try {
    serialized = JSON.stringify(normalized, Object.getOwnPropertyNames(normalized));
  } catch (_error) {
    serialized = null;
  }

  return {
    name: normalized?.name || null,
    code: normalized?.code || null,
    message: normalized?.message || String(error || ''),
    stack: normalized?.stack || null,
    stringValue: String(error || ''),
    serialized,
  };
}

function buildCachedRegistrationShape(rawValue) {
  const value = normalizeObject(rawValue);
  return {
    userId: value.userId ? String(value.userId) : null,
    token: value.token ? String(value.token) : null,
    platform: value.platform ? String(value.platform) : null,
    provider: value.provider ? String(value.provider) : null,
    appVersion: value.appVersion ? String(value.appVersion) : null,
    deviceName: value.deviceName ? String(value.deviceName) : null,
    registeredAt: Number(value.registeredAt || 0) || 0,
  };
}

export async function ensureNotificationChannelAsync() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL_ID, {
    name: 'SIARA Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#7A3DF0',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  if (__DEV__) {
    const channel = await Notifications.getNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL_ID);
    console.info('[push] android_channel_ready', {
      channelId: DEFAULT_NOTIFICATION_CHANNEL_ID,
      importance: channel?.importance ?? Notifications.AndroidImportance.HIGH,
      sound: channel?.sound ?? 'default',
    });
  }
}

export async function requestNotificationPermissionsAsync() {
  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;

  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (__DEV__) {
    console.info('[push] permission_status', {
      existingStatus: existing.status,
      finalStatus,
      granted: finalStatus === 'granted',
    });
  }

  return {
    granted: finalStatus === 'granted',
    status: finalStatus,
  };
}

export async function initializeNotificationPresentationAsync() {
  await ensureNotificationChannelAsync();

  if (__DEV__) {
    console.info('[push] notification_handler_ready', {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  }
}

function resolveExpoProjectId() {
  const expoConfigProjectId = Constants?.expoConfig?.extra?.eas?.projectId;
  if (expoConfigProjectId) {
    return {
      projectId: expoConfigProjectId,
      source: 'expoConfig.extra.eas.projectId',
    };
  }

  const easConfigProjectId = Constants?.easConfig?.projectId;
  if (easConfigProjectId) {
    return {
      projectId: easConfigProjectId,
      source: 'Constants.easConfig.projectId',
    };
  }

  const envProjectId = process.env?.EXPO_PUBLIC_EAS_PROJECT_ID || null;
  if (envProjectId) {
    return {
      projectId: envProjectId,
      source: 'env fallback',
    };
  }

  return {
    projectId: null,
    source: 'missing',
  };
}

function shouldSyncRegistration(cachedRegistration, registration, userId) {
  if (!cachedRegistration?.token || !cachedRegistration?.userId) {
    return true;
  }

  if (String(cachedRegistration.userId) !== String(userId)) {
    return true;
  }

  if (cachedRegistration.token !== registration.token) {
    return true;
  }

  if (cachedRegistration.platform !== registration.platform || cachedRegistration.provider !== registration.provider) {
    return true;
  }

  if ((Date.now() - Number(cachedRegistration.registeredAt || 0)) > PUSH_REGISTRATION_CACHE_TTL_MS) {
    return true;
  }

  return false;
}

export async function readStoredPushRegistration() {
  try {
    const rawValue = await AsyncStorage.getItem(PUSH_REGISTRATION_CACHE_KEY);
    if (!rawValue) return null;
    return buildCachedRegistrationShape(JSON.parse(rawValue));
  } catch (_error) {
    return null;
  }
}

export async function persistStoredPushRegistration({ userId, registration }) {
  if (!registration?.token || !userId) {
    return;
  }

  const payload = {
    userId: String(userId),
    token: registration.token,
    platform: registration.platform,
    provider: registration.provider,
    appVersion: registration.appVersion || null,
    deviceName: registration.deviceName || null,
    registeredAt: Date.now(),
  };

  await AsyncStorage.setItem(PUSH_REGISTRATION_CACHE_KEY, JSON.stringify(payload));
}

export async function clearStoredPushRegistration(expectedToken = null) {
  if (!expectedToken) {
    await AsyncStorage.removeItem(PUSH_REGISTRATION_CACHE_KEY);
    return;
  }

  const cached = await readStoredPushRegistration();
  if (!cached?.token || cached.token === expectedToken) {
    await AsyncStorage.removeItem(PUSH_REGISTRATION_CACHE_KEY);
  }
}

export async function checkBackendReachabilityAsync() {
  let timeout = null;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    timeout = setTimeout(() => controller?.abort(), 3500);
    const response = await fetch(HEALTHCHECK_URL, {
      method: 'GET',
      signal: controller?.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        url: HEALTHCHECK_URL,
        message: `Health check failed with status ${response.status}`,
      };
    }

    return {
      ok: true,
      url: HEALTHCHECK_URL,
      message: `Backend reachable at ${API_BASE_URL}`,
    };
  } catch (error) {
    return {
      ok: false,
      url: HEALTHCHECK_URL,
      message: error?.message || 'Health check failed.',
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function registerForPushNotificationsAsync({ userId, force = false } = {}) {
  if (!userId) {
    throw new Error('Push registration requires an authenticated user.');
  }

  const isDevice = Boolean(Device.isDevice);
  if (__DEV__) {
    console.info('[push] device_check', { isDevice });
  }

  if (!isDevice) {
    const deviceError = new Error('Push notifications require a physical Android or iOS device.');
    deviceError.code = 'not_physical_device';
    deviceError.isDevice = isDevice;
    throw deviceError;
  }

  await ensureNotificationChannelAsync();

  const reachability = await checkBackendReachabilityAsync();
  if (__DEV__) {
    console.info('[push] backend_health', reachability);
  }

  const permissions = await requestNotificationPermissionsAsync();
  if (!permissions.granted) {
    const permissionError = new Error('Push notification permission was not granted on this device.');
    permissionError.permissionStatus = permissions.status;
    permissionError.permissionGranted = false;
    throw permissionError;
  }

  const { projectId, source: projectIdSource } = resolveExpoProjectId();
  if (__DEV__) {
    console.info('[push] project_id_resolved', {
      projectId,
      source: projectIdSource,
    });
  }
  if (!projectId) {
    const missingProjectIdError = new Error(
      'missing_project_id: Set EXPO_PUBLIC_EAS_PROJECT_ID in client/.env.development, rebuild the development client, and then retry push registration.',
    );
    missingProjectIdError.code = 'missing_project_id';
    missingProjectIdError.projectId = null;
    missingProjectIdError.projectIdSource = projectIdSource;
    missingProjectIdError.permissionStatus = permissions.status;
    missingProjectIdError.permissionGranted = permissions.granted;
    missingProjectIdError.isDevice = isDevice;

    if (__DEV__) {
      console.error('[push] missing_project_id', {
        hint: 'Set EXPO_PUBLIC_EAS_PROJECT_ID in client/.env.development, rebuild the dev client, and retry.',
        androidPackage: Constants?.expoConfig?.android?.package || null,
        appOwnership: Constants?.appOwnership || null,
      });
    }

    throw missingProjectIdError;
  }

  let tokenResponse = null;
  try {
    if (__DEV__) {
      console.info('[push] expo_push_token_request_started');
    }
    tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  } catch (error) {
    const errorDetails = serializeErrorDetails(error);
    if (__DEV__) {
      console.error('[push] expo_push_token_error', {
        name: errorDetails.name,
        code: errorDetails.code,
        message: errorDetails.message,
        stack: errorDetails.stack,
        projectId,
        isDevice,
        permissionGranted: permissions.granted,
        serialized: errorDetails.serialized,
        stringValue: errorDetails.stringValue,
      });
      console.error('[push] expo_push_token_error_summary', {
        code: errorDetails.code,
        message: errorDetails.message,
        projectId,
        permissionGranted: permissions.granted,
        isDevice,
      });
    }
    const wrappedError = new Error(
      `${errorDetails.message || 'Failed to obtain Expo push token.'} Verify EXPO_PUBLIC_EAS_PROJECT_ID and rebuild the development client.`,
    );
    wrappedError.name = errorDetails.name || 'ExpoPushTokenError';
    wrappedError.code = errorDetails.code || null;
    wrappedError.stack = errorDetails.stack || wrappedError.stack;
    wrappedError.projectId = projectId;
    wrappedError.projectIdSource = projectIdSource;
    wrappedError.isDevice = isDevice;
    wrappedError.permissionStatus = permissions.status;
    wrappedError.permissionGranted = permissions.granted;
    throw wrappedError;
  }

  const registration = {
    token: tokenResponse.data,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    provider: 'expo',
    appVersion:
      Constants?.expoConfig?.version
      || Constants?.manifest2?.extra?.expoClient?.version
      || null,
    deviceName: Device.deviceName || Device.modelName || null,
  };

  if (__DEV__) {
    console.info('[push] expo_push_token_obtained', {
      token: registration.token,
      tokenPreview: previewToken(registration.token),
      platform: registration.platform,
      provider: registration.provider,
    });
  }

  const cachedRegistration = await readStoredPushRegistration();
  if (__DEV__) {
    console.info('[push] registration_state', {
      currentDeviceToken: registration.token,
      cachedToken: cachedRegistration?.token || null,
      cachedUserId: cachedRegistration?.userId || null,
      shouldSyncBackend: force || shouldSyncRegistration(cachedRegistration, registration, userId),
    });
  }

  return {
    registration,
    reachability,
    permissions,
    isDevice,
    projectId,
    projectIdSource,
    cachedRegistration,
    shouldSyncBackend: force || shouldSyncRegistration(cachedRegistration, registration, userId),
  };
}
