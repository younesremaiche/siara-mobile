const { expo } = require('./app.json');

function resolveEnvValue(name, fallback = '') {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
}

module.exports = () => {
  const extra = expo.extra || {};

  return {
    ...expo,
    extra: {
      ...extra,
      apiBaseUrl: resolveEnvValue(
        'EXPO_PUBLIC_API_BASE_URL',
        extra.apiBaseUrl || 'http://10.92.182.21:8000',
      ),
    },
  };
};
