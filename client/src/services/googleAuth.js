import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '426680744492-pesf948u29q064s9t4anvqo513pidii8.apps.googleusercontent.com';
const DISCOVERY_DOCUMENT = 'https://accounts.google.com/.well-known/openid-configuration';

if (__DEV__) {
  console.info('[googleAuth] Google OAuth configuration loaded', {
    clientId: GOOGLE_CLIENT_ID,
    discoveryUrl: DISCOVERY_DOCUMENT,
  });
}

/**
 * Generate the redirect URI for Google OAuth
 * Returns a proper deep link that works with Expo Go
 */
export function getGoogleRedirectUri() {
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: Constants.expoConfig?.scheme || 'com.siara.mobile',
    path: 'auth/google/callback',
  });

  if (__DEV__) {
    console.info('[googleAuth] Generated redirect URI', { redirectUri });
  }

  return redirectUri;
}

/**
 * Start Google OAuth flow and return ID token
 * Uses browser-based authentication compatible with Expo Go
 */
export async function initiateGoogleAuthFlow() {
  try {
    if (__DEV__) {
      console.info('[googleAuth] Starting Google OAuth flow');
    }

    // Ensure browser can be used
    await WebBrowser.warmUpAsync();

    const redirectUri = getGoogleRedirectUri();
    const scopes = ['openid', 'profile', 'email'];

    if (__DEV__) {
      console.info('[googleAuth] Generated redirect URI', { redirectUri });
    }

    // Fetch Google's discovery document
    const discovery = await AuthSession.fetchDiscoveryAsync(DISCOVERY_DOCUMENT);

    if (__DEV__) {
      console.info('[googleAuth] Discovery document fetched', {
        authorizationUrl: discovery?.authorizationUrl ? 'present' : 'missing',
        tokenUrl: discovery?.tokenUrl ? 'present' : 'missing',
      });
    }

    // Create auth request with correct field names
    const authRequest = new AuthSession.AuthRequest({
      clientId: GOOGLE_CLIENT_ID,
      scopes,
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      prompt: AuthSession.Prompt.Login,
    });

    if (__DEV__) {
      console.info('[googleAuth] Auth request created', {
        clientId: authRequest.clientId,
        redirectUri: authRequest.redirectUri,
        scopes: authRequest.scopes,
        responseType: authRequest.responseType,
        prompt: authRequest.prompt,
      });
    }

    // Prompt for authorization with discovery document
    const result = await authRequest.promptAsync(discovery, { useProxy: false });

    if (__DEV__) {
      console.info('[googleAuth] Auth result received', {
        type: result.type,
        hasParams: Boolean(result.params),
        hasError: Boolean(result.error),
        errorCode: result.error?.code,
      });
    }

    // Handle cancel
    if (result.type === 'cancel') {
      if (__DEV__) {
        console.warn('[googleAuth] User cancelled Google sign-in');
      }
      return null;
    }

    // Handle error
    if (result.type === 'error') {
      if (__DEV__) {
        console.error('[googleAuth] Google OAuth error', {
          code: result.error?.code,
          message: result.error?.message,
        });
      }
      throw new Error(`Google OAuth failed: ${result.error?.message || 'Unknown error'}`);
    }

    // Extract ID token from response params
    const idToken = result.params?.id_token;
    if (!idToken) {
      if (__DEV__) {
        console.error('[googleAuth] No ID token in response', {
          paramsKeys: result.params ? Object.keys(result.params) : 'no params',
        });
      }
      throw new Error('No ID token received from Google');
    }

    if (__DEV__) {
      console.info('[googleAuth] ID token received successfully', {
        tokenLength: idToken.length,
      });
    }

    return idToken;
  } catch (error) {
    if (__DEV__) {
      console.error('[googleAuth] Google auth flow error', {
        message: error.message,
        stack: error.stack,
      });
    }
    throw error;
  } finally {
    // Clean up browser
    await WebBrowser.coolDownAsync().catch(() => {});
  }
}

/**
 * Complete the OAuth flow by calling WebBrowser.maybeCompleteAuthSession
 * Call this in your deep link handler or app initialization
 */
export function maybeCompleteAuthSession() {
  if (__DEV__) {
    console.info('[googleAuth] Checking for OAuth callback');
  }
  return WebBrowser.maybeCompleteAuthSession();
}

if (__DEV__) {
  console.info('[googleAuth] Service loaded');
}
