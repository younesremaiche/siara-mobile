import React, { createContext, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { setUnauthorizedHandler } from '../services/api';
import {
  loginUser,
  registerUser,
  loginWithGoogle as loginWithGoogleService,
  verifyEmailWithCode,
  resendVerificationCode,
  logoutUser,
} from '../services/authService';

/**
 * AuthContext
 * Wraps the Zustand auth store for backward compatibility with existing screens
 * Screens can still use useContext(AuthContext) to get auth state
 * Alternatively, screens can use the Zustand store directly with useAuthStore()
 */
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const authStore = useAuthStore();

  // Handle 401/403 responses from API
  useEffect(() => {
    setUnauthorizedHandler(() => {
      console.log('[AuthContext] Received 401/403 - clearing session');
      void authStore.clearSession();
    });
  }, [authStore]);

  // Provide store as context value for backward compatibility
  const contextValue = {
    user: authStore.user,
    setUser: authStore.setUser,
    token: authStore.token,
    setToken: authStore.setToken,
    isAuthenticated: authStore.isAuthenticated,
    isAdmin: authStore.isAdmin,
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
        await authStore.clearSession();
      }
    },
    loading: !authStore.hasCheckedSession || authStore.isRestoringSession,
    setAuthenticated: authStore.setAuthenticated,
    clearSession: authStore.clearSession,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
