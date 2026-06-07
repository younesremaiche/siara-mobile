import React, { createContext, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { setUnauthorizedHandler } from '../services/api';
import { clearServerState } from '../services/query/queryClient';
import SessionNoticeBanner from '../components/SessionNoticeBanner';
import {
  loginUser,
  registerUser,
  loginWithGoogle as loginWithGoogleService,
  verifyEmailWithCode,
  resendVerificationCode,
  logoutUser,
} from '../services/authService';

// Minimum gap between foreground session re-checks, to avoid revalidating on
// every brief app switch.
const REVALIDATE_THROTTLE_MS = 30 * 1000;

/**
 * Translate a 401/403 API failure into a user-facing reason the session ended.
 * 401 = expired/missing token; 403 = forced re-login (session_version bump) or a
 * blocked account (ACCOUNT_BANNED / ACCOUNT_INACTIVE).
 */
function buildSessionNotice(info = {}) {
  const { status, code, response } = info;
  if (code === 'ACCOUNT_BANNED') {
    const ban = response?.ban || null;
    const reason = ban?.reason ? ` Reason: ${ban.reason}.` : '';
    return {
      type: 'banned',
      title: 'Account blocked',
      message: `Your account has been suspended.${reason} Contact support if you believe this is a mistake.`,
      ban,
    };
  }
  if (code === 'ACCOUNT_INACTIVE') {
    return {
      type: 'inactive',
      title: 'Account inactive',
      message: 'Your account is not active. Please contact support to restore access.',
    };
  }
  if (status === 403) {
    return {
      type: 'session',
      title: 'Session ended',
      message: 'Your session is no longer valid. Please sign in again.',
    };
  }
  return {
    type: 'expired',
    title: 'Session expired',
    message: 'Your session has expired. Please sign in again.',
  };
}

/**
 * AuthContext
 * Wraps the Zustand auth store for backward compatibility with existing screens
 * Screens can still use useContext(AuthContext) to get auth state
 * Alternatively, screens can use the Zustand store directly with useAuthStore()
 */
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const authStore = useAuthStore();
  const lastRevalidatedRef = useRef(0);

  // Handle 401/403 responses from API. Registered once; reads the latest store
  // via getState() so it doesn't re-register on every state change.
  useEffect(() => {
    setUnauthorizedHandler((info = {}) => {
      const notice = buildSessionNotice(info);
      console.log('[AuthContext] Unauthorized', info?.status, info?.code, '- clearing session');
      clearServerState();
      void useAuthStore.getState().clearSession({ notice });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Re-validate the session whenever the app returns to the foreground, so a
  // ban or forced re-login (session_version bump) is surfaced proactively
  // instead of waiting for the next user-triggered request to 403.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      const { isAuthenticated, revalidateSession } = useAuthStore.getState();
      if (!isAuthenticated) return;
      const now = Date.now();
      if (now - lastRevalidatedRef.current < REVALIDATE_THROTTLE_MS) return;
      lastRevalidatedRef.current = now;
      void revalidateSession();
    });
    return () => subscription.remove();
  }, []);

  // Provide store as context value for backward compatibility
  const contextValue = {
    user: authStore.user,
    setUser: authStore.setUser,
    token: authStore.token,
    setToken: authStore.setToken,
    isAuthenticated: authStore.isAuthenticated,
    isAdmin: authStore.isAdmin,
    isPolice: authStore.isPolice,
    isSupervisor: authStore.isSupervisor,
    activeMode: authStore.activeMode,
    hasCheckedSession: authStore.hasCheckedSession,
    rememberMe: authStore.rememberMe,
    
    // Auth methods
    login: async (email, password, rememberMe = false) => {
      const result = await loginUser(email, password);
      authStore.setAuthenticated(result.user, result.token, rememberMe);
      return result.user;
    },
    register: async (fullName, email, password, rememberMe = false) => {
      const result = await registerUser(fullName, email, password);

      if (result.user && result.token) {
        authStore.setAuthenticated(result.user, result.token, rememberMe);
      }

      return result;
    },
    loginWithGoogle: async (idToken, rememberMe = false) => {
      const result = await loginWithGoogleService(idToken);
      authStore.setAuthenticated(result.user, result.token, rememberMe);
      return result.user;
    },
    verifyEmail: async (email, code, rememberMe = false) => {
      const result = await verifyEmailWithCode(email, code);
      authStore.setAuthenticated(result.user, result.token, rememberMe);
      return result;
    },
    resendCode: resendVerificationCode,
    logout: async () => {
      try {
        await logoutUser();
      } catch (error) {
        console.warn('[AuthContext] Logout API call failed:', error?.message);
      } finally {
        clearServerState();
        await authStore.clearSession();
      }
    },
    loading: !authStore.hasCheckedSession || authStore.isRestoringSession,
    setAuthenticated: authStore.setAuthenticated,
    clearSession: authStore.clearSession,
    setActiveMode: authStore.setActiveMode,
    switchToUserMode: authStore.switchToUserMode,
    switchToPoliceMode: authStore.switchToPoliceMode,
    switchToSupervisorMode: authStore.switchToSupervisorMode,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      <SessionNoticeBanner />
    </AuthContext.Provider>
  );
}
