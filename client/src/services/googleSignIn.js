const DISABLED_REASON = 'Google sign-in coming later.';

if (__DEV__) {
  console.info('[google-auth] disabled_for_expo_go', {
    enabled: false,
    reason: DISABLED_REASON,
  });
}

export function maskClientId() {
  return 'disabled';
}

export function isNativeGoogleSignInAvailable() {
  return false;
}

export function getGoogleSignInConfig() {
  return {
    executionEnvironment: 'storeClient',
    isExpoGo: true,
    nativeGoogleActive: false,
    flow: 'disabled',
    webClientId: null,
    androidClientId: null,
    iosClientId: null,
    iosUrlScheme: null,
    clientIdSource: 'disabled',
    configured: false,
    nativeModuleAvailable: false,
    nativeModuleError: DISABLED_REASON,
  };
}

export function ensureGoogleSignInConfigured() {
  return {
    config: getGoogleSignInConfig(),
    disabledReason: DISABLED_REASON,
  };
}

export function getGoogleSignInDisabledReason() {
  return DISABLED_REASON;
}

export function isGoogleCancellationError(error) {
  return error?.code === 'SIGN_IN_CANCELLED';
}

export async function signInWithNativeGoogle() {
  const error = new Error(DISABLED_REASON);
  error.code = 'GOOGLE_DISABLED';
  throw error;
}

export async function clearNativeGoogleSession() {
  return null;
}

export const googleStatusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
};
