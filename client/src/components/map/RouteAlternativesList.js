import React from 'react';
import {
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

export default function RouteAlternativesList({
  routes = [],
  selectedRouteType,
  onSelectRouteType,
}) {
  if (!routes.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Route alternatives</Text>
        <Text style={styles.subtitle}>Compare every option against the fastest route.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {routes.map((route) => {
          const selected = route.route_type === selectedRouteType;
          return (
            <TouchableOpacity
              key={route.route_type}
              style={[styles.card, selected && styles.cardSelected]}
              activeOpacity={0.88}
              onPress={() => onSelectRouteType?.(route.route_type)}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>{route.route_label}</Text>
                  <Text style={styles.cardReason}>{route.recommendedReason}</Text>
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

              <Text style={styles.cardComparison}>{route.comparisonText}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  header: {
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.heading,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.subtext,
  },
  row: {
    gap: 10,
    paddingRight: 2,
  },
  card: {
    width: 260,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardSelected: {
    backgroundColor: '#F3EEFF',
    borderColor: Colors.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.heading,
  },
  cardReason: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.subtext,
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
    fontWeight: '700',
    color: Colors.subtext,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.heading,
  },
  cardComparison: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.text,
  },
});
