// SIARA mobile API configuration.
// For physical-device LAN testing, the phone must talk to the backend over Wi-Fi.
// Never assume localhost/127.0.0.1 from the phone.

import Constants from 'expo-constants';

const DEV_LAN_API_BASE_URL = 'http://127.0.0.1:5000';
let didLogResolvedApiBaseUrl = false;

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveApiBaseUrl() {
  const envBaseUrl = normalizeBaseUrl(process.env?.EXPO_PUBLIC_API_BASE_URL);
  if (envBaseUrl) {
    return envBaseUrl;
  }

  const runtimeBaseUrl = normalizeBaseUrl(Constants?.expoConfig?.extra?.apiBaseUrl);
  if (runtimeBaseUrl) {
    return runtimeBaseUrl;
  }

  if (__DEV__) {
    return DEV_LAN_API_BASE_URL;
  }

  return DEV_LAN_API_BASE_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch (_error) {
    return API_BASE_URL.replace(/\/api\/?$/, '');
  }
})();
export const HEALTHCHECK_URL = `${API_ORIGIN}/health`;

export function logResolvedApiBaseUrl() {
  if (didLogResolvedApiBaseUrl) {
    return;
  }

  didLogResolvedApiBaseUrl = true;
  console.info('[config/api] resolved_api_base_url', {
    apiBaseUrl: API_BASE_URL,
    apiOrigin: API_ORIGIN,
    mode: __DEV__ ? 'development' : 'production',
  });
}
