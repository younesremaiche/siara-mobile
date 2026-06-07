import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

function OfficerCard({ officer }) {
  const onDuty = officer.isOnDuty === true;
  return (
    <View style={s.card}>
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
        {(officer.communeName || officer.wilayaName) && (
          <View style={s.zoneRow}>
            <Ionicons name="location-outline" size={11} color={S.muted} />
            <Text style={s.zone}>
              {[officer.communeName, officer.wilayaName].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}
        {officer.locationCapturedAt && (
          <View style={s.seenRow}>
            <Ionicons name="time-outline" size={11} color={S.muted} />
            <Text style={s.seen}>Last seen {relativeTime(officer.locationCapturedAt)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function SupervisorOfficersScreen({ navigation }) {
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all'); // all | on | off

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
          visible.map(o => <OfficerCard key={o.id} officer={o} />)
        )}
      </SupervisorSectionCard>
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
