import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import {
  createAlert,
  fetchCommunesByWilaya,
  fetchWilayas,
} from '../../services/alertsService';

const ALERT_TYPES = [
  { key: 'zone',    icon: 'location',  label: 'Zone Alert',    description: 'Watch an area for any incidents' },
  { key: 'route',   icon: 'navigate',  label: 'Route Alert',   description: 'Monitor roads and traffic routes' },
  { key: 'weather', icon: 'cloud',     label: 'Weather Alert', description: 'Weather-related road incidents' },
  { key: 'ai',      icon: 'analytics', label: 'AI-Triggered',  description: 'AI-powered risk predictions' },
];

const FREQUENCIES = [
  { key: 'Instant', icon: 'flash',    description: 'Get notified immediately' },
  { key: 'Hourly',  icon: 'time',     description: 'Digest every hour' },
  { key: 'Daily',   icon: 'today',    description: 'Daily summary' },
  { key: 'Weekly',  icon: 'calendar', description: 'Weekly overview' },
];

const SEVERITY_OPTIONS = [
  { key: 'low',      color: Colors.severityLow,      label: 'Low' },
  { key: 'medium',   color: Colors.severityMedium,   label: 'Medium' },
  { key: 'high',     color: Colors.severityHigh,     label: 'High' },
  { key: 'critical', color: Colors.severityCritical, label: 'Critical' },
];

const TIME_RANGE_OPTIONS = [
  { key: 'all',       label: 'All Day' },
  { key: 'morning',   label: '6AM–12PM' },
  { key: 'afternoon', label: '12PM–6PM' },
  { key: 'evening',   label: '6PM–12AM' },
];

const STEPS = ['Type', 'Zone', 'Conditions', 'Frequency', 'Confirm'];

const INCIDENT_TYPE_MAP = {
  zone:    ['accident', 'roadworks', 'traffic', 'danger'],
  route:   ['accident', 'roadworks', 'traffic'],
  weather: ['accident', 'danger'],
  ai:      ['ai_prediction'],
};

const SEVERITY_LEVELS_MAP = {
  low:      ['low', 'medium', 'high', 'critical'],
  medium:   ['medium', 'high', 'critical'],
  high:     ['high', 'critical'],
  critical: ['critical'],
};

const TIME_RANGE_MAP = {
  all:       { timeRangeType: 'all' },
  morning:   { timeRangeType: 'custom', customTimeStart: '06:00', customTimeEnd: '12:00' },
  afternoon: { timeRangeType: 'custom', customTimeStart: '12:00', customTimeEnd: '18:00' },
  evening:   { timeRangeType: 'custom', customTimeStart: '18:00', customTimeEnd: '00:00' },
};

const FREQUENCY_MAP = {
  Instant: { frequencyType: 'immediate' },
  Hourly:  { frequencyType: 'digest', digestInterval: 'hourly' },
  Daily:   { frequencyType: 'digest', digestInterval: 'daily' },
  Weekly:  { frequencyType: 'digest', digestInterval: 'weekly' },
};

