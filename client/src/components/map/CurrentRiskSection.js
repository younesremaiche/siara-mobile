import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';

// Occurrence is the primary signal; severity (multiclass model) is secondary
// detail. The old danger-zone model is not used here.
const SEVERITY_BAR_COLORS = { 1: '#22c55e', 2: '#f59e0b', 3: '#f97316', 4: '#ef4444' };

// The occurrence hook normalises levels to low / medium / high / critical.
function occLevelColor(level) {
  const l = String(level || '').toLowerCase();
  if (l === 'critical' || l === 'extreme') return '#ef4444';
  if (l === 'high') return '#f97316';
  if (l === 'medium' || l === 'moderate') return '#f59e0b';
  if (l === 'low') return '#22c55e';
  return Colors.grey;
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function capitalize(value) {
  const text = String(value || '');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
}

function SentinelNotice({ sentinelInfo, compact = false }) {
  if (!sentinelInfo?.hasSentinel) return null;

  const notes = [...(sentinelInfo.reasons || []), ...(sentinelInfo.fallbackDetails || [])].slice(0, compact ? 1 : 4);

  return (
    <View style={[styles.noticeCard, compact && styles.noticeCardCompact]}>
      <View style={styles.noticeHeader}>
        <Ionicons name="warning-outline" size={14} color={Colors.warning} />
        <Text style={styles.noticeTitle}>Data quality notice</Text>
      </View>
      {sentinelInfo.bannerTitle ? <Text style={styles.noticeLead}>{sentinelInfo.bannerTitle}</Text> : null}
      {notes.map((note) => (
        <Text key={note} style={styles.noticeText}>- {note}</Text>
      ))}
    </View>
  );
}

function OccurrenceRow({ label, sub, pct, levelLabel, level, muted = false }) {
  const color = level ? occLevelColor(level) : Colors.subtext;
  return (
    <View style={styles.occRow}>
      <View style={styles.occRowLabel}>
        <Text style={styles.occRowName}>{label}</Text>
        <Text style={styles.occRowSub}>{sub}</Text>
      </View>
      <View style={styles.occRowTrack}>
        <View style={[styles.occRowFill, { width: `${Math.max(clampPercent(pct), 2)}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.occRowRight}>
        <Text style={[styles.occRowPct, { color: muted ? Colors.subtext : color }]}>
          {pct == null ? '—' : `${Math.round(pct)}%`}
        </Text>
        {levelLabel ? (
          <Text style={[styles.occLevelChip, { color, backgroundColor: `${color}22` }]}>
            {String(levelLabel).toUpperCase()}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function CurrentRiskSection({
  riskDisplay,
  occurrence = null,
  occurrenceState = 'idle',
  severity = null,
  currentRiskState = 'idle',
  currentRiskError = '',
  sentinelInfo,
  onExplain,
  compact = false,
}) {
  const hasOccurrence = Boolean(
    occurrence && (occurrence.modelPct != null || occurrence.personalizedPct != null),
  );

  // Headline: personalized-when-applied-else-model occurrence, falling back to
  // the severity summary only when occurrence is unavailable.
  const headlinePct = hasOccurrence ? occurrence.pct : (riskDisplay?.pct ?? null);
  const headlineLevel = hasOccurrence ? occurrence.level : (riskDisplay?.level ?? null);
  const headlineColor = hasOccurrence
    ? occLevelColor(occurrence.level)
    : (riskDisplay?.color || Colors.grey);

  const isLoading = currentRiskState === 'loading' || occurrenceState === 'loading';

  if (
    !riskDisplay && !hasOccurrence
    && currentRiskState === 'idle' && occurrenceState === 'idle'
    && !currentRiskError
  ) {
    return null;
  }

  // Severity (secondary) — from the multiclass model via /api/risk/current.
  const sevProbs = severity?.severity_probabilities || null;
  const sevRows = sevProbs
    ? [1, 2, 3, 4]
      .map((k) => ({ k, value: Number(sevProbs[`severity_${k}`]) }))
      .filter((r) => Number.isFinite(r.value))
    : [];
  const mostLikely = severity?.most_likely_severity ?? null;
  const expectedSev = severity?.expected_severity ?? null;
  const severePct = severity?.danger_percent ?? null;
  const hasSeverity = sevRows.length > 0 || mostLikely != null || expectedSev != null || severePct != null;

  if (compact) {
    return (
      <View style={[styles.card, styles.cardCompact]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={[styles.indicator, { backgroundColor: headlineColor }]} />
            <Text style={styles.title}>Current Occurrence Risk</Text>
            {isLoading ? <ActivityIndicator size="small" color={Colors.primary} style={styles.inlineState} /> : null}
          </View>
        </View>
        <View style={styles.metricRowCompact}>
          <View style={styles.metricGroup}>
            <Text style={[styles.percent, { color: headlineColor }]}>
              {headlinePct != null ? `${Math.round(headlinePct)}%` : '--'}
            </Text>
            <Text style={styles.level}>{headlineLevel ? capitalize(headlineLevel) : 'Unknown'}</Text>
          </View>
          <Text style={styles.compactHint}>Drag up for model, personalized, and severity detail.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.indicator, { backgroundColor: headlineColor }]} />
          <Text style={styles.title}>Current Occurrence Risk</Text>
          {isLoading ? <ActivityIndicator size="small" color={Colors.primary} style={styles.inlineState} /> : null}
          {currentRiskState === 'error' ? <Ionicons name="alert-circle" size={16} color={Colors.error} style={styles.inlineState} /> : null}
        </View>
        {onExplain ? (
          <TouchableOpacity style={styles.explainBtn} onPress={onExplain}>
            <Ionicons name="bulb-outline" size={15} color={Colors.primary} />
            <Text style={styles.explainText}>Why?</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* PRIMARY: occurrence (model + personalized) */}
      {hasOccurrence ? (
        <View style={styles.occCard}>
          <View style={styles.occHeadRow}>
            <Text style={styles.occKicker}>OCCURRENCE RISK</Text>
            <Text style={styles.occHint}>accident likelihood · your area</Text>
          </View>
          {occurrence.modelPct != null ? (
            <OccurrenceRow
              label="Model"
              sub="road · time · weather"
              pct={occurrence.modelPct}
              levelLabel={occurrence.modelLevelLabel}
              level={occurrence.modelLevel}
            />
          ) : null}
          {occurrence.personalizedPct != null ? (
            <OccurrenceRow
              label="Personalized"
              sub={occurrence.driverQuizApplied ? '+ your driver quiz' : 'no quiz taken'}
              pct={occurrence.personalizedPct}
              levelLabel={occurrence.driverQuizApplied ? occurrence.personalizedLevelLabel : null}
              level={occurrence.personalizedLevel}
              muted={!occurrence.driverQuizApplied}
            />
          ) : null}
          {occurrence.driverQuizApplied && occurrence.behaviorDeltaPct != null ? (
            <View style={styles.occDelta}>
              <Ionicons
                name={occurrence.behaviorDeltaPct >= 0 ? 'trending-up' : 'trending-down'}
                size={13}
                color={occurrence.behaviorDeltaPct >= 0 ? '#dc2626' : '#16a34a'}
              />
              <Text style={styles.occDeltaText}>
                {`${occurrence.behaviorDeltaPct >= 0 ? '+' : ''}${Number(occurrence.behaviorDeltaPct).toFixed(1)}% vs model`}
                {occurrence.driverRiskScore != null ? ` — driver quiz ${Math.round(Number(occurrence.driverRiskScore))}/100` : ''}
              </Text>
            </View>
          ) : (!occurrence.driverQuizApplied && occurrence.personalizedPct != null ? (
            <Text style={styles.occNote}>No driver quiz profile, so personalized risk matches the model.</Text>
          ) : null)}
        </View>
      ) : occurrenceState === 'loading' ? (
        <View style={styles.occUnavailable}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.occUnavailableText}>Estimating occurrence risk for your location…</Text>
        </View>
      ) : (
        <View style={styles.occUnavailable}>
          <Ionicons name="information-circle-outline" size={15} color={Colors.subtext} />
          <Text style={styles.occUnavailableText}>Occurrence risk is unavailable for your current location.</Text>
        </View>
      )}

      {/* SECONDARY: severity detail (multiclass model) */}
      {hasSeverity ? (
        <View style={styles.sevCard}>
          <View style={styles.sevHeadRow}>
            <View style={styles.sevTag}>
              <Text style={styles.sevTagText}>SEVERITY DETAIL</Text>
            </View>
            <Text style={styles.occHint}>if an accident occurs</Text>
          </View>
          {sevRows.map((r) => (
            <View key={r.k} style={styles.sevRow}>
              <Text style={styles.sevName}>Severity {r.k}</Text>
              <View style={styles.sevTrack}>
                <View style={[styles.sevFill, { width: `${clampPercent(r.value)}%`, backgroundColor: SEVERITY_BAR_COLORS[r.k] }]} />
              </View>
              <Text style={styles.sevVal}>{Math.round(r.value)}%</Text>
            </View>
          ))}
          <View style={styles.sevFootRow}>
            {mostLikely != null ? (
              <View style={styles.sevBox}>
                <Text style={styles.sevBoxLabel}>Most likely</Text>
                <Text style={styles.sevBoxValue}>Severity {mostLikely}</Text>
              </View>
            ) : null}
            {expectedSev != null ? (
              <View style={styles.sevBox}>
                <Text style={styles.sevBoxLabel}>Expected</Text>
                <Text style={styles.sevBoxValue}>{Number(expectedSev).toFixed(2)}</Text>
              </View>
            ) : null}
            {severePct != null ? (
              <View style={styles.sevBox}>
                <Text style={styles.sevBoxLabel}>Severe (S3+S4)</Text>
                <Text style={styles.sevBoxValue}>{Math.round(severePct)}%</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {currentRiskError ? (
        <Text style={styles.errorText}>{currentRiskError}</Text>
      ) : (
        <Text style={styles.helperText}>
          Occurrence likelihood for your current area and time; severity shows how serious a crash could be.
        </Text>
      )}

      <SentinelNotice sentinelInfo={sentinelInfo} compact={compact} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  cardCompact: {
    paddingVertical: 12,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  indicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.heading,
  },
  inlineState: {
    marginLeft: 8,
  },
  explainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  explainText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Compact headline
  metricRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  percent: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.heading,
  },
  level: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.subtext,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.subtext,
  },
  compactHint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.subtext,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.error,
  },

  // Occurrence (primary) card
  occCard: {
    backgroundColor: 'rgba(124,58,237,0.05)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.22)',
    gap: 11,
  },
  occHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  occKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: Colors.primary },
  occHint: { fontSize: 11, color: Colors.subtext },
  occRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  occRowLabel: { width: 110 },
  occRowName: { fontSize: 12, fontWeight: '800', color: Colors.heading },
  occRowSub: { fontSize: 10, color: Colors.subtext, marginTop: 1 },
  occRowTrack: { flex: 1, height: 9, borderRadius: 999, backgroundColor: Colors.white, overflow: 'hidden' },
  occRowFill: { height: '100%', borderRadius: 999 },
  occRowRight: { width: 80, alignItems: 'flex-end' },
  occRowPct: { fontSize: 16, fontWeight: '900' },
  occLevelChip: {
    fontSize: 8, fontWeight: '800', marginTop: 2,
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999, overflow: 'hidden',
  },
  occDelta: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: Colors.border,
  },
  occDeltaText: { flex: 1, fontSize: 11, lineHeight: 15, color: Colors.text },
  occNote: { fontSize: 11, lineHeight: 15, color: Colors.subtext },
  occUnavailable: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  occUnavailableText: { flex: 1, fontSize: 12, color: Colors.subtext },

  // Severity (secondary) card
  sevCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 7,
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

  // Data-quality notice
  noticeCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.24)',
    gap: 4,
  },
  noticeCardCompact: {
    paddingVertical: 10,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noticeTitle: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800',
    color: Colors.heading,
  },
  noticeLead: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  noticeText: {
    fontSize: 11,
    lineHeight: 16,
    color: Colors.text,
  },
});
