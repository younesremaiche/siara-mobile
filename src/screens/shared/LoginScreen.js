import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';

export default function LoginScreen({ navigation }) {
  const { login } = useContext(AuthContext);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!identifier || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const user = await login(identifier, password, remember);
      if (user.role === 'admin') {
        navigation.reset({ index: 0, routes: [{ name: 'AdminPanel' }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'UserTabs' }] });
      }
    } catch (e) {
      setError('Authentication failed. Please check your credentials.');
    }
    setLoading(false);
  }

  function quickDemo(email, pw) {
    setIdentifier(email);
    setPassword(pw);
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
        {/* ── Gradient Hero Section ── */}
        <View style={styles.hero}>
          {/* Decorative circles */}
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

        {/* ── White Form Card ── */}
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

          {/* Email / Phone */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email or Phone</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
              <Input
                value={identifier}
                onChangeText={(t) => { setIdentifier(t); setError(''); }}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.inputNoMargin}
                inputStyle={styles.inputWithIcon}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
              <Input
                value={password}
                onChangeText={(t) => { setPassword(t); setError(''); }}
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

          {/* Remember Me */}
          <TouchableOpacity
            style={styles.rememberRow}
            onPress={() => setRemember(!remember)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, remember && styles.checkboxChecked]}>
              {remember && <Ionicons name="checkmark" size={14} color={Colors.white} />}
            </View>
            <Text style={styles.rememberText}>Remember me</Text>
          </TouchableOpacity>

          {/* Sign In Button */}
          <Button
            onPress={handleLogin}
            disabled={loading}
            style={styles.ctaBtn}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>

          {/* ── Quick Demo Access ── */}
          <View style={styles.demoSection}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Quick Demo Access</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.demoRow}>
              <TouchableOpacity
                style={styles.demoBtn}
                onPress={() => quickDemo('admin@siara.dz', 'admin1234')}
                activeOpacity={0.7}
              >
                <View style={styles.demoBtnIconWrap}>
                  <Ionicons name="shield-half-outline" size={16} color={Colors.primary} />
                </View>
                <Text style={styles.demoBtnText}>Admin Panel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.demoBtn, styles.demoBtnBlue]}
                onPress={() => quickDemo('user@siara.dz', 'user12345')}
                activeOpacity={0.7}
              >
                <View style={[styles.demoBtnIconWrap, styles.demoBtnIconBlue]}>
                  <Ionicons name="person-outline" size={16} color={Colors.secondary} />
                </View>
                <Text style={[styles.demoBtnText, styles.demoBtnTextBlue]}>User Demo</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Footer Links ── */}
          <View style={styles.footer}>
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
                Don't have an account?{' '}
                <Text style={styles.footerHighlight}>Sign Up</Text>
              </Text>
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

  /* ── Hero ── */
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

  /* ── Form Card ── */
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

  /* ── Input styling ── */
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

  /* ── Remember ── */
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

  /* ── CTA ── */
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

  /* ── Demo Section ── */
  demoSection: {
    marginTop: 28,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.subtext,
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  demoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  demoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  demoBtnBlue: {
    backgroundColor: Colors.blueLight,
    borderColor: Colors.blueBorder,
  },
  demoBtnIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoBtnIconBlue: {
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  demoBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  demoBtnTextBlue: {
    color: Colors.secondary,
  },

  /* ── Footer ── */
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
