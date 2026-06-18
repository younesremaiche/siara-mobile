import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapCanvas from '../../components/map/MapCanvas';
import FloatingMapControls from '../../components/map/FloatingMapControls';
import GuidanceBottomSheet from '../../components/map/GuidanceBottomSheet';
import GuidanceSearchSection from '../../components/map/GuidanceSearchSection';
import GuidanceTimeControls from '../../components/map/GuidanceTimeControls';
import CurrentRiskSection from '../../components/map/CurrentRiskSection';
import DepartureTimeCard from '../../components/map/DepartureTimeCard';
import useOccurrenceRisk from '../../hooks/useOccurrenceRisk';
import ReportDetailsSheet from '../../components/map/ReportDetailsSheet';
import RouteAlternativesList from '../../components/map/RouteAlternativesList';
import RouteDetailsSection from '../../components/map/RouteDetailsSection';
import ForecastTabsSection from '../../components/map/ForecastTabsSection';
import DrivingQuiz from '../../components/ui/DrivingQuiz';
import { Colors } from '../../theme/colors';
import { fetchCurrentWeather } from '../../services/weatherService';
import { explainRisk, fetchRiskForecast24h } from '../../services/riskService';
import { explainRouteRisk } from '../../services/routeRiskService';
import { ensureDriverQuizPersisted } from '../../services/driverQuizService';
import { isAbortError } from '../../utils/requestCache';
import { getOccurrenceColor } from '../../utils/routeGuidance';

const { height } = Dimensions.get('window');

const LAYER_OPTIONS = [
  { key: 'points', icon: 'location', label: 'Points' },
  { key: 'heatmap', icon: 'flame', label: 'Heatmap' },
  { key: 'zones', icon: 'shield-checkmark', label: 'Zones' },
  { key: 'ai', icon: 'analytics', label: 'AI Risks' },
  { key: 'nearbyRoads', icon: 'car', label: 'Nearby Roads' },
];

const MAP_STYLE_OPTIONS = [
  { key: 'voyager', icon: 'map-outline', label: 'Standard', desc: 'Clean map style' },
  { key: 'satellite', icon: 'earth-outline', label: 'Satellite', desc: 'ESRI imagery' },
  { key: 'dark', icon: 'moon-outline', label: 'Dark', desc: 'Dark map' },
  { key: 'osm', icon: 'globe-outline', label: 'Classic', desc: 'OSM style' },
];

const SEVERITY_OPTIONS = [
  { id: 'high', label: 'High', color: '#EF4444' },
  { id: 'medium', label: 'Medium', color: '#F59E0B' },
  { id: 'low', label: 'Low', color: '#10B981' },
];

const TYPE_OPTIONS = [
  { id: 'accident', label: 'Accident', icon: 'car' },
  { id: 'traffic', label: 'Traffic', icon: 'swap-horizontal' },
  { id: 'danger', label: 'Danger', icon: 'warning' },
  { id: 'weather', label: 'Weather', icon: 'rainy' },
];

const MOCK_MARKERS = [
  { id: 1, lat: 36.7538, lng: 3.0588, type: 'accident', severity: 'high', title: 'Multi-vehicle collision' },
  { id: 2, lat: 36.7638, lng: 3.0788, type: 'traffic', severity: 'medium', title: 'Traffic jam' },
  { id: 3, lat: 36.7438, lng: 3.0388, type: 'roadworks', severity: 'low', title: 'Ongoing roadworks' },
  { id: 4, lat: 36.7338, lng: 3.0688, type: 'danger', severity: 'high', title: 'Road blocked' },
];

const TRENDING_ZONES = [
  { name: 'Alger Centre', incidents: 12, severity: 'high', updated: '2 min' },
  { name: 'Bab Ezzouar', incidents: 8, severity: 'medium', updated: '5 min' },
  { name: 'El Harrach', incidents: 5, severity: 'medium', updated: '12 min' },
];

const ACTIVE_ALERTS = [
  { id: 1, title: 'Serious accident A1', type: 'accident', time: '3 min' },
  { id: 2, title: 'Road flooding', type: 'weather', time: '15 min' },
];

const ALGERIA_WILAYAS = [
  { code: '16', name: 'Alger' },
  { code: '31', name: 'Oran' },
  { code: '25', name: 'Constantine' },
  { code: '23', name: 'Annaba' },
  { code: '06', name: 'Bejaia' },
];

function weatherIconFromCondition(condition) {
  const text = String(condition || '').toLowerCase();
  if (text.includes('orage') || text.includes('thunder')) return 'thunderstorm';
  if (text.includes('pluie') || text.includes('rain')) return 'rainy';
  if (text.includes('neige') || text.includes('snow')) return 'snow';
  if (text.includes('fog')) return 'cloudy-night';
  if (text.includes('cloud')) return 'partly-sunny';
  return 'sunny';
}

function severityColor(level) {
  if (level === 'high') return '#f97316';
  if (level === 'medium') return '#eab308';
  return '#22c55e';
}

function extractXaiReasons(explanation) {
  if (explanation?.xai?.top_reasons?.length) {
    return explanation.xai.top_reasons.slice(0, 8).map((r) => ({
      name: String(r.feature || '').replace(/_/g, ' '),
      direction: String(r.direction || ''),
      impact: Math.abs(parseFloat(r.impact) || 0),
      rawValue: r.value,
    }));
  }
  const fallback = explanation?.shap_features || explanation?.features || [];
  return fallback.slice(0, 8).map((f) => {
    const numeric = parseFloat(f.value ?? f.importance ?? 0);
    return {
      name: String(f.feature || f.name || '').replace(/_/g, ' '),
      direction: numeric >= 0 ? 'increases_risk' : 'decreases_risk',
      impact: Math.abs(numeric),
      rawValue: numeric,
    };
  });
}

function xaiDangerColor(level) {
  const l = String(level || '').toLowerCase();
  if (l === 'extreme') return '#b91c1c';
  if (l === 'high') return '#ef4444';
  if (l === 'moderate' || l === 'medium') return '#f59e0b';
  return '#22c55e';
}

// Occurrence-level colour (low/moderate/high/critical); falls back to the
// severity palette for any unexpected label.
function xaiOccurrenceColor(level) {
  return getOccurrenceColor(level) || xaiDangerColor(level);
}

