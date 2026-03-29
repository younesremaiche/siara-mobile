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
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';

// ── Tabs ─────────────────────────────────────────────────
const TABS = ['Severity Rules', 'Notifications', 'Geo-fencing', 'General'];

// ── Severity Rules ───────────────────────────────────────
const SEVERITY_RULES = [
  {
    level: 'Critical',
    color: Colors.severityCritical,
    icon: 'flame',
    conditions: [
      'Fatality confirmed or suspected',
      'Multiple vehicles (3+) involved',
      'Hazardous material spill',
      'Highway fully blocked',
      'AI confidence >= 95% for Critical',
    ],
    autoActions: ['Immediate SMS + Push to zone', 'Alert emergency services', 'Notify on-call admin'],
  },
  {
    level: 'High',
    color: Colors.severityHigh,
    icon: 'alert-circle',
    conditions: [
      'Injuries reported (non-fatal)',
      'Two vehicles involved with significant damage',
      'Road partially blocked',
      'School zone or hospital zone proximity',
    ],
    autoActions: ['Push notification to zone', 'Add to admin review queue', 'Update risk zone score'],
  },
  {
    level: 'Medium',
    color: Colors.severityMedium,
    icon: 'warning',
    conditions: [
      'Minor injuries or property damage',
      'Single vehicle incident',
      'Traffic significantly slowed',
      'Duplicate reports from area',
    ],
    autoActions: ['In-app notification to nearby users', 'Add to standard review queue'],
  },
  {
    level: 'Low',
    color: Colors.severityLow,
    icon: 'information-circle',
    conditions: [
      'No injuries reported',
      'Minor property damage only',
      'Traffic minimally affected',
      'Near-miss or hazard report',
    ],
    autoActions: ['In-app notification only', 'Batch review (non-urgent)'],
  },
];

// ── Notification Channels ────────────────────────────────
const NOTIFICATION_CHANNELS = [
  { key: 'push', label: 'Push Notifications', icon: 'phone-portrait', desc: 'Mobile push via FCM/APNs', color: Colors.adminInfo },
  { key: 'sms', label: 'SMS Alerts', icon: 'chatbubble-ellipses', desc: 'Critical alerts via SMS gateway', color: Colors.adminWarning },
  { key: 'inapp', label: 'In-App Notifications', icon: 'apps', desc: 'Within SIARA app notification center', color: Colors.btnPrimary },
  { key: 'email', label: 'Email Digests', icon: 'mail', desc: 'Daily/weekly summary emails', color: Colors.adminSuccess },
];

// ── Geo-fencing Config ───────────────────────────────────
const GEOFENCE_RULES = [
  { label: 'Default Alert Radius', value: '5 km', desc: 'Radius around incident for user notifications', icon: 'radio-outline' },
  { label: 'Critical Expansion', value: '15 km', desc: 'Extended radius for critical severity incidents', icon: 'expand-outline' },
  { label: 'Highway Buffer Zone', value: '2 km', desc: 'Buffer along highway corridors for incident matching', icon: 'git-merge-outline' },
  { label: 'Urban Density Factor', value: '0.6x', desc: 'Reduced radius in high-density urban areas', icon: 'business-outline' },
  { label: 'Wilaya Boundary Mode', value: 'Soft', desc: 'Alerts cross wilaya boundaries when near borders', icon: 'globe-outline' },
  { label: 'Minimum Fence Size', value: '500m', desc: 'Smallest geo-fence radius allowed', icon: 'resize-outline' },
];

// ── General Settings ─────────────────────────────────────
const GENERAL_SETTINGS_TOGGLES = [
  { key: 'autoApprove', label: 'Auto-Approve High Confidence', desc: 'Auto-approve incidents with AI confidence >= 95%', default: true, icon: 'checkmark-done' },
  { key: 'maintenance', label: 'Maintenance Mode', desc: 'Show maintenance banner to all users', default: false, icon: 'construct' },
  { key: 'debugMode', label: 'Debug Logging', desc: 'Enable verbose logging for troubleshooting', default: false, icon: 'bug' },
  { key: 'aiActive', label: 'AI Classification Active', desc: 'Enable real-time AI incident classification', default: true, icon: 'hardware-chip' },
  { key: 'communityReports', label: 'Community Reporting', desc: 'Allow non-admin users to submit reports', default: true, icon: 'people' },
  { key: 'anonymousReports', label: 'Anonymous Reports', desc: 'Allow reports without user identification', default: false, icon: 'eye-off' },
];

