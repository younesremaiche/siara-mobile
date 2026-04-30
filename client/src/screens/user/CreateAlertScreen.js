import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors } from '../../theme/colors';
import {
  buildAlertPayload,
  createAlert,
  fetchCommunesByWilaya,
  fetchWilayas,
  updateAlert,
} from '../../services/alertsService';

// ─── Constants ────────────────────────────────────────────────────────────────

// Exact values the backend accepts for incidentTypes
const INCIDENT_TYPES = [
  { key: 'accident',      icon: 'car',         label: 'Accident',      description: 'Collision, road accident' },
  { key: 'traffic',       icon: 'speedometer',  label: 'Traffic',       description: 'Traffic jam, slowdown' },
  { key: 'danger',        icon: 'flame',        label: 'Danger',        description: 'Obstacle, dangerous situation' },
  { key: 'roadworks',     icon: 'construct',    label: 'Roadworks',     description: 'Construction, lane closure' },
  { key: 'ai_prediction', icon: 'analytics',   label: 'AI Prediction', description: 'AI-powered risk detection' },
];

// backend accepts only low / medium / high  (no critical)
const SEVERITY_OPTIONS = [
  { key: 'low',    color: Colors.severityLow,    label: 'Low' },
  { key: 'medium', color: Colors.severityMedium, label: 'Medium' },
  { key: 'high',   color: Colors.severityHigh,   label: 'High' },
];

// backend timeRangeType: all | day | night | custom
const TIME_RANGE_OPTIONS = [
  { key: 'all',    label: 'All Day' },
  { key: 'day',    label: 'Daytime' },
  { key: 'night',  label: 'Nighttime' },
  { key: 'custom', label: 'Custom' },
];

// maps to frequencyType: immediate | digest | first
const FREQUENCY_OPTIONS = [
  { key: 'instant', icon: 'flash',    label: 'Immediate',        description: 'Notify as soon as a matching incident is detected.' },
  { key: 'hourly',  icon: 'time',     label: 'Hourly digest',    description: 'Bundle incidents and notify once per hour.' },
  { key: 'daily',   icon: 'today',    label: 'Daily digest',     description: 'Get a daily summary of matching incidents.' },
  { key: 'weekly',  icon: 'calendar', label: 'Weekly digest',    description: 'Get a weekly summary of matching incidents.' },
  { key: 'first',   icon: 'ban',      label: 'First match only', description: 'Notify once per period, then silence repeated matches.' },
];

const RADIUS_PRESETS = [500, 1000, 2000, 5000, 10000]; // metres

