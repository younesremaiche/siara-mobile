const baseConfig = require('./app.json');

const STATIC_EXPO_CONFIG = baseConfig.expo || {};

module.exports = ({ config } = {}) => {
  const resolvedConfig = config && typeof config === 'object' ? config : STATIC_EXPO_CONFIG;
  const isDevBuild = process.env.NODE_ENV !== 'production';
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL
    || resolvedConfig?.extra?.apiBaseUrl
    || STATIC_EXPO_CONFIG?.extra?.apiBaseUrl
    || (isDevBuild ? 'http://127.0.0.1:5000' : undefined);
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    || resolvedConfig?.extra?.eas?.projectId
    || STATIC_EXPO_CONFIG?.extra?.eas?.projectId
    || null;

  return {
    ...resolvedConfig,
    android: {
      ...(resolvedConfig.android || {}),
      package: 'com.siara.mobile',
      googleServicesFile: './google-services.json',
    },
    extra: {
      ...(resolvedConfig.extra || {}),
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      eas: {
        ...(resolvedConfig.extra?.eas || {}),
        projectId,
      },
    },
    plugins: Array.from(
      new Set([...(resolvedConfig.plugins || []), 'expo-dev-client']),
    ),
  };
};
