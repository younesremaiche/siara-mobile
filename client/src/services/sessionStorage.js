import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_STORAGE_KEY = 'siara_auth_session';
const LEGACY_USER_STORAGE_KEY = 'siara_user';

function parseStoredSession(rawValue) {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    if (typeof parsed?.accessToken !== 'string' || !parsed.accessToken.trim()) {
      return null;
    }

    return {
      accessToken: parsed.accessToken.trim(),
      rememberMe: parsed.rememberMe === true,
      user: parsed.user || null,
    };
  } catch {
    return null;
  }
}

async function migrateLegacySession() {
  try {
    const [[, sessionRaw], [, userRaw]] = await AsyncStorage.multiGet([
      SESSION_STORAGE_KEY,
      LEGACY_USER_STORAGE_KEY,
    ]);
    const legacySession = parseStoredSession(sessionRaw);

    if (legacySession?.accessToken) {
      return legacySession;
    }

    const legacyUser = userRaw ? JSON.parse(userRaw) : null;
    const accessToken =
      String(
        legacyUser?.accessToken
        || legacyUser?.token
        || '',
      ).trim() || null;

    if (!accessToken) {
      return null;
    }

    const migratedSession = {
      accessToken,
      rememberMe: false,
      user: legacyUser || null,
    };
    return migratedSession;
  } catch {
    return null;
  }
}

export async function loadStoredSession() {
  const storedSession = parseStoredSession(
    await AsyncStorage.getItem(SESSION_STORAGE_KEY),
  );
  if (storedSession?.accessToken) {
    return storedSession;
  }

  return migrateLegacySession();
}

export async function saveStoredSession(session) {
  if (!session?.accessToken) {
    await clearStoredSession();
    return null;
  }

  const storedSession = {
    accessToken: String(session.accessToken).trim(),
    rememberMe: session.rememberMe === true,
    user: session.user || null,
  };

  await AsyncStorage.multiSet([
    [SESSION_STORAGE_KEY, JSON.stringify(storedSession)],
    [LEGACY_USER_STORAGE_KEY, JSON.stringify(storedSession.user || null)],
  ]);

  return storedSession;
}

export async function getStoredAccessToken() {
  const storedSession = await loadStoredSession();
  return storedSession?.accessToken || null;
}

export async function clearStoredSession() {
  await AsyncStorage.multiRemove([
    SESSION_STORAGE_KEY,
    LEGACY_USER_STORAGE_KEY,
  ]).catch(() => {});
}
