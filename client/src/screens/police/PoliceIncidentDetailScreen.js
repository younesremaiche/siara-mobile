import React from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import PoliceScreenFrame, {
  PoliceListItem,
  PoliceSectionCard,
  PoliceSeverityTag,
  PoliceStatusPill,
  PoliceTimelineItem,
} from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import {
  usePoliceIncident,
  usePoliceIncidentActionMutation,
} from '../../features/police/hooks/usePoliceQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

/* ── Which actions are available per status ──────────────────────── */
function availableActions(incident) {
  const s = (incident?.displayStatus || incident?.status || 'pending').toLowerCase();
  switch (s) {
    case 'pending':
      return incident?.assignedOfficer
        ? ['verify', 'reject', 'resolve', 'backup']
        : ['assign_self', 'verify', 'reject', 'backup'];
    case 'under_review':
      return ['verify', 'reject', 'resolve', 'backup'];
    case 'verified':
      return ['resolve', 'backup'];
    case 'resolved':
    case 'rejected':
      return [];
    default:
      return ['verify', 'reject', 'backup'];
  }
}

/* ── Status banner ────────────────────────────────────────────────── */
const STATUS_CONFIG = {
  pending:      { icon: 'hourglass-outline',    color: '#C86A10', bg: 'rgba(244,162,97,0.13)', label: 'Pending Review' },
  under_review: { icon: 'eye-outline',           color: Colors.secondary, bg: 'rgba(29,78,216,0.1)', label: 'Under Review' },
  verified:     { icon: 'checkmark-circle',      color: Colors.accent,   bg: 'rgba(15,169,88,0.1)', label: 'Verified' },
  rejected:     { icon: 'close-circle',          color: Colors.error,    bg: 'rgba(220,38,38,0.1)', label: 'Rejected' },
  resolved:     { icon: 'shield-checkmark',      color: Colors.subtext,  bg: 'rgba(107,114,128,0.1)', label: 'Resolved' },
};

function StatusBanner({ incident }) {
  if (!incident) return null;
  const key = (incident.displayStatus || incident.status || 'pending').toLowerCase();
  const cfg = STATUS_CONFIG[key] || STATUS_CONFIG.pending;
  return (
    <View style={[sb.wrap, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
      <Ionicons name={cfg.icon} size={18} color={cfg.color} />
      <View style={{ flex: 1 }}>
        <Text style={[sb.label, { color: cfg.color }]}>{cfg.label}</Text>
        {incident.assignedOfficer?.name && (
          <Text style={sb.sub}>Assigned to {incident.assignedOfficer.name}</Text>
        )}
      </View>
      <PoliceSeverityTag severity={incident.severity} />
    </View>
  );
}
const sb = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 14,
    borderWidth: 1,
  },
  label: { fontSize: 14, fontWeight: '800' },
  sub:   { fontSize: 12, color: Colors.subtext, marginTop: 2 },
});

/* ── Action button ────────────────────────────────────────────────── */
function ActionBtn({ label, icon, color, onPress, outline, full }) {
  return (
    <TouchableOpacity
      style={[
        act.btn,
        full && act.btnFull,
        outline
          ? { backgroundColor: color + '10', borderWidth: 1.5, borderColor: color + '50' }
          : { backgroundColor: color, shadowColor: color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10, elevation: 4 },
      ]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <Ionicons name={icon} size={16} color={outline ? color : Colors.white} />
      <Text style={[act.text, { color: outline ? color : Colors.white }]}>{label}</Text>
    </TouchableOpacity>
  );
}
const act = StyleSheet.create({
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14,
  },
  btnFull: { flex: 0, width: '100%' },
  text: { fontSize: 14, fontWeight: '800' },
});

