import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  StatusBar,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { verifyEmailWithCode, resendVerificationCode } from '../../services/authService';
import { useAuthStore } from '../../stores/authStore';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';

export default function VerifyEmailScreen({ route, navigation }) {
  const { email: initialEmail, resendAvailableAt: initialResendAt, rememberMe: initialRememberMe } = route.params || {};

  const [code, setCode] = useState('');
  const [email, setEmail] = useState(initialEmail || '');
  const [rememberMe, setRememberMe] = useState(initialRememberMe || false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [resendAvailableAt, setResendAvailableAt] = useState(initialResendAt ? new Date(initialResendAt) : null);
  const [countdown, setCountdown] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(null);
  const [currentAttempt, setCurrentAttempt] = useState(null);

  // Countdown timer for resend button
  useEffect(() => {
    if (!resendAvailableAt) {
      setCountdown(0);
      return;
    }

    const timer = setInterval(() => {
      const now = new Date();
      const seconds = Math.max(0, Math.floor((resendAvailableAt - now) / 1000));
      setCountdown(seconds);

      if (seconds <= 0) {
        setResendAvailableAt(null);
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [resendAvailableAt]);

  async function handleVerifyCode() {
    if (!code || code.trim().length === 0) {
      setError('Please enter the verification code');
      return;
    }

    if (!email || email.trim().length === 0) {
      setError('Email address is missing');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      console.log('[VerifyEmailScreen] Verifying code for:', email, 'rememberMe:', rememberMe);
      const result = await verifyEmailWithCode(email.trim(), code.trim());
      console.log('[VerifyEmailScreen] Email verification successful, user id:', result.user?.id, 'isAdmin:', result.user?.isAdmin);

      setSuccessMessage('✓ Email verified successfully!');
      setCode('');

      // Update Zustand store with result
      useAuthStore.getState().setAuthenticated(result.user, result.token, rememberMe);
      // Navigation will happen automatically when auth store updates (AppNavigator re-renders)
      console.log('[VerifyEmailScreen] Auth store updated, AppNavigator will handle navigation');
    } catch (e) {
      console.error('[VerifyEmailScreen] Verification error:', e.message);
      
      // Extract attempt info if available
      if (e.response?.attempt && e.response?.maxAttempts) {
        setCurrentAttempt(e.response.attempt);
        setMaxAttempts(e.response.maxAttempts);
        setError(`Invalid code. Attempt ${e.response.attempt}/${e.response.maxAttempts}`);
      } else {
        setError(e.message || 'Verification failed. Please check your code and try again.');
      }
    }
    setLoading(false);
  }

  async function handleResendCode() {
    if (!email || email.trim().length === 0) {
      setError('Email address is missing');
      return;
    }

    setResendLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      console.log('[VerifyEmailScreen] Resending verification code to:', email);
      const result = await resendVerificationCode(email.trim());
      console.log('[VerifyEmailScreen] Resend successful, resendAvailableAt:', result.resendAvailableAt);

      setSuccessMessage('✓ Verification code sent!');
      setCode('');

      // Update resend cooldown
      if (result.resendAvailableAt) {
        setResendAvailableAt(new Date(result.resendAvailableAt));
      }
    } catch (e) {
      console.error('[VerifyEmailScreen] Resend error:', e.message);

      // Check if rate limited
      if (e.response?.rateLimited && e.response?.resendAvailableAt) {
        const availableAt = new Date(e.response.resendAvailableAt);
        setResendAvailableAt(availableAt);
        const seconds = Math.ceil((availableAt - new Date()) / 1000);
        setError(`Too many attempts. Try again in ${seconds} seconds.`);
      } else {
        setError(e.message || 'Failed to resend code. Please try again.');
      }
    }
    setResendLoading(false);
  }

  const canResend = countdown === 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Verify Email</Text>
          <View style={styles.spacer} />
        </View>

        {/* ── Hero Section ── */}
        <View style={styles.hero}>
          <View style={styles.iconContainer}>
            <Ionicons name="mail-outline" size={48} color={Colors.primary} />
          </View>

          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.subtitle}>
            We've sent a verification code to:
          </Text>
          <Text style={styles.emailDisplay}>{email}</Text>

          {!email && (
            <View style={styles.emailInputContainer}>
              <Input
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                editable={!loading && !resendLoading}
                style={styles.emailInput}
                placeholderTextColor={Colors.lightGray}
              />
            </View>
          )}
        </View>

        {/* ── Messages ── */}
        {successMessage ? (
          <View style={[styles.messageBox, styles.successBox]}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={[styles.messageText, styles.successText]}>
              {successMessage}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.messageBox, styles.errorBox]}>
            <Ionicons name="alert-circle" size={20} color={Colors.error} />
            <Text style={[styles.messageText, styles.errorText]}>
              {error}
            </Text>
          </View>
        ) : null}

        {/* ── Code Input ── */}
        <View style={styles.formContainer}>
          <Text style={styles.label}>Verification Code</Text>
          <Input
            placeholder="Enter 6-digit code"
            value={code}
            onChangeText={setCode}
            maxLength={6}
            keyboardType="numeric"
            editable={!loading}
            style={styles.codeInput}
            placeholderTextColor={Colors.lightGray}
          />
          <Text style={styles.hint}>
            Check your email for the 6-digit verification code.
          </Text>

          {currentAttempt && maxAttempts && (
            <Text style={styles.attemptsText}>
              Attempt {currentAttempt} of {maxAttempts}
            </Text>
          )}
        </View>

        {/* ── Remember Me ── */}
        <View style={styles.rememberContainer}>
          <TouchableOpacity
            style={styles.rememberRow}
            onPress={() => setRememberMe(!rememberMe)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Ionicons name="checkmark" size={14} color={Colors.white} />}
            </View>
            <Text style={styles.rememberText}>Keep me signed in for around 30 days</Text>
          </TouchableOpacity>
        </View>

        {/* ── Verify Button ── */}
        <View style={styles.buttonContainer}>
          <Button
            title={loading ? 'Verifying...' : 'Confirm Code'}
            onPress={handleVerifyCode}
            disabled={loading || code.length !== 6}
            style={[styles.button, loading && styles.buttonDisabled]}
          />
        </View>

        {/* ── Resend Section ── */}
        <View style={styles.resendSection}>
          <Text style={styles.resendLabel}>Didn't receive the code?</Text>

          {canResend ? (
            <TouchableOpacity
              onPress={handleResendCode}
              disabled={resendLoading}
              style={styles.resendButton}
            >
              <Text style={styles.resendButtonText}>
                {resendLoading ? 'Sending...' : 'Resend Code'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownText}>
                Resend available in {countdown}s
              </Text>
            </View>
          )}
        </View>

        {/* ── Troubleshooting ── */}
        <View style={styles.faqSection}>
          <Text style={styles.faqTitle}>Troubleshooting</Text>
          <Text style={styles.faqItem}>
            • Check your spam or junk folder{'\n'}
            • Verification code expires in 10 minutes{'\n'}
            • Make sure to enter the 6-digit code{'\n'}
            • Only the last code is valid
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
  spacer: { width: 44 },

  hero: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: '#f8f9fa',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.darkGray,
    textAlign: 'center',
    marginBottom: 8,
  },
  emailDisplay: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: 16,
  },
  emailInputContainer: {
    width: '100%',
    marginTop: 16,
  },
  emailInput: {
    marginTop: 0,
  },

  messageBox: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  successBox: {
    backgroundColor: '#e8f5e9',
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  errorBox: {
    backgroundColor: '#ffebee',
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
  },
  messageText: {
    marginLeft: 12,
    flex: 1,
    fontSize: 14,
  },
  successText: { color: Colors.success },
  errorText: { color: Colors.error },

  formContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  codeInput: {
    fontSize: 18,
    letterSpacing: 2,
    textAlign: 'center',
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: Colors.darkGray,
    marginTop: 8,
    fontStyle: 'italic',
  },
  attemptsText: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 12,
    fontWeight: '500',
  },

  buttonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  button: {},
  buttonDisabled: {
    opacity: 0.5,
  },

  resendSection: {
    alignItems: 'center',
    paddingVertical: 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginHorizontal: 16,
    marginTop: 16,
  },
  resendLabel: {
    fontSize: 14,
    color: Colors.darkGray,
    marginBottom: 12,
  },
  resendButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  resendButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  countdownContainer: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  countdownText: {
    color: Colors.darkGray,
    fontSize: 14,
    fontWeight: '500',
  },

  faqSection: {
    marginHorizontal: 16,
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.lightGray,
  },
  faqTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  faqItem: {
    fontSize: 12,
    color: Colors.darkGray,
    lineHeight: 18,
  },
});
