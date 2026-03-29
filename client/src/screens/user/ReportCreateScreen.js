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
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';
import {
  INCIDENT_TYPES,
  REPORT_SEVERITIES,
  createReport,
  formatDateTime,
  uploadReportMedia,
} from '../../services/reportsService';

const INCIDENT_TYPE_META = {
  accident: { icon: 'car-outline', label: 'Accident' },
  traffic: { icon: 'trail-sign-outline', label: 'Traffic' },
  danger: { icon: 'warning-outline', label: 'Danger' },
  weather: { icon: 'rainy-outline', label: 'Weather' },
  roadworks: { icon: 'construct-outline', label: 'Roadworks' },
  other: { icon: 'ellipsis-horizontal-circle-outline', label: 'Other' },
};

const SEVERITY_META = {
  low: { color: Colors.severityLow, icon: 'shield-checkmark-outline', label: 'Low' },
  medium: { color: Colors.severityMedium, icon: 'alert-circle-outline', label: 'Medium' },
  high: { color: Colors.severityHigh, icon: 'warning-outline', label: 'High' },
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

  if (!String(title || '').trim()) {
    nextErrors.title = 'Title is required.';
  }
  if (!incidentType) {
    nextErrors.incidentType = 'Select an incident type.';
  }
  if (!severity) {
    nextErrors.severity = 'Select a severity.';
  }
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    nextErrors.location = 'A valid latitude and longitude are required.';
  }
  if (occurredAt && Number.isNaN(new Date(occurredAt).getTime())) {
    nextErrors.occurredAt = 'Occurred time must be a valid datetime.';
  }

  return nextErrors;
}

