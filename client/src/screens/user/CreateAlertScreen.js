import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';

const { width } = Dimensions.get('window');

const ALERT_TYPES = [
  { key: 'route', icon: 'navigate', label: 'Route Alert', description: 'Monitor specific routes for hazards' },
  { key: 'zone', icon: 'location', label: 'Zone Alert', description: 'Watch an area for incidents' },
  { key: 'weather', icon: 'cloud', label: 'Weather Alert', description: 'Get notified about weather changes' },
  { key: 'ai', icon: 'analytics', label: 'AI-Triggered', description: 'AI-powered risk predictions' },
];

const FREQUENCIES = [
  { key: 'Instant', icon: 'flash', description: 'Get notified immediately' },
  { key: 'Hourly', icon: 'time', description: 'Digest every hour' },
  { key: 'Daily', icon: 'today', description: 'Daily summary' },
  { key: 'Weekly', icon: 'calendar', description: 'Weekly overview' },
];

const STEPS = ['Type', 'Zone', 'Conditions', 'Frequency', 'Confirm'];

export default function CreateAlertScreen({ navigation, route }) {
  const editAlert = route?.params?.editAlert;
  const [step, setStep] = useState(0);
  const [alertType, setAlertType] = useState(editAlert?.type || '');
  const [zone, setZone] = useState(editAlert?.zone || '');
  const [minSeverity, setMinSeverity] = useState('medium');
  const [timeRange, setTimeRange] = useState('all');
  const [frequency, setFrequency] = useState('Instant');
  const [name, setName] = useState(editAlert?.name || '');

  function nextStep() {
    if (step < STEPS.length - 1) setStep(step + 1);
  }
  function prevStep() {
    if (step > 0) setStep(step - 1);
  }

  function handleSubmit() {
    Alert.alert(
      editAlert ? 'Alert Updated' : 'Alert Created',
      `Your "${name || 'Alert'}" has been ${editAlert ? 'updated' : 'created'} successfully.`,
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  }

  const severityOptions = [
    { key: 'low', color: Colors.severityLow, label: 'Low' },
    { key: 'medium', color: Colors.severityMedium, label: 'Medium' },
    { key: 'high', color: Colors.severityHigh, label: 'High' },
    { key: 'critical', color: Colors.severityCritical, label: 'Critical' },
  ];

  const timeRangeOptions = [
    { key: 'all', label: 'All Day' },
    { key: 'morning', label: '6AM - 12PM' },
    { key: 'afternoon', label: '12PM - 6PM' },
    { key: 'evening', label: '6PM - 12AM' },
  ];

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
              {i > 0 && (
                <View style={[styles.stepLine, i <= step && styles.stepLineActive]} />
              )}
              <View style={styles.stepItem}>
                <View style={[
                  styles.stepCircle,
                  i < step && styles.stepCircleCompleted,
                  i === step && styles.stepCircleCurrent,
                ]}>
                  {i < step ? (
                    <Ionicons name="checkmark" size={14} color={Colors.white} />
                  ) : (
                    <Text style={[
                      styles.stepNum,
                      (i <= step) && styles.stepNumActive,
                    ]}>
                      {i + 1}
                    </Text>
                  )}
                </View>
                <Text style={[
                  styles.stepLabel,
                  i <= step && styles.stepLabelActive,
                ]}>
                  {s}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        {/* Step 0: Type */}
        {step === 0 && (
          <>
            <Text style={styles.stepTitle}>Select Alert Type</Text>
            <Text style={styles.stepDescription}>
              Choose what kind of alert you want to create
            </Text>
            {ALERT_TYPES.map((t) => {
              const isSelected = alertType === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeCard, isSelected && styles.typeCardActive]}
                  onPress={() => setAlertType(t.key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.typeIconWrap, isSelected && styles.typeIconWrapActive]}>
                    <Ionicons
                      name={t.icon}
                      size={24}
                      color={isSelected ? Colors.white : Colors.primary}
                    />
                  </View>
                  <View style={styles.typeInfo}>
                    <Text style={[styles.typeText, isSelected && styles.typeTextActive]}>
                      {t.label}
                    </Text>
                    <Text style={[styles.typeDesc, isSelected && styles.typeDescActive]}>
                      {t.description}
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={24} color={Colors.btnPrimary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Step 1: Zone */}
        {step === 1 && (
          <>
            <Text style={styles.stepTitle}>Define Zone</Text>
            <Text style={styles.stepDescription}>
              Specify the area you want to monitor
            </Text>

            {/* Map preview placeholder */}
            <View style={styles.mapPreview}>
              <Ionicons name="map" size={48} color={Colors.greyLight} />
              <Text style={styles.mapPreviewText}>Map preview</Text>
              <Text style={styles.mapPreviewHint}>
                Enter location below or tap the map to select
              </Text>
            </View>

            <Input
              label="Zone / Location"
              value={zone}
              onChangeText={setZone}
              placeholder="e.g. Algiers Centre"
            />
            <Text style={styles.hint}>
              Enter a city, neighborhood, or road name to set the alert zone.
            </Text>
          </>
        )}

        {/* Step 2: Conditions */}
        {step === 2 && (
          <>
            <Text style={styles.stepTitle}>Set Conditions</Text>
            <Text style={styles.stepDescription}>
              Define when this alert should trigger
            </Text>

            <Text style={styles.fieldLabel}>Minimum Severity</Text>
            <View style={styles.severityRow}>
              {severityOptions.map((s) => {
                const isSelected = minSeverity === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[
                      styles.sevChip,
                      isSelected && { backgroundColor: `${s.color}18`, borderColor: s.color },
                    ]}
                    onPress={() => setMinSeverity(s.key)}
                  >
                    <View style={[styles.sevDot, { backgroundColor: s.color }]} />
                    <Text style={[
                      styles.sevChipText,
                      isSelected && { color: s.color, fontWeight: '700' },
                    ]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Time Range</Text>
            <View style={styles.timeRangeRow}>
              {timeRangeOptions.map((t) => {
                const isSelected = timeRange === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.timeChip, isSelected && styles.timeChipActive]}
                    onPress={() => setTimeRange(t.key)}
                  >
                    <Text style={[styles.timeChipText, isSelected && styles.timeChipTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Step 3: Frequency */}
        {step === 3 && (
          <>
            <Text style={styles.stepTitle}>Notification Frequency</Text>
            <Text style={styles.stepDescription}>
              How often do you want to be notified?
            </Text>
            {FREQUENCIES.map((f) => {
              const isSelected = frequency === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.freqCard, isSelected && styles.freqCardActive]}
                  onPress={() => setFrequency(f.key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.freqIconWrap, isSelected && styles.freqIconWrapActive]}>
                    <Ionicons
                      name={f.icon}
                      size={22}
                      color={isSelected ? Colors.white : Colors.primary}
                    />
                  </View>
                  <View style={styles.freqInfo}>
                    <Text style={[styles.freqText, isSelected && styles.freqTextActive]}>
                      {f.key}
                    </Text>
                    <Text style={[styles.freqDesc, isSelected && styles.freqDescActive]}>
                      {f.description}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={styles.freqCheck}>
                      <Ionicons name="checkmark-circle" size={22} color={Colors.btnPrimary} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && (
          <>
            <Text style={styles.stepTitle}>Confirm Alert</Text>
            <Text style={styles.stepDescription}>
              Review your alert configuration before saving
            </Text>

            <Input
              label="Alert Name"
              value={name}
              onChangeText={setName}
              placeholder="Give your alert a name"
            />

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Alert Summary</Text>

              <View style={styles.summaryRow}>
                <View style={styles.summaryIconWrap}>
                  <Ionicons name="flash" size={16} color={Colors.primary} />
                </View>
                <Text style={styles.summaryLabel}>Type</Text>
                <Text style={styles.summaryVal}>{alertType || '--'}</Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <View style={styles.summaryIconWrap}>
                  <Ionicons name="location" size={16} color={Colors.primary} />
                </View>
                <Text style={styles.summaryLabel}>Zone</Text>
                <Text style={styles.summaryVal}>{zone || '--'}</Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <View style={styles.summaryIconWrap}>
                  <Ionicons name="warning" size={16} color={Colors.primary} />
                </View>
                <Text style={styles.summaryLabel}>Min Severity</Text>
                <Text style={styles.summaryVal}>{minSeverity}</Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <View style={styles.summaryIconWrap}>
                  <Ionicons name="time" size={16} color={Colors.primary} />
                </View>
                <Text style={styles.summaryLabel}>Time Range</Text>
                <Text style={styles.summaryVal}>
                  {timeRangeOptions.find((t) => t.key === timeRange)?.label}
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <View style={styles.summaryIconWrap}>
                  <Ionicons name="notifications" size={16} color={Colors.primary} />
                </View>
                <Text style={styles.summaryLabel}>Frequency</Text>
                <Text style={styles.summaryVal}>{frequency}</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Navigation buttons */}
      <View style={styles.navRow}>
        {step > 0 ? (
          <TouchableOpacity style={styles.navBackBtn} onPress={prevStep}>
            <Ionicons name="arrow-back" size={18} color={Colors.primary} />
            <Text style={styles.navBackText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        {step < STEPS.length - 1 ? (
          <TouchableOpacity style={styles.navNextBtn} onPress={nextStep}>
            <Text style={styles.navNextText}>Next</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.navSubmitBtn} onPress={handleSubmit}>
            <Ionicons name="checkmark" size={18} color={Colors.white} />
            <Text style={styles.navNextText}>
              {editAlert ? 'Update Alert' : 'Create Alert'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '700',
  },
  cancelText: {
    color: Colors.subtext,
    fontSize: 14,
    fontWeight: '500',
  },

  /* Stepper */
  stepperContainer: {
    backgroundColor: Colors.white,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  stepperTrack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  stepItem: {
    alignItems: 'center',
    width: 54,
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.bg,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleCurrent: {
    backgroundColor: Colors.violetLight,
    borderColor: Colors.btnPrimary,
  },
  stepCircleCompleted: {
    backgroundColor: Colors.btnPrimary,
    borderColor: Colors.btnPrimary,
  },
  stepNum: {
    color: Colors.greyLight,
    fontSize: 12,
    fontWeight: '700',
  },
  stepNumActive: {
    color: Colors.btnPrimary,
  },
  stepLabel: {
    color: Colors.greyLight,
    fontSize: 9,
    marginTop: 4,
    fontWeight: '500',
  },
  stepLabelActive: {
    color: Colors.heading,
    fontWeight: '600',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    marginTop: 14,
    marginHorizontal: -4,
  },
  stepLineActive: {
    backgroundColor: Colors.btnPrimary,
  },

  /* Content */
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  contentInner: {
    paddingBottom: 24,
    paddingTop: 8,
  },
  stepTitle: {
    color: Colors.heading,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
    marginTop: 12,
  },
  stepDescription: {
    color: Colors.subtext,
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },

  /* Type cards */
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 14,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  typeCardActive: {
    borderColor: Colors.btnPrimary,
    backgroundColor: Colors.violetLight,
  },
  typeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeIconWrapActive: {
    backgroundColor: Colors.btnPrimary,
  },
  typeInfo: {
    flex: 1,
  },
  typeText: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  typeTextActive: {
    color: Colors.primary,
  },
  typeDesc: {
    color: Colors.subtext,
    fontSize: 12,
    marginTop: 2,
  },
  typeDescActive: {
    color: Colors.text,
  },

  /* Map preview */
  mapPreview: {
    height: 160,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderStyle: 'dashed',
  },
  mapPreviewText: {
    color: Colors.subtext,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  mapPreviewHint: {
    color: Colors.greyLight,
    fontSize: 12,
    marginTop: 4,
  },
  hint: {
    color: Colors.subtext,
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },

  /* Conditions */
  fieldLabel: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  sevChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 6,
  },
  sevDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sevChipText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  timeRangeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  timeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  timeChipActive: {
    backgroundColor: Colors.violetLight,
    borderColor: Colors.btnPrimary,
  },
  timeChipText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  timeChipTextActive: {
    color: Colors.btnPrimary,
    fontWeight: '700',
  },

  /* Frequency cards */
  freqCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.white,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 14,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  freqCardActive: {
    borderColor: Colors.btnPrimary,
    backgroundColor: Colors.violetLight,
  },
  freqIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  freqIconWrapActive: {
    backgroundColor: Colors.btnPrimary,
  },
  freqInfo: {
    flex: 1,
  },
  freqText: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  freqTextActive: {
    color: Colors.primary,
  },
  freqDesc: {
    color: Colors.subtext,
    fontSize: 12,
    marginTop: 2,
  },
  freqDescActive: {
    color: Colors.text,
  },
  freqCheck: {
    marginLeft: 'auto',
  },

  /* Summary */
  summaryCard: {
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 10,
  },
  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    color: Colors.subtext,
    fontSize: 13,
    flex: 1,
  },
  summaryVal: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },

  /* Navigation row */
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  navBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.violetBorder,
    backgroundColor: Colors.violetLight,
  },
  navBackText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  navNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.btnPrimary,
    shadowColor: Colors.btnPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  navNextText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  navSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
});
