import React, { useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PhotoViewer from '../ui/PhotoViewer';
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
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex]     = useState(0);

  if (!report) return null;

  const allMedia     = Array.isArray(report.media) ? report.media.filter((m) => m?.url) : [];
  const previewMedia = allMedia[0] || null;
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
                <Text style={styles.mediaTitle}>
                  Media {allMedia.length > 1 ? `(${allMedia.length} photos)` : ''}
                </Text>
                <View style={styles.mediaGrid}>
                  {allMedia.slice(0, 3).map((item, i) => (
                    <TouchableOpacity
                      key={item.id || i}
                      activeOpacity={0.85}
                      style={[styles.mediaThumbWrap, allMedia.length === 1 && styles.mediaThumbFull]}
                      onPress={() => { setViewerIndex(i); setViewerVisible(true); }}
                    >
                      <Image source={{ uri: item.url }} style={styles.mediaThumb} resizeMode="cover" />
                      <View style={styles.mediaOverlay}>
                        <Ionicons name="expand-outline" size={14} color="#fff" />
                      </View>
                      {i === 2 && allMedia.length > 3 ? (
                        <View style={styles.moreOverlay}>
                          <Text style={styles.moreText}>+{allMedia.length - 3}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </TouchableOpacity>

      <PhotoViewer
        visible={viewerVisible}
        images={allMedia}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
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
  mediaCard: { gap: 8 },
  mediaTitle: { fontSize: 13, fontWeight: '800', color: Colors.heading },
  mediaGrid: { flexDirection: 'row', gap: 8 },
  mediaThumbWrap: {
    flex: 1, height: 110, borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  mediaThumbFull: { height: 180 },
  mediaThumb: { width: '100%', height: '100%' },
  mediaOverlay: {
    position: 'absolute', bottom: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 14,
  },
  moreText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