/* ══════════════════════════════════════════════════════════════════
   MAIN SCREEN
══════════════════════════════════════════════════════════════════ */
export default function PoliceIncidentDetailScreen({ route, navigation }) {
  const incidentId = route?.params?.incidentId;
  const autoStart = route?.params?.autoStart;

  const [note,    setNote]    = React.useState('');
  const [actionError, setActionError] = React.useState('');
  const detailQuery = usePoliceIncident(incidentId);
  const actionMutation = usePoliceIncidentActionMutation();
  useFocusRefresh(detailQuery.refetch, Boolean(incidentId));

  const detail = detailQuery.data;
  const loading = detailQuery.isLoading;
  const saving = actionMutation.isPending;
  const error = actionError || detailQuery.error?.message || '';
  const loadDetail = detailQuery.refetch;

  const incident = detail?.incident;
  const actions  = availableActions(incident);

  const runAction = React.useCallback(async (action, confirmed = false) => {
    if (!incident) return;

    // Confirm destructive actions
    if (!confirmed && (action === 'reject' || action === 'resolve')) {
      const isReject = action === 'reject';
      Alert.alert(
        isReject ? 'Reject Incident' : 'Resolve Incident',
        isReject
          ? 'This will mark the incident as rejected and remove it from the active queue. This action cannot be undone.'
          : 'This will mark the incident as resolved and close the case.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: isReject ? 'Reject' : 'Resolve', style: 'destructive', onPress: () => runAction(action, true) },
        ],
      );
      return;
    }

    if (action === 'note' && !note.trim()) {
      Alert.alert('Field note', 'Please enter a note before saving.');
      return;
    }

    setActionError('');
    try {
      let payload = {};
      switch (action) {
        case 'verify':
        case 'reject':
        case 'backup':
        case 'assign_self':
          break;
        case 'resolve':
          payload = { status: 'resolved' };
          break;
        case 'note':
          payload = { note: note.trim() };
          setNote('');
          break;
        default: return;
      }
      await actionMutation.mutateAsync({ incidentId: incident.id, action, payload });

      // Navigate back after terminal actions
      if (action === 'reject' || action === 'resolve') {
        setTimeout(() => navigation.goBack(), 1200);
      }
    } catch (e) {
      setActionError(e.message || 'Action failed.');
    }
  }, [actionMutation, incident, note, navigation]);

  // The list/dashboard/nearby "Start Review / Take Action / Respond" CTAs
  // navigate here with autoStart:true. Honor that intent by prompting the
  // officer to take the case (assign-self → under_review) once the incident
  // has loaded, but only when that action is actually available.
  const autoStartHandledRef = React.useRef(false);
  React.useEffect(() => {
    if (!autoStart || autoStartHandledRef.current || !incident) return;
    autoStartHandledRef.current = true;
    if (!availableActions(incident).includes('assign_self')) return;
    Alert.alert(
      'Start Review',
      'Take this case and begin the review? You will be assigned and the incident moves to Under Review.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Take case', onPress: () => runAction('assign_self') },
      ],
    );
  }, [autoStart, incident, runAction]);

  return (
    <PoliceScreenFrame
      title={incident?.displayId || 'Incident'}
      subtitle={incident?.title || 'Incident detail'}
      loading={loading}
      error={error}
      onRefresh={loadDetail}
      stats={[
        { label: 'Status',   value: incident?.displayStatus || incident?.status || '—', tone: Colors.primary },
        { label: 'Severity', value: incident?.severity || '—',  tone: Colors.severityHigh },
        { label: 'Zone',     value: incident?.wilayaName || '—', tone: Colors.secondary },
      ]}
    >
      {/* Status banner */}
      <StatusBanner incident={incident} />

      {/* Incident summary */}
      <PoliceSectionCard title="Incident Details" icon="document-text-outline">
        <PoliceListItem
          title={incident?.title || '—'}
          subtitle={incident?.description || 'No description provided.'}
          meta={[
            incident?.locationText,
            incident?.occurredAtLabel,
          ]}
        />
        <View style={s.metaGrid}>
          {[
            { icon: 'person-outline',   label: 'Reporter', value: incident?.reportedBy?.name || 'Unknown' },
            { icon: 'shield-outline',   label: 'Assigned',  value: incident?.assignedOfficer?.name || 'Unassigned' },
          ].map(m => (
            <View key={m.label} style={s.metaCell}>
              <Ionicons name={m.icon} size={13} color={Colors.subtext} />
              <View>
                <Text style={s.metaCellLabel}>{m.label}</Text>
                <Text style={s.metaCellValue} numberOfLines={1}>{m.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </PoliceSectionCard>

      {/* Evidence photos — same media the citizen submitted */}
      {(incident?.media || []).length > 0 && (
        <PoliceSectionCard title="Photos" icon="images-outline">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photoRow}>
            {incident.media.map((item, idx) => (
              <Image
                key={item.id || idx}
                source={{ uri: item.url }}
                style={s.photoThumb}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        </PoliceSectionCard>
      )}

      {/* Action buttons — shown only when relevant */}
      {actions.length > 0 ? (
        <PoliceSectionCard title="Actions" icon="flash-outline">
          {saving ? (
            <View style={s.savingRow}>
              <Ionicons name="sync" size={15} color={Colors.primary} />
              <Text style={s.savingText}>Processing...</Text>
            </View>
          ) : (
            <View style={s.actionsGrid}>
              {/* Primary: Verify alone, full width */}
              {actions.includes('verify') && (
                <ActionBtn
                  label="Verify Incident"
                  icon="checkmark-circle"
                  color={Colors.accent}
                  onPress={() => runAction('verify')}
                  full
                />
              )}

              {/* Secondary row: Take Case + Backup */}
              {(actions.includes('assign_self') || actions.includes('backup')) && (
                <View style={s.actionRow}>
                  {actions.includes('assign_self') && (
                    <ActionBtn label="Take Case" icon="person-add-outline" color={Colors.secondary} onPress={() => runAction('assign_self')} outline />
                  )}
                  {actions.includes('backup') && (
                    <ActionBtn label="Backup" icon="people-outline" color={Colors.secondary} onPress={() => runAction('backup')} outline />
                  )}
                </View>
              )}

              {/* Tertiary row: Resolve + Reject */}
              {(actions.includes('resolve') || actions.includes('reject')) && (
                <View style={s.actionRow}>
                  {actions.includes('resolve') && (
                    <ActionBtn label="Resolve" icon="shield-checkmark-outline" color={Colors.subtext} onPress={() => runAction('resolve')} outline />
                  )}
                  {actions.includes('reject') && (
                    <ActionBtn label="Reject" icon="close-circle-outline" color={Colors.error} onPress={() => runAction('reject')} outline />
                  )}
                </View>
              )}
            </View>
          )}
        </PoliceSectionCard>
      ) : (
        <View style={s.closedBanner}>
          <Ionicons name="lock-closed-outline" size={16} color={Colors.subtext} />
          <Text style={s.closedText}>
            This case is {(incident?.displayStatus || incident?.status || '').toLowerCase()} — no further actions available.
          </Text>
        </View>
      )}

      {/* Field note */}
      <PoliceSectionCard title="Field Note" icon="create-outline">
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a field observation, update, or note..."
          placeholderTextColor={Colors.greyLight}
          multiline
          style={s.noteInput}
        />
        <TouchableOpacity
          style={[s.noteBtn, !note.trim() && s.noteBtnOff]}
          onPress={() => runAction('note')}
          activeOpacity={0.88}
          disabled={!note.trim() || saving}
        >
          <Ionicons name="save-outline" size={15} color={note.trim() ? Colors.white : Colors.subtext} />
          <Text style={[s.noteBtnText, !note.trim() && { color: Colors.subtext }]}>Save Note</Text>
        </TouchableOpacity>
      </PoliceSectionCard>

      {/* Activity timeline */}
      {(detail?.history || []).length > 0 && (
        <PoliceSectionCard title="Activity" icon="time-outline">
          {(detail.history || []).map((item, idx, arr) => (
            <PoliceTimelineItem
              key={item.id}
              icon={item.actionType === 'verify_incident'   ? 'checkmark-circle-outline'
                  : item.actionType === 'reject_incident'   ? 'close-circle-outline'
                  : item.actionType === 'request_backup'    ? 'people-outline'
                  : item.actionType === 'assign_self'       ? 'person-add-outline'
                  : item.actionType === 'field_note'        ? 'create-outline'
                  : item.actionType === 'update_status'     ? 'shield-checkmark-outline'
                  : 'ellipse-outline'}
              title={item.actionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              subtitle={item.note || undefined}
              timeLabel={item.createdAtLabel}
              isLast={idx === arr.length - 1}
            />
          ))}
        </PoliceSectionCard>
      )}

      {/* Nearby incidents */}
      {(detail?.nearbyIncidents || []).length > 0 && (
        <PoliceSectionCard title="Nearby Incidents" icon="location-outline">
          {detail.nearbyIncidents.slice(0, 3).map(n => (
            <PoliceListItem
              key={n.id}
              title={n.title || n.displayId}
              subtitle={n.locationText}
              meta={[n.relativeTime]}
              right={<PoliceStatusPill status={n.status} />}
              onPress={() => navigation.push('PoliceIncidentDetail', { incidentId: n.id })}
            />
          ))}
        </PoliceSectionCard>
      )}
    </PoliceScreenFrame>
  );
}

const s = StyleSheet.create({
  metaGrid: {
    flexDirection: 'row', gap: 10, marginTop: 4,
  },
  metaCell: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.bg, borderRadius: 12, padding: 11,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  metaCellLabel: { color: Colors.subtext, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  metaCellValue: { color: Colors.heading, fontSize: 13, fontWeight: '700', marginTop: 1 },

  photoRow: { gap: 10, paddingTop: 2 },
  photoThumb: { width: 150, height: 110, borderRadius: 12, backgroundColor: Colors.bg },

  actionsGrid: {
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row', gap: 10,
  },

  savingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, justifyContent: 'center',
  },
  savingText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },

  closedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.bg, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
  },
  closedText: { color: Colors.subtext, fontSize: 13, flex: 1 },

  noteInput: {
    minHeight: 90,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 13,
    backgroundColor: Colors.bg,
    color: Colors.heading,
    textAlignVertical: 'top',
    fontSize: 13,
  },
  noteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: Colors.primary,
    borderRadius: 13, paddingVertical: 12,
  },
  noteBtnOff: {
    backgroundColor: Colors.bg,
    borderWidth: 1, borderColor: Colors.border,
  },
  noteBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },
});
