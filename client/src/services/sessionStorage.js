import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'siara_auth_session';
const TOKEN_KEY = 'siara_auth_token';

/**
 * Save complete auth session (token + user data)
 */
export async function saveStoredSession(session) {
  try {
    if (!session) {
      await clearStoredSession();
      return;
    }
    const sessionJson = JSON.stringify(session);
    await AsyncStorage.setItem(SESSION_KEY, sessionJson);
    if (session.token || session.accessToken) {
      await AsyncStorage.setItem(TOKEN_KEY, session.token || session.accessToken);
    }
    console.log('[SessionStorage] Session saved');
  } catch (error) {
    console.error('[SessionStorage] Failed to save session:', error);
    throw error;
  }
}

/**
 * Load complete auth session
 */
export async function loadStoredSession() {
  try {
    const sessionJson = await AsyncStorage.getItem(SESSION_KEY);
    if (!sessionJson) {
      console.log('[SessionStorage] No stored session found');
      return null;
    }
    const session = JSON.parse(sessionJson);
    console.log('[SessionStorage] Session loaded', { userId: session.user?.id });
    return session;
  } catch (error) {
    console.error('[SessionStorage] Failed to load session:', error);
    return null;
  }
}

/**
 * Get stored access token for Bearer requests
 */
export async function getStoredAccessToken() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) {
      console.log('[SessionStorage] No stored token found');
      return null;
    }
    return token;
  } catch (error) {
    console.error('[SessionStorage] Failed to get token:', error);
    return null;
  }
}

/**
 * Clear all auth session data
 */
export async function clearStoredSession() {
  try {
    await Promise.all([
      AsyncStorage.removeItem(SESSION_KEY),
      AsyncStorage.removeItem(TOKEN_KEY),
    ]);
    console.log('[SessionStorage] Session cleared');
  } catch (error) {
    console.error('[SessionStorage] Failed to clear session:', error);
    throw error;
  }
}
