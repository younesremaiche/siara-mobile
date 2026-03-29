import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';

const { width } = Dimensions.get('window');

const MOCK_INCIDENT = {
  id: 'INC-2401',
  title: 'Major collision on Blvd Zirout Youcef',
  severity: 'high',
  type: 'Collision',
  location: 'Algiers Centre',
  date: '2024-01-15 14:32',
  description:
    'Two vehicles collided at the intersection near Didouche Mourad. Emergency services on site. Traffic diverted through adjacent streets. Multiple witnesses confirm a red-light violation.',
  reporters: 8,
  aiConfidence: 87,
  authorityVerified: true,
  timeline: [
    { time: '14:32', event: 'Incident reported by community member' },
    { time: '14:35', event: 'AI flagged as high severity' },
    { time: '14:38', event: '3 additional reports received' },
    { time: '14:42', event: 'Emergency services dispatched' },
    { time: '14:55', event: 'Authority confirmed on-site' },
  ],
};

export default function IncidentDetailScreen({ navigation, route }) {
  const incident = MOCK_INCIDENT;

  const sevColor = {
    low: Colors.severityLow,
    medium: Colors.severityMedium,
    high: Colors.severityHigh,
    critical: Colors.severityCritical,
  }[incident.severity] || Colors.grey;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `SIARA Alert: ${incident.title} - ${incident.severity.toUpperCase()} severity at ${incident.location}`,
      });
    } catch (e) {}
  };

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Incident Details</Text>
        <View style={[styles.sevBadge, { backgroundColor: `${sevColor}18` }]}>
          <View style={[styles.sevDot, { backgroundColor: sevColor }]} />
          <Text style={[styles.sevBadgeText, { color: sevColor }]}>
            {incident.severity.toUpperCase()}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Map placeholder */}
        <View style={styles.mapSection}>
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map" size={40} color={Colors.greyLight} />
            <Text style={styles.mapPlaceholderText}>Incident Location</Text>
            <Text style={styles.mapPlaceholderHint}>{incident.location}</Text>
          </View>
        </View>

        {/* Title & ID */}
        <View style={styles.titleSection}>
          <View style={styles.idRow}>
            <Text style={styles.incId}>{incident.id}</Text>
            <View style={styles.typeBadge}>
              <Ionicons name="car" size={12} color={Colors.secondary} />
              <Text style={styles.typeBadgeText}>{incident.type}</Text>
            </View>
          </View>
          <Text style={styles.title}>{incident.title}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={Colors.subtext} />
            <Text style={styles.meta}>{incident.location}</Text>
            <Ionicons name="time-outline" size={14} color={Colors.subtext} />
            <Text style={styles.meta}>{incident.date}</Text>
          </View>
        </View>

        {/* Trust indicators */}
        <View style={styles.trustRow}>
          <View style={[styles.trustCard, { backgroundColor: Colors.blueLight, borderColor: Colors.blueBorder }]}>
            <View style={[styles.trustIconWrap, { backgroundColor: Colors.secondary }]}>
              <Ionicons name="people" size={18} color={Colors.white} />
            </View>
            <Text style={styles.trustVal}>{incident.reporters}</Text>
            <Text style={styles.trustLabel}>Reporters</Text>
          </View>
          <View style={[styles.trustCard, { backgroundColor: 'rgba(15,169,88,0.08)', borderColor: 'rgba(15,169,88,0.18)' }]}>
            <View style={[styles.trustIconWrap, { backgroundColor: Colors.accent }]}>
              <Ionicons name="shield-checkmark" size={18} color={Colors.white} />
            </View>
            <Text style={styles.trustVal}>{incident.authorityVerified ? 'Yes' : 'No'}</Text>
            <Text style={styles.trustLabel}>Verified</Text>
          </View>
          <View style={[styles.trustCard, { backgroundColor: Colors.violetLight, borderColor: Colors.violetBorder }]}>
            <View style={[styles.trustIconWrap, { backgroundColor: Colors.primary }]}>
              <Ionicons name="analytics" size={18} color={Colors.white} />
            </View>
            <Text style={styles.trustVal}>{incident.aiConfidence}%</Text>
            <Text style={styles.trustLabel}>AI Score</Text>
          </View>
        </View>

        {/* Description card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Description</Text>
          </View>
          <Text style={styles.description}>{incident.description}</Text>
        </View>

        {/* Timeline card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="time" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Status Timeline</Text>
          </View>
          {incident.timeline.map((t, i) => (
            <View key={i} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View style={[
                  styles.timelineDot,
                  i === 0 && styles.timelineDotFirst,
                  i === incident.timeline.length - 1 && styles.timelineDotLast,
                ]} />
                {i < incident.timeline.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTime}>{t.time}</Text>
                <Text style={styles.timelineEvent}>{t.event}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Safety recommendations card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="shield" size={18} color={Colors.accent} />
            <Text style={styles.cardTitle}>Safety Recommendations</Text>
          </View>
          {[
            'Avoid the area if possible',
            "Use alternative routes via Rue Larbi Ben M'hidi",
            'Expect delays of 30-45 minutes',
          ].map((r, i) => (
            <View key={i} style={styles.recRow}>
              <View style={styles.recBullet}>
                <Ionicons name="checkmark" size={12} color={Colors.accent} />
              </View>
              <Text style={styles.recText}>{r}</Text>
            </View>
          ))}
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: 'rgba(15,169,88,0.08)', borderColor: 'rgba(15,169,88,0.2)' }]}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
            <Text style={[styles.actionBtnText, { color: Colors.accent }]}>Verify</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.2)' }]}>
            <Ionicons name="flag" size={20} color={Colors.severityHigh} />
            <Text style={[styles.actionBtnText, { color: Colors.severityHigh }]}>Flag</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.blueLight, borderColor: Colors.blueBorder }]}
            onPress={handleShare}
          >
            <Ionicons name="share-social" size={20} color={Colors.secondary} />
            <Text style={[styles.actionBtnText, { color: Colors.secondary }]}>Share</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '700',
  },
  sevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  sevDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sevBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  scroll: {
    flex: 1,
  },
  container: {
    paddingBottom: 40,
  },

  /* Map section */
  mapSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  mapPlaceholder: {
    height: 180,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  mapPlaceholderText: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  mapPlaceholderHint: {
    color: Colors.subtext,
    fontSize: 12,
    marginTop: 4,
  },

  /* Title section */
  titleSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  incId: {
    color: Colors.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.blueLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.blueBorder,
  },
  typeBadgeText: {
    color: Colors.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    color: Colors.heading,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    lineHeight: 26,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meta: {
    color: Colors.subtext,
    fontSize: 12,
    marginRight: 10,
  },

  /* Trust indicators */
  trustRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  trustCard: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  trustIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trustVal: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  trustLabel: {
    color: Colors.subtext,
    fontSize: 10,
    fontWeight: '500',
  },

  /* Card */
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 22,
  },

  /* Timeline */
  timelineItem: {
    flexDirection: 'row',
    minHeight: 48,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 20,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.blueLight,
    borderWidth: 2,
    borderColor: Colors.secondary,
    marginTop: 4,
    zIndex: 1,
  },
  timelineDotFirst: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  timelineDotLast: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.border,
    marginVertical: -2,
  },
  timelineContent: {
    marginLeft: 12,
    flex: 1,
    paddingBottom: 14,
  },
  timelineTime: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  timelineEvent: {
    color: Colors.text,
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },

  /* Recommendations */
  recRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  recBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15,169,88,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  recText: {
    color: Colors.text,
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },

  /* Action buttons */
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
