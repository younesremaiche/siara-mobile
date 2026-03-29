import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';

// ── Tabs ─────────────────────────────────────────────────
const TABS = ['Performance', 'Confusion Matrix', 'Confidence Analysis', 'Override Log'];

// ── Performance KPIs ─────────────────────────────────────
const PERFORMANCE_KPIS = [
  { label: 'Accuracy', value: '92.4%', icon: 'checkmark-done-circle', color: Colors.adminSuccess, desc: 'Overall classification accuracy' },
  { label: 'Precision', value: '89.7%', icon: 'locate', color: Colors.adminInfo, desc: 'True positive rate among positives' },
  { label: 'Recall', value: '94.1%', icon: 'scan', color: Colors.adminWarning, desc: 'Sensitivity / true positive rate' },
  { label: 'F1 Score', value: '91.8%', icon: 'stats-chart', color: Colors.secondary, desc: 'Harmonic mean of precision and recall' },
];

const MODEL_STATS = [
  { label: 'Model Version', value: 'SIARA-v3.2.1' },
  { label: 'Last Trained', value: '2026-02-28' },
  { label: 'Training Samples', value: '284,631' },
  { label: 'Inference Latency', value: '~120ms' },
  { label: 'Daily Predictions', value: '~2,400' },
  { label: 'Uptime', value: '99.97%' },
];

// ── Confusion Matrix ─────────────────────────────────────
const CLASSES = ['Low', 'Medium', 'High', 'Critical'];
const CONFUSION_MATRIX = [
  // Predicted: Low, Med, High, Crit
  [312, 18, 4, 1],    // Actual: Low
  [12, 287, 22, 3],   // Actual: Medium
  [2, 15, 298, 9],    // Actual: High
  [0, 1, 8, 241],     // Actual: Critical
];

// ── Confidence Distribution ──────────────────────────────
const CONFIDENCE_BUCKETS = [
  { range: '0-10%', count: 2, pct: 0.1 },
  { range: '10-20%', count: 5, pct: 0.4 },
  { range: '20-30%', count: 8, pct: 0.6 },
  { range: '30-40%', count: 14, pct: 1.1 },
  { range: '40-50%', count: 28, pct: 2.2 },
  { range: '50-60%', count: 67, pct: 5.3 },
  { range: '60-70%', count: 142, pct: 11.2 },
  { range: '70-80%', count: 287, pct: 22.6 },
  { range: '80-90%', count: 398, pct: 31.4 },
  { range: '90-100%', count: 318, pct: 25.1 },
];

const CONFIDENCE_STATS = [
  { label: 'Mean Confidence', value: '79.6%' },
  { label: 'Median Confidence', value: '83.2%' },
  { label: 'Std Deviation', value: '14.8%' },
  { label: 'Below 50% (flagged)', value: '57 (4.5%)' },
];

// ── Override Log ─────────────────────────────────────────
const OVERRIDES = [
  { id: 'OVR-101', incident: 'INC-2465', admin: 'Admin A.', from: 'High', to: 'Critical', reason: 'Bus involved, high passenger count', time: '2026-03-06 07:02' },
  { id: 'OVR-100', incident: 'INC-2458', admin: 'Admin B.', from: 'Critical', to: 'Medium', reason: 'False positive -- staged photo detected', time: '2026-03-05 22:14' },
  { id: 'OVR-099', incident: 'INC-2451', admin: 'Admin A.', from: 'Medium', to: 'High', reason: 'School zone proximity not factored', time: '2026-03-05 16:30' },
  { id: 'OVR-098', incident: 'INC-2447', admin: 'Admin C.', from: 'Low', to: 'Medium', reason: 'Recurring location, pattern emerging', time: '2026-03-05 11:48' },
  { id: 'OVR-097', incident: 'INC-2440', admin: 'Admin A.', from: 'High', to: 'Critical', reason: 'Hazmat vehicle involved', time: '2026-03-04 19:22' },
  { id: 'OVR-096', incident: 'INC-2433', admin: 'Admin B.', from: 'Medium', to: 'Low', reason: 'Minor scratch, no injuries', time: '2026-03-04 14:05' },
  { id: 'OVR-095', incident: 'INC-2429', admin: 'Admin A.', from: 'Critical', to: 'High', reason: 'Only property damage confirmed', time: '2026-03-04 09:33' },
];

