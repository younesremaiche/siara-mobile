/**
 * Route access helpers
 * Logic for determining route redirect behavior based on authentication and role
 * Mirrors the web repo's auth routing patterns
 */

/**
 * Check if user has admin role
 * Handles both user.role and user.roles array formats
 */
export function isAdminUser(user) {
  if (!user) return false;
  if (Array.isArray(user.roles)) {
    return user.roles.includes('admin');
  }
  return user.role === 'admin';
}

/**
 * Get the default landing route based on user role and verification status
 * Called after successful login/register/verification
 */
export function getAuthenticatedRedirect(user, isEmailVerified = true) {
  // If email not verified, send to verify email screen
  if (!isEmailVerified) {
    return {
      name: 'VerifyEmail',
      params: { email: user?.email },
    };
  }

  // If admin, send to admin overview
  if (isAdminUser(user)) {
    return {
      name: 'AdminPanel',
    };
  }

  // Otherwise send to user home
  return {
    name: 'UserTabs',
  };
}

/**
 * Get the login redirect route
 * Used when user tries to access login/register while authenticated
 */
export function getLoginRedirect(user) {
  if (isAdminUser(user)) {
    return {
      name: 'AdminPanel',
    };
  }
  return {
    name: 'UserTabs',
  };
}

/**
 * Check if a route is public (accessible to both authenticated and unauthenticated users)
 */
export const PUBLIC_ROUTES = [
  'About',
  'Description',
  'Predictions',
  'Alerts',
  'AlertsDetail',
  'CreateAlert',
  'Notifications',
  'IncidentDetail',
  'ReportIncident',
  'Contact',
  'Services',
  'Settings',
];

export function isPublicRoute(routeName) {
  return PUBLIC_ROUTES.includes(routeName);
}

/**
 * Check if a route is public-only (accessible only to unauthenticated users)
 * For example: Login, Register, VerifyEmail
 */
export const PUBLIC_ONLY_ROUTES = ['Login', 'Register', 'VerifyEmail'];

export function isPublicOnlyRoute(routeName) {
  return PUBLIC_ONLY_ROUTES.includes(routeName);
}

/**
 * Check if a route is admin-only
 */
export const ADMIN_ONLY_ROUTES = [
  'AdminPanel',
  'AdminOverview',
  'AdminIncidents',
  'AdminIncidentReview',
  'AdminAlerts',
  'AdminAI',
  'AdminUsers',
  'AdminZones',
  'AdminSystem',
  'AdminAnalytics',
  'AdminDashboard',
];

export function isAdminRoute(routeName) {
  return ADMIN_ONLY_ROUTES.includes(routeName);
}

/**
 * Built-in routes group mapping
 * Used by navigation to determine which navigator to show
 */
export const ROUTE_GROUPS = {
  PUBLIC_ONLY: 'PUBLIC_ONLY', // Login, Register
  PUBLIC: 'PUBLIC', // About, Description, etc
  USER: 'USER', // Home, Dashboard, etc (requires auth, non-admin)
  ADMIN: 'ADMIN', // Admin screens (requires admin role)
};

/**
 * Get the route group for a given route name
 */
export function getRouteGroup(routeName, user = null) {
  if (isPublicOnlyRoute(routeName)) {
    return ROUTE_GROUPS.PUBLIC_ONLY;
  }
  if (isPublicRoute(routeName)) {
    return ROUTE_GROUPS.PUBLIC;
  }
  if (isAdminRoute(routeName)) {
    return ROUTE_GROUPS.ADMIN;
  }
  return ROUTE_GROUPS.USER;
}

/**
 * Determine if user can access a route
 */
export function canAccessRoute(routeName, isAuthenticated, isAdmin) {
  const group = getRouteGroup(routeName);

  switch (group) {
    case ROUTE_GROUPS.PUBLIC_ONLY:
      // Only unauthenticated users can access
      return !isAuthenticated;

    case ROUTE_GROUPS.PUBLIC:
      // Everyone can access
      return true;

    case ROUTE_GROUPS.ADMIN:
      // Only authenticated admins can access
      return isAuthenticated && isAdmin;

    case ROUTE_GROUPS.USER:
      // Authenticated non-admins can access
      return isAuthenticated && !isAdmin;

    default:
      return false;
  }
}

/**
 * Get redirect for accidental route access based on current auth state
 */
export function getRedirectForDeniedRoute(routeName, isAuthenticated, isAdmin, user) {
  const group = getRouteGroup(routeName);

  // If unauthenticated and trying to access protected route
  if (!isAuthenticated) {
    // Can't access user or admin routes, redirect to login
    if (group === ROUTE_GROUPS.USER || group === ROUTE_GROUPS.ADMIN) {
      return { name: 'Login' };
    }
  }

  // If authenticated and trying to access public-only route
  if (isAuthenticated && group === ROUTE_GROUPS.PUBLIC_ONLY) {
    return getLoginRedirect(user);
  }

  // If authenticated admin trying to access user-only route
  if (isAuthenticated && isAdmin && group === ROUTE_GROUPS.USER) {
    return { name: 'AdminPanel' };
  }

  // If authenticated non-admin trying to access admin routes
  if (isAuthenticated && !isAdmin && group === ROUTE_GROUPS.ADMIN) {
    return { name: 'UserTabs' };
  }

  // No redirect needed
  return null;
}
