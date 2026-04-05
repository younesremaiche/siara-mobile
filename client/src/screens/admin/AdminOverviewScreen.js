import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AdminHeader from '../../components/layout/AdminHeader';
import { fetchAdminIncidentCounts } from '../../services/adminIncidentsService';
import { fetchAdminOverview, normalizeOverviewResponse, normalizeRange } from '../../services/adminOverviewService';
import { Colors } from '../../theme/colors';

const EMPTY_OVERVIEW = normalizeOverviewResponse();
const EMPTY_TEXT = '-';
const RANGE_OPTIONS = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];
const KPI_CONFIG = [
  ['incidents', 'Incidents', 'warning-outline', Colors.adminDanger, 'count'],
  ['pendingReview', 'Pending Review', 'time-outline', Colors.adminWarning, 'count'],
  ['aiConfidence', 'AI Confidence', 'hardware-chip-outline', Colors.adminInfo, 'percent'],
  ['highRiskZones', 'High Risk Zones', 'location-outline', Colors.adminDanger, 'count'],
  ['activeAlerts', 'Active Alerts', 'notifications-outline', Colors.adminSuccess, 'count'],
  ['reportsPerMin', 'Reports / Min', 'pulse-outline', Colors.adminInfo, 'decimal'],
];

function formatTrend(value) {
  if (!value) return EMPTY_TEXT;
  const text = String(value).trim();
  if (text.startsWith('+')) return `Up ${text.slice(1)}`;
  if (text.startsWith('-')) return `Down ${text.slice(1)}`;
  return text;
}

function formatPercent(value, digits = 1) {
  return typeof value === 'number' ? `${value.toFixed(digits)}%` : EMPTY_TEXT;
}

function formatValue(value, type) {
  if (type === 'percent') return formatPercent(value);
  if (type === 'decimal') return typeof value === 'number' ? value.toFixed(1) : EMPTY_TEXT;
  return typeof value === 'number' ? String(value) : EMPTY_TEXT;
}

function formatDateTime(value) {
  if (!value) return EMPTY_TEXT;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? EMPTY_TEXT : date.toLocaleString();
}

