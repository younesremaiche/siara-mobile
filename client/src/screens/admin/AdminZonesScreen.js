import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';

// ── Tabs ─────────────────────────────────────────────────
const TABS = ['Map', 'Table', 'Ranking', 'Thresholds'];

// ── Mock Zones ───────────────────────────────────────────
const ZONES = [
  {
    id: 'ZN-01',
    name: 'RN1 Blida Corridor',
    wilaya: 'Blida',
    riskScore: 94,
    trend: 'up',
    incidents30d: 47,
    fatalities30d: 8,
    topCause: 'Speeding',
    kmRange: 'Km 20-55',
    lastIncident: '2 min ago',
    aiOverride: false,
  },
  {
    id: 'ZN-02',
    name: 'A1 Algiers-Oran Section',
    wilaya: 'Algiers / Oran',
    riskScore: 89,
    trend: 'up',
    incidents30d: 38,
    fatalities30d: 5,
    topCause: 'Fatigue / drowsy driving',
    kmRange: 'Full length',
    lastIncident: '38 min ago',
    aiOverride: true,
  },
  {
    id: 'ZN-03',
    name: 'RN5 Kabylie Mountain',
    wilaya: 'Tizi Ouzou',
    riskScore: 85,
    trend: 'stable',
    incidents30d: 31,
    fatalities30d: 4,
    topCause: 'Curves / poor visibility',
    kmRange: 'Km 60-120',
    lastIncident: '1 hr ago',
    aiOverride: false,
  },
  {
    id: 'ZN-04',
    name: 'Constantine Ring Road',
    wilaya: 'Constantine',
    riskScore: 78,
    trend: 'down',
    incidents30d: 24,
    fatalities30d: 2,
    topCause: 'Intersection collisions',
    kmRange: 'Full ring',
    lastIncident: '3 hrs ago',
    aiOverride: false,
  },
  {
    id: 'ZN-05',
    name: 'Oran Port District',
    wilaya: 'Oran',
    riskScore: 72,
    trend: 'up',
    incidents30d: 19,
    fatalities30d: 1,
    topCause: 'Heavy vehicle accidents',
    kmRange: 'Port area 12km',
    lastIncident: '5 hrs ago',
    aiOverride: true,
  },
  {
    id: 'ZN-06',
    name: 'RN3 Setif-Batna Stretch',
    wilaya: 'Setif',
    riskScore: 68,
    trend: 'stable',
    incidents30d: 16,
    fatalities30d: 2,
    topCause: 'Overtaking on single lane',
    kmRange: 'Km 10-80',
    lastIncident: '8 hrs ago',
    aiOverride: false,
  },
  {
    id: 'ZN-07',
    name: 'Annaba Coastal Highway',
    wilaya: 'Annaba',
    riskScore: 61,
    trend: 'down',
    incidents30d: 12,
    fatalities30d: 1,
    topCause: 'Wet road surface',
    kmRange: 'Km 5-35',
    lastIncident: '12 hrs ago',
    aiOverride: false,
  },
  {
    id: 'ZN-08',
    name: 'Djelfa Southern Bypass',
    wilaya: 'Djelfa',
    riskScore: 54,
    trend: 'stable',
    incidents30d: 9,
    fatalities30d: 0,
    topCause: 'Animal crossings',
    kmRange: 'Km 0-25',
    lastIncident: '1 day ago',
    aiOverride: false,
  },
];

// ── Wilaya Ranking ───────────────────────────────────────
const WILAYA_RANKING = [
  { rank: 1, name: 'Blida', incidents: 47, fatalities: 8, riskIndex: 94, change: '+3' },
  { rank: 2, name: 'Algiers', incidents: 42, fatalities: 6, riskIndex: 91, change: '+1' },
  { rank: 3, name: 'Tizi Ouzou', incidents: 31, fatalities: 4, riskIndex: 85, change: '0' },
  { rank: 4, name: 'Oran', incidents: 28, fatalities: 3, riskIndex: 80, change: '+2' },
  { rank: 5, name: 'Constantine', incidents: 24, fatalities: 2, riskIndex: 78, change: '-2' },
  { rank: 6, name: 'Setif', incidents: 16, fatalities: 2, riskIndex: 68, change: '0' },
  { rank: 7, name: 'Annaba', incidents: 12, fatalities: 1, riskIndex: 61, change: '-1' },
  { rank: 8, name: 'Batna', incidents: 11, fatalities: 1, riskIndex: 58, change: '+1' },
  { rank: 9, name: 'Djelfa', incidents: 9, fatalities: 0, riskIndex: 54, change: '0' },
  { rank: 10, name: 'Bejaia', incidents: 8, fatalities: 1, riskIndex: 52, change: '-1' },
];

