import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { AuthContext } from '../../contexts/AuthContext';
import { listReports } from '../../services/reportsService';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'verified', label: 'Verified' },
  { id: 'rejected', label: 'Rejected' },
];

const SEVERITY_COLOR = {
  critical: Colors.severityCritical || Colors.error,
  high:     Colors.severityHigh     || Colors.error,
  medium:   Colors.severityMedium   || Colors.warning,
  low:      Colors.severityLow      || Colors.accent,
};

function severityColor(severity) {
  return SEVERITY_COLOR[String(severity || '').toLowerCase()] || Colors.greyLight;
}

const STATUS_TINT = {
  pending:  { bg: 'rgba(244,162,97,0.14)', fg: Colors.warning },
  verified: { bg: 'rgba(34,197,94,0.14)',  fg: Colors.success },
  rejected: { bg: 'rgba(220,38,38,0.10)',  fg: Colors.error },
};

export default function MyReportsScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await listReports({ limit: 100, sort: 'recent' });
      const all = Array.isArray(result?.reports) ? result.reports : [];
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

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
  }, [load]);

  const filtered = filter === 'all'
    ? reports
    : reports.filter((r) => String(r.status || '').toLowerCase() === filter);

  const stats = {
    total:    reports.length,
    pending:  reports.filter((r) => r.status === 'pending').length,
    verified: reports.filter((r) => r.status === 'verified').length,
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Reports</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('ReportIncident')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add-circle" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.warning }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.success }]}>{stats.verified}</Text>
            <Text style={styles.statLabel}>Verified</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={28} color={Colors.error} />
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity onPress={load} activeOpacity={0.7}>
              <Text style={styles.emptyAction}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={32} color={Colors.greyLight} />
            <Text style={styles.emptyText}>
              {filter === 'all' ? "You haven't submitted any reports yet." : 'No reports in this filter.'}
            </Text>
            {filter === 'all' ? (
              <TouchableOpacity onPress={() => navigation.navigate('ReportIncident')} activeOpacity={0.7}>
                <Text style={styles.emptyAction}>Submit your first report</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          filtered.map((r) => {
            const sev = severityColor(r.severity);
            const status = String(r.status || 'pending').toLowerCase();
            const tint = STATUS_TINT[status] || STATUS_TINT.pending;
            return (
              <TouchableOpacity
                key={r.id}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('IncidentDetail', { reportId: r.id })}
              >
                <View style={styles.cardRow}>
                  <View style={[styles.severityDot, { backgroundColor: sev }]} />
                  <Text style={styles.cardTitle} numberOfLines={1}>{r.title}</Text>
                  <View style={[styles.statusPill, { backgroundColor: tint.bg }]}>
                    <Text style={[styles.statusText, { color: tint.fg }]}>
                      {status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {r.description ? (
                  <Text style={styles.cardDesc} numberOfLines={2}>{r.description}</Text>
                ) : null}

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="alert-circle" size={12} color={sev} />
                    <Text style={[styles.metaText, { color: sev }]}>
                      {String(r.severity || 'low').toUpperCase()}
                    </Text>
                  </View>
                  {r.locationLabel ? (
                    <View style={styles.metaItem}>
                      <Ionicons name="location-outline" size={12} color={Colors.subtext} />
                      <Text style={styles.metaText} numberOfLines={1}>{r.locationLabel}</Text>
                    </View>
                  ) : null}
                  {r.relativeTime ? (
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={12} color={Colors.subtext} />
                      <Text style={styles.metaText}>{r.relativeTime}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { color: Colors.heading, fontSize: 18, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  statLabel: { color: Colors.subtext, fontSize: 12, marginTop: 2, fontWeight: '600' },

  filtersRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: Colors.white },

  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyText: { color: Colors.subtext, fontSize: 14, textAlign: 'center' },
  emptyAction: { color: Colors.primary, fontSize: 14, fontWeight: '700', marginTop: 6 },

  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: { flex: 1, color: Colors.heading, fontSize: 15, fontWeight: '700' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  cardDesc: { color: Colors.subtext, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaText: { color: Colors.subtext, fontSize: 12, fontWeight: '600' },
});
