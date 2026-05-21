import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';

// Visual layer for /api/navigation/route-alerts. Receives normalised alerts
// from useRouteAlerts and renders the mocked-up banner stack:
//   - top alert at full width
//   - second alert as a compact card
//   - any remaining alerts collapsed into a "+N more" chip
//   - clear-road pill when the list is empty
//   - amber retry banner when state === 'offline'
//
// Critical alerts pulse using a single Animated.Value so we don't run an
// animation per card.

const SEVERITY = {
  low: {
    icon: 'shield-checkmark-outline',
    stripe: Colors.severityLow,
    iconBg: 'rgba(34,197,94,0.10)',
    iconColor: Colors.severityLow,
    chipBg: Colors.violetLight,
    chipColor: Colors.primary,
    cardBg: Colors.white,
    border: 'transparent',
  },
  medium: {
    icon: 'swap-horizontal',
    stripe: Colors.severityMedium,
    iconBg: 'rgba(234,179,8,0.12)',
    iconColor: Colors.severityMedium,
    chipBg: Colors.violetLight,
    chipColor: Colors.primary,
    cardBg: Colors.white,
    border: 'transparent',
  },
  high: {
    icon: 'warning',
    stripe: Colors.severityHigh,
    iconBg: 'rgba(249,115,22,0.12)',
    iconColor: Colors.severityHigh,
    chipBg: Colors.violetLight,
    chipColor: Colors.primary,
    cardBg: Colors.white,
    border: 'transparent',
  },
  critical: {
    icon: 'alert',
    stripe: Colors.severityCritical,
    iconBg: 'rgba(239,68,68,0.14)',
    iconColor: Colors.severityCritical,
    chipBg: 'rgba(239,68,68,0.10)',
    chipColor: Colors.severityCritical,
    cardBg: '#FEF2F2',
    border: '#FECACA',
  },
};

const KIND_ICON = {
  accident: 'car-sport',
  collision: 'car-sport',
  traffic: 'swap-horizontal',
  congestion: 'swap-horizontal',
  weather: 'rainy',
  rain: 'rainy',
  fog: 'cloud-outline',
  curve: 'git-branch',
  school: 'school',
  school_zone: 'school',
  pedestrian: 'walk',
  hazard: 'warning',
  police: 'shield',
};

function pickIcon(alert) {
  return KIND_ICON[alert.kind] || SEVERITY[alert.severity].icon;
}

function formatDistance(meters) {
  const n = Number(meters);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1000) return `in ${Math.round(n / 10) * 10} m`;
  return `in ${(n / 1000).toFixed(1)} km`;
}