// Per-severity-class bar colours (Sev 1 mild → Sev 4 fatal).
const SEVERITY_BAR_COLORS = { 1: '#22c55e', 2: '#f59e0b', 3: '#f97316', 4: '#ef4444' };

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function SegmentXaiPanel({ explanation, onClose, loading }) {
  if (loading) {
    return (
      <View style={xaiStyles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={xaiStyles.loadingText}>Analyzing segment…</Text>
        <Text style={xaiStyles.loadingSubtext}>Fetching SHAP explanations from AI model</Text>
      </View>
    );
  }

  // ── Severity (SECONDARY) — multiclass model ──
  const dangerPct = explanation?.danger_percent ?? explanation?.dangerPercent ?? null;
  const rawLevel = explanation?.danger_level || explanation?.dangerLevel || '';
  const severityLevel = (() => {
    const t = rawLevel.toLowerCase();
    if (['extreme', 'high', 'moderate', 'low'].includes(t)) return t;
    const p = parseFloat(dangerPct);
    if (!Number.isFinite(p)) return 'low';
    if (p < 25) return 'low';
    if (p < 50) return 'moderate';
    if (p < 75) return 'high';
    return 'extreme';
  })();
  const severityColorVal = xaiDangerColor(severityLevel);

  // ── Occurrence (PRIMARY) — accident-likelihood model, model + personalized ──
  const occ = explanation?.occurrence || null;
  const modelProb = Number(occ?.modelOnly?.calibrated_probability);
  const personalizedProb = Number(occ?.personalized?.calibrated_probability);
  const driverApplied = occ?.personalized?.driver_behavior_applied === true;
  const modelPct = Number.isFinite(modelProb) ? modelProb * 100 : null;
  const personalizedPct = Number.isFinite(personalizedProb) ? personalizedProb * 100 : null;
  const modelLevel = occ?.modelOnly?.risk_level || null;
  const personalizedLevel = occ?.personalized?.risk_level || null;
  const hasOccurrence = modelPct != null || personalizedPct != null;
  const headlineLevel = (driverApplied ? personalizedLevel : modelLevel) || severityLevel;
  const headerColor = hasOccurrence ? xaiOccurrenceColor(headlineLevel) : severityColorVal;
  const deltaPct = (modelPct != null && personalizedPct != null) ? personalizedPct - modelPct : null;
  const driverScore = occ?.personalized?.driver_risk_score ?? occ?.driver_meta?.latest_risk_score ?? null;

  // ── Severity class probabilities (Sev 1..4) ──
  const sevProbs = explanation?.severity_probabilities || null;
  const sevRows = sevProbs
    ? [1, 2, 3, 4]
      .map((k) => ({ k, value: Number(sevProbs[`severity_${k}`]) }))
      .filter((r) => Number.isFinite(r.value))
    : [];
  const mostLikely = explanation?.most_likely_severity ?? null;
  const expectedSev = explanation?.expected_severity ?? null;
  const hasSeverity = sevRows.length > 0 || mostLikely != null || expectedSev != null || dangerPct != null;

  const confidence = explanation?.confidence ?? null;
  const quality = explanation?.quality ?? null;
  const reasons = extractXaiReasons(explanation);
  const maxImpact = reasons.length > 0 ? Math.max(...reasons.map((r) => r.impact)) : 1;

  const renderOccRow = (label, sub, pct, lvl, { muted = false } = {}) => {
    const color = lvl ? xaiOccurrenceColor(lvl) : Colors.subtext;
    return (
      <View style={xaiStyles.occRow}>
        <View style={xaiStyles.occRowLabel}>
          <Text style={xaiStyles.occRowName}>{label}</Text>
          <Text style={xaiStyles.occRowSub}>{sub}</Text>
        </View>
        <View style={xaiStyles.occRowTrack}>
          <View style={[xaiStyles.occRowFill, { width: `${Math.max(clampPercent(pct), 2)}%`, backgroundColor: color }]} />
        </View>
        <View style={xaiStyles.occRowRight}>
          <Text style={[xaiStyles.occRowPct, { color: muted ? Colors.subtext : color }]}>
            {pct == null ? '—' : `${Math.round(pct)}%`}
          </Text>
          {lvl ? (
            <Text style={[xaiStyles.occLevelChip, { color, backgroundColor: `${color}22` }]}>
              {String(lvl).toUpperCase()}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={xaiStyles.scrollContent}>

      {/* ── Header ── */}
      <View style={xaiStyles.headerRow}>
        <View style={xaiStyles.headerLeft}>
          <View style={[xaiStyles.headerDot, { backgroundColor: headerColor }]} />
          <Text style={xaiStyles.title}>Segment Explanation</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={xaiStyles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color={Colors.subtext} />
        </TouchableOpacity>
      </View>

      {/* ── PRIMARY: Occurrence risk (model + personalized) ── */}
      {hasOccurrence ? (
        <View style={[xaiStyles.occCard, { borderColor: `${headerColor}30` }]}>
          <View style={xaiStyles.occHeadRow}>
            <Text style={xaiStyles.occKicker}>OCCURRENCE RISK</Text>
            <Text style={xaiStyles.occHint}>accident likelihood</Text>
          </View>
          {modelPct != null ? renderOccRow('Model', 'road · time · weather', modelPct, modelLevel) : null}
          {personalizedPct != null
            ? renderOccRow(
              'Personalized',
              driverApplied ? '+ your driver quiz' : 'no quiz taken',
              personalizedPct,
              personalizedLevel,
              { muted: !driverApplied },
            )
            : null}
          {driverApplied && deltaPct != null ? (
            <View style={xaiStyles.occDelta}>
              <Ionicons
                name={deltaPct >= 0 ? 'trending-up' : 'trending-down'}
                size={13}
                color={deltaPct >= 0 ? '#dc2626' : '#16a34a'}
              />
              <Text style={xaiStyles.occDeltaText}>
                {`${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}% vs model`}
                {driverScore != null ? ` — driver quiz ${Math.round(Number(driverScore))}/100` : ''}
              </Text>
            </View>
          ) : (!driverApplied && personalizedPct != null ? (
            <Text style={xaiStyles.occNote}>No driver quiz profile, so personalized risk matches the model.</Text>
          ) : null)}
        </View>
      ) : (
        <View style={xaiStyles.occUnavailable}>
          <Ionicons name="information-circle-outline" size={15} color={Colors.subtext} />
          <Text style={xaiStyles.occUnavailableText}>Occurrence risk is unavailable for this segment.</Text>
        </View>
      )}

      {/* ── SECONDARY: Severity detail (multiclass) ── */}
      {hasSeverity ? (
        <View style={xaiStyles.sevCard}>
          <View style={xaiStyles.sevHeadRow}>
            <View style={xaiStyles.sevTag}>
              <Text style={xaiStyles.sevTagText}>SEVERITY DETAIL</Text>
            </View>
            <Text style={xaiStyles.occHint}>if an accident occurs</Text>
          </View>
          {sevRows.map((r) => (
            <View key={r.k} style={xaiStyles.sevRow}>
              <Text style={xaiStyles.sevName}>Severity {r.k}</Text>
              <View style={xaiStyles.sevTrack}>
                <View style={[xaiStyles.sevFill, { width: `${clampPercent(r.value)}%`, backgroundColor: SEVERITY_BAR_COLORS[r.k] }]} />
              </View>
              <Text style={xaiStyles.sevVal}>{Math.round(r.value)}%</Text>
            </View>
          ))}
          <View style={xaiStyles.sevFootRow}>
            {mostLikely != null ? (
              <View style={xaiStyles.sevBox}>
                <Text style={xaiStyles.sevBoxLabel}>Most likely</Text>
                <Text style={xaiStyles.sevBoxValue}>Severity {mostLikely}</Text>
              </View>
            ) : null}
            {expectedSev != null ? (
              <View style={xaiStyles.sevBox}>
                <Text style={xaiStyles.sevBoxLabel}>Expected</Text>
                <Text style={xaiStyles.sevBoxValue}>{Number(expectedSev).toFixed(2)}</Text>
              </View>
            ) : null}
            {dangerPct != null ? (
              <View style={xaiStyles.sevBox}>
                <Text style={xaiStyles.sevBoxLabel}>Severe (S3+S4)</Text>
                <Text style={xaiStyles.sevBoxValue}>{Math.round(dangerPct)}%</Text>
              </View>
            ) : null}
          </View>
          {(confidence != null || quality != null) ? (
            <View style={xaiStyles.sevMiniRow}>
              {confidence != null ? (
                <Text style={xaiStyles.sevMini}>Confidence {Number(confidence).toFixed(0)}%</Text>
              ) : null}
              {quality != null ? (
                <Text style={[xaiStyles.sevMini, { textTransform: 'capitalize' }]}>Quality {quality}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── SHAP reasons ── */}
      {reasons.length > 0 && (
        <View style={xaiStyles.reasonsSection}>
          <View style={xaiStyles.reasonsHeaderRow}>
            <View style={xaiStyles.reasonsHeaderBadge}>
              <Text style={xaiStyles.reasonsHeaderText}>TOP SHAP REASONS</Text>
            </View>
            <Text style={xaiStyles.reasonsCount}>{reasons.length} factors</Text>
          </View>

          {reasons.map((r, i) => {
            const increases = r.direction === 'increases_risk';
            const barPct = maxImpact > 0 ? (r.impact / maxImpact) * 100 : 0;
            return (
              <View key={i} style={xaiStyles.reasonRow}>
                <View style={[xaiStyles.reasonAccent, { backgroundColor: increases ? '#ef444440' : '#22c55e40' }]} />
                <View style={xaiStyles.reasonContent}>
                  <View style={xaiStyles.reasonTopRow}>
                    <Text style={xaiStyles.reasonName} numberOfLines={1}>{r.name}</Text>
                    <View style={xaiStyles.reasonRight}>
                      <View style={[xaiStyles.dirBadge, increases ? xaiStyles.badgeRed : xaiStyles.badgeGreen]}>
                        <Ionicons name={increases ? 'trending-up' : 'trending-down'} size={11} color={increases ? '#dc2626' : '#16a34a'} />
                        <Text style={[xaiStyles.dirText, { color: increases ? '#dc2626' : '#16a34a' }]}>
                          {increases ? 'increases' : 'decreases'}
                        </Text>
                      </View>
                      <Text style={xaiStyles.reasonValue}>{Number(r.impact).toFixed(2)}</Text>
                    </View>
                  </View>
                  <View style={xaiStyles.impactBarTrack}>
                    <View style={[xaiStyles.impactBarFill, { width: `${barPct}%`, backgroundColor: increases ? '#ef4444' : '#22c55e' }]} />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function pickExplanationText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return (
    payload.explanation
    || payload.summary
    || payload.text
    || payload.narrative
    || payload.reason
    || ''
  );
}

function stringifyExplanationValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    return value.text || value.summary || value.reason || value.label || JSON.stringify(value);
  }
  return String(value);
}

function positiveIntegerOrNull(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function extractOccurrenceRoadSegmentId({ currentRisk, selectedRoute, currentSegmentIndex } = {}) {
  const candidates = [
    currentRisk?.roadSegmentId,
    currentRisk?.road_segment_id,
    currentRisk?.segmentId,
    currentRisk?.segment_id,
    currentRisk?.nearestSegment?.id,
    currentRisk?.nearestSegment?.segment_id,
    selectedRoute?.currentSegment?.segment_id,
    selectedRoute?.currentSegment?.segmentId,
  ];

  if (Array.isArray(selectedRoute?.segments) && Number.isInteger(Number(currentSegmentIndex))) {
    const segment = selectedRoute.segments[Number(currentSegmentIndex)];
    candidates.push(segment?.segment_id, segment?.segmentId);
  }

  for (const candidate of candidates) {
    const id = positiveIntegerOrNull(candidate);
    if (id) return id;
  }
  return null;
}

function buildOccurrenceTimeBucket(timestampIso) {
  const date = timestampIso ? new Date(timestampIso) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  safeDate.setMinutes(0, 0, 0);
  return safeDate.toISOString();
}

function RiskExplanationModal({
  visible,
  state,
  data,
  error,
  onClose,
  onRetry,
}) {
  const explanationText = pickExplanationText(data);
  const isFallback = data?.source === 'fallback' || data?.fallback === true;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.modalCard, styles.modalCardTall]}>
          <View style={styles.handle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>Why this risk?</Text>
              <Text style={styles.modalSubtitle}>Generated only after tapping Why?</Text>
            </View>
            <TouchableOpacity style={styles.closeIconBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {state === 'loading' ? (
            <View style={styles.explainStateBox}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.explainStateText}>Preparing explanation from available risk, weather, XAI, and raw prediction.</Text>
            </View>
          ) : state === 'error' ? (
            <View style={[styles.explainStateBox, styles.explainStateError]}>
              <Ionicons name="alert-circle" size={18} color={Colors.error} />
              <Text style={[styles.explainStateText, styles.explainStateErrorText]}>
                {error || 'Could not load the explanation. Current risk remains available.'}
              </Text>
              <TouchableOpacity style={styles.retryChip} onPress={onRetry}>
                <Text style={styles.retryChipText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {isFallback ? (
                <View style={styles.fallbackBanner}>
                  <Ionicons name="warning-outline" size={16} color="#92400E" />
                  <Text style={styles.fallbackBannerText}>Fallback explanation based on available prediction context.</Text>
                </View>
              ) : null}
              <Text style={styles.explanationText}>
                {explanationText || 'SIARA could not produce a detailed explanation, so this view is showing the available prediction context only.'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function RouteExplanationModal({
  visible,
  state,
  data,
  error,
  onClose,
  onRetry,
}) {
  const summary = data?.summary || data?.explanation || data?.text || '';
  const reasons = Array.isArray(data?.reasons) ? data.reasons : [];
  const comparison = data?.comparison || null;
  const isFallback = data?.source === 'fallback';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.modalCard, styles.modalCardTall]}>
          <View style={styles.handle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>Why this route?</Text>
              <Text style={styles.modalSubtitle}>Selected route compared with available alternatives.</Text>
            </View>
            <TouchableOpacity style={styles.closeIconBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {state === 'loading' ? (
            <View style={styles.explainStateBox}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.explainStateText}>Explaining the selected route risk profile.</Text>
            </View>
          ) : state === 'error' ? (
            <View style={[styles.explainStateBox, styles.explainStateError]}>
              <Ionicons name="alert-circle" size={18} color={Colors.error} />
              <Text style={[styles.explainStateText, styles.explainStateErrorText]}>
                {error || 'Could not load this route explanation.'}
              </Text>
              <TouchableOpacity style={styles.retryChip} onPress={onRetry}>
                <Text style={styles.retryChipText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.explanationScroll}>
              {isFallback ? (
                <View style={styles.fallbackBanner}>
                  <Ionicons name="warning-outline" size={16} color="#92400E" />
                  <Text style={styles.fallbackBannerText}>Fallback route explanation. The selected route remains risk-scored.</Text>
                </View>
              ) : null}
              <Text style={styles.explanationText}>
                {summary || 'This route was selected from the current route risk analysis.'}
              </Text>
              {comparison ? (
                <View style={styles.comparisonBox}>
                  <Text style={styles.comparisonTitle}>Comparison</Text>
                  <Text style={styles.comparisonText}>{stringifyExplanationValue(comparison)}</Text>
                </View>
              ) : null}
              {reasons.map((reason, index) => (
                <View key={`${reason}-${index}`} style={styles.reasonRow}>
                  <View style={styles.reasonDot}>
                    <Ionicons name="checkmark" size={12} color={Colors.white} />
                  </View>
                  <Text style={styles.reasonText}>{stringifyExplanationValue(reason)}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const xaiStyles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  /* Loading */
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 15, color: Colors.heading, fontWeight: '700' },
  loadingSubtext: { fontSize: 12, color: Colors.subtext, textAlign: 'center' },

  /* Header */
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerDot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.heading },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },

  /* Gauge card */
  gaugeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, marginBottom: 16,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },
  gaugeLeft: { alignItems: 'center', gap: 4, minWidth: 76 },
  gaugeLabel: { fontSize: 9, fontWeight: '800', color: Colors.subtext, letterSpacing: 0.8, textTransform: 'uppercase' },
  gaugePct: { fontSize: 36, fontWeight: '800', lineHeight: 42 },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  levelBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  gaugeRight: { flex: 1, gap: 12 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.bg, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  miniStatsRow: { flexDirection: 'row', gap: 20 },
  miniStat: { gap: 2 },
  miniStatLabel: { fontSize: 10, fontWeight: '600', color: Colors.subtext, textTransform: 'uppercase', letterSpacing: 0.4 },
  miniStatValue: { fontSize: 13, fontWeight: '800', color: Colors.heading },

  /* SHAP reasons */
  reasonsSection: { gap: 8 },
  reasonsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  reasonsHeaderBadge: { backgroundColor: Colors.violetLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  reasonsHeaderText: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 1 },
  reasonsCount: { fontSize: 11, fontWeight: '600', color: Colors.subtext },
  reasonRow: {
    flexDirection: 'row', backgroundColor: Colors.white,
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  reasonAccent: { width: 4 },
  reasonContent: { flex: 1, padding: 10, gap: 6 },
  reasonTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reasonName: { flex: 1, fontSize: 13, color: Colors.heading, fontWeight: '600', textTransform: 'capitalize' },
  reasonRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeRed: { backgroundColor: '#FEF2F2' },
  badgeGreen: { backgroundColor: '#F0FDF4' },
  dirText: { fontSize: 11, fontWeight: '700' },
  reasonValue: { fontSize: 13, fontWeight: '800', color: Colors.heading, minWidth: 36, textAlign: 'right' },
  impactBarTrack: { height: 4, borderRadius: 2, backgroundColor: Colors.bg, overflow: 'hidden' },
  impactBarFill: { height: '100%', borderRadius: 2 },

  /* Occurrence card (PRIMARY) — model + personalized */
  occCard: {
    backgroundColor: 'rgba(124,58,237,0.05)', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.22)', marginBottom: 14, gap: 11,
  },
  occHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  occKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: Colors.primary },
  occHint: { fontSize: 11, color: Colors.subtext },
  occRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  occRowLabel: { width: 112 },
  occRowName: { fontSize: 12, fontWeight: '800', color: Colors.heading },
  occRowSub: { fontSize: 10, color: Colors.subtext, marginTop: 1 },
  occRowTrack: { flex: 1, height: 9, borderRadius: 999, backgroundColor: Colors.bg, overflow: 'hidden' },
  occRowFill: { height: '100%', borderRadius: 999 },
  occRowRight: { width: 78, alignItems: 'flex-end' },
  occRowPct: { fontSize: 16, fontWeight: '900' },
  occLevelChip: {
    fontSize: 8, fontWeight: '800', marginTop: 2,
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999, overflow: 'hidden',
  },
  occDelta: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: Colors.borderLight,
  },
  occDeltaText: { flex: 1, fontSize: 11, lineHeight: 15, color: Colors.text },
  occNote: { fontSize: 11, lineHeight: 15, color: Colors.subtext },
  occUnavailable: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.bg, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 14,
  },
  occUnavailableText: { flex: 1, fontSize: 12, color: Colors.subtext },

  /* Severity detail card (SECONDARY) */
  sevCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 16, gap: 7,
  },
  sevHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sevTag: { backgroundColor: 'rgba(29,78,216,0.08)', borderWidth: 1, borderColor: 'rgba(29,78,216,0.18)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  sevTagText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, color: '#1d4ed8' },
  sevRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sevName: { width: 72, fontSize: 11, fontWeight: '700', color: Colors.text },
  sevTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: Colors.bg, overflow: 'hidden' },
  sevFill: { height: '100%', borderRadius: 999 },
  sevVal: { width: 42, fontSize: 11, fontWeight: '800', color: Colors.heading, textAlign: 'right' },
  sevFootRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  sevBox: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  sevBoxLabel: { fontSize: 10, fontWeight: '700', color: Colors.subtext, textTransform: 'uppercase' },
  sevBoxValue: { fontSize: 14, fontWeight: '800', color: Colors.heading, marginTop: 2 },
  sevMiniRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  sevMini: { fontSize: 11, fontWeight: '600', color: Colors.subtext },
});

export default function MapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [mapLayer, setMapLayer] = useState('points');
  const [mapStyle, setMapStyle] = useState('voyager');
  const [showMapStyleModal, setShowMapStyleModal] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [severityFilter, setSeverityFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState([]);
  const [selectedWilaya, setSelectedWilaya] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [mapDisplayMode, setMapDisplayMode] = useState('map');
  const [bottomSheetIndex, setBottomSheetIndex] = useState(0);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(112);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedRouteType, setSelectedRouteType] = useState(null);
  const [destination, setDestination] = useState(null);
  const [guidanceActive, setGuidanceActive] = useState(false);
  const [forecastTab, setForecastTab] = useState('info');
  const [mapSnapshot, setMapSnapshot] = useState({});
  const [showQuiz, setShowQuiz] = useState(false);
  const [userPosition, setUserPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState('unknown');
  const [locationError, setLocationError] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [forecastPoints, setForecastPoints] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [selectedTimestampIso, setSelectedTimestampIso] = useState(() => new Date().toISOString());
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [riskExplanationVisible, setRiskExplanationVisible] = useState(false);
  const [riskExplanationState, setRiskExplanationState] = useState('idle');
  const [riskExplanationData, setRiskExplanationData] = useState(null);
  const [riskExplanationError, setRiskExplanationError] = useState('');
  const [routeExplanationVisible, setRouteExplanationVisible] = useState(false);
  const [routeExplanationState, setRouteExplanationState] = useState('idle');
  const [routeExplanationData, setRouteExplanationData] = useState(null);
  const [routeExplanationError, setRouteExplanationError] = useState('');

  const mapRef = useRef(null);
  const previousGuidanceActiveRef = useRef(false);
  const prevSheetRef = useRef({ mode: 'map', index: 0, height: 112 });
  const sheetBottomOffset = 0;
  const sheetContentBottomPadding = useMemo(() => insets.bottom + 24, [insets.bottom]);
  const usableHeight = useMemo(() => Math.max(320, height - sheetBottomOffset), [sheetBottomOffset]);
  const snapHeights = useMemo(() => ([
    Math.max(112, Math.round(usableHeight * 0.16)),
    Math.round(usableHeight * 0.46),
    Math.round(usableHeight * 0.9),
  ]), [usableHeight]);

  const requestLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        setLocationError('Location permission denied. Enable it in settings.');
        return;
      }
      setLocationStatus('granted');
      setLocationError(null);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      setLocationStatus('error');
      setLocationError('Could not obtain location.');
    }
  }, []);

  useEffect(() => {
    requestLocation().catch(() => {});
  }, [requestLocation]);

  // Backfill: if the driver quiz was completed on-device but never pushed to the
  // backend (e.g. before backend persistence existed), persist it once so the
  // occurrence card below can show personalized risk. Idempotent + deduped.
  useEffect(() => {
    ensureDriverQuizPersisted().catch(() => {});
  }, []);

  useEffect(() => {
    if (!userPosition) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setWeatherLoading(true);
      try {
        const data = await fetchCurrentWeather({
          lat: userPosition.lat,
          lng: userPosition.lng,
          timestamp: selectedTimestampIso,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setWeatherData(data);
      } catch (error) {
        if (isAbortError(error)) return;
        if (!controller.signal.aborted) setWeatherData(null);
      } finally {
        if (!controller.signal.aborted) setWeatherLoading(false);
      }
    }, 700);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedTimestampIso, userPosition]);

  useEffect(() => {
    if (!userPosition) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setForecastLoading(true);
      try {
        const data = await fetchRiskForecast24h({
          lat: userPosition.lat,
          lng: userPosition.lng,
          timestamp: selectedTimestampIso,
          signal: controller.signal,
        });
        const points = Array.isArray(data?.points) ? data.points : [];
        const nowPoint = data?.now_point && typeof data.now_point === 'object' ? data.now_point : null;
        if (!controller.signal.aborted) setForecastPoints(nowPoint ? [nowPoint, ...points.slice(1)] : points);
      } catch (error) {
        if (isAbortError(error)) return;
        if (!controller.signal.aborted) setForecastPoints([]);
      } finally {
        if (!controller.signal.aborted) setForecastLoading(false);
      }
    }, 700);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedTimestampIso, userPosition]);

  // When a segment is tapped → save current sheet state and expand to show XAI
  useEffect(() => {
    const isXai = selectedIncident?.loading || selectedIncident?.explanation;
    if (isXai && mapDisplayMode !== 'xai') {
      prevSheetRef.current = { mode: mapDisplayMode, index: bottomSheetIndex, height: bottomSheetHeight };
      handleSheetModeChange('xai', 1, snapHeights[1]);
    }
    if (!isXai && mapDisplayMode === 'xai') {
      const prev = prevSheetRef.current;
      handleSheetModeChange(prev.mode, prev.index, prev.height);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIncident]);

  const handleCloseXai = useCallback(() => {
    setSelectedIncident(null);
  }, []);

  const handleExplainRisk = useCallback(async () => {
    const risk = mapSnapshot.currentRisk;
    setRiskExplanationVisible(true);
    setRiskExplanationData(null);
    setRiskExplanationError('');

    if (!risk) {
      setRiskExplanationState('error');
      setRiskExplanationError('Current risk is not available yet.');
      return;
    }

    setRiskExplanationState('loading');
    try {
      const payload = await explainRisk({
        risk,
        weather: weatherData,
        xai: risk.xai || risk.shap || (Array.isArray(risk.shap_features) ? { shap_features: risk.shap_features } : null),
        rawPrediction: risk.rawPrediction || risk.raw_prediction || risk.raw || risk,
        lat: userPosition?.lat,
        lng: userPosition?.lng,
        timestamp: selectedTimestampIso,
      });
      setRiskExplanationData(payload);
      setRiskExplanationState('success');
    } catch (error) {
      setRiskExplanationState('error');
      setRiskExplanationError(error?.message || 'Could not load the risk explanation.');
    }
  }, [mapSnapshot.currentRisk, selectedTimestampIso, userPosition?.lat, userPosition?.lng, weatherData]);

  const handleExplainRoute = useCallback(async () => {
    setRouteExplanationVisible(true);
    setRouteExplanationData(null);
    setRouteExplanationError('');

    if (!selectedRoute) {
      setRouteExplanationState('error');
      setRouteExplanationError('Choose a route before requesting an explanation.');
      return;
    }
    if (!destination) {
      setRouteExplanationState('error');
      setRouteExplanationError('Choose a destination before requesting a route explanation.');
      return;
    }

    setRouteExplanationState('loading');
    try {
      const payload = await explainRouteRisk({
        selectedRoute,
        alternatives: mapSnapshot.guidedRoutes || [],
        destination,
        nearbyReports: mapSnapshot.nearbyReports || [],
        timestamp: selectedTimestampIso,
      });
      setRouteExplanationData(payload);
      setRouteExplanationState('success');
    } catch (error) {
      setRouteExplanationState('error');
      setRouteExplanationError(error?.message || 'Could not load this route explanation.');
    }
  }, [destination, mapSnapshot.guidedRoutes, mapSnapshot.nearbyReports, selectedRoute, selectedTimestampIso]);

  const filteredMarkers = useMemo(() => (
    MOCK_MARKERS.filter((marker) => {
      if (severityFilter.length > 0 && !severityFilter.includes(marker.severity)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(marker.type)) return false;
      if (searchText && !marker.title.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (selectedWilaya && marker.wilaya && marker.wilaya !== selectedWilaya) return false;
      return true;
    })
  ), [searchText, selectedWilaya, severityFilter, typeFilter]);

  const hasActiveFilters = severityFilter.length > 0 || typeFilter.length > 0 || Boolean(selectedWilaya);
  const occurrenceRoadSegmentId = useMemo(() => {
    const currentSegmentIndex = selectedRoute?.currentSegmentIndex ?? selectedRoute?.current_segment_index;
    return extractOccurrenceRoadSegmentId({
      currentRisk: mapSnapshot.currentRisk,
      selectedRoute,
      currentSegmentIndex,
    });
  }, [mapSnapshot.currentRisk, selectedRoute]);
  const occurrenceTimeBucket = useMemo(
    () => buildOccurrenceTimeBucket(selectedTimestampIso),
    [selectedTimestampIso],
  );
  const occurrenceContext = useMemo(() => ({
    destination: destination
      ? {
        name: destination.name || destination.full_name || null,
        lat: destination.lat,
        lng: destination.lng,
      }
      : null,
    routeType: selectedRoute?.route_type || null,
    riskPercent: mapSnapshot.currentRisk?.danger_percent ?? selectedRoute?.danger_percent ?? null,
  }), [destination, mapSnapshot.currentRisk, selectedRoute]);

  // Auto-fetch the current location's OCCURRENCE risk (trained model, primary
  // signal) as soon as the current-risk lookup yields a road segment id — no
  // tap required. /api/occurrence-risk/segment runs the trained occurrence
  // model first and only falls back to rule-fusion if that errors.
  const currentOccurrence = useOccurrenceRisk({
    roadSegmentId: occurrenceRoadSegmentId,
    segmentId: occurrenceRoadSegmentId,
    timeBucket: occurrenceTimeBucket,
    timestamp: selectedTimestampIso,
    weather: weatherData,
    context: occurrenceContext,
    enabled: Boolean(occurrenceRoadSegmentId),
    requestKey: occurrenceRoadSegmentId
      ? `current:${occurrenceRoadSegmentId}:${occurrenceTimeBucket || selectedTimestampIso}`
      : null,
  });

  // Severity (secondary) for the current location, taken straight from the
  // /api/risk/current response (multiclass model). Null-safe.
  const currentSeverity = useMemo(() => {
    const cr = mapSnapshot.currentRisk;
    if (!cr || typeof cr !== 'object') return null;
    const dz = cr.dangerZoneRisk || {};
    const sev = {
      severity_probabilities: cr.severity_probabilities || dz.severityProbabilities || null,
      most_likely_severity: cr.most_likely_severity ?? dz.mostLikelySeverity ?? null,
      expected_severity: cr.expected_severity ?? dz.expectedSeverity ?? null,
      danger_percent: cr.danger_percent ?? dz.severeProbability ?? null,
      danger_level: cr.danger_level ?? dz.riskLevel ?? null,
    };
    const hasAny = sev.severity_probabilities
      || sev.most_likely_severity != null
      || sev.expected_severity != null
      || sev.danger_percent != null;
    return hasAny ? sev : null;
  }, [mapSnapshot.currentRisk]);
  const weatherTemp = weatherData?.temperature_c != null ? `${Math.round(Number(weatherData.temperature_c))}\u00B0C` : '--';
  const weatherDesc = weatherLoading && !weatherData ? 'Loading...' : weatherData?.condition || 'Weather';
  const weatherWind = weatherData?.wind_kmh != null ? `${Number(weatherData.wind_kmh).toFixed(1)} km/h` : '--';
  const weatherHumidity = weatherData?.humidity_pct != null ? `${Math.round(Number(weatherData.humidity_pct))}%` : '--';
  const weatherVisibility = weatherData?.visibility_km != null ? `${Number(weatherData.visibility_km).toFixed(1)} km` : '--';
  const weatherPressure = weatherData?.pressure_hpa != null ? `${Number(weatherData.pressure_hpa).toFixed(0)} hPa` : '--';
  const weatherIconName = weatherData ? weatherIconFromCondition(weatherData.condition) : 'cloud';

  const handleSheetModeChange = useCallback((mode, index, nextHeight) => {
    setMapDisplayMode(mode);
    setBottomSheetIndex(index);
    if (Number.isFinite(nextHeight)) setBottomSheetHeight(nextHeight);
  }, []);

  useEffect(() => {
    setSelectedRoute(mapSnapshot.selectedGuidedRoute || null);
    setSelectedRouteType(mapSnapshot.selectedGuidedRouteType || null);
    setDestination(mapSnapshot.selectedDestination || null);
    setGuidanceActive(Boolean(mapSnapshot.guidanceActive));
  }, [mapSnapshot.guidanceActive, mapSnapshot.selectedDestination, mapSnapshot.selectedGuidedRoute, mapSnapshot.selectedGuidedRouteType]);

  useEffect(() => {
    const wasActive = previousGuidanceActiveRef.current;
    if (guidanceActive && !wasActive) handleSheetModeChange('guidance', 1, snapHeights[1]);
    if (!guidanceActive && wasActive) handleSheetModeChange('map', 0, snapHeights[0]);
    previousGuidanceActiveRef.current = guidanceActive;
  }, [guidanceActive, handleSheetModeChange, snapHeights]);

  // ── Departure-time card callbacks ──
  // "Use this time" → swap the active route timestamp to a future window so
  // the polyline and risk score recolour. SiaraMap exposes setCustomDate +
  // setTimePreset on its imperative handle.
  const handleUseDepartureTime = useCallback((isoString) => {
    if (!isoString) return;
    mapRef.current?.setCustomDate?.(isoString);
    mapRef.current?.setTimePreset?.('custom');
  }, []);

  // "Notify me" → schedule a local notification 10 minutes before the chosen
  // departure window. Permissions are requested lazily; if the user declines
  // we surface that gently rather than silently failing.
  const handleScheduleDepartureNotification = useCallback(async ({ timestamp, destinationName, riskPct }) => {
    try {
      const target = new Date(timestamp);
      if (Number.isNaN(target.getTime())) return;

      const fireAt = new Date(target.getTime() - 10 * 60_000);
      const secondsFromNow = Math.max(15, Math.round((fireAt.getTime() - Date.now()) / 1000));

      const settings = await Notifications.getPermissionsAsync();
      let granted = settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      if (!granted) {
        const requested = await Notifications.requestPermissionsAsync();
        granted = requested.granted;
      }
      if (!granted) {
        Alert.alert(
          'Notifications disabled',
          'Enable notifications in your settings to get reminders before your safer departure window.',
        );
        return;
      }

      const hh = String(target.getHours()).padStart(2, '0');
      const mm = String(target.getMinutes()).padStart(2, '0');
      const riskLabel = Number.isFinite(Number(riskPct)) ? ` (${Math.round(Number(riskPct))}% risk)` : '';
      const destLabel = destinationName ? ` to ${destinationName}` : '';

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Safer time to leave is in 10 min',
          body: `Heading out${destLabel} at ${hh}:${mm}${riskLabel}.`,
          data: { kind: 'departure-time', timestamp, destinationName },
        },
        trigger: { seconds: secondsFromNow },
      });

      Alert.alert('Reminder set', `We'll ping you 10 minutes before ${hh}:${mm}.`);
    } catch (error) {
      if (__DEV__) console.warn('[MapScreen] schedule departure notification failed', error?.message);
      Alert.alert('Reminder failed', 'Could not schedule the reminder. Try again in a moment.');
    }
  }, []);

  const handleClearGuidance = useCallback(() => {
    mapRef.current?.clearGuidance?.();
    handleSheetModeChange('map', 0, snapHeights[0]);
  }, [handleSheetModeChange, snapHeights]);

  // Collapsed summary leads with OCCURRENCE risk (primary); falls back to the
  // severity summary only when occurrence is unavailable.
  const compactOccPct = currentOccurrence.data?.pct ?? null;
  const compactOccLevel = currentOccurrence.data?.level ?? null;
  const compactRiskColor = compactOccLevel
    ? getOccurrenceColor(compactOccLevel === 'medium' ? 'moderate' : compactOccLevel)
      || mapSnapshot.riskDisplay?.color || Colors.grey
    : (mapSnapshot.riskDisplay?.color || Colors.grey);
  const compactRiskPercent = compactOccPct != null
    ? `${Math.round(Number(compactOccPct))}%`
    : (mapSnapshot.riskDisplay?.pct != null ? `${Math.round(Number(mapSnapshot.riskDisplay.pct))}%` : '--');
  const compactRiskLabel = compactOccLevel
    ? `${compactOccLevel.charAt(0).toUpperCase()}${compactOccLevel.slice(1)} occurrence risk`
    : mapSnapshot.riskDisplay?.level
      ? `${mapSnapshot.riskDisplay.level.charAt(0).toUpperCase()}${mapSnapshot.riskDisplay.level.slice(1)} risk`
      : (mapSnapshot.currentRiskState === 'loading' || currentOccurrence.state === 'loading')
        ? 'Updating risk'
        : 'Current risk';

  const compactSheetContent = useMemo(() => {
    return (
      <View style={styles.compactSummaryWrap}>
        <Text style={styles.compactSummaryTitle}>Current occurrence risk</Text>
        <View style={styles.compactSummaryRow}>
          <View style={[styles.compactSummaryDot, { backgroundColor: compactRiskColor }]} />
          <Text style={[styles.compactSummaryPercent, { color: compactRiskColor }]}>{compactRiskPercent}</Text>
          <Text style={styles.compactSummaryLabel} numberOfLines={1}>{compactRiskLabel}</Text>
          {(mapSnapshot.currentRiskState === 'loading' || currentOccurrence.state === 'loading') ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
          {mapSnapshot.currentRiskState === 'error' ? <Ionicons name="alert-circle" size={16} color={Colors.error} /> : null}
        </View>
        <Text style={styles.compactSummaryHint}>Drag up for route, forecast, and context.</Text>
        {mapSnapshot.currentRiskState === 'error' && mapSnapshot.currentRiskError ? (
          <Text style={styles.compactSummaryError} numberOfLines={1}>{mapSnapshot.currentRiskError}</Text>
        ) : null}
      </View>
    );
  }, [compactRiskColor, compactRiskLabel, compactRiskPercent, currentOccurrence.state, mapSnapshot.currentRiskError, mapSnapshot.currentRiskState]);

  return (
    <View style={styles.container}>
      <MapCanvas
        ref={mapRef}
        style={styles.map}
        markers={filteredMarkers}
        mapLayer={mapLayer}
        tileLayer={mapStyle}
        onMarkerPress={setSelectedIncident}
        onSelectedTimestampChange={setSelectedTimestampIso}
        onSnapshotChange={setMapSnapshot}
        setSelectedIncident={setSelectedIncident}
        requestLocation={requestLocation}
        locationError={locationError}
        bottomInset={bottomSheetHeight + sheetBottomOffset}
        embeddedLayout
      />

      <FloatingMapControls
        displayMode={mapDisplayMode}
        mapLayer={mapLayer}
        layerOptions={LAYER_OPTIONS}
        onSetMapLayer={setMapLayer}
        hasActiveFilters={hasActiveFilters}
        onOpenFilters={() => setShowFilterSheet(true)}
        onOpenMapStyle={() => setShowMapStyleModal(true)}
        onReportIncident={() => navigation.navigate('ReportIncident')}
        destinationQuery={mapSnapshot.destinationQuery || ''}
        destinationResults={mapSnapshot.showSearchResults ? (mapSnapshot.destinationResults || []) : []}
        destinationSearchState={mapSnapshot.destinationSearchState || 'idle'}
        destinationSearchError={mapSnapshot.destinationSearchError || ''}
        selectedDestination={destination}
        selectedRoute={selectedRoute}
        selectedRouteType={selectedRouteType}
        guidanceActive={guidanceActive}
        isGuidanceBusy={Boolean(mapSnapshot.isGuidanceBusy)}
        onDestinationQueryChange={(text) => mapRef.current?.setDestinationQuery?.(text)}
        onDestinationFocus={() => mapRef.current?.setShowSearchResults?.(true)}
        onSelectDestination={(item) => mapRef.current?.selectDestination?.(item)}
        onClearDestination={() => mapRef.current?.clearDestination?.()}
        onStartGuidance={() => mapRef.current?.startGuidance?.()}
        onClearGuidance={handleClearGuidance}
        onOpenInfoMode={() => handleSheetModeChange('info', 2, snapHeights[2])}
      />

      <GuidanceBottomSheet
        displayMode={mapDisplayMode}
        snapHeights={snapHeights}
        onModeChange={handleSheetModeChange}
        onHeightChange={setBottomSheetHeight}
        compactContent={compactSheetContent}
        bottomOffset={sheetBottomOffset}
        contentBottomPadding={sheetContentBottomPadding}
      >
        {(selectedIncident?.loading || selectedIncident?.explanation) && selectedIncident?.kind !== 'report' ? (
          /* ── XAI segment explanation panel ── */
          <SegmentXaiPanel
            explanation={selectedIncident.explanation}
            loading={selectedIncident.loading}
            onClose={handleCloseXai}
          />
        ) : (
          /* ── Normal guidance content ── */
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{selectedRoute ? `${selectedRoute.route_label} guidance` : 'Route guidance'}</Text>
              <Text style={styles.sectionText}>
                {selectedRoute
                  ? `${destination?.full_name || destination?.name || 'Destination'} | ${selectedRoute.comparisonText}`
                  : 'Search a destination and request guidance to compare the fastest, safest, and balanced routes.'}
              </Text>
            </View>

            <GuidanceSearchSection
              destinationQuery={mapSnapshot.destinationQuery || ''}
              destinationResults={mapSnapshot.showSearchResults ? (mapSnapshot.destinationResults || []) : []}
              destinationSearchState={mapSnapshot.destinationSearchState || 'idle'}
              destinationSearchError={mapSnapshot.destinationSearchError || ''}
              guidedRouteError={mapSnapshot.guidedRouteError || ''}
              selectedDestination={destination}
              onDestinationQueryChange={(text) => mapRef.current?.setDestinationQuery?.(text)}
              onDestinationFocus={() => mapRef.current?.setShowSearchResults?.(true)}
              onSelectDestination={(item) => mapRef.current?.selectDestination?.(item)}
              onClearDestination={() => mapRef.current?.clearDestination?.()}
            />

            <GuidanceTimeControls
              presetKey={mapSnapshot.presetKey || '0'}
              customDate={mapSnapshot.customDate || ''}
              onSelectPreset={(value) => mapRef.current?.setTimePreset?.(value)}
              onChangeCustomDate={(value) => mapRef.current?.setCustomDate?.(value)}
            />

            <DepartureTimeCard
              origin={userPosition ? { lat: userPosition.lat, lng: userPosition.lng } : null}
              destination={destination}
              baselineTimestamp={selectedTimestampIso}
              onUseTime={handleUseDepartureTime}
              onScheduleNotification={handleScheduleDepartureNotification}
            />

            {!guidanceActive || mapDisplayMode === 'info' ? (
              <CurrentRiskSection
                riskDisplay={mapSnapshot.riskDisplay}
                occurrence={currentOccurrence.data}
                occurrenceState={currentOccurrence.state}
                severity={currentSeverity}
                currentRiskState={mapSnapshot.currentRiskState || 'idle'}
                currentRiskError={mapSnapshot.currentRiskError || ''}
                sentinelInfo={mapSnapshot.sentinelInfo}
                onExplain={handleExplainRisk}
              />
            ) : null}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.primaryBtn, (!destination || mapSnapshot.isGuidanceBusy) && styles.disabledBtn]}
                onPress={() => mapRef.current?.startGuidance?.()}
                disabled={!destination || mapSnapshot.isGuidanceBusy}
              >
                {mapSnapshot.isGuidanceBusy ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="navigate" size={16} color={Colors.white} />}
                <Text style={styles.primaryBtnText}>{guidanceActive ? 'Refresh guidance' : 'Start guidance'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleClearGuidance}>
                <Ionicons name="close" size={16} color={Colors.error} />
                <Text style={styles.secondaryBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>

            {guidanceActive && selectedRoute ? (
              <TouchableOpacity
                style={styles.fullMapBtn}
                onPress={() => navigation.navigate('FullNavigation', {
                  destination,
                  selectedRoute,
                  tileLayer: mapStyle,
                })}
                activeOpacity={0.8}
              >
                <Ionicons name="expand-outline" size={16} color={Colors.primary} />
                <Text style={styles.fullMapBtnText}>Open Full Navigation</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            ) : null}

            <RouteAlternativesList
              routes={mapSnapshot.guidedRoutes || []}
              selectedRouteType={selectedRouteType}
              onSelectRouteType={(type) => {
                setSelectedRouteType(type);
                mapRef.current?.setSelectedRouteType?.(type);
              }}
            />

            <RouteDetailsSection
              route={selectedRoute}
              sentinelInfo={mapSnapshot.sentinelInfo}
              mode={mapDisplayMode === 'info' ? 'info' : 'guidance'}
              onSegmentPress={(segment) => mapRef.current?.openSegmentExplanation?.(segment)}
              onExplainRoute={handleExplainRoute}
              routeExplanationState={routeExplanationState}
            />

            {mapDisplayMode === 'info' ? (
              <ForecastTabsSection
                forecastTab={forecastTab}
                onChangeTab={setForecastTab}
                forecastPoints={forecastPoints}
                forecastLoading={forecastLoading}
                userPosition={userPosition}
                weatherTemp={weatherTemp}
                weatherDesc={weatherDesc}
                weatherWind={weatherWind}
                weatherHumidity={weatherHumidity}
                weatherVisibility={weatherVisibility}
                weatherPressure={weatherPressure}
                weatherIconName={weatherIconName}
                trendingZones={TRENDING_ZONES}
                activeAlerts={ACTIVE_ALERTS}
                onManageAlerts={() => navigation.navigate('Alerts')}
              />
            ) : null}
          </>
        )}
      </GuidanceBottomSheet>

      <Modal visible={showFilterSheet} transparent animationType="slide" onRequestClose={() => setShowFilterSheet(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowFilterSheet(false)}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              {hasActiveFilters ? (
                <TouchableOpacity onPress={() => { setSeverityFilter([]); setTypeFilter([]); setSelectedWilaya(null); }}>
                  <Text style={styles.link}>Clear all</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.groupLabel}>Severity</Text>
            <View style={styles.chips}>
              {SEVERITY_OPTIONS.map((opt) => {
                const active = severityFilter.includes(opt.id);
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, active && { backgroundColor: opt.color, borderColor: opt.color }]}
                    onPress={() => setSeverityFilter((prev) => (
                      prev.includes(opt.id) ? prev.filter((v) => v !== opt.id) : [...prev, opt.id]
                    ))}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.groupLabel}>Type</Text>
            <View style={styles.chips}>
              {TYPE_OPTIONS.map((opt) => {
                const active = typeFilter.includes(opt.id);
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTypeFilter((prev) => (
                      prev.includes(opt.id) ? prev.filter((v) => v !== opt.id) : [...prev, opt.id]
                    ))}
                  >
                    <Ionicons name={opt.icon} size={14} color={active ? Colors.white : Colors.text} style={{ marginRight: 4 }} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.groupLabel}>Wilaya</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.wilayas}>
                {ALGERIA_WILAYAS.map((wilaya) => {
                  const active = selectedWilaya === wilaya.code;
                  return (
                    <TouchableOpacity
                      key={wilaya.code}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setSelectedWilaya(active ? null : wilaya.code)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{wilaya.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showMapStyleModal} transparent animationType="slide" onRequestClose={() => setShowMapStyleModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowMapStyleModal(false)}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Map style</Text>
            <View style={styles.styleGrid}>
              {MAP_STYLE_OPTIONS.map((opt) => {
                const active = mapStyle === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.styleCard, active && styles.styleCardActive]}
                    onPress={() => {
                      setMapStyle(opt.key);
                      setShowMapStyleModal(false);
                    }}
                  >
                    <Ionicons name={opt.icon} size={22} color={active ? Colors.primary : Colors.text} />
                    <Text style={styles.styleLabel}>{opt.label}</Text>
                    <Text style={styles.styleDesc}>{opt.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <RiskExplanationModal
        visible={riskExplanationVisible}
        state={riskExplanationState}
        data={riskExplanationData}
        error={riskExplanationError}
        onClose={() => setRiskExplanationVisible(false)}
        onRetry={handleExplainRisk}
      />

      <RouteExplanationModal
        visible={routeExplanationVisible}
        state={routeExplanationState}
        data={routeExplanationData}
        error={routeExplanationError}
        onClose={() => setRouteExplanationVisible(false)}
        onRetry={handleExplainRoute}
      />

      <DrivingQuiz visible={showQuiz} onClose={() => setShowQuiz(false)} />

      <ReportDetailsSheet
        report={selectedIncident?.kind === 'report' ? selectedIncident : null}
        visible={selectedIncident?.kind === 'report'}
        onClose={() => setSelectedIncident(null)}
      />

      <Modal visible={!!selectedIncident && selectedIncident?.kind !== 'report' && !selectedIncident?.explanation && !selectedIncident?.loading} transparent animationType="slide" onRequestClose={() => setSelectedIncident(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelectedIncident(null)}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            <View style={styles.incidentBadgeRow}>
              <View
                style={[
                  styles.incidentBadge,
                  {
                    borderColor: severityColor(selectedIncident?.severity),
                    backgroundColor: `${severityColor(selectedIncident?.severity)}22`,
                  },
                ]}
              >
                <Text style={[styles.incidentBadgeText, { color: severityColor(selectedIncident?.severity) }]}>
                  {(selectedIncident?.severity || 'info').toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.modalTitle}>{selectedIncident?.title || 'Incident'}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  map: { flex: 1 },
  compactSummaryWrap: {
    gap: 8,
    paddingTop: 2,
  },
  compactSummaryTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  compactSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
  },
  compactSummaryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  compactSummaryPercent: {
    fontSize: 18,
    fontWeight: '800',
  },
  compactSummaryLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.heading,
  },
  compactSummaryHint: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.subtext,
  },
  compactSummaryError: {
    fontSize: 11,
    color: Colors.error,
  },
  section: { gap: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.heading },
  sectionText: { fontSize: 12, lineHeight: 18, color: Colors.subtext },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: Colors.btnPrimary },
  disabledBtn: { opacity: 0.45 },
  primaryBtnText: { color: Colors.white, fontSize: 13, fontWeight: '800' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(220,38,38,0.18)', backgroundColor: 'rgba(220,38,38,0.06)' },
  secondaryBtnText: { color: Colors.error, fontSize: 13, fontWeight: '800' },
  fullMapBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(122,61,240,0.22)', backgroundColor: 'rgba(122,61,240,0.06)' },
  fullMapBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.36)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24, gap: 12 },
  modalCardXai: { maxHeight: '72%' },
  modalCardTall: { maxHeight: '74%' },
  handle: { alignSelf: 'center', width: 52, height: 6, borderRadius: 999, backgroundColor: '#CBD5E1', marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitleWrap: { flex: 1, paddingRight: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.heading },
  modalSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 17, color: Colors.subtext },
  closeIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  explainStateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: 14,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  explainStateError: {
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderColor: 'rgba(220,38,38,0.18)',
  },
  explainStateText: { flex: 1, fontSize: 12, lineHeight: 18, color: Colors.subtext },
  explainStateErrorText: { color: Colors.error },
  retryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retryChipText: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  fallbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.28)',
  },
  fallbackBannerText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  explanationText: { fontSize: 13, lineHeight: 20, color: Colors.text },
  explanationScroll: { gap: 12, paddingBottom: 8 },
  comparisonBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  comparisonTitle: { fontSize: 12, fontWeight: '800', color: Colors.heading, marginBottom: 4 },
  comparisonText: { fontSize: 12, lineHeight: 18, color: Colors.text },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  reasonDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  reasonText: { flex: 1, fontSize: 12, lineHeight: 18, color: Colors.text },
  link: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  groupLabel: { fontSize: 13, fontWeight: '800', color: Colors.heading },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  chipTextActive: { color: Colors.white },
  wilayas: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  styleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  styleCard: { width: '48%', padding: 14, borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border },
  styleCardActive: { borderColor: Colors.primary, backgroundColor: '#F3EEFF' },
  styleLabel: { marginTop: 10, fontSize: 13, fontWeight: '800', color: Colors.heading },
  styleDesc: { marginTop: 3, fontSize: 12, color: Colors.subtext },
  incidentBadgeRow: { flexDirection: 'row' },
  incidentBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  incidentBadgeText: { fontSize: 11, fontWeight: '800' },
});
