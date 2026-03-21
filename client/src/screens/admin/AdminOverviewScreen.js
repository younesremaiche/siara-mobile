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

// ── KPI Cards ────────────────────────────────────────────
const KPI_CARDS = [
  {
    label: 'Total Incidents',
    value: '1,247',
    icon: 'warning',
    color: Colors.adminDanger,
    delta: '+12%',
    deltaDir: 'up',
  },
  {
    label: 'Active Alerts',
    value: '23',
    icon: 'notifications',
    color: Colors.adminWarning,
    delta: '-3%',
    deltaDir: 'down',
  },
  {
    label: 'AI Predictions Today',
    value: '2,400',
    icon: 'hardware-chip',
    color: Colors.btnPrimary,
    delta: '+8%',
    deltaDir: 'up',
  },
  {
    label: 'Active Users',
    value: '847',
    icon: 'people',
    color: Colors.adminInfo,
    delta: '+5%',
    deltaDir: 'up',
  },
];

// ── System Health ───────────────────────────────────────
const SYSTEM_HEALTH = [
  { label: 'AI Model', status: 'Online', icon: 'hardware-chip', color: Colors.adminSuccess },
  { label: 'API Gateway', status: 'Online', icon: 'cloud', color: Colors.adminSuccess },
  { label: 'Database', status: 'Online', icon: 'server', color: Colors.adminSuccess },
  { label: 'ML Service', status: 'Online', icon: 'analytics', color: Colors.adminSuccess },
];

// ── Recent Activity ─────────────────────────────────────
const RECENT_ACTIVITY = [
  { id: 1, icon: 'warning', color: Colors.severityCritical, text: 'Critical incident reported on RN1 near Blida', time: '2 min ago' },
  { id: 2, icon: 'checkmark-circle', color: Colors.adminSuccess, text: 'Incident INC-2468 approved by Admin A.', time: '8 min ago' },
  { id: 3, icon: 'hardware-chip', color: Colors.adminInfo, text: 'AI model retrained -- accuracy improved to 92.4%', time: '25 min ago' },
  { id: 4, icon: 'notifications', color: Colors.adminWarning, text: 'Flash flood alert issued for Bejaia coastal zone', time: '42 min ago' },
  { id: 5, icon: 'person-add', color: Colors.btnPrimary, text: 'New admin user registered: Karim B.', time: '1 hr ago' },
];

// ── Quick Actions ───────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'Incidents', screen: 'AdminIncidents', icon: 'document-text', color: Colors.adminDanger },
  { label: 'Alerts', screen: 'AdminAlerts', icon: 'notifications', color: Colors.adminWarning },
  { label: 'AI Monitor', screen: 'AdminAI', icon: 'hardware-chip', color: Colors.adminSuccess },
  { label: 'Analytics', screen: 'AdminAnalytics', icon: 'bar-chart', color: Colors.adminInfo },
];

// ── Component ────────────────────────────────────────────
export default function AdminOverviewScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.root}>
      <AdminHeader
        title="System Overview"
        subtitle="Dashboard"
        navigation={navigation}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ── KPI Cards (2x2 grid) ──────────────────────── */}
        <View style={styles.kpiGrid}>
          {KPI_CARDS.map((kpi, idx) => (
            <View key={idx} style={styles.kpiCard}>
              <View style={styles.kpiTop}>
                <View style={[styles.kpiIconWrap, { backgroundColor: kpi.color + '20' }]}>
                  <Ionicons name={kpi.icon} size={18} color={kpi.color} />
                </View>
                <View style={styles.kpiDeltaWrap}>
                  <Ionicons
                    name={kpi.deltaDir === 'up' ? 'trending-up' : 'trending-down'}
                    size={14}
                    color={kpi.deltaDir === 'up' ? Colors.adminSuccess : Colors.adminDanger}
                  />
                  <Text
                    style={[
                      styles.kpiDelta,
                      { color: kpi.deltaDir === 'up' ? Colors.adminSuccess : Colors.adminDanger },
                    ]}
                  >
                    {kpi.delta}
                  </Text>
                </View>
              </View>
              <Text style={styles.kpiValue}>{kpi.value}</Text>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>

        {/* ── System Health ────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System Health</Text>
          <View style={styles.healthGrid}>
            {SYSTEM_HEALTH.map((item, idx) => (
              <View key={idx} style={styles.healthCard}>
                <View style={[styles.healthIconWrap, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <Text style={styles.healthLabel}>{item.label}</Text>
                <View style={styles.healthStatusRow}>
                  <View style={[styles.healthDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.healthStatus, { color: item.color }]}>{item.status}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Recent Activity ─────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {RECENT_ACTIVITY.map((item, idx) => (
            <View
              key={item.id}
              style={[
                styles.activityRow,
                idx === RECENT_ACTIVITY.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View style={[styles.activityIconWrap, { backgroundColor: item.color + '18' }]}>
                <Ionicons name={item.icon} size={16} color={item.color} />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityText} numberOfLines={2}>
                  {item.text}
                </Text>
                <Text style={styles.activityTime}>{item.time}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Quick Actions ───────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            {QUICK_ACTIONS.map((action, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.actionCard}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('AdminMain', { screen: action.screen })}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: action.color + '20' }]}>
                  <Ionicons name={action.icon} size={20} color={action.color} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
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

  /* KPI grid */
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 16,
    width: '48%',
    flexGrow: 1,
  },
  kpiTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiDeltaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  kpiDelta: { fontSize: 12, fontWeight: '600' },
  kpiValue: {
    color: Colors.white,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 2,
  },
  kpiLabel: { color: Colors.grey, fontSize: 12 },

  /* Section */
  section: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },

  /* System health */
  healthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  healthCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 14,
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
  },
  healthIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  healthLabel: {
    color: Colors.adminText,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  healthStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  healthDot: { width: 7, height: 7, borderRadius: 4 },
  healthStatus: { fontSize: 12, fontWeight: '600' },

  /* Recent activity */
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  activityIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  activityContent: { flex: 1 },
  activityText: {
    color: Colors.adminText,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 3,
  },
  activityTime: { color: Colors.grey, fontSize: 11 },

  /* Quick actions */
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionCard: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    color: Colors.adminText,
    fontSize: 12,
    fontWeight: '600',
  },
});
