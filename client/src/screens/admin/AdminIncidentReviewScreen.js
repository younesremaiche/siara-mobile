import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import AdminHeader from '../../components/layout/AdminHeader';
import {
  fetchAdminIncident,
  submitAdminIncidentAction,
} from '../../services/adminIncidentsService';
import { Colors } from '../../theme/colors';

const ACTIONS = [
  { key: 'verify', label: 'Verify', icon: 'checkmark-circle-outline', color: Colors.adminSuccess },
  { key: 'reject', label: 'Reject', icon: 'close-circle-outline', color: Colors.adminDanger },
  { key: 'archive', label: 'Archive', icon: 'archive-outline', color: Colors.grey },
  { key: 'request_info', label: 'Request Info', icon: 'help-circle-outline', color: Colors.adminInfo },
];

function formatLabel(value) {
  return String(value || 'Unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateTime(value) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString();
}

function getSeverityColor(severity) {
  switch (severity) {
    case 'high':
      return Colors.severityHigh;
    case 'medium':
      return Colors.severityMedium;
    default:
      return Colors.severityLow;
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'verified':
      return Colors.adminSuccess;
    case 'rejected':
      return Colors.adminDanger;
    case 'merged':
      return Colors.adminInfo;
    case 'archived':
      return Colors.grey;
    default:
      return Colors.adminWarning;
  }
}

function getConfidenceLabel(incident) {
  if (
    typeof incident?.aiAssessment?.confidence === 'number'
    && incident.aiAssessment.status === 'completed'
  ) {
    return `${incident.aiAssessment.confidence}%`;
  }

  if (incident?.aiAssessment?.status === 'pending') {
    return 'Pending AI';
  }

  if (incident?.aiAssessment?.status === 'failed') {
    return 'AI failed';
  }

  return 'Unknown';
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
    let isMounted = true;

    async function loadIncident() {
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchAdminIncident(reportId, { signal: controller.signal });
        if (isMounted && !controller.signal.aborted) {
          setIncident(payload);
        }
      } catch (requestError) {
        if (isMounted && !controller.signal.aborted) {
          setError(requestError);
        }
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadIncident();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [reportId]);

  async function refreshIncident() {
    if (!reportId) {
      return;
    }

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

  async function handleAction(action) {
    if (!incident || submitting) {
      return;
    }

    Alert.alert(
      formatLabel(action),
      `Apply "${formatLabel(action)}" to ${incident.displayId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setSubmitting(true);
            setError(null);
            try {
              const updatedIncident = await submitAdminIncidentAction(incident.reportId, {
                action,
              });
              setIncident(updatedIncident);
            } catch (requestError) {
              setError(requestError);
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  }

  async function addNote() {
    if (!incident || !internalNote.trim() || noteSubmitting) {
      return;
    }

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

  const hasCoordinates = useMemo(
    () =>
      typeof incident?.coordinates?.lat === 'number'
      && typeof incident?.coordinates?.lng === 'number',
    [incident]
  );

  function renderState(icon, title, description, retry = false) {
    return (
      <View style={styles.stateCard}>
        <Ionicons name={icon} size={30} color={retry ? Colors.adminDanger : Colors.grey} />
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateText}>{description}</Text>
        {retry ? (
          <TouchableOpacity style={styles.retryButton} onPress={refreshIncident}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <AdminHeader title="Incident Review" navigation={navigation} />
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={Colors.adminInfo} />
          <Text style={styles.loadingText}>Loading incident details...</Text>
        </View>
      </View>
    );
  }

  if (error && !incident) {
    return (
      <View style={styles.root}>
        <AdminHeader title="Incident Review" navigation={navigation} />
        <View style={styles.contentPad}>
          {renderState('alert-circle-outline', 'Could not load incident', error.message || 'Unknown error', true)}
        </View>
      </View>
    );
  }

  if (!incident) {
    return (
      <View style={styles.root}>
        <AdminHeader title="Incident Review" navigation={navigation} />
        <View style={styles.contentPad}>
          {renderState('file-tray-outline', 'Incident not found', 'The requested incident could not be loaded.')}
        </View>
      </View>
    );
  }

  const severityColor = getSeverityColor(incident.severity);
  const statusColor = getStatusColor(incident.status);

  return (
    <View style={styles.root}>
      <AdminHeader title="Incident Review" navigation={navigation} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshIncident}
            tintColor={Colors.adminInfo}
          />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={Colors.adminInfo} />
            <Text style={styles.backText}>Back to Incidents</Text>
          </TouchableOpacity>
          <Text style={styles.incidentId}>{incident.displayId}</Text>
        </View>

        {error ? (
          <View style={styles.inlineError}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.adminDanger} />
            <Text style={styles.inlineErrorText}>{error.message || 'Unknown error'}</Text>
          </View>
        ) : null}

        <View style={styles.mapCard}>
          {hasCoordinates ? (
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: incident.coordinates.lat,
                longitude: incident.coordinates.lng,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              }}
              region={{
                latitude: incident.coordinates.lat,
                longitude: incident.coordinates.lng,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: incident.coordinates.lat,
                  longitude: incident.coordinates.lng,
                }}
                title={incident.title || formatLabel(incident.incidentType)}
                description={incident.location}
              />
            </MapView>
          ) : (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="map-outline" size={34} color={Colors.grey} />
              <Text style={styles.mapPlaceholderTitle}>No coordinates available</Text>
              <Text style={styles.mapPlaceholderText}>{incident.location}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Incident Details</Text>
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusPillText, { color: statusColor }]}>
                {formatLabel(incident.status)}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Title</Text>
            <Text style={styles.detailValue}>{incident.title || formatLabel(incident.incidentType)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={styles.detailValue}>{formatLabel(incident.incidentType)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Severity</Text>
            <View style={[styles.severityPill, { backgroundColor: `${severityColor}18` }]}>
              <Text style={[styles.severityText, { color: severityColor }]}>
                {formatLabel(incident.severity)}
              </Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{incident.location}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Description</Text>
            <Text style={styles.detailValue}>{incident.description}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created</Text>
            <Text style={styles.detailValue}>{formatDateTime(incident.createdAt)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Occurred</Text>
            <Text style={styles.detailValue}>{formatDateTime(incident.occurredAt)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Age</Text>
            <Text style={styles.detailValue}>{incident.ago || 'Unknown'}</Text>
          </View>
          {incident.mergedIntoReportId ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Merged Into</Text>
              <Text style={styles.detailValue}>{incident.mergedIntoReportId}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reporter Info</Text>
          <View style={styles.reporterCard}>
            <View style={styles.reporterAvatar}>
              <Ionicons name="person-outline" size={22} color={Colors.adminInfo} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.reporterName}>{incident.reporter.name}</Text>
              <Text style={styles.reporterSub}>{incident.reporter.email || 'No email available'}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Total Reports</Text>
              <Text style={styles.infoValue}>{incident.reporter.totalReports}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Joined</Text>
              <Text style={styles.infoValue}>{formatDateTime(incident.reporter.joinedAt)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Assessment</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={styles.infoValue}>{formatLabel(incident.aiAssessment.status)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Confidence</Text>
              <Text style={styles.infoValue}>{getConfidenceLabel(incident)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>AI Severity</Text>
              <Text style={styles.infoValue}>{formatLabel(incident.aiAssessment.severity)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Assessed</Text>
              <Text style={styles.infoValue}>{formatDateTime(incident.aiAssessment.assessedAt)}</Text>
            </View>
          </View>

          {incident.aiAssessment.status !== 'completed' ? (
            <View style={styles.noticeCard}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.adminWarning} />
              <Text style={styles.noticeText}>
                AI verification is not fully active yet for this report, so severity can still rely on the report hint.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionsGrid}>
            {ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={[styles.actionButton, { borderColor: `${action.color}40`, backgroundColor: `${action.color}15` }]}
                disabled={submitting}
                onPress={() => handleAction(action.key)}
              >
                <Ionicons name={action.icon} size={20} color={action.color} />
                <Text style={[styles.actionButtonText, { color: action.color }]}>
                  {submitting ? 'Saving...' : action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nearby Reports</Text>
          {incident.nearbyReports.length > 0 ? (
            incident.nearbyReports.map((nearby) => (
              <TouchableOpacity
                key={nearby.reportId}
                style={styles.listRow}
                onPress={() => navigation.push('AdminIncidentReview', { reportId: nearby.reportId })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowTitle}>{nearby.displayId}</Text>
                  <Text style={styles.listRowSubtitle}>{nearby.location}</Text>
                </View>
                <View style={styles.listRowRight}>
                  <Text style={styles.listRowMeta}>{formatLabel(nearby.status)}</Text>
                  <Text style={styles.listRowMeta}>
                    {typeof nearby.distanceKm === 'number' ? `${nearby.distanceKm} km` : 'Unknown'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyInline}>No nearby reports found</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Flags</Text>
          {incident.flags.length > 0 ? (
            incident.flags.map((flag) => (
              <View key={flag.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowTitle}>{formatLabel(flag.reason)}</Text>
                  <Text style={styles.listRowSubtitle}>{flag.comment || 'No comment'}</Text>
                </View>
                <Text style={styles.listRowMeta}>{formatLabel(flag.status)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyInline}>No active flags</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          {incident.timeline.length > 0 ? (
            incident.timeline.map((entry) => (
              <View key={entry.id} style={styles.timelineRow}>
                <View style={styles.timelineDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.timelineTime}>{entry.timeLabel}</Text>
                  <Text style={styles.timelineEvent}>{entry.event}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyInline}>No timeline entries yet</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Review Activity</Text>
          {incident.reviewActions.length > 0 ? (
            incident.reviewActions.map((action) => (
              <View key={action.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listRowTitle}>{formatLabel(action.action)}</Text>
                  <Text style={styles.listRowSubtitle}>{action.note || 'No note'}</Text>
                </View>
                <View style={styles.listRowRight}>
                  <Text style={styles.listRowMeta}>{action.reviewedBy}</Text>
                  <Text style={styles.listRowMeta}>{formatDateTime(action.createdAt)}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyInline}>No admin actions yet</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Internal Notes</Text>
          {incident.notes.length > 0 ? (
            incident.notes.map((note) => (
              <View key={note.id} style={styles.noteItem}>
                <View style={styles.noteHeader}>
                  <Text style={styles.noteAuthor}>{note.author}</Text>
                  <Text style={styles.noteTime}>{formatDateTime(note.time)}</Text>
                </View>
                <Text style={styles.noteText}>{note.text || 'No note text'}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyInline}>No notes yet</Text>
          )}

          <View style={styles.noteComposer}>
            <TextInput
              style={styles.noteInput}
              placeholder="Add an internal note..."
              placeholderTextColor={Colors.grey}
              value={internalNote}
              onChangeText={setInternalNote}
              multiline
            />
            <TouchableOpacity
              style={[styles.noteButton, noteSubmitting && { opacity: 0.6 }]}
              onPress={addNote}
              disabled={noteSubmitting}
            >
              <Text style={styles.noteButtonText}>{noteSubmitting ? 'Saving...' : 'Add Note'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  contentPad: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: Colors.grey, fontSize: 13 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: Colors.adminInfo, fontSize: 13, fontWeight: '600' },
  incidentId: { color: Colors.adminInfo, fontSize: 14, fontWeight: '800' },

  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.28)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  inlineErrorText: { color: Colors.adminDanger, fontSize: 12, flex: 1 },

  mapCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
  },
  map: { width: '100%', height: 220 },
  mapPlaceholder: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  mapPlaceholderTitle: { color: Colors.adminText, fontSize: 15, fontWeight: '700', marginTop: 10 },
  mapPlaceholderText: { color: Colors.grey, fontSize: 12, marginTop: 6, textAlign: 'center' },

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
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: { color: Colors.adminText, fontSize: 16, fontWeight: '700', marginBottom: 12 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  severityPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  severityText: { fontSize: 11, fontWeight: '700' },

  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  detailLabel: { color: Colors.grey, width: 78, fontSize: 12, marginTop: 2 },
  detailValue: { color: Colors.adminText, fontSize: 13, flex: 1, lineHeight: 18 },

  reporterCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  reporterAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.blueLight,
  },
  reporterName: { color: Colors.adminText, fontSize: 14, fontWeight: '700' },
  reporterSub: { color: Colors.grey, fontSize: 12, marginTop: 2 },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoItem: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 10,
  },
  infoLabel: { color: Colors.grey, fontSize: 10, marginBottom: 4, textTransform: 'uppercase' },
  infoValue: { color: Colors.adminText, fontSize: 12, lineHeight: 17, fontWeight: '600' },

  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 10,
    padding: 12,
  },
  noticeText: { color: Colors.adminWarning, fontSize: 12, flex: 1, lineHeight: 18 },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionButton: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionButtonText: { fontSize: 12, fontWeight: '700' },

  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
  },
  listRowTitle: { color: Colors.adminText, fontSize: 13, fontWeight: '700' },
  listRowSubtitle: { color: Colors.grey, fontSize: 11, marginTop: 4, lineHeight: 16 },
  listRowRight: { alignItems: 'flex-end', gap: 4 },
  listRowMeta: { color: Colors.grey, fontSize: 11, textAlign: 'right' },
  emptyInline: { color: Colors.grey, fontSize: 12 },

  timelineRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.adminInfo,
    marginTop: 4,
  },
  timelineTime: { color: Colors.grey, fontSize: 11, marginBottom: 4 },
  timelineEvent: { color: Colors.adminText, fontSize: 12, lineHeight: 18 },

  noteItem: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  noteAuthor: { color: Colors.adminInfo, fontSize: 12, fontWeight: '700' },
  noteTime: { color: Colors.grey, fontSize: 11 },
  noteText: { color: Colors.adminText, fontSize: 12, lineHeight: 18 },
  noteComposer: { marginTop: 4, gap: 10 },
  noteInput: {
    minHeight: 90,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    padding: 12,
    color: Colors.adminText,
    textAlignVertical: 'top',
    fontSize: 13,
  },
  noteButton: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.adminInfo,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteButtonText: { color: Colors.white, fontSize: 12, fontWeight: '700' },

  stateCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  stateTitle: { color: Colors.adminText, fontSize: 15, fontWeight: '700' },
  stateText: { color: Colors.grey, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  retryButton: {
    marginTop: 4,
    backgroundColor: Colors.adminInfo,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
});
