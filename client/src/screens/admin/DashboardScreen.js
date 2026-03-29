import React from 'react';
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

// ── KPI data ─────────────────────────────────────────────
const KPIS = [
  { label: 'Total Incidents', value: '1,269', icon: 'warning', color: Colors.adminDanger, sub: 'Last 30 days' },
  { label: 'Active Alerts', value: '4', icon: 'notifications', color: Colors.adminWarning, sub: 'Currently live' },
  { label: 'AI Accuracy', value: '92.4%', icon: 'hardware-chip', color: Colors.adminSuccess, sub: 'Model v3.2.1' },
  { label: 'Active Users', value: '3,847', icon: 'people', color: Colors.adminInfo, sub: 'Monthly active' },
];

// ── Recent Incidents ─────────────────────────────────────
const RECENT_INCIDENTS = [
  { id: 'INC-2471', location: 'RN1, Km 34, Blida', severity: 'Critical', time: '2 min ago', status: 'Pending' },
  { id: 'INC-2470', location: 'A1 Autoroute, Bouira', severity: 'High', time: '8 min ago', status: 'Pending' },
  { id: 'INC-2469', location: 'RN5, Tizi Ouzou', severity: 'High', time: '12 min ago', status: 'Pending' },
  { id: 'INC-2468', location: 'CW12, Setif', severity: 'Medium', time: '15 min ago', status: 'Pending' },
  { id: 'INC-2467', location: 'RN4, Tipaza', severity: 'Low', time: '22 min ago', status: 'Reviewed' },
  { id: 'INC-2466', location: 'RN11, Djelfa', severity: 'Medium', time: '31 min ago', status: 'Merged' },
];

// ── AI Predictions ───────────────────────────────────────
const AI_PREDICTIONS = [
  { zone: 'RN1 Blida', risk: 'High', confidence: 94, detail: 'Rain + rush hour pattern' },
  { zone: 'A1 East Annaba', risk: 'Elevated', confidence: 87, detail: 'Weekend traffic surge' },
  { zone: 'Constantine Ring', risk: 'Moderate', confidence: 82, detail: 'Fog expected AM' },
];

// ── Quick Actions ────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'Incidents', screen: 'AdminIncidents', icon: 'document-text', color: Colors.adminDanger },
  { label: 'Alerts', screen: 'AdminAlerts', icon: 'notifications', color: Colors.adminWarning },
  { label: 'AI Monitor', screen: 'AdminAI', icon: 'hardware-chip', color: Colors.adminSuccess },
  { label: 'Users', screen: 'AdminUsers', icon: 'people', color: Colors.adminInfo },
  { label: 'Zones', screen: 'AdminZones', icon: 'location', color: Colors.severityHigh },
  { label: 'Analytics', screen: 'AdminAnalytics', icon: 'bar-chart', color: Colors.btnPrimary },
];

// ── Weekly Trend Data ────────────────────────────────────
const WEEKLY_TREND = [
  { day: 'Mon', incidents: 38, max: 55 },
  { day: 'Tue', incidents: 42, max: 55 },
  { day: 'Wed', incidents: 45, max: 55 },
  { day: 'Thu', incidents: 40, max: 55 },
  { day: 'Fri', incidents: 52, max: 55 },
  { day: 'Sat', incidents: 55, max: 55 },
  { day: 'Sun', incidents: 35, max: 55 },
];

// ── Wilaya Ranking ───────────────────────────────────────
const WILAYA_BARS = [
  { name: 'Blida', incidents: 47, color: Colors.severityCritical },
  { name: 'Algiers', incidents: 42, color: Colors.severityCritical },
  { name: 'Tizi Ouzou', incidents: 31, color: Colors.severityHigh },
  { name: 'Oran', incidents: 28, color: Colors.severityHigh },
  { name: 'Constantine', incidents: 24, color: Colors.severityMedium },
  { name: 'Setif', incidents: 16, color: Colors.severityMedium },
  { name: 'Annaba', incidents: 12, color: Colors.severityLow },
  { name: 'Batna', incidents: 11, color: Colors.severityLow },
];
const maxWilaya = Math.max(...WILAYA_BARS.map((w) => w.incidents));

