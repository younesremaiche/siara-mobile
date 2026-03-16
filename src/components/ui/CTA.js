import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Button from './Button';
import { Colors } from '../../theme/colors';

export default function CTA({
  title,
  subtitle,
  primaryLabel = 'Get Started',
  secondaryLabel = 'Contact Us',
  onPrimary,
  onSecondary,
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      <View style={styles.buttons}>
        <Button onPress={onPrimary}>{primaryLabel}</Button>
        {onSecondary && (
          <Button variant="ghost" onPress={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: Colors.btnPrimary,
    borderRadius: 20,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  title: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    maxWidth: 300,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
});
