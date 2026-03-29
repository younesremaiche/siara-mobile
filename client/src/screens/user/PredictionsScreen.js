import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';

const { width } = Dimensions.get('window');
const FEATURE_CARD_W = (width - 54) / 2;

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const KPIS = [
  {
    value: '92.4%',
    label: 'Accuracy',
    sub: 'Prediction precision',
    icon: 'checkmark-circle-outline',
    color: Colors.accent,
    bg: 'rgba(15,169,88,0.08)',
  },
  {
    value: '1,247',
    label: 'Zones Analyzed',
    sub: 'Across 58 wilayas',
    icon: 'location-outline',
    color: Colors.secondary,
    bg: Colors.blueLight,
  },
  {
    value: 'v3.2.1',
    label: 'Model Version',
    sub: 'Latest deployment',
    icon: 'code-slash-outline',
    color: Colors.primary,
    bg: Colors.violetLight,
  },
];

const FEATURES = [
  {
    icon: 'flame-outline',
    title: 'Risk Heatmap',
    desc: 'Interactive geographical visualization of accident risk intensity across all 58 wilayas.',
    color: Colors.severityCritical,
    bg: 'rgba(239,68,68,0.08)',
  },
  {
    icon: 'navigate-outline',
    title: 'Route Analysis',
    desc: 'AI-powered route safety scoring with real-time risk assessment for your planned journey.',
    color: Colors.secondary,
    bg: Colors.blueLight,
  },
  {
    icon: 'notifications-outline',
    title: 'Real-Time Alerts',
    desc: 'Instant push notifications when risk levels spike in your monitored zones.',
    color: Colors.primary,
    bg: Colors.violetLight,
  },
  {
    icon: 'person-outline',
    title: 'Behavior Analysis',
    desc: 'Deep learning models analyze driving patterns and behavioral risk indicators.',
    color: Colors.accent,
    bg: 'rgba(15,169,88,0.08)',
  },
];

const CHART_DATA = [
  { label: 'Mon', value: 62 },
  { label: 'Tue', value: 45 },
  { label: 'Wed', value: 78 },
  { label: 'Thu', value: 55 },
  { label: 'Fri', value: 88 },
  { label: 'Sat', value: 72 },
  { label: 'Sun', value: 35 },
];
const CHART_MAX = 100;

const RISK_ZONES = [
  { rank: 1, zone: 'Algiers Centre - Didouche Mourad', severity: 'critical', score: 94, trend: 'up', incidents: 87 },
  { rank: 2, zone: 'Oran Industrial Port Road', severity: 'critical', score: 89, trend: 'stable', incidents: 64 },
  { rank: 3, zone: 'Constantine University District', severity: 'high', score: 76, trend: 'down', incidents: 42 },
  { rank: 4, zone: 'Blida Highway Exit A1', severity: 'high', score: 71, trend: 'up', incidents: 38 },
  { rank: 5, zone: 'Setif Industrial Zone', severity: 'medium', score: 58, trend: 'stable', incidents: 24 },
];

const SEVERITY_PILL = {
  critical: { color: Colors.severityCritical, bg: 'rgba(239,68,68,0.12)' },
  high: { color: Colors.severityHigh, bg: 'rgba(249,115,22,0.12)' },
  medium: { color: Colors.severityMedium, bg: 'rgba(234,179,8,0.12)' },
  low: { color: Colors.severityLow, bg: 'rgba(34,197,94,0.12)' },
};

