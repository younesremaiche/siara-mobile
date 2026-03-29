import React, { useState, useEffect, useRef, useMemo, useCallback, useImperativeHandle } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { API_BASE_URL } from '../../config/api';
import useNearbyReports from '../../hooks/useNearbyReports';
import { buildReportMarker } from './ReportMarker';
import GuidedRouteSelector from './GuidedRouteSelector';
import RouteHazardsPanel from './RouteHazardsPanel';
import {
  requestRouteGuidance,
  searchGuidanceDestinations,
} from '../../services/routeGuidanceService';
import {
  DEFAULT_LAT,
  DEFAULT_LNG,
  DEFAULT_ZOOM,
  NEARBY_RADIUS_KM,
  NEARBY_MAX_DESTINATIONS,
  ROUTE_SAMPLE_COUNT,
  NOW_PRESET_REFRESH_MS,
  TIME_PRESETS,
  normalizePosition,
  isValidCoordinate,
  getIncidentColor,
  getDangerColor,
  normalizeDangerLevel,
  formatPercent,
  getWeight,
  getHeatRadius,
  getSegmentPath,
  parseSentinelInfo,
  buildLeafletHTML,
} from '../../utils/mapHelpers';
import {
  normalizeGuidedRoutePayload,
  normalizeNominatimResult,
} from '../../utils/routeGuidance';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Sub-components ──

