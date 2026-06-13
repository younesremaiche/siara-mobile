import React from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import SupervisorScreenFrame, {
  S,
  SupervisorSectionCard,
} from '../../components/supervisor/SupervisorScreenFrame';
import { useSupervisorOfficers } from '../../features/supervisor/hooks/useSupervisorQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

function relativeTime(val) {
  if (!val) return 'Unknown';
  const diff = Date.now() - new Date(val).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function officerZone(officer) {
  return [
    officer.communeName || officer.workZone?.commune?.name,
    officer.wilayaName || officer.workZone?.wilaya?.name,
  ].filter(Boolean).join(', ');
}

function OfficerCard({ officer, onPress }) {
  const onDuty = officer.isOnDuty === true;
  const zone = officerZone(officer);
  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(officer)} activeOpacity={0.8}>
      {/* Avatar + status */}
      <View style={s.avatarWrap}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {(officer.name || 'O').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </Text>
        </View>
        <View style={[s.dutyDot, { backgroundColor: onDuty ? '#22C55E' : '#64748B' }]} />
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={s.nameRow}>
          <Text style={s.name} numberOfLines={1}>{officer.name || 'Unknown Officer'}</Text>
          <View style={[s.dutyBadge, { backgroundColor: onDuty ? 'rgba(34,197,94,0.14)' : 'rgba(100,116,139,0.14)' }]}>
            <Text style={[s.dutyText, { color: onDuty ? '#22C55E' : '#94A3B8' }]}>
              {onDuty ? 'ON DUTY' : 'OFF DUTY'}
            </Text>
          </View>
        </View>
        {officer.rank || officer.badgeNumber ? (
          <Text style={s.badge}>
            {[officer.rank, officer.badgeNumber ? `#${officer.badgeNumber}` : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {zone ? (
          <View style={s.zoneRow}>
            <Ionicons name="location-outline" size={11} color={S.muted} />
            <Text style={s.zone}>{zone}</Text>
          </View>
        ) : null}
        {officer.locationCapturedAt && (
          <View style={s.seenRow}>
            <Ionicons name="time-outline" size={11} color={S.muted} />
            <Text style={s.seen}>Last seen {relativeTime(officer.locationCapturedAt)}</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={S.muted} style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );
}

/* ── Officer detail sheet ─────────────────────────────────────── */
function OfficerDetailModal({ officer, onClose }) {
  const onDuty = officer.isOnDuty === true;
  const zone = officerZone(officer) || 'Not set';
  const rows = [
    { icon: 'shield-outline',    label: 'Rank',         value: officer.rank || '—' },
    { icon: 'pricetag-outline',  label: 'Badge',        value: officer.badgeNumber ? `#${officer.badgeNumber}` : '—' },
    { icon: 'mail-outline',      label: 'Email',        value: officer.email || '—' },
    { icon: 'call-outline',      label: 'Phone',        value: officer.phone || '—' },
    { icon: 'location-outline',  label: 'Work Zone',    value: zone },
    { icon: 'time-outline',      label: 'Last Location', value: officer.locationCapturedAt ? relativeTime(officer.locationCapturedAt) : 'No recent ping' },
  ];
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={d.overlay}>
        <View style={d.sheet}>
          <View style={d.handle} />
          <View style={d.head}>
            <View style={d.avatar}>
              <Text style={d.avatarText}>
                {(officer.name || 'O').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={d.name}>{officer.name || 'Unknown Officer'}</Text>
              <View style={[s.dutyBadge, { alignSelf: 'flex-start', marginTop: 4, backgroundColor: onDuty ? 'rgba(34,197,94,0.14)' : 'rgba(100,116,139,0.14)' }]}>
                <Text style={[s.dutyText, { color: onDuty ? '#22C55E' : '#94A3B8' }]}>
                  {onDuty ? 'ON DUTY' : 'OFF DUTY'}
                </Text>
              </View>
            </View>
          </View>

          {rows.map(r => (
            <View key={r.label} style={d.row}>
              <Ionicons name={r.icon} size={15} color={S.accent} style={{ width: 22 }} />
              <Text style={d.rowLabel}>{r.label}</Text>
              <Text style={d.rowValue} numberOfLines={1}>{r.value}</Text>
            </View>
          ))}

          <TouchableOpacity style={d.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={d.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function SupervisorOfficersScreen({ navigation }) {
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all'); // all | on | off
  const [selected, setSelected] = React.useState(null);

  // Shared cache: officer duty status stays consistent with the map/assign views
  // and refreshes when an assignment invalidates supervisor.*.
  const officersQuery = useSupervisorOfficers();
  const officers = React.useMemo(() => {
    const res = officersQuery.data;
    return Array.isArray(res?.officers) ? res.officers : Array.isArray(res) ? res : [];
  }, [officersQuery.data]);
  const loading = officersQuery.isLoading;
  const error = officersQuery.error?.message || '';
  const load = officersQuery.refetch;
  useFocusRefresh(officersQuery.refetch);

  const onDutyCount  = officers.filter(o => o.isOnDuty).length;
  const offDutyCount = officers.length - onDutyCount;

  const visible = officers.filter(o => {
    const matchFilter = filter === 'all' || (filter === 'on' && o.isOnDuty) || (filter === 'off' && !o.isOnDuty);
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (o.name || '').toLowerCase().includes(q) ||
      (o.badgeNumber || '').toLowerCase().includes(q) ||
      (o.rank || '').toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  return (
    <SupervisorScreenFrame
      title="Officer Monitoring"
      subtitle={`${officers.length} officers in your zone`}
      loading={loading}
      error={error}
      onRefresh={load}
      navigation={navigation}
      stats={[
        { label: 'Total',    value: officers.length, tone: S.accent },
        { label: 'On Duty',  value: onDutyCount,     tone: '#22C55E' },
        { label: 'Off Duty', value: offDutyCount,    tone: '#94A3B8' },
      ]}
    >
      {/* Search + filters */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={S.muted} style={{ marginLeft: 12 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, badge, rank..."
          placeholderTextColor={S.muted}
          style={s.searchInput}
        />
      </View>
      <View style={s.filterRow}>
        {[['all', 'All'], ['on', 'On Duty'], ['off', 'Off Duty']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[s.filterBtn, filter === key && s.filterBtnActive]}
            onPress={() => setFilter(key)}
            activeOpacity={0.8}
          >
            <Text style={[s.filterText, filter === key && s.filterTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <SupervisorSectionCard title={`Officers (${visible.length})`} icon="people-outline">
        {visible.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="person-outline" size={28} color={S.muted} />
            <Text style={s.emptyText}>No officers found</Text>
          </View>
        ) : (
          visible.map(o => <OfficerCard key={o.id} officer={o} onPress={setSelected} />)
        )}
      </SupervisorSectionCard>

      {selected && <OfficerDetailModal officer={selected} onClose={() => setSelected(null)} />}
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

  filterRow: { flexDirection: 'row', gap: 8 },
  filterBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    backgroundColor: S.card, borderWidth: 1, borderColor: S.border,
    alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: 'rgba(245,158,11,0.18)', borderColor: 'rgba(245,158,11,0.5)' },
  filterText:      { color: S.muted, fontSize: 12, fontWeight: '700' },
  filterTextActive:{ color: S.accent, fontSize: 12, fontWeight: '800' },

  card: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: S.borderLight,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: S.accent, fontSize: 14, fontWeight: '900' },
  dutyDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: S.gold2,
  },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  name:    { flex: 1, color: S.light, fontSize: 13, fontWeight: '800' },
  dutyBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  dutyText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  badge:   { color: S.muted, fontSize: 11, marginBottom: 3 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zone:    { color: S.muted, fontSize: 11 },
  seenRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  seen:    { color: S.muted, fontSize: 11 },

  empty:     { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { color: S.muted, fontSize: 13 },
});

const d = StyleSheet.create({
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatar: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.14)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: S.accent, fontSize: 18, fontWeight: '900' },
  name: { color: S.light, fontSize: 17, fontWeight: '900' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.1)',
  },
  rowLabel: { color: S.muted, fontSize: 12, fontWeight: '700', width: 96 },
  rowValue: { color: S.light, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  closeBtn: { marginTop: 18, backgroundColor: '#2A1800', borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: S.border },
  closeBtnText: { color: S.muted, fontWeight: '800', fontSize: 14 },
});
