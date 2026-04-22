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

function resolveApiBaseUrlWithDiagnostics() {
  const envBaseUrl = normalizeBaseUrl(process.env?.EXPO_PUBLIC_API_BASE_URL);
  if (envBaseUrl) {
    return {
      apiBaseUrl: envBaseUrl,
      resolutionSource: 'env',
    };
  }

  const runtimeBaseUrl = normalizeBaseUrl(Constants?.expoConfig?.extra?.apiBaseUrl);
  if (runtimeBaseUrl) {
    return {
      apiBaseUrl: runtimeBaseUrl,
      resolutionSource: 'runtime',
    };
  }

  if (__DEV__) {
    const inferredBaseUrl = inferDevApiBaseUrl();
    if (inferredBaseUrl) {
      return {
        apiBaseUrl: inferredBaseUrl,
        resolutionSource: 'expo-host',
      };
    }
  }

  return {
    apiBaseUrl: `http://localhost:${DEV_API_PORT}`,
    resolutionSource: 'localhost-fallback',
  };
}

const resolvedApiConfig = resolveApiBaseUrlWithDiagnostics();
export const API_BASE_URL = resolvedApiConfig.apiBaseUrl;
export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch (_error) {
    return API_BASE_URL.replace(/\/api\/?$/, '');
  }
})();
export const HEALTHCHECK_URL = `${API_ORIGIN}/health`;

export function getApiBaseUrlDiagnostics() {
  const usesLoopback = /localhost|127\.0\.0\.1/i.test(API_BASE_URL);

  return {
    apiBaseUrl: API_BASE_URL,
    apiOrigin: API_ORIGIN,
    healthcheckUrl: HEALTHCHECK_URL,
    resolutionSource: resolvedApiConfig.resolutionSource,
    usesLoopback,
    mode: __DEV__ ? 'development' : 'production',
  };
}

export function logResolvedApiBaseUrl() {
  if (didLogResolvedApiBaseUrl) {
    return;
  }

  didLogResolvedApiBaseUrl = true;
  const diagnostics = getApiBaseUrlDiagnostics();
  console.info('[config/api] resolved_api_base_url', {
    ...diagnostics,
    guidance: 'Set EXPO_PUBLIC_API_BASE_URL for physical-device testing if the inferred host is not correct.',
  });

  if (__DEV__ && diagnostics.usesLoopback) {
    console.warn(
      '[config/api] loopback base URL detected. Physical devices cannot reach localhost/127.0.0.1 on your development machine.',
    );
  }
}
