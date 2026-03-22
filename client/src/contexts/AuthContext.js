import React, { createContext, useEffect, useState } from 'react';
import {
  clearStoredSession,
  confirmEmailVerification,
  createSessionFromAuthResult,
  fetchCurrentUser,
  loadStoredSession,
  loginUser,
  loginWithGoogle as loginUserWithGoogle,
  logoutUser,
  normalizeAuthUser,
  registerUser,
  resendEmailVerification,
  saveStoredSession,
} from '../services/authService';
import { setUnauthorizedHandler } from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const user = session?.user || null;
  const token = session?.accessToken || null;

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const storedSession = await loadStoredSession();
        if (!mounted || !storedSession?.accessToken) {
          return;
        }

        if (storedSession.user) {
          setSession(storedSession);
        }

        try {
          const response = await fetchCurrentUser(storedSession.accessToken);
          if (!mounted) {
            return;
          }

          const refreshedSession = {
            accessToken: storedSession.accessToken,
            rememberMe: storedSession.rememberMe === true,
            user: normalizeAuthUser(response?.user || storedSession.user || {}, storedSession.accessToken),
          };

          setSession(refreshedSession);
          await saveStoredSession(refreshedSession);
        } catch (error) {
          if (!mounted) {
            return;
          }

          const status = error?.status || error?.response?.status;
          if (status === 401 || status === 403) {
            setSession(null);
            await clearStoredSession();
            return;
          }

          if (storedSession.user) {
            setSession(storedSession);
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      setSession(null);
      await clearStoredSession();
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  async function applyAuthResult(result, rememberMe = false) {
    const nextSession = createSessionFromAuthResult(result, rememberMe);
    setSession(nextSession);
    await saveStoredSession(nextSession);
    return nextSession.user;
  }

  function setUser(nextUserOrUpdater) {
    setSession((currentSession) => {
      if (!currentSession) {
        return currentSession;
      }

      const resolvedUser =
        typeof nextUserOrUpdater === 'function'
          ? nextUserOrUpdater(currentSession.user || null)
          : nextUserOrUpdater;

      if (!resolvedUser) {
        return currentSession;
      }

      const nextSession = {
        ...currentSession,
        user: normalizeAuthUser(resolvedUser, currentSession.accessToken),
      };

      saveStoredSession(nextSession).catch(() => {});
      return nextSession;
    });
  }

  async function refreshUser(explicitToken = null) {
    const accessToken = explicitToken || token;
    if (!accessToken) {
      return null;
    }

    const response = await fetchCurrentUser(accessToken);
    const refreshedSession = {
      accessToken,
      rememberMe: session?.rememberMe === true,
      user: normalizeAuthUser(response?.user || {}, accessToken),
    };

    setSession(refreshedSession);
    await saveStoredSession(refreshedSession);
    return refreshedSession.user;
  }

  async function login(identifier, password, rememberMe = false) {
    const result = await loginUser({
      email: identifier,
      password,
      rememberMe,
    });

    return applyAuthResult(result, rememberMe);
  }

  async function register(fullNameOrValues, email, password, rememberMe = false) {
    if (fullNameOrValues && typeof fullNameOrValues === 'object') {
      return registerUser(fullNameOrValues);
    }

    return registerUser({
      fullName: fullNameOrValues,
      email,
      password,
      rememberMe,
    });
  }

  async function verifyEmail(email, code, rememberMe = false) {
    const result = await confirmEmailVerification({
      email,
      code,
      rememberMe,
    });

    return applyAuthResult(result, rememberMe);
  }

  function resendVerificationCode(email) {
    return resendEmailVerification({ email });
  }

  async function logout() {
    const currentToken = token;
    setSession(null);
    await clearStoredSession();
    await logoutUser(currentToken);
  }

  async function signInWithGoogle(rememberMe = false) {
    const result = await loginUserWithGoogle(rememberMe);
    return applyAuthResult(result, rememberMe);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        setUser,
        refreshUser,
        login,
        logout,
        register,
        verifyEmail,
        resendVerificationCode,
        signInWithGoogle,
        loginWithGoogle: signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
