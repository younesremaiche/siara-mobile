import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

// The Web Client ID is used so the returned ID token can be verified
// by the backend with google-auth-library (audience must match).
const WEB_CLIENT_ID = '426680744492-pesf948u29q064s9t4anvqo513pidii8.apps.googleusercontent.com';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

/**
 * Native Google Sign-In — same pattern as the web version's Google Identity Services.
 * Returns { idToken } which the backend verifies directly with google-auth-library.
 * No redirect URIs, no client secret, no browser popup needed.
 */
export async function initiateGoogleAuthFlow() {
  ensureConfigured();

  try {
    console.log('[googleAuth] Checking Google Play Services');
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    console.log('[googleAuth] Starting native Google Sign-In');
    const response = await GoogleSignin.signIn();

    const idToken = response.data?.idToken ?? response.idToken ?? null;

    if (!idToken) {
      console.error('[googleAuth] Sign-in response missing idToken:', JSON.stringify(response));
      throw new Error('Google Sign-In did not return an ID token. Check your Android OAuth client configuration.');
    }

    console.log('[googleAuth] ID token received successfully');
    return { idToken };
  } catch (error) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new Error('Google authentication was cancelled');
    }
    if (error.code === statusCodes.IN_PROGRESS) {
      throw new Error('Google Sign-In is already in progress');
    }
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play Services is not available on this device');
    }
    console.error('[googleAuth] Native sign-in failed:', error.code, error.message);
    throw new Error(error.message || 'Google Sign-In failed');
  }
}

/**
 * Sign out from Google (call on app logout to clear cached credentials).
 */
export async function googleSignOut() {
  try {
    ensureConfigured();
    await GoogleSignin.signOut();
    console.log('[googleAuth] Google sign-out complete');
  } catch (error) {
    console.warn('[googleAuth] Google sign-out error:', error.message);
  }
}

/**
 * No-op on native — kept for API compatibility with App.js call.
 */
export function maybeCompleteAuthSession() {}
