import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { formatPercent, normalizeDangerLevel } from '../../utils/mapHelpers';

function formatDistance(distanceKm) {
  const numeric = Number(distanceKm);
  if (!Number.isFinite(numeric)) return '--';
  return `${numeric.toFixed(numeric >= 10 ? 0 : 1)} km`;
}

function DataQualityNotice({ sentinelInfo, compact = false }) {
  if (!sentinelInfo?.hasSentinel) return null;

  if (compact) {
    return (
      <View style={styles.compactNotice}>
        <Ionicons name="warning-outline" size={15} color={Colors.warning} />
        <Text style={styles.compactNoticeText}>Data quality note available for this route.</Text>
      </View>
    );
  }

  return (
    <View style={styles.noticeCard}>
      <View style={styles.noticeHeader}>
        <Ionicons name="warning" size={16} color={Colors.warning} />
        <Text style={styles.noticeTitle}>Data Quality Notice</Text>
      </View>
      {sentinelInfo.bannerTitle ? <Text style={styles.noticeLead}>{sentinelInfo.bannerTitle}</Text> : null}
      {[...(sentinelInfo.reasons || []), ...(sentinelInfo.fallbackDetails || [])].slice(0, 5).map((note) => (
        <Text key={note} style={styles.noticeItem}>- {note}</Text>
      ))}
    </View>
  );
}

export default function RouteDetailsSection({
  route,
  sentinelInfo,
  mode = 'guidance',
  onSegmentPress,
}) {
  if (!route) {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>Route details</Text>
        <Text style={styles.subtitle}>Choose a destination and request guidance to see route risk details.</Text>
      </View>
    );
  }

  const profile = Array.isArray(route.risk_profile) ? route.risk_profile : [];
  const notes = Array.isArray(route.hazard_notes) ? route.hazard_notes.slice(0, 3) : [];
  const segments = profile.slice(0, mode === 'info' ? 12 : 6);

  return (
    <View style={styles.section}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.title}>{route.route_label} profile</Text>
            <Text style={styles.subtitle}>{route.comparisonText}</Text>
          </View>
          <View style={styles.riskBadge}>
            <Text style={styles.riskBadgeText}>{formatPercent(route.danger_percent)}</Text>
          </View>
        </View>

        {profile.length > 0 ? (
          <View style={styles.profileWrap}>
            <View style={styles.profileBar}>
              {profile.map((segment) => (
                <View
                  key={segment.id}
                  style={[
                    styles.profileSegment,
                    {
                      flex: Math.max(segment.width_percent, 6),
                      backgroundColor: segment.color,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.profileCaption}>Risk profile strip weighted by segment distance.</Text>
          </View>
        ) : null}

        {notes.length > 0 ? (
          <View style={styles.notesWrap}>
            {notes.map((note) => (
              <View key={note} style={styles.noteRow}>
                <Ionicons name="warning-outline" size={14} color={Colors.warning} />
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Segment highlights</Text>
        <Text style={styles.sectionSubtitle}>Tap a segment to inspect the riskiest portions.</Text>
      </View>

      <View style={styles.segmentWrap}>
        {segments.map((segment, index) => {
          const level = normalizeDangerLevel(segment.danger_level, segment.danger_percent);
          return (
            <TouchableOpacity
              key={segment.id}
              style={[styles.segmentChip, { borderColor: segment.color }]}
              activeOpacity={0.85}
              onPress={() => onSegmentPress?.(segment.segment)}
            >
              <View style={[styles.segmentDot, { backgroundColor: segment.color }]} />
              <Text style={styles.segmentText}>
                Segment {segment.segment?.sample_to != null ? segment.segment.sample_to : index + 1}
                {' '}
                {formatPercent(segment.danger_percent)}
                {' '}
                {level}
                {' '}
                {formatDistance(segment.distance_km)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <DataQualityNotice sentinelInfo={sentinelInfo} compact={mode === 'guidance'} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.heading,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.subtext,
    lineHeight: 17,
  },
  riskBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(124,58,237,0.1)',
  },
  riskBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  profileWrap: {
    gap: 6,
  },
  profileBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: Colors.border,
  },
  profileSegment: {
    minWidth: 8,
  },
  profileCaption: {
    fontSize: 11,
    color: Colors.subtext,
  },
  notesWrap: {
    gap: 6,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.text,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.heading,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.subtext,
  },
  segmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    maxWidth: '100%',
  },
  segmentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
    flexShrink: 1,
  },
  compactNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  compactNoticeText: {
    marginLeft: 8,
    fontSize: 12,
    color: Colors.text,
    flex: 1,
  },
  noticeCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    gap: 6,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noticeTitle: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '800',
    color: Colors.heading,
  },
  noticeLead: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  noticeItem: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.text,
  },
});
