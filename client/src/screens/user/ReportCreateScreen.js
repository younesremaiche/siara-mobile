import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import DateTimeField from '../../components/DateTimeField';
import { Colors } from '../../theme/colors';
import {
  INCIDENT_TYPES,
  REPORT_SEVERITIES,
  formatDateTime,
} from '../../services/reportsService';
import {
  useCreateReportMutation,
  useUpdateReportMutation,
  useUploadReportMediaMutation,
} from '../../features/reports/hooks/useReportQueries';

const INCIDENT_TYPE_META = {
  accident:  { icon: 'car-outline',                        label: 'Accident',  color: '#EF4444', bg: 'rgba(239,68,68,0.09)',    border: 'rgba(239,68,68,0.22)'    },
  traffic:   { icon: 'trail-sign-outline',                  label: 'Traffic',   color: '#3B82F6', bg: 'rgba(59,130,246,0.09)',   border: 'rgba(59,130,246,0.22)'   },
  danger:    { icon: 'warning-outline',                     label: 'Danger',    color: '#F97316', bg: 'rgba(249,115,22,0.09)',   border: 'rgba(249,115,22,0.22)'   },
  weather:   { icon: 'rainy-outline',                       label: 'Weather',   color: '#06B6D4', bg: 'rgba(6,182,212,0.09)',    border: 'rgba(6,182,212,0.22)'    },
  roadworks: { icon: 'construct-outline',                   label: 'Roadworks', color: '#F59E0B', bg: 'rgba(245,158,11,0.09)',   border: 'rgba(245,158,11,0.22)'   },
  other:     { icon: 'ellipsis-horizontal-circle-outline',  label: 'Other',     color: '#8B5CF6', bg: 'rgba(139,92,246,0.09)',   border: 'rgba(139,92,246,0.22)'   },
};

const SEVERITY_META = {
  low:    { color: Colors.severityLow,    icon: 'shield-checkmark-outline', label: 'Low',    bg: 'rgba(34,197,94,0.09)'   },
  medium: { color: Colors.severityMedium, icon: 'alert-circle-outline',     label: 'Medium', bg: 'rgba(234,179,8,0.09)'   },
  high:   { color: Colors.severityHigh,   icon: 'warning-outline',          label: 'High',   bg: 'rgba(249,115,22,0.09)'  },
};

function formatDetectedAddress(places = []) {
  const firstPlace = Array.isArray(places) ? places[0] : null;
  if (!firstPlace) return '';
  const segments = [
    firstPlace.name,
    firstPlace.street,
    firstPlace.city || firstPlace.subregion,
    firstPlace.region,
  ].filter(Boolean);
  return segments.join(', ');
}

function buildErrors({ title, incidentType, severity, latitude, longitude, occurredAt }) {
  const nextErrors = {};
  if (!String(title || '').trim())                                             nextErrors.title        = 'Title is required.';
  if (!incidentType)                                                           nextErrors.incidentType = 'Select an incident type.';
  if (!severity)                                                               nextErrors.severity     = 'Select a severity.';
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) nextErrors.location  = 'A valid latitude and longitude are required.';
  if (occurredAt && Number.isNaN(new Date(occurredAt).getTime()))             nextErrors.occurredAt   = 'Occurred time must be a valid datetime.';
  return nextErrors;
}

function SectionBadge({ label }) {
  return (
    <View style={styles.sectionBadgeWrap}>
      <View style={styles.sectionBadge}>
        <Text style={styles.sectionBadgeText}>{label}</Text>
      </View>
    </View>
  );
}

