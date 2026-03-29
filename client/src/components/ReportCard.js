import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { formatDateTime } from '../services/reportsService';

function severityMeta(severity) {
  if (severity === 'critical') {
    return { color: Colors.severityCritical, label: 'Critical', icon: 'flame' };
  }
  if (severity === 'high') {
    return { color: Colors.severityHigh, label: 'High', icon: 'warning' };
  }
  if (severity === 'medium') {
    return { color: Colors.severityMedium, label: 'Medium', icon: 'alert-circle' };
  }
  return { color: Colors.severityLow, label: 'Low', icon: 'shield-checkmark' };
}

function statusLabel(status) {
  const normalized = String(status || 'pending').trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export default function ReportCard({ report, onPress }) {
  const severity = severityMeta(report?.severity);
  const occurredAt = report?.occurredAt || report?.createdAt;
  const previewMedia = Array.isArray(report?.media) ? report.media.slice(0, 3) : [];

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={styles.headerMain}>
          <Text style={styles.title}>{report?.title || 'Untitled report'}</Text>
          <Text style={styles.metaText}>
            {report?.reportedBy?.name || 'Citizen'} · {report?.relativeTime || 'Unknown time'}
          </Text>
        </View>
        <View style={[styles.severityPill, { backgroundColor: `${severity.color}16` }]}>
          <Ionicons name={severity.icon} size={12} color={severity.color} />
          <Text style={[styles.severityText, { color: severity.color }]}>{severity.label}</Text>
        </View>
      </View>

      {report?.description ? (
        <Text style={styles.description} numberOfLines={3}>
          {report.description}
        </Text>
      ) : null}

      <View style={styles.metaList}>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color={Colors.subtext} />
          <Text style={styles.metaValue} numberOfLines={1}>
            {report?.locationLabel || 'Location unavailable'}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={14} color={Colors.subtext} />
          <Text style={styles.metaValue}>{formatDateTime(occurredAt)}</Text>
        </View>
      </View>

      {previewMedia.length > 0 ? (
        <View style={styles.mediaRow}>
          {previewMedia.map((mediaItem, index) => (
            <Image
              key={mediaItem.id || `${report?.id}-media-${index}`}
              source={{ uri: mediaItem.url }}
              style={styles.mediaThumb}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.footerRow}>
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{statusLabel(report?.status)}</Text>
          </View>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{report?.incidentType || 'other'}</Text>
          </View>
          {report?.distanceKm != null ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{report.distanceKm} km</Text>
            </View>
          ) : null}
        </View>
      </View>
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
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerMain: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  metaText: {
    color: Colors.subtext,
    fontSize: 12,
  },
  severityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  description: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  metaList: {
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaValue: {
    flex: 1,
    marginLeft: 8,
    color: Colors.subtext,
    fontSize: 12,
  },
  mediaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mediaThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  footerRow: {
    gap: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: {
    color: Colors.subtext,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
