import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';

const DISABLED_REASON = 'Google sign-in coming later.';

export default function GoogleAuthButton({
  label = 'Continue with Google',
  onError,
  style,
}) {
  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    console.info('[google-auth] disabled', {
      enabled: false,
      reason: DISABLED_REASON,
    });
  }, []);

  function handlePress() {
    onError?.(DISABLED_REASON);
  }

  return (
    <View style={style}>
      <TouchableOpacity
        style={[styles.button, styles.buttonDisabled]}
        onPress={handlePress}
        disabled
        activeOpacity={0.8}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="logo-google" size={18} color={Colors.primary} />
        </View>
        <Text style={styles.label}>{label}</Text>
      </TouchableOpacity>
      <Text style={styles.helperText}>{DISABLED_REASON}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  iconWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  helperText: {
    marginTop: 8,
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
