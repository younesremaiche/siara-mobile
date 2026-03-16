import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';

const { width } = Dimensions.get('window');

const INCIDENT_TYPES = [
  { key: 'Accident', icon: 'car', color: Colors.severityCritical },
  { key: 'Near Miss', icon: 'alert-circle', color: Colors.severityHigh },
  { key: 'Road Hazard', icon: 'construct', color: Colors.severityMedium },
  { key: 'Traffic Jam', icon: 'time', color: Colors.warning },
  { key: 'Other', icon: 'ellipsis-horizontal', color: Colors.grey },
];

const SEVERITIES = [
  { key: 'low', color: Colors.severityLow, label: 'Low', icon: 'shield-checkmark' },
  { key: 'medium', color: Colors.severityMedium, label: 'Medium', icon: 'alert-circle' },
  { key: 'high', color: Colors.severityHigh, label: 'High', icon: 'warning' },
  { key: 'critical', color: Colors.severityCritical, label: 'Critical', icon: 'flame' },
];

const STEPS = ['Type', 'Location', 'Details', 'Media', 'Verify'];

export default function ReportIncidentScreen({ navigation }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState('');
  const [locationText, setLocationText] = useState('');
  const [coords, setCoords] = useState(null);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [media, setMedia] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [trackingId, setTrackingId] = useState(null);

  async function getGPSLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required to detect your position.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      setLocationText(`${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`);
    } catch (e) {
      Alert.alert('Location Error', 'Could not get your current location. Please try again or enter the address manually.');
    }
  }

  async function pickImage() {
    if (media.length >= 5) {
      Alert.alert('Limit reached', 'Maximum 5 files allowed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) {
      setMedia([...media, result.assets[0].uri]);
    }
  }

  function handleSubmit() {
    setSubmitting(true);
    setTimeout(() => {
      const id = 'TRK-' + Math.random().toString(36).substr(2, 8).toUpperCase();
      setTrackingId(id);
      setSubmitting(false);
    }, 1500);
  }

  function nextStep() { if (step < STEPS.length - 1) setStep(step + 1); }
  function prevStep() { if (step > 0) setStep(step - 1); }

  /* Success screen */
  if (trackingId) {
    return (
      <View style={styles.successScreen}>
        <View style={styles.successCircle}>
          <View style={styles.successInnerCircle}>
            <Ionicons name="checkmark" size={48} color={Colors.white} />
          </View>
        </View>
        <Text style={styles.successTitle}>Report Submitted!</Text>
        <View style={styles.trackingCard}>
          <Text style={styles.trackingLabel}>Tracking ID</Text>
          <Text style={styles.trackingId}>{trackingId}</Text>
        </View>
        <Text style={styles.successMsg}>
          Your report is being reviewed by our team. You will receive updates via notifications.
        </Text>
        <TouchableOpacity style={styles.successBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="map" size={18} color={Colors.white} />
          <Text style={styles.successBtnText}>Back to Map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report Incident</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Stepper */}
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
                    <Text style={[styles.stepNum, i <= step && styles.stepNumActive]}>
                      {i + 1}
                    </Text>
                  )}
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
      >
        {/* Step 0: Type */}
        {step === 0 && (
          <>
            <Text style={styles.stepTitle}>Incident Type</Text>
            <Text style={styles.stepDescription}>What kind of incident are you reporting?</Text>
            <View style={styles.typeGrid}>
              {INCIDENT_TYPES.map((t) => {
                const isSelected = type === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.typeCard, isSelected && styles.typeCardActive]}
                    onPress={() => setType(t.key)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.typeIconWrap,
                      { backgroundColor: `${t.color}14` },
                      isSelected && { backgroundColor: t.color },
                    ]}>
                      <Ionicons
                        name={t.icon}
                        size={26}
                        color={isSelected ? Colors.white : t.color}
                      />
                    </View>
                    <Text style={[styles.typeText, isSelected && styles.typeTextActive]}>
                      {t.key}
                    </Text>
                    {isSelected && (
                      <View style={styles.typeCheck}>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.btnPrimary} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Step 1: Location */}
        {step === 1 && (
          <>
            <Text style={styles.stepTitle}>Location</Text>
            <Text style={styles.stepDescription}>Where did the incident occur?</Text>

            {/* Map tap area */}
            <TouchableOpacity style={styles.mapTapArea} activeOpacity={0.8}>
              <View style={styles.mapPinWrap}>
                <Ionicons name="location" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.mapTapText}>Tap to set pin on map</Text>
              <Text style={styles.mapTapHint}>Or use GPS / enter address below</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.gpsBtn} onPress={getGPSLocation}>
              <Ionicons name="navigate" size={18} color={Colors.primary} />
              <Text style={styles.gpsBtnText}>Use My GPS Location</Text>
            </TouchableOpacity>

            <Input
              label="Location Description"
              value={locationText}
              onChangeText={setLocationText}
              placeholder="Enter address or landmark"
            />

            {coords && (
              <View style={styles.coordsCard}>
                <Ionicons name="pin" size={16} color={Colors.accent} />
                <Text style={styles.coordsText}>
                  {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
                </Text>
              </View>
            )}
          </>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <>
            <Text style={styles.stepTitle}>Details</Text>
            <Text style={styles.stepDescription}>Provide more information about the incident</Text>

            <Text style={styles.fieldLabel}>Severity Level</Text>
            <View style={styles.sevRow}>
              {SEVERITIES.map((s) => {
                const isSelected = severity === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[
                      styles.sevCard,
                      isSelected && { backgroundColor: `${s.color}14`, borderColor: s.color },
                    ]}
                    onPress={() => setSeverity(s.key)}
                  >
                    <View style={[
                      styles.sevIconWrap,
                      { backgroundColor: `${s.color}20` },
                      isSelected && { backgroundColor: s.color },
                    ]}>
                      <Ionicons
                        name={s.icon}
                        size={16}
                        color={isSelected ? Colors.white : s.color}
                      />
                    </View>
                    <Text style={[
                      styles.sevText,
                      isSelected && { color: s.color, fontWeight: '700' },
                    ]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Input
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Describe what happened..."
              multiline
              numberOfLines={4}
              inputStyle={styles.descriptionInput}
            />

            <Text style={styles.fieldLabel}>Approximate Time</Text>
            <View style={styles.timeIndicator}>
              <Ionicons name="time" size={16} color={Colors.primary} />
              <Text style={styles.timeText}>Just now</Text>
            </View>
          </>
        )}

        {/* Step 3: Media */}
        {step === 3 && (
          <>
            <Text style={styles.stepTitle}>Media</Text>
            <Text style={styles.stepDescription}>
              Add photos to help verify the incident (up to 5)
            </Text>
            <View style={styles.mediaGrid}>
              {media.map((uri, i) => (
                <View key={i} style={styles.mediaThumb}>
                  <Image source={{ uri }} style={styles.mediaImage} />
                  <TouchableOpacity
                    style={styles.mediaRemove}
                    onPress={() => setMedia(media.filter((_, j) => j !== i))}
                  >
                    <View style={styles.mediaRemoveCircle}>
                      <Ionicons name="close" size={14} color={Colors.white} />
                    </View>
                  </TouchableOpacity>
                </View>
              ))}
              {media.length < 5 && (
                <TouchableOpacity style={styles.addMedia} onPress={pickImage}>
                  <Ionicons name="camera-outline" size={28} color={Colors.primary} />
                  <Text style={styles.addMediaText}>Add photo</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.mediaHint}>
              <Ionicons name="information-circle" size={16} color={Colors.subtext} />
              <Text style={styles.mediaHintText}>
                Photos help our team verify incidents faster. Max 10MB per file.
              </Text>
            </View>
          </>
        )}

        {/* Step 4: Verify */}
        {step === 4 && (
          <>
            <Text style={styles.stepTitle}>Verify & Submit</Text>
            <Text style={styles.stepDescription}>Review your report before submitting</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIconWrap, { backgroundColor: Colors.violetLight }]}>
                  <Ionicons name="car" size={16} color={Colors.primary} />
                </View>
                <Text style={styles.summaryLabel}>Type</Text>
                <Text style={styles.summaryVal}>{type || '--'}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIconWrap, { backgroundColor: Colors.blueLight }]}>
                  <Ionicons name="location" size={16} color={Colors.secondary} />
                </View>
                <Text style={styles.summaryLabel}>Location</Text>
                <Text style={styles.summaryVal} numberOfLines={1}>{locationText || '--'}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIconWrap, { backgroundColor: `${SEVERITIES.find(s => s.key === severity)?.color}14` }]}>
                  <Ionicons name="warning" size={16} color={SEVERITIES.find(s => s.key === severity)?.color} />
                </View>
                <Text style={styles.summaryLabel}>Severity</Text>
                <Text style={styles.summaryVal}>{severity}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIconWrap, { backgroundColor: 'rgba(15,169,88,0.1)' }]}>
                  <Ionicons name="document-text" size={16} color={Colors.accent} />
                </View>
                <Text style={styles.summaryLabel}>Description</Text>
                <Text style={styles.summaryVal} numberOfLines={1}>{description || '(none)'}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <View style={[styles.summaryIconWrap, { backgroundColor: Colors.violetLight }]}>
                  <Ionicons name="camera" size={16} color={Colors.primary} />
                </View>
                <Text style={styles.summaryLabel}>Photos</Text>
                <Text style={styles.summaryVal}>{media.length} attached</Text>
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
          <TouchableOpacity
            style={[styles.navSubmitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Ionicons name={submitting ? 'hourglass' : 'paper-plane'} size={18} color={Colors.white} />
            <Text style={styles.navNextText}>
              {submitting ? 'Submitting...' : 'Submit Report'}
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

  /* Type selection */
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    width: (width - 50) / 2,
    backgroundColor: Colors.white,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
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
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  typeText: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  typeTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  typeCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
  },

  /* Location */
  mapTapArea: {
    height: 160,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  mapPinWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  mapTapText: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '600',
  },
  mapTapHint: {
    color: Colors.subtext,
    fontSize: 12,
    marginTop: 4,
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.violetLight,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  gpsBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  coordsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,169,88,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  coordsText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },

  /* Details */
  fieldLabel: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  sevRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  sevCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 6,
  },
  sevIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sevText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '500',
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  timeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  timeText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },

  /* Media */
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  mediaThumb: {
    width: (width - 64) / 3,
    height: (width - 64) / 3,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  mediaRemoveCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.btnDanger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMedia: {
    width: (width - 64) / 3,
    height: (width - 64) / 3,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.violetBorder,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.violetLight,
  },
  addMediaText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '500',
  },
  mediaHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.bg,
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  mediaHintText: {
    color: Colors.subtext,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },

  /* Summary */
  summaryCard: {
    backgroundColor: Colors.white,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    color: Colors.subtext,
    fontSize: 13,
    width: 80,
  },
  summaryVal: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textTransform: 'capitalize',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },

  /* Navigation */
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

  /* Success screen */
  successScreen: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(15,169,88,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successInnerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    color: Colors.heading,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 16,
  },
  trackingCard: {
    backgroundColor: Colors.white,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  trackingLabel: {
    color: Colors.subtext,
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  trackingId: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  successMsg: {
    color: Colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  successBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.btnPrimary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: Colors.btnPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  successBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
