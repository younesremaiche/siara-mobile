import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import useDepartureOptions from '../../hooks/useDepartureOptions';

// "Best time to leave" card.
// Renders the approved mockup: horizontal slot strip, recommended highlight,
// reasoning row, two actions (Notify me + Use this time). Empty/loading/error
// states all live here so the parent screen just renders <DepartureTimeCard />
// without state plumbing.

const SEVERITY_COLORS = {
  low: Colors.severityLow,
  medium: Colors.severityMedium,
  high: Colors.severityHigh,
  critical: Colors.severityCritical,
};

function formatDelta(targetIso, baselineIso) {
  if (!targetIso) return null;
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return null;
  const baseline = baselineIso ? new Date(baselineIso) : new Date();
  const deltaMin = Math.round((target.getTime() - baseline.getTime()) / 60_000);
  if (deltaMin <= 1) return 'now';
  if (deltaMin < 60) return `in ${deltaMin} min`;
  const hours = Math.floor(deltaMin / 60);
  const minutes = deltaMin - hours * 60;
  return minutes ? `in ${hours}h ${minutes}m` : `in ${hours} h`;
}

function Slot({ slot, onPress }) {
  const color = SEVERITY_COLORS[slot.severity] || Colors.severityMedium;
  const barWidthPct = Math.max(8, Math.min(100, slot.riskPct));
  return (
    <TouchableOpacity
      onPress={() => onPress?.(slot)}
      activeOpacity={0.8}
      style={[
        styles.slot,
        slot.isRecommended && styles.slotRecommended,
      ]}
    >
      {slot.isRecommended ? (
        <View style={styles.slotPill}>
          <Text style={styles.slotPillText}>RECOMMENDED</Text>
        </View>
      ) : null}
      <Text style={[styles.slotWhen, slot.isRecommended && styles.slotWhenRec]} numberOfLines={1}>
        {slot.when}
      </Text>
      <Text style={[styles.slotPct, { color }]} numberOfLines={1}>{Math.round(slot.riskPct)}%</Text>
      <View style={styles.slotBarTrack}>
        <View style={[styles.slotBarFill, { width: `${barWidthPct}%`, backgroundColor: color }]} />
      </View>
    </TouchableOpacity>
  );
}

function HeaderBar({ destinationName }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerIcon}>
        <Ionicons name="time-outline" size={20} color={Colors.primary} />
      </View>
      <View style={styles.headerBody}>
        <Text style={styles.headerTitle}>Best time to leave</Text>
        <Text style={styles.headerSub} numberOfLines={2}>
          {destinationName
            ? `Safer departure windows for ${destinationName}.`
            : 'Safer departure windows for your destination.'}
        </Text>
      </View>
    </View>
  );
}

function Recommendation({ recommendation, recommendedSlot, baselineTimestamp }) {
  if (!recommendation || !recommendedSlot) return null;

  const delta = formatDelta(recommendedSlot.timestamp, baselineTimestamp);
  const bestPct = Math.round(recommendation.bestPct);

  if (recommendation.leaveNowBest) {
    return (
      <View style={styles.reco}>
        <View style={styles.recoDot}>
          <Ionicons name="checkmark" size={12} color={Colors.white} />
        </View>
        <View style={styles.recoBody}>
          <Text style={styles.recoTitle}>Leave now — best window</Text>
          <Text style={styles.recoText}>
            Risk climbs over the next few hours. Heading out now keeps the route at{' '}
            <Text style={styles.recoEmph}>{bestPct}%</Text> versus up to {Math.round(recommendation.worstPct)}% later.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.reco}>
      <View style={styles.recoDot}>
        <Ionicons name="checkmark" size={12} color={Colors.white} />
      </View>
      <View style={styles.recoBody}>
        <Text style={styles.recoTitle}>
          Leave at {recommendedSlot.when}
          {delta ? ` (${delta})` : ''}
        </Text>
        <Text style={styles.recoText}>
          Cuts route risk from <Text style={styles.recoEmph}>{Math.round(recommendation.worstPct)}%</Text>
          {' → '}
          <Text style={styles.recoEmph}>{bestPct}%</Text>.
          {recommendedSlot.reasoning ? ` ${recommendedSlot.reasoning}` : ''}
        </Text>
      </View>
    </View>
  );
}

