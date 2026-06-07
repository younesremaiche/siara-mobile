import React from 'react';
import { useAuthStore } from '../../stores/authStore';
import { getRedirectForDeniedRoute } from '../routeAccess';

/**
 * ProtectedScreen wrapper
 * Enforces authentication, role checks, and redirects if needed.
 *
 * NOTE: Access control today is enforced structurally by AppNavigator's
 * role-gated Stack.Groups (a wrong-role screen is never registered). This wrapper
 * is a role-complete (admin/user/police/supervisor) defense-in-depth option kept
 * for deep-link / programmatic-navigation hardening; it is intentionally not
 * mounted yet. Keep it in sync with the auth store roles if you wire it up.
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
  const { isAuthenticated, isAdmin, isPolice, isSupervisor, user } = useAuthStore((state) => ({
    isAuthenticated: state.isAuthenticated,
    isAdmin: state.isAdmin,
    isPolice: state.isPolice,
    isSupervisor: state.isSupervisor,
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
  const currentRoles = [];
  if (isAdmin) {
    currentRoles.push('admin');
  }
  if (isAuthenticated && !isAdmin) {
    currentRoles.push('user');
  }
  if (isPolice) {
    currentRoles.push('police');
  }
  if (isSupervisor) {
    currentRoles.push('supervisor');
  }

  if (allowedRoles && !allowedRoles.some((role) => currentRoles.includes(role))) {
    console.warn(`[ProtectedScreen] User without required role tried to access: ${routeName}`);
    const redirect = getRedirectForDeniedRoute(routeName, isAuthenticated, isAdmin, user, isPolice, isSupervisor);
    if (navigation && redirect) {
      navigation.navigate(redirect.name, redirect.params);
    }
    return null;
  }

  if (requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.some((role) => currentRoles.includes(role));

    if (!hasRequiredRole) {
      console.warn(`[ProtectedScreen] User without required role tried to access: ${routeName}`);
      const redirect = getRedirectForDeniedRoute(routeName, isAuthenticated, isAdmin, user, isPolice, isSupervisor);
      if (navigation && redirect) {
        navigation.navigate(redirect.name, redirect.params);
      }
      return null;
    }
  }

  // All checks passed
  return children;
}