const severityColor = (s) => {
  const map = { Critical: Colors.severityCritical, High: Colors.severityHigh, Medium: Colors.severityMedium, Low: Colors.severityLow };
  return map[s] || Colors.grey;
};

const statusStyle = (status) => {
  switch (status) {
    case 'Pending':
      return { bg: 'rgba(245,158,11,0.15)', color: Colors.adminWarning };
    case 'Merged':
      return { bg: 'rgba(59,130,246,0.15)', color: Colors.adminInfo };
    case 'Reviewed':
      return { bg: 'rgba(34,197,94,0.15)', color: Colors.adminSuccess };
    default:
      return { bg: 'rgba(255,255,255,0.08)', color: Colors.grey };
  }
};

// ── Component ────────────────────────────────────────────
export default function DashboardScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.root}>
      <AdminHeader title="Dashboard" subtitle="SIARA Admin Overview" navigation={navigation} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Welcome banner */}
        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Welcome back, Super Admin</Text>
            <Text style={styles.bannerSub}>SIARA Incident Management System</Text>
          </View>
          <View style={styles.bannerBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {/* ── KPI Cards ────────────────────────────── */}
        <View style={styles.kpiGrid}>
          {KPIS.map((kpi, idx) => (
            <View key={idx} style={styles.kpiCard}>
              <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '18' }]}>
                <Ionicons name={kpi.icon} size={18} color={kpi.color} />
              </View>
              <Text style={styles.kpiValue}>{kpi.value}</Text>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
              <Text style={styles.kpiSub}>{kpi.sub}</Text>
            </View>
          ))}
        </View>

        {/* ── Quick Actions ────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {QUICK_ACTIONS.map((a, i) => (
              <TouchableOpacity
                key={i}
                style={styles.actionCard}
                onPress={() => navigation.navigate(a.screen)}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: a.color + '18' }]}>
                  <Ionicons name={a.icon} size={20} color={a.color} />
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Map Placeholder ──────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live Map Overview</Text>
          <View style={styles.mapPlaceholder}>
            <View style={styles.mapIconWrap}>
              <Ionicons name="map" size={36} color={Colors.adminInfo} />
            </View>
            <Text style={styles.mapText}>Algeria Incident Map</Text>
            <Text style={styles.mapSub}>Real-time incident markers and risk zone overlays</Text>

            <View style={styles.mapStats}>
              {[
                { label: '2 Critical', color: Colors.severityCritical },
                { label: '5 High', color: Colors.severityHigh },
                { label: '8 Medium', color: Colors.severityMedium },
                { label: '4 Low', color: Colors.severityLow },
              ].map((s, i) => (
                <View key={i} style={styles.mapStat}>
                  <View style={[styles.mapDot, { backgroundColor: s.color }]} />
                  <Text style={styles.mapStatText}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Recent Incidents ─────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Incidents</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AdminIncidents')}>
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          </View>

          {RECENT_INCIDENTS.map((inc) => {
            const st = statusStyle(inc.status);
            return (
              <TouchableOpacity
                key={inc.id}
                style={styles.incidentCard}
                onPress={() => navigation.navigate('AdminIncidentReview', { incident: inc })}
                activeOpacity={0.7}
              >
                <View style={styles.incidentTop}>
                  <View style={styles.incidentIdRow}>
                    <Text style={styles.incidentId}>{inc.id}</Text>
                    <View style={[styles.sevBadge, { backgroundColor: severityColor(inc.severity) + '18' }]}>
                      <View style={[styles.sevDot, { backgroundColor: severityColor(inc.severity) }]} />
                      <Text style={[styles.sevText, { color: severityColor(inc.severity) }]}>{inc.severity}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusText, { color: st.color }]}>{inc.status}</Text>
                  </View>
                </View>
                <View style={styles.incidentBottom}>
                  <View style={styles.incidentLocRow}>
                    <Ionicons name="location-outline" size={12} color={Colors.grey} />
                    <Text style={styles.incidentLocation} numberOfLines={1}>{inc.location}</Text>
                  </View>
                  <Text style={styles.incidentTime}>{inc.time}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Weekly Trend Bars ────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Incident Trend</Text>
          <Text style={styles.chartSub}>Incidents per day this week</Text>

          <View style={styles.trendContainer}>
            {WEEKLY_TREND.map((d, i) => {
              const barHeight = (d.incidents / d.max) * 100;
              const barColor = d.incidents >= 50 ? Colors.severityHigh : d.incidents >= 40 ? Colors.adminWarning : Colors.adminInfo;
              return (
                <View key={i} style={styles.trendCol}>
                  <Text style={[styles.trendValue, { color: barColor }]}>{d.incidents}</Text>
                  <View style={styles.trendBarWrap}>
                    <View style={[styles.trendBar, { height: `${barHeight}%`, backgroundColor: barColor }]} />
                  </View>
                  <Text style={styles.trendDay}>{d.day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Wilaya Horizontal Bars ──────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Incidents by Wilaya</Text>
          <Text style={styles.chartSub}>Top 8 wilayas by incident count (30 days)</Text>

          {WILAYA_BARS.map((w, i) => (
            <View key={i} style={styles.wilayaRow}>
              <View style={styles.wilayaRank}>
                <Text style={styles.wilayaRankText}>{i + 1}</Text>
              </View>
              <Text style={styles.wilayaName}>{w.name}</Text>
              <View style={styles.wilayaBarTrack}>
                <View style={[styles.wilayaBarFill, {
                  width: `${(w.incidents / maxWilaya) * 100}%`,
                  backgroundColor: w.color,
                }]} />
              </View>
              <Text style={[styles.wilayaVal, { color: w.color }]}>{w.incidents}</Text>
            </View>
          ))}
        </View>

        {/* ── AI Predictions ───────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>AI Predictions</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AdminAI')}>
              <Text style={styles.viewAll}>AI Monitor</Text>
            </TouchableOpacity>
          </View>

          {AI_PREDICTIONS.map((p, i) => (
            <View key={i} style={styles.predCard}>
              <View style={styles.predHeader}>
                <Ionicons name="location" size={14} color={Colors.adminInfo} />
                <Text style={styles.predZone}>{p.zone}</Text>
                <View style={[styles.predRiskBadge, {
                  backgroundColor: p.risk === 'High' ? 'rgba(239,68,68,0.15)' : p.risk === 'Elevated' ? 'rgba(249,115,22,0.15)' : 'rgba(245,158,11,0.15)',
                }]}>
                  <Text style={[styles.predRiskText, {
                    color: p.risk === 'High' ? Colors.severityCritical : p.risk === 'Elevated' ? Colors.severityHigh : Colors.adminWarning,
                  }]}>{p.risk}</Text>
                </View>
              </View>

              <View style={styles.predConfRow}>
                <View style={styles.predConfBar}>
                  <View style={[styles.predConfFill, { width: `${p.confidence}%` }]} />
                </View>
                <Text style={styles.predConfVal}>{p.confidence}%</Text>
              </View>

              <View style={styles.predDetailRow}>
                <Ionicons name="information-circle-outline" size={12} color={Colors.grey} />
                <Text style={styles.predDetail}>{p.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── System Health ────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System Health</Text>
          {[
            { label: 'API Server', status: 'Operational', color: Colors.adminSuccess },
            { label: 'AI Pipeline', status: 'Operational', color: Colors.adminSuccess },
            { label: 'Database', status: 'Operational', color: Colors.adminSuccess },
            { label: 'SMS Gateway', status: 'Degraded', color: Colors.adminWarning },
            { label: 'Map Service', status: 'Operational', color: Colors.adminSuccess },
          ].map((s, i) => (
            <View key={i} style={styles.healthRow}>
              <View style={[styles.healthDot, { backgroundColor: s.color }]} />
              <Text style={styles.healthLabel}>{s.label}</Text>
              <View style={[styles.healthBadge, { backgroundColor: s.color + '15' }]}>
                <Text style={[styles.healthStatus, { color: s.color }]}>{s.status}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  /* Banner */
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  bannerTitle: { color: Colors.adminText, fontSize: 16, fontWeight: '700' },
  bannerSub: { color: Colors.grey, fontSize: 12, marginTop: 2 },
  bannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 5,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.adminSuccess },
  liveText: { color: Colors.adminSuccess, fontSize: 11, fontWeight: '700' },

  /* KPI grid */
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpiCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 12,
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
  },
  kpiIcon: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  kpiValue: { color: Colors.adminText, fontSize: 22, fontWeight: '800' },
  kpiLabel: { color: Colors.adminText, fontSize: 12, fontWeight: '600', marginTop: 2 },
  kpiSub: { color: Colors.grey, fontSize: 10 },

  /* Section */
  section: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: Colors.adminText, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  chartSub: { color: Colors.grey, fontSize: 11, marginBottom: 14 },
  viewAll: { color: Colors.btnPrimary, fontSize: 12, fontWeight: '600' },

  /* Quick actions */
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  actionCard: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
  actionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  actionLabel: { color: Colors.adminText, fontSize: 11, fontWeight: '600' },

  /* Map placeholder */
  mapPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    minHeight: 190,
    marginTop: 8,
  },
  mapIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(59,130,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  mapText: { color: Colors.adminText, fontSize: 14, fontWeight: '600' },
  mapSub: { color: Colors.grey, fontSize: 11, marginTop: 4, marginBottom: 16 },
  mapStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  mapStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mapDot: { width: 8, height: 8, borderRadius: 4 },
  mapStatText: { color: Colors.grey, fontSize: 11 },

  /* Incident cards */
  incidentCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
  incidentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  incidentIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  incidentId: { color: Colors.adminInfo, fontSize: 12, fontWeight: '700' },
  sevBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, gap: 4 },
  sevDot: { width: 6, height: 6, borderRadius: 3 },
  sevText: { fontSize: 10, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  statusText: { fontSize: 10, fontWeight: '600' },
  incidentBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  incidentLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  incidentLocation: { color: Colors.grey, fontSize: 11 },
  incidentTime: { color: Colors.grey, fontSize: 10 },

  /* Weekly trend bars */
  trendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 10,
  },
  trendCol: { flex: 1, alignItems: 'center', gap: 4 },
  trendValue: { fontSize: 11, fontWeight: '700' },
  trendBarWrap: {
    width: '60%',
    height: 100,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  trendBar: { width: '100%', borderRadius: 4 },
  trendDay: { color: Colors.grey, fontSize: 10, fontWeight: '600' },

  /* Wilaya horizontal bars */
  wilayaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
    gap: 8,
  },
  wilayaRank: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wilayaRankText: { color: Colors.grey, fontSize: 10, fontWeight: '700' },
  wilayaName: { color: Colors.adminText, fontSize: 12, fontWeight: '500', width: 75 },
  wilayaBarTrack: { flex: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' },
  wilayaBarFill: { height: '100%', borderRadius: 5 },
  wilayaVal: { fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right' },

  /* Predictions */
  predCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
  predHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  predZone: { color: Colors.adminInfo, fontSize: 13, fontWeight: '600', flex: 1 },
  predRiskBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  predRiskText: { fontSize: 11, fontWeight: '600' },
  predConfRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  predConfBar: { flex: 1, height: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  predConfFill: { height: '100%', backgroundColor: Colors.btnPrimary, borderRadius: 3 },
  predConfVal: { color: Colors.adminText, fontSize: 11, fontWeight: '600', width: 34, textAlign: 'right' },
  predDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  predDetail: { color: Colors.grey, fontSize: 11 },

  /* System health */
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
    gap: 8,
  },
  healthDot: { width: 8, height: 8, borderRadius: 4 },
  healthLabel: { color: Colors.adminText, fontSize: 13, flex: 1 },
  healthBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 5,
  },
  healthStatus: { fontSize: 11, fontWeight: '600' },
});