const TECH_STACK = [
  { name: 'TensorFlow', icon: 'hardware-chip-outline', desc: 'Deep learning framework' },
  { name: 'Python', icon: 'logo-python', desc: 'Data processing' },
  { name: 'PostgreSQL', icon: 'server-outline', desc: 'Time-series database' },
  { name: 'React Native', icon: 'phone-portrait-outline', desc: 'Mobile client' },
  { name: 'FastAPI', icon: 'flash-outline', desc: 'Inference server' },
  { name: 'Docker', icon: 'cube-outline', desc: 'Containerization' },
];

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export default function PredictionsScreen() {
  const [selectedBar, setSelectedBar] = useState(null);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar barStyle="light-content" />

      {/* ========== HERO BANNER ========== */}
      <LinearGradient
        colors={[Colors.gradientFrom, Colors.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroDecor1} />
        <View style={styles.heroDecor2} />
        <View style={styles.heroDecor3} />

        <View style={styles.heroBadge}>
          <Ionicons name="sparkles" size={14} color={Colors.white} />
          <Text style={styles.heroBadgeText}>ARTIFICIAL INTELLIGENCE</Text>
        </View>

        <Text style={styles.heroTitle}>AI-Powered Risk{'\n'}Intelligence</Text>
        <Text style={styles.heroSubtitle}>
          Advanced machine learning models analyze real-time data to predict road accident risks across all of Algeria
        </Text>

        <View style={styles.heroTagRow}>
          <View style={styles.heroTag}>
            <Ionicons name="pulse-outline" size={14} color="rgba(255,255,255,0.9)" />
            <Text style={styles.heroTagText}>SIARA Predictions</Text>
          </View>
          <View style={styles.heroTag}>
            <Ionicons name="shield-checkmark-outline" size={14} color="rgba(255,255,255,0.9)" />
            <Text style={styles.heroTagText}>v3.2.1 Active</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ========== KPI CARDS ========== */}
      <View style={styles.kpiSection}>
        {KPIS.map((kpi, i) => (
          <View key={i} style={styles.kpiCard}>
            <View style={[styles.kpiIconWrap, { backgroundColor: kpi.bg }]}>
              <Ionicons name={kpi.icon} size={22} color={kpi.color} />
            </View>
            <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
            <Text style={styles.kpiLabel}>{kpi.label}</Text>
            <Text style={styles.kpiSub}>{kpi.sub}</Text>
          </View>
        ))}
      </View>

      {/* ========== FEATURE CARDS GRID ========== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>CAPABILITIES</Text>
          </View>
          <Text style={styles.sectionTitle}>Prediction Features</Text>
          <Text style={styles.sectionSubtitle}>
            Comprehensive AI toolkit for road safety intelligence
          </Text>
        </View>

        <View style={styles.featuresGrid}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureCard}>
              <View style={[styles.featureIconWrap, { backgroundColor: f.bg }]}>
                <Ionicons name={f.icon} size={24} color={f.color} />
              </View>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ========== WEEKLY RISK CHART ========== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>ANALYTICS</Text>
          </View>
          <Text style={styles.sectionTitle}>Weekly Risk Distribution</Text>
          <Text style={styles.sectionSubtitle}>
            Average risk scores by day of the week
          </Text>
        </View>

        <View style={styles.chartCard}>
          {/* Y-axis labels */}
          <View style={styles.chartYAxis}>
            {[100, 75, 50, 25, 0].map((v) => (
              <Text key={v} style={styles.chartYLabel}>{v}</Text>
            ))}
          </View>

          {/* Bars */}
          <View style={styles.chartArea}>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((v) => (
              <View
                key={v}
                style={[styles.chartGridLine, { bottom: `${v}%` }]}
              />
            ))}

            <View style={styles.chartBars}>
              {CHART_DATA.map((d, i) => {
                const pct = (d.value / CHART_MAX) * 100;
                const barColor =
                  d.value >= 80 ? Colors.severityCritical :
                  d.value >= 60 ? Colors.severityHigh :
                  d.value >= 40 ? Colors.severityMedium :
                  Colors.severityLow;
                const isSelected = selectedBar === i;

                return (
                  <TouchableOpacity
                    key={i}
                    style={styles.chartBarWrap}
                    activeOpacity={0.7}
                    onPress={() => setSelectedBar(isSelected ? null : i)}
                  >
                    {isSelected && (
                      <View style={[styles.chartTooltip, { backgroundColor: barColor }]}>
                        <Text style={styles.chartTooltipText}>{d.value}%</Text>
                      </View>
                    )}
                    <View style={styles.chartBarOuter}>
                      <View
                        style={[
                          styles.chartBar,
                          {
                            height: `${pct}%`,
                            backgroundColor: barColor,
                            opacity: isSelected ? 1 : 0.85,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.chartBarLabel, isSelected && { color: barColor, fontWeight: '700' }]}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Legend */}
          <View style={styles.chartLegend}>
            {[
              { label: 'Low', color: Colors.severityLow },
              { label: 'Medium', color: Colors.severityMedium },
              { label: 'High', color: Colors.severityHigh },
              { label: 'Critical', color: Colors.severityCritical },
            ].map((item) => (
              <View key={item.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={styles.legendText}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ========== RISK ZONE RANKING ========== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>RANKING</Text>
          </View>
          <Text style={styles.sectionTitle}>Risk Zone Ranking</Text>
          <Text style={styles.sectionSubtitle}>
            Top 5 highest-risk zones identified by AI
          </Text>
        </View>

        <View style={styles.rankingCard}>
          {/* Table header */}
          <View style={styles.rankingHeader}>
            <Text style={[styles.rankingHeaderText, { width: 32 }]}>#</Text>
            <Text style={[styles.rankingHeaderText, { flex: 1 }]}>Zone</Text>
            <Text style={[styles.rankingHeaderText, { width: 60, textAlign: 'center' }]}>Severity</Text>
            <Text style={[styles.rankingHeaderText, { width: 42, textAlign: 'right' }]}>Score</Text>
            <Text style={[styles.rankingHeaderText, { width: 30, textAlign: 'center' }]}>Trend</Text>
          </View>

          {RISK_ZONES.map((z, i) => {
            const sev = SEVERITY_PILL[z.severity];
            return (
              <View key={z.rank} style={[styles.rankingRow, i === RISK_ZONES.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>{z.rank}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankZoneName}>{z.zone}</Text>
                  <Text style={styles.rankIncidents}>{z.incidents} incidents</Text>
                </View>
                <View style={[styles.severityPill, { backgroundColor: sev.bg }]}>
                  <Text style={[styles.severityPillText, { color: sev.color }]}>
                    {z.severity}
                  </Text>
                </View>
                <Text style={[styles.rankScore, { color: sev.color }]}>{z.score}</Text>
                <Ionicons
                  name={
                    z.trend === 'up' ? 'trending-up' :
                    z.trend === 'down' ? 'trending-down' :
                    'remove-outline'
                  }
                  size={18}
                  color={
                    z.trend === 'up' ? Colors.severityCritical :
                    z.trend === 'down' ? Colors.severityLow :
                    Colors.grey
                  }
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* ========== TECH STACK ========== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>TECHNOLOGY</Text>
          </View>
          <Text style={styles.sectionTitle}>Tech Stack</Text>
          <Text style={styles.sectionSubtitle}>
            The technology powering SIARA predictions
          </Text>
        </View>

        <View style={styles.techGrid}>
          {TECH_STACK.map((tech, i) => (
            <View key={i} style={styles.techCard}>
              <Ionicons name={tech.icon} size={24} color={Colors.primary} />
              <Text style={styles.techName}>{tech.name}</Text>
              <Text style={styles.techDesc}>{tech.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ========== MODEL STATUS ========== */}
      <View style={styles.section}>
        <View style={styles.modelCard}>
          <LinearGradient
            colors={[Colors.violetLight, Colors.blueLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modelCardInner}
          >
            <View style={styles.modelHeader}>
              <View style={styles.modelStatusDot} />
              <Text style={styles.modelStatusLabel}>Model Online</Text>
            </View>
            <View style={styles.modelDetails}>
              <View style={styles.modelDetailItem}>
                <Text style={styles.modelDetailLabel}>Version</Text>
                <Text style={styles.modelDetailValue}>v3.2.1</Text>
              </View>
              <View style={styles.modelDetailDivider} />
              <View style={styles.modelDetailItem}>
                <Text style={styles.modelDetailLabel}>Last Trained</Text>
                <Text style={styles.modelDetailValue}>6h ago</Text>
              </View>
              <View style={styles.modelDetailDivider} />
              <View style={styles.modelDetailItem}>
                <Text style={styles.modelDetailLabel}>Data Points</Text>
                <Text style={styles.modelDetailValue}>3.8M</Text>
              </View>
              <View style={styles.modelDetailDivider} />
              <View style={styles.modelDetailItem}>
                <Text style={styles.modelDetailLabel}>Uptime</Text>
                <Text style={styles.modelDetailValue}>99.97%</Text>
              </View>
            </View>
          </LinearGradient>
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

  /* ---------- Hero ---------- */
  hero: {
    paddingTop: Platform.OS === 'ios' ? 64 : 50,
    paddingBottom: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroDecor1: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroDecor2: {
    position: 'absolute',
    bottom: 20,
    left: -40,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroDecor3: {
    position: 'absolute',
    top: 60,
    left: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  heroBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 12,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 340,
    marginBottom: 20,
  },
  heroTagRow: {
    flexDirection: 'row',
    gap: 10,
  },
  heroTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  heroTagText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },

  /* ---------- KPIs ---------- */
  kpiSection: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginTop: -20,
    marginBottom: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  kpiIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 2,
  },
  kpiLabel: {
    color: Colors.heading,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  kpiSub: {
    color: Colors.subtext,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },

  /* ---------- Sections ---------- */
  section: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 28,
  },
  sectionBadge: {
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
  },
  sectionBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: Colors.heading,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: Colors.subtext,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 300,
  },

  /* ---------- Feature Cards ---------- */
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  featureCard: {
    width: FEATURE_CARD_W,
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
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  featureDesc: {
    color: Colors.subtext,
    fontSize: 11,
    lineHeight: 17,
  },

  /* ---------- Chart ---------- */
  chartCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 20,
    elevation: 3,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexDirection: 'row',
  },
  chartYAxis: {
    justifyContent: 'space-between',
    paddingRight: 8,
    height: 160,
  },
  chartYLabel: {
    color: Colors.greyLight,
    fontSize: 10,
    textAlign: 'right',
    width: 24,
  },
  chartArea: {
    flex: 1,
    height: 160,
    position: 'relative',
  },
  chartGridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.border,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: '100%',
    paddingBottom: 22,
  },
  chartBarWrap: {
    alignItems: 'center',
    flex: 1,
  },
  chartBarOuter: {
    width: 28,
    height: 120,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: '100%',
    borderRadius: 6,
    minHeight: 4,
  },
  chartBarLabel: {
    color: Colors.subtext,
    fontSize: 10,
    marginTop: 6,
  },
  chartTooltip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  chartTooltipText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  chartLegend: {
    position: 'absolute',
    bottom: 0,
    left: 32,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: Colors.subtext,
    fontSize: 10,
  },

  /* ---------- Risk Zone Ranking ---------- */
  rankingCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  rankingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rankingHeaderText: {
    color: Colors.subtext,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBadgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  rankZoneName: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  rankIncidents: {
    color: Colors.subtext,
    fontSize: 11,
  },
  severityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  severityPillText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  rankScore: {
    fontSize: 16,
    fontWeight: '900',
    width: 32,
    textAlign: 'right',
  },

  /* ---------- Tech Stack ---------- */
  techGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  techCard: {
    width: (width - 50) / 3,
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    elevation: 2,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  techName: {
    color: Colors.heading,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  techDesc: {
    color: Colors.subtext,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },

  /* ---------- Model Status ---------- */
  modelCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  modelCardInner: {
    padding: 20,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  modelStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  modelStatusLabel: {
    color: Colors.success,
    fontSize: 14,
    fontWeight: '700',
  },
  modelDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelDetailItem: {
    alignItems: 'center',
    flex: 1,
  },
  modelDetailLabel: {
    color: Colors.subtext,
    fontSize: 10,
    marginBottom: 4,
  },
  modelDetailValue: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  modelDetailDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.violetBorder,
  },
});
