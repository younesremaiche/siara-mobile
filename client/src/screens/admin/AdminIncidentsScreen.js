import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AdminHeader from '../../components/layout/AdminHeader';
import {
  fetchAdminIncidents,
  normalizeIncidentFilter,
} from '../../services/adminIncidentsService';
import { Colors } from '../../theme/colors';

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'ai-flagged', label: 'AI Flagged' },
  { key: 'community', label: 'Community' },
  { key: 'merged', label: 'Merged' },
  { key: 'archived', label: 'Archived' },
];

const SORT_OPTIONS = [
  { key: 'confidence', label: 'Confidence' },
  { key: 'createdAt', label: 'Newest' },
  { key: 'severity', label: 'Severity' },
];

function formatLabel(value) {
  return String(value || 'Unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateTime(value) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString();
}

function getEmptyState(filter, completedAiReports) {
  if (filter === 'ai-flagged' && completedAiReports === 0) {
    return 'AI verification is not active yet for incident reports.';
  }

  if (filter === 'community') {
    return 'No reports currently have open community flags.';
  }

  if (filter === 'merged') {
    return 'No merged incidents were found.';
  }

  if (filter === 'archived') {
    return 'No archived incidents were found.';
  }

  if (filter === 'pending') {
    return 'No pending incidents are waiting for review.';
  }

  return 'No incidents match the current filters.';
}

function getSeverityColor(severity) {
  switch (severity) {
    case 'high':
      return Colors.severityHigh;
    case 'medium':
      return Colors.severityMedium;
    default:
      return Colors.severityLow;
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'verified':
      return Colors.adminSuccess;
    case 'rejected':
      return Colors.adminDanger;
    case 'merged':
      return Colors.adminInfo;
    case 'archived':
      return Colors.grey;
    default:
      return Colors.adminWarning;
  }
}

function getConfidenceLabel(item) {
  if (typeof item.confidence === 'number' && item.confidenceStatus === 'completed') {
    return `${item.confidence}%`;
  }

  if (item.confidenceStatus === 'pending') {
    return 'Pending AI';
  }

  if (item.confidenceStatus === 'failed') {
    return 'AI failed';
  }

  return 'Unknown';
}

export default function AdminIncidentsScreen() {
  const navigation = useNavigation();
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('confidence');
  const [sortDir, setSortDir] = useState('desc');
  const [incidents, setIncidents] = useState([]);
  const [counts, setCounts] = useState({
    all: 0,
    pending: 0,
    'ai-flagged': 0,
    community: 0,
    merged: 0,
    archived: 0,
    completedAiReports: 0,
  });
  const [meta, setMeta] = useState({
    returned: 0,
    completedAiReports: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function loadIncidents() {
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchAdminIncidents(
          {
            filter: normalizeIncidentFilter(activeFilter),
            search,
            sortField,
            sortDir,
          },
          { signal: controller.signal }
        );

        if (isMounted && !controller.signal.aborted) {
          setIncidents(payload.incidents);
          setCounts(payload.counts);
          setMeta(payload.meta);
        }
      } catch (requestError) {
        if (isMounted && !controller.signal.aborted) {
          setError(requestError);
        }
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadIncidents();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [activeFilter, search, sortDir, sortField]);

  async function refreshList() {
    setRefreshing(true);
    setError(null);
    try {
      const payload = await fetchAdminIncidents({
        filter: normalizeIncidentFilter(activeFilter),
        search,
        sortField,
        sortDir,
      });
      setIncidents(payload.incidents);
      setCounts(payload.counts);
      setMeta(payload.meta);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setRefreshing(false);
    }
  }

  function toggleSort(nextField) {
    if (sortField === nextField) {
      setSortDir((current) => (current === 'desc' ? 'asc' : 'desc'));
      return;
    }

    setSortField(nextField);
    setSortDir('desc');
  }

  const header = useMemo(
    () => (
      <View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={Colors.grey} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search ID, title, location, reporter..."
            placeholderTextColor={Colors.grey}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.grey} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{counts[activeFilter] ?? 0}</Text>
            <Text style={styles.summaryLabel}>In View</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{counts.all}</Text>
            <Text style={styles.summaryLabel}>Total Reports</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{counts.pending}</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
        </View>

        <FlatList
          data={FILTER_TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.tabs}
          renderItem={({ item }) => {
            const isActive = activeFilter === item.key;
            return (
              <TouchableOpacity
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveFilter(item.key)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{item.label}</Text>
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                    {counts[item.key] ?? 0}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        <FlatList
          data={SORT_OPTIONS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.sortRow}
          renderItem={({ item }) => {
            const active = sortField === item.key;
            return (
              <TouchableOpacity
                style={[styles.sortChip, active && styles.sortChipActive]}
                onPress={() => toggleSort(item.key)}
              >
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                  {item.label}
                </Text>
                {active ? (
                  <Ionicons
                    name={sortDir === 'desc' ? 'arrow-down' : 'arrow-up'}
                    size={12}
                    color={Colors.adminInfo}
                  />
                ) : null}
              </TouchableOpacity>
            );
          }}
        />

        <Text style={styles.resultsText}>
          Showing {incidents.length} of {counts[activeFilter] ?? 0} incidents
        </Text>
      </View>
    ),
    [activeFilter, counts, incidents.length, search, sortDir, sortField]
  );

  function renderIncident({ item }) {
    const severityColor = getSeverityColor(item.severity);
    const statusColor = getStatusColor(item.status);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('AdminIncidentReview', { reportId: item.reportId })}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardId}>{item.displayId}</Text>
            <Text style={styles.cardTitle}>{item.title || formatLabel(item.incidentType)}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}20` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {formatLabel(item.status)}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.severityPill, { backgroundColor: `${severityColor}18` }]}>
            <Ionicons name="warning-outline" size={12} color={severityColor} />
            <Text style={[styles.severityText, { color: severityColor }]}>
              {formatLabel(item.severity)}
            </Text>
          </View>
          {item.openFlagCount > 0 ? (
            <View style={styles.flagPill}>
              <Ionicons name="flag-outline" size={12} color={Colors.adminWarning} />
              <Text style={styles.flagText}>{item.openFlagCount} open flag{item.openFlagCount === 1 ? '' : 's'}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={14} color={Colors.grey} />
          <Text style={styles.detailText}>{item.location}</Text>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>AI Confidence</Text>
            <Text style={styles.infoValue}>{getConfidenceLabel(item)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Age</Text>
            <Text style={styles.infoValue}>{item.ago || 'Unknown'}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Created</Text>
            <Text style={styles.infoValue}>{formatDateTime(item.createdAt)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.reviewButton}
          onPress={() => navigation.navigate('AdminIncidentReview', { reportId: item.reportId })}
        >
          <Ionicons name="eye-outline" size={15} color={Colors.adminInfo} />
          <Text style={styles.reviewButtonText}>Review Incident</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  function renderEmptyState() {
    if (loading) {
      return (
        <View style={styles.stateCard}>
          <ActivityIndicator size="small" color={Colors.adminInfo} />
          <Text style={styles.stateText}>Loading incident reports...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.stateCard}>
          <Ionicons name="alert-circle-outline" size={28} color={Colors.adminDanger} />
          <Text style={styles.stateTitle}>Could not load incidents</Text>
          <Text style={styles.stateText}>{error.message || 'Unknown error'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refreshList}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.stateCard}>
        <Ionicons name="file-tray-outline" size={28} color={Colors.grey} />
        <Text style={styles.stateTitle}>No incidents found</Text>
        <Text style={styles.stateText}>
          {getEmptyState(activeFilter, meta.completedAiReports)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AdminHeader title="Incident Management" navigation={navigation} />

      <FlatList
        data={incidents}
        keyExtractor={(item) => item.reportId || item.displayId}
        renderItem={renderIncident}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshList}
            tintColor={Colors.adminInfo}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  listContent: { padding: 16, paddingBottom: 30, gap: 10 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
    height: 46,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: Colors.adminText, fontSize: 14, padding: 0 },

  summaryCard: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  summaryStat: {
    flex: 1,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  summaryValue: { color: Colors.adminText, fontSize: 18, fontWeight: '800' },
  summaryLabel: { color: Colors.grey, fontSize: 11, marginTop: 4 },

  tabs: { gap: 8, paddingBottom: 12 },
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
  tabActive: { backgroundColor: Colors.blueLight, borderColor: Colors.blueBorder },
  tabText: { color: Colors.grey, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.adminInfo },
  tabBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeActive: { backgroundColor: 'rgba(59,130,246,0.24)' },
  tabBadgeText: { color: Colors.grey, fontSize: 11, fontWeight: '600' },
  tabBadgeTextActive: { color: Colors.adminInfo },

  sortRow: { gap: 8, paddingBottom: 12 },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortChipActive: { borderColor: Colors.blueBorder, backgroundColor: Colors.blueLight },
  sortChipText: { color: Colors.grey, fontSize: 12, fontWeight: '600' },
  sortChipTextActive: { color: Colors.adminInfo },

  resultsText: { color: Colors.grey, fontSize: 12, marginBottom: 10 },

  card: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  cardId: { color: Colors.adminInfo, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  cardTitle: { color: Colors.adminText, fontSize: 15, fontWeight: '700' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  severityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  severityText: { fontSize: 11, fontWeight: '700' },
  flagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  flagText: { color: Colors.adminWarning, fontSize: 11, fontWeight: '700' },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  detailText: { color: Colors.grey, fontSize: 12, flex: 1 },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  infoItem: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 10,
  },
  infoLabel: { color: Colors.grey, fontSize: 10, marginBottom: 4, textTransform: 'uppercase' },
  infoValue: { color: Colors.adminText, fontSize: 11, lineHeight: 16, fontWeight: '600' },

  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.blueBorder,
    backgroundColor: Colors.blueLight,
    paddingVertical: 10,
  },
  reviewButtonText: { color: Colors.adminInfo, fontSize: 12, fontWeight: '700' },

  stateCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  stateTitle: { color: Colors.adminText, fontSize: 15, fontWeight: '700' },
  stateText: { color: Colors.grey, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  retryButton: {
    marginTop: 4,
    backgroundColor: Colors.adminInfo,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
});
