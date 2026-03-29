import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapCanvas from '../../components/map/MapCanvas';
import FloatingMapControls from '../../components/map/FloatingMapControls';
import GuidanceBottomSheet from '../../components/map/GuidanceBottomSheet';
import GuidanceSearchSection from '../../components/map/GuidanceSearchSection';
import GuidanceTimeControls from '../../components/map/GuidanceTimeControls';
import CurrentRiskSection from '../../components/map/CurrentRiskSection';
import ReportDetailsSheet from '../../components/map/ReportDetailsSheet';
import RouteAlternativesList from '../../components/map/RouteAlternativesList';
import RouteDetailsSection from '../../components/map/RouteDetailsSection';
import ForecastTabsSection from '../../components/map/ForecastTabsSection';
import DrivingQuiz from '../../components/ui/DrivingQuiz';
import { Colors } from '../../theme/colors';
import { API_BASE_URL } from '../../config/api';

const { height } = Dimensions.get('window');

const LAYER_OPTIONS = [
  { key: 'points', icon: 'location', label: 'Points' },
  { key: 'heatmap', icon: 'flame', label: 'Heatmap' },
  { key: 'ai', icon: 'analytics', label: 'AI Risks' },
  { key: 'nearbyRoads', icon: 'car', label: 'Nearby Roads' },
];

const MAP_STYLE_OPTIONS = [
  { key: 'voyager', icon: 'map-outline', label: 'Standard', desc: 'Clean map style' },
  { key: 'satellite', icon: 'earth-outline', label: 'Satellite', desc: 'ESRI imagery' },
  { key: 'dark', icon: 'moon-outline', label: 'Dark', desc: 'Dark map' },
  { key: 'osm', icon: 'globe-outline', label: 'Classic', desc: 'OSM style' },
];

const SEVERITY_OPTIONS = [
  { id: 'high', label: 'High', color: '#EF4444' },
  { id: 'medium', label: 'Medium', color: '#F59E0B' },
  { id: 'low', label: 'Low', color: '#10B981' },
];

const TYPE_OPTIONS = [
  { id: 'accident', label: 'Accident', icon: 'car' },
  { id: 'traffic', label: 'Traffic', icon: 'swap-horizontal' },
  { id: 'danger', label: 'Danger', icon: 'warning' },
  { id: 'weather', label: 'Weather', icon: 'rainy' },
];

const MOCK_MARKERS = [
  { id: 1, lat: 36.7538, lng: 3.0588, type: 'accident', severity: 'high', title: 'Multi-vehicle collision' },
  { id: 2, lat: 36.7638, lng: 3.0788, type: 'traffic', severity: 'medium', title: 'Traffic jam' },
  { id: 3, lat: 36.7438, lng: 3.0388, type: 'roadworks', severity: 'low', title: 'Ongoing roadworks' },
  { id: 4, lat: 36.7338, lng: 3.0688, type: 'danger', severity: 'high', title: 'Road blocked' },
];

const TRENDING_ZONES = [
  { name: 'Alger Centre', incidents: 12, severity: 'high', updated: '2 min' },
  { name: 'Bab Ezzouar', incidents: 8, severity: 'medium', updated: '5 min' },
  { name: 'El Harrach', incidents: 5, severity: 'medium', updated: '12 min' },
];

const ACTIVE_ALERTS = [
  { id: 1, title: 'Serious accident A1', type: 'accident', time: '3 min' },
  { id: 2, title: 'Road flooding', type: 'weather', time: '15 min' },
];

const ALGERIA_WILAYAS = [
  { code: '16', name: 'Alger' },
  { code: '31', name: 'Oran' },
  { code: '25', name: 'Constantine' },
  { code: '23', name: 'Annaba' },
  { code: '06', name: 'Bejaia' },
];

function weatherIconFromCondition(condition) {
  const text = String(condition || '').toLowerCase();
  if (text.includes('orage') || text.includes('thunder')) return 'thunderstorm';
  if (text.includes('pluie') || text.includes('rain')) return 'rainy';
  if (text.includes('neige') || text.includes('snow')) return 'snow';
  if (text.includes('fog')) return 'cloudy-night';
  if (text.includes('cloud')) return 'partly-sunny';
  return 'sunny';
}