const STEPS = ['Type', 'Zone', 'Conditions', 'Frequency', 'Confirm'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveFrequencyChoice(alert) {
  if (!alert) return 'instant';
  if (alert.frequencyType === 'digest') return alert.digestInterval || 'daily';
  if (alert.frequencyType === 'first')  return 'first';
  return 'instant';
}

function fmtRadius(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${m} m`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreateAlertScreen({ navigation, route }) {
  const editAlert = route?.params?.editAlert;

  // ── wizard step ──
  const [step, setStep] = useState(0);

  // ── form state (one object for the whole wizard) ──
  const [form, setForm] = useState({
    name: editAlert?.name || '',
    incidentTypes: new Set(editAlert?.incidentTypes || []),
    severityLevels: new Set(
      (editAlert?.severityLevels || ['medium']).filter((s) => ['low', 'medium', 'high'].includes(s))
    ),
    timeRange: editAlert?.timeRangeType || 'all',
    customTimeStart: editAlert?.customTimeStart || '06:00',
    customTimeEnd:   editAlert?.customTimeEnd   || '18:00',
    frequencyChoice: deriveFrequencyChoice(editAlert),
    weatherRelated: editAlert?.weatherRelated ?? false,
    aiConfidenceMin: editAlert?.aiConfidenceMin ?? null,
    muteDuplicates: editAlert?.muteDuplicates ?? true,
    deliveryApp:   editAlert?.notifications?.app   ?? true,
    deliveryEmail: editAlert?.notifications?.email ?? false,
    deliverySms:   editAlert?.notifications?.sms   ?? false,
    zone: editAlert?.zone
      ? {
          type: editAlert.zone.zoneType,
          adminAreaId: editAlert.zone.adminAreaId,
          wilayaId: editAlert.zone.wilayaId,
          displayName: editAlert.zone.displayName,
          wilayaName: editAlert.zone.displayName,
        }
      : null,
  });

  // ── zone sub-state ──
  const [zoneTab, setZoneTab]         = useState('wilaya'); // 'around_me' | 'wilaya' | 'commune'
  const [wilayas, setWilayas]         = useState([]);
  const [communes, setCommunes]       = useState([]);
  const [loadingWilayas, setLoadingWilayas] = useState(false);
  const [loadingCommunes, setLoadingCommunes] = useState(false);
  const [selectedWilaya, setSelectedWilaya]   = useState(null);
  const [wilayaSearch, setWilayaSearch]       = useState('');
  const [communeSearch, setCommuneSearch]     = useState('');
  const [locating, setLocating]       = useState(false);
  const [radiusM, setRadiusM]         = useState(1000);
  const [aroundMeCenter, setAroundMeCenter]   = useState(null); // { lat, lng }

  const [submitting, setSubmitting] = useState(false);
  const autoNameRef = useRef('');

  // ── load wilayas when entering zone step ──
  useEffect(() => {
    if (step !== 1 || wilayas.length > 0) return;
    setLoadingWilayas(true);
    fetchWilayas()
      .then(setWilayas)
      .catch(() => {})
      .finally(() => setLoadingWilayas(false));
  }, [step]);

  // ── load communes when a wilaya is selected in commune tab ──
  useEffect(() => {
    if (zoneTab !== 'commune' || !selectedWilaya) {
      setCommunes([]);
      return;
    }
    setLoadingCommunes(true);
    fetchCommunesByWilaya(selectedWilaya.id)
      .then(setCommunes)
      .catch(() => {})
      .finally(() => setLoadingCommunes(false));
  }, [zoneTab, selectedWilaya]);

  // ── keep form.zone in sync when radius/center changes in around_me tab ──
  useEffect(() => {
    if (zoneTab !== 'around_me' || !aroundMeCenter) return;
    setForm((f) => ({
      ...f,
      zone: {
        type: 'radius',
        radiusM,
        center: aroundMeCenter,
        displayName: `${fmtRadius(radiusM)} radius`,
        wilayaName: 'my location',
      },
    }));
  }, [radiusM, aroundMeCenter, zoneTab]);

  // ── auto-fill alert name when reaching confirm step ──
  useEffect(() => {
    if (step !== 4) return;
    const firstType   = Array.from(form.incidentTypes)[0];
    const typeLabel   = INCIDENT_TYPES.find((t) => t.key === firstType)?.label;
    const wilayaName  = form.zone?.wilayaName || form.zone?.displayName;
    if (typeLabel && wilayaName) {
      const auto = `${typeLabel} – ${wilayaName}`;
      if (!form.name.trim() || form.name === autoNameRef.current) {
        autoNameRef.current = auto;
        setForm((f) => ({ ...f, name: auto }));
      }
    }
  }, [step]);

  // ── helpers ──
  function patch(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSet(formKey, value) {
    setForm((f) => {
      const next = new Set(f[formKey]);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...f, [formKey]: next };
    });
  }

  async function handleAroundMe() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to use "Around me".');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setAroundMeCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (err) {
      Alert.alert('Location error', err?.message || 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }

  function selectWilaya(w) {
    setSelectedWilaya(w);
    setWilayaSearch('');
    if (zoneTab === 'wilaya') {
      setForm((f) => ({
        ...f,
        zone: { type: 'wilaya', adminAreaId: w.id, displayName: w.name, wilayaName: w.name },
      }));
    }
  }

  function selectCommune(c) {
    setCommuneSearch('');
    setForm((f) => ({
      ...f,
      zone: {
        type: 'commune',
        adminAreaId: c.id,
        wilayaId: selectedWilaya.id,
        displayName: `${c.name}, ${selectedWilaya.name}`,
        wilayaName: selectedWilaya.name,
      },
    }));
  }

  function switchZoneTab(tab) {
    setZoneTab(tab);
    setForm((f) => ({ ...f, zone: null }));
    setSelectedWilaya(null);
    setWilayaSearch('');
    setCommuneSearch('');
    setAroundMeCenter(null);
  }

  // ── navigation ──
  function nextStep() {
    if (step === 0 && form.incidentTypes.size === 0) {
      Alert.alert('Required', 'Select at least one incident type.');
      return;
    }
    if (step === 1 && !form.zone) {
      Alert.alert('Required', 'Pick a zone to monitor.');
      return;
    }
    if (step === 2 && form.severityLevels.size === 0) {
      Alert.alert('Required', 'Select at least one severity level.');
      return;
    }
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  }

  function prevStep() {
    if (step > 0) setStep((s) => s - 1);
  }

  // ── submit ──
  const handleSubmit = useCallback(async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      Alert.alert('Required', 'Please enter an alert name.');
      return;
    }
    if (!form.deliveryApp && !form.deliveryEmail && !form.deliverySms) {
      Alert.alert('Required', 'Enable at least one notification channel.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildAlertPayload(form);
      const result  = editAlert?.id
        ? await updateAlert(editAlert.id, payload)
        : await createAlert(payload);
      Alert.alert(
        'Saved',
        `"${result.name}" was ${editAlert ? 'updated' : 'created'}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert('Could not save alert', err?.message || 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }, [form, editAlert, navigation]);

  // ── filter helpers ──
  const filteredWilayas = wilayaSearch.trim()
    ? wilayas.filter((w) => w.name.toLowerCase().includes(wilayaSearch.toLowerCase()))
    : wilayas;

  const filteredCommunes = communeSearch.trim()
    ? communes.filter((c) => c.name.toLowerCase().includes(communeSearch.toLowerCase()))
    : communes;

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editAlert ? 'Edit Alert' : 'Create an alert'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Stepper */}
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
                    ? <Ionicons name="checkmark" size={13} color={Colors.white} />
                    : <Text style={[styles.stepNum, i <= step && styles.stepNumActive]}>{i + 1}</Text>
                  }
                </View>
                <Text style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{s}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ══ Step 0 — Incident Type (multi-select) ══ */}
        {step === 0 && (
          <>
            <Text style={styles.stepTitle}>What type of alert?</Text>
            <Text style={styles.stepDescription}>Select all incident types you want to be notified about.</Text>
            {INCIDENT_TYPES.map((t) => {
              const selected = form.incidentTypes.has(t.key);
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeRow, selected && styles.typeRowActive]}
                  onPress={() => toggleSet('incidentTypes', t.key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.typeIconWrap, selected && styles.typeIconWrapActive]}>
                    <Ionicons name={t.icon} size={22} color={selected ? Colors.white : Colors.primary} />
                  </View>
                  <View style={styles.typeInfo}>
                    <Text style={[styles.typeLabel, selected && styles.typeLabelActive]}>{t.label}</Text>
                    <Text style={styles.typeDesc}>{t.description}</Text>
                  </View>
                  <View style={[styles.checkbox, selected && styles.checkboxActive]}>
                    {selected && <Ionicons name="checkmark" size={14} color={Colors.white} />}
                  </View>
                </TouchableOpacity>
              );
            })}
            {form.incidentTypes.size === 0 && (
              <View style={styles.hintBox}>
                <Ionicons name="warning-outline" size={15} color="#D97706" />
                <Text style={styles.hintText}>Select at least one type to continue.</Text>
              </View>
            )}
          </>
        )}

        {/* ══ Step 1 — Zone ══ */}
        {step === 1 && (
          <>
            <Text style={styles.stepTitle}>Where should SIARA watch?</Text>
            <Text style={styles.stepDescription}>Around you, a wilaya, or a commune.</Text>

            {/* Zone tabs */}
            <View style={styles.zoneTabs}>
              {[
                { key: 'around_me', label: 'Around me', icon: 'locate' },
                { key: 'wilaya',    label: 'Wilaya',    icon: 'business-outline' },
                { key: 'commune',   label: 'Commune',   icon: 'location-outline' },
              ].map((tab) => {
                const active = zoneTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.zoneTab, active && styles.zoneTabActive]}
                    onPress={() => switchZoneTab(tab.key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={tab.icon} size={14} color={active ? Colors.white : Colors.primary} />
                    <Text style={[styles.zoneTabText, active && styles.zoneTabTextActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Selected zone badge */}
            {form.zone && (
              <View style={styles.selectedZone}>
                <Ionicons name="checkmark-circle" size={15} color={Colors.accent} />
                <Text style={styles.selectedZoneText}>{form.zone.displayName}</Text>
                <TouchableOpacity onPress={() => setForm((f) => ({ ...f, zone: null }))}>
                  <Ionicons name="close-circle-outline" size={15} color={Colors.subtext} />
                </TouchableOpacity>
              </View>
            )}

            {/* Around me */}
            {zoneTab === 'around_me' && (
              <View style={styles.aroundMeBox}>
                <Text style={styles.fieldLabel}>Radius</Text>
                <View style={styles.radiusButtons}>
                  {RADIUS_PRESETS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.radiusBtn, radiusM === m && styles.radiusBtnActive]}
                      onPress={() => setRadiusM(m)}
                    >
                      <Text style={[styles.radiusBtnText, radiusM === m && styles.radiusBtnTextActive]}>
                        {fmtRadius(m)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.locateBtn, locating && { opacity: 0.6 }]}
                  onPress={handleAroundMe}
                  disabled={locating}
                  activeOpacity={0.8}
                >
                  {locating
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Ionicons name="locate" size={16} color={Colors.white} />
                  }
                  <Text style={styles.locateBtnText}>
                    {locating ? 'Getting location…' : aroundMeCenter ? 'Update my location' : 'Use my location'}
                  </Text>
                </TouchableOpacity>
                {aroundMeCenter && (
                  <View style={styles.locationConfirm}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.accent} />
                    <Text style={styles.locationConfirmText}>
                      Location set · {fmtRadius(radiusM)} radius
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Wilaya list */}
            {zoneTab === 'wilaya' && (
              <>
                <TextInput
                  style={styles.searchInput}
                  value={wilayaSearch}
                  onChangeText={setWilayaSearch}
                  placeholder="Search wilayas…"
                  placeholderTextColor={Colors.subtext}
                />
                <View style={styles.listBox}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {loadingWilayas
                      ? <ActivityIndicator color={Colors.primary} style={{ padding: 20 }} />
                      : filteredWilayas.map((w) => {
                          const active = form.zone?.adminAreaId === w.id && form.zone?.type === 'wilaya';
                          return (
                            <TouchableOpacity
                              key={w.id}
                              style={[styles.listItem, active && styles.listItemActive]}
                              onPress={() => selectWilaya(w)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.listItemText, active && styles.listItemTextActive]}>{w.name}</Text>
                              {active && <Ionicons name="checkmark" size={15} color={Colors.primary} />}
                            </TouchableOpacity>
                          );
                        })
                    }
                  </ScrollView>
                </View>
              </>
            )}

            {/* Commune: pick wilaya first, then commune */}
            {zoneTab === 'commune' && (
              <>
                {!selectedWilaya ? (
                  <>
                    <Text style={styles.fieldLabel}>Pick a wilaya first</Text>
                    <TextInput
                      style={styles.searchInput}
                      value={wilayaSearch}
                      onChangeText={setWilayaSearch}
                      placeholder="Search wilayas…"
                      placeholderTextColor={Colors.subtext}
                    />
                    <View style={styles.listBox}>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {loadingWilayas
                          ? <ActivityIndicator color={Colors.primary} style={{ padding: 20 }} />
                          : filteredWilayas.map((w) => (
                              <TouchableOpacity
                                key={w.id}
                                style={styles.listItem}
                                onPress={() => { setSelectedWilaya(w); setWilayaSearch(''); }}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.listItemText}>{w.name}</Text>
                                <Ionicons name="chevron-forward" size={15} color={Colors.subtext} />
                              </TouchableOpacity>
                            ))
                        }
                      </ScrollView>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.breadcrumb}>
                      <TouchableOpacity
                        style={styles.breadcrumbBtn}
                        onPress={() => { setSelectedWilaya(null); setCommuneSearch(''); setForm((f) => ({ ...f, zone: null })); }}
                      >
                        <Ionicons name="arrow-back" size={13} color={Colors.primary} />
                        <Text style={styles.breadcrumbText}>{selectedWilaya.name}</Text>
                      </TouchableOpacity>
                      <Text style={styles.breadcrumbSep}>›</Text>
                      <Text style={styles.breadcrumbCurrent}>Select commune</Text>
                    </View>
                    <TextInput
                      style={styles.searchInput}
                      value={communeSearch}
                      onChangeText={setCommuneSearch}
                      placeholder="Search communes…"
                      placeholderTextColor={Colors.subtext}
                    />
                    <View style={styles.listBox}>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {loadingCommunes
                          ? <ActivityIndicator color={Colors.primary} style={{ padding: 20 }} />
                          : filteredCommunes.map((c) => {
                              const active = form.zone?.adminAreaId === c.id && form.zone?.type === 'commune';
                              return (
                                <TouchableOpacity
                                  key={c.id}
                                  style={[styles.listItem, active && styles.listItemActive]}
                                  onPress={() => selectCommune(c)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.listItemText, active && styles.listItemTextActive]}>{c.name}</Text>
                                  {active && <Ionicons name="checkmark" size={15} color={Colors.primary} />}
                                </TouchableOpacity>
                              );
                            })
                        }
                      </ScrollView>
                    </View>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ══ Step 2 — Conditions ══ */}
        {step === 2 && (
          <>
            <Text style={styles.stepTitle}>Conditions</Text>
            <Text style={styles.stepDescription}>Define when this alert should trigger.</Text>

            <Text style={styles.fieldLabel}>Severity levels (multi-select)</Text>
            <View style={styles.chipRow}>
              {SEVERITY_OPTIONS.map((s) => {
                const selected = form.severityLevels.has(s.key);
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.sevChip, selected && { backgroundColor: `${s.color}18`, borderColor: s.color }]}
                    onPress={() => toggleSet('severityLevels', s.key)}
                  >
                    <View style={[styles.sevDot, { backgroundColor: s.color }]} />
                    <Text style={[styles.sevChipText, selected && { color: s.color, fontWeight: '700' }]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {form.severityLevels.size === 0 && (
              <Text style={styles.inlineError}>Select at least one severity level.</Text>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Time range</Text>
            <View style={styles.chipRow}>
              {TIME_RANGE_OPTIONS.map((t) => {
                const selected = form.timeRange === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.timeChip, selected && styles.timeChipActive]}
                    onPress={() => patch('timeRange', t.key)}
                  >
                    <Text style={[styles.timeChipText, selected && styles.timeChipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {form.timeRange === 'custom' && (
              <View style={styles.customTimeRow}>
                <View style={styles.customTimeField}>
                  <Text style={styles.customTimeLabel}>From</Text>
                  <TextInput
                    style={styles.customTimeInput}
                    value={form.customTimeStart}
                    onChangeText={(v) => patch('customTimeStart', v)}
                    placeholder="06:00"
                    placeholderTextColor={Colors.subtext}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
                <Text style={styles.customTimeSep}>–</Text>
                <View style={styles.customTimeField}>
                  <Text style={styles.customTimeLabel}>To</Text>
                  <TextInput
                    style={styles.customTimeInput}
                    value={form.customTimeEnd}
                    onChangeText={(v) => patch('customTimeEnd', v)}
                    placeholder="18:00"
                    placeholderTextColor={Colors.subtext}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
              </View>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Optional filters</Text>
            <View style={styles.toggleCard}>
              {[
                { key: 'weatherRelated', label: 'Weather-related only',   sub: 'Only incidents related to weather conditions.' },
                { key: 'muteDuplicates', label: 'Mute duplicates',         sub: 'Suppress repeated alerts for the same incident.' },
              ].map((opt, i, arr) => (
                <View key={opt.key}>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>{opt.label}</Text>
                      <Text style={styles.toggleSub}>{opt.sub}</Text>
                    </View>
                    <Switch
                      value={Boolean(form[opt.key])}
                      onValueChange={(v) => patch(opt.key, v)}
                      trackColor={{ false: Colors.border, true: `${Colors.primary}50` }}
                      thumbColor={form[opt.key] ? Colors.primary : Colors.greyLight}
                    />
                  </View>
                  {i < arr.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </>
        )}

        {/* ══ Step 3 — Frequency + Delivery ══ */}
        {step === 3 && (
          <>
            <Text style={styles.stepTitle}>Frequency</Text>
            <Text style={styles.stepDescription}>How often should SIARA notify you?</Text>

            {FREQUENCY_OPTIONS.map((f) => {
              const selected = form.frequencyChoice === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.freqCard, selected && styles.freqCardActive]}
                  onPress={() => patch('frequencyChoice', f.key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.freqIcon, selected && styles.freqIconActive]}>
                    <Ionicons name={f.icon} size={20} color={selected ? Colors.white : Colors.primary} />
                  </View>
                  <View style={styles.freqInfo}>
                    <Text style={[styles.freqLabel, selected && styles.freqLabelActive]}>{f.label}</Text>
                    <Text style={styles.freqDesc}>{f.description}</Text>
                  </View>
                  <View style={[styles.radio, selected && styles.radioActive]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}

            {form.frequencyChoice === 'instant' && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  <Text style={styles.warningBold}>High volume: </Text>
                  Immediate alerts can be frequent during peak incidents.
                </Text>
              </View>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Notification channels</Text>
            <View style={styles.toggleCard}>
              {[
                { key: 'deliveryApp',   label: 'In-app',  sub: 'Appears in your SIARA notification center.' },
                { key: 'deliveryEmail', label: 'Email',   sub: 'Sent to your account email address.' },
                { key: 'deliverySms',   label: 'SMS',     sub: 'Text message, when your account supports it.' },
              ].map((ch, i, arr) => (
                <View key={ch.key}>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleInfo}>
                      <Text style={styles.toggleLabel}>{ch.label}</Text>
                      <Text style={styles.toggleSub}>{ch.sub}</Text>
                    </View>
                    <Switch
                      value={Boolean(form[ch.key])}
                      onValueChange={(v) => patch(ch.key, v)}
                      trackColor={{ false: Colors.border, true: `${Colors.primary}50` }}
                      thumbColor={form[ch.key] ? Colors.primary : Colors.greyLight}
                    />
                  </View>
                  {i < arr.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
            {!form.deliveryApp && !form.deliveryEmail && !form.deliverySms && (
              <Text style={styles.inlineError}>Enable at least one notification channel.</Text>
            )}
          </>
        )}

        {/* ══ Step 4 — Confirm ══ */}
        {step === 4 && (
          <>
            <Text style={styles.stepTitle}>Confirm</Text>
            <Text style={styles.stepDescription}>Name your alert and review the configuration.</Text>

            <Text style={styles.fieldLabel}>Alert name *</Text>
            <TextInput
              style={styles.nameInput}
              value={form.name}
              onChangeText={(v) => { autoNameRef.current = ''; patch('name', v); }}
              placeholder="e.g. Accident alerts – Alger"
              placeholderTextColor={Colors.subtext}
              maxLength={80}
            />

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Summary</Text>
              {[
                {
                  icon: 'flash',
                  label: 'Types',
                  val: Array.from(form.incidentTypes)
                    .map((k) => INCIDENT_TYPES.find((t) => t.key === k)?.label || k)
                    .join(', ') || '—',
                },
                {
                  icon: 'location',
                  label: 'Zone',
                  val: form.zone?.displayName || '—',
                },
                {
                  icon: 'warning',
                  label: 'Severity',
                  val: Array.from(form.severityLevels).join(', ') || '—',
                },
                {
                  icon: 'time',
                  label: 'Schedule',
                  val: TIME_RANGE_OPTIONS.find((t) => t.key === form.timeRange)?.label || '—',
                },
                {
                  icon: 'notifications',
                  label: 'Frequency',
                  val: FREQUENCY_OPTIONS.find((f) => f.key === form.frequencyChoice)?.label || '—',
                },
                {
                  icon: 'mail',
                  label: 'Channels',
                  val: [
                    form.deliveryApp   && 'App',
                    form.deliveryEmail && 'Email',
                    form.deliverySms   && 'SMS',
                  ].filter(Boolean).join(', ') || 'None',
                },
              ].map((row, i, arr) => (
                <React.Fragment key={row.label}>
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryIcon}>
                      <Ionicons name={row.icon} size={14} color={Colors.primary} />
                    </View>
                    <Text style={styles.summaryLabel}>{row.label}</Text>
                    <Text style={styles.summaryVal} numberOfLines={2}>{row.val}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              ))}
            </View>
          </>
        )}

      </ScrollView>

      {/* Nav row */}
      <View style={styles.navRow}>
        {step > 0
          ? (
            <TouchableOpacity style={styles.navBackBtn} onPress={prevStep}>
              <Ionicons name="arrow-back" size={17} color={Colors.primary} />
              <Text style={styles.navBackText}>Back</Text>
            </TouchableOpacity>
          )
          : <View />
        }
        {step < STEPS.length - 1
          ? (
            <TouchableOpacity style={styles.navNextBtn} onPress={nextStep}>
              <Text style={styles.navNextText}>Continue</Text>
              <Ionicons name="arrow-forward" size={17} color={Colors.white} />
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
                : <Ionicons name="checkmark" size={17} color={Colors.white} />
              }
              <Text style={styles.navNextText}>{submitting ? 'Saving…' : editAlert ? 'Update Alert' : 'Create Alert'}</Text>
            </TouchableOpacity>
          )
        }
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 14,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: Colors.heading, fontSize: 17, fontWeight: '700' },
  cancelText: { color: Colors.subtext, fontSize: 14, fontWeight: '500' },

  // Stepper
  stepperContainer: { backgroundColor: Colors.white, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stepperTrack: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  stepItem: { alignItems: 'center', width: 52 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bg, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  stepCircleCurrent: { backgroundColor: Colors.violetLight, borderColor: Colors.btnPrimary },
  stepCircleCompleted: { backgroundColor: Colors.btnPrimary, borderColor: Colors.btnPrimary },
  stepNum: { color: Colors.greyLight, fontSize: 11, fontWeight: '700' },
  stepNumActive: { color: Colors.btnPrimary },
  stepLabel: { color: Colors.greyLight, fontSize: 9, marginTop: 4, fontWeight: '500' },
  stepLabelActive: { color: Colors.heading, fontWeight: '600' },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.border, marginTop: 13, marginHorizontal: -4 },
  stepLineActive: { backgroundColor: Colors.btnPrimary },

  // Content
  content: { flex: 1, paddingHorizontal: 20 },
  contentInner: { paddingBottom: 28, paddingTop: 10 },
  stepTitle: { color: Colors.heading, fontSize: 20, fontWeight: '800', marginBottom: 4, marginTop: 10 },
  stepDescription: { color: Colors.subtext, fontSize: 13, marginBottom: 18, lineHeight: 19 },
  fieldLabel: { color: Colors.heading, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  inlineError: { color: Colors.btnDanger, fontSize: 12, marginTop: 6 },

  // Type step (full-width rows)
  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.white, borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: Colors.border, marginBottom: 10,
    elevation: 1,
  },
  typeRowActive: { borderColor: Colors.btnPrimary, backgroundColor: Colors.violetLight },
  typeIconWrap: { width: 42, height: 42, borderRadius: 11, backgroundColor: Colors.violetLight, justifyContent: 'center', alignItems: 'center' },
  typeIconWrapActive: { backgroundColor: Colors.btnPrimary },
  typeInfo: { flex: 1 },
  typeLabel: { color: Colors.heading, fontSize: 14, fontWeight: '700' },
  typeLabelActive: { color: Colors.primary },
  typeDesc: { color: Colors.subtext, fontSize: 12, marginTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: Colors.btnPrimary, borderColor: Colors.btnPrimary },

  hintBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, padding: 12, marginTop: 4 },
  hintText: { color: '#92400E', fontSize: 13, flex: 1 },

  // Zone step
  zoneTabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  zoneTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.primary,
    backgroundColor: Colors.violetLight,
  },
  zoneTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  zoneTabText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  zoneTabTextActive: { color: Colors.white },

  selectedZone: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(15,169,88,0.07)', borderColor: Colors.accent, borderWidth: 1,
    borderRadius: 10, padding: 10, marginBottom: 12,
  },
  selectedZoneText: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.heading },

  aroundMeBox: { gap: 14 },
  radiusButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  radiusBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  radiusBtnActive: { borderColor: Colors.btnPrimary, backgroundColor: Colors.violetLight },
  radiusBtnText: { fontSize: 13, color: Colors.text, fontWeight: '600' },
  radiusBtnTextActive: { color: Colors.primary, fontWeight: '700' },
  locateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 13,
  },
  locateBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  locationConfirm: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationConfirmText: { color: Colors.accent, fontSize: 13, fontWeight: '600' },

  searchInput: {
    backgroundColor: Colors.white, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: Colors.heading, marginBottom: 8,
  },
  listBox: { height: 240, backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  listItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  listItemActive: { backgroundColor: Colors.violetLight },
  listItemText: { fontSize: 13, color: Colors.text, flex: 1 },
  listItemTextActive: { color: Colors.primary, fontWeight: '700' },

  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  breadcrumbBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breadcrumbText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  breadcrumbSep: { color: Colors.subtext, fontSize: 14 },
  breadcrumbCurrent: { fontSize: 13, color: Colors.subtext },

  // Conditions step
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sevChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border, gap: 6 },
  sevDot: { width: 8, height: 8, borderRadius: 4 },
  sevChipText: { color: Colors.text, fontSize: 13, fontWeight: '500' },
  timeChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border },
  timeChipActive: { backgroundColor: Colors.violetLight, borderColor: Colors.btnPrimary },
  timeChipText: { color: Colors.text, fontSize: 13, fontWeight: '500' },
  timeChipTextActive: { color: Colors.btnPrimary, fontWeight: '700' },

  customTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  customTimeField: { flex: 1, gap: 6 },
  customTimeLabel: { color: Colors.subtext, fontSize: 12, fontWeight: '600' },
  customTimeInput: { backgroundColor: Colors.white, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.heading, textAlign: 'center', fontWeight: '700' },
  customTimeSep: { color: Colors.subtext, fontSize: 20, fontWeight: '300', marginTop: 20 },

  toggleCard: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  toggleInfo: { flex: 1 },
  toggleLabel: { color: Colors.heading, fontSize: 14, fontWeight: '600' },
  toggleSub: { color: Colors.subtext, fontSize: 12, marginTop: 2, lineHeight: 16 },
  divider: { height: 1, backgroundColor: Colors.border },

  // Frequency step
  freqCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderRadius: 14, backgroundColor: Colors.white, marginBottom: 10,
    borderWidth: 1.5, borderColor: Colors.border, gap: 14,
    elevation: 1,
  },
  freqCardActive: { borderColor: Colors.btnPrimary },
  freqIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: Colors.violetLight, justifyContent: 'center', alignItems: 'center' },
  freqIconActive: { backgroundColor: Colors.btnPrimary },
  freqInfo: { flex: 1 },
  freqLabel: { color: Colors.heading, fontSize: 14, fontWeight: '700' },
  freqLabelActive: { color: Colors.primary },
  freqDesc: { color: Colors.subtext, fontSize: 12, marginTop: 2, lineHeight: 16 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  radioActive: { borderColor: Colors.btnPrimary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.btnPrimary },

  warningBox: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 10, padding: 12, marginBottom: 4 },
  warningText: { color: '#92400E', fontSize: 12, lineHeight: 18 },
  warningBold: { fontWeight: '700', color: '#D97706' },

  // Confirm step
  nameInput: {
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.heading, marginBottom: 16,
  },
  summaryCard: { backgroundColor: Colors.white, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, elevation: 2 },
  summaryTitle: { color: Colors.heading, fontSize: 15, fontWeight: '700', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, gap: 10 },
  summaryIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.violetLight, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  summaryLabel: { color: Colors.subtext, fontSize: 13, width: 72 },
  summaryVal: { flex: 1, color: Colors.heading, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },

  // Nav row
  navRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    paddingBottom: Platform.OS === 'ios' ? 34 : 14,
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  navBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.violetBorder, backgroundColor: Colors.violetLight },
  navBackText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  navNextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.btnPrimary, elevation: 4 },
  navNextText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  navSubmitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.accent, elevation: 4 },
});
