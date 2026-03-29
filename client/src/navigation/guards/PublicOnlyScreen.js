import React from 'react';
import { useAuthStore } from '../../stores/authStore';
import { getLoginRedirect } from '../routeAccess';

/**
 * PublicOnlyScreen wrapper
 * Allows only unauthenticated users to access
 * Authenticated users are redirected based on their role
 *
 * Usage:
 * <PublicOnlyScreen navigation={navigation} routeName="Login">
 *   <LoginScreen />
 * </PublicOnlyScreen>
 */
export function PublicOnlyScreen({
  children,
  routeName,
  navigation = null,
}) {
  const { isAuthenticated, isAdmin, user } = useAuthStore((state) => ({
    isAuthenticated: state.isAuthenticated,
    isAdmin: state.isAdmin,
    user: state.user,
  }));

  // If user is authenticated, redirect them away from login/register
  if (isAuthenticated && user) {
    console.warn(`[PublicOnlyScreen] Authenticated user tried to access: ${routeName}`);
    const redirect = getLoginRedirect(user);
    if (navigation) {
      // Use replace to prevent back navigation to login
      navigation.navigate(redirect.name, { ...redirect.params, replace: true });
    }
    return null;
  }

  // Unauthenticated users can access
  return children;
}
