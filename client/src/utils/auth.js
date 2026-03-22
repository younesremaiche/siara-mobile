const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value) {
  return EMAIL_REGEX.test(normalizeEmail(value));
}

export function getAuthErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return (
    error?.response?.data?.message
    || error?.message
    || fallback
  );
}

export function getUserRole(user) {
  if (!user) return 'user';

  if (typeof user.role === 'string' && user.role.trim()) {
    return user.role.trim().toLowerCase();
  }

  const roles = Array.isArray(user.roles) ? user.roles.map((role) => String(role).toLowerCase()) : [];
  if (roles.includes('admin') || roles.includes('super_admin')) {
    return 'admin';
  }

  return roles[0] || 'user';
}

export function getPostAuthRoute(user) {
  return getUserRole(user) === 'admin' ? 'AdminPanel' : 'UserTabs';
}

export function validateLoginForm({ email, password }) {
  const errors = {};

  if (!normalizeEmail(email)) {
    errors.email = 'Email is required';
  } else if (!isValidEmail(email)) {
    errors.email = 'Email is invalid';
  }

  if (!String(password || '').trim()) {
    errors.password = 'Password is required';
  }

  return errors;
}

export function validateRegisterForm({
  fullName,
  email,
  password,
  confirmPassword,
  agreeTerms,
}) {
  const errors = {};

  if (!String(fullName || '').trim()) {
    errors.fullName = 'Full name is required';
  }

  if (!normalizeEmail(email)) {
    errors.email = 'Email is required';
  } else if (!isValidEmail(email)) {
    errors.email = 'Email is invalid';
  }

  if (!String(password || '')) {
    errors.password = 'Password is required';
  } else if (String(password).length < 8) {
    errors.password = 'Password must be at least 8 characters long';
  }

  if (!String(confirmPassword || '')) {
    errors.confirmPassword = 'Confirm password is required';
  } else if (String(password) !== String(confirmPassword)) {
    errors.confirmPassword = 'Passwords do not match';
  }

  if (!agreeTerms) {
    errors.terms = 'You must agree to the terms';
  }

  return errors;
}

export function buildVerificationNotice({ emailSent, isResend = false }) {
  if (emailSent === false) {
    return 'Your account was created, but the verification email could not be delivered yet. You can resend the code below.';
  }

  if (isResend) {
    return 'A new 6-digit verification code was sent. Enter it below to finish signing in.';
  }

  return 'A 6-digit verification code was sent. Enter it below to verify your email address.';
}