// ── Threshold Config ─────────────────────────────────────
const THRESHOLDS = [
  { label: 'Critical Zone Threshold', value: 85, unit: 'risk score', desc: 'Zones above this score trigger emergency protocols', icon: 'alert-circle' },
  { label: 'High Risk Threshold', value: 70, unit: 'risk score', desc: 'Zones above this score are flagged for enhanced monitoring', icon: 'warning' },
  { label: 'Auto-Alert Trigger', value: 3, unit: 'incidents/hr', desc: 'Number of incidents per hour before auto-alert is sent', icon: 'notifications' },
  { label: 'Fatality Weight Multiplier', value: 5, unit: 'x', desc: 'Multiplier applied to fatality incidents in risk calculation', icon: 'calculator' },
  { label: 'Decay Period', value: 30, unit: 'days', desc: 'How far back incidents are counted for risk scoring', icon: 'time' },
  { label: 'Min Reports for Zone', value: 5, unit: 'reports', desc: 'Minimum reports before a zone is scored', icon: 'document-text' },
];

const severityColor = (score) => {
  if (score >= 85) return Colors.severityCritical;
  if (score >= 70) return Colors.severityHigh;
  if (score >= 55) return Colors.severityMedium;
  return Colors.severityLow;
};

const severityLabel = (score) => {
  if (score >= 85) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 55) return 'Medium';
  return 'Low';
};

