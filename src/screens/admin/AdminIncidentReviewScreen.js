import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';

// ── Default incident data ────────────────────────────────
const DEFAULT_INCIDENT = {
  id: 'INC-3001',
  type: 'Multi-vehicle collision',
  location: 'RN1, Km 34, Blida',
  severity: 'Critical',
  status: 'Pending',
  reportedBy: 'AI System',
  date: '2026-03-06 08:14',
  description:
    'Major collision involving 3 vehicles on the national highway near Blida. Emergency services dispatched. Expect significant traffic delays.',
};

// ── AI Analysis ─────────────────────────────────────────
const AI_ANALYSIS = {
  confidenceScore: 97,
  suggestedAction: 'Approve and escalate to emergency services',
  riskFactors: [
    { label: 'Image analysis', score: 98, detail: 'Multiple vehicles detected in collision pattern' },
    { label: 'NLP text classification', score: 95, detail: 'Keywords: collision, highway, casualties' },
    { label: 'Location risk context', score: 94, detail: 'RN1 Blida corridor is a known high-risk zone' },
    { label: 'Temporal pattern match', score: 91, detail: 'Morning rush hour aligns with historical data' },
    { label: 'Cross-report correlation', score: 88, detail: '2 corroborating reports from same area' },
  ],
};

// ── Status History Timeline ─────────────────────────────
const STATUS_HISTORY = [
  { time: '08:14', event: 'Incident reported by AI detection pipeline', icon: 'hardware-chip', color: Colors.adminInfo },
  { time: '08:14', event: 'Auto-classified as Critical (confidence 97%)', icon: 'analytics', color: Colors.severityCritical },
  { time: '08:15', event: 'Emergency alert auto-sent to Blida zone', icon: 'notifications', color: Colors.adminWarning },
  { time: '08:16', event: 'Community corroboration received (Karim B.)', icon: 'people', color: Colors.adminSuccess },
  { time: '08:18', event: 'Placed in admin review queue', icon: 'time', color: Colors.grey },
];

// ── Reporter Info ───────────────────────────────────────
const REPORTER = {
  name: 'AI Detection Pipeline v3.2',
  type: 'Automated System',
  trustScore: 99,
  totalReports: 12847,
  accuracy: '98.6%',
};

const severityColor = (s) => {
  const map = {
    Critical: Colors.severityCritical,
    High: Colors.severityHigh,
    Medium: Colors.severityMedium,
    Low: Colors.severityLow,
  };
  return map[s] || Colors.grey;
};