const DATA_RETENTION = [
  { label: 'Incident Data', value: '365 days', icon: 'document-text' },
  { label: 'User Activity Logs', value: '180 days', icon: 'people' },
  { label: 'AI Model Logs', value: '90 days', icon: 'hardware-chip' },
  { label: 'Alert History', value: '365 days', icon: 'notifications' },
  { label: 'Audit Trail', value: '730 days', icon: 'shield-checkmark' },
];

const RATE_LIMITS = [
  { label: 'Reports per user/hour', value: '10', icon: 'document' },
  { label: 'API requests per minute', value: '120', icon: 'code-slash' },
  { label: 'Alert broadcasts per hour', value: '50', icon: 'megaphone' },
  { label: 'Bulk operations per day', value: '5', icon: 'layers' },
];

// ── Component ────────────────────────────────────────────
export default function AdminSystemSettingsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('Severity Rules');
  const [channels, setChannels] = useState({ push: true, sms: true, inapp: true, email: false });
  const [toggles, setToggles] = useState(
    GENERAL_SETTINGS_TOGGLES.reduce((acc, t) => ({ ...acc, [t.key]: t.default }), {})
  );

  const toggleChannel = (key) => {
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSetting = (key) => {
    if (key === 'maintenance' && !toggles.maintenance) {
      Alert.alert(
        'Enable Maintenance Mode',
        'Users will see a maintenance banner and some features will be restricted. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable', onPress: () => setToggles((prev) => ({ ...prev, [key]: true })) },
        ]
      );
      return;
    }
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Severity Rules ────────────────────────────────────
  const renderSeverityRules = () => (
    <View>
      {SEVERITY_RULES.map((rule, i) => (
        <View key={i} style={[styles.ruleCard, { borderLeftWidth: 3, borderLeftColor: rule.color }]}>
          <View style={styles.ruleHeader}>
            <View style={[styles.ruleIconWrap, { backgroundColor: rule.color + '18' }]}>
              <Ionicons name={rule.icon} size={18} color={rule.color} />
            </View>
            <Text style={[styles.ruleLevel, { color: rule.color }]}>{rule.level}</Text>
          </View>

          <Text style={styles.ruleSubhead}>Classification Conditions</Text>
          {rule.conditions.map((c, ci) => (
            <View key={ci} style={styles.conditionRow}>
              <View style={[styles.conditionBullet, { backgroundColor: rule.color }]} />
              <Text style={styles.conditionText}>{c}</Text>
            </View>
          ))}

          <Text style={[styles.ruleSubhead, { marginTop: 12 }]}>Automated Actions</Text>
          {rule.autoActions.map((a, ai) => (
            <View key={ai} style={styles.conditionRow}>
              <Ionicons name="flash" size={12} color={Colors.adminWarning} />
              <Text style={styles.conditionText}>{a}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );

  // ── Notifications ─────────────────────────────────────
  const renderNotifications = () => (
    <View>
      {/* Channel toggles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Channels</Text>
        <Text style={styles.sectionSub}>Enable or disable notification delivery methods</Text>

        {NOTIFICATION_CHANNELS.map((ch) => (
          <View key={ch.key} style={styles.channelRow}>
            <View style={[styles.channelIcon, { backgroundColor: ch.color + '15' }]}>
              <Ionicons name={ch.icon} size={18} color={ch.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.channelLabel}>{ch.label}</Text>
              <Text style={styles.channelDesc}>{ch.desc}</Text>
            </View>
            <Switch
              value={channels[ch.key]}
              onValueChange={() => toggleChannel(ch.key)}
              trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(34,197,94,0.4)' }}
              thumbColor={channels[ch.key] ? Colors.adminSuccess : Colors.grey}
            />
          </View>
        ))}
      </View>

      {/* Severity-Channel Matrix */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Severity-Channel Matrix</Text>
        <Text style={styles.sectionSub}>Which channels are used for each severity level</Text>

        <View style={styles.matrixHeader}>
          <View style={{ width: 65 }} />
          {['Push', 'SMS', 'In-App', 'Email'].map((h, i) => (
            <View key={i} style={styles.matrixColHead}>
              <Text style={styles.matrixColText}>{h}</Text>
            </View>
          ))}
        </View>

        {[
          { level: 'Critical', channels: [true, true, true, true] },
          { level: 'High', channels: [true, false, true, true] },
          { level: 'Medium', channels: [false, false, true, false] },
          { level: 'Low', channels: [false, false, true, false] },
        ].map((row, ri) => (
          <View key={ri} style={styles.matrixRow}>
            <View style={{ width: 65 }}>
              <Text style={[styles.matrixRowLabel, { color: SEVERITY_RULES[ri].color }]}>{row.level}</Text>
            </View>
            {row.channels.map((on, ci) => (
              <View key={ci} style={styles.matrixCell}>
                <View style={[styles.matrixDot, { backgroundColor: on ? Colors.adminSuccess + '20' : 'rgba(255,255,255,0.05)' }]}>
                  <Ionicons
                    name={on ? 'checkmark' : 'close'}
                    size={14}
                    color={on ? Colors.adminSuccess : 'rgba(255,255,255,0.2)'}
                  />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Quiet hours */}
      <View style={styles.section}>
        <View style={styles.quietHeader}>
          <Ionicons name="moon" size={18} color={Colors.btnPrimary} />
          <Text style={styles.sectionTitle}>Quiet Hours</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Quiet Period</Text>
          <Text style={styles.infoValue}>23:00 - 06:00</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Override for Critical</Text>
          <View style={styles.infoBadgeYes}>
            <Text style={styles.infoBadgeYesText}>Yes</Text>
          </View>
        </View>
        <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.infoLabel}>Batch non-critical</Text>
          <View style={styles.infoBadgeYes}>
            <Text style={styles.infoBadgeYesText}>Yes</Text>
          </View>
        </View>
      </View>
    </View>
  );

  // ── Geo-fencing ────────────────────────────────────────
  const renderGeofencing = () => (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Geo-fencing Parameters</Text>
        <Text style={styles.sectionSub}>Controls how location-based alerts and matching work</Text>

        {GEOFENCE_RULES.map((g, i) => (
          <View key={i} style={styles.geoRow}>
            <View style={styles.geoIconWrap}>
              <Ionicons name={g.icon} size={16} color={Colors.adminInfo} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.geoLabel}>{g.label}</Text>
              <Text style={styles.geoDesc}>{g.desc}</Text>
            </View>
            <View style={styles.geoValueWrap}>
              <Text style={styles.geoValue}>{g.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Map placeholder */}
      <View style={styles.geoMapPlaceholder}>
        <View style={styles.geoMapIconWrap}>
          <Ionicons name="navigate" size={32} color={Colors.adminInfo} />
        </View>
        <Text style={styles.geoMapText}>Geo-fence Visualization</Text>
        <Text style={styles.geoMapSub}>Visual fence editor would render here</Text>
      </View>
    </View>
  );

  // ── General ────────────────────────────────────────────
  const renderGeneral = () => (
    <View>
      {/* Toggle settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>System Toggles</Text>

        {GENERAL_SETTINGS_TOGGLES.map((t) => (
          <View key={t.key} style={styles.toggleRow}>
            <View style={[styles.toggleIcon, {
              backgroundColor: toggles[t.key] ? Colors.adminSuccess + '15' : 'rgba(255,255,255,0.05)',
            }]}>
              <Ionicons name={t.icon} size={16} color={toggles[t.key] ? Colors.adminSuccess : Colors.grey} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{t.label}</Text>
              <Text style={styles.toggleDesc}>{t.desc}</Text>
            </View>
            <Switch
              value={toggles[t.key]}
              onValueChange={() => toggleSetting(t.key)}
              trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(34,197,94,0.4)' }}
              thumbColor={toggles[t.key] ? Colors.adminSuccess : Colors.grey}
            />
          </View>
        ))}
      </View>

      {/* Data Retention */}
      <View style={styles.section}>
        <View style={styles.retentionHeader}>
          <Ionicons name="server-outline" size={18} color={Colors.adminInfo} />
          <Text style={styles.sectionTitle}>Data Retention</Text>
        </View>
        {DATA_RETENTION.map((d, i) => (
          <View key={i} style={styles.retentionRow}>
            <View style={styles.retentionIcon}>
              <Ionicons name={d.icon} size={16} color={Colors.adminInfo} />
            </View>
            <Text style={styles.retentionLabel}>{d.label}</Text>
            <View style={styles.retentionValueWrap}>
              <Text style={styles.retentionValue}>{d.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Rate Limits */}
      <View style={styles.section}>
        <View style={styles.retentionHeader}>
          <Ionicons name="speedometer-outline" size={18} color={Colors.adminWarning} />
          <Text style={styles.sectionTitle}>Rate Limits</Text>
        </View>
        {RATE_LIMITS.map((r, i) => (
          <View key={i} style={styles.rateLimitRow}>
            <View style={styles.rateLimitIcon}>
              <Ionicons name={r.icon} size={14} color={Colors.adminWarning} />
            </View>
            <Text style={styles.rateLimitLabel}>{r.label}</Text>
            <View style={styles.rateLimitValueWrap}>
              <Text style={styles.rateLimitValue}>{r.value}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'Severity Rules': return renderSeverityRules();
      case 'Notifications': return renderNotifications();
      case 'Geo-fencing': return renderGeofencing();
      case 'General': return renderGeneral();
      default: return null;
    }
  };

  const tabIcons = {
    'Severity Rules': 'layers-outline',
    'Notifications': 'notifications-outline',
    'Geo-fencing': 'navigate-outline',
    'General': 'settings-outline',
  };

  return (
    <View style={styles.root}>
      <AdminHeader title="System Settings" subtitle="Configuration & rules" navigation={navigation} />

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

  /* Severity rules */
  ruleCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  ruleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ruleLevel: { fontSize: 18, fontWeight: '800' },
  ruleSubhead: { color: Colors.grey, fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  conditionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4, paddingLeft: 4 },
  conditionBullet: { width: 5, height: 5, borderRadius: 3, marginTop: 5 },
  conditionText: { color: Colors.adminText, fontSize: 12, flex: 1 },

  /* Notification channels */
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
  },
  channelIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelLabel: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  channelDesc: { color: Colors.grey, fontSize: 11, marginTop: 1 },

  /* Matrix */
  matrixHeader: { flexDirection: 'row', marginBottom: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.adminBorder },
  matrixColHead: { flex: 1, alignItems: 'center' },
  matrixColText: { color: Colors.grey, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
  },
  matrixRowLabel: { fontSize: 12, fontWeight: '700' },
  matrixCell: { flex: 1, alignItems: 'center' },
  matrixDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Quiet hours */
  quietHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },

  /* Info rows */
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
  },
  infoLabel: { color: Colors.grey, fontSize: 13 },
  infoValue: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  infoBadgeYes: {
    backgroundColor: Colors.adminSuccess + '18',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 5,
  },
  infoBadgeYesText: { color: Colors.adminSuccess, fontSize: 12, fontWeight: '600' },

  /* Geo-fencing */
  geoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
    gap: 10,
  },
  geoIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(59,130,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  geoLabel: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  geoDesc: { color: Colors.grey, fontSize: 11, marginTop: 1 },
  geoValueWrap: {
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  geoValue: { color: Colors.btnPrimary, fontSize: 13, fontWeight: '700' },
  geoMapPlaceholder: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    minHeight: 170,
  },
  geoMapIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(59,130,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  geoMapText: { color: Colors.adminText, fontSize: 14, fontWeight: '600' },
  geoMapSub: { color: Colors.grey, fontSize: 12, marginTop: 4 },

  /* Toggle rows */
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
    gap: 10,
  },
  toggleIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleLabel: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  toggleDesc: { color: Colors.grey, fontSize: 11, marginTop: 1 },

  /* Retention */
  retentionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  retentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
    gap: 10,
  },
  retentionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(59,130,246,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retentionLabel: { color: Colors.adminText, fontSize: 13, flex: 1 },
  retentionValueWrap: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 5,
  },
  retentionValue: { color: Colors.adminInfo, fontSize: 12, fontWeight: '700' },

  /* Rate limits */
  rateLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
    gap: 10,
  },
  rateLimitIcon: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: 'rgba(245,158,11,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rateLimitLabel: { color: Colors.adminText, fontSize: 13, flex: 1 },
  rateLimitValueWrap: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 5,
  },
  rateLimitValue: { color: Colors.adminWarning, fontSize: 13, fontWeight: '700' },
});