export default function ReportCreateScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [successReport, setSuccessReport] = useState(null);

  const occurredSummary = useMemo(
    () => (occurredAt ? formatDateTime(occurredAt) : 'If left blank, SIARA will use the current time.'),
    [occurredAt],
  );

  const resetForm = () => {
    setTitle('');
    setIncidentType('');
    setSeverity('medium');
    setDescription('');
    setLocationLabel('');
    setLatitude('');
    setLongitude('');
    setOccurredAt('');
    setImages([]);
    setSubmitError('');
    setFieldErrors({});
    setSuccessReport(null);
  };

  const navigateToNews = () => {
    if (navigation?.navigate) {
      navigation.navigate('UserTabs', { screen: 'News' });
    } else {
      navigation.goBack();
    }
  };

  const handleUseCurrentLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location permission needed', 'Please allow location access to attach your current coordinates.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      setLatitude(String(lat));
      setLongitude(String(lng));

      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lng,
        });
        const detectedAddress = formatDetectedAddress(addresses);
        if (detectedAddress) {
          setLocationLabel(detectedAddress);
        }
      } catch (_error) {
        // Keep coordinates even if reverse geocoding fails.
      }
    } catch (_error) {
      Alert.alert('Location unavailable', 'Could not read your current position right now.');
    }
  };

  const handlePickImage = async () => {
    if (images.length >= 5) {
      Alert.alert('Limit reached', 'You can upload up to 5 images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      setImages((current) => [...current, result.assets[0]].slice(0, 5));
    }
  };

  const handleSubmit = async () => {
    const nextErrors = buildErrors({
      title,
      incidentType,
      severity,
      latitude,
      longitude,
      occurredAt,
    });
    setFieldErrors(nextErrors);
    setSubmitError('');

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const created = await createReport({
        incidentType,
        title: title.trim(),
        description: description.trim(),
        severity,
        occurredAt: occurredAt.trim() || undefined,
        location: {
          lat: Number(latitude),
          lng: Number(longitude),
          label: locationLabel.trim(),
        },
      });

      const finalReport = images.length > 0
        ? await uploadReportMedia(created.id, images)
        : created;

      setSuccessReport(finalReport);
    } catch (error) {
      setSubmitError(error.message || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  if (successReport) {
    return (
      <View style={styles.successScreen}>
        <View style={styles.successBadge}>
          <Ionicons name="checkmark" size={44} color={Colors.white} />
        </View>
        <Text style={styles.successTitle}>Report submitted</Text>
        <Text style={styles.successBody}>
          Your report has been sent to SIARA and is now pending review.
        </Text>
        <View style={styles.successCard}>
          <Text style={styles.successLabel}>Report ID</Text>
          <Text style={styles.successValue}>{successReport.id}</Text>
          <Text style={styles.successMeta}>Status: {successReport.status}</Text>
        </View>
        <View style={styles.successActions}>
          <Button variant="secondary" style={styles.flexButton} onPress={resetForm}>
            Create another
          </Button>
          <Button style={styles.flexButton} onPress={navigateToNews}>
            Open News
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Report</Text>
        <TouchableOpacity style={styles.iconButton} onPress={resetForm}>
          <Ionicons name="refresh" size={20} color={Colors.heading} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report details</Text>
          <Input
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Short headline for the incident"
            error={fieldErrors.title}
          />
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Add any useful context for responders or nearby drivers"
            multiline
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Incident type</Text>
          <View style={styles.choiceGrid}>
            {INCIDENT_TYPES.map((type) => {
              const meta = INCIDENT_TYPE_META[type];
              const selected = incidentType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.choiceCard, selected && styles.choiceCardActive]}
                  onPress={() => setIncidentType(type)}
                >
                  <Ionicons
                    name={meta.icon}
                    size={20}
                    color={selected ? Colors.white : Colors.primary}
                  />
                  <Text style={[styles.choiceLabel, selected && styles.choiceLabelActive]}>
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {fieldErrors.incidentType ? <Text style={styles.errorText}>{fieldErrors.incidentType}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Severity</Text>
          <View style={styles.severityRow}>
            {REPORT_SEVERITIES.map((level) => {
              const meta = SEVERITY_META[level];
              const selected = severity === level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.severityCard,
                    selected && { borderColor: meta.color, backgroundColor: `${meta.color}12` },
                  ]}
                  onPress={() => setSeverity(level)}
                >
                  <Ionicons
                    name={meta.icon}
                    size={18}
                    color={selected ? meta.color : Colors.subtext}
                  />
                  <Text style={[styles.severityLabel, selected && { color: meta.color }]}>
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {fieldErrors.severity ? <Text style={styles.errorText}>{fieldErrors.severity}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <TouchableOpacity style={styles.locationButton} onPress={handleUseCurrentLocation}>
            <Ionicons name="locate-outline" size={18} color={Colors.primary} />
            <Text style={styles.locationButtonText}>Use current location</Text>
          </TouchableOpacity>
          <Input
            label="Location label"
            value={locationLabel}
            onChangeText={setLocationLabel}
            placeholder="Street, landmark, or area"
          />
          <View style={styles.coordinateRow}>
            <Input
              style={styles.coordinateInput}
              label="Latitude"
              value={latitude}
              onChangeText={setLatitude}
              placeholder="36.7525"
              keyboardType="decimal-pad"
            />
            <Input
              style={styles.coordinateInput}
              label="Longitude"
              value={longitude}
              onChangeText={setLongitude}
              placeholder="3.0420"
              keyboardType="decimal-pad"
            />
          </View>
          {fieldErrors.location ? <Text style={styles.errorText}>{fieldErrors.location}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When did it happen?</Text>
          <Input
            label="Occurred at"
            value={occurredAt}
            onChangeText={setOccurredAt}
            placeholder="Optional ISO datetime, e.g. 2026-03-28T14:30:00Z"
            autoCapitalize="none"
            error={fieldErrors.occurredAt}
          />
          <View style={styles.helperCard}>
            <Ionicons name="time-outline" size={16} color={Colors.primary} />
            <Text style={styles.helperText}>{occurredSummary}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          <View style={styles.mediaGrid}>
            {images.map((asset, index) => (
              <View key={`${asset.uri}-${index}`} style={styles.mediaThumbWrap}>
                <Image source={{ uri: asset.uri }} style={styles.mediaThumb} />
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Ionicons name="close" size={14} color={Colors.white} />
                </TouchableOpacity>
              </View>
            ))}
            {images.length < 5 ? (
              <TouchableOpacity style={styles.addMediaCard} onPress={handlePickImage}>
                <Ionicons name="camera-outline" size={22} color={Colors.primary} />
                <Text style={styles.addMediaText}>Add image</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {submitError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.btnDanger} />
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        ) : null}

        <Button loading={submitting} onPress={handleSubmit} style={styles.submitButton}>
          Submit report
        </Button>
      </ScrollView>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 18,
  },
  section: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 12,
  },
  sectionTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  choiceCard: {
    minWidth: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    backgroundColor: Colors.violetLight,
  },
  choiceCardActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  choiceLabel: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  choiceLabelActive: {
    color: Colors.white,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  severityCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  severityLabel: {
    color: Colors.subtext,
    fontSize: 13,
    fontWeight: '700',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  locationButtonText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  coordinateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  coordinateInput: {
    flex: 1,
    marginBottom: 0,
  },
  helperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.bg,
  },
  helperText: {
    flex: 1,
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  mediaThumbWrap: {
    width: 88,
    height: 88,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E7EB',
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.btnDanger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMediaCard: {
    width: 88,
    height: 88,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.violetBorder,
    backgroundColor: Colors.violetLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addMediaText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    color: Colors.btnDanger,
    fontSize: 12,
    fontWeight: '600',
    marginTop: -4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 12,
  },
  errorBannerText: {
    flex: 1,
    color: Colors.btnDanger,
    fontSize: 13,
  },
  submitButton: {
    marginTop: 8,
  },
  successScreen: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successBadge: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    color: Colors.heading,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  successBody: {
    color: Colors.subtext,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 18,
  },
  successCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    marginBottom: 18,
    gap: 6,
  },
  successLabel: {
    color: Colors.subtext,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  successValue: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  successMeta: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  successActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  flexButton: {
    flex: 1,
  },
});
