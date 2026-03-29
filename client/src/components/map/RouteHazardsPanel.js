import React from 'react';
import {
  ScrollView,
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

export default function RouteHazardsPanel({
  route,
  onSegmentPress,
  style,
}) {
  if (!route) return null;

  const notes = Array.isArray(route.hazard_notes) ? route.hazard_notes.slice(0, 3) : [];
  const profile = Array.isArray(route.risk_profile) ? route.risk_profile : [];
  const highRiskSegments = profile
    .filter((item) => {
      const level = normalizeDangerLevel(item?.danger_level, item?.danger_percent);
      return level === 'high' || level === 'extreme' || Number(item?.danger_percent) >= 70;
    })
    .slice(0, 4);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="analytics-outline" size={16} color={Colors.primary} />
          <Text style={styles.headerTitle}>{route.route_label} profile</Text>
        </View>
        <Text style={styles.headerSubtitle}>{formatPercent(route.danger_percent)} overall risk</Text>
      </View>

      {profile.length > 0 ? (
        <View style={styles.profileWrap}>
          <View style={styles.profileBar}>
            {profile.map((segment) => (
              <TouchableOpacity
                key={segment.id}
                style={[
                  styles.profileSegment,
                  {
                    flex: Math.max(segment.width_percent, 6),
                    backgroundColor: segment.color,
                  },
                ]}
                activeOpacity={0.85}
                onPress={() => onSegmentPress?.(segment.segment)}
              />
            ))}
          </View>
          <Text style={styles.profileCaption}>Risk profile weighted by segment distance</Text>
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
      ) : (
        <Text style={styles.emptyText}>No standout risk clusters were detected on the selected route.</Text>
      )}

      {highRiskSegments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentRow}>
          {highRiskSegments.map((segment, index) => (
            <TouchableOpacity
              key={segment.id}
              style={[styles.segmentChip, { borderColor: segment.color }]}
              onPress={() => onSegmentPress?.(segment.segment)}
            >
              <View style={[styles.segmentDot, { backgroundColor: segment.color }]} />
              <Text style={styles.segmentText}>
                Segment {segment.segment?.sample_to != null ? segment.segment.sample_to : index + 1}
                {' - '}
                {formatPercent(segment.danger_percent)}
                {' - '}
                {formatDistance(segment.distance_km)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    marginBottom: 10,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.heading,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.subtext,
  },
  profileWrap: {
    marginBottom: 10,
  },
  profileBar: {
    flexDirection: 'row',
    height: 16,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: Colors.border,
  },
  profileSegment: {
    minWidth: 10,
    height: '100%',
  },
  profileCaption: {
    marginTop: 6,
    fontSize: 11,
    color: Colors.subtext,
  },
  notesWrap: {
    gap: 6,
    marginBottom: 10,
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
  emptyText: {
    fontSize: 12,
    color: Colors.subtext,
    marginBottom: 10,
  },
  segmentRow: {
    gap: 8,
    paddingRight: 2,
  },
  segmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.bg,
    borderWidth: 1,
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
  },
});