export default function ReportCreateScreen({ navigation, route }) {
  const editReport = route?.params?.editReport || null;
  const isEditing = Boolean(editReport?.id);
  const initialLocation = editReport?.location || {};
  const initialSeverity = editReport?.severity === 'critical'
    ? 'high'
    : editReport?.severity || 'medium';

  const [title, setTitle]               = useState(editReport?.title || '');
  const [incidentType, setIncidentType] = useState(editReport?.incidentType || '');
  const [severity, setSeverity]         = useState(initialSeverity);
  const [description, setDescription]   = useState(editReport?.description || '');
  const [locationLabel, setLocationLabel] = useState(editReport?.locationLabel || editReport?.location?.label || '');
  const [latitude, setLatitude]         = useState(initialLocation.lat == null ? '' : String(initialLocation.lat));
  const [longitude, setLongitude]       = useState(initialLocation.lng == null ? '' : String(initialLocation.lng));
  const [occurredAt, setOccurredAt]     = useState(editReport?.occurredAt || '');
  const [images, setImages]             = useState([]);
  const [submitError, setSubmitError]   = useState('');
  const [fieldErrors, setFieldErrors]   = useState({});
  const [successReport, setSuccessReport] = useState(null);
  const createReportMutation = useCreateReportMutation();
  const updateReportMutation = useUpdateReportMutation();
  const uploadMediaMutation = useUploadReportMediaMutation();
  const submitting =
    createReportMutation.isPending
    || updateReportMutation.isPending
    || uploadMediaMutation.isPending;

  const occurredSummary = useMemo(
    () => (occurredAt ? formatDateTime(occurredAt) : 'If left blank, SIARA will use the current time.'),
    [occurredAt],
  );

  const resetForm = () => {
    setTitle(editReport?.title || '');
    setIncidentType(editReport?.incidentType || '');
    setSeverity(initialSeverity);
    setDescription(editReport?.description || '');
    setLocationLabel(editReport?.locationLabel || editReport?.location?.label || '');
    setLatitude(initialLocation.lat == null ? '' : String(initialLocation.lat));
    setLongitude(initialLocation.lng == null ? '' : String(initialLocation.lng));
    setOccurredAt(editReport?.occurredAt || '');
    setImages([]); setSubmitError(''); setFieldErrors({});
    setSuccessReport(null);
  };

  const navigateAfterSuccess = () => {
    if (isEditing && successReport?.id && navigation?.replace) {
      navigation.replace('IncidentDetail', { reportId: successReport.id });
      return;
    }
    if (navigation?.navigate) navigation.navigate('UserTabs', { screen: 'News' });
    else navigation.goBack();
  };

  const handleUseCurrentLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission needed', 'Please allow location access to attach your current coordinates.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setLatitude(String(lat));
      setLongitude(String(lng));
      try {
        const addresses = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const detectedAddress = formatDetectedAddress(addresses);
        if (detectedAddress) setLocationLabel(detectedAddress);
      } catch (_) {}
    } catch (_) {
      Alert.alert('Location unavailable', 'Could not read your current position right now.');
    }
  };

  const handlePickImage = async () => {
    if (images.length >= 5) { Alert.alert('Limit reached', 'You can upload up to 5 images.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) {
      setImages((current) => [...current, result.assets[0]].slice(0, 5));
    }
  };

  const handleTakePhoto = async () => {
    if (images.length >= 5) { Alert.alert('Limit reached', 'You can upload up to 5 images.'); return; }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Please allow camera access to take a photo of the place.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) {
      setImages((current) => [...current, result.assets[0]].slice(0, 5));
    }
  };

  const handleSubmit = async () => {
    const nextErrors = buildErrors({ title, incidentType, severity, latitude, longitude, occurredAt });
    setFieldErrors(nextErrors);
    setSubmitError('');
    if (Object.keys(nextErrors).length > 0) return;
    try {
      const payload = {
        incidentType,
        title: title.trim(),
        description: description.trim(),
        severity,
        occurredAt: occurredAt.trim() || undefined,
        location: { lat: Number(latitude), lng: Number(longitude), label: locationLabel.trim() },
      };
      const saved = isEditing
        ? await updateReportMutation.mutateAsync({ reportId: editReport.id, data: payload })
        : await createReportMutation.mutateAsync(payload);
      const finalReport = images.length > 0
        ? await uploadMediaMutation.mutateAsync({ reportId: saved.id, files: images })
        : saved;
      setSuccessReport(finalReport);
    } catch (error) {
      setSubmitError(error.message || (isEditing ? 'Failed to update report.' : 'Failed to submit report.'));
    }
  };

  /* ── Success Screen ── */
  if (successReport) {
    return (
      <View style={styles.successRoot}>
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.successHero}
        >
          <View style={styles.successDecor1} />
          <View style={styles.successDecor2} />
          <View style={styles.successIconRing}>
            <View style={styles.successIconInner}>
              <Ionicons name="checkmark" size={38} color={Colors.white} />
            </View>
          </View>
          <Text style={styles.successHeroTitle}>{isEditing ? 'Report Updated!' : 'Report Submitted!'}</Text>
          <Text style={styles.successHeroSub}>
            {isEditing ? 'Your changes have been saved' : 'Your report is now pending review by SIARA'}
          </Text>
        </LinearGradient>

        <View style={styles.successBody}>
          <View style={styles.successCard}>
            <View style={styles.successCardRow}>
              <View style={styles.successCardIcon}>
                <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.successCardLabel}>Report ID</Text>
                <Text style={styles.successCardValue}>{successReport.id}</Text>
              </View>
            </View>
            <View style={styles.successCardDivider} />
            <View style={styles.successCardRow}>
              <View style={[styles.successCardIcon, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                <Ionicons name="time-outline" size={18} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.successCardLabel}>Status</Text>
                <Text style={[styles.successCardValue, { color: Colors.accent, textTransform: 'capitalize' }]}>{successReport.status}</Text>
              </View>
            </View>
          </View>

          <View style={styles.successActions}>
            <TouchableOpacity style={styles.successBtnOutline} onPress={resetForm} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
              <Text style={styles.successBtnOutlineText}>New Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.successBtnSolid} onPress={navigateAfterSuccess} activeOpacity={0.8}>
              <LinearGradient colors={[Colors.gradientFrom, Colors.gradientTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.successBtnGrad}>
                <Ionicons name={isEditing ? 'document-text-outline' : 'newspaper-outline'} size={18} color={Colors.white} />
                <Text style={styles.successBtnSolidText}>{isEditing ? 'Open Report' : 'Open News'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  /* ── Main Form ── */
  return (
    <View style={styles.root}>

      {/* Gradient Hero Header */}
      <LinearGradient
        colors={[Colors.gradientFrom, Colors.gradientTo]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroDecor1} />
        <View style={styles.heroDecor2} />

        <TouchableOpacity style={styles.heroBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={Colors.white} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.heroBtn, styles.heroBtnRight]} onPress={resetForm}>
          <Ionicons name="refresh" size={18} color={Colors.white} />
        </TouchableOpacity>

        <View style={styles.heroIconWrap}>
          <Ionicons name="document-text-outline" size={26} color={Colors.white} />
        </View>
        <Text style={styles.heroTitle}>{isEditing ? 'Edit Report' : 'Create Report'}</Text>
        <Text style={styles.heroSubtitle}>
          {isEditing ? 'Update the report details and save your changes' : 'Help the community by reporting incidents in real time'}
        </Text>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Report Details ── */}
        <SectionBadge label="REPORT DETAILS" />
        <View style={styles.card}>
          <Input label="Title" value={title} onChangeText={setTitle}
            placeholder="Short headline for the incident" error={fieldErrors.title} />
          <Input label="Description" value={description} onChangeText={setDescription}
            placeholder="Add any useful context for responders or nearby drivers" multiline />
        </View>

        {/* ── Incident Type ── */}
        <SectionBadge label="INCIDENT TYPE" />
        <View style={styles.card}>
          <View style={styles.typeGrid}>
            {INCIDENT_TYPES.map((type) => {
              const meta = INCIDENT_TYPE_META[type];
              const selected = incidentType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeCard,
                    selected
                      ? { backgroundColor: meta.color, borderColor: meta.color }
                      : { backgroundColor: meta.bg, borderColor: meta.border },
                  ]}
                  onPress={() => setIncidentType(type)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.typeIconWrap, selected ? { backgroundColor: 'rgba(255,255,255,0.2)' } : { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
                    <Ionicons name={meta.icon} size={20} color={selected ? Colors.white : meta.color} />
                  </View>
                  <Text style={[styles.typeLabel, { color: selected ? Colors.white : meta.color }]}>{meta.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {fieldErrors.incidentType ? <Text style={styles.errorText}>{fieldErrors.incidentType}</Text> : null}
        </View>

        {/* ── Severity ── */}
        <SectionBadge label="SEVERITY" />
        <View style={styles.card}>
          <View style={styles.severityRow}>
            {REPORT_SEVERITIES.map((level) => {
              const meta = SEVERITY_META[level];
              const selected = severity === level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.severityCard,
                    selected
                      ? { borderColor: meta.color, backgroundColor: meta.bg }
                      : { borderColor: Colors.border, backgroundColor: Colors.bg },
                  ]}
                  onPress={() => setSeverity(level)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.severityIconWrap, { backgroundColor: selected ? `${meta.color}22` : Colors.borderLight }]}>
                    <Ionicons name={meta.icon} size={22} color={selected ? meta.color : Colors.subtext} />
                  </View>
                  <Text style={[styles.severityLabel, { color: selected ? meta.color : Colors.subtext }]}>{meta.label}</Text>
                  {selected && <View style={[styles.severityDot, { backgroundColor: meta.color }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
          {fieldErrors.severity ? <Text style={styles.errorText}>{fieldErrors.severity}</Text> : null}
        </View>

        {/* ── Location ── */}
        <SectionBadge label="LOCATION" />
        <View style={styles.card}>
          <TouchableOpacity style={styles.gpsButton} onPress={handleUseCurrentLocation} activeOpacity={0.8}>
            <LinearGradient colors={[Colors.gradientFrom, Colors.gradientTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gpsGrad}>
              <Ionicons name="locate-outline" size={18} color={Colors.white} />
              <Text style={styles.gpsText}>Use Current GPS Location</Text>
            </LinearGradient>
          </TouchableOpacity>
          {(latitude || longitude) ? (
            <View style={styles.coordsDetected}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />
              <Text style={styles.coordsDetectedText}>
                {latitude && longitude ? `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}` : 'Coordinates set'}
              </Text>
            </View>
          ) : null}
          <Input label="Location label" value={locationLabel} onChangeText={setLocationLabel}
            placeholder="Street, landmark, or area" />
          <View style={styles.coordRow}>
            <View style={styles.coordField}>
              <Input label="Latitude" value={latitude} onChangeText={setLatitude}
                placeholder="36.7525" keyboardType="decimal-pad" />
            </View>
            <View style={styles.coordField}>
              <Input label="Longitude" value={longitude} onChangeText={setLongitude}
                placeholder="3.0420" keyboardType="decimal-pad" />
            </View>
          </View>
          {fieldErrors.location ? <Text style={styles.errorText}>{fieldErrors.location}</Text> : null}
        </View>

        {/* ── Time ── */}
        <SectionBadge label="WHEN DID IT HAPPEN?" />
        <View style={styles.card}>
          <DateTimeField label="Occurred at (optional)" value={occurredAt}
            onChange={setOccurredAt} error={fieldErrors.occurredAt} />
          <View style={styles.helperCard}>
            <Ionicons name="time-outline" size={16} color={Colors.primary} />
            <Text style={styles.helperText}>{occurredSummary}</Text>
          </View>
        </View>

        {/* ── Photos ── */}
        <SectionBadge label="PHOTOS" />
        <View style={styles.card}>
          {isEditing && editReport?.media?.length > 0 ? (
            <>
              <Text style={styles.existingMediaLabel}>Current photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.existingMediaRow}>
                {editReport.media.map((mediaItem, index) => (
                  <Image key={mediaItem.id || `${mediaItem.url}-${index}`} source={{ uri: mediaItem.url }} style={styles.mediaThumb} />
                ))}
              </ScrollView>
              <Text style={styles.mediaHint}>New photos you add below will be attached to this report.</Text>
            </>
          ) : null}
          {images.length > 0 ? (
            <View style={styles.mediaGrid}>
              {images.map((asset, index) => (
                <View key={`${asset.uri}-${index}`} style={styles.mediaThumbWrap}>
                  <Image source={{ uri: asset.uri }} style={styles.mediaThumb} />
                  <TouchableOpacity style={styles.removeBtn}
                    onPress={() => setImages((c) => c.filter((_, i) => i !== index))}>
                    <Ionicons name="close" size={13} color={Colors.white} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          {images.length < 5 ? (
            <View style={styles.addMediaRow}>
              <TouchableOpacity style={styles.addMediaBtn} onPress={handleTakePhoto} activeOpacity={0.75}>
                <Ionicons name="camera" size={20} color={Colors.primary} />
                <Text style={styles.addMediaText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addMediaBtn} onPress={handlePickImage} activeOpacity={0.75}>
                <Ionicons name="images-outline" size={20} color={Colors.primary} />
                <Text style={styles.addMediaText}>Gallery</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={styles.mediaHint}>{images.length}/5 photos added</Text>
        </View>

        {/* Error banner */}
        {submitError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.btnDanger} />
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        ) : null}

        {/* Submit */}
        <TouchableOpacity onPress={handleSubmit} disabled={submitting} activeOpacity={0.85} style={styles.submitWrap}>
          <LinearGradient colors={[Colors.gradientFrom, Colors.gradientTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGrad}>
            {submitting ? (
              <Text style={styles.submitText}>Submitting…</Text>
            ) : (
              <>
                <Ionicons name={isEditing ? 'save-outline' : 'send-outline'} size={18} color={Colors.white} />
                <Text style={styles.submitText}>{isEditing ? 'Save Changes' : 'Submit Report'}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  /* ── Hero ── */
  hero: {
    paddingTop: Platform.OS === 'ios' ? 58 : 44,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroDecor1: {
    position: 'absolute', top: -40, right: -40,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroDecor2: {
    position: 'absolute', bottom: -20, left: -40,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 42,
    left: 20,
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroBtnRight: { left: undefined, right: 20 },
  heroIconWrap: {
    width: 58, height: 58, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  heroTitle: { color: Colors.white, fontSize: 24, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
  heroSubtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  /* ── Section badge ── */
  sectionBadgeWrap: { paddingHorizontal: 4, paddingBottom: 6 },
  sectionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20,
  },
  sectionBadgeText: { color: Colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },

  /* ── Card ── */
  scroll: { flex: 1 },
  content: { padding: 20, paddingTop: 18, gap: 4 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },

  /* ── Incident type grid ── */
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  typeIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  typeLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },

  /* ── Severity ── */
  severityRow: { flexDirection: 'row', gap: 10 },
  severityCard: {
    flex: 1, alignItems: 'center', paddingVertical: 16,
    borderRadius: 16, borderWidth: 1.5, gap: 8, position: 'relative',
  },
  severityIconWrap: {
    width: 44, height: 44, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
  },
  severityLabel: { fontSize: 13, fontWeight: '700' },
  severityDot: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4,
  },

  /* ── Location ── */
  gpsButton: { borderRadius: 14, overflow: 'hidden' },
  gpsGrad: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    paddingVertical: 14,
  },
  gpsText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  coordsDetected: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(15,169,88,0.08)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  coordsDetectedText: { color: Colors.accent, fontSize: 12, fontWeight: '600' },
  coordRow: { flexDirection: 'row', gap: 12 },
  coordField: { flex: 1 },

  /* ── Time helper ── */
  helperCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 12, backgroundColor: Colors.violetLight,
  },
  helperText: { flex: 1, color: Colors.primary, fontSize: 12, lineHeight: 18 },

  /* ── Photos ── */
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  mediaThumbWrap: {
    width: 88, height: 88, borderRadius: 14,
    overflow: 'hidden', position: 'relative',
  },
  mediaThumb: { width: '100%', height: '100%', backgroundColor: '#E5E7EB' },
  removeBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.btnDanger,
    alignItems: 'center', justifyContent: 'center',
  },
  addMediaRow: { flexDirection: 'row', gap: 12 },
  addMediaBtn: {
    flex: 1, height: 56, borderRadius: 14,
    flexDirection: 'row', gap: 8,
    borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: Colors.violetBorder,
    backgroundColor: Colors.violetLight,
    alignItems: 'center', justifyContent: 'center',
  },
  addMediaText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  addMediaCount: { color: Colors.primary, fontSize: 10, opacity: 0.6 },

  /* ── Errors ── */
  errorText: { color: Colors.btnDanger, fontSize: 12, fontWeight: '600', marginTop: -4 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 14, padding: 12, marginBottom: 4,
  },
  errorBannerText: { flex: 1, color: Colors.btnDanger, fontSize: 13 },

  /* ── Submit ── */
  submitWrap: { borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  submitGrad: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
    paddingVertical: 16,
  },
  submitText: { color: Colors.white, fontSize: 16, fontWeight: '800' },

  /* ── Success Screen ── */
  successRoot: { flex: 1, backgroundColor: Colors.bg },
  successHero: {
    paddingTop: Platform.OS === 'ios' ? 70 : 60,
    paddingBottom: 40, paddingHorizontal: 24,
    alignItems: 'center', overflow: 'hidden',
  },
  successDecor1: {
    position: 'absolute', top: -30, right: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  successDecor2: {
    position: 'absolute', bottom: -10, left: -30,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  successIconRing: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  successIconInner: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: Colors.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  successHeroTitle: { color: Colors.white, fontSize: 26, fontWeight: '800', marginBottom: 6 },
  successHeroSub: { color: 'rgba(255,255,255,0.78)', fontSize: 13, textAlign: 'center' },
  successBody: { flex: 1, padding: 24, gap: 16 },
  successCard: {
    backgroundColor: Colors.white, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.borderLight,
    padding: 16, gap: 0,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 3,
  },
  successCardRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  successCardIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center', alignItems: 'center',
  },
  successCardLabel: { color: Colors.subtext, fontSize: 11, fontWeight: '600', marginBottom: 2, textTransform: 'uppercase' },
  successCardValue: { color: Colors.heading, fontSize: 15, fontWeight: '800' },
  successCardDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 2 },
  successActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  successBtnOutline: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.violetBorder,
    backgroundColor: Colors.violetLight,
  },
  successBtnOutlineText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  successBtnSolid: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  successBtnGrad: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 14,
  },
  successBtnSolidText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
