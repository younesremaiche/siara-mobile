import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../../theme/colors';

export default function Button({
  children,
  onPress,
  disabled = false,
  variant = 'primary',
  loading = false,
  style,
  textStyle,
  ...props
}) {
  const variantStyles = getVariantStyles(variant);

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variantStyles.button,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'secondary' ? Colors.btnPrimary : Colors.white}
          style={{ marginRight: 8 }}
        />
      ) : null}
      <Text style={[styles.baseText, variantStyles.text, textStyle]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

function getVariantStyles(variant) {
  switch (variant) {
    case 'secondary':
      return {
        button: styles.secondaryBtn,
        text: styles.secondaryText,
      };
    case 'danger':
      return {
        button: styles.dangerBtn,
        text: styles.dangerText,
      };
    case 'ghost':
      return {
        button: styles.ghostBtn,
        text: styles.ghostText,
      };
    default:
      return {
        button: styles.primaryBtn,
        text: styles.primaryText,
      };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    minHeight: 50,
  },
  baseText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.6,
  },

  // Primary -- solid violet with shadow
  primaryBtn: {
    backgroundColor: Colors.btnPrimary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.btnPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  primaryText: {
    color: Colors.white,
  },

  // Secondary -- outlined violet
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.btnPrimary,
  },
  secondaryText: {
    color: Colors.btnPrimary,
  },

  // Danger -- solid red
  dangerBtn: {
    backgroundColor: Colors.btnDanger,
    ...Platform.select({
      ios: {
        shadowColor: Colors.btnDanger,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  dangerText: {
    color: Colors.white,
  },

  // Ghost -- transparent with white text
  ghostBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  ghostText: {
    color: Colors.white,
  },
});
