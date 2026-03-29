/**
 * Google OAuth flow for Expo app
 * Uses expo-auth-session with the correct Expo AuthSession API
 * Compatible with development builds and custom-scheme redirects
 */

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

// Google OAuth application credentials
// Register at: https://console.cloud.google.com/apis/credentials
const GOOGLE_CLIENT_ID = '426680744492-pesf948u29q064s9t4anvqo513pidii8.apps.googleusercontent.com';

// IMPORTANT: Use the app scheme redirect for local mobile development builds.
// This generates: com.siara.mobile://oauth-callback
// Make sure app.json has: "scheme": "com.siara.mobile"

/**
 * Get the redirect URI for this app
 * In local mobile builds: com.siara.mobile://oauth-callback
 */
function getRedirectUri() {
  return AuthSession.makeRedirectUri({
    path: 'oauth-callback',
  });
}

/**
 * Initiate Google OAuth flow using Expo AuthSession
 * Handles the entire OAuth flow including browser opening and token exchange
 * Returns: { idToken }
 */
export async function initiateGoogleAuthFlow() {
  try {
    console.log('[googleAuth] Starting Google OAuth flow');

    // Get redirect URI for this app
    const redirectUri = getRedirectUri();
    console.log('[googleAuth] Redirect URI:', redirectUri);

    // Fetch Google's discovery document
    console.log('[googleAuth] Fetching Google discovery document');
    const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');

    if (!discovery?.authorization_endpoint || !discovery?.token_endpoint) {
      throw new Error('Failed to fetch Google discovery document');
    }

    console.log('[googleAuth] Discovery document fetched successfully');

    // Create the auth request with correct field names
    const authRequest = new AuthSession.AuthRequest({
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken, // Request ID token
      prompt: AuthSession.Prompt.Login, // Force login screen
    });

    console.log('[googleAuth] AuthRequest created, prompting user');

    // Prompt user and handle the entire OAuth flow
    const result = await authRequest.promptAsync(discovery);

    console.log('[googleAuth] Browser result:', { resultType: result.type });

    if (result.type === 'dismiss' || result.type === 'cancel') {
      throw new Error('Google authentication was cancelled by user');
    }

    if (result.type !== 'success') {
      throw new Error(`Google authentication failed: ${result.type}`);
    }

    // Extract ID token from response params
    const idToken = result.params?.id_token;

    if (!idToken) {
      console.error('[googleAuth] Response params:', result.params);
      throw new Error('No ID token received from Google');
    }

    console.log('[googleAuth] ID token received successfully (first 20 chars):', idToken.substring(0, 20) + '...');

    return {
      idToken,
    };
  } catch (error) {
    console.error('[googleAuth] Auth flow failed:', error.message);
    throw error;
  }
}

/**
 * Clean up WebBrowser session (called when app resumes)
 */
export async function maybeCompleteAuthSession() {
  try {
    await WebBrowser.maybeCompleteAuthSession();
  } catch (error) {
    console.warn('[googleAuth] maybeCompleteAuthSession error:', error);
  }
}

