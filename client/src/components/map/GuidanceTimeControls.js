import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../theme/colors';

const TIME_PRESETS = [
  { key: '0', label: 'Now' },
  { key: String(5 * 60 * 1000), label: '+5 min' },
  { key: String(15 * 60 * 1000), label: '+15 min' },
  { key: String(60 * 60 * 1000), label: '+1h' },
  { key: String(3 * 60 * 60 * 1000), label: '+3h' },
  { key: String(6 * 60 * 60 * 1000), label: '+6h' },
  { key: 'custom', label: 'Custom' },
];

export default function GuidanceTimeControls({
  presetKey = '0',
  customDate = '',
  onSelectPreset,
  onChangeCustomDate,
}) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Departure time</Text>
        <Text style={styles.subtitle}>Changing the time refreshes the route guidance and forecast.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {TIME_PRESETS.map((preset) => {
          const active = preset.key === presetKey;
          return (
            <TouchableOpacity
              key={preset.key}
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => onSelectPreset?.(preset.key)}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{preset.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {presetKey === 'custom' ? (
        <TextInput
          style={styles.customInput}
          placeholder="YYYY-MM-DD HH:mm"
          placeholderTextColor={Colors.grey}
          value={customDate}
          onChangeText={onChangeCustomDate}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  header: {
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.heading,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.subtext,
  },
  pillRow: {
    gap: 8,
    paddingRight: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillActive: {
    backgroundColor: Colors.btnPrimary,
    borderColor: Colors.btnPrimary,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  pillTextActive: {
    color: Colors.white,
  },
  customInput: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: 14,
    color: Colors.text,
  },
});
