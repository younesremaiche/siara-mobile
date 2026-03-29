import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
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
  fetchAdminOperationalAlerts,
  fetchOperationalAlertTemplates,
  normalizeOperationalAlertTab,
} from '../../services/adminOperationalAlertsService';
import { Colors } from '../../theme/colors';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'expired', label: 'Expired' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'templates', label: 'Templates' },
];

const DEFAULT_PAGE_SIZE = 20;

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

function getSeverityColor(severity) {
  switch (severity) {
    case 'critical':
      return Colors.severityCritical;
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
    case 'active':
      return Colors.adminSuccess;
    case 'scheduled':
      return Colors.adminInfo;
    case 'expired':
      return Colors.grey;
    case 'cancelled':
      return Colors.adminDanger;
    default:
      return Colors.adminWarning;
  }
}

function getTemplateSearchMatch(template, search) {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    template.name,
    template.description,
    template.alertType,
    template.defaultTitle,
    template.defaultMessage,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

function getAudienceText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value.toLocaleString()} users`;
  }

  return '0 users';
}

function getChannelLabels(alert) {
  const channels = [];
  if (alert.sendPush) channels.push('Push');
  if (alert.sendSms) channels.push('SMS');
  if (alert.sendEmail) channels.push('Email');
  return channels;
}

export default function AdminAlertsScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [alerts, setAlerts] = useState([]);
  const [counts, setCounts] = useState({
    all: 0,
    active: 0,
    scheduled: 0,
    expired: 0,
    emergency: 0,
    templates: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    returned: 0,
  });
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [templatesError, setTemplatesError] = useState(null);

  const templateTabActive = activeTab === 'templates';
  const filteredTemplates = useMemo(
    () => templates.filter((template) => getTemplateSearchMatch(template, search)),
    [templates, search]
  );
  const tabCounts = useMemo(
    () => ({
      ...counts,
      templates: counts.templates || templates.length,
    }),
    [counts, templates.length]
  );

  useEffect(() => {
    setPage(1);
  }, [activeTab, search]);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function loadTemplates() {
      try {
        setTemplatesError(null);
        const items = await fetchOperationalAlertTemplates({ signal: controller.signal });
        if (isMounted && !controller.signal.aborted) {
          setTemplates(items);
          setCounts((current) => ({ ...current, templates: items.length }));
        }
      } catch (requestError) {
        if (isMounted && !controller.signal.aborted) {
          setTemplatesError(requestError);
        }
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setTemplatesLoading(false);
        }
      }
    }

    loadTemplates();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (templateTabActive) {
      setAlerts([]);
      setPagination((current) => ({ ...current, total: 0, returned: 0 }));
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let isMounted = true;

    async function loadAlerts() {
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchAdminOperationalAlerts(
          {
            tab: normalizeOperationalAlertTab(activeTab),
            search,
            page,
            pageSize: DEFAULT_PAGE_SIZE,
          },
          { signal: controller.signal }
        );

        if (isMounted && !controller.signal.aborted) {
          setAlerts(payload.items);
          setCounts(payload.counts);
          setPagination(payload.pagination);
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

    loadAlerts();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [activeTab, page, search, templateTabActive]);

  async function refreshCurrentView() {
    setRefreshing(true);
    setError(null);

    if (templateTabActive) {
      try {
        setTemplatesError(null);
        const items = await fetchOperationalAlertTemplates();
        setTemplates(items);
        setCounts((current) => ({ ...current, templates: items.length }));
      } catch (requestError) {
        setTemplatesError(requestError);
      } finally {
        setRefreshing(false);
      }
      return;
    }

    try {
      const payload = await fetchAdminOperationalAlerts({
        tab: normalizeOperationalAlertTab(activeTab),
        search,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      });
      setAlerts(payload.items);
      setCounts(payload.counts);
      setPagination(payload.pagination);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setRefreshing(false);
    }
  }

  function renderSummaryCard() {
    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.summaryTitle}>Operational Alerts</Text>
            <Text style={styles.summarySubtitle}>
              Real backend data from the admin alert endpoints
            </Text>
          </View>
          <TouchableOpacity
            style={styles.composeButton}
            onPress={() => Alert.alert('Alert Authoring', 'Alert creation is still handled from the web admin for now.')}
          >
            <Ionicons name="add-circle-outline" size={16} color={Colors.adminInfo} />
            <Text style={styles.composeButtonText}>Compose</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryStats}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{tabCounts.active}</Text>
            <Text style={styles.summaryLabel}>Active</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{tabCounts.scheduled}</Text>
            <Text style={styles.summaryLabel}>Scheduled</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryValue, { color: Colors.severityCritical }]}>
              {tabCounts.emergency}
            </Text>
            <Text style={styles.summaryLabel}>Emergency</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderAlertCard(item) {
    const channels = getChannelLabels(item);
    const severityColor = getSeverityColor(item.severity);
    const statusColor = getStatusColor(item.status);

    return (
      <View key={item.id || item.displayId} style={styles.card}>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.cardId}>{item.displayId}</Text>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: `${statusColor}20` }]}>
            <View style={[styles.pillDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.pillText, { color: statusColor }]}>{formatLabel(item.status)}</Text>
          </View>
        </View>

        <Text style={styles.cardDescription}>{item.description}</Text>

        <View style={styles.metaRow}>
          <View style={[styles.metaPill, { backgroundColor: `${severityColor}18` }]}>
            <Ionicons name="warning-outline" size={12} color={severityColor} />
            <Text style={[styles.metaPillText, { color: severityColor }]}>
              {formatLabel(item.severity)}
            </Text>
          </View>
          <View style={styles.metaPill}>
            <Ionicons name="location-outline" size={12} color={Colors.grey} />
            <Text style={styles.metaText}>{item.zoneLabel}</Text>
          </View>
        </View>

        <View style={styles.statGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Type</Text>
            <Text style={styles.statText}>{formatLabel(item.type)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Trigger</Text>
            <Text style={styles.statText}>{formatLabel(item.trigger)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Audience</Text>
            <Text style={styles.statText}>{getAudienceText(item.audience)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Duration</Text>
            <Text style={styles.statText}>{item.duration || 'Unknown'}</Text>
          </View>
        </View>

        <View style={styles.channelRow}>
          <Text style={styles.channelLabel}>Channels</Text>
          {channels.length > 0 ? (
            channels.map((channel) => (
              <View key={channel} style={styles.channelPill}>
                <Text style={styles.channelText}>{channel}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.channelFallback}>No external channels</Text>
          )}
        </View>

        <View style={styles.timeGrid}>
          <View style={styles.timeItem}>
            <Text style={styles.timeLabel}>Created</Text>
            <Text style={styles.timeText}>{formatDateTime(item.createdAt)}</Text>
          </View>
          <View style={styles.timeItem}>
            <Text style={styles.timeLabel}>Starts</Text>
            <Text style={styles.timeText}>{formatDateTime(item.startsAt)}</Text>
          </View>
          <View style={styles.timeItem}>
            <Text style={styles.timeLabel}>Ends</Text>
            <Text style={styles.timeText}>{formatDateTime(item.endsAt)}</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderTemplateCard(template) {
    const severityColor = getSeverityColor(template.defaultSeverity);
    const channels = [
      template.sendPush ? 'Push' : null,
      template.sendSms ? 'SMS' : null,
      template.sendEmail ? 'Email' : null,
    ].filter(Boolean);

    return (
      <View key={template.id || template.name} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardId}>Template</Text>
            <Text style={styles.cardTitle}>{template.name}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: `${severityColor}20` }]}>
            <Text style={[styles.pillText, { color: severityColor }]}>
              {formatLabel(template.defaultSeverity)}
            </Text>
          </View>
        </View>

        <Text style={styles.cardDescription}>{template.description}</Text>
        <Text style={styles.templatePreview}>{template.defaultMessage}</Text>

        <View style={styles.statGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Type</Text>
            <Text style={styles.statText}>{formatLabel(template.alertType)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Duration</Text>
            <Text style={styles.statText}>{template.defaultDuration || 'Unknown'}</Text>
          </View>
        </View>

        <View style={styles.channelRow}>
          <Text style={styles.channelLabel}>Channels</Text>
          {channels.length > 0 ? (
            channels.map((channel) => (
              <View key={channel} style={styles.channelPill}>
                <Text style={styles.channelText}>{channel}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.channelFallback}>No external channels</Text>
          )}
        </View>
      </View>
    );
  }

  function renderBody() {
    if (loading || (templateTabActive && templatesLoading)) {
      return (
        <View style={styles.stateCard}>
          <ActivityIndicator size="small" color={Colors.adminInfo} />
          <Text style={styles.stateText}>
            {templateTabActive ? 'Loading alert templates...' : 'Loading operational alerts...'}
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.stateCard}>
          <Ionicons name="alert-circle-outline" size={28} color={Colors.adminDanger} />
          <Text style={styles.stateTitle}>Could not load alerts</Text>
          <Text style={styles.stateText}>{error.message || 'Unknown error'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refreshCurrentView}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (templateTabActive) {
      if (templatesError) {
        return (
          <View style={styles.stateCard}>
            <Ionicons name="alert-circle-outline" size={28} color={Colors.adminDanger} />
            <Text style={styles.stateTitle}>Could not load templates</Text>
            <Text style={styles.stateText}>{templatesError.message || 'Unknown error'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={refreshCurrentView}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        );
      }

      if (filteredTemplates.length === 0) {
        return (
          <View style={styles.stateCard}>
            <Ionicons name="copy-outline" size={28} color={Colors.grey} />
            <Text style={styles.stateTitle}>No templates found</Text>
            <Text style={styles.stateText}>
              {search
                ? 'No templates match the current search.'
                : 'No operational alert templates are available yet.'}
            </Text>
          </View>
        );
      }

      return filteredTemplates.map(renderTemplateCard);
    }

    if (alerts.length === 0) {
      return (
        <View style={styles.stateCard}>
          <Ionicons name="notifications-off-outline" size={28} color={Colors.grey} />
          <Text style={styles.stateTitle}>No alerts in this view</Text>
          <Text style={styles.stateText}>
            {activeTab === 'emergency'
              ? 'No emergency operational alerts were found.'
              : 'No operational alerts match this view yet.'}
          </Text>
        </View>
      );
    }

    return (
      <>
        {alerts.map(renderAlertCard)}

        {pagination.totalPages > 1 && (
          <View style={styles.paginationBar}>
            <TouchableOpacity
              style={[styles.pageButton, page <= 1 && styles.pageButtonDisabled]}
              disabled={page <= 1}
              onPress={() => setPage((current) => Math.max(1, current - 1))}
            >
              <Text style={styles.pageButtonText}>Previous</Text>
            </TouchableOpacity>
            <Text style={styles.paginationText}>
              Page {pagination.page} of {pagination.totalPages}
            </Text>
            <TouchableOpacity
              style={[
                styles.pageButton,
                page >= pagination.totalPages && styles.pageButtonDisabled,
              ]}
              disabled={page >= pagination.totalPages}
              onPress={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
            >
              <Text style={styles.pageButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
  }

  return (
    <View style={styles.root}>
      <AdminHeader title="Alerts" navigation={navigation} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshCurrentView}
            tintColor={Colors.adminInfo}
          />
        }
      >
        {renderSummaryCard()}

        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={Colors.grey} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search title, zone, or type..."
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          style={{ marginBottom: 12 }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                    {tabCounts[tab.key] ?? 0}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.resultsText}>
          {templateTabActive
            ? `${filteredTemplates.length} template${filteredTemplates.length === 1 ? '' : 's'}`
            : `Showing ${alerts.length} of ${tabCounts[activeTab] ?? 0} alert${(tabCounts[activeTab] ?? 0) === 1 ? '' : 's'}`}
        </Text>

        {renderBody()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  summaryCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  summaryTitle: { color: Colors.adminText, fontSize: 16, fontWeight: '700' },
  summarySubtitle: { color: Colors.grey, fontSize: 12, marginTop: 4 },
  composeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.blueLight,
    borderWidth: 1,
    borderColor: Colors.blueBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  composeButtonText: { color: Colors.adminInfo, fontSize: 12, fontWeight: '600' },
  summaryStats: { flexDirection: 'row', gap: 10 },
  summaryStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryValue: { color: Colors.adminText, fontSize: 20, fontWeight: '800' },
  summaryLabel: { color: Colors.grey, fontSize: 11, marginTop: 4 },

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
  resultsText: { color: Colors.grey, fontSize: 12, marginBottom: 12 },

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
    gap: 12,
    marginBottom: 8,
  },
  cardId: { color: Colors.adminInfo, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  cardTitle: { color: Colors.adminText, fontSize: 15, fontWeight: '700' },
  cardDescription: { color: Colors.grey, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  templatePreview: {
    color: Colors.adminText,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  metaPillText: { fontSize: 11, fontWeight: '600' },
  metaText: { color: Colors.adminText, fontSize: 11, fontWeight: '500' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statItem: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 10,
  },
  statLabel: { color: Colors.grey, fontSize: 10, marginBottom: 4, textTransform: 'uppercase' },
  statText: { color: Colors.adminText, fontSize: 12, fontWeight: '600' },

  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  channelLabel: { color: Colors.grey, fontSize: 11, fontWeight: '600' },
  channelPill: {
    backgroundColor: Colors.blueLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  channelText: { color: Colors.adminInfo, fontSize: 11, fontWeight: '600' },
  channelFallback: { color: Colors.grey, fontSize: 11 },

  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeItem: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 10,
  },
  timeLabel: { color: Colors.grey, fontSize: 10, marginBottom: 4, textTransform: 'uppercase' },
  timeText: { color: Colors.adminText, fontSize: 11, lineHeight: 16 },

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

  paginationBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  pageButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.blueLight,
  },
  pageButtonDisabled: { opacity: 0.4 },
  pageButtonText: { color: Colors.adminInfo, fontSize: 12, fontWeight: '700' },
  paginationText: { color: Colors.adminText, fontSize: 12, fontWeight: '600' },
});
