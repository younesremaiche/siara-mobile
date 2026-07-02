// SIARA mobile API configuration.
// EAS and local Expo builds should set EXPO_PUBLIC_API_URL.
// The hosted SIARA API remains the fallback so mobile builds never target a
// development machine, emulator loopback address, or database directly.

import Constants from 'expo-constants';

const DEFAULT_API_URL = 'https://siara-api.onrender.com';
let didLogResolvedApiBaseUrl = false;

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveApiBaseUrlWithDiagnostics() {
  const envBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL);
  if (envBaseUrl) {
    return {
      apiBaseUrl: envBaseUrl,
      resolutionSource: 'env',
    };
  }

  const runtimeBaseUrl = normalizeBaseUrl(Constants?.expoConfig?.extra?.apiUrl);
  if (runtimeBaseUrl) {
    return {
      apiBaseUrl: runtimeBaseUrl,
      resolutionSource: 'runtime',
    };
  }

  return {
    apiBaseUrl: DEFAULT_API_URL,
    resolutionSource: 'hosted-default',
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
export const HEALTHCHECK_URL = `${API_ORIGIN}/api/auth/session`;

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
    guidance: `Set EXPO_PUBLIC_API_URL=${DEFAULT_API_URL} for local and EAS builds.`,
  });

  if (diagnostics.usesLoopback) {
    console.warn(
      `[config/api] loopback base URL detected. Set EXPO_PUBLIC_API_URL=${DEFAULT_API_URL}.`,
    );
  }
}
