import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import SiaraMap from '../../components/map/SiaraMap';
import DangerForecastChart from '../../components/map/DangerForecastChart';
import DrivingQuiz from '../../components/ui/DrivingQuiz';
import { Colors } from '../../theme/colors';
import { API_BASE_URL } from '../../config/api';

const { width, height } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Layer options matching the web SiaraMap prop values exactly
// ---------------------------------------------------------------------------
const LAYER_OPTIONS = [
  { key: 'points', icon: 'location', label: 'Points' },
  { key: 'heatmap', icon: 'flame', label: 'Heatmap' },
  { key: 'ai', icon: 'analytics', label: 'AI Risks' },
  { key: 'nearbyRoads', icon: 'car', label: 'Nearby Roads' },
];

// ---------------------------------------------------------------------------
// Map style options (free tile layers, no API key)
// ---------------------------------------------------------------------------
const MAP_STYLE_OPTIONS = [
  { key: 'voyager', icon: 'map-outline', label: 'Standard', desc: 'Clean Google Maps-like style' },
  { key: 'satellite', icon: 'earth-outline', label: 'Satellite', desc: 'ESRI satellite imagery' },
  { key: 'dark', icon: 'moon-outline', label: 'Dark', desc: 'Dark mode map' },
  { key: 'osm', icon: 'globe-outline', label: 'Classic', desc: 'OpenStreetMap classic style' },
  { key: 'topo', icon: 'trail-sign-outline', label: 'Terrain', desc: 'Topographic with elevation' },
];

// ---------------------------------------------------------------------------
// Severity filter chips
// ---------------------------------------------------------------------------
const SEVERITY_OPTIONS = [
  { id: 'high', label: 'High', color: '#EF4444' },
  { id: 'medium', label: 'Medium', color: '#F59E0B' },
  { id: 'low', label: 'Low', color: '#10B981' },
];

// ---------------------------------------------------------------------------
// Incident type filter chips (matching web)
// ---------------------------------------------------------------------------
const TYPE_OPTIONS = [
  { id: 'accident', label: 'Accident', icon: 'car' },
  { id: 'traffic', label: 'Traffic', icon: 'swap-horizontal' },
  { id: 'danger', label: 'Danger', icon: 'warning' },
  { id: 'weather', label: 'Weather', icon: 'rainy' },
  { id: 'roadworks', label: 'Roadworks', icon: 'construct' },
];

// ---------------------------------------------------------------------------
// Mock markers (matching web MapPage mockMarkers)
// ---------------------------------------------------------------------------
const MOCK_MARKERS = [
  { id: 1, lat: 36.7538, lng: 3.0588, type: 'accident', severity: 'high', title: 'Multi-vehicle collision' },
  { id: 2, lat: 36.7638, lng: 3.0788, type: 'traffic', severity: 'medium', title: 'Traffic jam' },
  { id: 3, lat: 36.7438, lng: 3.0388, type: 'roadworks', severity: 'low', title: 'Ongoing roadworks' },
  { id: 4, lat: 36.7338, lng: 3.0688, type: 'danger', severity: 'high', title: 'Road blocked' },
];

// ---------------------------------------------------------------------------
// Trending zones (matching web)
// ---------------------------------------------------------------------------
const TRENDING_ZONES = [
  { name: 'Alger Centre', incidents: 12, severity: 'high', updated: '2 min' },
  { name: 'Bab Ezzouar', incidents: 8, severity: 'medium', updated: '5 min' },
  { name: 'El Harrach', incidents: 5, severity: 'medium', updated: '12 min' },
  { name: 'Hydra', incidents: 2, severity: 'low', updated: '20 min' },
];

// ---------------------------------------------------------------------------
// Active alerts (matching web)
// ---------------------------------------------------------------------------
const ACTIVE_ALERTS = [
  { id: 1, title: 'Serious accident A1', type: 'accident', time: '3 min' },
  { id: 2, title: 'Road flooding', type: 'weather', time: '15 min' },
];