function SimilarBanner() {
  return (
    <View style={styles.similarBanner}>
      <Ionicons name="warning-outline" size={14} color="#92400E" />
      <Text style={styles.similarText}>
        Risk is consistent across the next few hours — pick whichever time fits your plans.
      </Text>
    </View>
  );
}

function ActionsRow({ showNotify, onNotify, onUseTime, busyNotify }) {
  return (
    <View style={styles.actions}>
      {showNotify ? (
        <TouchableOpacity
          onPress={onNotify}
          disabled={busyNotify}
          style={[styles.actionBtn, busyNotify && styles.actionBtnDisabled]}
          activeOpacity={0.8}
        >
          {busyNotify ? (
            <ActivityIndicator size="small" color={Colors.text} />
          ) : (
            <Ionicons name="notifications-outline" size={14} color={Colors.text} />
          )}
          <Text style={styles.actionBtnText}>Notify me</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={onUseTime}
        style={[styles.actionBtn, styles.actionBtnPrimary]}
        activeOpacity={0.85}
      >
        <Ionicons name="navigate-outline" size={14} color={Colors.white} />
        <Text style={[styles.actionBtnText, styles.actionBtnPrimaryText]}>Use this time</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyIdleState() {
  return (
    <View style={[styles.card, styles.emptyCard]}>
      <View style={styles.emptyBubble}>
        <Ionicons name="flag-outline" size={24} color={Colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>Best time to leave</Text>
      <Text style={styles.emptyText}>
        Choose a destination to compare safer departure times.
      </Text>
    </View>
  );
}

export default function DepartureTimeCard({
  origin,
  destination,
  baselineTimestamp,
  enabled = true,
  onUseTime,
  onScheduleNotification,
  style,
}) {
  const hasOrigin = Number.isFinite(Number(origin?.lat)) && Number.isFinite(Number(origin?.lng));
  const hasDestination = Number.isFinite(Number(destination?.lat)) && Number.isFinite(Number(destination?.lng));

  const { data, state, error, retry } = useDepartureOptions({
    origin,
    destination,
    baselineTimestamp,
    enabled: enabled && hasOrigin && hasDestination,
  });

  const [selectedTimestamp, setSelectedTimestamp] = useState(null);
  const [busyNotify, setBusyNotify] = useState(false);

  const slots = data?.slots || [];
  const recommendation = data?.recommendation || null;

  const effectiveSlot = useMemo(() => {
    if (!slots.length) return null;
    if (selectedTimestamp) {
      const match = slots.find((slot) => slot.timestamp === selectedTimestamp);
      if (match) return match;
    }
    return slots.find((slot) => slot.isRecommended) || slots[0];
  }, [selectedTimestamp, slots]);

  if (!hasOrigin || !hasDestination) {
    return <EmptyIdleState />;
  }

  const handleSlot = (slot) => setSelectedTimestamp(slot.timestamp);
  const handleUseTime = () => {
    if (effectiveSlot?.timestamp && onUseTime) onUseTime(effectiveSlot.timestamp);
  };
  const handleNotify = async () => {
    if (!effectiveSlot?.timestamp || !onScheduleNotification) return;
    setBusyNotify(true);
    try {
      await onScheduleNotification({
        timestamp: effectiveSlot.timestamp,
        destinationName: destination?.name || destination?.full_name,
        riskPct: effectiveSlot.riskPct,
      });
    } finally {
      setBusyNotify(false);
    }
  };

  const showNotify = recommendation && !recommendation.leaveNowBest;

  return (
    <View style={[styles.card, style]}>
      <HeaderBar destinationName={destination?.name || destination?.full_name} />

      {state === 'loading' && !data ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>Comparing the next few hours…</Text>
        </View>
      ) : state === 'error' ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={Colors.error} />
          <Text style={styles.errorText} numberOfLines={3}>
            {error || 'Departure-time service is unreachable. Main route is still scored normally.'}
          </Text>
          <TouchableOpacity onPress={retry} style={styles.retryBtn} activeOpacity={0.7}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : state === 'empty' || (!slots.length && state === 'success') ? (
        <View style={styles.loadingRow}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.subtext} />
          <Text style={styles.loadingText}>No departure-time data for this route yet.</Text>
        </View>
      ) : data ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.slotRow}
          >
            {slots.map((slot) => (
              <Slot
                key={slot.timestamp}
                slot={selectedTimestamp ? { ...slot, isRecommended: slot.timestamp === selectedTimestamp } : slot}
                onPress={handleSlot}
              />
            ))}
          </ScrollView>

          {recommendation?.allSimilar ? (
            <SimilarBanner />
          ) : (
            <Recommendation
              recommendation={recommendation}
              recommendedSlot={effectiveSlot}
              baselineTimestamp={baselineTimestamp}
            />
          )}

          <ActionsRow
            showNotify={showNotify}
            onNotify={handleNotify}
            onUseTime={handleUseTime}
            busyNotify={busyNotify}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
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
  headerTitle: { fontSize: 14, fontWeight: '800', color: Colors.heading },
  headerSub: { fontSize: 11, color: Colors.subtext, lineHeight: 16 },

  // Slot strip
  slotRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 8,
  },
  slot: {
    minWidth: 78,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 12,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    position: 'relative',
  },
  slotRecommended: {
    borderColor: Colors.severityLow,
    backgroundColor: 'rgba(34,197,94,0.06)',
    shadowColor: Colors.severityLow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  slotPill: {
    position: 'absolute',
    top: -8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  slotPillText: {
    backgroundColor: Colors.severityLow,
    color: Colors.white,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  slotWhen: { fontSize: 11, fontWeight: '700', color: Colors.subtext, marginBottom: 4, letterSpacing: 0.4 },
  slotWhenRec: { color: '#15803D' },
  slotPct: { fontSize: 18, fontWeight: '800', lineHeight: 20 },
  slotBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.bg,
    width: '100%',
    marginTop: 8,
    overflow: 'hidden',
  },
  slotBarFill: { height: '100%', borderRadius: 2 },

  // Recommendation
  reco: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: Colors.border,
    backgroundColor: 'rgba(34,197,94,0.04)',
  },
  recoDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.severityLow,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  recoBody: { flex: 1 },
  recoTitle: { fontSize: 13, fontWeight: '800', color: Colors.heading },
  recoText: { fontSize: 12, color: Colors.subtext, lineHeight: 17, marginTop: 2 },
  recoEmph: { color: Colors.severityLow, fontWeight: '800' },

  // Similar banner
  similarBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.28)',
  },
  similarText: { flex: 1, fontSize: 11, color: '#92400E', lineHeight: 16 },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  actionBtnPrimaryText: { color: Colors.white },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  loadingText: { fontSize: 12, color: Colors.subtext },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.18)',
  },
  errorText: { flex: 1, fontSize: 12, color: Colors.error, lineHeight: 17 },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.30)',
  },
  retryBtnText: { fontSize: 11, fontWeight: '800', color: Colors.error },

  // Empty (no destination)
  emptyCard: { alignItems: 'center', paddingHorizontal: 18, paddingVertical: 22 },
  emptyBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.violetLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: Colors.heading, marginBottom: 4 },
  emptyText: { fontSize: 12, color: Colors.subtext, lineHeight: 17, textAlign: 'center' },
});
