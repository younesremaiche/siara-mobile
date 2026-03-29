import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';

const { width } = Dimensions.get('window');

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const WEEKLY_RISK = [
  { day: 'Mon', value: 62 },
  { day: 'Tue', value: 45 },
  { day: 'Wed', value: 78 },
  { day: 'Thu', value: 55 },
  { day: 'Fri', value: 88 },
  { day: 'Sat', value: 42 },
  { day: 'Sun', value: 35 },
];

const SEVERITY_PRESSURE = [
  { label: 'Critical', value: 18, color: Colors.severityCritical },
  { label: 'High', value: 32, color: Colors.severityHigh },
  { label: 'Medium', value: 28, color: Colors.severityMedium },
  { label: 'Low', value: 22, color: Colors.severityLow },
];

const HOURLY_DIST = [
  { hour: '00', val: 12 }, { hour: '03', val: 8 }, { hour: '06', val: 22 },
  { hour: '09', val: 65 }, { hour: '12', val: 48 }, { hour: '15', val: 55 },
  { hour: '18', val: 82 }, { hour: '21', val: 38 },
];

const FACTORS = [
  { label: 'Speeding', pct: 34, icon: 'speedometer-outline', color: Colors.severityCritical },
  { label: 'DUI / Impaired', pct: 22, icon: 'wine-outline', color: Colors.severityHigh },
  { label: 'Distracted driving', pct: 18, icon: 'phone-portrait-outline', color: Colors.severityMedium },
  { label: 'Weather conditions', pct: 14, icon: 'rainy-outline', color: Colors.secondary },
  { label: 'Infrastructure', pct: 12, icon: 'construct-outline', color: Colors.grey },
];

const FORECAST_48H = [
  { period: 'Today AM', risk: 42, level: 'Low', color: Colors.severityLow },
  { period: 'Today PM', risk: 74, level: 'High', color: Colors.severityHigh },
  { period: 'Tomorrow AM', risk: 56, level: 'Medium', color: Colors.severityMedium },
  { period: 'Tomorrow PM', risk: 81, level: 'High', color: Colors.severityHigh },
];

const TOP_ROADS = [
  { name: 'Blvd Zirout Youcef', wilaya: 'Algiers', score: 87, incidents: 42, trend: 'up' },
  { name: 'Autoroute Est km 42-48', wilaya: 'Boumerdes', score: 82, incidents: 28, trend: 'up' },
  { name: 'Route Nationale 5', wilaya: 'Algiers', score: 65, incidents: 18, trend: 'stable' },
  { name: 'Route de l\'Aeroport', wilaya: 'Algiers', score: 54, incidents: 12, trend: 'down' },
  { name: 'Rocade Sud Constantine', wilaya: 'Constantine', score: 48, incidents: 9, trend: 'stable' },
];

const ACTIVE_ALERTS = [
  { title: 'High Risk - Autoroute Est', severity: 'critical', time: '12 min ago' },
  { title: 'Fog Warning - Constantine', severity: 'high', time: '1h ago' },
  { title: 'Construction Zone - RN5', severity: 'medium', time: '2h ago' },
];

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

