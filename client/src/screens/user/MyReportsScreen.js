import React, { useCallback, useContext, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { AuthContext } from '../../contexts/AuthContext';
import { listReports } from '../../services/reportsService';

const FILTERS = [
  { id: 'all',          label: 'All',          icon: 'apps-outline' },
  { id: 'pending',      label: 'Pending',      icon: 'hourglass-outline' },
  { id: 'under_review', label: 'In Review',    icon: 'eye-outline' },
  { id: 'verified',     label: 'Verified',     icon: 'checkmark-circle-outline' },
  { id: 'resolved',     label: 'Resolved',     icon: 'shield-checkmark-outline' },
  { id: 'rejected',     label: 'Rejected',     icon: 'close-circle-outline' },
];

const SEVERITY_COLOR = {
  critical: Colors.severityCritical,
  high:     Colors.severityHigh,
  medium:   Colors.severityMedium,
  low:      Colors.severityLow,
};

function severityColor(severity) {
  return SEVERITY_COLOR[String(severity || '').toLowerCase()] || Colors.greyLight;
}

const STATUS_TINT = {
  pending:      { bg: 'rgba(244,162,97,0.14)',   fg: '#c86a10' },
  under_review: { bg: 'rgba(29,78,216,0.10)',    fg: Colors.secondary },
  verified:     { bg: 'rgba(34,197,94,0.13)',    fg: '#16a34a' },
  rejected:     { bg: 'rgba(220,38,38,0.10)',    fg: Colors.error },
  resolved:     { bg: 'rgba(107,114,128,0.12)',  fg: Colors.subtext },
};

const STATS_META = [
  { key: 'total',    label: 'Total',    icon: 'document-text', iconBg: 'rgba(122,61,240,0.11)', iconColor: Colors.primary },
  { key: 'pending',  label: 'Pending',  icon: 'hourglass',     iconBg: 'rgba(200,106,16,0.11)', iconColor: '#c86a10' },
  { key: 'verified', label: 'Verified', icon: 'checkmark-circle', iconBg: 'rgba(22,163,74,0.11)', iconColor: '#16a34a' },
];

export default function MyReportsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useContext(AuthContext);
  const [reports, setReports]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState('');
  const [filter, setFilter]       = useState('all');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await listReports({ limit: 100, sort: 'recent' });
      const all  = Array.isArray(result?.reports) ? result.reports : [];
      const myId = user?.id;
      const mine = myId
        ? all.filter((r) => String(r.reportedBy?.id || '') === String(myId))
        : all;
      setReports(mine);
    } catch (e) {
      setError(e?.message || 'Failed to load your reports.');
      setReports([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
  }, [load]);

  const effectiveStatus = (r) => (r.displayStatus || r.status || 'pending').toLowerCase();

  const filtered = filter === 'all'
    ? reports
    : reports.filter((r) => effectiveStatus(r) === filter);

  const stats = {
    total:    reports.length,
    pending:  reports.filter((r) => ['pending', 'under_review'].includes(effectiveStatus(r))).length,
    verified: reports.filter((r) => effectiveStatus(r) === 'verified').length,
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.gradientFrom} translucent={false} />

      {/* ── Header ── */}
      <LinearGradient
        colors={[Colors.gradientFrom, Colors.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[s.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={s.headerDecor1} />
        <View style={s.headerDecor2} />
        <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={Colors.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Reports</Text>
        <TouchableOpacity
          style={[s.headerBtn, s.headerBtnAdd]}
          onPress={() => navigation.navigate('ReportIncident')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={20} color={Colors.white} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >

        {/* ── Stats row ── */}
        <View style={s.statsRow}>
          {STATS_META.map((m) => (
            <View key={m.key} style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: m.iconBg }]}>
                <Ionicons name={m.icon} size={18} color={m.iconColor} />
              </View>
              <Text style={[s.statValue, { color: m.iconColor }]}>{stats[m.key]}</Text>
              <Text style={s.statLabel}>{m.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Filter chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filtersRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <TouchableOpacity
                key={f.id}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setFilter(f.id)}
                activeOpacity={0.8}
              >
                <Ionicons name={f.icon} size={13} color={active ? Colors.white : Colors.subtext} />
                <Text style={[s.chipText, active && s.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Content ── */}
        {loading ? (
          <View style={s.empty}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={s.emptyText}>Loading your reports…</Text>
          </View>

        ) : error ? (
          <View style={s.empty}>
            <View style={s.emptyIconBg}>
              <Ionicons name="alert-circle-outline" size={28} color={Colors.error} />
            </View>
            <Text style={s.emptyTitle}>Failed to load</Text>
            <Text style={s.emptyText}>{error}</Text>
            <TouchableOpacity style={s.actionBtn} onPress={load} activeOpacity={0.8}>
              <Text style={s.actionBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>

        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIconBg}>
              <Ionicons name="document-outline" size={28} color={Colors.greyLight} />
            </View>
            <Text style={s.emptyTitle}>
              {filter === 'all' ? 'No reports yet' : `No ${filter} reports`}
            </Text>
            <Text style={s.emptyText}>
              {filter === 'all'
                ? "You haven't submitted any reports yet."
                : 'No reports match this filter.'}
            </Text>
            {filter === 'all' ? (
              <TouchableOpacity
                style={s.actionBtn}
                onPress={() => navigation.navigate('ReportIncident')}
                activeOpacity={0.8}
              >
                <Text style={s.actionBtnText}>Submit first report</Text>
              </TouchableOpacity>
            ) : null}
          </View>

        ) : (
          filtered.map((r) => {
            const sev    = severityColor(r.severity);
            const status = effectiveStatus(r);
            const tint   = STATUS_TINT[status] || STATUS_TINT.pending;
            return (
              <TouchableOpacity
                key={r.id}
                style={s.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('IncidentDetail', { reportId: r.id })}
              >
                {/* Left severity accent */}
                <View style={[s.cardAccent, { backgroundColor: sev }]} />

                <View style={s.cardBody}>
                  {/* Title + status */}
                  <View style={s.cardTitleRow}>
                    <Text style={s.cardTitle} numberOfLines={1}>{r.title}</Text>
                    <View style={[s.statusPill, { backgroundColor: tint.bg }]}>
                      <Text style={[s.statusText, { color: tint.fg }]}>
                        {status === 'under_review' ? 'IN REVIEW' : status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {r.description ? (
                    <Text style={s.cardDesc} numberOfLines={2}>{r.description}</Text>
                  ) : null}

                  {/* Meta row */}
                  <View style={s.metaRow}>
                    <View style={[s.sevBadge, { backgroundColor: `${sev}14` }]}>
                      <Ionicons name="alert-circle" size={11} color={sev} />
                      <Text style={[s.sevBadgeText, { color: sev }]}>
                        {String(r.severity || 'low').toUpperCase()}
                      </Text>
                    </View>
                    {r.locationLabel ? (
                      <View style={s.metaItem}>
                        <Ionicons name="location-outline" size={12} color={Colors.subtext} />
                        <Text style={s.metaText} numberOfLines={1}>{r.locationLabel}</Text>
                      </View>
                    ) : null}
                    {r.relativeTime ? (
                      <View style={s.metaItem}>
                        <Ionicons name="time-outline" size={12} color={Colors.subtext} />
                        <Text style={s.metaText}>{r.relativeTime}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Chevron */}
                <View style={s.cardChevron}>
                  <Ionicons name="chevron-forward" size={16} color={Colors.greyLight} />
                </View>
              </TouchableOpacity>
            );
          })
        )}

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, overflow: 'hidden' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  headerDecor1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -30,
  },
  headerDecor2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)', top: 10, right: 90,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  headerBtnAdd: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.white },

  scroll: { flex: 1 },
  scrollContent: { paddingTop: 20 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.subtext,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Filter chips
  filtersRow: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.white,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.subtext },
  chipTextActive: { color: Colors.white },

  // Empty
  empty: {
    alignItems: 'center',
    paddingVertical: 52,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIconBg: {
    width: 66, height: 66, borderRadius: 33,
    backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.heading },
  emptyText: { fontSize: 13, color: Colors.subtext, textAlign: 'center', lineHeight: 20 },
  actionBtn: {
    marginTop: 6,
    paddingHorizontal: 22, paddingVertical: 11,
    borderRadius: 12, backgroundColor: Colors.primary,
  },
  actionBtnText: { color: Colors.white, fontSize: 13, fontWeight: '800' },

  // Report card
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.white,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, paddingVertical: 13, paddingLeft: 12, paddingRight: 6, gap: 7 },
  cardChevron: { justifyContent: 'center', paddingRight: 12, paddingLeft: 4 },

  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.heading },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  cardDesc: { fontSize: 13, color: Colors.subtext, lineHeight: 18 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  sevBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  sevBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: Colors.subtext, fontWeight: '500' },
});
