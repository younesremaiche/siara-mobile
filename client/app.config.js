const baseConfig = require('./app.json');

const STATIC_EXPO_CONFIG = baseConfig.expo || {};
const DEFAULT_API_URL = 'https://siara-api.onrender.com';

module.exports = ({ config } = {}) => {
  const resolvedConfig = config && typeof config === 'object' ? config : STATIC_EXPO_CONFIG;
  const apiUrl =
    process.env.EXPO_PUBLIC_API_URL
    || resolvedConfig?.extra?.apiUrl
    || STATIC_EXPO_CONFIG?.extra?.apiUrl
    || DEFAULT_API_URL;
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
      apiUrl,
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