function getBarColor(value) {
  if (value >= 75) return Colors.severityCritical;
  if (value >= 50) return Colors.severityHigh;
  if (value >= 25) return Colors.severityMedium;
  return Colors.severityLow;
}

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export default function UserDashboardScreen() {
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar barStyle="light-content" />

      {/* ========== HEADER ========== */}
      <LinearGradient
        colors={[Colors.gradientFrom, Colors.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerDecor1} />
        <View style={styles.headerDecor2} />

        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreeting}>Welcome back</Text>
            <Text style={styles.headerTitle}>Personal Intelligence Dashboard</Text>
          </View>
          <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>64</Text>
            <Text style={styles.quickStatLabel}>Risk Score</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>3</Text>
            <Text style={styles.quickStatLabel}>Active Alerts</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>12</Text>
            <Text style={styles.quickStatLabel}>Routes Tracked</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ========== RISK OVERVIEW ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="shield-outline" size={18} color={Colors.primary} />
              <Text style={styles.cardTitle}>Risk Overview</Text>
            </View>
            <View style={styles.cardBadge}>
              <Text style={styles.cardBadgeText}>Live</Text>
            </View>
          </View>

          {/* Donut-style indicator */}
          <View style={styles.donutSection}>
            <View style={styles.donutOuter}>
              <View style={styles.donutTrack}>
                {/* Simulated progress arc using positioned elements */}
                <View style={[styles.donutFillQuarter, styles.donutQ1, { backgroundColor: Colors.severityMedium }]} />
                <View style={[styles.donutFillQuarter, styles.donutQ2, { backgroundColor: Colors.severityMedium + '80' }]} />
                <View style={[styles.donutFillQuarter, styles.donutQ3, { backgroundColor: Colors.border }]} />
                <View style={[styles.donutFillQuarter, styles.donutQ4, { backgroundColor: Colors.border }]} />
              </View>
              <View style={styles.donutInner}>
                <Text style={styles.donutValue}>64</Text>
                <Text style={styles.donutUnit}>/100</Text>
              </View>
            </View>

            <View style={styles.donutInfo}>
              <View style={[styles.riskLevelBadge, { backgroundColor: Colors.severityMedium + '18' }]}>
                <Ionicons name="alert-circle" size={14} color={Colors.severityMedium} />
                <Text style={[styles.riskLevelText, { color: Colors.severityMedium }]}>Moderate Risk</Text>
              </View>
              <Text style={styles.donutDesc}>
                Your personal risk score is based on your routes, driving patterns, and current zone conditions.
              </Text>
              <View style={styles.donutMeta}>
                <Ionicons name="trending-up" size={14} color={Colors.severityHigh} />
                <Text style={styles.donutMetaText}>+3 points from last week</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* ========== VOLATILITY INDEX ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="pulse-outline" size={18} color={Colors.secondary} />
              <Text style={styles.cardTitle}>Volatility Index</Text>
            </View>
            <Text style={styles.cardHeaderValue}>
              <Text style={{ color: Colors.severityHigh, fontWeight: '900' }}>7.2</Text>
              <Text style={{ color: Colors.subtext, fontSize: 12 }}> /10</Text>
            </Text>
          </View>

          {/* Mini Sparkline */}
          <View style={styles.sparklineWrap}>
            <View style={styles.sparkline}>
              {[32, 48, 42, 58, 52, 72, 65, 78, 68, 82, 74, 72].map((v, i) => (
                <View
                  key={i}
                  style={[
                    styles.sparkBar,
                    {
                      height: `${v}%`,
                      backgroundColor: v >= 70 ? Colors.severityHigh + 'CC' : Colors.secondary + '66',
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.sparkLabels}>
              <Text style={styles.sparkLabel}>12h ago</Text>
              <Text style={styles.sparkLabel}>6h ago</Text>
              <Text style={styles.sparkLabel}>Now</Text>
            </View>
          </View>

          <View style={styles.volatilityNote}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.subtext} />
            <Text style={styles.volatilityNoteText}>
              Risk volatility is elevated due to weekend traffic patterns and weather forecast
            </Text>
          </View>
        </View>
      </View>

      {/* ========== SEVERITY PRESSURE ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="bar-chart-outline" size={18} color={Colors.primary} />
              <Text style={styles.cardTitle}>Severity Pressure</Text>
            </View>
          </View>

          {SEVERITY_PRESSURE.map((sp) => (
            <View key={sp.label} style={styles.pressureRow}>
              <View style={styles.pressureLabelWrap}>
                <View style={[styles.pressureDot, { backgroundColor: sp.color }]} />
                <Text style={styles.pressureLabel}>{sp.label}</Text>
              </View>
              <View style={styles.pressureBarOuter}>
                <View
                  style={[
                    styles.pressureBarInner,
                    { width: `${sp.value}%`, backgroundColor: sp.color },
                  ]}
                />
              </View>
              <Text style={[styles.pressurePct, { color: sp.color }]}>{sp.value}%</Text>
            </View>
          ))}

          <View style={styles.pressureTotal}>
            <Text style={styles.pressureTotalLabel}>Total incidents analyzed</Text>
            <Text style={styles.pressureTotalValue}>2,847</Text>
          </View>
        </View>
      </View>

      {/* ========== 24H DISTRIBUTION ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="time-outline" size={18} color={Colors.secondary} />
              <Text style={styles.cardTitle}>24h Distribution</Text>
            </View>
          </View>

          <View style={styles.distChart}>
            {HOURLY_DIST.map((d, i) => {
              const pct = (d.val / 100) * 100;
              const color = getBarColor(d.val);
              return (
                <View key={i} style={styles.distBarWrap}>
                  <View style={styles.distBarOuter}>
                    <View style={[styles.distBar, { height: `${pct}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.distLabel}>{d.hour}h</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.distPeakRow}>
            <Ionicons name="arrow-up-circle-outline" size={16} color={Colors.severityCritical} />
            <Text style={styles.distPeakText}>
              Peak risk: <Text style={{ fontWeight: '800', color: Colors.severityCritical }}>18:00 - 20:00</Text> (82% avg)
            </Text>
          </View>
        </View>
      </View>

      {/* ========== CONTRIBUTING FACTORS ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="pie-chart-outline" size={18} color={Colors.primary} />
              <Text style={styles.cardTitle}>Contributing Factors</Text>
            </View>
          </View>

          {FACTORS.map((f) => (
            <View key={f.label} style={styles.factorRow}>
              <View style={styles.factorIconWrap}>
                <Ionicons name={f.icon} size={16} color={f.color} />
              </View>
              <View style={styles.factorContent}>
                <View style={styles.factorLabelRow}>
                  <Text style={styles.factorLabel}>{f.label}</Text>
                  <Text style={[styles.factorPct, { color: f.color }]}>{f.pct}%</Text>
                </View>
                <View style={styles.factorBarOuter}>
                  <View
                    style={[styles.factorBarInner, { width: `${f.pct}%`, backgroundColor: f.color }]}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* ========== PERSONAL EXPOSURE SCORE ========== */}
      <View style={styles.cardSection}>
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.exposureCard}
        >
          <View style={styles.exposureDecor1} />
          <View style={styles.exposureDecor2} />

          <View style={styles.exposureHeader}>
            <Ionicons name="person-circle-outline" size={24} color={Colors.white} />
            <Text style={styles.exposureTitle}>Personal Exposure Score</Text>
          </View>

          <View style={styles.exposureBody}>
            <View style={styles.exposureScoreWrap}>
              <Text style={styles.exposureScoreValue}>64</Text>
              <Text style={styles.exposureScoreUnit}>/100</Text>
            </View>

            <View style={styles.exposureDetails}>
              <View style={styles.exposureDetailRow}>
                <Ionicons name="navigate-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.exposureDetailText}>12 routes monitored</Text>
              </View>
              <View style={styles.exposureDetailRow}>
                <Ionicons name="car-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.exposureDetailText}>342 km this week</Text>
              </View>
              <View style={styles.exposureDetailRow}>
                <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.exposureDetailText}>18h driving time</Text>
              </View>
            </View>
          </View>

          <View style={styles.exposureBar}>
            <View style={styles.exposureBarTrack}>
              <View style={[styles.exposureBarFill, { width: '64%' }]} />
            </View>
            <View style={styles.exposureBarLabels}>
              <Text style={styles.exposureBarLabel}>Safe</Text>
              <Text style={styles.exposureBarLabel}>Moderate</Text>
              <Text style={styles.exposureBarLabel}>High</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* ========== 48H FORECAST ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="cloudy-outline" size={18} color={Colors.secondary} />
              <Text style={styles.cardTitle}>48h Risk Forecast</Text>
            </View>
          </View>

          <View style={styles.forecastGrid}>
            {FORECAST_48H.map((f, i) => (
              <View key={i} style={styles.forecastItem}>
                <Text style={styles.forecastPeriod}>{f.period}</Text>
                <View style={styles.forecastBarOuter}>
                  <View
                    style={[
                      styles.forecastBar,
                      { height: `${f.risk}%`, backgroundColor: f.color },
                    ]}
                  />
                </View>
                <View style={[styles.forecastLevelBadge, { backgroundColor: f.color + '18' }]}>
                  <Text style={[styles.forecastLevelText, { color: f.color }]}>{f.risk}%</Text>
                </View>
                <Text style={[styles.forecastLevelLabel, { color: f.color }]}>{f.level}</Text>
              </View>
            ))}
          </View>

          <View style={styles.forecastNote}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.subtext} />
            <Text style={styles.forecastNoteText}>
              Forecast based on historical patterns, weather data, and current traffic conditions
            </Text>
          </View>
        </View>
      </View>

      {/* ========== TOP RISK ROADS ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="git-branch-outline" size={18} color={Colors.primary} />
              <Text style={styles.cardTitle}>Top Risk Roads</Text>
            </View>
          </View>

          {TOP_ROADS.map((road, i) => {
            const scoreColor =
              road.score >= 80 ? Colors.severityCritical :
              road.score >= 60 ? Colors.severityHigh :
              road.score >= 40 ? Colors.severityMedium :
              Colors.severityLow;

            return (
              <View
                key={i}
                style={[styles.roadRow, i === TOP_ROADS.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.roadRankBadge}>
                  <Text style={styles.roadRankText}>{i + 1}</Text>
                </View>
                <View style={styles.roadInfo}>
                  <Text style={styles.roadName}>{road.name}</Text>
                  <View style={styles.roadMeta}>
                    <Ionicons name="location-outline" size={12} color={Colors.greyLight} />
                    <Text style={styles.roadWilaya}>{road.wilaya}</Text>
                    <View style={styles.roadMetaDot} />
                    <Text style={styles.roadIncidents}>{road.incidents} incidents</Text>
                  </View>
                </View>
                <View style={[styles.roadScoreBadge, { backgroundColor: scoreColor + '14' }]}>
                  <Text style={[styles.roadScoreText, { color: scoreColor }]}>{road.score}</Text>
                </View>
                <Ionicons
                  name={
                    road.trend === 'up' ? 'trending-up' :
                    road.trend === 'down' ? 'trending-down' :
                    'remove-outline'
                  }
                  size={18}
                  color={
                    road.trend === 'up' ? Colors.severityCritical :
                    road.trend === 'down' ? Colors.severityLow :
                    Colors.grey
                  }
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* ========== ACTIVE ALERTS ========== */}
      <View style={styles.cardSection}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="warning-outline" size={18} color={Colors.severityHigh} />
              <Text style={styles.cardTitle}>Active Alerts</Text>
            </View>
            <View style={styles.alertCountBadge}>
              <Text style={styles.alertCountText}>{ACTIVE_ALERTS.length}</Text>
            </View>
          </View>

          {ACTIVE_ALERTS.map((alert, i) => {
            const alertColor =
              alert.severity === 'critical' ? Colors.severityCritical :
              alert.severity === 'high' ? Colors.severityHigh :
              Colors.severityMedium;

            return (
              <View
                key={i}
                style={[
                  styles.alertRow,
                  i === ACTIVE_ALERTS.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={[styles.alertDot, { backgroundColor: alertColor }]} />
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle}>{alert.title}</Text>
                  <Text style={styles.alertTime}>{alert.time}</Text>
                </View>
                <View style={[styles.alertSeverityBadge, { backgroundColor: alertColor + '14' }]}>
                  <Text style={[styles.alertSeverityText, { color: alertColor }]}>
                    {alert.severity}
                  </Text>
                </View>
              </View>
            );
          })}

          <TouchableOpacity style={styles.viewAllBtn} activeOpacity={0.7}>
            <Text style={styles.viewAllText}>View all alerts</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/*  STYLES                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    paddingBottom: 0,
  },

  /* ---------- Header ---------- */
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 46,
    paddingBottom: 28,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  headerDecor1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerDecor2: {
    position: 'absolute',
    bottom: -10,
    left: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  headerGreeting: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginBottom: 4,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '800',
    maxWidth: 260,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  quickStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '900',
  },
  quickStatLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  /* ---------- Cards ---------- */
  cardSection: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 18,
    elevation: 3,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  cardBadge: {
    backgroundColor: Colors.success + '18',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  cardBadgeText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  cardHeaderValue: {
    fontSize: 16,
  },

  /* ---------- Risk Overview / Donut ---------- */
  donutSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  donutOuter: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutTrack: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    position: 'absolute',
  },
  donutFillQuarter: {
    position: 'absolute',
    width: 50,
    height: 50,
  },
  donutQ1: { top: 0, right: 0 },
  donutQ2: { top: 0, left: 0 },
  donutQ3: { bottom: 0, left: 0 },
  donutQ4: { bottom: 0, right: 0 },
  donutInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    elevation: 2,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  donutValue: {
    color: Colors.severityMedium,
    fontSize: 26,
    fontWeight: '900',
  },
  donutUnit: {
    color: Colors.greyLight,
    fontSize: 11,
    marginTop: 8,
  },
  donutInfo: {
    flex: 1,
  },
  riskLevelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  riskLevelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  donutDesc: {
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  donutMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  donutMetaText: {
    color: Colors.subtext,
    fontSize: 11,
  },

  /* ---------- Volatility / Sparkline ---------- */
  sparklineWrap: {
    marginBottom: 12,
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    gap: 4,
    marginBottom: 6,
  },
  sparkBar: {
    flex: 1,
    borderRadius: 3,
    minHeight: 4,
  },
  sparkLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sparkLabel: {
    color: Colors.greyLight,
    fontSize: 10,
  },
  volatilityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: Colors.blueLight,
    padding: 10,
    borderRadius: 10,
  },
  volatilityNoteText: {
    color: Colors.subtext,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },

  /* ---------- Severity Pressure ---------- */
  pressureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  pressureLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 80,
  },
  pressureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pressureLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  pressureBarOuter: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.bg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  pressureBarInner: {
    height: 8,
    borderRadius: 4,
  },
  pressurePct: {
    fontSize: 13,
    fontWeight: '800',
    width: 38,
    textAlign: 'right',
  },
  pressureTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 4,
  },
  pressureTotalLabel: {
    color: Colors.subtext,
    fontSize: 12,
  },
  pressureTotalValue: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '800',
  },

  /* ---------- 24h Distribution ---------- */
  distChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
    marginBottom: 12,
    paddingBottom: 22,
  },
  distBarWrap: {
    alignItems: 'center',
    flex: 1,
  },
  distBarOuter: {
    width: 24,
    height: 90,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  distBar: {
    width: '100%',
    borderRadius: 5,
    minHeight: 4,
  },
  distLabel: {
    color: Colors.subtext,
    fontSize: 9,
    marginTop: 6,
  },
  distPeakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.06)',
    padding: 10,
    borderRadius: 10,
  },
  distPeakText: {
    color: Colors.text,
    fontSize: 12,
    flex: 1,
  },

  /* ---------- Factors ---------- */
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  factorIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  factorContent: {
    flex: 1,
  },
  factorLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  factorLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  factorPct: {
    fontSize: 13,
    fontWeight: '800',
  },
  factorBarOuter: {
    height: 6,
    backgroundColor: Colors.bg,
    borderRadius: 3,
    overflow: 'hidden',
  },
  factorBarInner: {
    height: 6,
    borderRadius: 3,
  },

  /* ---------- Exposure Card ---------- */
  exposureCard: {
    borderRadius: 16,
    padding: 22,
    overflow: 'hidden',
  },
  exposureDecor1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  exposureDecor2: {
    position: 'absolute',
    bottom: -15,
    left: -15,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  exposureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  exposureTitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  exposureBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 18,
  },
  exposureScoreWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  exposureScoreValue: {
    color: Colors.white,
    fontSize: 48,
    fontWeight: '900',
  },
  exposureScoreUnit: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '600',
  },
  exposureDetails: {
    flex: 1,
    gap: 8,
  },
  exposureDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exposureDetailText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  exposureBar: {
    marginTop: 4,
  },
  exposureBarTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  exposureBarFill: {
    height: 8,
    backgroundColor: Colors.white,
    borderRadius: 4,
  },
  exposureBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  exposureBarLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
  },

  /* ---------- 48h Forecast ---------- */
  forecastGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  forecastItem: {
    alignItems: 'center',
    flex: 1,
  },
  forecastPeriod: {
    color: Colors.subtext,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  forecastBarOuter: {
    width: 32,
    height: 80,
    backgroundColor: Colors.bg,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  forecastBar: {
    width: '100%',
    borderRadius: 8,
    minHeight: 4,
  },
  forecastLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 4,
  },
  forecastLevelText: {
    fontSize: 12,
    fontWeight: '800',
  },
  forecastLevelLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  forecastNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: Colors.blueLight,
    padding: 10,
    borderRadius: 10,
  },
  forecastNoteText: {
    color: Colors.subtext,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },

  /* ---------- Top Risk Roads ---------- */
  roadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  roadRankBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roadRankText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  roadInfo: {
    flex: 1,
  },
  roadName: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 3,
  },
  roadMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roadWilaya: {
    color: Colors.subtext,
    fontSize: 11,
  },
  roadMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.greyLight,
  },
  roadIncidents: {
    color: Colors.subtext,
    fontSize: 11,
  },
  roadScoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  roadScoreText: {
    fontSize: 14,
    fontWeight: '900',
  },

  /* ---------- Active Alerts ---------- */
  alertCountBadge: {
    backgroundColor: Colors.severityCritical,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertCountText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  alertDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '600',
  },
  alertTime: {
    color: Colors.subtext,
    fontSize: 11,
    marginTop: 2,
  },
  alertSeverityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  alertSeverityText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 14,
  },
  viewAllText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
