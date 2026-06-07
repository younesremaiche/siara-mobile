import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCurrentUser } from '../services/authService';
import { setInMemoryAccessToken } from '../services/api';
import { clearStoredSession } from '../services/sessionStorage';

const USER_MODE = 'user';
const POLICE_MODE = 'police';
const SUPERVISOR_MODE = 'supervisor';

function resolveActiveMode(user, requestedMode = USER_MODE) {
  if (requestedMode === SUPERVISOR_MODE && user?.isSupervisor === true) {
    return SUPERVISOR_MODE;
  }
  if (requestedMode === POLICE_MODE && user?.isPolice === true) {
    return POLICE_MODE;
  }
  return USER_MODE;
}

/**
 * Custom storage adapter for Zustand with AsyncStorage
 * This allows Zustand's persist middleware to work with React Native's AsyncStorage
 */
const zustandAsyncStorage = createJSONStorage(() => ({
  getItem: async (name) => {
    try {
      const value = await AsyncStorage.getItem(name);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`[AsyncStorage] Failed to get ${name}:`, error);
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, JSON.stringify(value));
    } catch (error) {
      console.error(`[AsyncStorage] Failed to set ${name}:`, error);
    }
  },
  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (error) {
      console.error(`[AsyncStorage] Failed to remove ${name}:`, error);
    }
  },
}));

/**
 * Build logged-out state
 */
function buildLoggedOutState() {
  return {
    user: null,
    token: null,
    isAuthenticated: false,
    isAdmin: false,
    isPolice: false,
    isSupervisor: false,
    activeMode: USER_MODE,
    rememberMe: false,
    hasCheckedSession: false,
    isRestoringSession: false,
  };
}

function buildAuthenticatedState(user, token, rememberMe = false, activeMode = USER_MODE) {
  const isAdmin = user?.isAdmin === true;
  const isPolice = user?.isPolice === true;
  const isSupervisor = user?.isSupervisor === true;

  return {
    user,
    token,
    isAuthenticated: true,
    isAdmin,
    isPolice,
    isSupervisor,
    activeMode: resolveActiveMode(user, activeMode),
    rememberMe,
    hasCheckedSession: true,
    isRestoringSession: false,
    // A successful (re)authentication clears any lingering end-of-session notice.
    sessionNotice: null,
  };
}

