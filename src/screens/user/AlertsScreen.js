import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Switch,
  Alert,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';

const { width } = Dimensions.get('window');

const SEED_ALERTS = [
  { id: 1, name: 'Morning Commute Alert', type: 'route', severity: 'high', zone: 'Algiers Centre', active: true, triggers: 12 },
  { id: 2, name: 'School Zone Watch', type: 'zone', severity: 'medium', zone: 'Bab Ezzouar', active: true, triggers: 5 },
  { id: 3, name: 'Weekend Highway', type: 'route', severity: 'low', zone: 'Autoroute Est', active: false, triggers: 3 },
];

const STATUS_TABS = ['Active', 'Paused', 'Expired', 'History'];

export default function AlertsScreen({ navigation }) {
  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState('Active');

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    try {
      const raw = await AsyncStorage.getItem('siara_alerts');
      setAlerts(raw ? JSON.parse(raw) : SEED_ALERTS);
    } catch {
      setAlerts(SEED_ALERTS);
    }
  }

  async function saveAlerts(updated) {
    setAlerts(updated);
    await AsyncStorage.setItem('siara_alerts', JSON.stringify(updated));
  }

  function toggleAlert(id) {
    const updated = alerts.map((a) =>
      a.id === id ? { ...a, active: !a.active } : a
    );
    saveAlerts(updated);
  }

  function deleteAlert(id) {
    Alert.alert('Delete Alert', 'Are you sure you want to delete this alert?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => saveAlerts(alerts.filter((a) => a.id !== id)),
      },
    ]);
  }

  const filtered = alerts.filter((a) => {
    if (activeTab === 'Active') return a.active;
    if (activeTab === 'Paused') return !a.active;
    return true;
  });

  const severityColor = (s) => {
    const map = { low: Colors.severityLow, medium: Colors.severityMedium, high: Colors.severityHigh, critical: Colors.severityCritical };
    return map[s] || Colors.grey;
  };

  const typeIcon = (t) => {
    const map = { route: 'navigate', zone: 'location', weather: 'cloud', severity: 'warning' };
    return map[t] || 'alert-circle';
  };

  function renderAlert({ item }) {
    const sevClr = severityColor(item.severity);
    return (
      <View style={styles.alertCard}>
        <View style={styles.alertCardInner}>
          {/* Left accent */}
          <View style={[styles.alertAccent, { backgroundColor: sevClr }]} />

          <View style={styles.alertBody}>
            {/* Header row */}
            <View style={styles.alertHeader}>
              <View style={styles.alertTitleRow}>
                <View style={[styles.alertTypeIcon, { backgroundColor: `${sevClr}14` }]}>
                  <Ionicons name={typeIcon(item.type)} size={16} color={sevClr} />
                </View>
                <Text style={styles.alertName} numberOfLines={1}>{item.name}</Text>
              </View>
              <Switch
                value={item.active}
                onValueChange={() => toggleAlert(item.id)}
                trackColor={{ true: Colors.btnPrimary, false: Colors.border }}
                thumbColor={Colors.white}
              />
            </View>

            {/* Info row */}
            <View style={styles.alertInfoRow}>
              <View style={styles.alertInfoItem}>
                <Ionicons name="location-outline" size={13} color={Colors.subtext} />
                <Text style={styles.alertZone}>{item.zone}</Text>
              </View>
              <View style={[styles.typeBadge, { backgroundColor: Colors.blueLight, borderColor: Colors.blueBorder }]}>
                <Text style={styles.typeBadgeText}>{item.type}</Text>
              </View>
              <View style={[styles.severityPill, { backgroundColor: `${sevClr}18` }]}>
                <View style={[styles.severityDot, { backgroundColor: sevClr }]} />
                <Text style={[styles.severityPillText, { color: sevClr }]}>
                  {item.severity.charAt(0).toUpperCase() + item.severity.slice(1)}
                </Text>
              </View>
            </View>

            {/* Bottom row */}
            <View style={styles.alertBottomRow}>
              <View style={styles.triggerBadge}>
                <Ionicons name="flash" size={12} color={Colors.primary} />
                <Text style={styles.alertTriggers}>{item.triggers} triggers</Text>
              </View>
              <View style={styles.alertActions}>
                <TouchableOpacity
                  style={styles.alertActionBtn}
                  onPress={() => navigation.navigate('CreateAlert', { editAlert: item })}
                >
                  <Ionicons name="create-outline" size={18} color={Colors.secondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.alertActionBtn}
                  onPress={() => deleteAlert(item.id)}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.btnDanger} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  function renderEmpty() {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="notifications-off-outline" size={48} color={Colors.greyLight} />
        </View>
        <Text style={styles.emptyTitle}>No alerts found</Text>
        <Text style={styles.emptySubtitle}>
          {activeTab === 'Active'
            ? 'Create your first alert to stay informed about road safety.'
            : `No ${activeTab.toLowerCase()} alerts to display.`}
        </Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => navigation.navigate('CreateAlert')}
        >
          <Ionicons name="add" size={18} color={Colors.white} />
          <Text style={styles.emptyBtnText}>Create Alert</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Alerts</Text>
          <Text style={styles.subtitle}>{alerts.length} total alerts configured</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('CreateAlert')}
        >
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Tab filters */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {STATUS_TABS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, activeTab === t && styles.tabActive]}
              onPress={() => setActiveTab(t)}
            >
              <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Stats cards */}
      <View style={styles.statsRow}>
        <View style={[styles.statBox, { backgroundColor: Colors.violetLight, borderColor: Colors.violetBorder }]}>
          <Text style={[styles.statValue, { color: Colors.primary }]}>
            {alerts.filter((a) => a.active).length}
          </Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: Colors.blueLight, borderColor: Colors.blueBorder }]}>
          <Text style={[styles.statValue, { color: Colors.secondary }]}>
            {alerts.reduce((s, a) => s + a.triggers, 0)}
          </Text>
          <Text style={styles.statLabel}>Triggers</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: 'rgba(15,169,88,0.08)', borderColor: 'rgba(15,169,88,0.18)' }]}>
          <Text style={[styles.statValue, { color: Colors.accent }]}>
            {alerts.filter((a) => !a.active).length}
          </Text>
          <Text style={styles.statLabel}>Paused</Text>
        </View>
      </View>

      {/* Alert list */}
      <FlatList
        data={filtered}
        renderItem={renderAlert}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateAlert')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 8,
    backgroundColor: Colors.white,
  },
  title: {
    color: Colors.heading,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.subtext,
    fontSize: 13,
    marginTop: 2,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.btnPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.btnPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  /* Tabs */
  tabsContainer: {
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.btnPrimary,
    borderColor: Colors.btnPrimary,
  },
  tabText: {
    color: Colors.subtext,
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },

  /* Stats */
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  statBox: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: Colors.subtext,
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },

  /* Alert list */
  list: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  /* Alert card */
  alertCard: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: Colors.white,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  alertCardInner: {
    flexDirection: 'row',
  },
  alertAccent: {
    width: 4,
  },
  alertBody: {
    flex: 1,
    padding: 16,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
    marginRight: 10,
  },
  alertTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertName: {
    flex: 1,
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  alertInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  alertInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  alertZone: {
    color: Colors.subtext,
    fontSize: 12,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    color: Colors.secondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  severityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  severityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  severityPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  alertBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  triggerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  alertTriggers: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  alertActions: {
    flexDirection: 'row',
    gap: 6,
  },
  alertActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Empty state */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: Colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.btnPrimary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },

  /* FAB */
  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 34 : 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.btnPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.btnPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
});
