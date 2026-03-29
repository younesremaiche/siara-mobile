import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

function severityMeta(level) {
  if (level === 'critical') {
    return { color: Colors.severityCritical, label: 'Critical' };
  }
  if (level === 'high') {
    return { color: Colors.severityHigh, label: 'High' };
  }
  if (level === 'medium') {
    return { color: Colors.severityMedium, label: 'Medium' };
  }
  return { color: Colors.severityLow, label: 'Low' };
}

function formatList(values = []) {
  if (!Array.isArray(values) || values.length === 0) {
    return 'Any';
  }

  return values.join(', ');
}

export default function AlertCard({ alert, onPress }) {
  const severity = severityMeta(alert?.severity);
  const areaName = alert?.zone?.displayName || alert?.area?.name || 'Configured area';
  const previewTriggers = Array.isArray(alert?.recentTriggers) ? alert.recentTriggers.slice(0, 2) : [];

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{alert?.name || 'Untitled alert'}</Text>
          <Text style={styles.subtitle}>
            {String(alert?.status || 'active').replace(/^\w/, (char) => char.toUpperCase())} · {areaName}
          </Text>
        </View>
        <View style={[styles.severityPill, { backgroundColor: `${severity.color}16` }]}>
          <Text style={[styles.severityText, { color: severity.color }]}>{severity.label}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Incident types</Text>
          <Text style={styles.infoValue}>{formatList(alert?.incidentTypes)}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Time window</Text>
          <Text style={styles.infoValue}>{alert?.timeWindow || 'Any time'}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Triggers</Text>
          <Text style={styles.infoValue}>{alert?.triggerCount || 0}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Last triggered</Text>
          <Text style={styles.infoValue}>{alert?.lastTriggered || 'Never'}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Ionicons name="notifications-outline" size={14} color={Colors.primary} />
          <Text style={styles.metaChipText}>
            {[
              alert?.notifications?.app ? 'App' : null,
              alert?.notifications?.email ? 'Email' : null,
              alert?.notifications?.sms ? 'SMS' : null,
            ].filter(Boolean).join(' · ') || 'No channels'}
          </Text>
        </View>
      </View>

      {previewTriggers.length > 0 ? (
        <View style={styles.triggerList}>
          {previewTriggers.map((trigger, index) => (
            <View key={`${alert?.id}-trigger-${index}`} style={styles.triggerItem}>
              <Ionicons name="flash-outline" size={14} color={Colors.secondary} />
              <Text style={styles.triggerText} numberOfLines={2}>
                {trigger?.title || trigger?.message || trigger?.locationLabel || 'Recent trigger'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.subtext,
    fontSize: 12,
  },
  severityPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoBlock: {
    minWidth: '46%',
    flex: 1,
    gap: 4,
  },
  infoLabel: {
    color: Colors.grey,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoValue: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  metaChipText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  triggerList: {
    gap: 8,
  },
  triggerItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  triggerText: {
    flex: 1,
    marginLeft: 8,
    color: Colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
});
