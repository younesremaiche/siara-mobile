import { request as apiRequest } from './api';

/**
 * Normalize user role
 * Accepts either user.role string or user.roles array
 * Returns true if admin, false otherwise
 */
export function normalizeUser(user) {
  if (!user) return { ...user, isAdmin: false };
  
  const isAdmin = Array.isArray(user.roles) 
    ? user.roles.includes('admin')
    : user.role === 'admin';
  
  return {
    ...user,
    isAdmin,
    role: user.role || (user.roles?.[0] || null), // Ensure role field exists
  };
}

/**
 * Login with email and password
 * Throws error with code === 'EMAIL_VERIFICATION_REQUIRED' if user email not verified
 * Returns { token, user } - caller updates Zustand store
 * 
 * Error codes:
 * - INVALID_CREDENTIALS: email/password combination is wrong
 * - EMAIL_NOT_FOUND: user with this email does not exist
 * - INVALID_PASSWORD: password is incorrect (if backend distinguishes)
 * - EMAIL_VERIFICATION_REQUIRED: user exists but email not verified
 */
export async function loginUser(email, password) {
  try {
    if (!email || !password) {
      throw new Error('Missing email or password');
    }

    console.log('[authService] Attempting login for:', email.toLowerCase());

    const response = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.toLowerCase(), password }),
    });

    console.log('[authService] Login successful for:', email.toLowerCase());

    // Handle both 'token' and 'accessToken' field names
    const token = response.token || response.accessToken;
    if (!token) {
      throw new Error('No token in response');
    }

    const user = normalizeUser(response.user);
    console.log('[authService] User normalized, role:', user.role, 'isAdmin:', user.isAdmin);

    return {
      token,
      user,
      timestamp: Date.now(),
    };
  } catch (error) {
    // Preserve error code from API for caller to handle
    const enhancedError = new Error(error.message || 'Login failed');
    enhancedError.code = error.code;
    enhancedError.status = error.status;
    enhancedError.response = error.response;

    console.error('[authService] Login failed:', error?.message, 'code:', error?.code);
    throw enhancedError;
  }
}

/**
 * Register new user
 * Returns either:
 * - { ok: true, requiresEmailVerification: true, email, resendAvailableAt, emailSent }
 * - { ok: true, user, token } (for instant login, rare)
 * Caller updates Zustand store
 */
export async function registerUser(fullName, email, password) {
  try {
    if (!fullName || !email || !password) {
      throw new Error('Missing fullName, email, or password');
    }

    console.log('[authService] Sending register request with fullName:', fullName?.trim());

    const response = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName: fullName.trim(), email: email.toLowerCase(), password }),
    });

    console.log('[authService] Register response:', { ok: response.ok, requiresEmailVerification: response.requiresEmailVerification, emailSent: response.emailSent });

    // If email verification is required, return metadata without a token
    if (response.requiresEmailVerification) {
      return {
        ok: true,
        requiresEmailVerification: true,
        email: response.email,
        resendAvailableAt: response.resendAvailableAt,
        emailSent: response.emailSent,
      };
    }

    // Otherwise, if token is provided, return user data (caller updates store)
    const token = response.token || response.accessToken;
    if (token) {
      const user = normalizeUser(response.user);
      return { ok: true, user, token };
    }

    throw new Error('No token or email verification flag in register response');
  } catch (error) {
    console.error('[authService] Register failed:', error?.message);
    throw error;
  }
}

/**
 * Resend verification code to email
 */
export async function resendVerificationCode(email) {
  try {
    if (!email) {
      throw new Error('Email is required');
    }

    console.log('[authService] Resending verification code to:', email);

    const response = await apiRequest('/api/auth/verify-email/send', {
      method: 'POST',
      body: JSON.stringify({ email: email.toLowerCase() }),
    });

    console.log('[authService] Resend response:', { ok: response.ok, resendAvailableAt: response.resendAvailableAt });

    return {
      ok: response.ok,
      resendAvailableAt: response.resendAvailableAt,
      emailSent: response.emailSent,
    };
  } catch (error) {
    console.error('[authService] Resend verification code failed:', error?.message);
    throw error;
  }
}

/**
 * Verify email with OTP code (after registration)
 * Returns { ok: true, user, token } - caller updates Zustand store
 */
export async function verifyEmailWithCode(email, code) {
  try {
    if (!email || !code) {
      throw new Error('Email and verification code are required');
    }

    console.log('[authService] Verifying email with code for:', email.toLowerCase());

    const response = await apiRequest('/api/auth/verify-email/confirm', {
      method: 'POST',
      body: JSON.stringify({ email: email.toLowerCase(), code }),
    });

    console.log('[authService] Email verification successful for:', email.toLowerCase());

    const token = response.token || response.accessToken;
    if (!token) {
      throw new Error('No token in response');
    }

    const user = normalizeUser(response.user);
    return { ok: true, user, token };
  } catch (error) {
    console.error('[authService] Email verification failed:', error?.message);
    throw error;
  }
}

/**
 * Login with Google OAuth
 * idToken: JWT token from Google OAuth flow
 * Returns { token, user } - caller updates Zustand store
 */
export async function loginWithGoogle(idToken) {
  try {
    if (!idToken) {
      throw new Error('Google ID token is required');
    }

    console.log('[authService] Sending Google idToken to backend');

    const response = await apiRequest('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });

    const token = response.token || response.accessToken;
    if (!token) {
      throw new Error('No token in response from Google login');
    }

    const user = normalizeUser(response.user);
    console.log('[authService] Google login successful, user:', user?.id, 'isAdmin:', user?.isAdmin);

    return {
      token,
      user,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('[authService] Google login failed:', error.message);
    throw error;
  }
}

/**
 * Fetch current user (protected endpoint, requires auth)
 * Returns user object
 */
export async function fetchCurrentUser() {
  try {
    const response = await apiRequest('/api/auth/me', {
      method: 'GET',
      withAuth: true, // This will add Bearer token
    });

    return normalizeUser(response.user);
  } catch (error) {
    console.error('[authService] Fetch current user failed:', error);
    throw error;
  }
}

/**
 * Logout (calls backend)
 * Local session is cleared by caller (Zustand store)
 */
export async function logoutUser() {
  try {
    // Call backend logout endpoint
    await apiRequest('/api/auth/logout', {
      method: 'POST',
      withAuth: true,
    }).catch((error) => {
      // Even if logout fails on server, client will clear local session
      console.warn('[authService] Logout API call failed (client will clear session):', error);
    });
  } catch (error) {
    console.warn('[authService] Logout error:', error);
  }
}

// Legacy exports for backward compatibility
export async function login(email, password) {
  return loginUser(email, password);
}

export async function logout() {
  return logoutUser();
}