export default function CreateAlertScreen({ navigation, route }) {
  const editAlert = route?.params?.editAlert;

  const [step, setStep] = useState(0);
  const [alertType, setAlertType] = useState(editAlert?.type || '');
  const [minSeverity, setMinSeverity] = useState('medium');
  const [timeRange, setTimeRange] = useState('all');
  const [frequency, setFrequency] = useState('Instant');
  const [name, setName] = useState(editAlert?.name || '');
  const [submitting, setSubmitting] = useState(false);

  // Zone state
  const [zoneType, setZoneType] = useState('wilaya');
  const [selectedWilaya, setSelectedWilaya] = useState(null);
  const [selectedCommune, setSelectedCommune] = useState(null);
  const [wilayas, setWilayas] = useState([]);
  const [communes, setCommunes] = useState([]);
  const [loadingWilayas, setLoadingWilayas] = useState(true);
  const [loadingCommunes, setLoadingCommunes] = useState(false);
  const [zoneSearch, setZoneSearch] = useState('');

  useEffect(() => {
    fetchWilayas()
      .then(setWilayas)
      .catch(() => {})
      .finally(() => setLoadingWilayas(false));
  }, []);

  useEffect(() => {
    if (zoneType !== 'commune' || !selectedWilaya) {
      setCommunes([]);
      setSelectedCommune(null);
      return;
    }
    setLoadingCommunes(true);
    fetchCommunesByWilaya(selectedWilaya.id)
      .then(setCommunes)
      .catch(() => {})
      .finally(() => setLoadingCommunes(false));
  }, [zoneType, selectedWilaya]);

  const hasZone = zoneType === 'wilaya' ? Boolean(selectedWilaya) : Boolean(selectedCommune);

  const zoneSummary = hasZone
    ? (zoneType === 'wilaya' ? selectedWilaya?.name : `${selectedCommune?.name}, ${selectedWilaya?.name}`)
    : '—';

  function nextStep() {
    if (step === 0 && !alertType) {
      Alert.alert('Required', 'Please select an alert type.');
      return;
    }
    if (step === 1 && !hasZone) {
      Alert.alert('Required', 'Please select a zone to monitor.');
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
  }

  function prevStep() {
    if (step > 0) setStep(step - 1);
  }

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Required', 'Please enter an alert name.');
      return;
    }
    if (!hasZone) {
      Alert.alert('Required', 'Please go back and select a zone.');
      return;
    }

    const adminAreaId = zoneType === 'wilaya' ? selectedWilaya?.id : selectedCommune?.id;
    const displayName = zoneType === 'wilaya'
      ? selectedWilaya?.name
      : `${selectedCommune?.name}, ${selectedWilaya?.name}`;

    const body = {
      name: trimmedName,
      incidentTypes: INCIDENT_TYPE_MAP[alertType] || ['accident'],
      severityLevels: SEVERITY_LEVELS_MAP[minSeverity] || ['high', 'critical'],
      ...TIME_RANGE_MAP[timeRange],
      ...FREQUENCY_MAP[frequency],
      weatherRelated: alertType === 'weather',
      aiConfidenceMin: alertType === 'ai' ? 70 : null,
      muteDuplicates: true,
      deliveryApp: true,
      deliveryEmail: false,
      deliverySms: false,
      zone: {
        zoneType,
        adminAreaId,
        ...(zoneType === 'commune' && selectedWilaya ? { wilayaId: selectedWilaya.id } : {}),
        displayName,
      },
    };

    setSubmitting(true);
    try {
      await createAlert(body);
      Alert.alert('Alert Created', `"${trimmedName}" is now active.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create alert. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [name, hasZone, zoneType, selectedWilaya, selectedCommune, alertType, minSeverity, timeRange, frequency, navigation]);

  const filteredList = useCallback((items) => {
    if (!zoneSearch.trim()) return items;
    const q = zoneSearch.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [zoneSearch]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editAlert ? 'Edit Alert' : 'Create Alert'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Step progress */}
      <View style={styles.stepperContainer}>
        <View style={styles.stepperTrack}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <View style={[styles.stepLine, i <= step && styles.stepLineActive]} />}
              <View style={styles.stepItem}>
                <View style={[
                  styles.stepCircle,
                  i < step && styles.stepCircleCompleted,
                  i === step && styles.stepCircleCurrent,
                ]}>
                  {i < step
                    ? <Ionicons name="checkmark" size={14} color={Colors.white} />
                    : <Text style={[styles.stepNum, i <= step && styles.stepNumActive]}>{i + 1}</Text>
                  }
                </View>
                <Text style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{s}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>

        {/* ── Step 0: Type ── */}
        {step === 0 && (
          <>
            <Text style={styles.stepTitle}>Select Alert Type</Text>
            <Text style={styles.stepDescription}>Choose what kind of alert you want to create</Text>
            {ALERT_TYPES.map((t) => {
              const isSelected = alertType === t.key;
              return (
                <TouchableOpacity key={t.key} style={[styles.typeCard, isSelected && styles.typeCardActive]} onPress={() => setAlertType(t.key)} activeOpacity={0.7}>
                  <View style={[styles.typeIconWrap, isSelected && styles.typeIconWrapActive]}>
                    <Ionicons name={t.icon} size={24} color={isSelected ? Colors.white : Colors.primary} />
                  </View>
                  <View style={styles.typeInfo}>
                    <Text style={[styles.typeText, isSelected && styles.typeTextActive]}>{t.label}</Text>
                    <Text style={[styles.typeDesc, isSelected && styles.typeDescActive]}>{t.description}</Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={24} color={Colors.btnPrimary} />}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── Step 1: Zone ── */}
        {step === 1 && (
          <>
            <Text style={styles.stepTitle}>Define Zone</Text>
            <Text style={styles.stepDescription}>Select the area you want to monitor</Text>

            {/* Zone type tabs */}
            <View style={styles.zoneTypeTabs}>
              {[
                { key: 'wilaya',  label: 'Wilaya',  icon: 'map-outline' },
                { key: 'commune', label: 'Commune', icon: 'location-outline' },
              ].map((t) => {
                const active = zoneType === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.zoneTypeTab, active && styles.zoneTypeTabActive]}
                    onPress={() => { setZoneType(t.key); setSelectedCommune(null); setZoneSearch(''); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={t.icon} size={16} color={active ? Colors.white : Colors.primary} />
                    <Text style={[styles.zoneTypeTabText, active && styles.zoneTypeTabTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Selected zone indicator */}
            {hasZone && (
              <View style={styles.selectedZone}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />
                <Text style={styles.selectedZoneText}>{zoneSummary}</Text>
                <TouchableOpacity onPress={() => {
                  if (zoneType === 'wilaya') setSelectedWilaya(null);
                  else setSelectedCommune(null);
                }}>
                  <Ionicons name="close-circle-outline" size={18} color={Colors.subtext} />
                </TouchableOpacity>
              </View>
            )}

            {/* Commune flow: first pick wilaya */}
            {zoneType === 'commune' && selectedWilaya && (
              <View style={styles.breadcrumb}>
                <TouchableOpacity style={styles.breadcrumbBtn} onPress={() => { setSelectedWilaya(null); setSelectedCommune(null); setZoneSearch(''); }}>
                  <Ionicons name="arrow-back" size={14} color={Colors.primary} />
                  <Text style={styles.breadcrumbText}>{selectedWilaya.name}</Text>
                </TouchableOpacity>
                <Text style={styles.breadcrumbSep}>›</Text>
                <Text style={styles.breadcrumbCurrent}>Select commune</Text>
              </View>
            )}

            {/* Search */}
            <TextInput
              style={styles.searchInput}
              value={zoneSearch}
              onChangeText={setZoneSearch}
              placeholder={zoneType === 'commune' && selectedWilaya ? 'Search communes…' : 'Search wilayas…'}
              placeholderTextColor={Colors.subtext}
            />

            {/* List box */}
            <View style={styles.listBox}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {/* Wilaya list */}
                {(zoneType === 'wilaya' || (zoneType === 'commune' && !selectedWilaya)) && (
                  loadingWilayas
                    ? <ActivityIndicator color={Colors.primary} style={{ padding: 16 }} />
                    : filteredList(wilayas).map((w) => {
                        const active = selectedWilaya?.id === w.id;
                        return (
                          <TouchableOpacity
                            key={w.id}
                            style={[styles.listItem, active && styles.listItemActive]}
                            onPress={() => { setSelectedWilaya(w); setZoneSearch(''); if (zoneType === 'wilaya') {} }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.listItemText, active && styles.listItemTextActive]}>{w.name}</Text>
                            {active && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                          </TouchableOpacity>
                        );
                      })
                )}

                {/* Commune list */}
                {zoneType === 'commune' && selectedWilaya && (
                  loadingCommunes
                    ? <ActivityIndicator color={Colors.primary} style={{ padding: 16 }} />
                    : filteredList(communes).map((c) => {
                        const active = selectedCommune?.id === c.id;
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.listItem, active && styles.listItemActive]}
                            onPress={() => { setSelectedCommune(c); setZoneSearch(''); }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.listItemText, active && styles.listItemTextActive]}>{c.name}</Text>
                            {active && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                          </TouchableOpacity>
                        );
                      })
                )}
              </ScrollView>
            </View>
          </>
        )}

        {/* ── Step 2: Conditions ── */}
        {step === 2 && (
          <>
            <Text style={styles.stepTitle}>Set Conditions</Text>
            <Text style={styles.stepDescription}>Define when this alert should trigger</Text>

            <Text style={styles.fieldLabel}>Minimum Severity</Text>
            <View style={styles.severityRow}>
              {SEVERITY_OPTIONS.map((s) => {
                const isSelected = minSeverity === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.sevChip, isSelected && { backgroundColor: `${s.color}18`, borderColor: s.color }]}
                    onPress={() => setMinSeverity(s.key)}
                  >
                    <View style={[styles.sevDot, { backgroundColor: s.color }]} />
                    <Text style={[styles.sevChipText, isSelected && { color: s.color, fontWeight: '700' }]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Time Range</Text>
            <View style={styles.timeRangeRow}>
              {TIME_RANGE_OPTIONS.map((t) => {
                const isSelected = timeRange === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.timeChip, isSelected && styles.timeChipActive]}
                    onPress={() => setTimeRange(t.key)}
                  >
                    <Text style={[styles.timeChipText, isSelected && styles.timeChipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── Step 3: Frequency ── */}
        {step === 3 && (
          <>
            <Text style={styles.stepTitle}>Notification Frequency</Text>
            <Text style={styles.stepDescription}>How often do you want to be notified?</Text>
            {FREQUENCIES.map((f) => {
              const isSelected = frequency === f.key;
              return (
                <TouchableOpacity key={f.key} style={[styles.freqCard, isSelected && styles.freqCardActive]} onPress={() => setFrequency(f.key)} activeOpacity={0.7}>
                  <View style={[styles.freqIconWrap, isSelected && styles.freqIconWrapActive]}>
                    <Ionicons name={f.icon} size={22} color={isSelected ? Colors.white : Colors.primary} />
                  </View>
                  <View style={styles.freqInfo}>
                    <Text style={[styles.freqText, isSelected && styles.freqTextActive]}>{f.key}</Text>
                    <Text style={[styles.freqDesc, isSelected && styles.freqDescActive]}>{f.description}</Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.btnPrimary} />}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── Step 4: Confirm ── */}
        {step === 4 && (
          <>
            <Text style={styles.stepTitle}>Confirm Alert</Text>
            <Text style={styles.stepDescription}>Name your alert and review the configuration</Text>

            <Text style={styles.fieldLabel}>Alert Name *</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Béchar accident alerts"
              placeholderTextColor={Colors.subtext}
              maxLength={80}
            />

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Summary</Text>

              {[
                { icon: 'flash',         label: 'Type',      val: alertType || '—' },
                { icon: 'location',      label: 'Zone',      val: zoneSummary },
                { icon: 'warning',       label: 'Severity',  val: `≥ ${minSeverity}` },
                { icon: 'time',          label: 'Time',      val: TIME_RANGE_OPTIONS.find((t) => t.key === timeRange)?.label || '—' },
                { icon: 'notifications', label: 'Frequency', val: frequency },
              ].map((row, i, arr) => (
                <React.Fragment key={row.label}>
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryIconWrap}>
                      <Ionicons name={row.icon} size={16} color={Colors.primary} />
                    </View>
                    <Text style={styles.summaryLabel}>{row.label}</Text>
                    <Text style={styles.summaryVal} numberOfLines={1}>{row.val}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={styles.summaryDivider} />}
                </React.Fragment>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Navigation row */}
      <View style={styles.navRow}>
        {step > 0
          ? (
            <TouchableOpacity style={styles.navBackBtn} onPress={prevStep}>
              <Ionicons name="arrow-back" size={18} color={Colors.primary} />
              <Text style={styles.navBackText}>Back</Text>
            </TouchableOpacity>
          )
          : <View />
        }
        {step < STEPS.length - 1
          ? (
            <TouchableOpacity style={styles.navNextBtn} onPress={nextStep}>
              <Text style={styles.navNextText}>Next</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.white} />
            </TouchableOpacity>
          )
          : (
            <TouchableOpacity
              style={[styles.navSubmitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Ionicons name="checkmark" size={18} color={Colors.white} />
              }
              <Text style={styles.navNextText}>{submitting ? 'Saving…' : 'Create Alert'}</Text>
            </TouchableOpacity>
          )
        }
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 14,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: Colors.heading, fontSize: 18, fontWeight: '700' },
  cancelText: { color: Colors.subtext, fontSize: 14, fontWeight: '500' },

  stepperContainer: { backgroundColor: Colors.white, paddingVertical: 16, paddingHorizontal: 16 },
  stepperTrack: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  stepItem: { alignItems: 'center', width: 54 },
  stepCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.bg, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  stepCircleCurrent: { backgroundColor: Colors.violetLight, borderColor: Colors.btnPrimary },
  stepCircleCompleted: { backgroundColor: Colors.btnPrimary, borderColor: Colors.btnPrimary },
  stepNum: { color: Colors.greyLight, fontSize: 12, fontWeight: '700' },
  stepNumActive: { color: Colors.btnPrimary },
  stepLabel: { color: Colors.greyLight, fontSize: 9, marginTop: 4, fontWeight: '500' },
  stepLabelActive: { color: Colors.heading, fontWeight: '600' },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.border, marginTop: 14, marginHorizontal: -4 },
  stepLineActive: { backgroundColor: Colors.btnPrimary },

  content: { flex: 1, paddingHorizontal: 20 },
  contentInner: { paddingBottom: 24, paddingTop: 8 },
  stepTitle: { color: Colors.heading, fontSize: 22, fontWeight: '800', marginBottom: 4, marginTop: 12 },
  stepDescription: { color: Colors.subtext, fontSize: 14, marginBottom: 20, lineHeight: 20 },

  // Type step
  typeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, padding: 16, borderRadius: 14, marginBottom: 10, borderWidth: 1.5, borderColor: Colors.border, gap: 14, elevation: 2 },
  typeCardActive: { borderColor: Colors.btnPrimary, backgroundColor: Colors.violetLight },
  typeIconWrap: { width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.violetLight, justifyContent: 'center', alignItems: 'center' },
  typeIconWrapActive: { backgroundColor: Colors.btnPrimary },
  typeInfo: { flex: 1 },
  typeText: { color: Colors.heading, fontSize: 15, fontWeight: '700' },
  typeTextActive: { color: Colors.primary },
  typeDesc: { color: Colors.subtext, fontSize: 12, marginTop: 2 },
  typeDescActive: { color: Colors.text },

  // Zone step
  zoneTypeTabs: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  zoneTypeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.violetLight },
  zoneTypeTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  zoneTypeTabText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  zoneTypeTabTextActive: { color: Colors.white },

  selectedZone: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(15,169,88,0.08)', borderColor: Colors.accent, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  selectedZoneText: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.heading },

  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  breadcrumbBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breadcrumbText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  breadcrumbSep: { color: Colors.subtext, fontSize: 14 },
  breadcrumbCurrent: { fontSize: 13, color: Colors.subtext },

  searchInput: { backgroundColor: Colors.white, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.heading, marginBottom: 8 },
  listBox: { height: 240, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  listItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  listItemActive: { backgroundColor: Colors.violetLight },
  listItemText: { fontSize: 14, color: Colors.text, flex: 1 },
  listItemTextActive: { color: Colors.primary, fontWeight: '700' },

  // Conditions step
  fieldLabel: { color: Colors.heading, fontSize: 14, fontWeight: '600', marginBottom: 10 },
  severityRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sevChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border, gap: 6 },
  sevDot: { width: 8, height: 8, borderRadius: 4 },
  sevChipText: { color: Colors.text, fontSize: 13, fontWeight: '500' },
  timeRangeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  timeChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border },
  timeChipActive: { backgroundColor: Colors.violetLight, borderColor: Colors.btnPrimary },
  timeChipText: { color: Colors.text, fontSize: 13, fontWeight: '500' },
  timeChipTextActive: { color: Colors.btnPrimary, fontWeight: '700' },

  // Frequency step
  freqCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, backgroundColor: Colors.white, marginBottom: 10, borderWidth: 1.5, borderColor: Colors.border, gap: 14, elevation: 2 },
  freqCardActive: { borderColor: Colors.btnPrimary, backgroundColor: Colors.violetLight },
  freqIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.violetLight, justifyContent: 'center', alignItems: 'center' },
  freqIconWrapActive: { backgroundColor: Colors.btnPrimary },
  freqInfo: { flex: 1 },
  freqText: { color: Colors.heading, fontSize: 15, fontWeight: '700' },
  freqTextActive: { color: Colors.primary },
  freqDesc: { color: Colors.subtext, fontSize: 12, marginTop: 2 },
  freqDescActive: { color: Colors.text },

  // Confirm step
  nameInput: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.heading, marginBottom: 16 },
  summaryCard: { backgroundColor: Colors.white, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, elevation: 3 },
  summaryTitle: { color: Colors.heading, fontSize: 16, fontWeight: '700', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 10 },
  summaryIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.violetLight, justifyContent: 'center', alignItems: 'center' },
  summaryLabel: { color: Colors.subtext, fontSize: 13, flex: 1 },
  summaryVal: { color: Colors.heading, fontSize: 14, fontWeight: '600', textTransform: 'capitalize', maxWidth: '55%' },
  summaryDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },

  // Nav row
  navRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  navBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.violetBorder, backgroundColor: Colors.violetLight },
  navBackText: { color: Colors.primary, fontSize: 15, fontWeight: '600' },
  navNextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.btnPrimary, elevation: 4 },
  navNextText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  navSubmitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.accent, elevation: 4 },
});
