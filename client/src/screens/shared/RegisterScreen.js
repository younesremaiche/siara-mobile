import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';

export default function RegisterScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  function validate() {
    const errs = {};
    if (!fullName.trim()) errs.fullName = 'Full name is required';
    if (!email.trim()) errs.email = 'Email or phone is required';
    if (password.length < 6) errs.password = 'Password must be at least 6 characters';
    if (password !== confirm) errs.confirm = 'Passwords do not match';
    if (!agreeTerms) errs.terms = 'You must agree to the terms';
    return errs;
  }

  async function handleRegister() {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    Alert.alert('Success', 'Account created successfully!', [
      { text: 'OK', onPress: () => navigation.navigate('Login') },
    ]);
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
          <View style={styles.heroCircleTopRight} />
          <View style={styles.heroCircleBottomLeft} />

          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Ionicons name="navigate" size={20} color={Colors.white} />
            </View>
            <Text style={styles.logoText}>SIARA</Text>
          </View>

          <Text style={styles.heroSubtitle}>Join the road safety platform</Text>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Ionicons name="people" size={13} color="#C4B5FD" />
              <Text style={styles.badgeText}>Community</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="shield-checkmark" size={13} color="#86EFAC" />
              <Text style={styles.badgeText}>Secure</Text>
            </View>
          </View>
        </View>

        {/* ── White Form Card ── */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Create an Account</Text>
          <Text style={styles.formSubtitle}>
            Sign up to access dashboards, risk maps, and driver analytics.
          </Text>

          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <View style={[styles.inputRow, errors.fullName && styles.inputRowError]}>
              <Ionicons name="person-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
              <Input
                value={fullName}
                onChangeText={(t) => { setFullName(t); setErrors((e) => ({ ...e, fullName: '' })); }}
                placeholder="Enter your full name"
                autoCapitalize="words"
                style={styles.inputNoMargin}
                inputStyle={styles.inputWithIcon}
              />
            </View>
            {errors.fullName ? <Text style={styles.fieldError}>{errors.fullName}</Text> : null}
          </View>

          {/* Email / Phone */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email or Phone</Text>
            <View style={[styles.inputRow, errors.email && styles.inputRowError]}>
              <Ionicons name="mail-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
              <Input
                value={email}
                onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: '' })); }}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.inputNoMargin}
                inputStyle={styles.inputWithIcon}
              />
            </View>
            {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={[styles.inputRow, errors.password && styles.inputRowError]}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
              <Input
                value={password}
                onChangeText={(t) => { setPassword(t); setErrors((e) => ({ ...e, password: '' })); }}
                placeholder="Min. 6 characters"
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
            {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <View style={[styles.inputRow, errors.confirm && styles.inputRowError]}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
              <Input
                value={confirm}
                onChangeText={(t) => { setConfirm(t); setErrors((e) => ({ ...e, confirm: '' })); }}
                placeholder="Re-enter your password"
                secureTextEntry={!showConfirmPw}
                style={styles.inputNoMargin}
                inputStyle={styles.inputWithIcon}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowConfirmPw(!showConfirmPw)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showConfirmPw ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.grey}
                />
              </TouchableOpacity>
            </View>
            {errors.confirm ? <Text style={styles.fieldError}>{errors.confirm}</Text> : null}
          </View>

          {/* Terms Checkbox */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => { setAgreeTerms(!agreeTerms); setErrors((e) => ({ ...e, terms: '' })); }}
            activeOpacity={0.7}
          >
            <View style={[
              styles.checkbox,
              agreeTerms && styles.checkboxChecked,
              errors.terms && !agreeTerms && styles.checkboxError,
            ]}>
              {agreeTerms && <Ionicons name="checkmark" size={14} color={Colors.white} />}
            </View>
            <Text style={styles.termsText}>
              I agree to the{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </TouchableOpacity>
          {errors.terms ? <Text style={[styles.fieldError, { marginLeft: 32, marginTop: -2 }]}>{errors.terms}</Text> : null}

          {/* Sign Up Button */}
          <Button
            onPress={handleRegister}
            disabled={loading}
            style={styles.ctaBtn}
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </Button>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already registered?{' '}</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.6}
            >
              <Text style={styles.footerHighlight}>Log in</Text>
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
    marginBottom: 16,
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
    paddingTop: 30,
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
    marginBottom: 22,
  },

  /* ── Input styling ── */
  inputGroup: {
    marginBottom: 14,
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
  },
  eyeBtn: {
    padding: 4,
  },
  fieldError: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 5,
    marginLeft: 4,
  },

  /* ── Terms ── */
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
    marginTop: 4,
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
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.btnPrimary,
    borderColor: Colors.btnPrimary,
  },
  checkboxError: {
    borderColor: Colors.error,
  },
  termsText: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  termsLink: {
    color: Colors.primary,
    fontWeight: '600',
  },

  /* ── CTA ── */
  ctaBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 14,
    shadowColor: Colors.btnPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },

  /* ── Footer ── */
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 26,
  },
  footerText: {
    color: Colors.subtext,
    fontSize: 14,
  },
  footerHighlight: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
