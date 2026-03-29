import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AlertCard from '../../components/AlertCard';
import { Colors } from '../../theme/colors';
import useMyAlerts from '../../hooks/useMyAlerts';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
];

export default function AlertsScreen() {
  const { alerts, isLoading, isRefreshing, error, refresh } = useMyAlerts();
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredAlerts = useMemo(() => {
    if (statusFilter === 'all') {
      return alerts;
    }

    return alerts.filter((item) => item.status === statusFilter);
  }, [alerts, statusFilter]);

  const stats = useMemo(() => ({
    total: alerts.length,
    active: alerts.filter((item) => item.status === 'active').length,
    triggers: alerts.reduce((sum, item) => sum + Number(item.triggerCount || 0), 0),
  }), [alerts]);

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.screenTitle}>My Alerts</Text>
          <Text style={styles.screenSubtitle}>Authenticated alerts from the SIARA backend</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={refresh}>
          <Ionicons name="refresh" size={20} color={Colors.heading} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total alerts</Text>
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
          <Text style={styles.emptyTitle}>No alerts found</Text>
          <Text style={styles.emptyBody}>
            {statusFilter === 'all'
              ? 'You do not have any saved alerts yet.'
              : `No ${statusFilter} alerts were returned for your account.`}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (isLoading && !alerts.length && !error) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading your alerts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AlertCard alert={item} />}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        refreshControl={(
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.bg,
  },
  loadingText: {
    color: Colors.subtext,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 100,
  },
  headerContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 16,
    gap: 16,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  screenTitle: {
    color: Colors.heading,
    fontSize: 26,
    fontWeight: '800',
  },
  screenSubtitle: {
    color: Colors.subtext,
    fontSize: 13,
    marginTop: 4,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: Colors.heading,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: Colors.subtext,
    fontSize: 12,
  },
  filterRow: {
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    color: Colors.subtext,
    fontSize: 13,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: Colors.white,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  errorTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  errorBody: {
    color: Colors.btnDanger,
    fontSize: 13,
    lineHeight: 20,
  },
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  emptyTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyBody: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 20,
  },
  separator: {
    height: 14,
  },
});