// ── Component ────────────────────────────────────────────
export default function AdminIncidentReviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const incident = route.params?.incident || DEFAULT_INCIDENT;

  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState([
    { id: 1, author: 'Admin A.', text: 'Checking with local gendarmerie for confirmation.', time: '08:20' },
  ]);

  const handleAction = (actionLabel) => {
    Alert.alert(
      actionLabel,
      `Apply "${actionLabel}" to ${incident.id}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => Alert.alert('Success', `"${actionLabel}" applied to ${incident.id}`) },
      ]
    );
  };

  const addNote = () => {
    if (!notes.trim()) return;
    setSavedNotes([
      ...savedNotes,
      { id: Date.now(), author: 'You (Super Admin)', text: notes.trim(), time: 'now' },
    ]);
    setNotes('');
  };

  return (
    <View style={styles.root}>
      <AdminHeader title="Incident Review" navigation={navigation} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Back button + Incident ID */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={Colors.adminInfo} />
            <Text style={styles.backText}>Back to Incidents</Text>
          </TouchableOpacity>
          <Text style={styles.incidentId}>{incident.id}</Text>
        </View>

        {/* ── Map Placeholder ──────────────────────── */}
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map" size={44} color={Colors.grey} />
          <Text style={styles.mapText}>Incident Location Map</Text>
          <Text style={styles.mapSub}>{incident.location}</Text>
        </View>

        {/* ── Incident Details ─────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Incident Details</Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    incident.status === 'Pending'
                      ? 'rgba(245,158,11,0.15)'
                      : 'rgba(255,255,255,0.08)',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  {
                    color:
                      incident.status === 'Pending' ? Colors.adminWarning : Colors.grey,
                  },
                ]}
              >
                {incident.status}
              </Text>
            </View>
          </View>

          {/* Type */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type</Text>
            <View style={styles.typeBadge}>
              <Ionicons name="car" size={12} color={Colors.btnPrimary} />
              <Text style={styles.typeBadgeText}>{incident.type}</Text>
            </View>
          </View>

          {/* Severity */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Severity</Text>
            <View style={[styles.sevBadge, { backgroundColor: severityColor(incident.severity) + '20' }]}>
              <View style={[styles.sevDot, { backgroundColor: severityColor(incident.severity) }]} />
              <Text style={[styles.sevText, { color: severityColor(incident.severity) }]}>
                {incident.severity}
              </Text>
            </View>
          </View>

          {/* Location */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location</Text>
            <View style={styles.locationWrap}>
              <Ionicons name="location" size={14} color={Colors.adminInfo} />
              <Text style={styles.detailValue}>{incident.location}</Text>
            </View>
          </View>

          {/* Description */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Description</Text>
            <Text style={styles.detailValue}>{incident.description}</Text>
          </View>

          {/* Reporter */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reporter</Text>
            <Text style={styles.detailValue}>{incident.reportedBy}</Text>
          </View>

          {/* Timestamp */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Timestamp</Text>
            <Text style={styles.detailValue}>{incident.date}</Text>
          </View>
        </View>

        {/* ── Reporter Info ────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reporter Info</Text>
          <View style={styles.reporterCard}>
            <View style={styles.reporterAvatar}>
              <Ionicons name="hardware-chip" size={24} color={Colors.adminInfo} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.reporterName}>{REPORTER.name}</Text>
              <Text style={styles.reporterType}>{REPORTER.type}</Text>
            </View>
          </View>
          <View style={styles.reporterStats}>
            <View style={styles.reporterStat}>
              <Text style={styles.statValue}>{REPORTER.trustScore}</Text>
              <Text style={styles.statLabel}>Trust</Text>
            </View>
            <View style={styles.reporterStat}>
              <Text style={styles.statValue}>{REPORTER.totalReports.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Reports</Text>
            </View>
            <View style={styles.reporterStat}>
              <Text style={styles.statValue}>{REPORTER.accuracy}</Text>
              <Text style={styles.statLabel}>Accuracy</Text>
            </View>
          </View>
        </View>

        {/* ── AI Analysis Card ─────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Analysis</Text>

          {/* Confidence score circle */}
          <View style={styles.confBig}>
            <View style={styles.confCircle}>
              <Text style={styles.confBigValue}>{AI_ANALYSIS.confidenceScore}%</Text>
              <Text style={styles.confBigLabel}>Confidence</Text>
            </View>
          </View>

          {/* Suggested action */}
          <View style={styles.suggestedBox}>
            <Ionicons name="bulb" size={16} color={Colors.adminWarning} />
            <Text style={styles.suggestedText}>{AI_ANALYSIS.suggestedAction}</Text>
          </View>

          {/* Risk factors with score bars */}
          <Text style={styles.factorsTitle}>Risk Factors</Text>
          {AI_ANALYSIS.riskFactors.map((f, i) => (
            <View key={i} style={styles.factorRow}>
              <View style={styles.factorTop}>
                <Text style={styles.factorLabel}>{f.label}</Text>
                <Text style={styles.factorScore}>{f.score}%</Text>
              </View>
              <View style={styles.factorBar}>
                <View
                  style={[
                    styles.factorFill,
                    {
                      width: `${f.score}%`,
                      backgroundColor:
                        f.score > 93
                          ? Colors.adminSuccess
                          : f.score > 85
                          ? Colors.adminInfo
                          : Colors.adminWarning,
                    },
                  ]}
                />
              </View>
              <Text style={styles.factorDetail}>{f.detail}</Text>
            </View>
          ))}
        </View>

        {/* ── Action Buttons (4: Approve, Reject, Escalate, Request Info) ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={[
                styles.bigActionBtn,
                { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' },
              ]}
              onPress={() => handleAction('Approve')}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={24} color={Colors.adminSuccess} />
              <Text style={[styles.bigActionLabel, { color: Colors.adminSuccess }]}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.bigActionBtn,
                { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.3)' },
              ]}
              onPress={() => handleAction('Reject')}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={24} color={Colors.adminDanger} />
              <Text style={[styles.bigActionLabel, { color: Colors.adminDanger }]}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.bigActionBtn,
                { backgroundColor: 'rgba(249,115,22,0.12)', borderColor: 'rgba(249,115,22,0.3)' },
              ]}
              onPress={() => handleAction('Escalate')}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-up-circle" size={24} color={Colors.severityHigh} />
              <Text style={[styles.bigActionLabel, { color: Colors.severityHigh }]}>Escalate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.bigActionBtn,
                { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.3)' },
              ]}
              onPress={() => handleAction('Request Info')}
              activeOpacity={0.7}
            >
              <Ionicons name="help-circle" size={24} color={Colors.adminInfo} />
              <Text style={[styles.bigActionLabel, { color: Colors.adminInfo }]}>Request Info</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Status History Timeline ──────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status History</Text>
          {STATUS_HISTORY.map((t, i) => (
            <View key={i} style={styles.timelineItem}>
              <View style={styles.timelineLine}>
                <View style={[styles.timelineDot, { backgroundColor: t.color }]}>
                  <Ionicons name={t.icon} size={12} color={Colors.white} />
                </View>
                {i < STATUS_HISTORY.length - 1 && <View style={styles.timelineConnector} />}
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTime}>{t.time}</Text>
                <Text style={styles.timelineEvent}>{t.event}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Internal Notes ───────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Internal Notes</Text>

          {savedNotes.map((n) => (
            <View key={n.id} style={styles.noteItem}>
              <View style={styles.noteHeader}>
                <Text style={styles.noteAuthor}>{n.author}</Text>
                <Text style={styles.noteTime}>{n.time}</Text>
              </View>
              <Text style={styles.noteText}>{n.text}</Text>
            </View>
          ))}

          <View style={styles.noteInput}>
            <TextInput
              style={styles.noteTextInput}
              placeholder="Add an internal note..."
              placeholderTextColor={Colors.grey}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <TouchableOpacity style={styles.noteSendBtn} onPress={addNote}>
              <Ionicons name="send" size={18} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  /* Top bar */
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: Colors.adminInfo, fontSize: 13, fontWeight: '500' },
  incidentId: { color: Colors.btnPrimary, fontSize: 15, fontWeight: '800' },

  /* Map placeholder */
  mapPlaceholder: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 30,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  mapText: { color: Colors.adminText, fontSize: 15, fontWeight: '700', marginTop: 10 },
  mapSub: { color: Colors.grey, fontSize: 12, marginTop: 4 },

  /* Section */
  section: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: { color: Colors.white, fontSize: 16, fontWeight: '700', marginBottom: 12 },

  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 12, fontWeight: '600' },

  /* Detail rows */
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 12 },
  detailLabel: { color: Colors.grey, fontSize: 12, width: 75, marginTop: 2 },
  detailValue: { color: Colors.adminText, fontSize: 13, flex: 1 },
  locationWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 4,
  },
  typeBadgeText: { color: Colors.btnPrimary, fontSize: 12, fontWeight: '600' },
  sevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  sevDot: { width: 7, height: 7, borderRadius: 4 },
  sevText: { fontSize: 12, fontWeight: '600' },

  /* Reporter */
  reporterCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  reporterAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(59,130,246,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reporterName: { color: Colors.adminText, fontSize: 14, fontWeight: '700' },
  reporterType: { color: Colors.grey, fontSize: 12 },
  reporterStats: { flexDirection: 'row', justifyContent: 'space-around' },
  reporterStat: { alignItems: 'center' },
  statValue: { color: Colors.white, fontSize: 18, fontWeight: '700' },
  statLabel: { color: Colors.grey, fontSize: 11 },

  /* AI Analysis */
  confBig: { alignItems: 'center', marginBottom: 16 },
  confCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: Colors.adminSuccess,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  confBigValue: { color: Colors.adminSuccess, fontSize: 26, fontWeight: '800' },
  confBigLabel: { color: Colors.grey, fontSize: 10 },

  suggestedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  suggestedText: { color: Colors.adminText, fontSize: 13, flex: 1 },

  factorsTitle: { color: Colors.adminText, fontSize: 13, fontWeight: '600', marginBottom: 10 },
  factorRow: { marginBottom: 14 },
  factorTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  factorLabel: { color: Colors.adminText, fontSize: 12 },
  factorScore: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  factorBar: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 3,
  },
  factorFill: { height: '100%', borderRadius: 3 },
  factorDetail: { color: Colors.grey, fontSize: 11, fontStyle: 'italic' },

  /* Action buttons (2x2 grid) */
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bigActionBtn: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  bigActionLabel: { fontSize: 14, fontWeight: '700' },

  /* Timeline */
  timelineItem: { flexDirection: 'row', minHeight: 54 },
  timelineLine: { alignItems: 'center', width: 30, marginRight: 10 },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.adminBorder,
    marginVertical: 2,
  },
  timelineContent: { flex: 1, paddingBottom: 14 },
  timelineTime: { color: Colors.grey, fontSize: 11, marginBottom: 2 },
  timelineEvent: { color: Colors.adminText, fontSize: 12 },

  /* Notes */
  noteItem: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  noteAuthor: { color: Colors.adminInfo, fontSize: 12, fontWeight: '600' },
  noteTime: { color: Colors.grey, fontSize: 11 },
  noteText: { color: Colors.adminText, fontSize: 12 },
  noteInput: { flexDirection: 'row', gap: 8, marginTop: 4 },
  noteTextInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 8,
    padding: 10,
    color: Colors.adminText,
    fontSize: 13,
    minHeight: 60,
  },
  noteSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: Colors.btnPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
});
