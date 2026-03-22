import Constants from 'expo-constants';

function normalizeApiBaseUrl(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '') || null;
}

const configuredApiBaseUrl = normalizeApiBaseUrl(Constants.expoConfig?.extra?.apiBaseUrl);
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

export const API_BASE_URL = 'http://127.0.0.1:8000';

if (__DEV__) {
  console.info('[api] base_url_resolved', {
    apiBaseUrl: API_BASE_URL,
    configuredApiBaseUrl,
    defaultApiBaseUrl: DEFAULT_API_BASE_URL,
    source: configuredApiBaseUrl ? 'expoConfig.extra.apiBaseUrl' : 'default',
  });
}