function PresetPill({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.presetPill, active && styles.presetPillActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.presetPillText, active && styles.presetPillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SentinelWarningCard({ sentinel }) {
  if (!sentinel?.hasSentinel) return null;

  return (
    <View style={styles.sentinelCard}>
      <View style={styles.sentinelHeader}>
        <Ionicons name="warning" size={15} color={Colors.warning} />
        <Text style={styles.sentinelTitle}>Data Quality Notice</Text>
        {sentinel.oodPct != null && <Text style={styles.sentinelOod}> OOD: {sentinel.oodPct}%</Text>}
        {sentinel.confidenceLabel && (
          <View
            style={[
              styles.sentinelConfPill,
              sentinel.isOod ? styles.sentinelConfOod : styles.sentinelConfGood,
            ]}
          >
            <Text style={styles.sentinelConfText}>{sentinel.confidenceLabel}</Text>
          </View>
        )}
      </View>

      {sentinel.sentinelError ? <Text style={styles.sentinelItem}>{'\u2022'} {sentinel.sentinelError}</Text> : null}
      {sentinel.bannerTitle ? <Text style={styles.sentinelBanner}>{sentinel.bannerTitle}</Text> : null}
      {sentinel.bannerDetail ? <Text style={styles.sentinelItem}>{sentinel.bannerDetail}</Text> : null}
      {sentinel.reasons.map((reason, index) => (
        <Text key={index} style={styles.sentinelItem}>{'\u2022'} {reason}</Text>
      ))}
      {sentinel.fallbackDetails.map((detail, index) => (
        <Text key={`fd-${index}`} style={styles.sentinelItem}>{'\u2022'} {detail}</Text>
      ))}
    </View>
  );
}

function ShapExplanation({ explanation, visible, onClose }) {
  if (!visible || !explanation) return null;

  const features = explanation.shap_features || explanation.features || [];
  const summary = explanation.summary || explanation.text || '';
  const dangerPct = explanation.danger_percent ?? null;
  const dangerLevel = normalizeDangerLevel(explanation.danger_level, dangerPct);
  const dangerColor = getDangerColor(dangerLevel);

  return (
    <View style={styles.shapPanel}>
      <View style={styles.shapHeader}>
        <View style={styles.shapTitleRow}>
          <Text style={styles.shapTitle}>AI Explanation</Text>
          {dangerPct != null && (
            <View style={[styles.shapDangerPill, { backgroundColor: `${dangerColor}22`, borderColor: dangerColor }]}>
              <Text style={[styles.shapDangerText, { color: dangerColor }]}>
                {formatPercent(dangerPct)} {dangerLevel}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={22} color={Colors.grey} />
        </TouchableOpacity>
      </View>

      {summary ? <Text style={styles.shapSummary}>{summary}</Text> : null}

      {features.length > 0 && (
        <View style={styles.shapFeatureList}>
          <Text style={styles.shapFeaturesTitle}>Top Contributing Factors</Text>
          {features.slice(0, 8).map((feature, index) => {
            const rawValue = feature.value ?? feature.importance ?? 0;
            const numeric = parseFloat(rawValue);
            const barWidth = Number.isFinite(numeric) ? Math.min(Math.abs(numeric) * 100, 100) : 0;
            const barColor = numeric >= 0 ? '#ef4444' : '#22c55e';
            const name = String(feature.feature || feature.name || `Feature ${index}`).replace(/_/g, ' ');
            const displayValue = Number.isFinite(numeric) ? numeric.toFixed(3) : String(rawValue);
            return (
              <View key={index} style={styles.shapFeatureRow}>
                <Text style={styles.shapFeatureName} numberOfLines={1}>{name}</Text>
                <View style={styles.shapBarContainer}>
                  <View style={[styles.shapBar, { width: `${barWidth}%`, backgroundColor: barColor }]} />
                </View>
                <Text style={styles.shapFeatureValue}>{displayValue}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function buildMarkerPayload(marker, risk) {
  return { ...marker, risk };
}

// ── Main Component ──

const SiaraMap = React.forwardRef(function SiaraMap({
  markers = [],
  mapLayer = 'points',
  tileLayer = 'voyager',
  setSelectedIncident,
  onMarkerPress,
  requestLocation,
  locationError = '',
  showUserLocation = true,
  onSelectedTimestampChange,
  onSnapshotChange,
  bottomInset = 0,
  embeddedLayout = false,
  style,
}, ref) {
  const webViewRef = useRef(null);
  const nowTickRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const nearbyKeyRef = useRef('');
  const hasCenteredUserRef = useRef(false);
  const hasUserInteractedWithMapRef = useRef(false);
  const shouldFitRouteOnStartRef = useRef(false);
  const pendingCameraActionRef = useRef(0);
  const markerSelectRef = useRef(null);
  const guidedSegmentPressRef = useRef(null);

  const [locationStatus, setLocationStatus] = useState('idle');
  const [userLocation, setUserLocation] = useState(null);
  const [internalLocError, setInternalLocError] = useState('');
  const [presetKey, setPresetKey] = useState('0');
  const [customDate, setCustomDate] = useState('');
  const [nowTick, setNowTick] = useState(0);
  const [currentRisk, setCurrentRisk] = useState(null);
  const [currentRiskState, setCurrentRiskState] = useState('idle');
  const [currentRiskError, setCurrentRiskError] = useState('');
  const [overlayBySegment, setOverlayBySegment] = useState({});
  const [overlayState, setOverlayState] = useState('idle');
  const [overlayError, setOverlayError] = useState('');
  const [nearbyRoutes, setNearbyRoutes] = useState([]);
  const [nearbyRoutesState, setNearbyRoutesState] = useState('idle');
  const [nearbyRoutesError, setNearbyRoutesError] = useState('');
  const [shapExplanation, setShapExplanation] = useState(null);
  const [shapVisible, setShapVisible] = useState(false);
  const [shapLoading, setShapLoading] = useState(false);
  const [routeExplainState, setRouteExplainState] = useState('idle');
  const [routeExplainError, setRouteExplainError] = useState('');
  const [destinationQuery, setDestinationQuery] = useState('');
  const [destinationResults, setDestinationResults] = useState([]);
  const [destinationSearchState, setDestinationSearchState] = useState('idle');
  const [destinationSearchError, setDestinationSearchError] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [guidedRoutes, setGuidedRoutes] = useState([]);
  const [selectedGuidedRouteType, setSelectedGuidedRouteType] = useState(null);
  const [guidedRouteState, setGuidedRouteState] = useState('idle');
  const [guidedRouteError, setGuidedRouteError] = useState('');
  const [guidanceActive, setGuidanceActive] = useState(false);
  const [guidanceRefreshTick, setGuidanceRefreshTick] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapViewport, setMapViewport] = useState(null);

  // ── Timestamp computation ──
  const selectedTimestampIso = useMemo(() => {
    if (presetKey === 'custom') {
      const date = new Date(customDate);
      return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    }
    const offset = Number(presetKey);
    const base = Number.isFinite(offset) ? offset : 0;
    nowTick;
    return new Date(Date.now() + base).toISOString();
  }, [presetKey, customDate, nowTick]);

  useEffect(() => {
    if (onSelectedTimestampChange) onSelectedTimestampChange(selectedTimestampIso);
  }, [selectedTimestampIso, onSelectedTimestampChange]);

  useEffect(() => {
    if (nowTickRef.current) {
      clearInterval(nowTickRef.current);
      nowTickRef.current = null;
    }
    if (presetKey === '0') {
      nowTickRef.current = setInterval(() => setNowTick((value) => value + 1), NOW_PRESET_REFRESH_MS);
    }
    return () => {
      if (nowTickRef.current) clearInterval(nowTickRef.current);
    };
  }, [presetKey]);

  // ── Location ──
  useEffect(() => {
    if (!showUserLocation) return undefined;
    let cancelled = false;

    async function doLocation() {
      setLocationStatus('requesting');
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setLocationStatus('denied');
          setInternalLocError('Location access denied.');
          return;
        }
        setLocationStatus('granted');
        setInternalLocError('');
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } catch (error) {
        if (!cancelled) {
          setLocationStatus('error');
          setInternalLocError(error.message || 'Location error.');
        }
      }
    }

    doLocation();
    return () => { cancelled = true; };
  }, [showUserLocation]);

  // ── API: Current risk ──
  useEffect(() => {
    if (!userLocation || locationStatus !== 'granted') {
      setCurrentRisk(null);
      setCurrentRiskState('idle');
      setCurrentRiskError('');
      return undefined;
    }

    let cancelled = false;
    setCurrentRiskState('loading');
    setCurrentRiskError('');

    fetch(`${API_BASE_URL}/api/risk/current`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        timestamp: selectedTimestampIso,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setCurrentRisk(data);
        setCurrentRiskState('success');
      })
      .catch((error) => {
        if (!cancelled) {
          setCurrentRiskState('error');
          setCurrentRiskError(error.message || 'Failed to load current risk');
        }
      });

    return () => { cancelled = true; };
  }, [userLocation, locationStatus, selectedTimestampIso]);

  // ── API: AI overlay ──
  useEffect(() => {
    if (mapLayer !== 'ai' || !userLocation || !markers.length) {
      setOverlayBySegment({});
      setOverlayState('idle');
      setOverlayError('');
      return undefined;
    }

    let cancelled = false;
    setOverlayState('loading');
    setOverlayError('');
    const rows = markers.slice(0, 200).map((marker) => ({
      segment_id: String(marker.id),
      lat: marker.lat ?? marker.latitude,
      lng: marker.lng ?? marker.lon ?? marker.longitude,
    }));

    fetch(`${API_BASE_URL}/api/risk/overlay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp: selectedTimestampIso, rows }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const bySegment = {};
        for (const item of data?.results || []) {
          bySegment[String(item.segment_id ?? item.index)] = item;
        }
        setOverlayBySegment(bySegment);
        setOverlayState('success');
      })
      .catch((error) => {
        if (!cancelled) {
          setOverlayState('error');
          setOverlayError(error.message || 'Overlay error');
        }
      });

    return () => { cancelled = true; };
  }, [mapLayer, userLocation, markers, selectedTimestampIso]);

  // ── API: Nearby roads ──
  useEffect(() => {
    if (mapLayer !== 'nearbyRoads') {
      nearbyKeyRef.current = '';
      setNearbyRoutes([]);
      setNearbyRoutesState('idle');
      setNearbyRoutesError('');
      return undefined;
    }
    if (!userLocation || locationStatus !== 'granted') {
      setNearbyRoutes([]);
      setNearbyRoutesState('idle');
      return undefined;
    }

    const key = `${userLocation.latitude.toFixed(3)}:${userLocation.longitude.toFixed(3)}:${selectedTimestampIso}`;
    if (key === nearbyKeyRef.current) return undefined;
    nearbyKeyRef.current = key;

    let cancelled = false;
    setNearbyRoutesState('loading');
    setNearbyRoutesError('');
    fetch(`${API_BASE_URL}/api/risk/nearby-zones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        radius_km: NEARBY_RADIUS_KM,
        max_destinations: NEARBY_MAX_DESTINATIONS,
        timestamp: selectedTimestampIso,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setNearbyRoutes(Array.isArray(data?.routes) ? data.routes : []);
        setNearbyRoutesState('success');
      })
      .catch((error) => {
        if (!cancelled) {
          setNearbyRoutesState('error');
          setNearbyRoutesError(error.message || 'Nearby routes error');
        }
      });

    return () => { cancelled = true; };
  }, [mapLayer, userLocation, locationStatus, selectedTimestampIso]);

  // ── Memoized data ──
  const heatmapPoints = useMemo(
    () =>
      markers
        .map((marker) => {
          const position = normalizePosition(marker);
          if (!position) return null;
          return { ...position, weight: getWeight(marker.severity), severity: marker.severity };
        })
        .filter(Boolean),
    [markers]
  );

  const aiEnrichedMarkers = useMemo(() => {
    if (mapLayer !== 'ai') return markers;
    return markers.map((marker) => {
      const risk = overlayBySegment[String(marker.id)] ?? null;
      if (!risk) return marker;
      const level = normalizeDangerLevel(risk.danger_level, risk.danger_percent);
      const color = getDangerColor(level);
      const percent = parseFloat(risk.danger_percent ?? 0);
      const radius = 8 + (Number.isFinite(percent) ? Math.min(percent, 100) : 0) * 0.14;
      return { ...marker, _aiColor: color, _aiRadius: Math.round(radius), risk };
    });
  }, [mapLayer, markers, overlayBySegment]);

  const nearbyPolylines = useMemo(() => {
    const lines = [];
    nearbyRoutes.forEach((route, routeIndex) => {
      const segments = route.segments || route.path_segments || [route];
      segments.forEach((segment, segmentIndex) => {
        const path = getSegmentPath(segment);
        if (path.length < 2) return;
        const level = normalizeDangerLevel(segment.danger_level ?? segment.dangerLevel, segment.danger_percent ?? segment.dangerPercent);
        lines.push({
          key: `nb-${routeIndex}-${segmentIndex}`,
          coordinates: path,
          color: getDangerColor(level),
          segment,
          strokeWidth: 5,
        });
      });
    });
    return lines;
  }, [nearbyRoutes]);

  const selectedGuidedRoute = useMemo(() => {
    if (!guidedRoutes.length) return null;
    return (
      guidedRoutes.find((route) => route.route_type === selectedGuidedRouteType) ||
      guidedRoutes.find((route) => route.isRecommended) ||
      guidedRoutes[0] ||
      null
    );
  }, [guidedRoutes, selectedGuidedRouteType]);

  const guidedPolylines = useMemo(() => {
    if (!guidedRoutes.length) return [];
    const lines = [];
    const orderedRoutes = [
      ...guidedRoutes.filter((route) => route.route_type !== selectedGuidedRoute?.route_type),
      ...guidedRoutes.filter((route) => route.route_type === selectedGuidedRoute?.route_type),
    ];

    orderedRoutes.forEach((route) => {
      const selected = route.route_type === selectedGuidedRoute?.route_type;
      const segments = Array.isArray(route.segments) ? route.segments : [];
      const fullPath = getSegmentPath({ path: route.path });

      if (fullPath.length >= 2) {
        lines.push({
          key: `${route.route_type}-ghost`,
          coordinates: fullPath,
          color: selected ? '#7c3aed' : '#94a3b8',
          strokeWidth: selected ? 8 : 5,
          opacity: selected ? 0.14 : 0.1,
          dashArray: selected ? null : '10 10',
        });
      }

      if (segments.length > 0) {
        segments.forEach((segment, index) => {
          const path = getSegmentPath(segment);
          if (path.length < 2) return;
          const level = normalizeDangerLevel(segment.danger_level, segment.danger_percent);
          lines.push({
            key: `${route.route_type}-seg-${index}`,
            coordinates: path,
            color: getDangerColor(level),
            strokeWidth: selected ? 6 : 4,
            opacity: selected ? 0.96 : 0.36,
            dashArray: selected ? null : '10 8',
            segment: selected ? segment : null,
          });
        });
      } else if (fullPath.length >= 2) {
        lines.push({
          key: `${route.route_type}-full`,
          coordinates: fullPath,
          color: selected ? Colors.primary : '#94a3b8',
          strokeWidth: selected ? 6 : 4,
          opacity: selected ? 0.9 : 0.3,
          dashArray: selected ? null : '10 8',
          segment: null,
        });
      }

      const destinationCoordinate = normalizePosition(route.destination || selectedDestination);
      if (destinationCoordinate) {
        lines.push({
          key: `${route.route_type}-dest-anchor`,
          coordinates: [
            fullPath[fullPath.length - 1] || destinationCoordinate,
            destinationCoordinate,
          ].filter(Boolean),
          color: selected ? Colors.secondary : '#94a3b8',
          strokeWidth: selected ? 3 : 2,
          opacity: selected ? 0.5 : 0.2,
          dashArray: '4 8',
        });
      }
    });
    return lines;
  }, [guidedRoutes, selectedDestination, selectedGuidedRoute]);

  const routeWarnings = useMemo(() => {
    if (guidedRoutes.length > 0) {
      const hasFallback = guidedRoutes.some(
        (route) => route?.routing_source === 'straight_line' || String(route?.route_warning || '').trim(),
      );
      return hasFallback
        ? ['Live road guidance is temporarily unavailable. Showing a simplified fallback route.']
        : [];
    }
    if (mapLayer !== 'nearbyRoads') return [];
    return nearbyRoutes
      .filter((route) => route?.routing_source === 'straight_line' || String(route?.route_warning || '').trim())
      .map((route) => {
        const name = route?.destination?.name || route?.route_id || 'route';
        return `${name}: Routing fallback (straight-line, not snapped to road)`;
      })
      .slice(0, 4);
  }, [guidedRoutes, mapLayer, nearbyRoutes]);

  const sentinelInfo = useMemo(() => parseSentinelInfo(currentRisk), [currentRisk]);

  const riskDisplay = useMemo(() => {
    if (!currentRisk) return null;
    const percent = currentRisk.danger_percent ?? currentRisk.dangerPercent ?? null;
    const level = normalizeDangerLevel(currentRisk.danger_level ?? currentRisk.dangerLevel, percent);
    return { pct: percent, level, color: getDangerColor(level) };
  }, [currentRisk]);

  const reportsQueryPosition = useMemo(() => {
    if (mapViewport?.latitude != null && mapViewport?.longitude != null) {
      return mapViewport;
    }
    return userLocation;
  }, [mapViewport, userLocation]);

  const {
    reports: nearbyReportsFeed,
    state: reportsState,
    error: reportsError,
  } = useNearbyReports({
    lat: reportsQueryPosition?.latitude,
    lng: reportsQueryPosition?.longitude,
    radiusKm: 25,
    enabled: Boolean(reportsQueryPosition),
  });

  const reportMarkers = useMemo(() => {
    return nearbyReportsFeed
      .map(buildReportMarker)
      .filter(Boolean)
      .map((report) => {
        const coordinate = normalizePosition(report);
        if (!coordinate) return null;
        return {
          ...report,
          coordinate,
          color: report.color,
          radius: report.radius || 18,
        };
      })
      .filter(Boolean);
  }, [nearbyReportsFeed]);

  const incidentMarkers = useMemo(() => {
    const source = mapLayer === 'ai' ? aiEnrichedMarkers : markers;
    return source
      .map((marker) => {
        const coordinate = normalizePosition(marker);
        if (!coordinate) return null;
        const risk = overlayBySegment[String(marker.id)] ?? marker.risk ?? null;
        const color = marker._aiColor || getIncidentColor(marker.severity);
        const radius = Math.max(8, marker._aiRadius || 10);
        return { ...marker, coordinate, color, radius, risk };
      })
      .filter(Boolean);
  }, [mapLayer, aiEnrichedMarkers, markers, overlayBySegment]);

  const mapMarkers = useMemo(() => {
    return [...incidentMarkers, ...reportMarkers];
  }, [incidentMarkers, reportMarkers]);

  const errorMessages = useMemo(() => {
    const messages = [];
    if (currentRiskState === 'error' && currentRiskError) {
      messages.push({ key: 'risk', text: `Current risk: ${currentRiskError}`, isWarning: false });
    }
    if (overlayState === 'error') messages.push({ key: 'overlay', text: `Overlay: ${overlayError}`, isWarning: false });
    if (nearbyRoutesState === 'error') messages.push({ key: 'nearby', text: `Nearby routes: ${nearbyRoutesError}`, isWarning: false });
    if (reportsState === 'error') messages.push({ key: 'reports', text: `Reports: ${reportsError}`, isWarning: false });
    if (guidedRouteState === 'error') messages.push({ key: 'route', text: `Guidance: ${guidedRouteError}`, isWarning: false });
    if (routeExplainState === 'error') messages.push({ key: 'explain', text: `Explanation: ${routeExplainError}`, isWarning: false });
    routeWarnings.forEach((warning, index) => {
      messages.push({ key: `warn-${index}`, text: warning, isWarning: true });
    });
    return messages;
  }, [currentRiskState, currentRiskError, overlayState, overlayError, nearbyRoutesState, nearbyRoutesError, reportsError, reportsState, guidedRouteState, guidedRouteError, routeExplainState, routeExplainError, routeWarnings]);

  // ── Build Leaflet data for WebView ──
  const leafletMarkers = useMemo(() => {
    return mapMarkers.map((m) => ({
      id: m.id,
      lat: m.coordinate.latitude,
      lng: m.coordinate.longitude,
      label: m.title || `Incident ${m.id || ''}`,
      severity: m.severity,
      color: m.color,
      size: m.radius + 4,
      type: m.type,
      glyph: m.glyph || null,
      iconSize: m.iconSize || null,
      iconAnchor: m.iconAnchor || null,
      isReport: Boolean(m.isReport),
    }));
  }, [mapMarkers]);

  const leafletCircles = useMemo(() => {
    if (mapLayer !== 'heatmap') return [];
    return heatmapPoints.map((p) => ({
      lat: p.latitude,
      lng: p.longitude,
      radius: getHeatRadius(p.severity) * (p.weight || 0.6),
      severity: p.severity,
      fillOpacity: 0.15,
      opacity: 0.4,
      weight: 1,
    }));
  }, [mapLayer, heatmapPoints]);

  const leafletPolylines = useMemo(() => {
    const lines = [];
    if (mapLayer === 'nearbyRoads' && guidedRoutes.length === 0) {
      nearbyPolylines.forEach((line) => {
        lines.push({
          coords: line.coordinates.map((c) => [c.latitude, c.longitude]),
          color: line.color,
          weight: line.strokeWidth,
          tappable: true,
          segment: line.segment,
          opacity: 0.7,
        });
      });
    }
    guidedPolylines.forEach((line) => {
      lines.push({
        coords: line.coordinates.map((c) => [c.latitude, c.longitude]),
        color: line.color,
        weight: line.strokeWidth,
        tappable: Boolean(line.segment),
        segment: line.segment || null,
        opacity: line.opacity,
        dashArray: line.dashArray,
      });
    });
    return lines;
  }, [mapLayer, guidedRoutes.length, nearbyPolylines, guidedPolylines]);

  // Add destination markers
  const allLeafletMarkers = useMemo(() => {
    const all = [...leafletMarkers];
    const destinationSource = selectedGuidedRoute?.destination || selectedDestination;
    const destCoord = normalizePosition(destinationSource);
    if (destCoord) {
      all.push({
        id: '__destination__',
        lat: destCoord.latitude,
        lng: destCoord.longitude,
        label: destinationSource?.name || 'Destination',
        color: Colors.secondary,
        size: 18,
        severity: 'destination',
      });
    }
    return all;
  }, [leafletMarkers, selectedDestination, selectedGuidedRoute]);

  const mapCenter = useMemo(() => {
    if (mapViewport?.latitude != null && mapViewport?.longitude != null) {
      return [mapViewport.latitude, mapViewport.longitude];
    }
    if (isValidCoordinate(userLocation)) {
      return [userLocation.latitude, userLocation.longitude];
    }
    return [DEFAULT_LAT, DEFAULT_LNG];
  }, [mapViewport, userLocation]);

  const mapZoom = useMemo(() => {
    if (Number.isFinite(Number(mapViewport?.zoom))) return Number(mapViewport.zoom);
    if (isValidCoordinate(userLocation)) return 12;
    return DEFAULT_ZOOM;
  }, [mapViewport?.zoom, userLocation]);

  // ── Build Leaflet HTML ──
  const leafletHTML = useMemo(() => {
    return buildLeafletHTML({
      center: mapCenter,
      zoom: mapZoom,
      tileLayer,
      markers: allLeafletMarkers,
      circles: leafletCircles,
      polylines: leafletPolylines,
      userLocation: isValidCoordinate(userLocation) ? userLocation : null,
      mapLayer,
    });
  }, [mapCenter, mapZoom, tileLayer, allLeafletMarkers, leafletCircles, leafletPolylines, userLocation, mapLayer]);

  // ── Send message to WebView ──
  const postToWebView = useCallback((message) => {
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify(message));
    }
  }, []);

  const setViewportFromCoordinate = useCallback((coordinate, zoom = 12, { userInitiated = false } = {}) => {
    const normalized = normalizePosition(coordinate);
    if (!normalized) return;

    setMapViewport({
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      zoom,
    });

    if (userInitiated) {
      hasUserInteractedWithMapRef.current = true;
    }

    if (mapReady) {
      pendingCameraActionRef.current += 1;
      postToWebView({
        type: 'setView',
        lat: normalized.latitude,
        lng: normalized.longitude,
        zoom,
      });
    }
  }, [mapReady, postToWebView]);

  // ── Center on user location when first available ──
  useEffect(() => {
    if (!mapReady || !userLocation || hasCenteredUserRef.current) return;
    hasCenteredUserRef.current = true;
    setViewportFromCoordinate(userLocation, 12);
  }, [mapReady, setViewportFromCoordinate, userLocation]);

  // ── Fit route coordinates ──
  const routeCoordinates = useMemo(() => {
    if (guidedRoutes.length > 0 && guidedPolylines.length > 0) {
      return guidedPolylines.flatMap((line) => line.coordinates);
    }
    if (mapLayer === 'nearbyRoads') {
      return nearbyPolylines.flatMap((line) => line.coordinates);
    }
    return [];
  }, [guidedPolylines, guidedRoutes.length, mapLayer, nearbyPolylines]);

  useEffect(() => {
    if (!mapReady || guidedRoutes.length === 0 || routeCoordinates.length < 2 || !shouldFitRouteOnStartRef.current) return;
    shouldFitRouteOnStartRef.current = false;
    const bounds = routeCoordinates.map((c) => [c.latitude, c.longitude]);
    pendingCameraActionRef.current += 1;
    postToWebView({ type: 'fitBounds', bounds });
  }, [guidedRoutes.length, mapReady, routeCoordinates, postToWebView]);

  // ── WebView message handler ──
  const handleWebViewMessage = useCallback((event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'mapReady') {
        setMapReady(true);
      }
      if (msg.type === 'mapRegionChange' && msg.center) {
        const center = normalizePosition(msg.center);
        if (center) {
          setMapViewport({
            latitude: center.latitude,
            longitude: center.longitude,
            zoom: Number.isFinite(Number(msg.zoom)) ? Number(msg.zoom) : mapViewport?.zoom || DEFAULT_ZOOM,
          });
          if (pendingCameraActionRef.current > 0) {
            pendingCameraActionRef.current -= 1;
          } else if (hasCenteredUserRef.current || hasUserInteractedWithMapRef.current) {
            hasUserInteractedWithMapRef.current = true;
          }
        }
      }
      if (msg.type === 'markerPress' && msg.marker) {
        const marker = mapMarkers.find((m) => String(m.id) === String(msg.marker.id));
        if (marker && markerSelectRef.current) markerSelectRef.current(marker);
      }
      if (msg.type === 'polylinePress' && msg.segment) {
        guidedSegmentPressRef.current?.(msg.segment);
      }
    } catch {
      // ignore parse errors
    }
  }, [mapMarkers, mapViewport?.zoom]);

  // ── Marker selection ──
  const handleMarkerSelect = useCallback(
    async (marker) => {
      if (marker?.isReport || marker?.kind === 'report') {
        if (setSelectedIncident) setSelectedIncident(marker);
        if (onMarkerPress) onMarkerPress(marker);
        return;
      }

      if (mapLayer !== 'ai') {
        if (setSelectedIncident) setSelectedIncident(marker);
        if (onMarkerPress) onMarkerPress(marker);
        return;
      }

      const risk = overlayBySegment[String(marker.id)] ?? marker.risk ?? null;
      if (!userLocation) {
        if (setSelectedIncident) setSelectedIncident(buildMarkerPayload(marker, risk));
        return;
      }

      setShapLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/risk/explain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segment_id: String(marker.id),
            lat: marker.lat ?? marker.latitude,
            lng: marker.lng ?? marker.longitude,
            timestamp: selectedTimestampIso,
          }),
        });
        const explanation = await response.json();
        const enrichedMarker = { ...marker, risk, explanation };
        if (setSelectedIncident) setSelectedIncident(enrichedMarker);
        setShapExplanation(explanation);
        setShapVisible(true);
      } catch {
        if (setSelectedIncident) setSelectedIncident(buildMarkerPayload(marker, risk));
      } finally {
        setShapLoading(false);
      }
    },
    [mapLayer, onMarkerPress, overlayBySegment, selectedTimestampIso, setSelectedIncident, userLocation]
  );

  // ── Search ──
  const handleSearchChange = useCallback((text) => {
    setDestinationQuery(text);
    setDestinationSearchError('');
    setShowSearchResults(true);
  }, []);

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    const trimmedQuery = destinationQuery.trim();
    if (trimmedQuery.length < 2) {
      setDestinationResults([]);
      setDestinationSearchState('idle');
      setDestinationSearchError('');
      return undefined;
    }

    if (
      selectedDestination &&
      !showSearchResults &&
      trimmedQuery === String(selectedDestination.full_name || selectedDestination.name || '').trim()
    ) {
      return undefined;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setDestinationSearchState('loading');
      setDestinationSearchError('');
      try {
        const results = await searchGuidanceDestinations(trimmedQuery, { limit: 5 });
        setDestinationResults(results);
        setDestinationSearchState('success');
      } catch (error) {
        setDestinationResults([]);
        setDestinationSearchState('error');
        setDestinationSearchError(error.message || 'Destination search failed');
      }
    }, 400);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [destinationQuery, selectedDestination, showSearchResults]);

  const selectDestination = useCallback((destination) => {
    const normalizedDestination = normalizeNominatimResult(destination);
    setSelectedDestination(normalizedDestination);
    setDestinationQuery(normalizedDestination?.full_name || normalizedDestination?.name || '');
    setDestinationResults([]);
    setDestinationSearchState('success');
    setDestinationSearchError('');
    setShowSearchResults(false);
  }, []);

  // ── Guided segment explanation ──
  const handleGuidedSegmentClick = useCallback(async (segment) => {
    if (!segment?.segment_id) return;
    if (!userLocation || locationStatus !== 'granted') {
      setRouteExplainError('Location required for segment explanation.');
      return;
    }

    setRouteExplainState('loading');
    setRouteExplainError('');
    setShapLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/risk/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment_id: String(segment.segment_id),
          timestamp: selectedTimestampIso,
          top_k: 8,
        }),
      });
      const explanation = await response.json();
      const enriched = {
        ...explanation,
        danger_percent: Number.isFinite(Number(explanation?.danger_percent))
          ? Number(explanation.danger_percent)
          : segment.danger_percent,
        danger_level: explanation?.danger_level || segment.danger_level,
      };
      setShapExplanation(enriched);
      setShapVisible(true);
      setRouteExplainState('success');
      if (setSelectedIncident) {
        setSelectedIncident({
          id: segment.segment_id,
          title: `Route segment ${segment.segment_id}`,
          explanation: enriched,
        });
      }
    } catch (error) {
      setRouteExplainState('error');
      setRouteExplainError(error.message || 'Segment explanation failed');
    } finally {
      setShapLoading(false);
    }
  }, [locationStatus, selectedTimestampIso, setSelectedIncident, userLocation]);

  markerSelectRef.current = handleMarkerSelect;
  guidedSegmentPressRef.current = handleGuidedSegmentClick;

  // ── Route guidance ──
  const startGuidance = useCallback(() => {
    if (!userLocation || locationStatus !== 'granted') {
      setGuidedRouteError('Location is required. Enable GPS first.');
      return;
    }
    if (!selectedDestination) {
      setGuidedRouteError('Select a destination before starting guidance.');
      return;
    }

    if (!guidanceActive) {
      shouldFitRouteOnStartRef.current = true;
    }
    setGuidedRouteError('');
    setGuidanceActive(true);
    setGuidanceRefreshTick((value) => value + 1);
    setShapExplanation(null);
    setShapVisible(false);
  }, [guidanceActive, locationStatus, selectedDestination, userLocation]);

  useEffect(() => {
    if (!guidanceActive) return undefined;
    if (!selectedDestination) {
      setGuidanceActive(false);
      setGuidedRoutes([]);
      setSelectedGuidedRouteType(null);
      setGuidedRouteState('idle');
      return undefined;
    }
    if (!userLocation || locationStatus !== 'granted') {
      setGuidedRouteError('Location is required. Enable GPS first.');
      return undefined;
    }

    let cancelled = false;
    const hasExistingRoutes = guidedRoutes.length > 0;

    async function fetchGuidance() {
      setGuidedRouteState(hasExistingRoutes ? 'refreshing' : 'loading');
      setGuidedRouteError('');

      try {
        const payload = await requestRouteGuidance({
          origin: { lat: userLocation.latitude, lng: userLocation.longitude },
          destination: selectedDestination,
          timestamp: selectedTimestampIso,
          sample_count: ROUTE_SAMPLE_COUNT,
          max_alternatives: 3,
        });

        if (cancelled) return;

        const normalizedPayload = normalizeGuidedRoutePayload(payload);
        const comparisonRows = normalizedPayload.comparisonRows;

        if (!comparisonRows.length) {
          throw new Error('No route alternatives are available right now.');
        }

        setGuidedRoutes(comparisonRows);
        setSelectedGuidedRouteType((current) => (
          comparisonRows.some((route) => route.route_type === current)
            ? current
            : normalizedPayload.recommendedType || comparisonRows[0]?.route_type || null
        ));
        setGuidedRouteState('success');
      } catch (error) {
        if (cancelled) return;
        setGuidedRouteState('error');
        setGuidedRouteError(error.message || 'Route guidance failed');
      }
    }

    fetchGuidance();
    return () => {
      cancelled = true;
    };
  }, [
    guidanceActive,
    guidanceRefreshTick,
    locationStatus,
    selectedDestination,
    selectedTimestampIso,
    userLocation,
  ]);

  const clearGuidance = useCallback(() => {
    shouldFitRouteOnStartRef.current = false;
    setGuidanceActive(false);
    setGuidedRoutes([]);
    setSelectedGuidedRouteType(null);
    setGuidedRouteState('idle');
    setGuidedRouteError('');
    setShapExplanation(null);
    setShapVisible(false);
    setRouteExplainState('idle');
    setRouteExplainError('');
    if (setSelectedIncident) setSelectedIncident(null);
  }, [setSelectedIncident]);

  const recenterOnUser = useCallback(() => {
    if (!userLocation) return;
    setViewportFromCoordinate(userLocation, mapLayer === 'nearbyRoads' ? 11 : 12, { userInitiated: true });
  }, [mapLayer, setViewportFromCoordinate, userLocation]);

  const isGuidanceBusy = guidedRouteState === 'loading' || guidedRouteState === 'refreshing';

  useImperativeHandle(ref, () => ({
    setDestinationQuery: (value) => {
      setDestinationQuery(String(value || ''));
      setShowSearchResults(true);
    },
    setTimePreset: (value) => {
      setPresetKey(String(value || '0'));
    },
    setCustomDate: (value) => {
      setCustomDate(String(value || ''));
    },
    setShowSearchResults: (visible) => {
      setShowSearchResults(Boolean(visible));
    },
    selectDestination,
    clearDestination: () => {
      clearGuidance();
      setDestinationQuery('');
      setSelectedDestination(null);
      setDestinationResults([]);
      setDestinationSearchState('idle');
      setDestinationSearchError('');
      setShowSearchResults(false);
    },
    startGuidance,
    clearGuidance,
    setSelectedRouteType: (routeType) => {
      setSelectedGuidedRouteType(routeType || null);
    },
    openSegmentExplanation: handleGuidedSegmentClick,
    recenterOnUser,
    requestLocation: requestLocation || null,
    showRiskExplanation: () => {
      if (currentRisk?.shap_features?.length > 0) {
        setShapExplanation(currentRisk);
        setShapVisible(true);
      }
    },
  }), [
    clearGuidance,
    currentRisk,
    handleGuidedSegmentClick,
    recenterOnUser,
    requestLocation,
    selectDestination,
    startGuidance,
  ]);

  useEffect(() => {
    if (!onSnapshotChange) return;
    onSnapshotChange({
      destinationQuery,
      destinationResults,
      destinationSearchState,
      destinationSearchError,
      showSearchResults,
      selectedDestination,
      guidedRoutes,
      selectedGuidedRoute,
      selectedGuidedRouteType,
      guidedRouteState,
      guidedRouteError,
      guidanceActive,
      currentRisk,
      currentRiskState,
      currentRiskError,
      riskDisplay,
      sentinelInfo,
      nearbyReports: nearbyReportsFeed,
      nearbyReportsState: reportsState,
      nearbyReportsError: reportsError,
      locationStatus,
      locationError: locationError || internalLocError,
      selectedTimestampIso,
      presetKey,
      customDate,
      isGuidanceBusy,
    });
  }, [
    currentRisk,
    currentRiskError,
    currentRiskState,
    destinationQuery,
    destinationResults,
    destinationSearchError,
    destinationSearchState,
    guidanceActive,
    guidedRouteError,
    guidedRouteState,
    guidedRoutes,
    internalLocError,
    isGuidanceBusy,
    locationError,
    locationStatus,
    nearbyReportsFeed,
    reportsError,
    reportsState,
    onSnapshotChange,
    presetKey,
    riskDisplay,
    selectedDestination,
    selectedGuidedRoute,
    selectedGuidedRouteType,
    selectedTimestampIso,
    sentinelInfo,
    showSearchResults,
    customDate,
  ]);

  // ── RENDER ──
  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: leafletHTML, baseUrl: 'https://localhost' }}
        style={StyleSheet.absoluteFill}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowUniversalAccessFromFileURLs
        allowFileAccess
        originWhitelist={['*']}
        scrollEnabled={false}
        overScrollMode="never"
        nestedScrollEnabled={false}
        bounces={false}
        onMessage={handleWebViewMessage}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
      />

      {errorMessages.length > 0 && (
        <View style={styles.errorStack}>
          {errorMessages.map((message) => (
            <View key={message.key} style={[styles.errorBanner, message.isWarning && styles.warningBanner]}>
              <Ionicons
                name={message.isWarning ? 'warning-outline' : 'alert-circle-outline'}
                size={13}
                color={message.isWarning ? '#92400e' : '#dc2626'}
              />
              <Text style={[styles.errorBannerText, message.isWarning && styles.warningBannerText]}>{message.text}</Text>
            </View>
          ))}
        </View>
      )}

      {!embeddedLayout && (
        <View style={styles.timeBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeBarContent}>
          {TIME_PRESETS.map((preset) => (
            <PresetPill key={preset.key} label={preset.label} active={presetKey === preset.key} onPress={() => setPresetKey(preset.key)} />
          ))}
        </ScrollView>
        {presetKey === 'custom' && (
          <View style={styles.customDateRow}>
            <TextInput
              style={styles.customDateInput}
              placeholder="YYYY-MM-DD HH:mm"
              placeholderTextColor={Colors.grey}
              value={customDate}
              onChangeText={setCustomDate}
              returnKeyType="done"
            />
          </View>
        )}
        </View>
      )}

      {!embeddedLayout && mapLayer === 'nearbyRoads' && (
        <View style={styles.searchPanel}>
          <View style={styles.searchInputRow}>
            <Ionicons name="search" size={18} color={Colors.grey} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search destination..."
              placeholderTextColor={Colors.grey}
              value={destinationQuery}
              onChangeText={handleSearchChange}
              onFocus={() => setShowSearchResults(true)}
              returnKeyType="search"
            />
            {destinationQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  clearGuidance();
                  setDestinationQuery('');
                  setSelectedDestination(null);
                  setDestinationResults([]);
                  setDestinationSearchState('idle');
                  setDestinationSearchError('');
                  setShowSearchResults(false);
                }}
                style={styles.searchClear}
              >
                <Ionicons name="close-circle" size={18} color={Colors.grey} />
              </TouchableOpacity>
            )}
            {destinationSearchState === 'loading' && (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 6 }} />
            )}
          </View>

          {showSearchResults && destinationResults.length > 0 && (
            <View style={styles.searchResultsDropdown}>
              <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                {destinationResults.map((result) => (
                  <TouchableOpacity
                    key={result.id}
                    style={styles.searchResultItem}
                    onPress={() => {
                      Keyboard.dismiss();
                      selectDestination(result);
                    }}
                  >
                    <Ionicons name="location-outline" size={16} color={Colors.primary} style={{ marginRight: 8 }} />
                    <View style={styles.searchResultCopy}>
                      <Text style={styles.searchResultTitle} numberOfLines={1}>{result.name}</Text>
                      <Text style={styles.searchResultText} numberOfLines={2}>
                        {result.subtitle || result.full_name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {showSearchResults && destinationQuery.trim().length >= 2 && destinationSearchState === 'success' && destinationResults.length === 0 ? (
            <View style={styles.searchResultsDropdown}>
              <Text style={styles.searchEmptyText}>No destinations matched your search.</Text>
            </View>
          ) : null}

          {destinationSearchState === 'error' && destinationSearchError ? (
            <Text style={styles.searchErrorText}>{destinationSearchError}</Text>
          ) : null}

          <View style={styles.guidanceRow}>
            <TouchableOpacity
              style={[styles.guidanceBtn, (!selectedDestination || isGuidanceBusy) && styles.guidanceBtnDisabled]}
              onPress={startGuidance}
              disabled={!selectedDestination || isGuidanceBusy}
            >
              {isGuidanceBusy ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Ionicons name="navigate" size={16} color={Colors.white} />
              )}
              <Text style={styles.guidanceBtnText}>
                {guidanceActive ? 'Refresh Guidance' : 'Start Guidance'}
              </Text>
            </TouchableOpacity>
            {guidanceActive || guidedRoutes.length > 0 ? (
              <TouchableOpacity style={styles.clearGuidanceBtn} onPress={clearGuidance}>
                <Ionicons name="close" size={16} color={Colors.error} />
                <Text style={styles.clearGuidanceBtnText}>Clear Route</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}

      {(overlayState === 'loading' || nearbyRoutesState === 'loading' || guidedRouteState === 'loading' || guidedRouteState === 'refreshing') && (
        <View style={styles.layerLoadingBadge}>
          <ActivityIndicator size="small" color={Colors.white} />
          <Text style={styles.layerLoadingText}>
            {overlayState === 'loading'
              ? 'Analyzing AI risk...'
              : guidedRouteState === 'loading' || guidedRouteState === 'refreshing'
                ? 'Calculating route options...'
                : 'Scanning nearby roads...'}
          </Text>
        </View>
      )}

      <TouchableOpacity style={[styles.myLocationBtn, { bottom: bottomInset + 14 }]} onPress={recenterOnUser} activeOpacity={0.7}>
        <Ionicons
          name={locationStatus === 'granted' ? 'navigate' : locationStatus === 'requesting' ? 'hourglass-outline' : 'navigate-outline'}
          size={22}
          color={locationStatus === 'granted' ? Colors.primary : Colors.grey}
        />
      </TouchableOpacity>

      {(locationStatus === 'denied' || locationStatus === 'error') && requestLocation && (
        <TouchableOpacity style={[styles.relocateBtn, { bottom: bottomInset + 68 }]} onPress={requestLocation} activeOpacity={0.8}>
          <Ionicons name="location" size={15} color={Colors.white} />
          <Text style={styles.relocateBtnText}>Enable GPS</Text>
        </TouchableOpacity>
      )}

      {!embeddedLayout && userLocation && riskDisplay && (
        <View style={[styles.riskCard, { bottom: bottomInset + 14 }]}>
          <View style={styles.riskCardHeader}>
            <View style={[styles.riskIndicator, { backgroundColor: riskDisplay.color }]} />
            <Text style={styles.riskCardTitle}>Current Risk</Text>
            {currentRiskState === 'loading' && <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 8 }} />}
            {currentRiskState === 'error' && <Ionicons name="alert-circle" size={16} color={Colors.error} style={{ marginLeft: 8 }} />}
          </View>
          <View style={styles.riskCardBody}>
            <View style={styles.riskMetric}>
              <Text style={[styles.riskPercent, { color: riskDisplay.color }]}>{formatPercent(riskDisplay.pct)}</Text>
              <Text style={styles.riskLevel}>{riskDisplay.level.charAt(0).toUpperCase() + riskDisplay.level.slice(1)}</Text>
            </View>
            {currentRisk?.shap_features?.length > 0 && (
              <TouchableOpacity
                style={styles.riskExplainBtn}
                onPress={() => {
                  setShapExplanation(currentRisk);
                  setShapVisible(true);
                }}
              >
                <Ionicons name="bulb-outline" size={16} color={Colors.primary} />
                <Text style={styles.riskExplainText}>Why?</Text>
              </TouchableOpacity>
            )}
          </View>
          <SentinelWarningCard sentinel={sentinelInfo} />
        </View>
      )}

      {!embeddedLayout && (guidedRoutes.length > 0 || guidedRouteState === 'loading' || guidedRouteState === 'refreshing') && (
        <GuidedRouteSelector
          routes={guidedRoutes}
          selectedRouteType={selectedGuidedRoute?.route_type || selectedGuidedRouteType}
          guidedRouteState={guidedRouteState}
          onSelectRouteType={setSelectedGuidedRouteType}
          onClear={clearGuidance}
          style={[styles.guidanceOverlayCard, { bottom: bottomInset + 128 }]}
        />
      )}

      {!embeddedLayout && selectedGuidedRoute && guidedRouteState !== 'loading' && (
        <RouteHazardsPanel
          route={selectedGuidedRoute}
          onSegmentPress={handleGuidedSegmentClick}
          style={[styles.hazardOverlayCard, { bottom: bottomInset + 268 }]}
        />
      )}

      {shapVisible && (
        <View style={styles.shapOverlay}>
          {shapLoading ? (
            <View style={styles.shapLoadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.shapLoadingText}>Generating explanation...</Text>
            </View>
          ) : (
            <ShapExplanation
              explanation={shapExplanation}
              visible={shapVisible}
              onClose={() => {
                setShapVisible(false);
                setShapExplanation(null);
              }}
            />
          )}
        </View>
      )}

      {locationStatus === 'denied' && (
        <View style={[styles.deniedBanner, { bottom: bottomInset + 14 }]}>
          <Ionicons name="location-outline" size={16} color={Colors.error} />
          <Text style={styles.deniedText}>{locationError || internalLocError || 'Location access denied. Some features are limited.'}</Text>
        </View>
      )}
    </View>
  );
});

export default SiaraMap;

// ── Styles ──
const CARD_RADIUS = 14;
const SHADOW = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  webviewLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  errorStack: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 154 : 134,
    left: 12,
    right: 12,
    gap: 4,
    zIndex: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(254,242,242,0.96)',
    borderLeftWidth: 3,
    borderLeftColor: '#dc2626',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    ...SHADOW,
  },
  errorBannerText: { flex: 1, fontSize: 11, color: '#dc2626', fontWeight: '500' },
  warningBanner: { backgroundColor: 'rgba(255,251,235,0.96)', borderLeftColor: '#d97706' },
  warningBannerText: { color: '#92400e' },

  timeBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 82,
    left: 12,
    right: 12,
    backgroundColor: Colors.white,
    borderRadius: CARD_RADIUS,
    ...SHADOW,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  timeBarContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 6 },
  presetPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  presetPillActive: { backgroundColor: Colors.btnPrimary, borderColor: Colors.btnPrimary },
  presetPillText: { fontSize: 12, fontWeight: '600', color: Colors.btnPrimary },
  presetPillTextActive: { color: Colors.white },
  customDateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingHorizontal: 8 },
  customDateInput: {
    flex: 1,
    height: 36,
    backgroundColor: Colors.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  searchPanel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 168 : 148,
    left: 12,
    right: 12,
    backgroundColor: Colors.white,
    borderRadius: CARD_RADIUS,
    ...SHADOW,
    padding: 10,
    zIndex: 10,
  },
  searchInputRow: { flexDirection: 'row', alignItems: 'center' },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, height: 36, fontSize: 14, color: Colors.text, paddingVertical: 0 },
  searchClear: { padding: 4 },
  searchResultsDropdown: { marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  searchResultCopy: { flex: 1 },
  searchResultTitle: { fontSize: 13, fontWeight: '700', color: Colors.heading, marginBottom: 2 },
  searchResultText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },
  searchEmptyText: { fontSize: 12, color: Colors.subtext, paddingTop: 10, paddingHorizontal: 4 },
  searchErrorText: { marginTop: 8, fontSize: 12, color: Colors.error },
  guidanceRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  guidanceBtn: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.btnPrimary,
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  guidanceBtnDisabled: { opacity: 0.5 },
  guidanceBtnText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  clearGuidanceBtn: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.25)',
  },
  clearGuidanceBtnText: { color: Colors.error, fontSize: 13, fontWeight: '700' },
  guidanceOverlayCard: { position: 'absolute' },
  hazardOverlayCard: { position: 'absolute' },

  layerLoadingBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 220 : 200,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  layerLoadingText: { marginLeft: 8, fontSize: 12, color: Colors.white, fontWeight: '500' },

  myLocationBtn: {
    position: 'absolute',
    left: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOW,
  },
  relocateBtn: {
    position: 'absolute',
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.btnPrimary,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...SHADOW,
  },
  relocateBtnText: { color: Colors.white, fontSize: 12, fontWeight: '700' },

  riskCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: Colors.white,
    borderRadius: CARD_RADIUS,
    ...SHADOW,
    padding: 14,
  },
  riskCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  riskIndicator: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  riskCardTitle: { fontSize: 14, fontWeight: '700', color: Colors.heading },
  riskCardBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  riskMetric: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  riskPercent: { fontSize: 28, fontWeight: '800' },
  riskLevel: { fontSize: 14, fontWeight: '600', color: Colors.subtext },
  riskExplainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  riskExplainText: { marginLeft: 4, fontSize: 12, fontWeight: '600', color: Colors.primary },

  sentinelCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  sentinelHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4, flexWrap: 'wrap' },
  sentinelTitle: { fontSize: 12, fontWeight: '700', color: Colors.warning },
  sentinelOod: { fontSize: 11, color: Colors.warning, fontWeight: '600' },
  sentinelConfPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, marginLeft: 2 },
  sentinelConfOod: { backgroundColor: 'rgba(220,38,38,0.1)', borderColor: 'rgba(220,38,38,0.3)' },
  sentinelConfGood: { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)' },
  sentinelConfText: { fontSize: 10, fontWeight: '700' },
  sentinelBanner: { fontSize: 12, fontWeight: '700', color: Colors.text, marginTop: 3 },
  sentinelItem: { fontSize: 11, color: Colors.text, marginTop: 2, paddingLeft: 4 },

  routeSummaryCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: Colors.white,
    borderRadius: CARD_RADIUS,
    ...SHADOW,
    padding: 12,
  },
  routeSummaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeSummaryTitle: { fontSize: 14, fontWeight: '700', color: Colors.heading },
  routeSummaryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  routeSummaryBadgeText: { fontSize: 12, fontWeight: '700' },
  routeSegBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1.5,
    marginRight: 6,
    backgroundColor: Colors.white,
  },
  routeSegDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  routeSegText: { fontSize: 11, fontWeight: '600', color: Colors.text },
  routeSummaryEmpty: { fontSize: 12, color: Colors.subtext, marginTop: 6 },

  shapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.52,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...SHADOW,
    padding: 16,
  },
  shapLoadingContainer: { alignItems: 'center', paddingVertical: 30 },
  shapLoadingText: { marginTop: 12, fontSize: 13, color: Colors.subtext },
  shapPanel: {},
  shapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  shapTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  shapTitle: { fontSize: 16, fontWeight: '700', color: Colors.heading },
  shapDangerPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  shapDangerText: { fontSize: 12, fontWeight: '700' },
  shapSummary: { fontSize: 13, color: Colors.text, lineHeight: 19, marginBottom: 10 },
  shapFeatureList: { marginTop: 4 },
  shapFeaturesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.subtext,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  shapFeatureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  shapFeatureName: { width: 100, fontSize: 11, color: Colors.text },
  shapBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  shapBar: { height: 6, borderRadius: 3 },
  shapFeatureValue: { width: 50, fontSize: 10, color: Colors.subtext, textAlign: 'right' },

  deniedBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.25)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  deniedText: { marginLeft: 8, fontSize: 12, color: Colors.error, flex: 1 },
});
