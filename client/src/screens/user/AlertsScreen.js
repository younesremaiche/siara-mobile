import React, { useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AlertCard from '../../components/AlertCard';
import { Colors } from '../../theme/colors';
import useMyAlerts from '../../hooks/useMyAlerts';
import { deleteMyAlert, updateAlertStatus } from '../../services/alertsService';

const STATUS_FILTERS = [
  { id: 'all',    label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
];

export default function AlertsScreen() {
  const navigation = useNavigation();
  const { alerts, isLoading, isRefreshing, error, refresh } = useMyAlerts();
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredAlerts = useMemo(() => {
    if (statusFilter === 'all') return alerts;
    return alerts.filter((item) => item.status === statusFilter);
  }, [alerts, statusFilter]);

  const stats = useMemo(() => ({
    total: alerts.length,
    active: alerts.filter((item) => item.status === 'active').length,
    triggers: alerts.reduce((sum, item) => sum + Number(item.triggerCount || 0), 0),
  }), [alerts]);

  const handlePause = useCallback((alertId) => {
    Alert.alert('Pause Alert', 'Pause this alert rule?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Pause',
        onPress: async () => {
          try {
            await updateAlertStatus(alertId, 'paused');
            refresh();
          } catch (err) {
            Alert.alert('Error', err.message || 'Failed to pause alert.');
          }
        },
      },
    ]);
  }, [refresh]);

  const handleResume = useCallback((alertId) => {
    Alert.alert('Resume Alert', 'Reactivate this alert rule?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resume',
        onPress: async () => {
          try {
            await updateAlertStatus(alertId, 'active');
            refresh();
          } catch (err) {
            Alert.alert('Error', err.message || 'Failed to resume alert.');
          }
        },
      },
    ]);
  }, [refresh]);

  const handleDelete = useCallback((alertId, alertName) => {
    Alert.alert('Delete Alert', `Delete "${alertName}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMyAlert(alertId);
            refresh();
          } catch (err) {
            Alert.alert('Error', err.message || 'Failed to delete alert.');
          }
        },
      },
    ]);
  }, [refresh]);

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.screenTitle}>My Alerts</Text>
          <Text style={styles.screenSubtitle}>Manage your notification alert rules</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
          <Ionicons name="refresh" size={20} color={Colors.heading} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.active}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.triggers}</Text>
          <Text style={styles.statLabel}>Triggers</Text>
        </View>
      </View>

      {/* New Alert CTA */}
      <TouchableOpacity
        style={styles.newAlertBtn}
        onPress={() => navigation.navigate('CreateAlert')}
        activeOpacity={0.85}
      >
        <View style={styles.newAlertIcon}>
          <Ionicons name="add" size={20} color={Colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.newAlertTitle}>+ New Alert Rule</Text>
          <Text style={styles.newAlertSub}>Get notified for incidents in a specific zone</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
      </TouchableOpacity>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {STATUS_FILTERS.map((filter) => {
          const selected = statusFilter === filter.id;
          return (
            <TouchableOpacity
              key={filter.id}
              style={[styles.filterChip, selected && styles.filterChipActive]}
              onPress={() => setStatusFilter(filter.id)}
            >
              <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Alerts unavailable</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      ) : null}

      {!error && !isLoading && filteredAlerts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="notifications-off-outline" size={32} color={Colors.greyLight} style={{ alignSelf: 'center', marginBottom: 8 }} />
          <Text style={styles.emptyTitle}>No alerts found</Text>
          <Text style={styles.emptyBody}>
            {statusFilter === 'all'
              ? 'Tap "+ New Alert Rule" above to create your first alert.'
              : `No ${statusFilter} alerts. Try a different filter.`}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (isLoading && !alerts.length && !error) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading your alerts…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AlertCard
            alert={item}
            onPause={item.status === 'active' ? () => handlePause(item.id) : undefined}
            onResume={item.status === 'paused' ? () => handleResume(item.id) : undefined}
            onDelete={() => handleDelete(item.id, item.name)}
          />
        )}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, backgroundColor: Colors.bg },
  loadingText: { color: Colors.subtext, fontSize: 14 },
  listContent: { paddingBottom: 100 },

  headerContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 16,
    gap: 16,
  },
  topHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  screenTitle: { color: Colors.heading, fontSize: 26, fontWeight: '800' },
  screenSubtitle: { color: Colors.subtext, fontSize: 13, marginTop: 4 },
  refreshButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: Colors.borderLight, alignItems: 'center', gap: 4 },
  statValue: { color: Colors.heading, fontSize: 22, fontWeight: '800' },
  statLabel: { color: Colors.subtext, fontSize: 12 },

  newAlertBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 18, borderWidth: 1, borderColor: Colors.violetBorder,
    padding: 14,
  },
  newAlertIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
  newAlertTitle: { fontSize: 14, fontWeight: '800', color: Colors.heading },
  newAlertSub: { fontSize: 12, color: Colors.subtext, marginTop: 2 },

  filterRow: { gap: 10 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { color: Colors.subtext, fontSize: 13, fontWeight: '700' },
  filterChipTextActive: { color: Colors.white },

  errorCard: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 18, padding: 16, gap: 6 },
  errorTitle: { color: Colors.heading, fontSize: 16, fontWeight: '800' },
  errorBody: { color: Colors.btnDanger, fontSize: 13, lineHeight: 20 },

  emptyCard: { backgroundColor: Colors.white, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  emptyTitle: { color: Colors.heading, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: Colors.subtext, fontSize: 13, lineHeight: 20, textAlign: 'center' },

  separator: { height: 14 },
});
