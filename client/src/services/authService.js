import { getUserRole, normalizeEmail } from '../utils/auth';
import {
  clearStoredSession,
  getStoredAccessToken,
  loadStoredSession,
  saveStoredSession,
} from './sessionStorage';
import { request } from './api';
import { initiateGoogleAuthFlow } from './googleAuth';

export {
  clearStoredSession,
  getStoredAccessToken,
  loadStoredSession,
  saveStoredSession,
};

export function normalizeAuthUser(user = {}, accessToken = null) {
  const roles = Array.isArray(user.roles) ? user.roles : [];
  const name = String(
    user.name
    || [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    || user.email
    || user.phone
    || 'SIARA User',
  ).trim();

  return {
    ...user,
    name,
    roles,
    role: getUserRole({ ...user, roles }),
    accessToken: accessToken || user.accessToken || user.token || null,
  };
}

export function createSessionFromAuthResult(result, rememberMe = false) {
  const accessToken = String(
    result?.accessToken
    || result?.token
    || '',
  ).trim();

  if (!accessToken) {
    throw new Error('Missing access token in authentication response.');
  }

  return {
    accessToken,
    rememberMe: rememberMe === true,
    user: normalizeAuthUser(result?.user || {}, accessToken),
  };
}

export function registerUser({ fullName, email, password, rememberMe = false }) {
  return request('/api/auth/register', {
    method: 'POST',
    body: {
      fullName: String(fullName || '').trim(),
      email: normalizeEmail(email),
      password,
      rememberMe: rememberMe === true,
    },
  });
}

export function loginUser({ email, password, rememberMe = false }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: {
      email: normalizeEmail(email),
      password,
      rememberMe: rememberMe === true,
    },
  });
}

export function confirmEmailVerification({ email, code, rememberMe = false }) {
  return request('/api/auth/verify-email/confirm', {
    method: 'POST',
    body: {
      email: normalizeEmail(email),
      code: String(code || '').trim(),
      rememberMe: rememberMe === true,
    },
  });
}

export function resendEmailVerification({ email }) {
  return request('/api/auth/verify-email/send', {
    method: 'POST',
    body: {
      email: normalizeEmail(email),
    },
  });
}

export function fetchCurrentUser(authToken) {
  return request('/api/auth/me', {
    authToken,
    withAuth: true,
  });
}

export async function logoutUser(authToken) {
  try {
    return await request('/api/auth/logout', {
      method: 'POST',
      authToken,
      withAuth: Boolean(authToken),
    });
  } catch {
    return null;
  }
}

export async function loginWithGoogle(rememberMe = false) {
  if (__DEV__) {
    console.info('[authService] Starting Google login flow');
  }

  try {
    // Step 1: Get ID token from Google via browser OAuth flow
    const idToken = await initiateGoogleAuthFlow();
    if (!idToken) {
      if (__DEV__) {
        console.warn('[authService] Google OAuth cancelled by user');
      }
      throw new Error('Google authentication was cancelled.');
    }

    if (__DEV__) {
      console.info('[authService] ID token received, exchanging with backend');
    }

    // Step 2: Exchange ID token with backend for app session
    const result = await request('/api/auth/google', {
      method: 'POST',
      body: {
        idToken,
        rememberMe: rememberMe === true,
      },
    });

    if (__DEV__) {
      console.info('[authService] Backend response received', {
        hasUser: Boolean(result?.user),
        hasAccessToken: Boolean(result?.accessToken),
        authenticated: result?.authenticated,
      });
    }

    return result;
  } catch (error) {
    if (__DEV__) {
      console.error('[authService] Google login failed', {
        message: error.message,
        status: error?.status,
        response: error?.response?.data,
      });
    }
    throw error;
  }
}