const severityColor = (s) => {
  const map = {
    Critical: Colors.severityCritical,
    High: Colors.severityHigh,
    Medium: Colors.severityMedium,
    Low: Colors.severityLow,
  };
  return map[s] || Colors.grey;
};

// ── Component ────────────────────────────────────────────
export default function AdminAIMonitoringScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('Performance');

  const maxBucket = Math.max(...CONFIDENCE_BUCKETS.map((b) => b.count));
  const maxCell = Math.max(...CONFUSION_MATRIX.flat());

  // ── Performance Tab ──────────────────────────────────
  const renderPerformance = () => (
    <View>
      {/* KPI Cards (2x2) */}
      <View style={styles.kpiGrid}>
        {PERFORMANCE_KPIS.map((kpi, idx) => (
          <View key={idx} style={styles.kpiCard}>
            <View style={[styles.kpiIconWrap, { backgroundColor: kpi.color + '20' }]}>
              <Ionicons name={kpi.icon} size={20} color={kpi.color} />
            </View>
            <Text style={styles.kpiValue}>{kpi.value}</Text>
            <Text style={styles.kpiLabel}>{kpi.label}</Text>
            <Text style={styles.kpiDesc}>{kpi.desc}</Text>
          </View>
        ))}
      </View>

      {/* Model Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Model Information</Text>
        {MODEL_STATS.map((s, i) => (
          <View key={i} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{s.label}</Text>
            <Text style={styles.infoValue}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Weekly Accuracy Trend */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weekly Accuracy Trend</Text>
        <View style={styles.trendRow}>
          {[89.1, 90.3, 91.0, 91.5, 92.0, 91.8, 92.4].map((v, i) => (
            <View key={i} style={styles.trendCol}>
              <View style={styles.trendBarTrack}>
                <View style={[styles.trendBarFill, { height: `${(v / 100) * 100}%` }]} />
              </View>
              <Text style={styles.trendLabel}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</Text>
              <Text style={styles.trendValue}>{v}%</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  // ── Confusion Matrix Tab ─────────────────────────────
  const renderConfusionMatrix = () => (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Confusion Matrix</Text>
        <Text style={styles.sectionSub}>Rows = Actual | Columns = Predicted</Text>

        {/* Column headers */}
        <View style={styles.matrixHeaderRow}>
          <View style={styles.matrixCorner} />
          {CLASSES.map((c, i) => (
            <View key={i} style={styles.matrixColHeader}>
              <Text style={[styles.matrixHeaderText, { color: severityColor(c) }]}>
                {c.substring(0, 4)}
              </Text>
            </View>
          ))}
        </View>

        {/* Matrix rows (4x4 grid) */}
        {CONFUSION_MATRIX.map((row, ri) => (
          <View key={ri} style={styles.matrixRow}>
            <View style={styles.matrixRowHeader}>
              <Text style={[styles.matrixHeaderText, { color: severityColor(CLASSES[ri]) }]}>
                {CLASSES[ri].substring(0, 4)}
              </Text>
            </View>
            {row.map((val, ci) => {
              const isDiag = ri === ci;
              const intensity = val / maxCell;
              const bgColor = isDiag
                ? `rgba(34,197,94,${0.1 + intensity * 0.4})`
                : val > 10
                ? `rgba(239,68,68,${0.1 + (val / maxCell) * 0.3})`
                : 'rgba(255,255,255,0.04)';
              return (
                <View key={ci} style={[styles.matrixCell, { backgroundColor: bgColor }]}>
                  <Text style={[styles.matrixValue, isDiag && styles.matrixValueDiag]}>
                    {val}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}

        {/* Legend */}
        <View style={styles.matrixLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: 'rgba(34,197,94,0.35)' }]} />
            <Text style={styles.legendText}>Correct (diagonal)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: 'rgba(239,68,68,0.25)' }]} />
            <Text style={styles.legendText}>Misclassified</Text>
          </View>
        </View>
      </View>

      {/* Per-class metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Per-Class Metrics</Text>
        {CLASSES.map((cls, i) => {
          const tp = CONFUSION_MATRIX[i][i];
          const rowSum = CONFUSION_MATRIX[i].reduce((a, b) => a + b, 0);
          const colSum = CONFUSION_MATRIX.reduce((a, row) => a + row[i], 0);
          const precision = ((tp / colSum) * 100).toFixed(1);
          const recall = ((tp / rowSum) * 100).toFixed(1);
          return (
            <View key={i} style={styles.classMetric}>
              <View style={[styles.classDot, { backgroundColor: severityColor(cls) }]} />
              <Text style={styles.className}>{cls}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.classBarRow}>
                  <Text style={styles.classBarLabel}>Prec</Text>
                  <View style={styles.classBarTrack}>
                    <View
                      style={[
                        styles.classBarFill,
                        { width: `${precision}%`, backgroundColor: severityColor(cls) },
                      ]}
                    />
                  </View>
                  <Text style={styles.classBarVal}>{precision}%</Text>
                </View>
                <View style={styles.classBarRow}>
                  <Text style={styles.classBarLabel}>Rec</Text>
                  <View style={styles.classBarTrack}>
                    <View
                      style={[
                        styles.classBarFill,
                        {
                          width: `${recall}%`,
                          backgroundColor: severityColor(cls) + '80',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.classBarVal}>{recall}%</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  // ── Confidence Tab ───────────────────────────────────
  const renderConfidence = () => (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Confidence Distribution</Text>
        <Text style={styles.sectionSub}>
          Distribution of AI confidence scores across all predictions
        </Text>

        {/* Histogram bars */}
        <View style={styles.histogram}>
          {CONFIDENCE_BUCKETS.map((b, i) => (
            <View key={i} style={styles.histCol}>
              <Text style={styles.histCount}>{b.count}</Text>
              <View style={styles.histBarTrack}>
                <View
                  style={[
                    styles.histBarFill,
                    {
                      height: `${(b.count / maxBucket) * 100}%`,
                      backgroundColor:
                        i >= 8
                          ? Colors.adminSuccess
                          : i >= 6
                          ? Colors.adminInfo
                          : i >= 4
                          ? Colors.adminWarning
                          : Colors.adminDanger,
                    },
                  ]}
                />
              </View>
              <Text style={styles.histLabel}>{b.range.split('-')[0]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Statistics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statistics</Text>
        {CONFIDENCE_STATS.map((s, i) => (
          <View key={i} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{s.label}</Text>
            <Text style={styles.infoValue}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Thresholds */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Confidence Thresholds</Text>
        {[
          { label: 'Auto-approve', threshold: 95, color: Colors.adminSuccess },
          { label: 'Standard review', threshold: 70, color: Colors.adminInfo },
          { label: 'Enhanced review', threshold: 50, color: Colors.adminWarning },
          { label: 'Manual only', threshold: 0, color: Colors.adminDanger },
        ].map((t, i) => (
          <View key={i} style={styles.threshRow}>
            <View style={[styles.threshDot, { backgroundColor: t.color }]} />
            <Text style={styles.threshLabel}>{t.label}</Text>
            <Text style={[styles.threshVal, { color: t.color }]}>
              {t.threshold > 0 ? `>= ${t.threshold}%` : '< 50%'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  // ── Override Log Tab ─────────────────────────────────
  const renderOverrideLog = () => (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Override Log</Text>
        <Text style={styles.sectionSub}>Admin severity changes overriding AI classification</Text>
      </View>

      {OVERRIDES.map((o) => (
        <View key={o.id} style={styles.overrideCard}>
          <View style={styles.overrideTop}>
            <Text style={styles.overrideId}>{o.id}</Text>
            <Text style={styles.overrideTime}>{o.time}</Text>
          </View>

          <View style={styles.overrideMeta}>
            <Text style={styles.overrideIncident}>{o.incident}</Text>
            <Text style={styles.overrideAdmin}>by {o.admin}</Text>
          </View>

          <View style={styles.overrideChange}>
            <View style={[styles.sevPill, { backgroundColor: severityColor(o.from) + '20' }]}>
              <Text style={[styles.sevPillText, { color: severityColor(o.from) }]}>{o.from}</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color={Colors.grey} />
            <View style={[styles.sevPill, { backgroundColor: severityColor(o.to) + '20' }]}>
              <Text style={[styles.sevPillText, { color: severityColor(o.to) }]}>{o.to}</Text>
            </View>
          </View>

          <Text style={styles.overrideReason}>
            <Text style={{ color: Colors.grey }}>Reason: </Text>
            {o.reason}
          </Text>
        </View>
      ))}

      {/* Summary stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Override Summary</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Total Overrides (30d)</Text>
          <Text style={styles.infoValue}>47</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Override Rate</Text>
          <Text style={styles.infoValue}>3.2%</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Most Common</Text>
          <Text style={styles.infoValue}>High to Critical (38%)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Top Override Admin</Text>
          <Text style={styles.infoValue}>Admin A. (24 overrides)</Text>
        </View>
      </View>
    </View>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'Performance':
        return renderPerformance();
      case 'Confusion Matrix':
        return renderConfusionMatrix();
      case 'Confidence Analysis':
        return renderConfidence();
      case 'Override Log':
        return renderOverrideLog();
      default:
        return null;
    }
  };

  return (
    <View style={styles.root}>
      <AdminHeader title="AI Monitoring" navigation={navigation} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          style={{ marginBottom: 16 }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
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

  /* Tabs */
  tabs: { gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
  tabActive: { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: Colors.adminInfo },
  tabText: { color: Colors.grey, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.adminInfo, fontWeight: '600' },

  /* Section */
  section: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: { color: Colors.white, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  sectionSub: { color: Colors.grey, fontSize: 12, marginTop: -8, marginBottom: 12 },

  /* KPI grid */
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpiCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    padding: 14,
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
  },
  kpiIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiValue: { color: Colors.white, fontSize: 24, fontWeight: '800', marginBottom: 2 },
  kpiLabel: { color: Colors.adminText, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  kpiDesc: { color: Colors.grey, fontSize: 10, textAlign: 'center' },

  /* Info rows */
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  infoLabel: { color: Colors.grey, fontSize: 13 },
  infoValue: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },

  /* Trend */
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 130,
  },
  trendCol: { alignItems: 'center', flex: 1 },
  trendBarTrack: {
    width: 20,
    height: 90,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  trendBarFill: { width: '100%', backgroundColor: Colors.adminInfo, borderRadius: 4 },
  trendLabel: { color: Colors.grey, fontSize: 10, marginTop: 4 },
  trendValue: { color: Colors.adminText, fontSize: 9, fontWeight: '600' },

  /* Confusion matrix */
  matrixHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  matrixCorner: { width: 44 },
  matrixColHeader: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  matrixHeaderText: { fontSize: 11, fontWeight: '700' },
  matrixRow: { flexDirection: 'row', marginBottom: 3 },
  matrixRowHeader: { width: 44, justifyContent: 'center', alignItems: 'center' },
  matrixCell: {
    flex: 1,
    aspectRatio: 1.4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    marginHorizontal: 1.5,
  },
  matrixValue: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  matrixValueDiag: { color: Colors.adminSuccess, fontWeight: '800' },
  matrixLegend: { flexDirection: 'row', gap: 16, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendBox: { width: 14, height: 14, borderRadius: 3 },
  legendText: { color: Colors.grey, fontSize: 11 },

  /* Per-class metrics */
  classMetric: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  classDot: { width: 8, height: 8, borderRadius: 4 },
  className: { color: Colors.adminText, fontSize: 12, fontWeight: '600', width: 55 },
  classBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  classBarLabel: { color: Colors.grey, fontSize: 10, width: 28 },
  classBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  classBarFill: { height: '100%', borderRadius: 3 },
  classBarVal: { color: Colors.adminText, fontSize: 10, fontWeight: '600', width: 38, textAlign: 'right' },

  /* Histogram */
  histogram: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 160,
    marginBottom: 8,
  },
  histCol: { alignItems: 'center', flex: 1 },
  histCount: { color: Colors.grey, fontSize: 8, marginBottom: 2 },
  histBarTrack: {
    width: 16,
    height: 110,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  histBarFill: { width: '100%', borderRadius: 3 },
  histLabel: { color: Colors.grey, fontSize: 8, marginTop: 3 },

  /* Thresholds */
  threshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  threshDot: { width: 8, height: 8, borderRadius: 4 },
  threshLabel: { color: Colors.adminText, fontSize: 13, flex: 1 },
  threshVal: { fontSize: 13, fontWeight: '600' },

  /* Override cards */
  overrideCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  overrideTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  overrideId: { color: Colors.adminInfo, fontSize: 12, fontWeight: '700' },
  overrideTime: { color: Colors.grey, fontSize: 11 },
  overrideMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  overrideIncident: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  overrideAdmin: { color: Colors.grey, fontSize: 12 },
  overrideChange: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sevPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 5 },
  sevPillText: { fontSize: 12, fontWeight: '600' },
  overrideReason: { color: Colors.adminText, fontSize: 12 },
});
