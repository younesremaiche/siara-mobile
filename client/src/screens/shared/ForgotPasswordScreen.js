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
import { requestPasswordReset } from '../../services/authService';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  async function handleSendCode() {
    setError('');
    if (!email.trim()) {
      setError('Please enter your email.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      navigation.navigate('ResetPassword', { email: email.trim().toLowerCase() });
    } catch (e) {
      const msg = e?.message || 'Could not send reset code. Please try again.';
      setError(msg);
      Alert.alert('Reset failed', msg);
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
          <Ionicons name="key" size={36} color={Colors.white} />
          <Text style={styles.heroTitle}>Forgot Password?</Text>
          <Text style={styles.heroSubtitle}>
            We'll email you a 6-digit code to reset your password.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Email address</Text>
          <View style={[styles.inputRow, error && styles.inputRowError]}>
            <Ionicons name="mail-outline" size={18} color={Colors.grey} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) setError('');
              }}
              placeholder="email@example.com"
              placeholderTextColor={Colors.grey}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSendCode}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{loading ? 'Sending…' : 'Send reset code'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back-outline" size={14} color={Colors.primary} />
            <Text style={styles.linkText}>Back to login</Text>
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
    marginTop: 18,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  linkText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
});
