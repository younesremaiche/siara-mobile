import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import SupervisorScreenFrame, {
  S,
  SupervisorSectionCard,
  SupervisorListItem,
  SupervisorSeverityTag,
} from '../../components/supervisor/SupervisorScreenFrame';
import { useAuthStore } from '../../stores/authStore';
import { useSupervisorDashboard } from '../../features/supervisor/hooks/useSupervisorQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

/* ── helpers ───────────────────────────────────────────────────── */
function formatMs(ms) {
  if (!ms || ms <= 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

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

function activityLabel(item) {
  switch (item.actionType) {
    case 'verify_incident':  return `${item.officerName || 'Officer'} verified "${item.reportTitle || 'incident'}"`;
    case 'reject_incident':  return `${item.officerName || 'Officer'} rejected "${item.reportTitle || 'incident'}"`;
    case 'assign_self':      return `${item.officerName || 'Officer'} took case "${item.reportTitle || 'incident'}"`;
    case 'request_backup':   return `${item.officerName || 'Officer'} requested backup`;
    case 'field_note':       return `${item.officerName || 'Officer'} added a field note`;
    case 'update_status':    return `${item.officerName || 'Officer'} updated status`;
    default:                 return item.actionType?.replace(/_/g, ' ') || 'Action recorded';
  }
}

function activityIcon(type) {
  switch (type) {
    case 'verify_incident':  return 'checkmark-circle-outline';
    case 'reject_incident':  return 'close-circle-outline';
    case 'assign_self':      return 'person-add-outline';
    case 'request_backup':   return 'people-outline';
    case 'field_note':       return 'create-outline';
    case 'update_status':    return 'shield-checkmark-outline';
    default:                 return 'ellipse-outline';
  }
}

/* ── Quick action shortcuts ─────────────────────────────────────── */
const QUICK_ACTIONS = [
  { label: 'Officers',  icon: 'people',            route: 'SupervisorOfficers'  },
  { label: 'Incidents', icon: 'warning',            route: 'SupervisorIncidents' },
  { label: 'Alerts',    icon: 'megaphone-outline',  route: 'SupervisorAlerts'    },
  { label: 'Analytics', icon: 'bar-chart-outline',  route: 'SupervisorAnalytics' },
  { label: 'Map',       icon: 'map-outline',        route: 'SupervisorMap'       },
];

/* ── Main screen ────────────────────────────────────────────────── */
export default function SupervisorDashboardScreen({ navigation }) {
  const switchToPoliceMode = useAuthStore(st => st.switchToPoliceMode);
  const isPolice           = useAuthStore(st => st.isPolice);
  const dashboardQuery = useSupervisorDashboard();
  useFocusRefresh(dashboardQuery.refetch);

  const data = dashboardQuery.data;
  const loading = dashboardQuery.isLoading;
  const error = dashboardQuery.error?.message || '';

  const stats        = data?.stats        || {};
  const officerStatus = data?.officerStatus || {};

  return (
    <SupervisorScreenFrame
      title="Command Center"
      subtitle="Supervisor overview"
      loading={loading}
      error={error}
      onRefresh={dashboardQuery.refetch}
      stats={[
        { label: 'Active',   value: stats.activeIncidents       ?? '—', tone: S.accent   },
        { label: 'Critical', value: stats.highSeverityIncidents ?? '—', tone: '#EF4444'  },
        { label: 'Pending',  value: stats.pendingVerification   ?? '—', tone: '#F97316'  },
        { label: 'On Duty',  value: officerStatus.onDuty        ?? '—', tone: '#22C55E'  },
      ]}
    >
      {/* KPI row */}
      <View style={s.kpiRow}>
        <View style={s.kpiCard}>
          <Ionicons name="time-outline" size={18} color={S.accent} />
          <Text style={s.kpiValue}>{formatMs(stats.avgResponseTimeMs)}</Text>
          <Text style={s.kpiLabel}>Avg Response</Text>
        </View>
        <View style={s.kpiCard}>
          <Ionicons name="shield-outline" size={18} color="#22C55E" />
          <Text style={[s.kpiValue, { color: '#22C55E' }]}>{officerStatus.onDuty ?? '—'}</Text>
          <Text style={s.kpiLabel}>On Duty</Text>
        </View>
        <View style={s.kpiCard}>
          <Ionicons name="people-outline" size={18} color={S.muted} />
          <Text style={s.kpiValue}>{officerStatus.total ?? '—'}</Text>
          <Text style={s.kpiLabel}>Total Officers</Text>
        </View>
      </View>

      {/* Quick actions */}
      <SupervisorSectionCard title="Quick Actions" icon="flash-outline">
        <View style={s.qaRow}>
          {QUICK_ACTIONS.map((q) => (
            <TouchableOpacity
              key={q.route}
              style={s.qaBtn}
              onPress={() => navigation.navigate(q.route)}
              activeOpacity={0.8}
            >
              <View style={s.qaIcon}>
                <Ionicons name={q.icon} size={20} color={S.accent} />
              </View>
              <Text style={s.qaLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SupervisorSectionCard>

      {/* Create alert button */}
      <TouchableOpacity style={s.alertBtn} onPress={() => navigation.navigate('SupervisorAlerts')} activeOpacity={0.85}>
        <View style={s.alertIcon}>
          <Ionicons name="megaphone-outline" size={20} color="#1C1200" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.alertBtnTitle}>Create Operational Alert</Text>
          <Text style={s.alertBtnSub}>Broadcast a message to officers in your zone</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="rgba(28,18,0,0.5)" />
      </TouchableOpacity>

      {/* Officer status breakdown — mirrors the web "Officer Status" card */}
      <SupervisorSectionCard
        title="Officer Status"
        icon="people-outline"
        action={(
          <TouchableOpacity onPress={() => navigation.navigate('SupervisorOfficers')} activeOpacity={0.8} style={s.headerAction}>
            <Text style={s.headerActionText}>Monitor</Text>
            <Ionicons name="arrow-forward" size={13} color={S.accent} />
          </TouchableOpacity>
        )}
      >
        <View style={s.officerStatusRow}>
          {[
            { label: 'On Duty',  value: officerStatus.onDuty ?? 0,  color: '#22C55E' },
            { label: 'Off Duty', value: officerStatus.offDuty ?? Math.max(0, (officerStatus.total ?? 0) - (officerStatus.onDuty ?? 0)), color: S.muted },
            { label: 'Total',    value: officerStatus.total ?? 0,   color: '#3B82F6' },
          ].map((o) => (
            <View key={o.label} style={s.officerStatusCell}>
              <Text style={[s.officerStatusValue, { color: o.color }]}>{o.value}</Text>
              <Text style={s.officerStatusLabel}>{o.label}</Text>
            </View>
          ))}
        </View>
      </SupervisorSectionCard>

      {/* High-severity incidents */}
      {(data?.highSeverityIncidents || []).length > 0 && (
        <SupervisorSectionCard
          title="High Severity Incidents"
          icon="warning-outline"
          action={(
            <TouchableOpacity onPress={() => navigation.navigate('SupervisorIncidents')} activeOpacity={0.8} style={s.headerAction}>
              <Text style={s.headerActionText}>Coordinate</Text>
              <Ionicons name="arrow-forward" size={13} color={S.accent} />
            </TouchableOpacity>
          )}
        >
          {data.highSeverityIncidents.map((inc) => (
            <SupervisorListItem
              key={inc.id}
              title={inc.title || inc.id}
              subtitle={inc.locationLabel}
              meta={[
                inc.assignedOfficerName ? `Officer: ${inc.assignedOfficerName}` : 'Unassigned',
                relativeTime(inc.createdAt),
              ]}
              right={<SupervisorSeverityTag severity={inc.severity || (inc.severityHint >= 4 ? 'critical' : 'high')} />}
              onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: inc.id })}
            />
          ))}
        </SupervisorSectionCard>
      )}

      {/* Live activity feed */}
      {(data?.recentActivity || []).length > 0 && (
        <SupervisorSectionCard title="Live Activity" icon="pulse-outline">
          {data.recentActivity.slice(0, 8).map((item, i) => (
            <View key={i} style={s.actItem}>
              <View style={s.actIconWrap}>
                <Ionicons name={activityIcon(item.actionType)} size={14} color={S.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actText}>{activityLabel(item)}</Text>
                {item.note ? <Text style={s.actNote} numberOfLines={1}>{item.note}</Text> : null}
              </View>
              <Text style={s.actTime}>{relativeTime(item.createdAt)}</Text>
            </View>
          ))}
        </SupervisorSectionCard>
      )}

      {/* Mode switchers */}
      {isPolice && (
        <TouchableOpacity style={s.switchCard} onPress={switchToPoliceMode} activeOpacity={0.85}>
          <LinearGradient
            colors={['#0D1B2A', '#1A3251', '#1E4976']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.switchGrad}
          >
            <View style={[s.switchIconWrap, { backgroundColor: 'rgba(59,130,246,0.2)' }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#60A5FA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.switchTitle}>Switch to Police Mode</Text>
              <Text style={s.switchSub}>Return to officer dashboard</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={24} color="rgba(96,165,250,0.7)" />
          </LinearGradient>
        </TouchableOpacity>
      )}

    </SupervisorScreenFrame>
  );
}

const s = StyleSheet.create({
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: S.card, borderRadius: 14,
    borderWidth: 1, borderColor: S.border,
    paddingVertical: 14,
  },
  kpiValue: { color: S.light, fontSize: 18, fontWeight: '900' },
  kpiLabel: { color: S.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },

  headerAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerActionText: { color: S.accent, fontSize: 12, fontWeight: '800' },
  officerStatusRow: { flexDirection: 'row' },
  officerStatusCell: { flex: 1, alignItems: 'center', gap: 3 },
  officerStatusValue: { fontSize: 22, fontWeight: '900' },
  officerStatusLabel: { color: S.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  qaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  qaBtn: { width: '22%', alignItems: 'center', gap: 7, paddingVertical: 10 },
  qaIcon: {
    width: 46, height: 46, borderRadius: 13,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  qaLabel: { color: S.light, fontSize: 10, fontWeight: '700', textAlign: 'center' },

  alertBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: S.accent, borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  alertIcon: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(28,18,0,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  alertBtnTitle: { color: '#1C1200', fontSize: 14, fontWeight: '900' },
  alertBtnSub:   { color: 'rgba(28,18,0,0.6)', fontSize: 11, marginTop: 1 },

  actItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: S.borderLight,
  },
  actIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.10)',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  actText: { color: S.light, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  actNote: { color: S.muted, fontSize: 11, marginTop: 2 },
  actTime: { color: S.muted, fontSize: 10, marginTop: 2, minWidth: 44, textAlign: 'right' },

  switchCard: { borderRadius: 18, overflow: 'hidden' },
  switchGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, paddingHorizontal: 18,
  },
  switchIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  switchTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  switchSub:   { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },
});
