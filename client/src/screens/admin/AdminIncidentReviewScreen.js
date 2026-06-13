import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import AdminHeader from '../../components/layout/AdminHeader';
import AdminLeafletMap from '../../components/map/AdminLeafletMap';
import { fetchAdminIncident, submitAdminIncidentAction } from '../../services/adminIncidentsService';
import { Colors } from '../../theme/colors';

const ACTIONS = [
  ['verify', 'Verify', 'checkmark-circle-outline', Colors.adminSuccess],
  ['reject', 'Reject', 'close-circle-outline', Colors.adminDanger],
  ['archive', 'Archive', 'archive-outline', Colors.greyLight],
  ['request_info', 'Request Info', 'help-circle-outline', Colors.adminInfo],
];
const EMPTY_TEXT = '-';

function formatLabel(value) {
  return String(value || 'Unknown').replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return EMPTY_TEXT;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? EMPTY_TEXT : date.toLocaleString();
}

function formatPercent(value, digits = 2) {
  return typeof value === 'number' ? `${value.toFixed(digits)}%` : EMPTY_TEXT;
}

function formatMlStatus(value) {
  const text = String(value || '').trim();
  if (!text) return 'Not started';
  return text.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatPredictedLabel(value) {
  if (!value) return 'Unclassified';
  return value === 'spam' ? 'Spam' : 'Real';
}

function getStatusColor(status) {
  switch (String(status || '').toLowerCase()) {
    case 'verified': return Colors.adminSuccess;
    case 'rejected': return Colors.adminDanger;
    case 'merged': return Colors.adminInfo;
    case 'archived': return Colors.greyLight;
    default: return Colors.adminWarning;
  }
}

function metric(label, value) {
  return (
    <View style={styles.metricCard} key={label}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value || EMPTY_TEXT}</Text>
    </View>
  );
}