// ---------------------------------------------------------------------------
// Algerian wilayas for filter (matching web MapPage left sidebar)
// ---------------------------------------------------------------------------
const ALGERIA_WILAYAS = [
  { code: '16', name: 'Alger' },
  { code: '31', name: 'Oran' },
  { code: '25', name: 'Constantine' },
  { code: '23', name: 'Annaba' },
  { code: '06', name: 'Béjaïa' },
  { code: '15', name: 'Tizi-Ouzou' },
  { code: '09', name: 'Blida' },
  { code: '19', name: 'Sétif' },
  { code: '35', name: 'Boumerdès' },
  { code: '42', name: 'Tipaza' },
  { code: '05', name: 'Batna' },
  { code: '26', name: 'Médéa' },
  { code: '07', name: 'Biskra' },
  { code: '17', name: 'Djelfa' },
  { code: '14', name: 'Tiaret' },
  { code: '27', name: 'Mostaganem' },
  { code: '22', name: 'Sidi-Bel-Abbès' },
  { code: '13', name: 'Tlemcen' },
  { code: '21', name: 'Skikda' },
  { code: '43', name: 'Mila' },
  { code: '34', name: 'B.B.Arreridj' },
  { code: '28', name: "M'Sila" },
  { code: '29', name: 'Mascara' },
  { code: '10', name: 'Bouira' },
  { code: '47', name: 'Ghardaïa' },
  { code: '30', name: 'Ouargla' },
  { code: '39', name: 'El-Oued' },
];

