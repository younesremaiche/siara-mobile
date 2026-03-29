import React from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { formatRelativeTime } from '../../services/mapReportsService';

function severityColor(level) {
  if (level === 'high') return '#ef4444';
  if (level === 'medium') return '#f59e0b';
  return '#22c55e';
}

function formatLabel(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

export default function ReportDetailsSheet({
  report,
  visible,
  onClose,
}) {
  if (!report) return null;

  const previewMedia = Array.isArray(report.media) ? report.media.find((item) => item?.url) : null;
  const severity = formatLabel(report.severity, 'Unknown');
  const incidentType = formatLabel(report.incidentType, 'Other');
  const occurredLabel = formatDateTime(report.occurredAt || report.createdAt);
  const relative = formatRelativeTime(report.occurredAt || report.createdAt);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.card}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { borderColor: severityColor(report.severity), backgroundColor: `${severityColor(report.severity)}22` }]}>
                <Text style={[styles.badgeText, { color: severityColor(report.severity) }]}>{severity}</Text>
              </View>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{incidentType}</Text>
              </View>
            </View>

            <Text style={styles.title}>{report.title || 'Community report'}</Text>
            {report.description ? <Text style={styles.description}>{report.description}</Text> : null}

            <View style={styles.metaList}>
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={16} color={Colors.primary} />
                <Text style={styles.metaText}>{report.locationLabel || 'Location unavailable'}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={16} color={Colors.primary} />
                <Text style={styles.metaText}>{occurredLabel} | {relative}</Text>
              </View>
            </View>

            {previewMedia ? (
              <View style={styles.mediaCard}>
                <Text style={styles.mediaTitle}>Media preview</Text>
                <Image source={{ uri: previewMedia.url }} style={styles.mediaPreview} resizeMode="cover" />
              </View>
            ) : null}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.36)', justifyContent: 'flex-end' },
  card: {
    maxHeight: '72%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 52,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 12,
  },
  content: {
    gap: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.heading,
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.text,
  },
  metaList: {
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  metaText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text,
  },
  mediaCard: {
    gap: 8,
  },
  mediaTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.heading,
  },
  mediaPreview: {
    width: '100%',
    height: 180,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
  },
});
