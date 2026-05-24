import React from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import SupervisorScreenFrame, {
  S,
  SupervisorSectionCard,
  SupervisorListItem,
  SupervisorSeverityTag,
} from '../../components/supervisor/SupervisorScreenFrame';
import { getSupervisorDashboard, getSupervisorOfficers, createSupervisorAlert } from '../../services/supervisorService';
import { useAuthStore } from '../../stores/authStore';

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

/* ── Alert creation modal ───────────────────────────────────────── */
function CreateAlertModal({ onClose, onCreated }) {
  const [officers, setOfficers] = React.useState([]);
  const [selected, setSelected] = React.useState(new Set());
  const [message,  setMessage]  = React.useState('');
  const [loading,  setLoading]  = React.useState(true);
  const [saving,   setSaving]   = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await getSupervisorOfficers();
        setOfficers(Array.isArray(res?.officers) ? res.officers : []);
      } catch {
        setOfficers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleOfficer(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function send() {
    if (!message.trim()) {
      Alert.alert('Required', 'Please enter an alert message.');
      return;
    }
    setSaving(true);
    try {
      await createSupervisorAlert({
        message: message.trim(),
        officerIds: selected.size > 0 ? [...selected] : undefined,
      });
      Alert.alert('Alert Sent', 'Operational alert has been dispatched.');
      onCreated?.();
      onClose();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to send alert.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.handle} />
          <Text style={m.title}>Create Operational Alert</Text>
          <Text style={m.sub}>Broadcast a message to officers in your zone</Text>

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Alert message…"
            placeholderTextColor={S.muted}
            multiline
            numberOfLines={3}
            style={m.input}
            editable={!saving}
          />

          <Text style={m.sectionLabel}>
            Target officers {selected.size > 0 ? `(${selected.size} selected)` : '(all officers if none selected)'}
          </Text>

          {loading ? (
            <Text style={m.muted}>Loading officers…</Text>
          ) : (
            <FlatList
              data={officers}
              keyExtractor={o => o.id}
              style={{ maxHeight: 200 }}
              renderItem={({ item: o }) => {
                const on = selected.has(o.id);
                return (
                  <TouchableOpacity
                    style={[m.officerRow, on && m.officerRowActive]}
                    onPress={() => toggleOfficer(o.id)}
                    activeOpacity={0.78}
                  >
                    <View style={[m.check, on && m.checkActive]}>
                      {on && <Ionicons name="checkmark" size={12} color="#1C1200" />}
                    </View>
                    <View style={m.officerAvatar}>
                      <Text style={m.officerInitials}>
                        {(o.name || 'O').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={m.officerName}>{o.name}</Text>
                      <Text style={m.officerMeta}>
                        {[o.badgeNumber ? `#${o.badgeNumber}` : null, o.communeName].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={[m.dutyBadge, { backgroundColor: o.isOnDuty ? 'rgba(34,197,94,0.14)' : 'rgba(100,116,139,0.14)' }]}>
                      <Text style={[m.dutyText, { color: o.isOnDuty ? '#22C55E' : '#94A3B8' }]}>
                        {o.isOnDuty ? 'ON' : 'OFF'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <TouchableOpacity
            style={[m.sendBtn, saving && { opacity: 0.6 }]}
            onPress={send}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Ionicons name="megaphone-outline" size={16} color="#1C1200" />
            <Text style={m.sendText}>{saving ? 'Sending…' : 'Send Alert'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={m.cancelBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={m.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ── Quick action shortcuts ─────────────────────────────────────── */
const QUICK_ACTIONS = [
  { label: 'Officers',  icon: 'people',            route: 'SupervisorOfficers'  },
  { label: 'Incidents', icon: 'warning',            route: 'SupervisorIncidents' },
  { label: 'Analytics', icon: 'bar-chart-outline',  route: 'SupervisorAnalytics' },
  { label: 'Map',       icon: 'map-outline',        route: 'SupervisorMap'       },
];

/* ── Main screen ────────────────────────────────────────────────── */
export default function SupervisorDashboardScreen({ navigation }) {
  const [data,        setData]        = React.useState(null);
  const [loading,     setLoading]     = React.useState(true);
  const [error,       setError]       = React.useState('');
  const [alertModal,  setAlertModal]  = React.useState(false);

  const switchToPoliceMode = useAuthStore(st => st.switchToPoliceMode);
  const isPolice           = useAuthStore(st => st.isPolice);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getSupervisorDashboard());
    } catch (e) {
      setError(e.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(React.useCallback(() => { void load(); }, [load]));

  const stats        = data?.stats        || {};
  const officerStatus = data?.officerStatus || {};

  return (
    <SupervisorScreenFrame
      title="Command Center"
      subtitle="Supervisor overview"
      loading={loading}
      error={error}
      onRefresh={load}
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
      <TouchableOpacity style={s.alertBtn} onPress={() => setAlertModal(true)} activeOpacity={0.85}>
        <View style={s.alertIcon}>
          <Ionicons name="megaphone-outline" size={20} color="#1C1200" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.alertBtnTitle}>Create Operational Alert</Text>
          <Text style={s.alertBtnSub}>Broadcast a message to officers in your zone</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="rgba(28,18,0,0.5)" />
      </TouchableOpacity>

      {/* High-severity incidents */}
      {(data?.highSeverityIncidents || []).length > 0 && (
        <SupervisorSectionCard title="High Severity Incidents" icon="warning-outline">
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
              onPress={() => navigation.navigate('SupervisorIncidents')}
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

      {alertModal && (
        <CreateAlertModal
          onClose={() => setAlertModal(false)}
          onCreated={load}
        />
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

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1C1200', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
    borderTopWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4,
    backgroundColor: 'rgba(245,158,11,0.3)', borderRadius: 2, marginBottom: 16,
  },
  title:    { color: S.light, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  sub:      { color: S.muted, fontSize: 12, marginBottom: 14 },
  muted:    { color: S.muted, fontSize: 13, textAlign: 'center', paddingVertical: 16 },

  input: {
    backgroundColor: '#241800', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    color: S.light, fontSize: 13, padding: 12,
    textAlignVertical: 'top', minHeight: 72, marginBottom: 14,
  },

  sectionLabel: { color: S.muted, fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },

  officerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.08)',
    borderRadius: 4,
  },
  officerRowActive: { backgroundColor: 'rgba(245,158,11,0.06)' },
  check: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkActive: { backgroundColor: S.accent, borderColor: S.accent },
  officerAvatar: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  officerInitials: { color: S.accent, fontSize: 11, fontWeight: '900' },
  officerName:     { color: S.light, fontSize: 12, fontWeight: '700' },
  officerMeta:     { color: S.muted, fontSize: 10, marginTop: 1 },
  dutyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  dutyText:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16, backgroundColor: S.accent, borderRadius: 14,
    paddingVertical: 13,
  },
  sendText:   { color: '#1C1200', fontWeight: '900', fontSize: 14 },
  cancelBtn:  { marginTop: 10, alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: S.muted, fontWeight: '700', fontSize: 13 },
});