function severityColor(level) {
  if (level === 'high') return '#f97316';
  if (level === 'medium') return '#eab308';
  return '#22c55e';
}

export default function MapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [mapLayer, setMapLayer] = useState('points');
  const [mapStyle, setMapStyle] = useState('voyager');
  const [showMapStyleModal, setShowMapStyleModal] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [severityFilter, setSeverityFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState([]);
  const [selectedWilaya, setSelectedWilaya] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [mapDisplayMode, setMapDisplayMode] = useState('map');
  const [bottomSheetIndex, setBottomSheetIndex] = useState(0);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(112);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedRouteType, setSelectedRouteType] = useState(null);
  const [destination, setDestination] = useState(null);
  const [guidanceActive, setGuidanceActive] = useState(false);
  const [forecastTab, setForecastTab] = useState('info');
  const [mapSnapshot, setMapSnapshot] = useState({});
  const [showQuiz, setShowQuiz] = useState(false);
  const [userPosition, setUserPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState('unknown');
  const [locationError, setLocationError] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [forecastPoints, setForecastPoints] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [selectedTimestampIso, setSelectedTimestampIso] = useState(() => new Date().toISOString());
  const [selectedIncident, setSelectedIncident] = useState(null);

  const mapRef = useRef(null);
  const previousGuidanceActiveRef = useRef(false);
  const sheetBottomOffset = 0;
  const sheetContentBottomPadding = useMemo(() => insets.bottom + 24, [insets.bottom]);
  const usableHeight = useMemo(() => Math.max(320, height - sheetBottomOffset), [sheetBottomOffset]);
  const snapHeights = useMemo(() => ([
    Math.max(112, Math.round(usableHeight * 0.16)),
    Math.round(usableHeight * 0.46),
    Math.round(usableHeight * 0.9),
  ]), [usableHeight]);

  const requestLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        setLocationError('Location permission denied. Enable it in settings.');
        return;
      }
      setLocationStatus('granted');
      setLocationError(null);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      setLocationStatus('error');
      setLocationError('Could not obtain location.');
    }
  }, []);

  useEffect(() => {
    requestLocation().catch(() => {});
  }, [requestLocation]);

  useEffect(() => {
    if (!userPosition) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setWeatherLoading(true);
      try {
        const query = `lat=${encodeURIComponent(userPosition.lat)}&lng=${encodeURIComponent(userPosition.lng)}&timestamp=${encodeURIComponent(selectedTimestampIso)}`;
        const resp = await fetch(`${API_BASE_URL}/api/weather/current?${query}`);
        const data = await resp.json();
        if (!cancelled) setWeatherData(data);
      } catch {
        if (!cancelled) setWeatherData(null);
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedTimestampIso, userPosition]);

  useEffect(() => {
    if (!userPosition) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setForecastLoading(true);
      try {
        const query = `lat=${encodeURIComponent(userPosition.lat)}&lng=${encodeURIComponent(userPosition.lng)}&timestamp=${encodeURIComponent(selectedTimestampIso)}`;
        const resp = await fetch(`${API_BASE_URL}/api/risk/forecast24h?${query}`);
        const data = await resp.json();
        const points = Array.isArray(data?.points) ? data.points : [];
        const nowPoint = data?.now_point && typeof data.now_point === 'object' ? data.now_point : null;
        if (!cancelled) setForecastPoints(nowPoint ? [nowPoint, ...points.slice(1)] : points);
      } catch {
        if (!cancelled) setForecastPoints([]);
      } finally {
        if (!cancelled) setForecastLoading(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedTimestampIso, userPosition]);

  const filteredMarkers = useMemo(() => (
    MOCK_MARKERS.filter((marker) => {
      if (severityFilter.length > 0 && !severityFilter.includes(marker.severity)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(marker.type)) return false;
      if (searchText && !marker.title.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (selectedWilaya && marker.wilaya && marker.wilaya !== selectedWilaya) return false;
      return true;
    })
  ), [searchText, selectedWilaya, severityFilter, typeFilter]);

  const hasActiveFilters = severityFilter.length > 0 || typeFilter.length > 0 || Boolean(selectedWilaya);
  const weatherTemp = weatherData?.temperature_c != null ? `${Math.round(Number(weatherData.temperature_c))}\u00B0C` : '--';
  const weatherDesc = weatherLoading && !weatherData ? 'Loading...' : weatherData?.condition || 'Weather';
  const weatherWind = weatherData?.wind_kmh != null ? `${Number(weatherData.wind_kmh).toFixed(1)} km/h` : '--';
  const weatherHumidity = weatherData?.humidity_pct != null ? `${Math.round(Number(weatherData.humidity_pct))}%` : '--';
  const weatherVisibility = weatherData?.visibility_km != null ? `${Number(weatherData.visibility_km).toFixed(1)} km` : '--';
  const weatherPressure = weatherData?.pressure_hpa != null ? `${Number(weatherData.pressure_hpa).toFixed(0)} hPa` : '--';
  const weatherIconName = weatherData ? weatherIconFromCondition(weatherData.condition) : 'cloud';

  const handleSheetModeChange = useCallback((mode, index, nextHeight) => {
    setMapDisplayMode(mode);
    setBottomSheetIndex(index);
    if (Number.isFinite(nextHeight)) setBottomSheetHeight(nextHeight);
  }, []);

  useEffect(() => {
    setSelectedRoute(mapSnapshot.selectedGuidedRoute || null);
    setSelectedRouteType(mapSnapshot.selectedGuidedRouteType || null);
    setDestination(mapSnapshot.selectedDestination || null);
    setGuidanceActive(Boolean(mapSnapshot.guidanceActive));
  }, [mapSnapshot.guidanceActive, mapSnapshot.selectedDestination, mapSnapshot.selectedGuidedRoute, mapSnapshot.selectedGuidedRouteType]);

  useEffect(() => {
    const wasActive = previousGuidanceActiveRef.current;
    if (guidanceActive && !wasActive) handleSheetModeChange('guidance', 1, snapHeights[1]);
    if (!guidanceActive && wasActive) handleSheetModeChange('map', 0, snapHeights[0]);
    previousGuidanceActiveRef.current = guidanceActive;
  }, [guidanceActive, handleSheetModeChange, snapHeights]);

  const handleClearGuidance = useCallback(() => {
    mapRef.current?.clearGuidance?.();
    handleSheetModeChange('map', 0, snapHeights[0]);
  }, [handleSheetModeChange, snapHeights]);

  const compactRiskColor = mapSnapshot.riskDisplay?.color || Colors.grey;
  const compactRiskPercent = mapSnapshot.riskDisplay?.pct != null
    ? `${Math.round(Number(mapSnapshot.riskDisplay.pct))}%`
    : '--';
  const compactRiskLabel = mapSnapshot.riskDisplay?.level
    ? `${mapSnapshot.riskDisplay.level.charAt(0).toUpperCase()}${mapSnapshot.riskDisplay.level.slice(1)} risk`
    : mapSnapshot.currentRiskState === 'loading'
      ? 'Updating risk'
      : 'Current risk';

  const compactSheetContent = useMemo(() => {
    return (
      <View style={styles.compactSummaryWrap}>
        <Text style={styles.compactSummaryTitle}>Current risk</Text>
        <View style={styles.compactSummaryRow}>
          <View style={[styles.compactSummaryDot, { backgroundColor: compactRiskColor }]} />
          <Text style={[styles.compactSummaryPercent, { color: compactRiskColor }]}>{compactRiskPercent}</Text>
          <Text style={styles.compactSummaryLabel} numberOfLines={1}>{compactRiskLabel}</Text>
          {mapSnapshot.currentRiskState === 'loading' ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
          {mapSnapshot.currentRiskState === 'error' ? <Ionicons name="alert-circle" size={16} color={Colors.error} /> : null}
        </View>
        <Text style={styles.compactSummaryHint}>Drag up for route, forecast, and context.</Text>
        {mapSnapshot.currentRiskState === 'error' && mapSnapshot.currentRiskError ? (
          <Text style={styles.compactSummaryError} numberOfLines={1}>{mapSnapshot.currentRiskError}</Text>
        ) : null}
      </View>
    );
  }, [compactRiskColor, compactRiskLabel, compactRiskPercent, mapSnapshot.currentRiskError, mapSnapshot.currentRiskState]);

  return (
    <View style={styles.container}>
      <MapCanvas
        ref={mapRef}
        style={styles.map}
        markers={filteredMarkers}
        mapLayer={mapLayer}
        tileLayer={mapStyle}
        onMarkerPress={setSelectedIncident}
        onSelectedTimestampChange={setSelectedTimestampIso}
        onSnapshotChange={setMapSnapshot}
        setSelectedIncident={setSelectedIncident}
        requestLocation={requestLocation}
        locationError={locationError}
        bottomInset={bottomSheetHeight + sheetBottomOffset}
        embeddedLayout
      />

      <FloatingMapControls
        displayMode={mapDisplayMode}
        mapLayer={mapLayer}
        layerOptions={LAYER_OPTIONS}
        onSetMapLayer={setMapLayer}
        hasActiveFilters={hasActiveFilters}
        onOpenFilters={() => setShowFilterSheet(true)}
        onOpenMapStyle={() => setShowMapStyleModal(true)}
        onReportIncident={() => navigation.navigate('ReportIncident')}
        destinationQuery={mapSnapshot.destinationQuery || ''}
        destinationResults={mapSnapshot.showSearchResults ? (mapSnapshot.destinationResults || []) : []}
        destinationSearchState={mapSnapshot.destinationSearchState || 'idle'}
        destinationSearchError={mapSnapshot.destinationSearchError || ''}
        selectedDestination={destination}
        selectedRoute={selectedRoute}
        selectedRouteType={selectedRouteType}
        guidanceActive={guidanceActive}
        isGuidanceBusy={Boolean(mapSnapshot.isGuidanceBusy)}
        onDestinationQueryChange={(text) => mapRef.current?.setDestinationQuery?.(text)}
        onDestinationFocus={() => mapRef.current?.setShowSearchResults?.(true)}
        onSelectDestination={(item) => mapRef.current?.selectDestination?.(item)}
        onClearDestination={() => mapRef.current?.clearDestination?.()}
        onStartGuidance={() => mapRef.current?.startGuidance?.()}
        onClearGuidance={handleClearGuidance}
        onOpenInfoMode={() => handleSheetModeChange('info', 2, snapHeights[2])}
      />

      <GuidanceBottomSheet
        displayMode={mapDisplayMode}
        snapHeights={snapHeights}
        onModeChange={handleSheetModeChange}
        onHeightChange={setBottomSheetHeight}
        compactContent={compactSheetContent}
        bottomOffset={sheetBottomOffset}
        contentBottomPadding={sheetContentBottomPadding}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{selectedRoute ? `${selectedRoute.route_label} guidance` : 'Route guidance'}</Text>
          <Text style={styles.sectionText}>
            {selectedRoute
              ? `${destination?.full_name || destination?.name || 'Destination'} | ${selectedRoute.comparisonText}`
              : 'Search a destination and request guidance to compare the fastest, safest, and balanced routes.'}
          </Text>
        </View>

        <GuidanceSearchSection
          destinationQuery={mapSnapshot.destinationQuery || ''}
          destinationResults={mapSnapshot.showSearchResults ? (mapSnapshot.destinationResults || []) : []}
          destinationSearchState={mapSnapshot.destinationSearchState || 'idle'}
          destinationSearchError={mapSnapshot.destinationSearchError || ''}
          guidedRouteError={mapSnapshot.guidedRouteError || ''}
          selectedDestination={destination}
          onDestinationQueryChange={(text) => mapRef.current?.setDestinationQuery?.(text)}
          onDestinationFocus={() => mapRef.current?.setShowSearchResults?.(true)}
          onSelectDestination={(item) => mapRef.current?.selectDestination?.(item)}
          onClearDestination={() => mapRef.current?.clearDestination?.()}
        />

        <GuidanceTimeControls
          presetKey={mapSnapshot.presetKey || '0'}
          customDate={mapSnapshot.customDate || ''}
          onSelectPreset={(value) => mapRef.current?.setTimePreset?.(value)}
          onChangeCustomDate={(value) => mapRef.current?.setCustomDate?.(value)}
        />

        {!guidanceActive || mapDisplayMode === 'info' ? (
          <CurrentRiskSection
            riskDisplay={mapSnapshot.riskDisplay}
            currentRiskState={mapSnapshot.currentRiskState || 'idle'}
            currentRiskError={mapSnapshot.currentRiskError || ''}
            sentinelInfo={mapSnapshot.sentinelInfo}
            onExplain={() => mapRef.current?.showRiskExplanation?.()}
          />
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, (!destination || mapSnapshot.isGuidanceBusy) && styles.disabledBtn]}
            onPress={() => mapRef.current?.startGuidance?.()}
            disabled={!destination || mapSnapshot.isGuidanceBusy}
          >
            {mapSnapshot.isGuidanceBusy ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="navigate" size={16} color={Colors.white} />}
            <Text style={styles.primaryBtnText}>{guidanceActive ? 'Refresh guidance' : 'Start guidance'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleClearGuidance}>
            <Ionicons name="close" size={16} color={Colors.error} />
            <Text style={styles.secondaryBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <RouteAlternativesList
          routes={mapSnapshot.guidedRoutes || []}
          selectedRouteType={selectedRouteType}
          onSelectRouteType={(type) => {
            setSelectedRouteType(type);
            mapRef.current?.setSelectedRouteType?.(type);
          }}
        />

        <RouteDetailsSection
          route={selectedRoute}
          sentinelInfo={mapSnapshot.sentinelInfo}
          mode={mapDisplayMode === 'info' ? 'info' : 'guidance'}
          onSegmentPress={(segment) => mapRef.current?.openSegmentExplanation?.(segment)}
        />

        {mapDisplayMode === 'info' ? (
          <ForecastTabsSection
            forecastTab={forecastTab}
            onChangeTab={setForecastTab}
            forecastPoints={forecastPoints}
            forecastLoading={forecastLoading}
            userPosition={userPosition}
            weatherTemp={weatherTemp}
            weatherDesc={weatherDesc}
            weatherWind={weatherWind}
            weatherHumidity={weatherHumidity}
            weatherVisibility={weatherVisibility}
            weatherPressure={weatherPressure}
            weatherIconName={weatherIconName}
            trendingZones={TRENDING_ZONES}
            activeAlerts={ACTIVE_ALERTS}
            onManageAlerts={() => navigation.navigate('Alerts')}
          />
        ) : null}
      </GuidanceBottomSheet>

      <Modal visible={showFilterSheet} transparent animationType="slide" onRequestClose={() => setShowFilterSheet(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowFilterSheet(false)}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              {hasActiveFilters ? (
                <TouchableOpacity onPress={() => { setSeverityFilter([]); setTypeFilter([]); setSelectedWilaya(null); }}>
                  <Text style={styles.link}>Clear all</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.groupLabel}>Severity</Text>
            <View style={styles.chips}>
              {SEVERITY_OPTIONS.map((opt) => {
                const active = severityFilter.includes(opt.id);
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, active && { backgroundColor: opt.color, borderColor: opt.color }]}
                    onPress={() => setSeverityFilter((prev) => (
                      prev.includes(opt.id) ? prev.filter((v) => v !== opt.id) : [...prev, opt.id]
                    ))}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.groupLabel}>Type</Text>
            <View style={styles.chips}>
              {TYPE_OPTIONS.map((opt) => {
                const active = typeFilter.includes(opt.id);
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTypeFilter((prev) => (
                      prev.includes(opt.id) ? prev.filter((v) => v !== opt.id) : [...prev, opt.id]
                    ))}
                  >
                    <Ionicons name={opt.icon} size={14} color={active ? Colors.white : Colors.text} style={{ marginRight: 4 }} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.groupLabel}>Wilaya</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.wilayas}>
                {ALGERIA_WILAYAS.map((wilaya) => {
                  const active = selectedWilaya === wilaya.code;
                  return (
                    <TouchableOpacity
                      key={wilaya.code}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setSelectedWilaya(active ? null : wilaya.code)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{wilaya.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showMapStyleModal} transparent animationType="slide" onRequestClose={() => setShowMapStyleModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowMapStyleModal(false)}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Map style</Text>
            <View style={styles.styleGrid}>
              {MAP_STYLE_OPTIONS.map((opt) => {
                const active = mapStyle === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.styleCard, active && styles.styleCardActive]}
                    onPress={() => {
                      setMapStyle(opt.key);
                      setShowMapStyleModal(false);
                    }}
                  >
                    <Ionicons name={opt.icon} size={22} color={active ? Colors.primary : Colors.text} />
                    <Text style={styles.styleLabel}>{opt.label}</Text>
                    <Text style={styles.styleDesc}>{opt.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <DrivingQuiz visible={showQuiz} onClose={() => setShowQuiz(false)} />

      <ReportDetailsSheet
        report={selectedIncident?.kind === 'report' ? selectedIncident : null}
        visible={selectedIncident?.kind === 'report'}
        onClose={() => setSelectedIncident(null)}
      />

      <Modal visible={!!selectedIncident && selectedIncident?.kind !== 'report'} transparent animationType="slide" onRequestClose={() => setSelectedIncident(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelectedIncident(null)}>
          <View style={styles.modalCard}>
            <View style={styles.handle} />
            {selectedIncident ? (
              <>
                <View style={styles.incidentBadgeRow}>
                  <View
                    style={[
                      styles.incidentBadge,
                      {
                        borderColor: severityColor(selectedIncident.severity),
                        backgroundColor: `${severityColor(selectedIncident.severity)}22`,
                      },
                    ]}
                  >
                    <Text style={[styles.incidentBadgeText, { color: severityColor(selectedIncident.severity) }]}>
                      {(selectedIncident.severity || 'info').toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.modalTitle}>{selectedIncident.title || 'Incident'}</Text>
              </>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  map: { flex: 1 },
  compactSummaryWrap: {
    gap: 8,
    paddingTop: 2,
  },
  compactSummaryTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  compactSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
  },
  compactSummaryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  compactSummaryPercent: {
    fontSize: 18,
    fontWeight: '800',
  },
  compactSummaryLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.heading,
  },
  compactSummaryHint: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.subtext,
  },
  compactSummaryError: {
    fontSize: 11,
    color: Colors.error,
  },
  section: { gap: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.heading },
  sectionText: { fontSize: 12, lineHeight: 18, color: Colors.subtext },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: Colors.btnPrimary },
  disabledBtn: { opacity: 0.45 },
  primaryBtnText: { color: Colors.white, fontSize: 13, fontWeight: '800' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(220,38,38,0.18)', backgroundColor: 'rgba(220,38,38,0.06)' },
  secondaryBtnText: { color: Colors.error, fontSize: 13, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.36)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24, gap: 12 },
  handle: { alignSelf: 'center', width: 52, height: 6, borderRadius: 999, backgroundColor: '#CBD5E1', marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.heading },
  link: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  groupLabel: { fontSize: 13, fontWeight: '800', color: Colors.heading },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  chipTextActive: { color: Colors.white },
  wilayas: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  styleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  styleCard: { width: '48%', padding: 14, borderRadius: 18, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border },
  styleCardActive: { borderColor: Colors.primary, backgroundColor: '#F3EEFF' },
  styleLabel: { marginTop: 10, fontSize: 13, fontWeight: '800', color: Colors.heading },
  styleDesc: { marginTop: 3, fontSize: 12, color: Colors.subtext },
  incidentBadgeRow: { flexDirection: 'row' },
  incidentBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  incidentBadgeText: { fontSize: 11, fontWeight: '800' },
});