/**
 * Zustand auth store with persistence
 * Uses AsyncStorage to persist only if rememberMe is true
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      user: null,
      token: null,
      isAuthenticated: false,
      isAdmin: false,
      isPolice: false,
      isSupervisor: false,
      activeMode: USER_MODE,
      rememberMe: false,
      hasCheckedSession: false,
      isRestoringSession: false,
      // Transient, user-facing reason the session ended (ban / forced re-login /
      // expiry). Not persisted; consumed by the SessionNoticeBanner.
      sessionNotice: null,

      setSessionNotice: (notice) => {
        set({ sessionNotice: notice || null });
      },

      clearSessionNotice: () => {
        set({ sessionNotice: null });
      },

      markSessionChecked: () => {
        set({
          hasCheckedSession: true,
          isRestoringSession: false,
        });
      },

      /**
       * Restore session from server
       * Called on app launch to validate stored token
       */
      restoreSession: async () => {
        set({ isRestoringSession: true });
        try {
          const state = get();
          
          // If no stored session, mark as checked
          if (!state.token) {
            console.log('[authStore] No stored token found');
            setInMemoryAccessToken(null);
            set({
              ...buildLoggedOutState(),
              hasCheckedSession: true,
              isRestoringSession: false,
            });
            return null;
          }

          console.log('[authStore] Found stored token, validating with server');
          setInMemoryAccessToken(state.token);

          try {
            // Validate token with server
            const user = await fetchCurrentUser();
            console.log('[authStore] Session validated, user:', user?.id);

            set({
              ...buildAuthenticatedState(user, state.token, state.rememberMe, state.activeMode),
              hasCheckedSession: true,
            });
            return user;
          } catch (error) {
            const status = error?.status;
            if (status === 401 || status === 403) {
              // The global unauthorized handler already cleared the session and
              // set any user-facing notice; don't double-clear (which would wipe
              // the notice). Just mark the session as checked.
              console.warn('[authStore] Stored session rejected by server:', error.message);
              set({ hasCheckedSession: true, isRestoringSession: false });
            } else {
              // Network / unexpected error — keep prior behavior and clear.
              console.warn('[authStore] Stored session invalid, clearing:', error.message);
              await get().clearSession();
            }
            return null;
          }
        } catch (error) {
          console.error('[authStore] Failed to restore session:', error);
          setInMemoryAccessToken(null);
          set({
            ...buildLoggedOutState(),
            hasCheckedSession: true,
            isRestoringSession: false,
          });
          return null;
        }
      },

      /**
       * Set user as authenticated with rememberMe flag
       */
      setAuthenticated: (user, token, rememberMe = false, activeMode = USER_MODE) => {
        console.log('[authStore] Setting authenticated user:', user?.id, 'isAdmin:', user?.isAdmin, 'rememberMe:', rememberMe);
        setInMemoryAccessToken(token);
        set({
          ...buildAuthenticatedState(user, token, rememberMe, activeMode),
          hasCheckedSession: true,
        });

        if (!rememberMe) {
          console.log('[authStore] rememberMe is false, session will NOT persist');
        }
      },

      /**
       * Re-validate the current session against the server (e.g. when the app
       * returns to the foreground). On a 401/403 the global unauthorized handler
       * tears the session down and posts a notice; other errors are ignored so a
       * transient network blip doesn't log the user out.
       */
      revalidateSession: async () => {
        const state = get();
        if (!state.isAuthenticated || !state.token) return null;
        try {
          const user = await fetchCurrentUser();
          set({
            ...buildAuthenticatedState(user, state.token, state.rememberMe, state.activeMode),
          });
          return user;
        } catch (error) {
          // 401/403 already handled by setUnauthorizedHandler; swallow the rest.
          return null;
        }
      },

      /**
       * Set user as unauthenticated and clear session.
       * Accepts an optional { notice } to surface why the session ended.
       */
      clearSession: async ({ notice = null } = {}) => {
        console.log('[authStore] Clearing session');
        setInMemoryAccessToken(null);

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isAdmin: false,
          isPolice: false,
          isSupervisor: false,
          activeMode: USER_MODE,
          rememberMe: false,
          hasCheckedSession: true,
          isRestoringSession: false,
          sessionNotice: notice,
        });

        try {
          await Promise.all([
            AsyncStorage.removeItem('siara-auth-store'),
            clearStoredSession(),
          ]);
        } catch (error) {
          console.error('[authStore] Failed to clear stored session data:', error);
        }
      },

      /**
       * Update user object (e.g., after profile update)
       */
      setUser: (user) => {
        set((state) => ({
          user,
          isAdmin: user?.isAdmin === true,
          isPolice: user?.isPolice === true,
          isSupervisor: user?.isSupervisor === true,
          activeMode: resolveActiveMode(user, state.activeMode),
        }));
      },

      /**
       * Update token (e.g., after refresh)
       */
      setToken: (token) => {
        set({ token });
      },

      /**
       * Update current UI mode
       */
      setActiveMode: (mode) => {
        set((state) => ({
          activeMode: resolveActiveMode(state.user, mode),
        }));
      },

      switchToUserMode: () => {
        set({ activeMode: USER_MODE });
      },

      switchToPoliceMode: () => {
        set((state) => ({
          activeMode: resolveActiveMode(state.user, POLICE_MODE),
        }));
      },

      switchToSupervisorMode: () => {
        set((state) => ({
          activeMode: resolveActiveMode(state.user, SUPERVISOR_MODE),
        }));
      },
    }),
    {
      name: 'siara-auth-store',
      storage: zustandAsyncStorage,
      // Only persist these fields when rememberMe is true
      partialize: (state) => {
        // Only persist if rememberMe is enabled
        if (!state.rememberMe) {
          return {
            user: null,
            token: null,
            rememberMe: false,
          };
        }

        return {
          user: state.user,
          token: state.token,
          activeMode: state.activeMode,
          rememberMe: state.rememberMe,
        };
      },
      // Rehydrate (restore from storage) when store initializes
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[authStore] Failed to rehydrate from storage:', error);
          setInMemoryAccessToken(null);
          state?.markSessionChecked?.();
          return;
        }

        console.log('[authStore] Successfully rehydrated from storage');

        if (state?.token) {
          setInMemoryAccessToken(state.token);
          void state.restoreSession();
          return;
        }

        setInMemoryAccessToken(null);
        state?.markSessionChecked?.();
      },
    }
  )
);

/**
 * Selector: Get user
 */
export const selectUser = (state) => state.user;

/**
 * Selector: Get token
 */
export const selectToken = (state) => state.token;

/**
 * Selector: Is authenticated
 */
export const selectIsAuthenticated = (state) => state.isAuthenticated;

/**
 * Selector: Is admin
 */
export const selectIsAdmin = (state) => state.isAdmin;

/**
 * Selector: Is hydrated (session checked)
 */
export const selectIsHydrated = (state) => state.hasCheckedSession;

/**
 * Selector: Is restoring session
 */
export const selectIsRestoringSession = (state) => state.isRestoringSession;

/**
 * Selector: Remember me flag
 */
export const selectRememberMe = (state) => state.rememberMe;

/**
 * Selector: Active UI mode
 */
export const selectActiveMode = (state) => state.activeMode;
