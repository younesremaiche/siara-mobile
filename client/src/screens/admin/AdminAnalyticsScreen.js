import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';

// ── Tabs ─────────────────────────────────────────────────
const TABS = ['Heatmap', 'Severity', 'Roads', 'Correlations', 'Prediction'];

// ── Summary KPIs ─────────────────────────────────────────
const SUMMARY_KPIS = [
  { label: 'Total Incidents (30d)', value: '1,269', icon: 'warning', color: Colors.adminDanger },
  { label: 'Avg / Day', value: '42.3', icon: 'calendar', color: Colors.adminInfo },
  { label: 'Fatality Rate', value: '2.8%', icon: 'skull-outline', color: Colors.severityCritical },
  { label: 'Peak Hour', value: '17-18h', icon: 'time', color: Colors.adminWarning },
];

// ── Heatmap: 7 days x 24 hours ──────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);

// Generate realistic 7x24 heatmap values
const generateHeatmap = () => {
  const data = [];
  for (let h = 0; h < 24; h++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      let base = 1;
      // Rush hours
      if ((h >= 7 && h <= 9) || (h >= 17 && h <= 19)) base = 8;
      else if (h >= 10 && h <= 16) base = 5;
      else if (h >= 20 && h <= 22) base = 4;
      else if (h >= 0 && h <= 5) base = 1;
      else base = 3;
      // Weekend bump at night
      if ((d === 4 || d === 5) && (h >= 20 || h <= 2)) base += 3;
      // Add variance
      const variance = Math.round((Math.sin(h * d + h) + 1) * 2);
      row.push(Math.max(0, base + variance));
    }
    data.push(row);
  }
  return data;
};
const HEATMAP_24 = generateHeatmap();
const maxHeat = Math.max(...HEATMAP_24.flat());

const heatColor = (val) => {
  const ratio = val / maxHeat;
  if (ratio > 0.8) return 'rgba(239,68,68,0.75)';
  if (ratio > 0.6) return 'rgba(249,115,22,0.6)';
  if (ratio > 0.4) return 'rgba(245,158,11,0.5)';
  if (ratio > 0.2) return 'rgba(59,130,246,0.35)';
  if (ratio > 0.05) return 'rgba(59,130,246,0.15)';
  return 'rgba(255,255,255,0.03)';
};

// ── Severity Distribution ────────────────────────────────
const SEVERITY_DATA = [
  { label: 'Low', count: 431, pct: 34, color: Colors.severityLow },
  { label: 'Medium', count: 343, pct: 27, color: Colors.severityMedium },
  { label: 'High', count: 305, pct: 24, color: Colors.severityHigh },
  { label: 'Critical', count: 190, pct: 15, color: Colors.severityCritical },
];
const TOTAL_INCIDENTS = SEVERITY_DATA.reduce((a, s) => a + s.count, 0);

// ── Dangerous Roads ──────────────────────────────────────
const DANGEROUS_ROADS = [
  { rank: 1, name: 'RN1 (Blida-Algiers)', incidents: 142, fatalities: 18, riskScore: 96, km: 55 },
  { rank: 2, name: 'A1 Autoroute East', incidents: 118, fatalities: 12, riskScore: 91, km: 430 },
  { rank: 3, name: 'RN5 (Tizi Ouzou)', incidents: 96, fatalities: 9, riskScore: 87, km: 120 },
  { rank: 4, name: 'Constantine Ring', incidents: 64, fatalities: 5, riskScore: 78, km: 38 },
  { rank: 5, name: 'RN4 (Tipaza Coast)', incidents: 52, fatalities: 3, riskScore: 71, km: 65 },
  { rank: 6, name: 'RN3 (Setif-Batna)', incidents: 78, fatalities: 7, riskScore: 82, km: 130 },
  { rank: 7, name: 'RN11 (Djelfa)', incidents: 41, fatalities: 2, riskScore: 64, km: 90 },
  { rank: 8, name: 'Oran Port Road', incidents: 38, fatalities: 2, riskScore: 59, km: 12 },
];

