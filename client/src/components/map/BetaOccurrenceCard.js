import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import useOccurrenceRisk, { OCCURRENCE_HORIZONS, OCCURRENCE_PROVIDERS } from '../../hooks/useOccurrenceRisk';
import { OCCURRENCE_BETA_DISCLAIMER } from '../../services/occurrenceRiskService';

// Renders the approved beta-occurrence card. Stays clearly distinct from the
// primary risk card via dashed border + permanent BETA pill + always-visible
// yellow disclaimer footer.

const LEVEL_COLORS = {
  low: Colors.severityLow,
  medium: Colors.severityMedium,
  high: Colors.severityHigh,
  critical: Colors.severityCritical,
};

const GAUGE_SIZE = 96;
const GAUGE_STROKE = 8;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function Gauge({ pct, color }) {
  const safePct = Number.isFinite(Number(pct)) ? Math.max(0, Math.min(100, Number(pct))) : 0;
  const offset = GAUGE_CIRCUMFERENCE * (1 - safePct / 100);
  return (
    <View style={styles.gaugeWrap}>
      <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
        <Circle
          cx={GAUGE_SIZE / 2}
          cy={GAUGE_SIZE / 2}
          r={GAUGE_RADIUS}
          stroke={Colors.bg}
          strokeWidth={GAUGE_STROKE}
          fill="none"
        />
        <Circle
          cx={GAUGE_SIZE / 2}
          cy={GAUGE_SIZE / 2}
          r={GAUGE_RADIUS}
          stroke={color}
          strokeWidth={GAUGE_STROKE}
          fill="none"
          strokeDasharray={`${GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.gaugeInner} pointerEvents="none">
        <Text style={[styles.gaugePct, { color }]} numberOfLines={1}>
          {Number.isFinite(Number(pct)) ? `${Math.round(pct)}%` : '--'}
        </Text>
        <Text style={styles.gaugeLbl}>Occurrence</Text>
      </View>
    </View>
  );
}

function HeaderBar() {
  return (
    <View style={styles.header}>
      <View style={styles.headerIcon}>
        <Ionicons name="flask-outline" size={20} color={Colors.primary} />
      </View>
      <View style={styles.headerBody}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Accident occurrence</Text>
          <View style={styles.betaPill}>
            <Text style={styles.betaPillText}>BETA</Text>
          </View>
        </View>
        <Text style={styles.headerSub}>
          Probability that an accident occurs near this point inside the selected horizon.
        </Text>
      </View>
    </View>
  );
}

function HorizonTabs({ horizonKey, onChange }) {
  return (
    <View style={styles.horizonRow}>
      {OCCURRENCE_HORIZONS.map((opt) => {
        const active = opt.key === horizonKey;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.horizonTab, active && styles.horizonTabActive]}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.horizonTabText, active && styles.horizonTabTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StatChip({ label, value }) {
  if (value == null) return null;
  return (
    <View style={styles.statChip}>
      <Text style={styles.statChipLabel}>{label}</Text>
      <Text style={styles.statChipValue}>{value}</Text>
    </View>
  );
}

function ProviderPill({ providerKey, onToggle }) {
  const isAlt = providerKey === 'alt';
  const label = OCCURRENCE_PROVIDERS[providerKey]?.label || '';
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={[styles.providerPill, isAlt ? styles.providerPillAlt : styles.providerPillPrimary]}
    >
      <Text
        style={[
          styles.providerPillText,
          isAlt ? styles.providerPillTextAlt : styles.providerPillTextPrimary,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DisclaimerFooter() {
  return (
    <View style={styles.footer}>
      <View style={styles.footerIcon}>
        <Ionicons name="warning" size={14} color="#92400E" />
      </View>
      <View style={styles.footerBody}>
        <Text style={styles.footerTitle}>Experimental forecast</Text>
        <Text style={styles.footerText}>{OCCURRENCE_BETA_DISCLAIMER}</Text>
      </View>
    </View>
  );
}

function formatRelative(timestampIso) {
  if (!timestampIso) return null;
  const date = new Date(timestampIso);
  if (Number.isNaN(date.getTime())) return null;
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function formatConfidence(value) {
  if (value == null) return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? `${n}%` : null;
}

export default function BetaOccurrenceCard({
  lat,
  lng,
  timestamp,
  enabled = true,
  style,
}) {
  const {
    data,
    state,
    error,
    horizonKey,
    setHorizonKey,
    providerKey,
    setProviderKey,
    retry,
  } = useOccurrenceRisk({ lat, lng, timestamp, enabled });

  const level = data?.level || 'low';
  const color = LEVEL_COLORS[level] || Colors.subtext;
  const updatedLabel = useMemo(() => formatRelative(data?.updatedAt), [data?.updatedAt]);

  const toggleProvider = () => setProviderKey((prev) => (prev === 'primary' ? 'alt' : 'primary'));

  return (
    <View style={[styles.card, style]}>
      <HeaderBar />

      <View style={styles.body}>
        <HorizonTabs horizonKey={horizonKey} onChange={setHorizonKey} />

        {state === 'loading' && !data ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>Asking the experimental model…</Text>
          </View>
        ) : state === 'unavailable' ? (
          <View style={styles.unavailableBox}>
            <Ionicons name="cloud-offline-outline" size={16} color={Colors.subtext} />
            <Text style={styles.unavailableText}>
              Occurrence forecasting isn’t enabled on this backend yet.
            </Text>
          </View>
        ) : state === 'error' ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={styles.errorText} numberOfLines={3}>
              {error || 'Couldn’t reach the occurrence model. Main risk score is unaffected.'}
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={retry} activeOpacity={0.7}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <>
            <View style={styles.metricRow}>
              <Gauge pct={data.pct} color={color} />
              <View style={styles.metricBody}>
                <Text style={[styles.metricLabel, { color }]}>{data.label}</Text>
                <Text style={styles.metricNarrative} numberOfLines={4}>{data.narrative}</Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <StatChip label="Model confidence" value={formatConfidence(data.confidence)} />
              <StatChip label="Samples" value={data.samples != null ? String(data.samples) : null} />
            </View>

            <View style={styles.providerRow}>
              <ProviderPill providerKey={providerKey} onToggle={toggleProvider} />
              {updatedLabel ? (
                <View style={styles.providerMetaRow}>
                  <Ionicons name="time-outline" size={11} color={Colors.greyLight} />
                  <Text style={styles.providerMetaText}>{updatedLabel}</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>No occurrence forecast for this point.</Text>
        )}
      </View>

      <DisclaimerFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.violetBorder,
    overflow: 'hidden',
  },
  // ── Header ──
  header: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: Colors.violetLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.violetBorder,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: { flex: 1, gap: 2 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 14, fontWeight: '800', color: Colors.heading },
  betaPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  betaPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: Colors.white,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.subtext,
    lineHeight: 16,
  },

  // ── Body ──
  body: { padding: 14, gap: 12 },

  // Horizon tabs
  horizonRow: { flexDirection: 'row', gap: 6 },
  horizonTab: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: 'center',
  },
  horizonTabActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.violetLight,
  },
  horizonTabText: { fontSize: 11, fontWeight: '700', color: Colors.text },
  horizonTabTextActive: { color: Colors.primary },

  // Loading + empty + error
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { fontSize: 12, color: Colors.subtext },
  emptyText: { fontSize: 12, color: Colors.subtext, paddingVertical: 8 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.18)',
  },
  errorText: { flex: 1, fontSize: 12, color: Colors.error, lineHeight: 17 },
  unavailableBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: Colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unavailableText: { flex: 1, fontSize: 12, color: Colors.subtext, lineHeight: 17 },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.30)',
  },
  retryBtnText: { fontSize: 11, fontWeight: '800', color: Colors.error },

  // Metric row (gauge + body)
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  gaugeWrap: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugePct: { fontSize: 22, fontWeight: '800', lineHeight: 24 },
  gaugeLbl: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.subtext,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  metricBody: { flex: 1, gap: 6 },
  metricLabel: { fontSize: 14, fontWeight: '800' },
  metricNarrative: { fontSize: 12, lineHeight: 17, color: Colors.subtext },

  // Stat chips
  statRow: { flexDirection: 'row', gap: 6 },
  statChip: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: Colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statChipLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.subtext,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statChipValue: { fontSize: 13, fontWeight: '800', color: Colors.heading, marginTop: 2 },

  // Provider row
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  providerPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '70%',
  },
  providerPillPrimary: {
    backgroundColor: Colors.blueLight,
    borderColor: Colors.blueBorder,
  },
  providerPillAlt: {
    backgroundColor: Colors.violetLight,
    borderColor: Colors.violetBorder,
  },
  providerPillText: { fontSize: 10, fontWeight: '700' },
  providerPillTextPrimary: { color: Colors.secondary },
  providerPillTextAlt: { color: Colors.primary },
  providerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  providerMetaText: { fontSize: 10, color: Colors.greyLight },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFBEB',
    borderTopWidth: 1,
    borderTopColor: 'rgba(245,158,11,0.30)',
  },
  footerIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBody: { flex: 1 },
  footerTitle: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  footerText: { fontSize: 11, color: '#78350F', lineHeight: 16, marginTop: 2 },
});
