import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import SupervisorScreenFrame, {
  S,
  SupervisorSectionCard,
} from '../../components/supervisor/SupervisorScreenFrame';
import { useSupervisorAnalytics } from '../../features/supervisor/hooks/useSupervisorQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

function formatMs(ms) {
  if (!ms || ms <= 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function pct(value, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

/* ── Bar chart row ─────────────────────────────────────────────── */
function BarRow({ label, value, total, color }) {
  const w = pct(value, total);
  return (
    <View style={b.row}>
      <Text style={b.label} numberOfLines={1}>{label}</Text>
      <View style={b.barTrack}>
        <View style={[b.barFill, { width: `${w}%`, backgroundColor: color }]} />
      </View>
      <Text style={b.value}>{value ?? 0}</Text>
    </View>
  );
}

const STATUS_COLORS = {
  pending:      '#F59E0B',
  under_review: '#3B82F6',
  verified:     '#22C55E',
  dispatched:   '#A855F7',
  resolved:     '#64748B',
  rejected:     '#EF4444',
};

const SEVERITY_COLORS = {
  critical: '#EF4444',
  high:     '#F97316',
  medium:   '#EAB308',
  low:      '#22C55E',
};

const PERIOD_OPTIONS = [7, 14, 30, 90];

export default function SupervisorAnalyticsScreen({ navigation }) {
  const [days, setDays] = React.useState(30);

  // Param-scoped cache: each period is cached separately, so switching back to a
  // previously viewed window is instant instead of refetching every time.
  const analyticsQuery = useSupervisorAnalytics({ days });
  const data = analyticsQuery.data;
  const loading = analyticsQuery.isLoading;
  const error = analyticsQuery.error?.message || '';
  const load = analyticsQuery.refetch;
  useFocusRefresh(analyticsQuery.refetch);

  const metrics   = data?.responseMetrics || {};
  const byStatus  = data?.incidentsByStatus || {};
  const bySev     = data?.incidentsBySeverity || {};
  const zones     = data?.busiestZones || [];
  const officers  = data?.officerWorkload || [];
  const totalInc  = metrics.totalIncidents || 0;

  return (
    <SupervisorScreenFrame
      title="Analytics"
      subtitle={`Last ${days} days`}
      loading={loading}
      error={error}
      onRefresh={load}
      navigation={navigation}
      stats={[
        { label: 'Total',      value: totalInc,                                   tone: S.accent },
        { label: 'Resolved',   value: metrics.resolvedIncidents ?? '—',           tone: '#22C55E' },
        { label: 'Resolution', value: metrics.resolutionRate != null ? `${Math.round(metrics.resolutionRate)}%` : '—', tone: '#3B82F6' },
      ]}
    >
      {/* Period selector */}
      <View style={s.periodRow}>
        {PERIOD_OPTIONS.map(d => (
          <TouchableOpacity
            key={d}
            style={[s.periodBtn, days === d && s.periodBtnActive]}
            onPress={() => setDays(d)}
            activeOpacity={0.8}
          >
            <Text style={[s.periodText, days === d && s.periodTextActive]}>{d}d</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Response metrics */}
      <SupervisorSectionCard title="Response Metrics" icon="timer-outline">
        <View style={s.metricsGrid}>
          {[
            { label: 'Avg Response',   value: formatMs(metrics.avgResponseTimeMs),   icon: 'flash-outline',    color: S.accent },
            { label: 'Avg Resolution', value: formatMs(metrics.avgResolutionTimeMs),  icon: 'checkmark-circle-outline', color: '#22C55E' },
            { label: 'Resolution Rate', value: metrics.resolutionRate != null ? `${Math.round(metrics.resolutionRate)}%` : '—', icon: 'trending-up-outline', color: '#3B82F6' },
            { label: 'Total Incidents', value: totalInc,                              icon: 'warning-outline',  color: '#F97316' },
          ].map(m => (
            <View key={m.label} style={s.metricCard}>
              <Ionicons name={m.icon} size={16} color={m.color} />
              <Text style={[s.metricValue, { color: m.color }]}>{m.value ?? '—'}</Text>
              <Text style={s.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
      </SupervisorSectionCard>

      {/* By status */}
      {Object.keys(byStatus).length > 0 && (
        <SupervisorSectionCard title="By Status" icon="layers-outline">
          {Object.entries(byStatus).map(([st, count]) => (
            <BarRow
              key={st}
              label={st.replace(/_/g, ' ')}
              value={count}
              total={totalInc}
              color={STATUS_COLORS[st] || S.accent}
            />
          ))}
        </SupervisorSectionCard>
      )}

      {/* By severity */}
      {Object.keys(bySev).length > 0 && (
        <SupervisorSectionCard title="By Severity" icon="alert-circle-outline">
          {Object.entries(bySev).map(([sv, count]) => (
            <BarRow
              key={sv}
              label={sv.charAt(0).toUpperCase() + sv.slice(1)}
              value={count}
              total={totalInc}
              color={SEVERITY_COLORS[sv.toLowerCase()] || S.accent}
            />
          ))}
        </SupervisorSectionCard>
      )}

      {/* Busiest zones */}
      {zones.length > 0 && (
        <SupervisorSectionCard title="Busiest Zones" icon="location-outline">
          {zones.slice(0, 6).map((zone, i) => (
            <View key={i} style={s.zoneRow}>
              <View style={s.zoneRank}>
                <Text style={s.zoneRankText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.zoneName}>{zone.name || 'Unknown'}</Text>
                {zone.level ? <Text style={s.zoneLevel}>{zone.level}</Text> : null}
              </View>
              <Text style={s.zoneCount}>{zone.count} incidents</Text>
            </View>
          ))}
        </SupervisorSectionCard>
      )}

      {/* Officer workload */}
      {officers.length > 0 && (
        <SupervisorSectionCard title="Officer Workload" icon="people-outline">
          {officers.slice(0, 8).map((o, i) => {
            const maxTotal = Math.max(...officers.map(x => x.totalIncidents || 0), 1);
            return (
              <View key={i} style={s.officerRow}>
                <Text style={s.officerName} numberOfLines={1}>{o.name || 'Unknown'}</Text>
                <View style={s.officerBarWrap}>
                  <View style={[s.officerBar, { width: `${pct(o.totalIncidents, maxTotal)}%` }]} />
                </View>
                <Text style={s.officerMeta}>{o.activeIncidents}A / {o.totalIncidents}T</Text>
              </View>
            );
          })}
        </SupervisorSectionCard>
      )}
    </SupervisorScreenFrame>
  );
}

const s = StyleSheet.create({
  periodRow: { flexDirection: 'row', gap: 8 },
  periodBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    backgroundColor: S.card, borderWidth: 1, borderColor: S.border,
    alignItems: 'center',
  },
  periodBtnActive: { backgroundColor: 'rgba(245,158,11,0.18)', borderColor: 'rgba(245,158,11,0.5)' },
  periodText:      { color: S.muted, fontSize: 12, fontWeight: '800' },
  periodTextActive:{ color: S.accent },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    width: '47%', alignItems: 'center', gap: 5,
    backgroundColor: '#1A0E00', borderRadius: 12,
    borderWidth: 1, borderColor: S.borderLight,
    paddingVertical: 14,
  },
  metricValue: { fontSize: 18, fontWeight: '900' },
  metricLabel: { color: S.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', textAlign: 'center' },

  zoneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: S.borderLight,
  },
  zoneRank: {
    width: 24, height: 24, borderRadius: 7,
    backgroundColor: 'rgba(245,158,11,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  zoneRankText:  { color: S.accent, fontSize: 11, fontWeight: '900' },
  zoneName:      { color: S.light,  fontSize: 13, fontWeight: '700' },
  zoneLevel:     { color: S.muted,  fontSize: 11 },
  zoneCount:     { color: S.muted,  fontSize: 11 },

  officerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: S.borderLight,
  },
  officerName:   { color: S.light, fontSize: 12, fontWeight: '700', width: 100 },
  officerBarWrap:{ flex: 1, height: 6, backgroundColor: '#2A1800', borderRadius: 4, overflow: 'hidden' },
  officerBar:    { height: '100%', backgroundColor: S.accent2, borderRadius: 4 },
  officerMeta:   { color: S.muted, fontSize: 10, width: 54, textAlign: 'right' },
});

const b = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  label: { color: S.muted, fontSize: 11, width: 80, textTransform: 'capitalize' },
  barTrack: { flex: 1, height: 6, backgroundColor: '#2A1800', borderRadius: 4, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 4 },
  value:    { color: S.light, fontSize: 12, fontWeight: '700', width: 28, textAlign: 'right' },
});
