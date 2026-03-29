import React from 'react';
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
import { formatPercent } from '../../utils/mapHelpers';

function formatDistance(distanceKm) {
  const numeric = Number(distanceKm);
  if (!Number.isFinite(numeric)) return '--';
  return `${numeric.toFixed(numeric >= 10 ? 0 : 1)} km`;
}

function formatEta(etaMin) {
  const numeric = Number(etaMin);
  if (!Number.isFinite(numeric)) return '--';
  const rounded = Math.round(numeric);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export default function GuidedRouteSelector({
  routes = [],
  selectedRouteType,
  guidedRouteState = 'idle',
  onSelectRouteType,
  onClear,
  style,
}) {
  if (!routes.length && guidedRouteState === 'idle') {
    return null;
  }

  const isBusy = guidedRouteState === 'loading' || guidedRouteState === 'refreshing';

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="git-compare-outline" size={16} color={Colors.primary} />
          <Text style={styles.headerTitle}>Route Options</Text>
          {isBusy && <ActivityIndicator size="small" color={Colors.primary} style={styles.headerSpinner} />}
        </View>
        {onClear ? (
          <TouchableOpacity onPress={onClear} style={styles.clearButton}>
            <Ionicons name="close" size={16} color={Colors.error} />
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {guidedRouteState === 'loading' && routes.length === 0 ? (
        <Text style={styles.subtleText}>Calculating route alternatives...</Text>
      ) : null}

      {guidedRouteState === 'refreshing' ? (
        <Text style={styles.subtleText}>Refreshing route options for the latest location and time...</Text>
      ) : null}

      {routes.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRow}
        >
          {routes.map((route) => {
            const selected = route.route_type === selectedRouteType;
            return (
              <TouchableOpacity
                key={route.route_type}
                style={[styles.card, selected && styles.cardSelected]}
                activeOpacity={0.85}
                onPress={() => onSelectRouteType?.(route.route_type)}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.typePill, selected && styles.typePillSelected]}>
                    <Text style={[styles.typePillText, selected && styles.typePillTextSelected]}>
                      {route.route_label}
                    </Text>
                  </View>
                  {route.isRecommended ? (
                    <View style={styles.recommendedPill}>
                      <Ionicons name="sparkles" size={11} color={Colors.primary} />
                      <Text style={styles.recommendedText}>Recommended</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.metricRow}>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Risk</Text>
                    <Text style={styles.metricValue}>{formatPercent(route.danger_percent)}</Text>
                  </View>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>ETA</Text>
                    <Text style={styles.metricValue}>{formatEta(route.eta_min)}</Text>
                  </View>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Distance</Text>
                    <Text style={styles.metricValue}>{formatDistance(route.distance_km)}</Text>
                  </View>
                </View>

                <Text style={styles.reasonText}>{route.recommendedReason}</Text>
                <Text style={styles.comparisonText}>{route.comparisonText}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.heading,
  },
  headerSpinner: {
    marginLeft: 8,
  },
  subtleText: {
    fontSize: 12,
    color: Colors.subtext,
    marginBottom: 8,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.error,
  },
  cardRow: {
    gap: 10,
    paddingRight: 2,
  },
  card: {
    width: 232,
    borderRadius: 14,
    padding: 12,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#F3EEFF',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typePillSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
    textTransform: 'uppercase',
  },
  typePillTextSelected: {
    color: Colors.primary,
  },
  recommendedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(124,58,237,0.1)',
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metricBlock: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.subtext,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.heading,
  },
  reasonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  comparisonText: {
    fontSize: 12,
    color: Colors.subtext,
    lineHeight: 17,
  },
});