// ── Correlations ─────────────────────────────────────────
const CORRELATIONS = [
  { factor: 'Rain / Wet Road', correlation: 0.78, direction: 'positive', incidents: '+34%', icon: 'rainy' },
  { factor: 'Rush Hour (7-9, 17-19)', correlation: 0.72, direction: 'positive', incidents: '+28%', icon: 'time' },
  { factor: 'Weekend Nights', correlation: 0.65, direction: 'positive', incidents: '+22%', icon: 'moon' },
  { factor: 'Heavy Fog', correlation: 0.61, direction: 'positive', incidents: '+19%', icon: 'cloudy' },
  { factor: 'School Zone Proximity', correlation: 0.55, direction: 'positive', incidents: '+15%', icon: 'school' },
  { factor: 'Road Lighting (present)', correlation: -0.48, direction: 'negative', incidents: '-12%', icon: 'bulb' },
  { factor: 'Speed Camera Coverage', correlation: -0.52, direction: 'negative', incidents: '-16%', icon: 'camera' },
  { factor: 'Road Maintenance (recent)', correlation: -0.41, direction: 'negative', incidents: '-10%', icon: 'construct' },
];

// ── 7-Day Predictions ───────────────────────────────────
const PREDICTION_DAYS = [
  { day: 'Fri', date: 'Mar 7', predicted: 48, confidence: 94, risk: 'High' },
  { day: 'Sat', date: 'Mar 8', predicted: 55, confidence: 91, risk: 'High' },
  { day: 'Sun', date: 'Mar 9', predicted: 39, confidence: 88, risk: 'Medium' },
  { day: 'Mon', date: 'Mar 10', predicted: 44, confidence: 86, risk: 'Medium' },
  { day: 'Tue', date: 'Mar 11', predicted: 46, confidence: 83, risk: 'High' },
  { day: 'Wed', date: 'Mar 12', predicted: 42, confidence: 80, risk: 'Medium' },
  { day: 'Thu', date: 'Mar 13', predicted: 38, confidence: 76, risk: 'Medium' },
];
const maxPredicted = Math.max(...PREDICTION_DAYS.map((p) => p.predicted));

const riskColor = (score) => {
  if (score >= 85) return Colors.severityCritical;
  if (score >= 70) return Colors.severityHigh;
  if (score >= 55) return Colors.severityMedium;
  return Colors.severityLow;
};

const predRiskColor = (risk) => {
  const map = { High: Colors.severityHigh, Medium: Colors.severityMedium, Low: Colors.severityLow };
  return map[risk] || Colors.grey;
};