// Severity → color helper
function severityColor(sev) {
  if (sev === 'critical') return '#ef4444';
  if (sev === 'high') return '#f97316';
  if (sev === 'medium') return '#eab308';
  return '#22c55e';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function weatherIconFromCondition(condition) {
  const text = String(condition || '').toLowerCase();
  if (text.includes('orage') || text.includes('thunder')) return 'thunderstorm';
  if (text.includes('pluie') || text.includes('rain') || text.includes('bruine')) return 'rainy';
  if (text.includes('neige') || text.includes('snow')) return 'snow';
  if (text.includes('brouillard') || text.includes('fog')) return 'cloudy-night';
  if (text.includes('couvert') || text.includes('overcast')) return 'cloud';
  if (text.includes('nuage') || text.includes('cloud')) return 'partly-sunny';
  return 'sunny';
}

export default function MapScreen({ navigation }) {
  // ─── Layer state ───
  const [mapLayer, setMapLayer] = useState('points');
  const [showLayerModal, setShowLayerModal] = useState(false);
  const [mapStyle, setMapStyle] = useState('voyager');
  const [showMapStyleModal, setShowMapStyleModal] = useState(false);

  // ─── Filter state ───
  const [severityFilter, setSeverityFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState([]);
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // ─── Search ───
  const [searchText, setSearchText] = useState('');

  // ─── Bottom sheet state ───
  const [bottomTab, setBottomTab] = useState('info'); // 'info' | 'forecast' | 'context'

  // ─── Quiz ───
  const [showQuiz, setShowQuiz] = useState(false);

  // ─── User location ───
  const [userPosition, setUserPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState('unknown');

  // ─── Weather (live from API) ───
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // ─── Forecast (live from API) ───
  const [forecastPoints, setForecastPoints] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(false);

  // ─── Timestamp from SiaraMap ───
  const [selectedTimestampIso, setSelectedTimestampIso] = useState(() => new Date().toISOString());

  // ─── Selected incident (from map marker tap) ───
  const [selectedIncident, setSelectedIncident] = useState(null);

  // ─── Wilaya filter ───
  const [selectedWilaya, setSelectedWilaya] = useState(null);

  // ─── Location error ───
  const [locationError, setLocationError] = useState(null);

  // =======================================================================
  // Request user location (callable from map too)
  // =======================================================================
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
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserPosition({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
    } catch (e) {
      setLocationStatus('error');
      setLocationError('Could not obtain location.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestLocation().catch(() => {});
    return () => { cancelled = true; };
  }, [requestLocation]);

  // =======================================================================
  // Fetch weather when user position or timestamp changes
  // =======================================================================
  useEffect(() => {
    if (!userPosition) return;
    let cancelled = false;

    async function fetchWeather() {
      setWeatherLoading(true);
      try {
        const query = `lat=${encodeURIComponent(userPosition.lat)}&lng=${encodeURIComponent(userPosition.lng)}&timestamp=${encodeURIComponent(selectedTimestampIso)}`;
        const resp = await fetch(`${API_BASE_URL}/api/weather/current?${query}`);
        if (cancelled) return;
        const data = await resp.json();
        if (cancelled) return;
        setWeatherData(data);
      } catch {
        if (!cancelled) setWeatherData(null);
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    }

    const timer = setTimeout(fetchWeather, 700);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [userPosition, selectedTimestampIso]);

  // =======================================================================
  // Fetch 24h forecast when user position or timestamp changes
  // =======================================================================
  useEffect(() => {
    if (!userPosition) return;
    let cancelled = false;

    async function fetchForecast() {
      setForecastLoading(true);
      try {
        const query = `lat=${encodeURIComponent(userPosition.lat)}&lng=${encodeURIComponent(userPosition.lng)}&timestamp=${encodeURIComponent(selectedTimestampIso)}`;
        const resp = await fetch(`${API_BASE_URL}/api/risk/forecast24h?${query}`);
        if (cancelled) return;
        const data = await resp.json();
        if (cancelled) return;
        const basePoints = Array.isArray(data?.points) ? data.points : [];
        const nowPoint = data?.now_point && typeof data.now_point === 'object' ? data.now_point : null;
        setForecastPoints(nowPoint ? [nowPoint, ...basePoints.slice(1)] : basePoints);
      } catch {
        if (!cancelled) setForecastPoints([]);
      } finally {
        if (!cancelled) setForecastLoading(false);
      }
    }

    const timer = setTimeout(fetchForecast, 700);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [userPosition, selectedTimestampIso]);

  // =======================================================================
  // Filter incidents
  // =======================================================================
  const filteredMarkers = useMemo(() => {
    return MOCK_MARKERS.filter((m) => {
      if (severityFilter.length > 0 && !severityFilter.includes(m.severity)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(m.type)) return false;
      if (searchText && !m.title.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (selectedWilaya && m.wilaya && m.wilaya !== selectedWilaya) return false;
      return true;
    });
  }, [severityFilter, typeFilter, searchText, selectedWilaya]);

  // =======================================================================
  // Toggle helpers
  // =======================================================================
  const toggleSeverity = (id) => {
    setSeverityFilter((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };
  const toggleType = (id) => {
    setTypeFilter((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };
  const clearFilters = () => {
    setSeverityFilter([]);
    setTypeFilter([]);
    setSelectedWilaya(null);
  };
  const hasActiveFilters = severityFilter.length > 0 || typeFilter.length > 0 || !!selectedWilaya;

  // =======================================================================
  // Weather display values
  // =======================================================================
  const weatherTemp = weatherData?.temperature_c != null
    ? `${Math.round(Number(weatherData.temperature_c))}\u00B0C`
    : '--\u00B0C';
  const weatherDesc = weatherLoading && !weatherData
    ? 'Loading...'
    : weatherData?.condition || 'Weather';
  const weatherWind = weatherData?.wind_kmh != null
    ? `${Number(weatherData.wind_kmh).toFixed(1)} km/h`
    : '--';
  const weatherHumidity = weatherData?.humidity_pct != null
    ? `${Math.round(Number(weatherData.humidity_pct))}%`
    : '--';
  const weatherVisibility = weatherData?.visibility_km != null
    ? `${Number(weatherData.visibility_km).toFixed(1)} km`
    : '--';
  const weatherPressure = weatherData?.pressure_hpa != null
    ? `${Number(weatherData.pressure_hpa).toFixed(0)} hPa`
    : '--';
  const weatherIconName = weatherData ? weatherIconFromCondition(weatherData.condition) : 'cloud';

  // =======================================================================
  // RENDER
  // =======================================================================
  return (
    <View style={styles.container}>
      {/* ══════════ Full-screen map ══════════ */}
      <SiaraMap
        style={styles.map}
        markers={filteredMarkers}
        mapLayer={mapLayer}
        tileLayer={mapStyle}
        onMarkerPress={(m) => setSelectedIncident(m)}
        onSelectedTimestampChange={setSelectedTimestampIso}
        setSelectedIncident={setSelectedIncident}
        requestLocation={requestLocation}
        locationError={locationError}
        bottomInset={Math.round(height * 0.34)}
      />

      {/* ══════════ Layer switcher bar (top) ══════════ */}
      <View style={styles.layerBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.layerBarContent}>
          {LAYER_OPTIONS.map((l) => (
            <TouchableOpacity
              key={l.key}
              style={[styles.layerChip, mapLayer === l.key && styles.layerChipActive]}
              onPress={() => setMapLayer(l.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={l.icon}
                size={14}
                color={mapLayer === l.key ? Colors.white : Colors.primary}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.layerChipText, mapLayer === l.key && styles.layerChipTextActive]}>
                {l.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Filter button */}
        <TouchableOpacity
          style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
          onPress={() => setShowFilterSheet(true)}
        >
          <Ionicons name="funnel" size={16} color={hasActiveFilters ? Colors.white : Colors.primary} />
          {hasActiveFilters && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{severityFilter.length + typeFilter.length + (selectedWilaya ? 1 : 0)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ══════════ Right-side FABs ══════════ */}
      <View style={styles.fabColumn}>
        <TouchableOpacity style={styles.fabBtn} onPress={requestLocation}>
          <Ionicons
            name={locationStatus === 'granted' ? 'navigate' : 'navigate-outline'}
            size={20}
            color={locationStatus === 'granted' ? Colors.primary : Colors.grey}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabBtn} onPress={() => setShowMapStyleModal(true)}>
          <Ionicons name="layers-outline" size={20} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabBtn} onPress={() => navigation.navigate('ReportIncident')}>
          <Ionicons name="warning-outline" size={20} color={Colors.error} />
        </TouchableOpacity>
      </View>

      {/* ══════════ Bottom panel ══════════ */}
      <View style={styles.bottomPanel}>
        {/* Handle */}
        <View style={styles.bottomHandle}>
          <View style={styles.handleBar} />
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {[
            { key: 'info', label: 'Info', icon: 'information-circle' },
            { key: 'forecast', label: 'Forecast', icon: 'trending-up' },
            { key: 'context', label: 'Context', icon: 'layers' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, bottomTab === tab.key && styles.tabActive]}
              onPress={() => setBottomTab(tab.key)}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={bottomTab === tab.key ? Colors.primary : Colors.grey}
              />
              <Text style={[styles.tabText, bottomTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.bottomContent} showsVerticalScrollIndicator={false}>

          {/* ──── INFO TAB ──── */}
          {bottomTab === 'info' && (
            <View>
              {/* Weather widget */}
              <View style={styles.weatherCard}>
                <View style={styles.weatherRow}>
                  <Ionicons name={weatherIconName} size={28} color={Colors.primary} />
                  <View style={styles.weatherMain}>
                    <Text style={styles.weatherTemp}>{weatherTemp}</Text>
                    <Text style={styles.weatherDesc}>{weatherDesc}</Text>
                  </View>
                  {weatherLoading && <ActivityIndicator size="small" color={Colors.primary} />}
                </View>
                <View style={styles.weatherDetailsRow}>
                  <View style={styles.weatherDetail}>
                    <Ionicons name="eye" size={14} color={Colors.grey} />
                    <Text style={styles.weatherDetailText}>{weatherVisibility}</Text>
                  </View>
                  <View style={styles.weatherDetail}>
                    <Ionicons name="speedometer" size={14} color={Colors.grey} />
                    <Text style={styles.weatherDetailText}>{weatherWind}</Text>
                  </View>
                  <View style={styles.weatherDetail}>
                    <Ionicons name="water" size={14} color={Colors.grey} />
                    <Text style={styles.weatherDetailText}>{weatherHumidity}</Text>
                  </View>
                  <View style={styles.weatherDetail}>
                    <Ionicons name="barcode" size={14} color={Colors.grey} />
                    <Text style={styles.weatherDetailText}>{weatherPressure}</Text>
                  </View>
                </View>
              </View>

              {/* Quick actions */}
              <Text style={styles.sectionLabel}>Quick Actions</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsScroll}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setShowQuiz(true)}>
                  <View style={[styles.actionIconWrap, { backgroundColor: Colors.blueLight }]}>
                    <Ionicons name="clipboard" size={18} color={Colors.secondary} />
                  </View>
                  <Text style={styles.actionBtnText}>Quiz</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('ReportIncident')}>
                  <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(15,169,88,0.1)' }]}>
                    <Ionicons name="warning" size={18} color={Colors.accent} />
                  </View>
                  <Text style={styles.actionBtnText}>Report</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Alerts')}>
                  <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(249,115,22,0.1)' }]}>
                    <Ionicons name="notifications" size={18} color={Colors.severityHigh} />
                  </View>
                  <Text style={styles.actionBtnText}>Alerts</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Notifications')}>
                  <View style={[styles.actionIconWrap, { backgroundColor: Colors.violetLight }]}>
                    <Ionicons name="mail" size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.actionBtnText}>Inbox</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Dashboard')}>
                  <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(29,78,216,0.1)' }]}>
                    <Ionicons name="grid" size={18} color={Colors.secondary} />
                  </View>
                  <Text style={styles.actionBtnText}>Dashboard</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Predictions')}>
                  <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(122,61,240,0.1)' }]}>
                    <Ionicons name="bulb" size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.actionBtnText}>Predictions</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Quick stats (matching web) */}
              <Text style={styles.sectionLabel}>Statistics</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>156</Text>
                  <Text style={styles.statLabel}>Today</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>6.2</Text>
                  <Text style={styles.statLabel}>Avg. Severity</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>94%</Text>
                  <Text style={styles.statLabel}>AI Accuracy</Text>
                </View>
              </View>
            </View>
          )}

          {/* ──── FORECAST TAB ──── */}
          {bottomTab === 'forecast' && (
            <View>
              <DangerForecastChart points={forecastPoints} loading={forecastLoading} />
              {!forecastLoading && forecastPoints.length === 0 && !userPosition && (
                <Text style={styles.emptyHint}>Enable location to load forecast.</Text>
              )}
            </View>
          )}

          {/* ──── CONTEXT TAB ──── */}
          {bottomTab === 'context' && (
            <View>
              {/* Legend */}
              <Text style={styles.sectionLabel}>Legend</Text>
              <View style={styles.legendCard}>
                {[
                  { label: 'High Severity', color: '#EF4444' },
                  { label: 'Medium Severity', color: '#F59E0B' },
                  { label: 'Low Severity', color: '#10B981' },
                ].map((item) => (
                  <View key={item.label} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendText}>{item.label}</Text>
                  </View>
                ))}
                {mapLayer === 'ai' && (
                  <View style={styles.legendRow}>
                    <View style={styles.legendGradient}>
                      <View style={[styles.legendGradPart, { backgroundColor: '#22c55e' }]} />
                      <View style={[styles.legendGradPart, { backgroundColor: '#eab308' }]} />
                      <View style={[styles.legendGradPart, { backgroundColor: '#f97316' }]} />
                      <View style={[styles.legendGradPart, { backgroundColor: '#ef4444' }]} />
                    </View>
                    <Text style={styles.legendText}>AI Risk (0-100%)</Text>
                  </View>
                )}
              </View>

              {/* Trending zones */}
              <Text style={styles.sectionLabel}>Areas to Watch</Text>
              {TRENDING_ZONES.map((zone, i) => (
                <View key={i} style={styles.zoneItem}>
                  <View style={styles.zoneInfo}>
                    <Text style={styles.zoneName}>{zone.name}</Text>
                    <Text style={styles.zoneMeta}>
                      {zone.incidents} incidents {'\u2022'} {zone.updated}
                    </Text>
                  </View>
                  <View style={[
                    styles.zoneBadge,
                    { backgroundColor: zone.severity === 'high' ? '#FEE2E2' : zone.severity === 'medium' ? '#FEF3C7' : '#D1FAE5' }
                  ]}>
                    <Text style={{ fontSize: 12 }}>
                      {zone.severity === 'high' ? '\uD83D\uDD34' : zone.severity === 'medium' ? '\uD83D\uDFE1' : '\uD83D\uDFE2'}
                    </Text>
                  </View>
                </View>
              ))}

              {/* Active alerts */}
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Active Alerts</Text>
              {ACTIVE_ALERTS.map((alert) => (
                <View key={alert.id} style={styles.alertItem}>
                  <View style={styles.alertIconWrap}>
                    <Ionicons name="notifications" size={16} color={Colors.error} />
                  </View>
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertTitle}>{alert.title}</Text>
                    <Text style={styles.alertTime}>{alert.time} ago</Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={styles.manageAlertsBtn}
                onPress={() => navigation.navigate('Alerts')}
              >
                <Text style={styles.manageAlertsBtnText}>Manage My Alerts</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>

      {/* ══════════ Filter Sheet Modal ══════════ */}
      <Modal
        visible={showFilterSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterSheet(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterSheet(false)}
        >
          <View style={styles.filterModal}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filters</Text>
              {hasActiveFilters && (
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.clearBtn}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Severity */}
            <Text style={styles.filterGroupLabel}>Severity</Text>
            <View style={styles.filterChips}>
              {SEVERITY_OPTIONS.map((s) => {
                const active = severityFilter.includes(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.filterChip,
                      active && { backgroundColor: s.color, borderColor: s.color },
                    ]}
                    onPress={() => toggleSeverity(s.id)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Type */}
            <Text style={styles.filterGroupLabel}>Incident Type</Text>
            <View style={styles.filterChips}>
              {TYPE_OPTIONS.map((t) => {
                const active = typeFilter.includes(t.id);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => toggleType(t.id)}
                  >
                    <Ionicons
                      name={t.icon}
                      size={14}
                      color={active ? Colors.white : Colors.text}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Wilaya */}
            <Text style={styles.filterGroupLabel}>Wilaya</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wilayaScroll}>
              <View style={styles.wilayas}>
                {ALGERIA_WILAYAS.map((w) => {
                  const active = selectedWilaya === w.code;
                  return (
                    <TouchableOpacity
                      key={w.code}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setSelectedWilaya(active ? null : w.code)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {w.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.filterDoneBtn}
              onPress={() => setShowFilterSheet(false)}
            >
              <Text style={styles.filterDoneBtnText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══════════ Map Style Picker Modal ══════════ */}
      <Modal
        visible={showMapStyleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMapStyleModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMapStyleModal(false)}
        >
          <View style={styles.mapStyleModal} onStartShouldSetResponder={() => true}>
            <View style={styles.bottomHandle}>
              <View style={styles.handleBar} />
            </View>
            <Text style={styles.mapStyleModalTitle}>Map Style</Text>
            <View style={styles.mapStyleGrid}>
              {MAP_STYLE_OPTIONS.map((opt) => {
                const isActive = mapStyle === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.mapStyleCard, isActive && styles.mapStyleCardActive]}
                    onPress={() => { setMapStyle(opt.key); setShowMapStyleModal(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.mapStyleIconWrap, isActive && styles.mapStyleIconWrapActive]}>
                      <Ionicons
                        name={opt.icon}
                        size={24}
                        color={isActive ? Colors.white : Colors.primary}
                      />
                    </View>
                    <Text style={[styles.mapStyleLabel, isActive && styles.mapStyleLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.mapStyleDesc} numberOfLines={1}>{opt.desc}</Text>
                    {isActive && (
                      <View style={styles.mapStyleCheck}>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.btnPrimary} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══════════ Driving Quiz ══════════ */}
      <DrivingQuiz visible={showQuiz} onClose={() => setShowQuiz(false)} />

      {/* ══════════ Incident Detail Bottom Sheet ══════════ */}
      <Modal
        visible={!!selectedIncident}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedIncident(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedIncident(null)}
        >
          <View style={styles.incidentSheet} onStartShouldSetResponder={() => true}>
            {/* Handle */}
            <View style={styles.bottomHandle}>
              <View style={styles.handleBar} />
            </View>

            {selectedIncident && (
              <>
                {/* Header */}
                <View style={styles.incidentHeader}>
                  <View style={[
                    styles.incidentSevBadge,
                    { backgroundColor: severityColor(selectedIncident.severity) + '22',
                      borderColor: severityColor(selectedIncident.severity) }
                  ]}>
                    <Text style={[styles.incidentSevText, { color: severityColor(selectedIncident.severity) }]}>
                      {(selectedIncident.severity || 'unknown').toUpperCase()}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedIncident(null)} style={styles.incidentCloseBtn}>
                    <Ionicons name="close" size={20} color={Colors.grey} />
                  </TouchableOpacity>
                </View>

                {/* Title */}
                <Text style={styles.incidentTitle} numberOfLines={2}>
                  {selectedIncident.title || selectedIncident.label || 'Incident'}
                </Text>

                {/* Meta row */}
                <View style={styles.incidentMeta}>
                  {selectedIncident.type && (
                    <View style={styles.incidentMetaItem}>
                      <Ionicons name="pricetag" size={13} color={Colors.grey} />
                      <Text style={styles.incidentMetaText}>{selectedIncident.type}</Text>
                    </View>
                  )}
                  {selectedIncident.wilaya && (
                    <View style={styles.incidentMetaItem}>
                      <Ionicons name="location" size={13} color={Colors.grey} />
                      <Text style={styles.incidentMetaText}>{selectedIncident.wilaya}</Text>
                    </View>
                  )}
                  {selectedIncident.danger_percent != null && (
                    <View style={styles.incidentMetaItem}>
                      <Ionicons name="analytics" size={13} color={Colors.primary} />
                      <Text style={[styles.incidentMetaText, { color: Colors.primary, fontWeight: '700' }]}>
                        {Math.round(selectedIncident.danger_percent)}% risk
                      </Text>
                    </View>
                  )}
                </View>

                {/* AI info */}
                {selectedIncident._aiColor && (
                  <View style={[styles.incidentAiBanner, { borderLeftColor: selectedIncident._aiColor }]}>
                    <Ionicons name="analytics" size={14} color={selectedIncident._aiColor} />
                    <Text style={[styles.incidentAiBannerText, { color: selectedIncident._aiColor }]}>
                      AI Risk: {selectedIncident.danger_percent != null
                        ? `${Math.round(selectedIncident.danger_percent)}%`
                        : selectedIncident._aiLabel || 'Assessed'}
                    </Text>
                  </View>
                )}

                {/* SHAP summary (if available) */}
                {Array.isArray(selectedIncident.shap_features) && selectedIncident.shap_features.length > 0 && (
                  <View style={styles.incidentShapWrap}>
                    <Text style={styles.incidentShapLabel}>Top Risk Factors</Text>
                    {selectedIncident.shap_features.slice(0, 3).map((sf, idx) => (
                      <View key={idx} style={styles.incidentShapRow}>
                        <Text style={styles.incidentShapFeature} numberOfLines={1}>{sf.feature}</Text>
                        <View style={styles.incidentShapBarBg}>
                          <View style={[
                            styles.incidentShapBarFg,
                            { width: `${Math.min(100, Math.abs(sf.shap_value || sf.value || 0) * 100)}%`,
                              backgroundColor: (sf.shap_value || sf.value || 0) > 0 ? Colors.error : Colors.accent }
                          ]} />
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Actions */}
                <View style={styles.incidentActions}>
                  <TouchableOpacity
                    style={styles.incidentActionPrimary}
                    onPress={() => {
                      setSelectedIncident(null);
                      navigation.navigate('IncidentDetail', { id: selectedIncident.id });
                    }}
                  >
                    <Text style={styles.incidentActionPrimaryText}>View Full Details</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.incidentActionSecondary}
                    onPress={() => setSelectedIncident(null)}
                  >
                    <Text style={styles.incidentActionSecondaryText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ===========================================================================
// Styles
// ===========================================================================
const CARD_RADIUS = 14;
const SHADOW = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  map: {
    flex: 1,
  },

  /* ── Layer switcher bar ── */
  layerBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 36,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  layerBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: Colors.border,
    ...SHADOW,
  },
  layerChipActive: {
    backgroundColor: Colors.btnPrimary,
    borderColor: Colors.btnPrimary,
  },
  layerChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  layerChipTextActive: {
    color: Colors.white,
  },
  filterBtn: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...SHADOW,
  },
  filterBtnActive: {
    backgroundColor: Colors.btnPrimary,
    borderColor: Colors.btnPrimary,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },

  /* ── FAB column ── */
  fabColumn: {
    position: 'absolute',
    right: 14,
    bottom: Math.round(height * 0.35) + 14,
    gap: 10,
  },
  fabBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOW,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },

  /* ── Bottom panel ── */
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: height * 0.34,
    ...SHADOW,
  },
  bottomHandle: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  bottomContent: {
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    maxHeight: height * 0.22,
  },

  /* ── Tab bar ── */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginHorizontal: 18,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.grey,
  },
  tabTextActive: {
    color: Colors.primary,
  },

  /* ── Weather card ── */
  weatherCard: {
    backgroundColor: Colors.bg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    marginBottom: 14,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weatherMain: {
    flex: 1,
  },
  weatherTemp: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.heading,
  },
  weatherDesc: {
    fontSize: 13,
    color: Colors.subtext,
    marginTop: 1,
  },
  weatherDetailsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 14,
    flexWrap: 'wrap',
  },
  weatherDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weatherDetailText: {
    fontSize: 11,
    color: Colors.subtext,
  },

  /* ── Section label ── */
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.heading,
    marginBottom: 8,
    marginTop: 4,
  },

  /* ── Quick actions ── */
  actionsScroll: {
    marginBottom: 14,
  },
  actionBtn: {
    alignItems: 'center',
    marginRight: 16,
    gap: 5,
  },
  actionIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: '500',
  },

  /* ── Stats ── */
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.bg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    marginBottom: 14,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.heading,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.subtext,
    marginTop: 2,
  },

  /* ── Forecast ── */
  emptyHint: {
    textAlign: 'center',
    color: Colors.grey,
    fontSize: 13,
    marginTop: 10,
  },

  /* ── Legend ── */
  legendCard: {
    backgroundColor: Colors.bg,
    borderRadius: CARD_RADIUS,
    padding: 12,
    marginBottom: 14,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendGradient: {
    flexDirection: 'row',
    width: 40,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  legendGradPart: {
    flex: 1,
  },
  legendText: {
    fontSize: 12,
    color: Colors.text,
  },

  /* ── Zones ── */
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  zoneMeta: {
    fontSize: 11,
    color: Colors.subtext,
    marginTop: 2,
  },
  zoneBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Alerts ── */
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  alertIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertInfo: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  alertTime: {
    fontSize: 11,
    color: Colors.subtext,
    marginTop: 1,
  },
  manageAlertsBtn: {
    backgroundColor: Colors.btnPrimary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 14,
  },
  manageAlertsBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },

  /* ── Filter Modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  filterModal: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  filterModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.heading,
  },
  clearBtn: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  filterGroupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.subtext,
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.btnPrimary,
    borderColor: Colors.btnPrimary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text,
  },
  filterChipTextActive: {
    color: Colors.white,
  },
  filterDoneBtn: {
    backgroundColor: Colors.btnPrimary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  filterDoneBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },

  /* ── Wilaya filter ── */
  wilayaScroll: {
    marginBottom: 4,
  },
  wilayas: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },

  /* ── Incident Detail Sheet ── */
  incidentSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    ...SHADOW,
  },
  incidentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  incidentSevBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  incidentSevText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  incidentCloseBtn: {
    padding: 4,
  },
  incidentTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.heading,
    marginBottom: 10,
    lineHeight: 24,
  },
  incidentMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  incidentMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  incidentMetaText: {
    fontSize: 12,
    color: Colors.subtext,
    fontWeight: '500',
  },
  incidentAiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(122,61,240,0.06)',
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  incidentAiBannerText: {
    fontSize: 12,
    fontWeight: '700',
  },
  incidentShapWrap: {
    marginBottom: 14,
  },
  incidentShapLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.subtext,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  incidentShapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  incidentShapFeature: {
    fontSize: 11,
    color: Colors.text,
    width: 100,
  },
  incidentShapBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  incidentShapBarFg: {
    height: 6,
    borderRadius: 3,
    minWidth: 4,
  },
  incidentActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  incidentActionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.btnPrimary,
    borderRadius: 12,
    paddingVertical: 13,
    gap: 4,
  },
  incidentActionPrimaryText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  incidentActionSecondary: {
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  incidentActionSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.subtext,
  },

  /* ── Map Style Modal ── */
  mapStyleModal: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
  },
  mapStyleModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.heading,
    textAlign: 'center',
    marginBottom: 18,
  },
  mapStyleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  mapStyleCard: {
    width: (width - 60) / 3,
    backgroundColor: Colors.bg,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  mapStyleCardActive: {
    borderColor: Colors.btnPrimary,
    backgroundColor: Colors.violetLight,
  },
  mapStyleIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  mapStyleIconWrapActive: {
    backgroundColor: Colors.btnPrimary,
  },
  mapStyleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.heading,
    marginBottom: 2,
  },
  mapStyleLabelActive: {
    color: Colors.btnPrimary,
  },
  mapStyleDesc: {
    fontSize: 9,
    color: Colors.subtext,
    textAlign: 'center',
  },
  mapStyleCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
});
