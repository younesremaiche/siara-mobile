import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { verifyResetCode, resetPassword } from '../../services/authService';

export default function ResetPasswordScreen({ navigation, route }) {
  const initialEmail = route?.params?.email || '';
  const [email] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const next = {};
    if (!code.trim() || code.trim().length < 4) {
      next.code = 'Enter the verification code from your email.';
    }
    if (!newPassword || newPassword.length < 8) {
      next.password = 'Password must be at least 8 characters.';
    }
    if (newPassword !== confirmPassword) {
      next.confirm = 'Passwords do not match.';
    }
    return next;
  }

  async function handleReset() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      const verified = await verifyResetCode(email, code.trim());
      const resetToken = verified?.resetToken;
      if (!resetToken) {
        throw new Error('Invalid or expired code. Please request a new one.');
      }
      await resetPassword({ email, resetToken, newPassword });

      Alert.alert(
        'Password updated',
        'Your password has been reset. You can now sign in with your new password.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
      );
    } catch (e) {
      const msg = e?.message || 'Could not reset password. Please try again.';
      Alert.alert('Reset failed', msg);
      setErrors({ general: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <Ionicons name="lock-open" size={36} color={Colors.white} />
          <Text style={styles.heroTitle}>Reset your password</Text>
          <Text style={styles.heroSubtitle}>
            Enter the code we sent to {email || 'your email'} and choose a new password.
          </Text>
        </View>

        <View style={styles.card}>
          {errors.general ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorBoxText}>{errors.general}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Verification code</Text>
          <View style={[styles.inputRow, errors.code && styles.inputRowError]}>
            <Ionicons name="key-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/\s/g, ''));
                if (errors.code) setErrors((e) => ({ ...e, code: '' }));
              }}
              placeholder="6-digit code"
              placeholderTextColor={Colors.grey}
              keyboardType="number-pad"
              maxLength={8}
            />
          </View>
          {errors.code ? <Text style={styles.errorText}>{errors.code}</Text> : null}

          <Text style={[styles.label, { marginTop: 14 }]}>New password</Text>
          <View style={[styles.inputRow, errors.password && styles.inputRowError]}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={(t) => {
                setNewPassword(t);
                if (errors.password) setErrors((e) => ({ ...e, password: '' }));
              }}
              placeholder="Min. 8 characters"
              placeholderTextColor={Colors.grey}
              secureTextEntry={!showPw}
              autoCapitalize="none"
            />
            <TouchableOpacity
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
          {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

          <Text style={[styles.label, { marginTop: 14 }]}>Confirm new password</Text>
          <View style={[styles.inputRow, errors.confirm && styles.inputRowError]}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                if (errors.confirm) setErrors((e) => ({ ...e, confirm: '' }));
              }}
              placeholder="Re-enter your password"
              placeholderTextColor={Colors.grey}
              secureTextEntry={!showPw}
              autoCapitalize="none"
            />
          </View>
          {errors.confirm ? <Text style={styles.errorText}>{errors.confirm}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleReset}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{loading ? 'Updating…' : 'Update password'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => navigation.navigate('ForgotPassword')}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>Resend code</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.primary },
  scroll: { flexGrow: 1, backgroundColor: Colors.bg },
  hero: {
    backgroundColor: Colors.primary,
    paddingTop: Platform.OS === 'ios' ? 70 : 56,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 46, left: 16, padding: 6 },
  heroTitle: { color: Colors.white, fontSize: 24, fontWeight: '800', marginTop: 12 },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 320,
    lineHeight: 20,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -22,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderColor: 'rgba(220,38,38,0.25)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorBoxText: { color: Colors.error, fontSize: 13, fontWeight: '600', flex: 1 },
  label: { color: Colors.heading, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputRowError: { borderColor: Colors.error },
  inputIcon: { marginRight: 6 },
  input: { flex: 1, paddingVertical: 14, color: Colors.text, fontSize: 15 },
  errorText: { color: Colors.error, fontSize: 12, fontWeight: '500', marginTop: 6 },
  btn: {
    backgroundColor: Colors.btnPrimary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  linkBtn: { alignItems: 'center', marginTop: 14 },
  linkText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
});
