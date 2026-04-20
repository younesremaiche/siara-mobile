// SIARA mobile API configuration.
// Prefer EXPO_PUBLIC_API_BASE_URL or runtime extra.apiBaseUrl for real devices.
// If neither is set in development, we try to infer the Expo host machine LAN IP.

import Constants from 'expo-constants';

const DEV_API_PORT = '5000';
let didLogResolvedApiBaseUrl = false;

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function inferDevApiBaseUrl() {
  const hostCandidates = [
    Constants?.expoConfig?.hostUri,
    Constants?.manifest2?.extra?.expoGo?.debuggerHost,
    Constants?.manifest?.debuggerHost,
  ];

  for (const candidate of hostCandidates) {
    const normalizedCandidate = normalizeBaseUrl(candidate);
    if (!normalizedCandidate) {
      continue;
    }

    const host = normalizedCandidate.split(':')[0];
    if (!host) {
      continue;
    }

    return `http://${host}:${DEV_API_PORT}`;
  }

  return '';
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
    const inferredBaseUrl = inferDevApiBaseUrl();
    if (inferredBaseUrl) {
      return inferredBaseUrl;
    }
  }

  return `http://localhost:${DEV_API_PORT}`;
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
    guidance: 'Set EXPO_PUBLIC_API_BASE_URL for physical-device testing if the inferred host is not correct.',
  });
}
