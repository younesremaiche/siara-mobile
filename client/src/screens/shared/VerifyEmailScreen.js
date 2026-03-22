import React, { useContext, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';
import {
  buildVerificationNotice,
  getAuthErrorMessage,
  getPostAuthRoute,
  normalizeEmail,
} from '../../utils/auth';

export default function VerifyEmailScreen({ navigation, route }) {
  const { resendVerificationCode, verifyEmail } = useContext(AuthContext);
  const email = normalizeEmail(route?.params?.email || '');
  const rememberMe = Boolean(route?.params?.rememberMe);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState(
    route?.params?.notice
      || buildVerificationNotice({ emailSent: route?.params?.emailSent }),
  );

  const hasEmail = useMemo(() => Boolean(email), [email]);

  async function handleVerify() {
    const normalizedCode = String(code || '').trim();

    if (!hasEmail) {
      setError('Missing verification email. Please register or log in again.');
      return;
    }

    if (!/^\d{6}$/.test(normalizedCode)) {
      setError('Enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await verifyEmail(email, normalizedCode, rememberMe);
      navigation.reset({
        index: 0,
        routes: [{ name: getPostAuthRoute(user) }],
      });
    } catch (verificationError) {
      setError(getAuthErrorMessage(verificationError, 'Verification failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!hasEmail) {
      setError('Missing verification email. Please register or log in again.');
      return;
    }

    setResending(true);
    setError('');

    try {
      await resendVerificationCode(email);
      setNotice(buildVerificationNotice({ emailSent: true, isResend: true }));
    } catch (resendError) {
      setError(getAuthErrorMessage(resendError, 'Unable to resend the verification code.'));
    } finally {
      setResending(false);
    }
  }

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
        <View style={styles.hero}>
          <View style={styles.heroCircleTopRight} />
          <View style={styles.heroCircleBottomLeft} />

          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Ionicons name="mail-open-outline" size={20} color={Colors.white} />
            </View>
            <Text style={styles.logoText}>SIARA</Text>
          </View>

          <Text style={styles.heroSubtitle}>Verify your email</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Email Verification</Text>
          <Text style={styles.formSubtitle}>Enter the 6-digit code sent to:</Text>
          <Text style={styles.emailValue}>{email || 'No email provided'}</Text>

          {notice ? (
            <View style={styles.noticeBox}>
              <Ionicons name="information-circle" size={16} color={Colors.primary} />
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Verification Code</Text>
            <View style={[styles.inputRow, error && styles.inputRowError]}>
              <Ionicons name="key-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
              <Input
                value={code}
                onChangeText={(value) => {
                  setCode(value.replace(/[^0-9]/g, '').slice(0, 6));
                  setError('');
                }}
                placeholder="123456"
                keyboardType="number-pad"
                style={styles.inputNoMargin}
                inputStyle={styles.inputWithIcon}
                maxLength={6}
              />
            </View>
          </View>

          <Button
            onPress={handleVerify}
            disabled={loading || resending || !hasEmail}
            loading={loading}
            style={styles.ctaBtn}
          >
            Verify Email
          </Button>

          <TouchableOpacity
            style={styles.resendBtn}
            onPress={handleResend}
            disabled={loading || resending || !hasEmail}
            activeOpacity={0.75}
          >
            {resending ? (
              <Text style={styles.resendText}>Sending new code...</Text>
            ) : (
              <Text style={styles.resendText}>Resend code</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already verified or used a different email? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login', { email })}
              activeOpacity={0.7}
            >
              <Text style={styles.footerHighlight}>Go to login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.primary },
  scrollContent: {
    flexGrow: 1,
  },
  hero: {
    backgroundColor: Colors.primary,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroCircleTopRight: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroCircleBottomLeft: {
    position: 'absolute',
    bottom: -16,
    left: -26,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: Colors.white,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 3,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  formCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 36,
  },
  formTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.heading,
    marginBottom: 6,
  },
  formSubtitle: {
    color: Colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  emailValue: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 20,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  noticeText: {
    color: Colors.primary,
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 7,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  inputRowError: {
    borderColor: Colors.error,
  },
  inputIcon: {
    marginRight: 4,
  },
  inputNoMargin: {
    flex: 1,
    marginBottom: 0,
  },
  inputWithIcon: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 12,
    textAlign: 'center',
    letterSpacing: 6,
    fontSize: 22,
    fontWeight: '700',
  },
  ctaBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
  },
  resendBtn: {
    alignItems: 'center',
    marginTop: 16,
  },
  resendText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 26,
    flexWrap: 'wrap',
  },
  footerText: {
    color: Colors.subtext,
    fontSize: 13,
  },
  footerHighlight: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