function AlertCard({ alert, compact, onMute, onAck, pulseValue }) {
  const palette = SEVERITY[alert.severity] || SEVERITY.medium;
  const iconName = pickIcon(alert);
  const distance = formatDistance(alert.distanceM);
  const isCritical = alert.severity === 'critical';

  const wrapStyle = [
    styles.card,
    { backgroundColor: palette.cardBg, borderColor: palette.border, borderWidth: palette.border === 'transparent' ? 0 : 1 },
    compact && styles.cardCompact,
  ];

  const pulseStyle = isCritical
    ? {
      shadowColor: Colors.severityCritical,
      shadowOpacity: pulseValue.interpolate({ inputRange: [0, 1], outputRange: [0.0, 0.55] }),
      shadowRadius: pulseValue.interpolate({ inputRange: [0, 1], outputRange: [4, 14] }),
      shadowOffset: { width: 0, height: 0 },
      elevation: 12,
    }
    : null;

  return (
    <Animated.View style={[wrapStyle, pulseStyle]}>
      <View style={[styles.stripe, { backgroundColor: palette.stripe }]} />
      <View style={[styles.iconWrap, { backgroundColor: palette.iconBg }]}>
        <Ionicons name={iconName} size={compact ? 18 : 22} color={palette.iconColor} />
      </View>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>{alert.title}</Text>
          {distance ? (
            <View style={[styles.distChip, { backgroundColor: palette.chipBg }]}>
              <Text style={[styles.distText, { color: palette.chipColor }]}>{distance}</Text>
            </View>
          ) : null}
        </View>
        {alert.description && !compact ? (
          <Text style={styles.desc} numberOfLines={2}>{alert.description}</Text>
        ) : null}
        {!compact ? (
          <View style={styles.actions}>
            {onMute ? (
              <TouchableOpacity style={styles.chip} onPress={() => onMute(alert.id)} activeOpacity={0.7}>
                <Ionicons name="volume-mute-outline" size={12} color={Colors.text} />
                <Text style={styles.chipText}>Mute 5 min</Text>
              </TouchableOpacity>
            ) : null}
            {onAck ? (
              <TouchableOpacity
                style={[styles.chip, isCritical ? styles.chipDanger : styles.chipPrimary]}
                onPress={() => onAck(alert.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isCritical ? 'alert-circle' : 'checkmark'}
                  size={12}
                  color={isCritical ? Colors.error : Colors.primary}
                />
                <Text style={[
                  styles.chipText,
                  isCritical ? styles.chipDangerText : styles.chipPrimaryText,
                ]}>
                  {isCritical ? 'Acknowledge' : 'Got it'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

export default function RouteAlertOverlay({
  alerts,
  state,
  style,
  onMute,
  onDismiss,
  showClearRoadPill = true,
}) {
  const pulseValue = useRef(new Animated.Value(0)).current;
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const hasCritical = useMemo(
    () => alerts?.some((alert) => alert.severity === 'critical'),
    [alerts],
  );

  useEffect(() => {
    if (!hasCritical) {
      pulseValue.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulseValue, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasCritical, pulseValue]);

  const fireToast = (message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  };

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const handleMute = (id) => {
    const alert = alerts.find((a) => a.id === id);
    onMute?.(id);
    fireToast(alert ? `Muted “${alert.title}” for 5 minutes` : 'Muted alert');
  };

  const handleAck = (id) => {
    onDismiss?.(id);
  };

  if (state === 'offline') {
    return (
      <View style={[styles.wrap, style]} pointerEvents="box-none">
        <View style={styles.offline}>
          <Ionicons name="cloud-offline-outline" size={14} color="#92400E" />
          <Text style={styles.offlineText}>Live alerts unavailable</Text>
        </View>
      </View>
    );
  }

  if (!alerts || alerts.length === 0) {
    if (!showClearRoadPill) return null;
    return (
      <View style={[styles.wrap, style]} pointerEvents="box-none">
        <View style={styles.clearPill}>
          <Ionicons name="checkmark-circle" size={14} color="#15803D" />
          <Text style={styles.clearText}>Clear road ahead</Text>
        </View>
        {toast ? <Text style={styles.toast}>{toast}</Text> : null}
      </View>
    );
  }

  const [primary, secondary, ...rest] = alerts;

  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      <AlertCard
        alert={primary}
        onMute={handleMute}
        onAck={handleAck}
        pulseValue={pulseValue}
      />
      {secondary ? (
        <AlertCard
          alert={secondary}
          compact
          onMute={handleMute}
          onAck={handleAck}
          pulseValue={pulseValue}
        />
      ) : null}
      {rest.length > 0 ? (
        <View style={styles.moreRow}>
          <Text style={styles.moreText}>+{rest.length} more · tap to scroll</Text>
        </View>
      ) : null}
      {toast ? <Text style={styles.toast}>{toast}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 9,
    overflow: 'hidden',
  },
  cardCompact: {
    paddingVertical: 8,
    paddingLeft: 12,
  },
  stripe: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 5,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    alignSelf: 'center',
  },
  body: { flex: 1, gap: 3, minWidth: 0 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.heading,
  },
  distChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  distText: {
    fontSize: 12,
    fontWeight: '700',
  },
  desc: {
    fontSize: 12,
    color: Colors.subtext,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
  },
  chipPrimary: {
    backgroundColor: Colors.violetLight,
    borderColor: Colors.violetBorder,
  },
  chipPrimaryText: {
    color: Colors.primary,
  },
  chipDanger: {
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderColor: 'rgba(220,38,38,0.18)',
  },
  chipDangerText: {
    color: Colors.error,
  },

  moreRow: {
    alignSelf: 'flex-end',
  },
  moreText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
    backgroundColor: Colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },

  clearPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34,197,94,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },

  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.28)',
    alignSelf: 'flex-start',
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },

  toast: {
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.92)',
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
});
