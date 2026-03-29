import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polygon } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../components/layout/AdminHeader';
import {
  fetchAdminZoneDetails,
  fetchAdminZoneMap,
  normalizeZoneMetric,
  normalizeZonePeriod,
  rebuildAdminZoneSummary,
} from '../../services/adminZonesService';
import { Colors } from '../../theme/colors';

const TABS = [
  { key: 'map', label: 'Map', icon: 'map-outline' },
  { key: 'table', label: 'Table', icon: 'grid-outline' },
  { key: 'ranking', label: 'Ranking', icon: 'trophy-outline' },
  { key: 'thresholds', label: 'Thresholds', icon: 'options-outline' },
];
const PERIOD_OPTIONS = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];
const METRIC_OPTIONS = [
  { value: 'composite', label: 'Composite' },
  { value: 'model', label: 'Model' },
  { value: 'reports', label: 'Reports' },
  { value: 'alerts', label: 'Alerts' },
];
const BASE_REGION = { latitude: 28.0, longitude: 2.8, latitudeDelta: 17, longitudeDelta: 17 };
const RISK_COLORS = {
  low: Colors.severityLow,
  medium: Colors.severityMedium,
  high: Colors.severityHigh,
  critical: Colors.severityCritical,
};

function getLevelFromScore(score) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function getMetricTitle(metric) {
  switch (metric) {
    case 'model':
      return 'Model weighted score';
    case 'reports':
      return 'Report pressure';
    case 'alerts':
      return 'Operational alert pressure';
    default:
      return 'Composite risk score';
  }
}

function getZoneColor(zone, metric) {
  const score = metric === 'composite' ? zone.riskScore : zone.metricScore;
  return RISK_COLORS[getLevelFromScore(score)] || RISK_COLORS.low;
}

function formatDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function toCoordinate(point) {
  if (!Array.isArray(point) || point.length < 2) return null;
  const longitude = Number(point[0]);
  const latitude = Number(point[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function extractPolygonSets(geometry) {
  if (!geometry || typeof geometry !== 'object') return [];
  if (geometry.type === 'Polygon') {
    const outer = Array.isArray(geometry.coordinates?.[0]) ? geometry.coordinates[0] : [];
    const points = outer.map(toCoordinate).filter(Boolean);
    return points.length >= 3 ? [points] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
      .map((polygon) => {
        const outer = Array.isArray(polygon?.[0]) ? polygon[0] : [];
        return outer.map(toCoordinate).filter(Boolean);
      })
      .filter((points) => points.length >= 3);
  }
  return [];
}

function getMapRegion(zone) {
  if (
    zone?.centroid
    && typeof zone.centroid.lat === 'number'
    && typeof zone.centroid.lng === 'number'
  ) {
    return {
      latitude: zone.centroid.lat,
      longitude: zone.centroid.lng,
      latitudeDelta: 4,
      longitudeDelta: 4,
    };
  }
  return BASE_REGION;
}

function StateCard({ icon, title, text, onRetry }) {
  return (
    <View style={styles.stateCard}>
      <Ionicons name={icon} size={30} color={onRetry ? Colors.adminDanger : Colors.grey} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{text}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function AdminZonesScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('map');
  const [period, setPeriod] = useState('24h');
  const [metric, setMetric] = useState('composite');
  const [mapPayload, setMapPayload] = useState({
    featureCollection: { type: 'FeatureCollection', features: [] },
    items: [],
    stats: { zoneCount: 0, critical: 0, high: 0, medium: 0, low: 0 },
    generatedAt: null,
  });
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState(null);
  const [detailsError, setDetailsError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function loadMap() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchAdminZoneMap(period, metric, { signal: controller.signal });
        if (active && !controller.signal.aborted) setMapPayload(payload);
      } catch (requestError) {
        if (active && !controller.signal.aborted) setError(requestError);
      } finally {
        if (active && !controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    loadMap();
    return () => {
      active = false;
      controller.abort();
    };
  }, [metric, period]);

  useEffect(() => {
    if (mapPayload.items.length === 0) {
      setSelectedZoneId(null);
      return;
    }
    if (mapPayload.items.find((zone) => zone.adminAreaId === selectedZoneId)) return;
    const preferred = mapPayload.items.find((zone) => zone.riskLevel === 'critical')
      || mapPayload.items.find((zone) => zone.riskLevel === 'high')
      || mapPayload.items[0];
    setSelectedZoneId(preferred?.adminAreaId || null);
  }, [mapPayload.items, selectedZoneId]);

  useEffect(() => {
    if (!selectedZoneId) {
      setSelectedDetails(null);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    async function loadDetails() {
      setDetailsLoading(true);
      setDetailsError(null);
      setSelectedDetails(null);
      try {
        const payload = await fetchAdminZoneDetails(selectedZoneId, period, { signal: controller.signal });
        if (active && !controller.signal.aborted) setSelectedDetails(payload);
      } catch (requestError) {
        if (active && !controller.signal.aborted) setDetailsError(requestError);
      } finally {
        if (active && !controller.signal.aborted) setDetailsLoading(false);
      }
    }
    loadDetails();
    return () => {
      active = false;
      controller.abort();
    };
  }, [period, selectedZoneId]);

  const selectedZone = useMemo(
    () => mapPayload.items.find((zone) => zone.adminAreaId === selectedZoneId) || null,
    [mapPayload.items, selectedZoneId]
  );
  const zoneTableRows = useMemo(
    () => [...mapPayload.items].sort((a, b) => (b.metricScore - a.metricScore) || a.name.localeCompare(b.name)),
    [mapPayload.items]
  );
  const rankingRows = useMemo(
    () => [...mapPayload.items].sort((a, b) => (b.riskScore - a.riskScore) || a.name.localeCompare(b.name)),
    [mapPayload.items]
  );

  async function refreshZones() {
    setRefreshing(true);
    setError(null);
    setDetailsError(null);
    try {
      const payload = await fetchAdminZoneMap(period, metric);
      setMapPayload(payload);
      if (selectedZoneId) {
        const detailPayload = await fetchAdminZoneDetails(selectedZoneId, period);
        setSelectedDetails(detailPayload);
      }
    } catch (requestError) {
      setError(requestError);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRebuildSummary() {
    setRebuilding(true);
    try {
      const result = await rebuildAdminZoneSummary(period);
      await refreshZones();
      Alert.alert('Zone Summary Rebuilt', `Snapshot refreshed for ${result.zoneCount} zones.`);
    } catch (requestError) {
      Alert.alert('Rebuild Failed', requestError.message || 'Unknown error');
    } finally {
      setRebuilding(false);
    }
  }

  function renderHeader() {
    return (
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Risk Zones & Geo Management</Text>
            <Text style={styles.heroSubtitle}>
              {mapPayload.stats.zoneCount} monitored wilaya zones
              {mapPayload.generatedAt ? ` · refreshed ${formatDateTime(mapPayload.generatedAt)}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.rebuildButton, rebuilding && { opacity: 0.6 }]}
            disabled={rebuilding}
            onPress={handleRebuildSummary}
          >
            <Ionicons name="refresh-outline" size={16} color={Colors.adminInfo} />
            <Text style={styles.rebuildButtonText}>{rebuilding ? 'Rebuilding...' : 'Rebuild'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{mapPayload.stats.critical}</Text>
            <Text style={styles.summaryLabel}>Critical</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{mapPayload.stats.high}</Text>
            <Text style={styles.summaryLabel}>High</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryValue}>{mapPayload.stats.zoneCount}</Text>
            <Text style={styles.summaryLabel}>Total Zones</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {PERIOD_OPTIONS.map((option) => {
            const active = period === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setPeriod(normalizeZonePeriod(option.value))}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {METRIC_OPTIONS.map((option) => {
            const active = metric === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setMetric(normalizeZoneMetric(option.value))}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons name={tab.icon} size={14} color={active ? Colors.adminInfo : Colors.grey} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  function renderDetailsSection() {
    if (!selectedZone) {
      return <Text style={styles.emptyInline}>Select a wilaya polygon to inspect its risk signals.</Text>;
    }

    return (
      <>
        <View style={styles.zoneHero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.zoneName}>{selectedZone.name}</Text>
            <Text style={styles.zoneMeta}>{selectedZone.level || 'wilaya'}</Text>
          </View>
          <View style={[styles.zoneScoreBadge, { backgroundColor: `${getZoneColor(selectedZone, metric)}20` }]}>
            <Text style={[styles.zoneScoreValue, { color: getZoneColor(selectedZone, metric) }]}>
              {metric === 'composite' ? selectedZone.riskScore : selectedZone.metricScore}
            </Text>
            <Text style={[styles.zoneScoreLabel, { color: getZoneColor(selectedZone, metric) }]}>
              {metric === 'composite' ? 'Risk' : 'Metric'}
            </Text>
          </View>
        </View>

        <View style={styles.detailsGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Reports</Text>
            <Text style={styles.infoValue}>{selectedZone.recentReportCount}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Verified</Text>
            <Text style={styles.infoValue}>{selectedZone.verifiedReportCount}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Active Alerts</Text>
            <Text style={styles.infoValue}>{selectedZone.activeAlertCount}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Top Road</Text>
            <Text style={styles.infoValue}>{selectedZone.topRoadName || 'Unknown road'}</Text>
          </View>
        </View>

        {detailsLoading ? (
          <View style={styles.inlineState}>
            <ActivityIndicator size="small" color={Colors.adminInfo} />
            <Text style={styles.inlineStateText}>Loading zone details...</Text>
          </View>
        ) : detailsError ? (
          <View style={styles.inlineState}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.adminDanger} />
            <Text style={styles.inlineStateText}>{detailsError.message || 'Could not load zone details'}</Text>
          </View>
        ) : selectedDetails ? (
          <>
            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Top Roads</Text>
              {selectedDetails.topRoads.slice(0, 3).map((road) => (
                <View key={road.roadSegmentId} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listRowTitle}>{road.roadName}</Text>
                    <Text style={styles.listRowSubtitle}>{road.roadClass || 'Unknown class'}</Text>
                  </View>
                  <Text style={styles.listRowMeta}>
                    {typeof road.riskScore === 'number' ? road.riskScore : 0}
                  </Text>
                </View>
              ))}
              {selectedDetails.topRoads.length === 0 ? (
                <Text style={styles.emptyInline}>No model-covered roads in this period</Text>
              ) : null}
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Recent Reports</Text>
                <Text style={styles.infoValue}>{selectedDetails.recentReportsSummary.total}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Pending Reports</Text>
                <Text style={styles.infoValue}>{selectedDetails.recentReportsSummary.pending}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Active Alerts</Text>
                <Text style={styles.infoValue}>{selectedDetails.operationalAlertsSummary.active}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Critical Alerts</Text>
                <Text style={styles.infoValue}>{selectedDetails.operationalAlertsSummary.critical}</Text>
              </View>
            </View>
          </>
        ) : null}
      </>
    );
  }

  function renderZoneCard(zone, rank = null) {
    const color = getZoneColor(zone, metric);
    return (
      <TouchableOpacity
        key={`${rank || 'zone'}-${zone.adminAreaId}`}
        style={[styles.zoneCard, { borderLeftColor: color }]}
        onPress={() => {
          setSelectedZoneId(zone.adminAreaId);
          setActiveTab('map');
        }}
      >
        <View style={styles.zoneCardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.zoneCardTitle}>{rank ? `#${rank} · ${zone.name}` : zone.name}</Text>
            <Text style={styles.zoneCardSubtitle}>{zone.level || 'wilaya'}</Text>
          </View>
          <View style={[styles.zoneScoreBadge, { backgroundColor: `${color}20` }]}>
            <Text style={[styles.zoneScoreValue, { color }]}>{zone.riskScore}</Text>
            <Text style={[styles.zoneScoreLabel, { color }]}>Risk</Text>
          </View>
        </View>

        <View style={styles.detailsGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Metric</Text>
            <Text style={styles.infoValue}>{zone.metricScore}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Reports</Text>
            <Text style={styles.infoValue}>{zone.recentReportCount}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Alerts</Text>
            <Text style={styles.infoValue}>{zone.activeAlertCount}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Top Road</Text>
            <Text style={styles.infoValue}>{zone.topRoadName || 'Unknown road'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderMapTab() {
    if (loading) return <StateCard icon="hourglass-outline" title="Loading zones" text="Loading wilaya polygons and risk summaries..." />;
    if (error) return <StateCard icon="alert-circle-outline" title="Could not load zones" text={error.message || 'Unknown error'} onRetry={refreshZones} />;
    if (mapPayload.items.length === 0) {
      return <StateCard icon="map-outline" title="No polygon summary available" text="No polygon summary is available yet for this period." />;
    }

    return (
      <>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Zone Intelligence Map</Text>
          <Text style={styles.sectionSubtitle}>
            Polygon-first wilaya risk view colored by {getMetricTitle(metric).toLowerCase()}
          </Text>

          <MapView key={`${metric}-${selectedZoneId || 'none'}-${period}`} style={styles.map} initialRegion={getMapRegion(selectedZone)}>
            {mapPayload.items.flatMap((zone) =>
              extractPolygonSets(zone.geometry).map((coordinates, index) => {
                const color = getZoneColor(zone, metric);
                const selected = zone.adminAreaId === selectedZoneId;
                return (
                  <Polygon
                    key={`${zone.adminAreaId}-${index}`}
                    coordinates={coordinates}
                    tappable
                    onPress={() => setSelectedZoneId(zone.adminAreaId)}
                    strokeColor={selected ? Colors.white : color}
                    fillColor={`${color}${selected ? '66' : '33'}`}
                    strokeWidth={selected ? 2.5 : 1.5}
                  />
                );
              })
            )}
            {mapPayload.items.filter((zone) => zone.centroid).map((zone) => (
              <Marker
                key={`marker-${zone.adminAreaId}`}
                coordinate={{ latitude: zone.centroid.lat, longitude: zone.centroid.lng }}
                onPress={() => setSelectedZoneId(zone.adminAreaId)}
                pinColor={getZoneColor(zone, metric)}
                title={zone.name}
                description={`Risk ${zone.riskScore} · Metric ${zone.metricScore}`}
              />
            ))}
          </MapView>

          <View style={styles.legendRow}>
            {['critical', 'high', 'medium', 'low'].map((tone) => (
              <View key={tone} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: RISK_COLORS[tone] }]} />
                <Text style={styles.legendText}>{tone.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Selected Zone</Text>
              <Text style={styles.sectionSubtitle}>{selectedZone ? selectedZone.name : 'No zone selected'}</Text>
            </View>
            <View style={styles.metricBadge}>
              <Text style={styles.metricBadgeText}>{getMetricTitle(metric)}</Text>
            </View>
          </View>
          {renderDetailsSection()}
        </View>
      </>
    );
  }

  function renderTableTab() {
    if (loading) return <StateCard icon="hourglass-outline" title="Loading zones" text="Loading zone management data..." />;
    if (error) return <StateCard icon="alert-circle-outline" title="Could not load zones" text={error.message || 'Unknown error'} onRetry={refreshZones} />;
    if (zoneTableRows.length === 0) return <StateCard icon="grid-outline" title="No zones available" text="No zone rows are available for this period." />;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zone Management</Text>
        <Text style={styles.sectionSubtitle}>Sorted by {getMetricTitle(metric).toLowerCase()}</Text>
        {zoneTableRows.map((zone) => renderZoneCard(zone))}
      </View>
    );
  }

  function renderRankingTab() {
    if (loading) return <StateCard icon="hourglass-outline" title="Loading ranking" text="Building wilaya ranking..." />;
    if (error) return <StateCard icon="alert-circle-outline" title="Could not load ranking" text={error.message || 'Unknown error'} onRetry={refreshZones} />;
    if (rankingRows.length === 0) return <StateCard icon="trophy-outline" title="No ranking data" text="No ranking data is available for this period." />;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wilaya Risk Ranking</Text>
        <Text style={styles.sectionSubtitle}>Sorted by composite risk score</Text>
        {rankingRows.map((zone, index) => renderZoneCard(zone, index + 1))}
      </View>
    );
  }

  function renderThresholdsTab() {
    const rows = [
      { label: 'Low', value: '0 - 24.9', color: RISK_COLORS.low },
      { label: 'Medium', value: '25 - 49.9', color: RISK_COLORS.medium },
      { label: 'High', value: '50 - 74.9', color: RISK_COLORS.high },
      { label: 'Critical', value: '75 - 100', color: RISK_COLORS.critical },
      { label: 'Model Weight', value: '40%', color: Colors.adminInfo },
      { label: 'Reports Weight', value: '35%', color: Colors.adminInfo },
      { label: 'Alerts Weight', value: '25%', color: Colors.adminInfo },
    ];
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Threshold Config</Text>
        <Text style={styles.sectionSubtitle}>Current V1 score bands and composite weighting used to color the zone map</Text>
        {rows.map((entry) => (
          <View key={entry.label} style={styles.thresholdRow}>
            <View style={[styles.thresholdDot, { backgroundColor: entry.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.thresholdTitle}>{entry.label}</Text>
              <Text style={styles.thresholdValue}>{entry.value}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  }

  function renderContent() {
    switch (activeTab) {
      case 'table':
        return renderTableTab();
      case 'ranking':
        return renderRankingTab();
      case 'thresholds':
        return renderThresholdsTab();
      default:
        return renderMapTab();
    }
  }

  return (
    <View style={styles.root}>
      <AdminHeader title="Zone Management" subtitle="Risk zones & monitoring" navigation={navigation} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshZones} tintColor={Colors.adminInfo} />}
      >
        {renderHeader()}
        {renderContent()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  heroCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  heroTitle: { color: Colors.adminText, fontSize: 16, fontWeight: '700' },
  heroSubtitle: { color: Colors.grey, fontSize: 12, marginTop: 4, lineHeight: 18 },
  rebuildButton: {
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
  rebuildButtonText: { color: Colors.adminInfo, fontSize: 12, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  summaryValue: { color: Colors.adminText, fontSize: 18, fontWeight: '800' },
  summaryLabel: { color: Colors.grey, fontSize: 11, marginTop: 4 },
  filterRow: { gap: 8, paddingBottom: 10 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
  filterChipActive: { backgroundColor: Colors.blueLight, borderColor: Colors.blueBorder },
  filterChipText: { color: Colors.grey, fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: Colors.adminInfo },
  tabs: { gap: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabActive: { backgroundColor: Colors.blueLight, borderColor: Colors.blueBorder },
  tabText: { color: Colors.grey, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: Colors.adminInfo },
  section: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  sectionTitle: { color: Colors.adminText, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sectionSubtitle: { color: Colors.grey, fontSize: 12, lineHeight: 18 },
  map: { width: '100%', height: 320, borderRadius: 12, marginBottom: 12 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: Colors.grey, fontSize: 11, fontWeight: '600' },
  metricBadge: {
    backgroundColor: Colors.blueLight,
    borderWidth: 1,
    borderColor: Colors.blueBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metricBadgeText: { color: Colors.adminInfo, fontSize: 11, fontWeight: '700' },
  zoneHero: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  zoneName: { color: Colors.adminText, fontSize: 15, fontWeight: '700' },
  zoneMeta: { color: Colors.grey, fontSize: 12, marginTop: 4 },
  zoneScoreBadge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 74 },
  zoneScoreValue: { fontSize: 22, fontWeight: '800' },
  zoneScoreLabel: { fontSize: 10, fontWeight: '700', marginTop: -2 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoItem: { width: '47%', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10 },
  infoLabel: { color: Colors.grey, fontSize: 10, marginBottom: 4, textTransform: 'uppercase' },
  infoValue: { color: Colors.adminText, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  subSection: { marginTop: 12, marginBottom: 12 },
  subSectionTitle: { color: Colors.adminText, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
  },
  listRowTitle: { color: Colors.adminText, fontSize: 12, fontWeight: '700' },
  listRowSubtitle: { color: Colors.grey, fontSize: 11, marginTop: 4 },
  listRowMeta: { color: Colors.grey, fontSize: 11, fontWeight: '600' },
  emptyInline: { color: Colors.grey, fontSize: 12 },
  inlineState: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 12 },
  inlineStateText: { color: Colors.grey, fontSize: 12, flex: 1 },
  zoneCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderLeftWidth: 3,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  zoneCardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  zoneCardTitle: { color: Colors.adminText, fontSize: 14, fontWeight: '700' },
  zoneCardSubtitle: { color: Colors.grey, fontSize: 12, marginTop: 4 },
  thresholdRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.adminBorder },
  thresholdDot: { width: 12, height: 12, borderRadius: 6 },
  thresholdTitle: { color: Colors.adminText, fontSize: 13, fontWeight: '700' },
  thresholdValue: { color: Colors.grey, fontSize: 12, marginTop: 4 },
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
  retryButton: { marginTop: 4, backgroundColor: Colors.adminInfo, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  retryButtonText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
});
