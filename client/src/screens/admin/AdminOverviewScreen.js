import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';
import {
  fetchAdminOverview,
  normalizeOverviewResponse,
  normalizeRange,
} from '../../services/adminOverviewService';

const EMPTY_OVERVIEW = normalizeOverviewResponse();
const EMPTY_TEXT = '\u2014';
const RANGE_OPTIONS = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];
const RANGE_TITLE_SUFFIX = {
  '1h': 'Last hour',
  '24h': 'Last 24h',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};
const KPI_CONFIG = [
  { key: 'incidents', label: (range) => `${RANGE_TITLE_SUFFIX[range]} Incidents`, icon: 'flash', tone: 'danger', type: 'count' },
  { key: 'pendingReview', label: () => 'Pending Review', icon: 'time', tone: 'warning', type: 'count' },
  { key: 'aiConfidence', label: () => 'AI Confidence', icon: 'hardware-chip', tone: 'info', type: 'percent' },
  { key: 'highRiskZones', label: () => 'High Risk Zones', icon: 'location', tone: 'danger', type: 'count' },
  { key: 'activeAlerts', label: () => 'Active Alerts', icon: 'notifications', tone: 'success', type: 'count' },
  { key: 'reportsPerMin', label: () => 'Reports/min', icon: 'pulse', tone: 'info', type: 'decimal' },
];

function getToneColor(tone) {
  switch (tone) {
    case 'danger':
      return Colors.adminDanger;
    case 'warning':
      return Colors.adminWarning;
    case 'success':
      return Colors.adminSuccess;
    case 'info':
    default:
      return Colors.adminInfo;
  }
}

function getTrendTone(trend) {
  const value = String(trend || '').trim().toLowerCase();

  if (!value || value === 'stable' || value === 'live' || value.startsWith('0')) {
    return 'stable';
  }

  if (value.startsWith('-')) {
    return 'down';
  }

  if (value.startsWith('+')) {
    return 'up';
  }

  return 'stable';
}

function formatTrendText(trend) {
  if (!trend) {
    return EMPTY_TEXT;
  }

  const value = String(trend).trim();

  if (value.startsWith('+')) {
    return `Up ${value.slice(1)}`;
  }

  if (value.startsWith('-')) {
    return `Down ${value.slice(1)}`;
  }

  return value;
}

function formatPercent(value) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : EMPTY_TEXT;
}

function formatDecimal(value) {
  return typeof value === 'number' ? value.toFixed(1) : EMPTY_TEXT;
}

function formatKpiValue(value, type) {
  if (type === 'percent') {
    return formatPercent(value);
  }

  if (type === 'decimal') {
    return formatDecimal(value);
  }

  return typeof value === 'number' ? String(value) : EMPTY_TEXT;
}

function capitalize(value) {
  const text = String(value || '').trim();
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : EMPTY_TEXT;
}

function getConfidenceFillClass(confidence) {
  if (typeof confidence !== 'number') {
    return null;
  }

  if (confidence >= 85) {
    return Colors.adminSuccess;
  }

  if (confidence >= 65) {
    return Colors.adminWarning;
  }

  return Colors.adminDanger;
}

function getConfidenceText(incident) {
  if (typeof incident?.confidence === 'number' && incident?.confidenceStatus === 'completed') {
    return `${incident.confidence}%`;
  }

  if (incident?.confidenceStatus === 'pending') {
    return 'Pending AI';
  }

  if (incident?.confidenceStatus === 'failed') {
    return 'AI failed';
  }

  return EMPTY_TEXT;
}

function getSeverityColor(severity) {
  switch (severity) {
    case 'high':
      return Colors.adminDanger;
    case 'medium':
      return Colors.adminWarning;
    case 'low':
      return Colors.adminSuccess;
    default:
      return Colors.grey;
  }
}

function getStatusColors(status) {
  switch (String(status || '').toLowerCase()) {
    case 'flagged':
      return { text: Colors.adminDanger, background: 'rgba(239,68,68,0.16)' };
    case 'pending':
      return { text: Colors.adminWarning, background: 'rgba(245,158,11,0.16)' };
    default:
      return { text: Colors.grey, background: 'rgba(148,163,184,0.16)' };
  }
}

function getCriticalAlertIcon(type) {
  return type === 'ai' ? 'hardware-chip' : 'warning';
}

