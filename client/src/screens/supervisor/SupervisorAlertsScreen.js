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
import { Ionicons } from '@expo/vector-icons';

import SupervisorScreenFrame, {
  S,
  SupervisorSectionCard,
  SupervisorSeverityTag,
  SupervisorStatusPill,
} from '../../components/supervisor/SupervisorScreenFrame';
import { usePoliceAlerts, usePoliceWorkZoneOptions } from '../../features/police/hooks/usePoliceQueries';
import { useCreateSupervisorAlertMutation } from '../../features/supervisor/hooks/useSupervisorQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

const SEVERITIES = ['low', 'medium', 'high'];
const ALERT_TYPES = ['advisory', 'emergency', 'incident', 'weather', 'roadwork', 'closure'];
const TARGET_TYPES = [
  { value: 'zone', label: 'Zone officers' },
  { value: 'role', label: 'All police in zone' },
];
const DURATION_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '4h', hours: 4 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
];

const INITIAL_FORM = {
  title: '',
  description: '',
  severity: 'medium',
  alertType: 'advisory',
  targetType: 'zone',
  adminAreaId: '',
  endsAt: '',
};

function addHours(hours) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function formatDateTime(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid time';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(value) {
  if (!value) return '';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function humanize(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function ZonePicker({ visible, zones, selectedId, onSelect, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.handle} />
          <View style={m.sheetHead}>
            <View>
              <Text style={m.title}>Select Wilaya</Text>
              <Text style={m.sub}>Choose the operational alert zone</Text>
            </View>
            <TouchableOpacity style={m.iconBtn} onPress={onClose} activeOpacity={0.75}>
              <Ionicons name="close" size={18} color={S.light} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={zones}
            keyExtractor={(item) => String(item.id)}
            style={{ maxHeight: 420 }}
            ListEmptyComponent={<Text style={m.muted}>No wilayas available.</Text>}
            renderItem={({ item }) => {
              const active = String(selectedId) === String(item.id);
              return (
                <TouchableOpacity
                  style={[m.zoneRow, active && m.zoneRowActive]}
                  onPress={() => {
                    onSelect(String(item.id));
                    onClose();
                  }}
                  activeOpacity={0.78}
                >
                  <View style={[m.zoneIcon, active && m.zoneIconActive]}>
                    <Ionicons name={active ? 'checkmark' : 'location-outline'} size={14} color={active ? '#1C1200' : S.accent} />
                  </View>
                  <Text style={m.zoneName}>{item.name}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function Chip({ label, active, onPress, tone }) {
  return (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive, active && tone ? { borderColor: tone, backgroundColor: `${tone}22` } : null]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <Text style={[s.chipText, active && s.chipTextActive, active && tone ? { color: tone } : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AlertRow({ item }) {
  return (
    <View style={s.alertRow}>
      <View style={[s.alertDot, { backgroundColor: item.severity === 'high' ? '#EF4444' : item.severity === 'low' ? '#22C55E' : '#F59E0B' }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.alertTitle} numberOfLines={1}>{item.title || 'Alert'}</Text>
        {item.description ? <Text style={s.alertDesc} numberOfLines={2}>{item.description}</Text> : null}
        <View style={s.alertMetaRow}>
          <SupervisorSeverityTag severity={item.severity || 'medium'} />
          <SupervisorStatusPill status={item.status || (item.expired ? 'expired' : 'active')} />
        </View>
      </View>
      <Text style={s.alertTime}>{relativeTime(item.createdAt)}</Text>
    </View>
  );
}

export default function SupervisorAlertsScreen({ navigation }) {
  const [form, setForm] = React.useState({ ...INITIAL_FORM, endsAt: addHours(4) });
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const zonesQuery = usePoliceWorkZoneOptions();
  const alertsQuery = usePoliceAlerts({ pageSize: 20 });
  const createAlert = useCreateSupervisorAlertMutation();

  const zones = React.useMemo(
    () => (Array.isArray(zonesQuery.data?.wilayas) ? zonesQuery.data.wilayas : []),
    [zonesQuery.data],
  );
  const alerts = React.useMemo(
    () => (Array.isArray(alertsQuery.data?.items) ? alertsQuery.data.items : []),
    [alertsQuery.data],
  );

  const loading = zonesQuery.isLoading || alertsQuery.isLoading;
  const saving = createAlert.isPending;
  const error = zonesQuery.error?.message || alertsQuery.error?.message || '';

  // Depend on the stable refetch fns, NOT the query objects (which get a new
  // identity every render and would make this callback — and the focus effect —
  // loop infinitely).
  const refresh = React.useCallback(() => {
    zonesQuery.refetch();
    alertsQuery.refetch();
  }, [zonesQuery.refetch, alertsQuery.refetch]);

  useFocusRefresh(refresh);

  const selectedZone = React.useMemo(
    () => zones.find((zone) => String(zone.id) === String(form.adminAreaId)),
    [form.adminAreaId, zones],
  );

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validate() {
    if (!form.title.trim()) return 'Alert title is required.';
    if (!form.description.trim()) return 'Alert message is required.';
    if (!form.adminAreaId) return 'Select a wilaya for this alert.';
    if (!form.endsAt) return 'Select an active duration.';

    const endsAt = new Date(form.endsAt);
    if (Number.isNaN(endsAt.getTime())) return 'Alert end time is invalid.';
    if (endsAt <= new Date()) return 'Alert end time must be in the future.';
    return '';
  }

  async function submit() {
    const validationError = validate();
    if (validationError) {
      Alert.alert('Required', validationError);
      return;
    }

    try {
      await createAlert.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim(),
        severity: form.severity,
        alertType: form.alertType,
        targetType: form.targetType,
        targetRole: form.targetType === 'role' ? 'police' : undefined,
        adminAreaId: Number(form.adminAreaId),
        endsAt: form.endsAt,
      });

      // The mutation invalidates the supervisor workflow (police.alerts +
      // supervisor.dashboard), so the recent-alerts list below and the
      // dashboard refresh from the cache without a manual reload.
      Alert.alert('Alert Sent', 'Operational alert has been broadcast to matching officers.');
      setForm({ ...INITIAL_FORM, endsAt: addHours(4) });
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to send alert.');
    }
  }

  return (
    <SupervisorScreenFrame
      title="Supervisor Alerts"
      subtitle="Broadcast warnings to field officers"
      loading={loading}
      error={error}
      onRefresh={refresh}
      navigation={navigation}
      stats={[
        { label: 'Recent', value: alerts.length, tone: S.accent },
        { label: 'Unread', value: alerts.filter((item) => !item.read).length, tone: '#F97316' },
        { label: 'Active', value: alerts.filter((item) => !item.expired).length, tone: '#22C55E' },
      ]}
    >
      <SupervisorSectionCard title="Create Alert" icon="megaphone-outline">
        <TextInput
          value={form.title}
          onChangeText={(value) => update('title', value)}
          placeholder="Alert title"
          placeholderTextColor={S.muted}
          maxLength={200}
          style={s.input}
          editable={!saving}
        />
        <TextInput
          value={form.description}
          onChangeText={(value) => update('description', value)}
          placeholder="Message for officers"
          placeholderTextColor={S.muted}
          maxLength={2000}
          multiline
          numberOfLines={4}
          style={[s.input, s.textarea]}
          editable={!saving}
        />

        <Text style={s.label}>Severity</Text>
        <View style={s.chipRow}>
          {SEVERITIES.map((severity) => (
            <Chip
              key={severity}
              label={humanize(severity)}
              active={form.severity === severity}
              tone={severity === 'high' ? '#EF4444' : severity === 'low' ? '#22C55E' : '#F59E0B'}
              onPress={() => update('severity', severity)}
            />
          ))}
        </View>

        <Text style={s.label}>Alert Type</Text>
        <View style={s.chipRow}>
          {ALERT_TYPES.map((type) => (
            <Chip
              key={type}
              label={humanize(type)}
              active={form.alertType === type}
              onPress={() => update('alertType', type)}
            />
          ))}
        </View>

        <Text style={s.label}>Target</Text>
        <View style={s.chipRow}>
          {TARGET_TYPES.map((target) => (
            <Chip
              key={target.value}
              label={target.label}
              active={form.targetType === target.value}
              onPress={() => update('targetType', target.value)}
            />
          ))}
        </View>

        <TouchableOpacity style={s.selector} onPress={() => setPickerOpen(true)} activeOpacity={0.78}>
          <View style={s.selectorIcon}>
            <Ionicons name="location-outline" size={16} color={S.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.selectorLabel}>Zone</Text>
            <Text style={s.selectorValue}>{selectedZone?.name || 'Select wilaya'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={S.muted} />
        </TouchableOpacity>

        <Text style={s.label}>Active Until</Text>
        <View style={s.chipRow}>
          {DURATION_OPTIONS.map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              active={Math.abs(new Date(form.endsAt).getTime() - new Date(addHours(option.hours)).getTime()) < 60000}
              onPress={() => update('endsAt', addHours(option.hours))}
            />
          ))}
        </View>
        <View style={s.endsAtBox}>
          <Ionicons name="time-outline" size={14} color={S.muted} />
          <Text style={s.endsAtText}>{formatDateTime(form.endsAt)}</Text>
        </View>

        <TouchableOpacity
          style={[s.submitBtn, saving && { opacity: 0.6 }]}
          onPress={submit}
          disabled={saving}
          activeOpacity={0.86}
        >
          <Ionicons name="radio-outline" size={17} color="#1C1200" />
          <Text style={s.submitText}>{saving ? 'Broadcasting...' : 'Broadcast Alert'}</Text>
        </TouchableOpacity>
      </SupervisorSectionCard>

      <SupervisorSectionCard title="Recent Alerts" icon="notifications-outline">
        {alerts.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="notifications-off-outline" size={28} color={S.muted} />
            <Text style={s.emptyText}>No recent alerts</Text>
          </View>
        ) : (
          alerts.map((item) => <AlertRow key={item.id} item={item} />)
        )}
      </SupervisorSectionCard>

      <SupervisorSectionCard title="Guidelines" icon="bulb-outline">
        <View style={s.guidelineRow}>
          <Ionicons name="alert-circle-outline" size={17} color="#EF4444" />
          <Text style={s.guidelineText}>High alerts are for immediate threats, major incidents, and active danger zones.</Text>
        </View>
        <View style={s.guidelineRow}>
          <Ionicons name="warning-outline" size={17} color="#F59E0B" />
          <Text style={s.guidelineText}>Medium alerts are useful for significant risk, congestion, roadwork, or route guidance.</Text>
        </View>
        <View style={s.guidelineRow}>
          <Ionicons name="information-circle-outline" size={17} color="#3B82F6" />
          <Text style={s.guidelineText}>Advisory alerts should be clear, short, and actionable for officers in the field.</Text>
        </View>
      </SupervisorSectionCard>

      <ZonePicker
        visible={pickerOpen}
        zones={zones}
        selectedId={form.adminAreaId}
        onSelect={(value) => update('adminAreaId', value)}
        onClose={() => setPickerOpen(false)}
      />
    </SupervisorScreenFrame>
  );
}

const s = StyleSheet.create({
  input: {
    backgroundColor: '#1A0E00',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: S.borderLight,
    color: S.light,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  textarea: { minHeight: 92, textAlignVertical: 'top' },
  label: {
    color: S.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1A0E00',
    borderWidth: 1,
    borderColor: S.borderLight,
  },
  chipActive: {
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderColor: 'rgba(245,158,11,0.5)',
  },
  chipText: { color: S.muted, fontSize: 11, fontWeight: '800' },
  chipTextActive: { color: S.accent },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A0E00',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: S.borderLight,
    padding: 12,
    marginBottom: 10,
  },
  selectorIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(245,158,11,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorLabel: { color: S.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  selectorValue: { color: S.light, fontSize: 13, fontWeight: '800', marginTop: 1 },
  endsAtBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 12,
  },
  endsAtText: { color: S.muted, fontSize: 12, fontWeight: '700' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: S.accent,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 2,
  },
  submitText: { color: '#1C1200', fontSize: 14, fontWeight: '900' },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: S.borderLight,
  },
  alertDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  alertTitle: { color: S.light, fontSize: 13, fontWeight: '800' },
  alertDesc: { color: S.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  alertMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  alertTime: { color: S.muted, fontSize: 10, minWidth: 44, textAlign: 'right', marginTop: 2 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { color: S.muted, fontSize: 13 },
  guidelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: S.borderLight,
  },
  guidelineText: { flex: 1, color: S.muted, fontSize: 12, lineHeight: 17 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1C1200',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: 'rgba(245,158,11,0.3)',
    borderRadius: 2,
    marginBottom: 16,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: S.light, fontSize: 16, fontWeight: '900' },
  sub: { color: S.muted, fontSize: 12, marginTop: 3 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: { color: S.muted, fontSize: 13, textAlign: 'center', paddingVertical: 18 },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,158,11,0.10)',
  },
  zoneRowActive: { backgroundColor: 'rgba(245,158,11,0.06)' },
  zoneIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneIconActive: { backgroundColor: S.accent },
  zoneName: { color: S.light, fontSize: 13, fontWeight: '800' },
});