function formatMlStatus(value) {
  const text = String(value || '').trim();
  if (!text) return 'Not started';
  return text.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatPredictedLabel(value) {
  if (!value) return 'Unclassified';
  return value === 'spam' ? 'Spam' : 'Real';
}

function formatAiConfidence(item) {
  if (typeof item?.confidence === 'number' && item.confidenceStatus === 'completed') {
    return `${item.confidence}%`;
  }
  if (item?.confidenceStatus === 'pending') return 'Pending AI';
  if (item?.confidenceStatus === 'failed') return 'AI failed';
  return EMPTY_TEXT;
}

function parseAdminRoute(route) {
  if (!route) return { screen: 'AdminOverview', params: undefined };
  if (route.startsWith('/admin/incidents')) {
    const match = route.match(/[?&]filter=([^&]+)/);
    return {
      screen: 'AdminIncidents',
      params: match ? { filter: decodeURIComponent(match[1]) } : undefined,
    };
  }
  if (route.startsWith('/admin/alerts')) return { screen: 'AdminAlerts' };
  if (route.startsWith('/admin/zones')) return { screen: 'AdminZones' };
  if (route.startsWith('/admin/ai')) return { screen: 'AdminAI' };
  if (route.startsWith('/admin/users')) return { screen: 'AdminUsers' };
  if (route.startsWith('/admin/system')) return { screen: 'AdminSystem' };
  if (route.startsWith('/admin/analytics')) return { screen: 'AdminAnalytics' };
  return { screen: 'AdminOverview', params: undefined };
}

export default function AdminOverviewScreen() {
  const navigation = useNavigation();
  const [timeRange, setTimeRange] = useState('24h');
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [counts, setCounts] = useState({ all: 0, pending: 0, suspicious: 0, 'pending-review': 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [nextOverview, nextCounts] = await Promise.all([
          fetchAdminOverview(timeRange, { signal: controller.signal }),
          fetchAdminIncidentCounts({ signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) {
          setOverview(nextOverview);
          setCounts(nextCounts);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setReady(true);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [reloadToken, timeRange]);

  const spamRate = useMemo(() => {
    if (!counts.all) return null;
    return (counts.suspicious / counts.all) * 100;
  }, [counts.all, counts.suspicious]);
  const maxWeeklyCount = useMemo(() => Math.max(...overview.weeklyVolume.map((entry) => entry.count), 0), [overview.weeklyVolume]);

  return (
    <View style={styles.root}>
      <AdminHeader title="System Overview" subtitle="Dashboard" navigation={navigation} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading && ready} onRefresh={() => setReloadToken((value) => value + 1)} tintColor={Colors.adminInfo} />}
      >
        {error ? (
          <View style={[styles.card, styles.errorCard]}>
            <Text style={styles.title}>Overview unavailable</Text>
            <Text style={styles.subtle}>{error.message || 'Failed to load the admin overview.'}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setReloadToken((value) => value + 1)} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {overview.criticalAlerts.map((alert) => (
          <View key={`${alert.type}-${alert.text}`} style={styles.alertBar}>
            <View style={styles.alertCopy}>
              <Ionicons name={alert.type === 'ai' ? 'hardware-chip-outline' : 'warning-outline'} size={16} color={Colors.adminDanger} />
              <Text style={styles.alertText}>{alert.text}</Text>
            </View>
            {alert.route ? (
              <TouchableOpacity
                onPress={() => {
                  const target = parseAdminRoute(alert.route);
                  navigation.navigate(target.screen, target.params);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.alertAction}>{alert.action || 'Open'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        <View style={styles.headerBlock}>
          <Text style={styles.pageTitle}>Spam and safety overview</Text>
          <Text style={styles.pageSubtitle}>Admin metrics now come from the real backend spam detection contract.</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('AdminIncidents', { filter: 'suspicious' })} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>Suspicious queue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('AdminIncidents', { filter: 'pending-review' })} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Manual review</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((option) => {
            const active = option.value === timeRange;
            return (
              <TouchableOpacity key={option.value} style={[styles.chip, active && styles.chipActive]} onPress={() => setTimeRange(normalizeRange(option.value))} activeOpacity={0.85}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading && !ready ? (
          <View style={styles.card}>
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={Colors.adminInfo} />
              <Text style={styles.title}>Loading overview...</Text>
              <Text style={styles.subtle}>Pulling incident, AI, and spam classification data from the backend.</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.grid}>
              {KPI_CONFIG.map(([key, label, icon, tone, type]) => (
                <View key={key} style={styles.metricCard}>
                  <View style={styles.metricTop}>
                    <View style={[styles.metricIcon, { backgroundColor: `${tone}20` }]}>
                      <Ionicons name={icon} size={18} color={tone} />
                    </View>
                    <Text style={styles.metricTrend}>{formatTrend(overview.kpis[key].trend)}</Text>
                  </View>
                  <Text style={styles.metricValue}>{formatValue(overview.kpis[key].value, type)}</Text>
                  <Text style={styles.metricLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.grid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{counts.suspicious}</Text>
                <Text style={styles.metricLabel}>Suspected spam reports</Text>
                <Text style={styles.metricTrend}>Live queue count</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{counts['pending-review']}</Text>
                <Text style={styles.metricLabel}>Pending manual review</Text>
                <Text style={styles.metricTrend}>Spam-labelled, no verdict yet</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{formatPercent(spamRate)}</Text>
                <Text style={styles.metricLabel}>Spam rate</Text>
                <Text style={styles.metricTrend}>{counts.all ? `${counts.suspicious} of ${counts.all}` : 'No reports yet'}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.sectionTop}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.title}>Review queue</Text>
                  <Text style={styles.subtle}>Pending and flagged incidents across all time.</Text>
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('AdminIncidents', { filter: 'pending-review' })} activeOpacity={0.85}>
                  <Text style={styles.primaryBtnText}>Open queue</Text>
                </TouchableOpacity>
              </View>

              {overview.reviewQueue.length > 0 ? overview.reviewQueue.map((item) => (
                <TouchableOpacity key={item.reportId || item.displayId} style={styles.queueCard} onPress={() => navigation.navigate('AdminIncidentReview', { reportId: item.reportId })} activeOpacity={0.9}>
                  <View style={styles.queueTop}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={styles.queueId}>{item.displayId}</Text>
                      <Text style={styles.queueLocation}>{item.location}</Text>
                    </View>
                    <Text style={styles.queueStatus}>{String(item.status || 'pending').toUpperCase()}</Text>
                  </View>
                  <Text style={styles.queueMeta}>{item.ago || EMPTY_TEXT}  |  AI {formatAiConfidence(item)}</Text>
                  <View style={styles.mlBox}>
                    <Text style={styles.mlRow}>Predicted label: {formatPredictedLabel(item.predictedLabel)}</Text>
                    <Text style={styles.mlRow}>Spam score: {formatPercent(item.spamScore, 2)}</Text>
                    <Text style={styles.mlRow}>Confidence: {formatPercent(item.mlConfidence, 2)}</Text>
                    <Text style={styles.mlRow}>ML status: {formatMlStatus(item.mlStatus)}</Text>
                    <Text style={styles.mlRow}>Model version: {item.modelVersion || EMPTY_TEXT}</Text>
                    <Text style={styles.mlRow}>Classified at: {formatDateTime(item.classifiedAt)}</Text>
                    <Text style={styles.mlRow}>Review verdict: {item.reviewVerdict || (item.pendingSpamReview ? 'Pending' : EMPTY_TEXT)}</Text>
                    <Text style={styles.mlRow}>Reporter trust: {typeof item.reporterScore === 'number' ? `${item.reporterScore.toFixed(1)}%` : 'Not provided'}</Text>
                  </View>
                </TouchableOpacity>
              )) : (
                <Text style={styles.subtle}>No pending or flagged incidents are waiting in the review queue.</Text>
              )}
            </View>

            <View style={styles.row}>
              <View style={[styles.card, styles.half]}>
                <Text style={styles.title}>Weekly incident volume</Text>
                <View style={styles.chartRow}>
                  {overview.weeklyVolume.map((entry) => {
                    const height = maxWeeklyCount > 0 ? (entry.count / maxWeeklyCount) * 100 : 0;
                    return (
                      <View key={entry.label} style={styles.barCol}>
                        <Text style={styles.barValue}>{entry.count}</Text>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { height: `${height}%` }]} />
                        </View>
                        <Text style={styles.barLabel}>{entry.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.card, styles.half]}>
                <Text style={styles.title}>Top risk zones</Text>
                {overview.topRiskZones.length > 0 ? overview.topRiskZones.map((zone) => (
                  <View key={zone.zone} style={styles.zoneRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.zoneTitle}>{zone.zone}</Text>
                      <Text style={styles.zoneSub}>{zone.incidents} incidents</Text>
                    </View>
                    <Text style={styles.zoneRisk}>{String(zone.risk || 'medium').toUpperCase()}</Text>
                  </View>
                )) : (
                  <Text style={styles.subtle}>No zone activity was found for this time range.</Text>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: Colors.adminSurface, borderWidth: 1, borderColor: Colors.adminBorder, borderRadius: 16, padding: 16, marginBottom: 14 },
  errorCard: { borderColor: 'rgba(239,68,68,0.35)', backgroundColor: 'rgba(239,68,68,0.08)' },
  title: { color: Colors.adminText, fontSize: 16, fontWeight: '700' },
  subtle: { color: Colors.greyLight, fontSize: 12, lineHeight: 18, marginTop: 6 },
  loadingWrap: { alignItems: 'center', paddingVertical: 16 },
  alertBar: { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  alertCopy: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  alertText: { color: Colors.adminText, fontSize: 12, lineHeight: 17, marginLeft: 8, flex: 1 },
  alertAction: { color: Colors.adminDanger, fontSize: 12, fontWeight: '700', marginLeft: 10 },
  headerBlock: { marginBottom: 14 },
  pageTitle: { color: Colors.adminText, fontSize: 22, fontWeight: '800' },
  pageSubtitle: { color: Colors.greyLight, fontSize: 13, lineHeight: 20, marginTop: 6 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  primaryBtn: { backgroundColor: Colors.adminInfo, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start', marginTop: 8, marginRight: 10 },
  primaryBtnText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  secondaryBtn: { backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start', marginTop: 8, marginRight: 10 },
  secondaryBtnText: { color: Colors.adminInfo, fontSize: 12, fontWeight: '700' },
  rangeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  chip: { borderWidth: 1, borderColor: Colors.adminBorder, backgroundColor: Colors.adminSurface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: Colors.adminInfo, borderColor: Colors.adminInfo },
  chipText: { color: Colors.adminText, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: Colors.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  metricCard: { width: '48%', backgroundColor: Colors.adminSurface, borderWidth: 1, borderColor: Colors.adminBorder, borderRadius: 16, padding: 14, marginBottom: 14 },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  metricIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  metricTrend: { color: Colors.greyLight, fontSize: 11, flexShrink: 1, textAlign: 'right' },
  metricValue: { color: Colors.adminText, fontSize: 22, fontWeight: '800' },
  metricLabel: { color: Colors.greyLight, fontSize: 12, marginTop: 4 },
  sectionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  queueCard: { borderWidth: 1, borderColor: Colors.adminBorder, borderRadius: 14, padding: 14, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.02)' },
  queueTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  queueId: { color: Colors.adminText, fontSize: 14, fontWeight: '700' },
  queueLocation: { color: Colors.greyLight, fontSize: 12, lineHeight: 18, marginTop: 4 },
  queueStatus: { color: Colors.adminWarning, fontSize: 10, fontWeight: '700' },
  queueMeta: { color: Colors.greyLight, fontSize: 11, marginTop: 10, marginBottom: 10 },
  mlBox: { backgroundColor: 'rgba(15,23,42,0.55)', borderRadius: 12, padding: 12 },
  mlRow: { color: Colors.adminText, fontSize: 11, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  half: { width: '48%' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12, minHeight: 150 },
  barCol: { flex: 1, alignItems: 'center', marginHorizontal: 2 },
  barValue: { color: Colors.greyLight, fontSize: 10, marginBottom: 6 },
  barTrack: { width: 24, height: 90, borderRadius: 12, backgroundColor: 'rgba(148,163,184,0.15)', justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: Colors.adminInfo, borderRadius: 12 },
  barLabel: { color: Colors.greyLight, fontSize: 10, marginTop: 8 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.adminBorder },
  zoneTitle: { color: Colors.adminText, fontSize: 12, fontWeight: '600' },
  zoneSub: { color: Colors.greyLight, fontSize: 11, marginTop: 3 },
  zoneRisk: { color: Colors.adminWarning, fontSize: 10, fontWeight: '700', marginLeft: 10 },
});