function mapAdminRouteToScreen(route) {
  if (!route) {
    return 'AdminOverview';
  }

  if (route.startsWith('/admin/incidents')) {
    return 'AdminIncidents';
  }

  if (route.startsWith('/admin/alerts')) {
    return 'AdminAlerts';
  }

  if (route.startsWith('/admin/zones')) {
    return 'AdminZones';
  }

  if (route.startsWith('/admin/ai')) {
    return 'AdminAI';
  }

  if (route.startsWith('/admin/users')) {
    return 'AdminUsers';
  }

  if (route.startsWith('/admin/system')) {
    return 'AdminSystem';
  }

  if (route.startsWith('/admin/analytics')) {
    return 'AdminAnalytics';
  }

  return 'AdminOverview';
}

export default function AdminOverviewScreen() {
  const navigation = useNavigation();
  const [timeRange, setTimeRange] = useState('24h');
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasResolvedInitialLoad, setHasResolvedInitialLoad] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOverview() {
      setLoading(true);
      setError(null);

      try {
        const nextOverview = await fetchAdminOverview(timeRange, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setOverview(nextOverview);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setHasResolvedInitialLoad(true);
        }
      }
    }

    loadOverview();

    return () => controller.abort();
  }, [reloadToken, timeRange]);

  const showInitialLoading = loading && !hasResolvedInitialLoad;
  const maxWeeklyCount = useMemo(
    () => Math.max(...overview.weeklyVolume.map((entry) => entry.count), 0),
    [overview.weeklyVolume]
  );
  const reviewQueueCount = overview.reviewQueue.length;

  function handleRetry() {
    setReloadToken((value) => value + 1);
  }

  function handleRefresh() {
    handleRetry();
  }

  function navigateToAdminRoute(route) {
    navigation.navigate(mapAdminRouteToScreen(route));
  }

  return (
    <View style={styles.root}>
      <AdminHeader title="System Overview" subtitle="Dashboard" navigation={navigation} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading && hasResolvedInitialLoad}
            onRefresh={handleRefresh}
            tintColor={Colors.adminInfo}
          />
        }
      >
        {error ? (
          <View style={[styles.card, styles.errorCard]}>
            <View style={styles.errorHeader}>
              <View style={styles.errorCopy}>
                <Text style={styles.cardTitle}>Overview unavailable</Text>
                <Text style={styles.cardSubtitle}>
                  {error.message || 'Failed to load the admin overview.'}
                </Text>
              </View>
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.8}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {overview.criticalAlerts.map((alert) => (
          <View key={`${alert.type}-${alert.route}`} style={styles.criticalBar}>
            <View style={styles.criticalCopy}>
              <View style={styles.criticalIconWrap}>
                <Ionicons
                  name={getCriticalAlertIcon(alert.type)}
                  size={16}
                  color={Colors.adminDanger}
                />
              </View>
              <Text style={styles.criticalText}>{alert.text}</Text>
            </View>
            {alert.route ? (
              <TouchableOpacity
                onPress={() => navigateToAdminRoute(alert.route)}
                activeOpacity={0.8}
              >
                <Text style={styles.criticalAction}>{alert.action} -></Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderCopy}>
            <Text style={styles.pageTitle}>System Overview</Text>
            <Text style={styles.pageSubtitle}>
              National Risk Supervision - Real-time
              {loading && hasResolvedInitialLoad ? ' - Refreshing...' : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.exportButton} activeOpacity={0.8}>
            <Ionicons name="download-outline" size={16} color={Colors.adminText} />
            <Text style={styles.exportButtonText}>Export</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((option) => {
            const active = option.value === timeRange;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.rangeChip, active && styles.rangeChipActive]}
                onPress={() => setTimeRange(normalizeRange(option.value))}
                activeOpacity={0.8}
              >
                <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {showInitialLoading ? (
          <View style={styles.card}>
            <View style={styles.loadingState}>
              <ActivityIndicator size="small" color={Colors.adminInfo} />
              <Text style={styles.cardTitle}>Loading overview...</Text>
              <Text style={styles.cardSubtitle}>
                Pulling real incident, AI, and zone data from the backend.
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.kpiGrid}>
              {KPI_CONFIG.map((item) => {
                const config = overview.kpis[item.key];
                const toneColor = getToneColor(item.tone);
                const trendTone = getTrendTone(config.trend);

                return (
                  <View key={item.key} style={styles.kpiCard}>
                    <View style={styles.kpiHeader}>
                      <View style={[styles.kpiIconWrap, { backgroundColor: `${toneColor}20` }]}>
                        <Ionicons name={item.icon} size={18} color={toneColor} />
                      </View>
                      <Text
                        style={[
                          styles.kpiTrend,
                          trendTone === 'up'
                            ? styles.trendUp
                            : trendTone === 'down'
                            ? styles.trendDown
                            : styles.trendStable,
                        ]}
                      >
                        {formatTrendText(config.trend)}
                      </Text>
                    </View>
                    <Text style={styles.kpiValue}>{formatKpiValue(config.value, item.type)}</Text>
                    <Text style={styles.kpiLabel}>{item.label(timeRange)}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionCopy}>
                  <Text style={styles.cardTitle}>Review Queue</Text>
                  <Text style={styles.cardSubtitle}>
                    Pending and flagged incidents across all time - {reviewQueueCount} open
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => navigation.navigate('AdminIncidents')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>View Queue</Text>
                </TouchableOpacity>
              </View>

              {overview.reviewQueue.length > 0 ? (
                <View style={styles.queueList}>
                  {overview.reviewQueue.map((incident) => {
                    const severityColor = getSeverityColor(incident.severity);
                    const statusColors = getStatusColors(incident.status);
                    const confidenceColor = getConfidenceFillClass(incident.confidence);

                    return (
                      <View key={incident.reportId || incident.displayId} style={styles.queueCard}>
                        <View style={styles.queueTop}>
                          <Text style={styles.queueId}>{incident.displayId}</Text>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: statusColors.background },
                            ]}
                          >
                            <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
                              {capitalize(incident.status)}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.queueLocation} numberOfLines={2}>
                          {incident.location}
                        </Text>

                        <View style={styles.queueMetaRow}>
                          <View
                            style={[
                              styles.severityBadge,
                              { backgroundColor: `${severityColor}18` },
                            ]}
                          >
                            <View style={[styles.severityDot, { backgroundColor: severityColor }]} />
                            <Text style={[styles.severityText, { color: severityColor }]}>
                              {capitalize(incident.severity)}
                            </Text>
                          </View>
                          <Text style={styles.queueMetaText}>{incident.ago}</Text>
                        </View>

                        <View style={styles.confidenceRow}>
                          <Text style={styles.confidenceLabel}>AI Confidence</Text>
                          <Text style={styles.confidenceValue}>{getConfidenceText(incident)}</Text>
                        </View>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${typeof incident.confidence === 'number' ? incident.confidence : 0}%`,
                                backgroundColor: confidenceColor || Colors.adminBorder,
                              },
                            ]}
                          />
                        </View>

                        <TouchableOpacity
                          style={styles.queueAction}
                          onPress={() => navigation.navigate('AdminIncidents', { reportId: incident.reportId })}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.queueActionText}>Open Queue</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyStateText}>
                  No pending or flagged incidents are waiting in the review queue.
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Weekly Incident Volume</Text>
              <Text style={styles.cardSubtitle}>Live incident totals for the selected range.</Text>
              <View style={styles.weeklyChart}>
                {overview.weeklyVolume.map((entry) => {
                  const height = maxWeeklyCount > 0 ? (entry.count / maxWeeklyCount) * 100 : 0;
                  return (
                    <View key={entry.label} style={styles.weeklyColumn}>
                      <Text style={styles.weeklyValue}>{entry.count}</Text>
                      <View style={styles.weeklyBarTrack}>
                        <View style={[styles.weeklyBarFill, { height: `${height}%` }]} />
                      </View>
                      <Text style={styles.weeklyLabel}>{entry.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Severity Distribution</Text>
              <Text style={styles.cardSubtitle}>Share of incidents by severity bucket.</Text>

              {[
                { label: 'Critical / High', value: overview.severityDistribution.high, color: Colors.adminDanger },
                { label: 'Medium', value: overview.severityDistribution.medium, color: Colors.adminWarning },
                { label: 'Low', value: overview.severityDistribution.low, color: Colors.adminSuccess },
              ].map((segment) => (
                <View key={segment.label} style={styles.distributionRow}>
                  <View style={styles.distributionHeader}>
                    <Text style={styles.distributionLabel}>{segment.label}</Text>
                    <Text style={styles.distributionValue}>{segment.value}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${segment.value}%`, backgroundColor: segment.color },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Top Risk Zones</Text>
              <Text style={styles.cardSubtitle}>Most active zones returned by the web overview API.</Text>

              {overview.topRiskZones.length > 0 ? (
                <View style={styles.zoneList}>
                  {overview.topRiskZones.map((zone) => {
                    const zoneColor = zone.risk === 'high' ? Colors.adminDanger : Colors.adminWarning;

                    return (
                      <View key={zone.zone} style={styles.zoneRow}>
                        <View style={styles.zoneCopy}>
                          <Text style={styles.zoneName}>{zone.zone}</Text>
                          <Text style={styles.zoneMeta}>{zone.incidents} incidents</Text>
                        </View>
                        <View style={[styles.zoneRiskBadge, { backgroundColor: `${zoneColor}18` }]}>
                          <Text style={[styles.zoneRiskText, { color: zoneColor }]}>
                            {capitalize(zone.risk)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyStateText}>
                  No zone activity was found for this time range.
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.adminBg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    color: Colors.adminText,
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: Colors.grey,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  errorCard: {
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  errorCopy: {
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.adminDanger,
  },
  retryButtonText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  criticalBar: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  criticalCopy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  criticalIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  criticalText: {
    flex: 1,
    color: Colors.adminText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  criticalAction: {
    color: Colors.adminDanger,
    fontSize: 12,
    fontWeight: '700',
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  pageHeaderCopy: {
    flex: 1,
  },
  pageTitle: {
    color: Colors.adminText,
    fontSize: 24,
    fontWeight: '800',
  },
  pageSubtitle: {
    color: Colors.grey,
    fontSize: 13,
    marginTop: 4,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
  exportButtonText: {
    color: Colors.adminText,
    fontSize: 12,
    fontWeight: '600',
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
  rangeChipActive: {
    backgroundColor: Colors.violetLight,
    borderColor: Colors.btnPrimary,
  },
  rangeChipText: {
    color: Colors.grey,
    fontSize: 12,
    fontWeight: '600',
  },
  rangeChipTextActive: {
    color: Colors.btnPrimary,
  },
  loadingState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 14,
    padding: 14,
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiTrend: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
  trendUp: {
    color: Colors.adminSuccess,
  },
  trendDown: {
    color: Colors.adminDanger,
  },
  trendStable: {
    color: Colors.grey,
  },
  kpiValue: {
    color: Colors.adminText,
    fontSize: 23,
    fontWeight: '800',
  },
  kpiLabel: {
    color: Colors.grey,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  sectionCopy: {
    flex: 1,
  },
  primaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.btnPrimary,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  queueList: {
    gap: 10,
  },
  queueCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 14,
    padding: 14,
  },
  queueTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  queueId: {
    color: Colors.adminInfo,
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  queueLocation: {
    color: Colors.adminText,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 10,
  },
  queueMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  severityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  queueMetaText: {
    color: Colors.grey,
    fontSize: 11,
    fontWeight: '600',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  confidenceLabel: {
    color: Colors.grey,
    fontSize: 11,
    fontWeight: '600',
  },
  confidenceValue: {
    color: Colors.adminText,
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  queueAction: {
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  queueActionText: {
    color: Colors.btnPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  weeklyChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 170,
    marginTop: 14,
  },
  weeklyColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  weeklyValue: {
    color: Colors.adminText,
    fontSize: 11,
    fontWeight: '700',
  },
  weeklyBarTrack: {
    width: '56%',
    height: 110,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  weeklyBarFill: {
    width: '100%',
    backgroundColor: Colors.adminInfo,
    borderRadius: 8,
  },
  weeklyLabel: {
    color: Colors.grey,
    fontSize: 10,
    fontWeight: '700',
  },
  distributionRow: {
    marginTop: 14,
  },
  distributionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  distributionLabel: {
    color: Colors.adminText,
    fontSize: 12,
    fontWeight: '600',
  },
  distributionValue: {
    color: Colors.adminText,
    fontSize: 12,
    fontWeight: '700',
  },
  zoneList: {
    marginTop: 10,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.adminBorder,
  },
  zoneCopy: {
    flex: 1,
  },
  zoneName: {
    color: Colors.adminText,
    fontSize: 13,
    fontWeight: '600',
  },
  zoneMeta: {
    color: Colors.grey,
    fontSize: 11,
    marginTop: 3,
  },
  zoneRiskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  zoneRiskText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyStateText: {
    color: Colors.grey,
    fontSize: 12,
    lineHeight: 18,
  },
});