// ── Component ────────────────────────────────────────────
export default function AdminZonesScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('Map');
  const [zonesState, setZonesState] = useState(ZONES);

  const toggleAiOverride = (id) => {
    setZonesState((prev) =>
      prev.map((z) => (z.id === id ? { ...z, aiOverride: !z.aiOverride } : z))
    );
  };

  // ── Map tab ───────────────────────────────────────────
  const renderMap = () => (
    <View>
      {/* Map placeholder */}
      <View style={styles.mapPlaceholder}>
        <View style={styles.mapIconWrap}>
          <Ionicons name="map" size={40} color={Colors.adminInfo} />
        </View>
        <Text style={styles.mapTitle}>Algeria Zone Risk Map</Text>
        <Text style={styles.mapSub}>Interactive Leaflet map — tap on a zone card to highlight it</Text>

        {/* Legend */}
        <View style={styles.mapLegend}>
          {[
            { label: 'Critical (85+)', color: Colors.severityCritical },
            { label: 'High (70-84)', color: Colors.severityHigh },
            { label: 'Medium (55-69)', color: Colors.severityMedium },
            { label: 'Low (<55)', color: Colors.severityLow },
          ].map((l, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: l.color }]} />
              <Text style={styles.legendText}>{l.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Quick zone list */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Zones</Text>
        {zonesState.map((z) => (
          <View key={z.id} style={styles.quickZone}>
            <View style={[styles.riskDot, { backgroundColor: severityColor(z.riskScore) }]} />
            <Text style={styles.quickName} numberOfLines={1}>{z.name}</Text>
            <Text style={[styles.quickScore, { color: severityColor(z.riskScore) }]}>{z.riskScore}</Text>
            <Ionicons
              name={z.trend === 'up' ? 'trending-up' : z.trend === 'down' ? 'trending-down' : 'remove'}
              size={14}
              color={z.trend === 'up' ? Colors.adminDanger : z.trend === 'down' ? Colors.adminSuccess : Colors.grey}
            />
          </View>
        ))}
      </View>
    </View>
  );

  // ── Table tab ────────────────────────────────────────
  const renderTable = () => (
    <View>
      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{zonesState.length}</Text>
          <Text style={styles.summaryLabel}>Total Zones</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftWidth: 2, borderLeftColor: Colors.severityCritical }]}>
          <Text style={[styles.summaryValue, { color: Colors.severityCritical }]}>
            {zonesState.filter((z) => z.riskScore >= 85).length}
          </Text>
          <Text style={styles.summaryLabel}>Critical</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftWidth: 2, borderLeftColor: Colors.severityHigh }]}>
          <Text style={[styles.summaryValue, { color: Colors.severityHigh }]}>
            {zonesState.filter((z) => z.riskScore >= 70 && z.riskScore < 85).length}
          </Text>
          <Text style={styles.summaryLabel}>High Risk</Text>
        </View>
      </View>

      {/* Zone cards with severity accent */}
      {zonesState.map((z) => (
        <View key={z.id} style={[styles.zoneCard, { borderLeftWidth: 3, borderLeftColor: severityColor(z.riskScore) }]}>
          <View style={styles.zoneHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.zoneNameRow}>
                <Text style={styles.zoneId}>{z.id}</Text>
                <Text style={styles.zoneName}>{z.name}</Text>
              </View>
              <Text style={styles.zoneWilaya}>{z.wilaya} -- {z.kmRange}</Text>
            </View>
            <View style={[styles.scoreBadge, { backgroundColor: severityColor(z.riskScore) + '20' }]}>
              <Text style={[styles.scoreBadgeText, { color: severityColor(z.riskScore) }]}>{z.riskScore}</Text>
              <Text style={[styles.scoreBadgeLabel, { color: severityColor(z.riskScore) }]}>{severityLabel(z.riskScore)}</Text>
            </View>
          </View>

          {/* Risk bar */}
          <View style={styles.riskBarRow}>
            <View style={styles.riskBarTrack}>
              <View style={[styles.riskBarFill, { width: `${z.riskScore}%`, backgroundColor: severityColor(z.riskScore) }]} />
            </View>
            <Ionicons
              name={z.trend === 'up' ? 'trending-up' : z.trend === 'down' ? 'trending-down' : 'remove'}
              size={16}
              color={z.trend === 'up' ? Colors.adminDanger : z.trend === 'down' ? Colors.adminSuccess : Colors.grey}
            />
          </View>

          {/* Stats row */}
          <View style={styles.zoneStats}>
            <View style={styles.zoneStat}>
              <Ionicons name="warning-outline" size={12} color={Colors.adminWarning} />
              <Text style={styles.zoneStatText}>{z.incidents30d} incidents</Text>
            </View>
            <View style={styles.zoneStat}>
              <Ionicons name="skull-outline" size={12} color={Colors.adminDanger} />
              <Text style={styles.zoneStatText}>{z.fatalities30d} fatalities</Text>
            </View>
            <View style={styles.zoneStat}>
              <Ionicons name="car-outline" size={12} color={Colors.grey} />
              <Text style={styles.zoneStatText}>{z.topCause}</Text>
            </View>
          </View>

          {/* AI Override toggle + footer */}
          <View style={styles.zoneFooter}>
            <Text style={styles.zoneLastIncident}>Last incident: {z.lastIncident}</Text>
            <View style={styles.aiToggleRow}>
              <Ionicons name="hardware-chip-outline" size={13} color={z.aiOverride ? Colors.adminSuccess : Colors.grey} />
              <Text style={[styles.aiToggleLabel, { color: z.aiOverride ? Colors.adminSuccess : Colors.grey }]}>AI Override</Text>
              <Switch
                value={z.aiOverride}
                onValueChange={() => toggleAiOverride(z.id)}
                trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(34,197,94,0.4)' }}
                thumbColor={z.aiOverride ? Colors.adminSuccess : Colors.grey}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  // ── Ranking tab ─────────────────────────────────────
  const renderRanking = () => (
    <View>
      <View style={styles.section}>
        <View style={styles.rankingHeader}>
          <View>
            <Text style={styles.sectionTitle}>Wilaya Risk Ranking</Text>
            <Text style={styles.sectionSub}>Based on 30-day incident data</Text>
          </View>
          <View style={styles.rankingBadge}>
            <Ionicons name="trophy" size={14} color={Colors.adminWarning} />
            <Text style={styles.rankingBadgeText}>Top 10</Text>
          </View>
        </View>

        {WILAYA_RANKING.map((w) => (
          <View key={w.rank} style={styles.rankRow}>
            <View style={[styles.rankNumWrap, {
              backgroundColor: w.rank <= 3 ? (w.rank === 1 ? 'rgba(239,68,68,0.15)' : w.rank === 2 ? 'rgba(249,115,22,0.15)' : 'rgba(245,158,11,0.15)') : 'rgba(255,255,255,0.05)',
            }]}>
              <Text style={[styles.rankNum, {
                color: w.rank <= 3 ? (w.rank === 1 ? Colors.severityCritical : w.rank === 2 ? Colors.severityHigh : Colors.adminWarning) : Colors.grey,
              }]}>{w.rank}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rankNameRow}>
                <Text style={styles.rankName}>{w.name}</Text>
                <Text style={[styles.rankChange, {
                  color: w.change.startsWith('+') ? Colors.adminDanger : w.change.startsWith('-') ? Colors.adminSuccess : Colors.grey,
                }]}>{w.change}</Text>
              </View>
              <View style={styles.rankBarTrack}>
                <View style={[styles.rankBarFill, { width: `${w.riskIndex}%`, backgroundColor: severityColor(w.riskIndex) }]} />
              </View>
              <View style={styles.rankMeta}>
                <Text style={styles.rankMetaText}>{w.incidents} incidents</Text>
                <Text style={styles.rankMetaDivider}>|</Text>
                <Text style={[styles.rankMetaText, w.fatalities > 3 && { color: Colors.adminDanger }]}>{w.fatalities} fatal</Text>
                <Text style={styles.rankMetaDivider}>|</Text>
                <Text style={[styles.rankMetaText, { color: severityColor(w.riskIndex), fontWeight: '700' }]}>Risk: {w.riskIndex}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  // ── Thresholds tab ───────────────────────────────────
  const renderThresholds = () => (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zone Threshold Configuration</Text>
        <Text style={styles.sectionSub}>Parameters controlling zone risk classification and alerting</Text>

        {THRESHOLDS.map((t, i) => (
          <View key={i} style={styles.threshCard}>
            <View style={styles.threshHeader}>
              <View style={styles.threshIconWrap}>
                <Ionicons name={t.icon} size={16} color={Colors.adminInfo} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.threshLabel}>{t.label}</Text>
                <Text style={styles.threshDesc}>{t.desc}</Text>
              </View>
              <View style={styles.threshValueWrap}>
                <Text style={styles.threshValue}>{t.value}</Text>
                <Text style={styles.threshUnit}>{t.unit}</Text>
              </View>
            </View>
            <View style={styles.threshBar}>
              <View style={[styles.threshBarFill, {
                width: `${Math.min((t.value / (t.unit === 'risk score' ? 100 : t.unit === 'days' ? 90 : 10)) * 100, 100)}%`,
                backgroundColor: t.unit === 'risk score' && t.value >= 85 ? Colors.severityCritical : Colors.adminInfo,
              }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'Map': return renderMap();
      case 'Table': return renderTable();
      case 'Ranking': return renderRanking();
      case 'Thresholds': return renderThresholds();
      default: return null;
    }
  };

  const tabIcons = { Map: 'map-outline', Table: 'grid-outline', Ranking: 'trophy-outline', Thresholds: 'options-outline' };

  return (
    <View style={styles.root}>
      <AdminHeader title="Zone Management" subtitle="Risk zones & monitoring" navigation={navigation} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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

  /* Map placeholder */
  mapPlaceholder: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 30,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 230,
  },
  mapIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(59,130,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  mapTitle: { color: Colors.adminText, fontSize: 16, fontWeight: '700' },
  mapSub: { color: Colors.grey, fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  mapLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: Colors.grey, fontSize: 10 },

  /* Quick zone list */
  quickZone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
  },
  riskDot: { width: 8, height: 8, borderRadius: 4 },
  quickName: { flex: 1, color: Colors.adminText, fontSize: 12, fontWeight: '500' },
  quickScore: { fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right' },

  /* Summary cards */
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  summaryValue: { color: Colors.adminText, fontSize: 24, fontWeight: '800' },
  summaryLabel: { color: Colors.grey, fontSize: 11, marginTop: 2 },

  /* Zone card */
  zoneCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  zoneHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  zoneNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zoneId: { color: Colors.adminInfo, fontSize: 11, fontWeight: '700' },
  zoneName: { color: Colors.adminText, fontSize: 14, fontWeight: '600' },
  zoneWilaya: { color: Colors.grey, fontSize: 11, marginTop: 2 },
  scoreBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignItems: 'center' },
  scoreBadgeText: { fontSize: 20, fontWeight: '800' },
  scoreBadgeLabel: { fontSize: 9, fontWeight: '600', marginTop: -2 },

  /* Risk bar */
  riskBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  riskBarTrack: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  riskBarFill: { height: '100%', borderRadius: 3 },

  /* Zone stats */
  zoneStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  zoneStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneStatText: { color: Colors.grey, fontSize: 11 },

  /* Zone footer */
  zoneFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.adminBorder,
    paddingTop: 8,
  },
  zoneLastIncident: { color: Colors.grey, fontSize: 10 },
  aiToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiToggleLabel: { fontSize: 11, fontWeight: '600' },

  /* Ranking */
  rankingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  rankingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rankingBadgeText: { color: Colors.adminWarning, fontSize: 11, fontWeight: '600' },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
  },
  rankNumWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNum: { fontSize: 14, fontWeight: '800' },
  rankNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rankName: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  rankChange: { fontSize: 12, fontWeight: '700' },
  rankBarTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  rankBarFill: { height: '100%', borderRadius: 3 },
  rankMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankMetaText: { color: Colors.grey, fontSize: 10 },
  rankMetaDivider: { color: Colors.adminBorder, fontSize: 10 },

  /* Threshold config */
  threshCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
  threshHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  threshIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(59,130,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  threshLabel: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  threshDesc: { color: Colors.grey, fontSize: 10, marginTop: 1 },
  threshValueWrap: { alignItems: 'flex-end' },
  threshValue: { color: Colors.adminInfo, fontSize: 20, fontWeight: '800' },
  threshUnit: { color: Colors.grey, fontSize: 9 },
  threshBar: { height: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  threshBarFill: { height: '100%', borderRadius: 3 },
});
