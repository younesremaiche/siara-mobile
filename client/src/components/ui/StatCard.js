import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

export default function StatCard({ value, label, color }) {
  return (
    <View style={[styles.card, color ? { borderLeftColor: color, borderLeftWidth: 3 } : null]}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    alignItems: 'flex-start',
    gap: 4,
    flex: 1,
    minWidth: 100,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.heading,
  },
  label: {
    fontSize: 12,
    color: Colors.subtext,
    fontWeight: '500',
  },
});
