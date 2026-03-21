import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';

// ── Tabs ─────────────────────────────────────────────────
const TABS = ['All', 'Active', 'Scheduled', 'Expired', 'Emergency', 'Templates'];

// ── Mock alerts ─────────────────────────────────────────
const ALERTS = [
  {
    id: 'ALR-401',
    title: 'Multi-vehicle collision -- RN1 Blida',
    severity: 'Critical',
    status: 'Active',
    zone: 'Blida Corridor',
    channels: ['Push', 'SMS'],
    createdAt: '2026-03-06 08:15',
    expiresAt: '2026-03-06 20:15',
    description: 'Major accident on RN1 near Km 34. Expect significant delays. Emergency services en route.',
    isEmergency: true,
  },
  {
    id: 'ALR-400',
    title: 'Flash flood warning -- Bejaia coast',
    severity: 'High',
    status: 'Active',
    zone: 'Bejaia Coastal',
    channels: ['Push', 'In-App'],
    createdAt: '2026-03-06 07:30',
    expiresAt: '2026-03-07 07:30',
    description: 'Heavy rainfall expected. Avoid coastal road A24 between Bejaia and Jijel.',
    isEmergency: false,
  },
  {
    id: 'ALR-399',
    title: 'Road maintenance -- A1 Bouira section',
    severity: 'Low',
    status: 'Scheduled',
    zone: 'Bouira',
    channels: ['In-App'],
    createdAt: '2026-03-05 14:00',
    expiresAt: '2026-03-08 18:00',
    description: 'Scheduled maintenance on A1 between Km 80-95. Single lane operation.',
    isEmergency: false,
  },
  {
    id: 'ALR-398',
    title: 'Dense fog advisory -- Constantine',
    severity: 'Medium',
    status: 'Active',
    zone: 'Constantine Ring',
    channels: ['Push', 'In-App', 'Email'],
    createdAt: '2026-03-06 05:00',
    expiresAt: '2026-03-06 11:00',
    description: 'Dense fog reducing visibility below 100m on Constantine ring road.',
    isEmergency: false,
  },
  {
    id: 'ALR-397',
    title: 'Weekend traffic advisory -- Oran',
    severity: 'Low',
    status: 'Expired',
    zone: 'Oran District',
    channels: ['In-App'],
    createdAt: '2026-03-01 08:00',
    expiresAt: '2026-03-02 22:00',
    description: 'Increased traffic expected around Oran port area for festival weekend.',
    isEmergency: false,
  },
  {
    id: 'ALR-396',
    title: 'Earthquake tremor notification',
    severity: 'Critical',
    status: 'Emergency',
    zone: 'National',
    channels: ['Push', 'SMS', 'In-App', 'Email'],
    createdAt: '2026-02-28 14:22',
    expiresAt: '2026-02-28 20:00',
    description: 'Seismic activity detected. Exercise caution on all roads. Check bridges and overpasses.',
    isEmergency: true,
  },
  {
    id: 'TPL-01',
    title: 'Template: Generic Road Closure',
    severity: 'Medium',
    status: 'Templates',
    zone: '--',
    channels: ['Push', 'In-App'],
    createdAt: '--',
    expiresAt: '--',
    description: '[ROAD] is closed between [POINT A] and [POINT B]. Use alternative route via [ALT].',
    isEmergency: false,
  },
  {
    id: 'TPL-02',
    title: 'Template: Weather Emergency',
    severity: 'High',
    status: 'Templates',
    zone: '--',
    channels: ['Push', 'SMS', 'In-App'],
    createdAt: '--',
    expiresAt: '--',
    description: 'Severe weather alert for [ZONE]. [TYPE] conditions expected. Avoid travel if possible.',
    isEmergency: false,
  },
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

const statusColor = (s) => {
  const map = {
    Active: Colors.adminSuccess,
    Scheduled: Colors.adminInfo,
    Expired: Colors.grey,
    Emergency: Colors.severityCritical,
    Templates: Colors.adminWarning,
  };
  return map[s] || Colors.grey;
};

const channelIcon = (ch) => {
  const map = {
    Push: 'phone-portrait',
    SMS: 'chatbubble-ellipses',
    'In-App': 'apps',
    Email: 'mail',
  };
  return map[ch] || 'ellipse';
};

// ── Component ────────────────────────────────────────────
export default function AdminAlertsScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('All');
  const [emergencyMode, setEmergencyMode] = useState(false);

  const filtered = activeTab === 'All' ? ALERTS : ALERTS.filter((a) => a.status === activeTab);

  const toggleEmergency = (val) => {
    if (val) {
      Alert.alert(
        'Activate Emergency Mode',
        'This will send push notifications and SMS to ALL users in ALL zones. Are you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Activate', style: 'destructive', onPress: () => setEmergencyMode(true) },
        ]
      );
    } else {
      Alert.alert(
        'Deactivate Emergency Mode',
        'This will stop broadcasting emergency notifications. Confirm?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Deactivate', onPress: () => setEmergencyMode(false) },
        ]
      );
    }
  };

  const renderAlertCard = (item) => (
    <View key={item.id} style={styles.card}>
      {/* Top row: ID + emergency badge + status pill */}
      <View style={styles.cardTop}>
        <View style={styles.cardIdRow}>
          <Text style={styles.cardId}>{item.id}</Text>
          {item.isEmergency && (
            <View style={styles.emergBadge}>
              <Ionicons name="flash" size={10} color={Colors.white} />
              <Text style={styles.emergText}>EMERGENCY</Text>
            </View>
          )}
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColor(item.status) + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
          <Text style={[styles.statusLabel, { color: statusColor(item.status) }]}>
            {item.status}
          </Text>
        </View>
      </View>

      {/* Title & description */}
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardDesc} numberOfLines={2}>
        {item.description}
      </Text>

      {/* Severity + zone */}
      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="warning" size={12} color={severityColor(item.severity)} />
          <Text style={[styles.metaText, { color: severityColor(item.severity) }]}>
            {item.severity}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="location" size={12} color={Colors.grey} />
          <Text style={styles.metaText}>{item.zone}</Text>
        </View>
      </View>

      {/* Channels */}
      <View style={styles.channelsRow}>
        <Text style={styles.channelsLabel}>Channels:</Text>
        {item.channels.map((ch, i) => (
          <View key={i} style={styles.channelPill}>
            <Ionicons name={channelIcon(ch)} size={11} color={Colors.adminInfo} />
            <Text style={styles.channelText}>{ch}</Text>
          </View>
        ))}
      </View>

      {/* Timestamps */}
      {item.createdAt !== '--' && (
        <View style={styles.timeRow}>
          <View style={styles.timeItem}>
            <Ionicons name="time-outline" size={11} color={Colors.grey} />
            <Text style={styles.timeText}>Created: {item.createdAt}</Text>
          </View>
          <View style={styles.timeItem}>
            <Ionicons name="hourglass-outline" size={11} color={Colors.grey} />
            <Text style={styles.timeText}>Expires: {item.expiresAt}</Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <AdminHeader title="Alerts" navigation={navigation} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ── Emergency Mode Toggle ────────────────── */}
        <View style={[styles.emergencyBar, emergencyMode && styles.emergencyBarActive]}>
          <View style={styles.emergencyLeft}>
            <Ionicons
              name="flash"
              size={20}
              color={emergencyMode ? Colors.white : Colors.severityCritical}
            />
            <View>
              <Text style={[styles.emergencyTitle, emergencyMode && { color: Colors.white }]}>
                Emergency Mode
              </Text>
              <Text style={styles.emergencySub}>
                {emergencyMode
                  ? 'ACTIVE -- Broadcasting to all users'
                  : 'Inactive -- Toggle to activate'}
              </Text>
            </View>
          </View>
          <Switch
            value={emergencyMode}
            onValueChange={toggleEmergency}
            trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(255,255,255,0.3)' }}
            thumbColor={emergencyMode ? Colors.white : Colors.grey}
          />
        </View>

        {/* ── Tabs ─────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          style={{ marginBottom: 12 }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            const count =
              tab === 'All' ? ALERTS.length : ALERTS.filter((a) => a.status === tab).length;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab}</Text>
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Create Alert Button ──────────────────── */}
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => Alert.alert('Create Alert', 'Alert creation form would open here.')}
        >
          <Ionicons name="add-circle" size={18} color={Colors.white} />
          <Text style={styles.createBtnText}>Create New Alert</Text>
        </TouchableOpacity>

        {/* Results count */}
        <Text style={styles.resultsText}>
          {filtered.length} alert{filtered.length !== 1 ? 's' : ''}
        </Text>

        {/* ── Alert Cards ──────────────────────────── */}
        {filtered.map((item) => renderAlertCard(item))}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={Colors.grey} />
            <Text style={styles.emptyText}>No alerts in this category</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  /* Emergency bar */
  emergencyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  emergencyBarActive: {
    backgroundColor: Colors.severityCritical,
    borderColor: Colors.severityCritical,
  },
  emergencyLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  emergencyTitle: { color: Colors.severityCritical, fontSize: 14, fontWeight: '700' },
  emergencySub: { color: Colors.grey, fontSize: 11 },

  /* Tabs */
  tabs: { gap: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    gap: 6,
  },
  tabActive: { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: Colors.adminInfo },
  tabText: { color: Colors.grey, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.adminInfo },
  tabBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeActive: { backgroundColor: 'rgba(59,130,246,0.3)' },
  tabBadgeText: { color: Colors.grey, fontSize: 11, fontWeight: '600' },
  tabBadgeTextActive: { color: Colors.adminInfo },

  /* Create button */
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.adminInfo,
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 12,
  },
  createBtnText: { color: Colors.white, fontSize: 14, fontWeight: '600' },

  resultsText: { color: Colors.grey, fontSize: 12, marginBottom: 10 },

  /* Card */
  card: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardId: { color: Colors.adminInfo, fontSize: 13, fontWeight: '700' },
  emergBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.severityCritical,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  emergText: { color: Colors.white, fontSize: 9, fontWeight: '700' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '600' },
  cardTitle: { color: Colors.adminText, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  cardDesc: { color: Colors.grey, fontSize: 12, marginBottom: 10 },
  cardMeta: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: Colors.grey, fontSize: 12 },

  /* Channels */
  channelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  channelsLabel: { color: Colors.grey, fontSize: 11 },
  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.1)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  channelText: { color: Colors.adminInfo, fontSize: 10, fontWeight: '500' },

  /* Time */
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  timeItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  timeText: { color: Colors.grey, fontSize: 10 },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: Colors.grey, fontSize: 14 },
});
