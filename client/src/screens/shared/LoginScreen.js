import React, { useContext, useEffect, useState } from 'react';
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
import { checkApiHealth } from '../../services/api';
import {
  getAuthErrorMessage,
  getPostAuthRoute,
  normalizeEmail,
  validateLoginForm,
} from '../../utils/auth';

export default function LoginScreen({ navigation, route }) {
  const { login, signInWithGoogle } = useContext(AuthContext);
  const [identifier, setIdentifier] = useState(route?.params?.email || '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [backendError, setBackendError] = useState('');

  useEffect(() => {
    const nextEmail = route?.params?.email || '';
    if (nextEmail) {
      setIdentifier(nextEmail);
    }
  }, [route?.params?.email]);

  useEffect(() => {
    let active = true;

    checkApiHealth()
      .then(() => {
        if (active) {
          setBackendError('');
        }
      })
      .catch(() => {
        if (active) {
          setBackendError(
            'Backend unreachable. Make sure http://10.92.182.21:8000 is running and reachable from your phone.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin() {
    const validationErrors = validateLoginForm({
      email: identifier,
      password,
    });

    if (validationErrors.email || validationErrors.password) {
      setError(validationErrors.email || validationErrors.password);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await login(normalizeEmail(identifier), password, remember);
      navigation.reset({
        index: 0,
        routes: [{ name: getPostAuthRoute(user) }],
      });
    } catch (loginError) {
      const requiresVerification = loginError?.response?.data?.requiresEmailVerification === true;
      if (requiresVerification) {
        navigation.navigate('VerifyEmail', {
          email: loginError?.response?.data?.email || normalizeEmail(identifier),
          rememberMe: remember,
        });
      } else {
        setError(getAuthErrorMessage(loginError, 'Authentication failed. Please check your credentials.'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError('');

    try {
      const user = await signInWithGoogle(remember);
      navigation.reset({
        index: 0,
        routes: [{ name: getPostAuthRoute(user) }],
      });
    } catch (googleError) {
      setError(getAuthErrorMessage(googleError, 'Google sign-in failed. Please try again.'));
    } finally {
      setGoogleLoading(false);
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
              <Ionicons name="navigate" size={22} color={Colors.white} />
            </View>
            <Text style={styles.logoText}>SIARA</Text>
          </View>

          <Text style={styles.heroSubtitle}>Road Accident Risk Visualizer</Text>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Ionicons name="shield-checkmark" size={13} color="#A5F3FC" />
              <Text style={styles.badgeText}>AI-Powered</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="analytics" size={13} color="#C4B5FD" />
              <Text style={styles.badgeText}>Real-time</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="map" size={13} color="#86EFAC" />
              <Text style={styles.badgeText}>GIS Maps</Text>
            </View>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Log In</Text>
          <Text style={styles.formSubtitle}>
            Log in to access the dashboard and risk visualization tools.
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {backendError ? (
            <View style={styles.backendBox}>
              <Ionicons name="cloud-offline-outline" size={16} color={Colors.warning} />
              <Text style={styles.backendText}>{backendError}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
              <Input
                value={identifier}
                onChangeText={(text) => {
                  setIdentifier(text);
                  setError('');
                }}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.inputNoMargin}
                inputStyle={styles.inputWithIcon}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
              <Input
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError('');
                }}
                placeholder="Enter your password"
                secureTextEntry={!showPw}
                style={styles.inputNoMargin}
                inputStyle={styles.inputWithIcon}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPw(!showPw)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPw ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.grey}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.rememberRow}
            onPress={() => setRemember(!remember)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, remember && styles.checkboxChecked]}>
              {remember ? <Ionicons name="checkmark" size={14} color={Colors.white} /> : null}
            </View>
            <Text style={styles.rememberText}>Remember me</Text>
          </TouchableOpacity>

          <Button
            onPress={handleLogin}
            disabled={loading || googleLoading}
            loading={loading}
            style={styles.ctaBtn}
          >
            Sign In
          </Button>

          {/* ── Divider ── */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── Google Sign-In Button ── */}
          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && styles.googleBtnDisabled]}
            onPress={handleGoogleLogin}
            disabled={loading || googleLoading}
            activeOpacity={0.7}
          >
            <Ionicons name="logo-google" size={20} color={Colors.primary} />
            <Text style={styles.googleBtnText}>
              {googleLoading ? 'Signing in...' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          {/* ── Footer ── */}
            <TouchableOpacity
              onPress={() => navigation.navigate('About')}
              activeOpacity={0.6}
            >
              <Text style={styles.footerLink}>About SIARA</Text>
            </TouchableOpacity>

            <View style={styles.footerDot} />

            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              activeOpacity={0.6}
            >
              <Text style={styles.footerLink}>
                Don&apos;t have an account?{' '}
                <Text style={styles.footerHighlight}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
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
    paddingTop: Platform.OS === 'ios' ? 64 : 52,
    paddingBottom: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroCircleTopRight: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroCircleBottomLeft: {
    position: 'absolute',
    bottom: -20,
    left: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  logoIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: Colors.white,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 3,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 18,
    letterSpacing: 0.3,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  formCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
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
    marginBottom: 24,
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
    marginBottom: 18,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
  },
  backendBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(244,162,97,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244,162,97,0.24)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  backendText: {
    color: Colors.text,
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
  },
  eyeBtn: {
    padding: 4,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  checkboxChecked: {
    backgroundColor: Colors.btnPrimary,
    borderColor: Colors.btnPrimary,
  },
  rememberText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  ctaBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    shadowColor: Colors.btnPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.subtext,
    fontSize: 13,
    fontWeight: '500',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  googleBtnDisabled: {
    opacity: 0.6,
  },
  googleBtnText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
    flexWrap: 'wrap',
    gap: 6,
  },
  footerLink: {
    color: Colors.subtext,
    fontSize: 13,
  },
  footerHighlight: {
    color: Colors.primary,
    fontWeight: '700',
  },
  footerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
});
