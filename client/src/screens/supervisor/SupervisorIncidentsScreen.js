import React from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import SupervisorScreenFrame, {
  S,
  SupervisorSectionCard,
  SupervisorStatusPill,
  SupervisorSeverityTag,
} from '../../components/supervisor/SupervisorScreenFrame';
import {
  useAssignableOfficers,
  useAssignOfficerMutation,
  useSupervisorIncidents,
} from '../../features/supervisor/hooks/useSupervisorQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

function relativeTime(val) {
  if (!val) return '';
  const diff = Date.now() - new Date(val).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── Officer assign modal ─────────────────────────────────────── */
function AssignModal({ incident, onClose, onAssigned }) {
  const officersQuery = useAssignableOfficers(incident.id);
  const assignMutation = useAssignOfficerMutation();
  const officersPayload = officersQuery.data;
  const officers = Array.isArray(officersPayload?.officers)
    ? officersPayload.officers
    : Array.isArray(officersPayload)
      ? officersPayload
      : [];
  const loading = officersQuery.isLoading;
  const saving = assignMutation.isPending;

  async function assign(officer) {
    try {
      await assignMutation.mutateAsync({ incidentId: incident.id, officerId: officer.id });
      Alert.alert('Assigned', `${officer.name} assigned to this incident.`);
      onAssigned();
      onClose();
    } catch (e) {
      Alert.alert('Error', e.message || 'Assignment failed.');
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.handle} />
          <Text style={m.sheetTitle}>Assign Officer</Text>
          <Text style={m.sheetSub} numberOfLines={1}>{incident.title || incident.id}</Text>

          {loading ? (
            <Text style={m.sheetMuted}>Loading officers...</Text>
          ) : officers.length === 0 ? (
            <Text style={m.sheetMuted}>No assignable officers found.</Text>
          ) : (
            <FlatList
              data={officers}
              keyExtractor={o => o.id}
              style={{ maxHeight: 340 }}
              renderItem={({ item: o }) => (
                <TouchableOpacity
                  style={[m.officerRow, saving && { opacity: 0.5 }]}
                  onPress={() => !saving && assign(o)}
                  activeOpacity={0.78}
                >
                  <View style={m.officerAvatar}>
                    <Text style={m.officerInitials}>
                      {(o.name || 'O').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.officerName}>{o.name}</Text>
                    <Text style={m.officerMeta}>
                      {[
                        o.badgeNumber ? `#${o.badgeNumber}` : null,
                        o.communeName,
                        o.distanceLabel || (o.distanceMeters != null
                          ? (o.distanceMeters >= 1000
                              ? `${(o.distanceMeters / 1000).toFixed(1)} km away`
                              : `${Math.round(o.distanceMeters)} m away`)
                          : null),
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={[m.dutyBadge, { backgroundColor: o.isOnDuty ? 'rgba(34,197,94,0.14)' : 'rgba(100,116,139,0.14)' }]}>
                    <Text style={[m.dutyText, { color: o.isOnDuty ? '#22C55E' : '#94A3B8' }]}>
                      {o.isOnDuty ? 'ON' : 'OFF'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity style={m.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={m.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ── Incident row ─────────────────────────────────────────────── */
function IncidentRow({ incident, onAssign, onView }) {
  const status = (incident.displayStatus || incident.status || 'pending');
  const assignedName = incident.assignedOfficer?.name || incident.assignedOfficerName || null;
  const location = incident.locationLabel || incident.locationText
    || incident.commune?.name || incident.wilaya?.name || null;
  return (
    <View style={s.incRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.incTitle} numberOfLines={1}>{incident.title || incident.displayId || '—'}</Text>
        {location ? <Text style={s.incMeta} numberOfLines={1}>{location}</Text> : null}
        <View style={s.incTags}>
          <SupervisorStatusPill status={status} />
          {incident.severity && <SupervisorSeverityTag severity={incident.severity} />}
          <Text style={s.incTime}>{relativeTime(incident.occurredAt || incident.createdAt)}</Text>
        </View>
        {/* Currently assigned officer — mirrors the web "Assigned To" column */}
        <View style={s.assignedRow}>
          <Ionicons
            name={assignedName ? 'shield-checkmark-outline' : 'shield-outline'}
            size={12}
            color={assignedName ? '#22C55E' : S.muted}
          />
          <Text style={[s.assignedText, assignedName && { color: S.light }]} numberOfLines={1}>
            {assignedName ? `Assigned to ${assignedName}` : 'Unassigned'}
          </Text>
        </View>
      </View>
      <View style={s.incActions}>
        <TouchableOpacity style={s.viewBtn} onPress={() => onView(incident)} activeOpacity={0.8}>
          <Ionicons name="eye-outline" size={14} color={S.muted} />
          <Text style={s.viewBtnText}>View</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.assignBtn} onPress={() => onAssign(incident)} activeOpacity={0.8}>
          <Ionicons name="person-add-outline" size={14} color={S.accent} />
          <Text style={s.assignBtnText}>Assign</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SupervisorIncidentsScreen({ navigation }) {
  const [search,         setSearch]         = React.useState('');
  const [statusFilter,   setStatusFilter]   = React.useState('all');
  const [severityFilter, setSeverityFilter] = React.useState('all');
  const [assignTarget,   setAssignTarget]   = React.useState(null);
  // scope:'all' returns EVERY incident in the supervisor's work zone (all
  // statuses, including resolved/rejected); the police endpoint pages by
  // pageSize (max 100) and ignores `limit`.
  const params = React.useMemo(() => ({ scope: 'all', pageSize: 100 }), []);
  const incidentsQuery = useSupervisorIncidents(params);
  useFocusRefresh(incidentsQuery.refetch);

  const incidents = Array.isArray(incidentsQuery.data?.incidents) ? incidentsQuery.data.incidents : [];
  const loading = incidentsQuery.isLoading;
  const error = incidentsQuery.error?.message || '';

  const viewIncident = React.useCallback((inc) => {
    navigation.navigate('PoliceIncidentDetail', { incidentId: inc.id });
  }, [navigation]);

  // Map the numeric severity hint (0-4) to a bucket when no string severity is set.
  const severityOf = (inc) => {
    const s = String(inc.severity || '').toLowerCase();
    if (s) return s === 'critical' ? 'high' : s;
    const hint = Number(inc.severityHint);
    if (hint >= 3) return 'high';
    if (hint === 2) return 'medium';
    if (Number.isFinite(hint)) return 'low';
    return '';
  };

  const ACTIVE_STATUSES = ['pending', 'under_review', 'verified', 'dispatched'];
  const createdMs = (inc) => new Date(inc.createdAt || inc.occurredAt || 0).getTime() || 0;
  const visible = incidents
    .filter(inc => {
      const st = (inc.displayStatus || inc.status || '').toLowerCase();
      const matchStatus = statusFilter === 'all' || (statusFilter === 'active' && ACTIVE_STATUSES.includes(st)) || st === statusFilter;
      const matchSeverity = severityFilter === 'all' || severityOf(inc) === severityFilter;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        (inc.title || '').toLowerCase().includes(q) ||
        (inc.locationLabel || inc.locationText || inc.commune?.name || inc.wilaya?.name || '').toLowerCase().includes(q);
      return matchStatus && matchSeverity && matchSearch;
    })
    // Newest first by creation time. The API orders by severity first, which
    // buries recent low-severity (often pending) reports — re-sort here so they
    // surface chronologically.
    .sort((a, b) => createdMs(b) - createdMs(a));

  return (
    <SupervisorScreenFrame
      title="Incident Coordination"
      subtitle="All incidents in your work zone"
      loading={loading}
      error={error}
      onRefresh={incidentsQuery.refetch}
      navigation={navigation}
      stats={[
        // Total reflects the server's full count when paginated; Active/Shown
        // describe the currently-loaded window.
        { label: 'Total',   value: incidentsQuery.data?.pagination?.total ?? incidents.length, tone: S.accent },
        { label: 'Active',  value: incidents.filter(i => ACTIVE_STATUSES.includes((i.displayStatus || i.status || '').toLowerCase())).length, tone: '#F97316' },
        { label: 'Shown',   value: visible.length, tone: S.muted },
      ]}
    >
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={S.muted} style={{ marginLeft: 12 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search title or location..."
          placeholderTextColor={S.muted}
          style={s.searchInput}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        {[['active', 'Active'], ['all', 'All'], ['pending', 'Pending'], ['under_review', 'Under Review'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['resolved', 'Resolved']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[s.filterBtn, statusFilter === key && s.filterBtnActive]}
            onPress={() => setStatusFilter(key)}
            activeOpacity={0.8}
          >
            <Text style={[s.filterText, statusFilter === key && s.filterTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        {[['all', 'All Severity'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[s.filterBtn, severityFilter === key && s.filterBtnActive]}
            onPress={() => setSeverityFilter(key)}
            activeOpacity={0.8}
          >
            <Text style={[s.filterText, severityFilter === key && s.filterTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <SupervisorSectionCard title={`Incidents (${visible.length})`} icon="warning-outline">
        {visible.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="checkmark-circle-outline" size={28} color={S.muted} />
            <Text style={s.emptyText}>No incidents found</Text>
          </View>
        ) : (
          visible.map(inc => (
            <IncidentRow key={inc.id} incident={inc} onAssign={setAssignTarget} onView={viewIncident} />
          ))
        )}
      </SupervisorSectionCard>

      {assignTarget && (
        <AssignModal
          incident={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={incidentsQuery.refetch}
        />
      )}
    </SupervisorScreenFrame>
  );
}

const s = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: S.card, borderRadius: 14,
    borderWidth: 1, borderColor: S.border,
  },
  searchInput: { flex: 1, color: S.light, fontSize: 13, paddingVertical: 11, paddingRight: 12 },

  filterRow: { flexDirection: 'row', gap: 7, paddingRight: 4 },
  filterBtn: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: S.card, borderWidth: 1, borderColor: S.border,
    alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: 'rgba(245,158,11,0.18)', borderColor: 'rgba(245,158,11,0.5)' },
  filterText:      { color: S.muted, fontSize: 11, fontWeight: '700' },
  filterTextActive:{ color: S.accent, fontSize: 11, fontWeight: '800' },

  incRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: S.borderLight,
  },
  incTitle: { color: S.light, fontSize: 13, fontWeight: '700' },
  incMeta:  { color: S.muted, fontSize: 11, marginTop: 2 },
  incTags:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' },
  incTime:  { color: S.muted, fontSize: 10 },
  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  assignedText: { color: S.muted, fontSize: 11, fontWeight: '600', flexShrink: 1 },
  incActions: { gap: 7, alignItems: 'stretch' },
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: S.card,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: S.border,
  },
  viewBtnText: { color: S.muted, fontSize: 11, fontWeight: '800' },
  assignBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  assignBtnText: { color: S.accent, fontSize: 11, fontWeight: '800' },

  empty:     { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { color: S.muted, fontSize: 13 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1C1200', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
    borderTopWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4,
    backgroundColor: 'rgba(245,158,11,0.3)', borderRadius: 2, marginBottom: 16,
  },
  sheetTitle: { color: S.light, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  sheetSub:   { color: S.muted, fontSize: 12, marginBottom: 16 },
  sheetMuted: { color: S.muted, fontSize: 13, textAlign: 'center', paddingVertical: 20 },

  officerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.1)',
  },
  officerAvatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  officerInitials: { color: S.accent, fontSize: 13, fontWeight: '900' },
  officerName:     { color: S.light, fontSize: 13, fontWeight: '700' },
  officerMeta:     { color: S.muted, fontSize: 11, marginTop: 2 },
  dutyBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  dutyText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  closeBtn:     { marginTop: 16, backgroundColor: '#2A1800', borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: S.border },
  closeBtnText: { color: S.muted, fontWeight: '800', fontSize: 14 },
});