// ── SVG Donut Chart ─────────────────────────────────────
const DonutChart = ({ data, size = 160, strokeWidth = 22 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  let cumulativePct = 0;

  return (
    <View style={{ alignItems: 'center', marginVertical: 12 }}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Data segments */}
        <G rotation={-90} origin={`${center}, ${center}`}>
          {data.map((item, i) => {
            const pctDecimal = item.pct / 100;
            const dashLength = pctDecimal * circumference;
            const dashGap = circumference - dashLength;
            const offset = cumulativePct * circumference;
            cumulativePct += pctDecimal;
            return (
              <Circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                stroke={item.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${dashLength} ${dashGap}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
          })}
        </G>
        {/* Center text */}
        <SvgText
          x={center}
          y={center - 6}
          textAnchor="middle"
          fill={Colors.adminText}
          fontSize={22}
          fontWeight="800"
        >
          {TOTAL_INCIDENTS.toLocaleString()}
        </SvgText>
        <SvgText
          x={center}
          y={center + 14}
          textAnchor="middle"
          fill={Colors.grey}
          fontSize={10}
        >
          incidents
        </SvgText>
      </Svg>
    </View>
  );
};

// ── Component ────────────────────────────────────────────
export default function AdminAnalyticsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('Heatmap');

  // ── Heatmap (7x24) ──────────────────────────────────
  const renderHeatmap = () => (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Incident Heatmap (7 x 24)</Text>
        <Text style={styles.sectionSub}>Hourly incident density across the week</Text>

        {/* Day headers */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.heatHeader}>
              <View style={{ width: 28 }} />
              {DAYS.map((d, i) => (
                <View key={i} style={styles.heatColHead}>
                  <Text style={styles.heatColText}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Grid rows (24 hours) */}
            {HEATMAP_24.map((row, ri) => (
              <View key={ri} style={styles.heatRow}>
                <View style={styles.heatRowHead}>
                  <Text style={styles.heatRowText}>{ri.toString().padStart(2, '0')}</Text>
                </View>
                {row.map((val, ci) => (
                  <View key={ci} style={[styles.heatCell, { backgroundColor: heatColor(val) }]}>
                    <Text style={[styles.heatCellText, val === 0 && { opacity: 0.3 }]}>{val}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Legend */}
        <View style={styles.heatLegend}>
          <Text style={styles.heatLegendLabel}>Low</Text>
          {[0.05, 0.2, 0.4, 0.6, 0.8, 1.0].map((r, i) => (
            <View key={i} style={[styles.heatLegendBox, { backgroundColor: heatColor(r * maxHeat) }]} />
          ))}
          <Text style={styles.heatLegendLabel}>High</Text>
        </View>
      </View>
    </View>
  );

  // ── Severity Distribution + Donut ────────────────────
  const renderSeverity = () => (
    <View>
      {/* Donut */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Severity Distribution (30 days)</Text>
        <DonutChart data={SEVERITY_DATA} />

        {/* Legend */}
        <View style={styles.donutLegend}>
          {SEVERITY_DATA.map((s, i) => (
            <View key={i} style={styles.donutLegendItem}>
              <View style={[styles.donutLegendDot, { backgroundColor: s.color }]} />
              <Text style={styles.donutLegendLabel}>{s.label}</Text>
              <Text style={[styles.donutLegendPct, { color: s.color }]}>{s.pct}%</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Bar breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Breakdown</Text>

        {/* Stacked bar */}
        <View style={styles.stackedBar}>
          {SEVERITY_DATA.map((s, i) => (
            <View key={i} style={[styles.stackedSeg, { flex: s.pct, backgroundColor: s.color }]} />
          ))}
        </View>

        {/* Detail rows */}
        {SEVERITY_DATA.map((s, i) => (
          <View key={i} style={styles.sevRow}>
            <View style={[styles.sevDot, { backgroundColor: s.color }]} />
            <Text style={styles.sevLabel}>{s.label}</Text>
            <View style={styles.sevBarTrack}>
              <View style={[styles.sevBarFill, { width: `${s.pct}%`, backgroundColor: s.color }]} />
            </View>
            <Text style={styles.sevCount}>{s.count}</Text>
            <Text style={[styles.sevPct, { color: s.color }]}>{s.pct}%</Text>
          </View>
        ))}
      </View>

      {/* Monthly trend */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monthly Trend</Text>
        {[
          { month: 'Jan', low: 38, med: 30, high: 22, crit: 12 },
          { month: 'Feb', low: 35, med: 28, high: 25, crit: 14 },
          { month: 'Mar', low: 34, med: 27, high: 24, crit: 15 },
        ].map((m, i) => (
          <View key={i} style={styles.monthRow}>
            <Text style={styles.monthLabel}>{m.month}</Text>
            <View style={styles.monthBar}>
              <View style={[styles.monthSeg, { flex: m.low, backgroundColor: Colors.severityLow }]} />
              <View style={[styles.monthSeg, { flex: m.med, backgroundColor: Colors.severityMedium }]} />
              <View style={[styles.monthSeg, { flex: m.high, backgroundColor: Colors.severityHigh }]} />
              <View style={[styles.monthSeg, { flex: m.crit, backgroundColor: Colors.severityCritical }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  // ── Dangerous Roads ────────────────────────────────────
  const renderRoads = () => (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Most Dangerous Roads</Text>
        <Text style={styles.sectionSub}>Ranked by composite risk score (incidents, fatalities, density)</Text>

        {DANGEROUS_ROADS.map((r) => (
          <View key={r.rank} style={[styles.roadCard, { borderLeftWidth: 3, borderLeftColor: riskColor(r.riskScore) }]}>
            <View style={styles.roadHeader}>
              <View style={[styles.rankCircle, {
                backgroundColor: r.rank <= 3 ? riskColor(r.riskScore) + '20' : 'rgba(59,130,246,0.1)',
              }]}>
                <Text style={[styles.rankText, {
                  color: r.rank <= 3 ? riskColor(r.riskScore) : Colors.adminInfo,
                }]}>{r.rank}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roadName}>{r.name}</Text>
                <Text style={styles.roadKm}>{r.km} km monitored</Text>
              </View>
              <View style={[styles.riskBadge, { backgroundColor: riskColor(r.riskScore) + '20' }]}>
                <Text style={[styles.riskBadgeText, { color: riskColor(r.riskScore) }]}>{r.riskScore}</Text>
              </View>
            </View>

            <View style={styles.roadStats}>
              <View style={styles.roadStat}>
                <Ionicons name="warning" size={12} color={Colors.adminWarning} />
                <Text style={styles.roadStatText}>{r.incidents} incidents</Text>
              </View>
              <View style={styles.roadStat}>
                <Ionicons name="skull-outline" size={12} color={Colors.adminDanger} />
                <Text style={styles.roadStatText}>{r.fatalities} fatal</Text>
              </View>
              <View style={styles.roadStat}>
                <Ionicons name="speedometer" size={12} color={Colors.grey} />
                <Text style={styles.roadStatText}>{(r.incidents / r.km).toFixed(1)}/km</Text>
              </View>
            </View>

            <View style={styles.roadBarTrack}>
              <View style={[styles.roadBarFill, { width: `${r.riskScore}%`, backgroundColor: riskColor(r.riskScore) }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  // ── Correlations ───────────────────────────────────────
  const renderCorrelations = () => (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Incident Correlations</Text>
        <Text style={styles.sectionSub}>Statistical correlations between factors and incident frequency</Text>

        {CORRELATIONS.map((c, i) => {
          const isPositive = c.direction === 'positive';
          return (
            <View key={i} style={styles.corrCard}>
              <View style={styles.corrHeader}>
                <View style={[styles.corrIconWrap, {
                  backgroundColor: isPositive ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                }]}>
                  <Ionicons name={c.icon} size={16} color={isPositive ? Colors.adminDanger : Colors.adminSuccess} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.corrFactor}>{c.factor}</Text>
                  <Text style={[styles.corrIncident, { color: isPositive ? Colors.adminDanger : Colors.adminSuccess }]}>
                    Incidents: {c.incidents}
                  </Text>
                </View>
                <View style={[styles.corrBadge, {
                  backgroundColor: isPositive ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
                }]}>
                  <Text style={[styles.corrValue, { color: isPositive ? Colors.adminDanger : Colors.adminSuccess }]}>
                    {c.correlation > 0 ? '+' : ''}{c.correlation.toFixed(2)}
                  </Text>
                </View>
              </View>

              <View style={styles.corrBarTrack}>
                <View style={[styles.corrBarFill, {
                  width: `${Math.abs(c.correlation) * 100}%`,
                  backgroundColor: isPositive ? Colors.adminDanger : Colors.adminSuccess,
                }]} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  // ── 7-Day Prediction Bars ──────────────────────────────
  const renderPrediction = () => (
    <View>
      <View style={styles.section}>
        <View style={styles.predTitleRow}>
          <View>
            <Text style={styles.sectionTitle}>7-Day Incident Forecast</Text>
            <Text style={styles.sectionSub}>AI-predicted incident counts with confidence intervals</Text>
          </View>
          <View style={styles.aiBadge}>
            <Ionicons name="hardware-chip" size={14} color={Colors.btnPrimary} />
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
        </View>

        {/* Prediction bars */}
        {PREDICTION_DAYS.map((p, i) => (
          <View key={i} style={styles.predRow}>
            <View style={styles.predDayCol}>
              <Text style={styles.predDay}>{p.day}</Text>
              <Text style={styles.predDate}>{p.date}</Text>
            </View>
            <View style={styles.predBarCol}>
              <View style={styles.predBarTrack}>
                <View style={[styles.predBarFill, {
                  width: `${(p.predicted / maxPredicted) * 100}%`,
                  backgroundColor: predRiskColor(p.risk),
                }]} />
              </View>
            </View>
            <View style={styles.predValCol}>
              <Text style={[styles.predVal, { color: predRiskColor(p.risk) }]}>{p.predicted}</Text>
            </View>
            <View style={styles.predConfCol}>
              <Text style={styles.predConf}>{p.confidence}%</Text>
            </View>
            <View style={[styles.predRiskBadge, { backgroundColor: predRiskColor(p.risk) + '18' }]}>
              <Text style={[styles.predRiskText, { color: predRiskColor(p.risk) }]}>{p.risk}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Model info */}
      <View style={styles.section}>
        <View style={styles.noteRow}>
          <Ionicons name="hardware-chip" size={16} color={Colors.adminInfo} />
          <Text style={styles.noteText}>
            Predictions by SIARA-Forecast v2.1 -- gradient-boosted ensemble model retrained weekly on latest incident data.
          </Text>
        </View>
      </View>
    </View>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'Heatmap': return renderHeatmap();
      case 'Severity': return renderSeverity();
      case 'Roads': return renderRoads();
      case 'Correlations': return renderCorrelations();
      case 'Prediction': return renderPrediction();
      default: return null;
    }
  };

  const tabIcons = {
    Heatmap: 'grid-outline',
    Severity: 'pie-chart-outline',
    Roads: 'car-outline',
    Correlations: 'git-compare-outline',
    Prediction: 'trending-up-outline',
  };

  return (
    <View style={styles.root}>
      <AdminHeader title="Analytics" subtitle="Insights & predictions" navigation={navigation} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Summary KPIs */}
        <View style={styles.kpiRow}>
          {SUMMARY_KPIS.map((k, i) => (
            <View key={i} style={styles.kpiCard}>
              <View style={[styles.kpiIconWrap, { backgroundColor: k.color + '18' }]}>
                <Ionicons name={k.icon} size={16} color={k.color} />
              </View>
              <Text style={styles.kpiValue}>{k.value}</Text>
              <Text style={styles.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={{ marginBottom: 16 }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Ionicons name={tabIcons[tab]} size={14} color={isActive ? Colors.btnPrimary : Colors.grey} />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {renderContent()}
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  /* KPIs */
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  kpiCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    padding: 10,
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
  },
  kpiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiValue: { color: Colors.adminText, fontSize: 18, fontWeight: '800' },
  kpiLabel: { color: Colors.grey, fontSize: 10, textAlign: 'center', marginTop: 1 },

  /* Tabs */
  tabs: { gap: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    gap: 6,
  },
  tabActive: { backgroundColor: Colors.violetLight, borderColor: Colors.violetBorder },
  tabText: { color: Colors.grey, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.btnPrimary, fontWeight: '600' },

  /* Section */
  section: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: { color: Colors.adminText, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sectionSub: { color: Colors.grey, fontSize: 12, marginBottom: 14 },

  /* Heatmap 7x24 */
  heatHeader: { flexDirection: 'row', marginBottom: 2 },
  heatColHead: { width: 38, alignItems: 'center' },
  heatColText: { color: Colors.grey, fontSize: 9, fontWeight: '600' },
  heatRow: { flexDirection: 'row', marginBottom: 1 },
  heatRowHead: { width: 28, justifyContent: 'center' },
  heatRowText: { color: Colors.grey, fontSize: 8, fontWeight: '600' },
  heatCell: {
    width: 38,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    marginHorizontal: 0.5,
  },
  heatCellText: { color: Colors.white, fontSize: 8, fontWeight: '600' },
  heatLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 14 },
  heatLegendLabel: { color: Colors.grey, fontSize: 10 },
  heatLegendBox: { width: 20, height: 10, borderRadius: 2 },

  /* Donut legend */
  donutLegend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 4 },
  donutLegendItem: { alignItems: 'center', gap: 3 },
  donutLegendDot: { width: 10, height: 10, borderRadius: 5 },
  donutLegendLabel: { color: Colors.grey, fontSize: 10 },
  donutLegendPct: { fontSize: 12, fontWeight: '700' },

  /* Severity distribution */
  stackedBar: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 16 },
  stackedSeg: { height: '100%' },
  sevRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sevDot: { width: 8, height: 8, borderRadius: 4 },
  sevLabel: { color: Colors.adminText, fontSize: 12, width: 55 },
  sevBarTrack: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' },
  sevBarFill: { height: '100%', borderRadius: 4 },
  sevCount: { color: Colors.adminText, fontSize: 12, fontWeight: '600', width: 34, textAlign: 'right' },
  sevPct: { fontSize: 12, fontWeight: '700', width: 34, textAlign: 'right' },

  /* Monthly trend */
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  monthLabel: { color: Colors.grey, fontSize: 12, width: 30 },
  monthBar: { flex: 1, flexDirection: 'row', height: 16, borderRadius: 4, overflow: 'hidden' },
  monthSeg: { height: '100%' },

  /* Dangerous roads */
  roadCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
  roadHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  rankCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: { fontSize: 14, fontWeight: '800' },
  roadName: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  roadKm: { color: Colors.grey, fontSize: 10 },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  riskBadgeText: { fontSize: 16, fontWeight: '800' },
  roadStats: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  roadStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  roadStatText: { color: Colors.grey, fontSize: 11 },
  roadBarTrack: { height: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  roadBarFill: { height: '100%', borderRadius: 3 },

  /* Correlations */
  corrCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
  corrHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  corrIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corrFactor: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  corrIncident: { fontSize: 11, marginTop: 1 },
  corrBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  corrValue: { fontSize: 13, fontWeight: '700' },
  corrBarTrack: { height: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  corrBarFill: { height: '100%', borderRadius: 3 },

  /* 7-day prediction */
  predTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  aiBadgeText: { color: Colors.btnPrimary, fontSize: 11, fontWeight: '700' },
  predRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
    gap: 8,
  },
  predDayCol: { width: 36 },
  predDay: { color: Colors.adminText, fontSize: 12, fontWeight: '600' },
  predDate: { color: Colors.grey, fontSize: 9 },
  predBarCol: { flex: 1 },
  predBarTrack: { height: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' },
  predBarFill: { height: '100%', borderRadius: 6 },
  predValCol: { width: 28 },
  predVal: { fontSize: 14, fontWeight: '800', textAlign: 'right' },
  predConfCol: { width: 32 },
  predConf: { color: Colors.grey, fontSize: 10, textAlign: 'right' },
  predRiskBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, width: 56, alignItems: 'center' },
  predRiskText: { fontSize: 10, fontWeight: '700' },

  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noteText: { color: Colors.grey, fontSize: 12, flex: 1, lineHeight: 18 },
});
