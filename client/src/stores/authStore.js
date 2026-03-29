import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCurrentUser } from '../services/authService';
import { setInMemoryAccessToken } from '../services/api';
import { clearStoredSession } from '../services/sessionStorage';

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
    rememberMe: false,
    hasCheckedSession: false,
    isRestoringSession: false,
  };
}

/**
 * Build authenticated state from user and token
 * Uses normalized user.isAdmin flag (set by authService.normalizeUser)
 */
function buildAuthenticatedState(user, token, rememberMe = false) {
  const isAdmin = user?.isAdmin === true; // Use normalized isAdmin flag from user
  
  return {
    user,
    token,
    isAuthenticated: true,
    isAdmin,
    rememberMe,
    hasCheckedSession: true,
    isRestoringSession: false,
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
      rememberMe: false,
      hasCheckedSession: false,
      isRestoringSession: false,

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
              ...buildAuthenticatedState(user, state.token, state.rememberMe),
              hasCheckedSession: true,
            });
            return user;
          } catch (error) {
            console.warn('[authStore] Stored session invalid, clearing:', error.message);

            await get().clearSession();
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
      setAuthenticated: (user, token, rememberMe = false) => {
        console.log('[authStore] Setting authenticated user:', user?.id, 'isAdmin:', user?.isAdmin, 'rememberMe:', rememberMe);
        setInMemoryAccessToken(token);
        set({
          ...buildAuthenticatedState(user, token, rememberMe),
          hasCheckedSession: true,
        });

        if (!rememberMe) {
          console.log('[authStore] rememberMe is false, session will NOT persist');
        }
      },

      /**
       * Set user as unauthenticated and clear session
       */
      clearSession: async () => {
        console.log('[authStore] Clearing session');
        setInMemoryAccessToken(null);

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isAdmin: false,
          rememberMe: false,
          hasCheckedSession: true,
          isRestoringSession: false,
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
        set({ user });
      },

      /**
       * Update token (e.g., after refresh)
       */
      setToken: (token) => {
        set({ token });
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