export default function AdminIncidentReviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const reportId = route.params?.reportId || route.params?.incident?.reportId || route.params?.incident?.id || '';
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [internalNote, setInternalNote] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!reportId) {
      setLoading(false);
      setError(new Error('Missing report id'));
      return undefined;
    }
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchAdminIncident(reportId, { signal: controller.signal });
        if (!controller.signal.aborted) setIncident(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [reportId]);

  const hasCoordinates = useMemo(
    () => typeof incident?.coordinates?.lat === 'number' && typeof incident?.coordinates?.lng === 'number',
    [incident]
  );

  async function refreshIncident() {
    if (!reportId) return;
    setRefreshing(true);
    setError(null);
    try {
      const payload = await fetchAdminIncident(reportId);
      setIncident(payload);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setRefreshing(false);
    }
  }

  function handleAction(action) {
    if (!incident || submitting) return;
    Alert.alert(formatLabel(action), `Apply "${formatLabel(action)}" to ${incident.displayId}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setSubmitting(true);
          setError(null);
          try {
            const updatedIncident = await submitAdminIncidentAction(incident.reportId, { action });
            setIncident(updatedIncident);
          } catch (requestError) {
            setError(requestError);
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }

  async function addNote() {
    if (!incident || !internalNote.trim() || noteSubmitting) return;
    setNoteSubmitting(true);
    setError(null);
    try {
      const updatedIncident = await submitAdminIncidentAction(incident.reportId, {
        action: 'note',
        note: internalNote.trim(),
      });
      setIncident(updatedIncident);
      setInternalNote('');
    } catch (requestError) {
      setError(requestError);
    } finally {
      setNoteSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <AdminHeader title="Incident Review" navigation={navigation} />
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={Colors.adminInfo} />
          <Text style={styles.subtle}>Loading incident details...</Text>
        </View>
      </View>
    );
  }

  if (error && !incident) {
    return (
      <View style={styles.root}>
        <AdminHeader title="Incident Review" navigation={navigation} />
        <View style={styles.content}>
          <View style={[styles.card, styles.errorCard]}>
            <Text style={styles.title}>Could not load incident</Text>
            <Text style={styles.subtle}>{error.message || 'Unknown error'}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={refreshIncident} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (!incident) {
    return null;
  }

  const spam = incident.spamAnalysis || {};
  const statusColor = getStatusColor(incident.status);

  return (
    <View style={styles.root}>
      <AdminHeader title="Incident Review" navigation={navigation} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshIncident} tintColor={Colors.adminInfo} />}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={18} color={Colors.adminInfo} />
            <Text style={styles.backText}>Back to incidents</Text>
          </TouchableOpacity>
          <Text style={styles.queueId}>{incident.displayId}</Text>
        </View>

        {error ? (
          <View style={styles.inlineError}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.adminDanger} />
            <Text style={styles.inlineErrorText}>{error.message || 'Unknown error'}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          {hasCoordinates ? (
            <AdminLeafletMap
              style={styles.map}
              interactive={false}
              center={[incident.coordinates.lat, incident.coordinates.lng]}
              zoom={13}
              markers={[{
                id: incident.reportId || 'incident',
                lat: incident.coordinates.lat,
                lng: incident.coordinates.lng,
                color: Colors.adminInfo,
                size: 18,
                isReport: true,
                label: incident.title || formatLabel(incident.incidentType),
              }]}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="map-outline" size={34} color={Colors.greyLight} />
              <Text style={styles.title}>No coordinates available</Text>
              <Text style={styles.subtle}>{incident.location}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionTop}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.title}>{incident.title || formatLabel(incident.incidentType)}</Text>
              <Text style={styles.subtle}>{incident.location}</Text>
            </View>
            <Text style={[styles.statusText, { color: statusColor }]}>{formatLabel(incident.status)}</Text>
          </View>
          <Text style={styles.rowText}>Type: {formatLabel(incident.incidentType)}</Text>
          <Text style={styles.rowText}>Severity: {formatLabel(incident.severity)}</Text>
          <Text style={styles.rowText}>Severity source: {incident.severitySource === 'ai' ? 'AI assessment' : 'Report hint'}</Text>
          <Text style={styles.rowText}>Reported: {formatDateTime(incident.createdAt)}</Text>
          <Text style={styles.rowText}>Occurred: {formatDateTime(incident.occurredAt)}</Text>
          <Text style={styles.rowText}>Age: {incident.ago || EMPTY_TEXT}</Text>
          <Text style={styles.rowText}>Description: {incident.description || EMPTY_TEXT}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Reporter profile</Text>
          <View style={styles.grid}>
            {[
              ['Reporter', incident.reporter.name],
              ['Reporter trust', typeof incident.reporter.reporterScore === 'number' ? `${incident.reporter.reporterScore.toFixed(1)}%` : 'Not provided'],
              ['Total reports', String(incident.reporter.totalReports)],
              ['Joined', formatDateTime(incident.reporter.joinedAt)],
            ].map(([label, value]) => metric(label, value))}
          </View>
          {incident.reporter.email ? <Text style={styles.rowText}>Email: {incident.reporter.email}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>AI assessment</Text>
          <View style={styles.grid}>
            {[
              ['Status', formatLabel(incident.aiAssessment.status || 'not_available')],
              ['Confidence', typeof incident.aiAssessment.confidence === 'number' && incident.aiAssessment.status === 'completed' ? `${incident.aiAssessment.confidence}%` : incident.aiAssessment.status === 'pending' ? 'Pending AI' : incident.aiAssessment.status === 'failed' ? 'AI failed' : EMPTY_TEXT],
              ['AI severity', formatLabel(incident.aiAssessment.severity)],
              ['Assessed at', formatDateTime(incident.aiAssessment.assessedAt)],
            ].map(([label, value]) => metric(label, value))}
          </View>
          {incident.aiAssessment.modelVersionId ? <Text style={styles.rowText}>Model version: {incident.aiAssessment.modelVersionId}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Spam analysis</Text>
          <View style={styles.grid}>
            {[
              ['Predicted label', formatPredictedLabel(spam.predictedLabel)],
              ['ML status', formatMlStatus(spam.status)],
              ['Spam score', formatPercent(spam.spamScore)],
              ['ML confidence', formatPercent(spam.confidence)],
              ['Model version', spam.modelVersion || EMPTY_TEXT],
              ['Classified at', formatDateTime(spam.classifiedAt)],
              ['Review verdict', spam.reviewVerdict || 'Pending'],
              ['Reviewed by', spam.reviewedBy || EMPTY_TEXT],
            ].map(([label, value]) => metric(label, value))}
          </View>
          {spam.pendingReview ? <Text style={[styles.rowText, styles.warningText]}>Pending manual review: this report is suspicious and still needs a verdict.</Text> : null}
          {spam.reviewNotes ? <Text style={styles.rowText}>Review notes: {spam.reviewNotes}</Text> : null}
          {spam.reviewedAt ? <Text style={styles.rowText}>Reviewed at: {formatDateTime(spam.reviewedAt)}</Text> : null}
        </View>

        {incident.media.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.title}>Evidence</Text>
            <View style={styles.grid}>
              {incident.media.map((item) => (
                <View key={item.id} style={styles.mediaCard}>
                  <Image source={{ uri: item.url }} style={styles.mediaImage} resizeMode="cover" />
                  <Text style={styles.mediaText}>{formatLabel(item.mediaType)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.title}>Nearby reports</Text>
          {incident.nearbyReports.length > 0 ? incident.nearbyReports.map((item) => (
            <Text key={item.reportId} style={styles.rowText}>
              {item.displayId}: {item.location} - {typeof item.distanceKm === 'number' ? `${item.distanceKm.toFixed(1)} km` : EMPTY_TEXT}
            </Text>
          )) : <Text style={styles.subtle}>No nearby reports found.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Timeline</Text>
          {incident.timeline.length > 0 ? incident.timeline.map((entry) => (
            <Text key={entry.id} style={styles.rowText}>{entry.timeLabel}: {entry.event}</Text>
          )) : <Text style={styles.subtle}>No timeline entries yet.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Internal notes</Text>
          {incident.notes.length > 0 ? incident.notes.map((note) => (
            <View key={note.id} style={styles.noteBlock}>
              <Text style={styles.noteAuthor}>{note.author} - {formatDateTime(note.time)}</Text>
              <Text style={styles.noteBody}>{note.text}</Text>
            </View>
          )) : <Text style={styles.subtle}>No notes yet.</Text>}
          <TextInput
            style={styles.noteInput}
            placeholder="Add internal note..."
            placeholderTextColor={Colors.grey}
            value={internalNote}
            onChangeText={setInternalNote}
            multiline
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={addNote} disabled={noteSubmitting} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>{noteSubmitting ? 'Saving...' : 'Add note'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Actions</Text>
          <View style={styles.grid}>
            {ACTIONS.map(([key, label, icon, color]) => (
              <TouchableOpacity key={key} style={styles.actionBtn} onPress={() => handleAction(key)} disabled={submitting} activeOpacity={0.85}>
                <Ionicons name={icon} size={18} color={color} />
                <Text style={[styles.actionText, { color }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: Colors.adminSurface, borderWidth: 1, borderColor: Colors.adminBorder, borderRadius: 16, padding: 16, marginBottom: 14 },
  errorCard: { borderColor: 'rgba(239,68,68,0.35)', backgroundColor: 'rgba(239,68,68,0.08)' },
  title: { color: Colors.adminText, fontSize: 16, fontWeight: '700' },
  subtle: { color: Colors.greyLight, fontSize: 12, lineHeight: 18, marginTop: 6 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: Colors.adminInfo, fontSize: 12, fontWeight: '600', marginLeft: 6 },
  queueId: { color: Colors.adminText, fontSize: 13, fontWeight: '700' },
  inlineError: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  inlineErrorText: { color: Colors.adminDanger, fontSize: 12, marginLeft: 8, flex: 1 },
  map: { height: 230, borderRadius: 14, overflow: 'hidden' },
  mapPlaceholder: { height: 220, borderRadius: 14, borderWidth: 1, borderColor: Colors.adminBorder, backgroundColor: 'rgba(255,255,255,0.02)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sectionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  rowText: { color: Colors.adminText, fontSize: 12, lineHeight: 19, marginTop: 8 },
  warningText: { color: Colors.adminWarning },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 10 },
  metricCard: { width: '48%', backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: Colors.adminBorder, borderRadius: 12, padding: 12, marginBottom: 12 },
  metricLabel: { color: Colors.greyLight, fontSize: 11, marginBottom: 6 },
  metricValue: { color: Colors.adminText, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  mediaCard: { width: '48%', marginBottom: 12 },
  mediaImage: { width: '100%', height: 110, borderRadius: 12, backgroundColor: Colors.adminBorder },
  mediaText: { color: Colors.greyLight, fontSize: 11, marginTop: 6 },
  noteBlock: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.adminBorder },
  noteAuthor: { color: Colors.adminInfo, fontSize: 11, fontWeight: '700' },
  noteBody: { color: Colors.adminText, fontSize: 12, lineHeight: 18, marginTop: 4 },
  noteInput: { minHeight: 88, borderRadius: 12, borderWidth: 1, borderColor: Colors.adminBorder, backgroundColor: 'rgba(255,255,255,0.02)', color: Colors.adminText, fontSize: 12, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top', marginTop: 12, marginBottom: 10 },
  primaryBtn: { backgroundColor: Colors.adminInfo, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start', marginTop: 8, marginRight: 10 },
  primaryBtnText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  actionBtn: { width: '48%', borderWidth: 1, borderColor: Colors.adminBorder, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.02)' },
  actionText: { fontSize: 12, fontWeight: '700', marginLeft: 8 },
});
