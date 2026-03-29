import React from 'react';
import { useAuthStore } from '../../stores/authStore';
import { canAccessRoute, getRedirectForDeniedRoute } from '../routeAccess';

/**
 * ProtectedScreen wrapper
 * Enforces authentication, role checks, and redirects if needed
 *
 * Usage:
 * <ProtectedScreen
 *   requiredRoles={['admin']} // optional, for role-specific screens
 *   onDenied={() => navigation.navigate('Home')} // optional callback
 * >
 *   <YourScreen />
 * </ProtectedScreen>
 */
export function ProtectedScreen({
  children,
  routeName,
  requiredRoles = [], // e.g., ['admin']
  allowedRoles = null, // if specified, only these roles allowed
  navigation = null,
}) {
  const { isAuthenticated, isAdmin, user } = useAuthStore((state) => ({
    isAuthenticated: state.isAuthenticated,
    isAdmin: state.isAdmin,
    user: state.user,
  }));

  // Check basic authentication
  if (!isAuthenticated) {
    console.warn(`[ProtectedScreen] Unauthenticated user tried to access protected route: ${routeName}`);
    if (navigation) {
      navigation.navigate('Login');
    }
    return null;
  }

  // Check role requirements if specified
  if (allowedRoles && !allowedRoles.includes(isAdmin ? 'admin' : 'user')) {
    console.warn(`[ProtectedScreen] User without required role tried to access: ${routeName}`);
    const redirect = getRedirectForDeniedRoute(routeName, isAuthenticated, isAdmin, user);
    if (navigation && redirect) {
      navigation.navigate(redirect.name, redirect.params);
    }
    return null;
  }

  if (requiredRoles.length > 0) {
    const hasRequiredRole =
      (requiredRoles.includes('admin') && isAdmin) || (requiredRoles.includes('user') && !isAdmin);

    if (!hasRequiredRole) {
      console.warn(`[ProtectedScreen] User without required role tried to access: ${routeName}`);
      const redirect = getRedirectForDeniedRoute(routeName, isAuthenticated, isAdmin, user);
      if (navigation && redirect) {
        navigation.navigate(redirect.name, redirect.params);
      }
      return null;
    }
  }

  // All checks passed
  return children;
}
