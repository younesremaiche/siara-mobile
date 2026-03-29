import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

export default function FeatureCard({ icon, title, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          {icon || <Text style={styles.fallbackIcon}>*</Text>}
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    padding: 18,
    borderRadius: 14,
    minHeight: 130,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: Colors.violetLight,
  },
  fallbackIcon: {
    color: Colors.btnPrimary,
    fontSize: 20,
  },
  title: {
    fontWeight: '700',
    color: Colors.heading,
    fontSize: 15,
    flex: 1,
  },
  body: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
});
