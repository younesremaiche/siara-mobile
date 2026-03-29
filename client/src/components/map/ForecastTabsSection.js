import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DangerForecastChart from './DangerForecastChart';
import { Colors } from '../../theme/colors';

export default function ForecastTabsSection({
  forecastTab = 'info',
  onChangeTab,
  forecastPoints = [],
  forecastLoading = false,
  userPosition,
  weatherTemp = '--',
  weatherDesc = 'Weather',
  weatherWind = '--',
  weatherHumidity = '--',
  weatherVisibility = '--',
  weatherPressure = '--',
  weatherIconName = 'cloud',
  trendingZones = [],
  activeAlerts = [],
  onManageAlerts,
}) {
  const tabs = [
    { key: 'info', label: 'Info', icon: 'information-circle' },
    { key: 'forecast', label: 'Forecast', icon: 'trending-up' },
    { key: 'context', label: 'Context', icon: 'layers' },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Road context</Text>
        <Text style={styles.subtitle}>Switch between current conditions, forecast, and nearby context.</Text>
      </View>

      <View style={styles.tabRow}>
        {tabs.map((tab) => {
          const active = tab.key === forecastTab;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, active && styles.tabButtonActive]}
              onPress={() => onChangeTab?.(tab.key)}
            >
              <Ionicons name={tab.icon} size={15} color={active ? Colors.primary : Colors.grey} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {forecastTab === 'info' ? (
        <View style={styles.weatherCard}>
          <View style={styles.weatherHero}>
            <Ionicons name={weatherIconName} size={28} color={Colors.primary} />
            <View style={styles.weatherMain}>
              <Text style={styles.weatherTemp}>{weatherTemp}</Text>
              <Text style={styles.weatherDesc}>{weatherDesc}</Text>
            </View>
          </View>
          <View style={styles.metricGrid}>
            {[
              ['Visibility', weatherVisibility],
              ['Wind', weatherWind],
              ['Humidity', weatherHumidity],
              ['Pressure', weatherPressure],
            ].map(([label, value]) => (
              <View key={label} style={styles.metricCard}>
                <Text style={styles.metricCardLabel}>{label}</Text>
                <Text style={styles.metricCardValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {forecastTab === 'forecast' ? (
        <View style={styles.cardBlock}>
          <DangerForecastChart points={forecastPoints} loading={forecastLoading} />
          {!forecastLoading && forecastPoints.length === 0 && !userPosition ? (
            <Text style={styles.emptyText}>Enable location to load forecast details.</Text>
          ) : null}
        </View>
      ) : null}

      {forecastTab === 'context' ? (
        <View style={styles.contextWrap}>
          <View style={styles.contextCard}>
            <Text style={styles.contextTitle}>Areas to watch</Text>
            {trendingZones.map((zone) => (
              <View key={zone.name} style={styles.contextRow}>
                <View>
                  <Text style={styles.contextName}>{zone.name}</Text>
                  <Text style={styles.contextMeta}>{zone.incidents} incidents | {zone.updated}</Text>
                </View>
                <Text style={styles.contextSeverity}>{zone.severity}</Text>
              </View>
            ))}
          </View>

          <View style={styles.contextCard}>
            <Text style={styles.contextTitle}>Active alerts</Text>
            {activeAlerts.map((alert) => (
              <View key={alert.id} style={styles.contextRow}>
                <View>
                  <Text style={styles.contextName}>{alert.title}</Text>
                  <Text style={styles.contextMeta}>{alert.time} ago</Text>
                </View>
                <Ionicons name="notifications-outline" size={16} color={Colors.error} />
              </View>
            ))}
            <TouchableOpacity style={styles.manageButton} onPress={onManageAlerts}>
              <Text style={styles.manageButtonText}>Manage alerts</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
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
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: '#F3EEFF',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.subtext,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  weatherCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  weatherHero: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherMain: {
    marginLeft: 12,
  },
  weatherTemp: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.heading,
  },
  weatherDesc: {
    fontSize: 13,
    color: Colors.subtext,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    width: '48%',
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metricCardLabel: {
    fontSize: 11,
    color: Colors.subtext,
    marginBottom: 4,
  },
  metricCardValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.heading,
  },
  cardBlock: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.subtext,
  },
  contextWrap: {
    gap: 10,
  },
  contextCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  contextTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.heading,
  },
  contextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  contextName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.heading,
  },
  contextMeta: {
    marginTop: 3,
    fontSize: 12,
    color: Colors.subtext,
  },
  contextSeverity: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
    color: Colors.primary,
  },
  manageButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.btnPrimary,
  },
  manageButtonText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
});
