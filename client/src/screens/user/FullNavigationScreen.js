import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import {
  buildLeafletHTML,
  getDangerColor,
  getSegmentPath,
  normalizeDangerLevel,
} from '../../utils/mapHelpers';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildNavPolylines(route) {
  if (!route) return [];
  const lines = [];
  const segs = Array.isArray(route.segments) ? route.segments : [];
  const full = getSegmentPath({ path: route.path });
  if (full.length >= 2)
    lines.push({ coords: full.map((c) => [c.latitude, c.longitude]), color: '#7c3aed', weight: 10, opacity: 0.12 });
  if (segs.length > 0) {
    segs.forEach((seg) => {
      const p = getSegmentPath(seg);
      if (p.length < 2) return;
      const lvl = normalizeDangerLevel(seg.danger_level, seg.danger_percent);
      lines.push({ coords: p.map((c) => [c.latitude, c.longitude]), color: getDangerColor(lvl), weight: 7, opacity: 0.96 });
    });
  } else if (full.length >= 2) {
    lines.push({ coords: full.map((c) => [c.latitude, c.longitude]), color: Colors.primary, weight: 7, opacity: 0.9 });
  }
  return lines;
}

function buildBounds(route, dest) {
  const segs = Array.isArray(route?.segments) ? route.segments : [];
  const full = getSegmentPath({ path: route?.path });
  const all = [];
  if (segs.length > 0) segs.forEach((s) => getSegmentPath(s).forEach((c) => all.push(c)));
  else full.forEach((c) => all.push(c));
  if (dest?.lat != null) all.push({ latitude: +dest.lat, longitude: +dest.lng });
  if (!all.length) return null;
  const lats = all.map((c) => c.latitude);
  const lngs = all.map((c) => c.longitude);
  return {
    center: [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2],
    bounds: all.map((c) => [c.latitude, c.longitude]),
  };
}

function fmtEta(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return { num: '--', unit: '' };
  if (n < 60) return { num: `${Math.round(n)}`, unit: 'min' };
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return { num: m > 0 ? `${h}h ${m}m` : `${h}h`, unit: '' };
}

function fmtDist(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return { num: '--', unit: '' };
  return n < 1
    ? { num: `${Math.round(n * 1000)}`, unit: 'm' }
    : { num: `${n.toFixed(1)}`, unit: 'km' };
}

function fmtArrival(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(Date.now() + n * 60000);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return { num: `${h}:${m}`, unit: d.getHours() >= 12 ? 'PM' : 'AM' };
}

function riskInfo(pct) {
  const p = Number(pct);
  if (!Number.isFinite(p)) return { color: Colors.greyLight, label: 'Unknown' };
  if (p >= 65) return { color: Colors.severityCritical, label: 'High Risk' };
  if (p >= 35) return { color: Colors.severityMedium,   label: 'Moderate' };
  return                { color: Colors.severityLow,    label: 'Low Risk' };
}

const ROUTE_BADGE = {
  fastest:  { icon: 'flash',          label: 'Fastest',  color: Colors.secondary },
  safest:   { icon: 'shield-checkmark', label: 'Safest', color: Colors.accent    },
  balanced: { icon: 'git-merge',      label: 'Balanced', color: Colors.primary   },
};

const INJECT_JS = `(function(){
  var l=document.querySelector('.legend');if(l)l.style.display='none';
  var a=document.querySelector('.leaflet-control-attribution');
  if(a){a.style.fontSize='6px';a.style.opacity='0.2';}
})();true;`;

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function FullNavigationScreen({ navigation, route: navRoute }) {
  const { destination, selectedRoute, tileLayer = 'voyager' } = navRoute?.params || {};
  const insets = useSafeAreaInsets();

  const webRef       = useRef(null);
  const liveLocRef   = useRef(null);
  const watchRef     = useRef(null);
  const followingRef = useRef(true);
  const pendingRef   = useRef(0);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const panelAnim  = useRef(new Animated.Value(0)).current;

  const [mapReady,  setMapReady]  = useState(false);
  const [following, setFollowing] = useState(true);
  const [panelH,    setPanelH]    = useState(230);

  const post = useCallback((msg) => webRef.current?.postMessage(JSON.stringify(msg)), []);

  // ── map data ──
  const polylines   = useMemo(() => buildNavPolylines(selectedRoute), [selectedRoute]);
  const destMarkers = useMemo(() => {
    if (destination?.lat == null) return [];
    return [{ id: '__d__', lat: +destination.lat, lng: +destination.lng, label: destination.name || 'Destination', color: Colors.accent, size: 22, severity: 'destination' }];
  }, [destination]);
  const boundsData  = useMemo(() => buildBounds(selectedRoute, destination), [selectedRoute, destination]);
  const initCenter  = useMemo(() => boundsData?.center ?? (destination?.lat != null ? [+destination.lat, +destination.lng] : [36.7538, 3.0588]), [boundsData, destination]);
  const html        = useMemo(() => buildLeafletHTML({ center: initCenter, zoom: 13, tileLayer, markers: destMarkers, circles: [], polylines, userLocation: null, mapLayer: 'points', heatClusters: [], alertZones: [], mapClickEnabled: false }), [initCenter, tileLayer, destMarkers, polylines]);

  // ── fit on ready ──
  useEffect(() => {
    if (!mapReady || !boundsData?.bounds?.length) return;
    pendingRef.current += 1;
    post({ type: 'fitBounds', bounds: boundsData.bounds });
  }, [mapReady, boundsData, post]);

  // ── entrance animation ──
  useEffect(() => {
    Animated.parallel([
      Animated.spring(headerAnim, { toValue: 1, useNativeDriver: true, tension: 85, friction: 13 }),
      Animated.spring(panelAnim,  { toValue: 1, useNativeDriver: true, tension: 85, friction: 13, delay: 80 }),
    ]).start();
  }, [headerAnim, panelAnim]);

  // ── GPS ──
  useEffect(() => {
    let dead = false;
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted' || dead) return;
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, mayShowUserSettingsDialog: false },
        ({ coords: { latitude, longitude } }) => {
          if (dead) return;
          liveLocRef.current = { latitude, longitude };
          const pan = followingRef.current;
          if (pan) pendingRef.current += 1;
          post({ type: 'updateUserLocation', lat: latitude, lng: longitude, pan });
        },
      ).then((sub) => { if (dead) sub.remove(); else watchRef.current = sub; }).catch(() => {});
    });
    return () => { dead = true; watchRef.current?.remove(); watchRef.current = null; };
  }, [post]);

  const onMsg = useCallback((e) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === 'mapReady') setMapReady(true);
      if (m.type === 'mapRegionChange') {
        if (pendingRef.current > 0) pendingRef.current -= 1;
        else { followingRef.current = false; setFollowing(false); }
      }
    } catch { /* noop */ }
  }, []);

  const recenter = useCallback(() => {
    const loc = liveLocRef.current;
    if (loc) { pendingRef.current += 1; post({ type: 'setView', lat: loc.latitude, lng: loc.longitude, zoom: 16 }); }
    else if (boundsData?.bounds?.length) { pendingRef.current += 1; post({ type: 'fitBounds', bounds: boundsData.bounds }); }
    followingRef.current = true;
    setFollowing(true);
  }, [post, boundsData]);

  // ── display values ──
  const eta        = fmtEta(selectedRoute?.eta_min);
  const dist       = fmtDist(selectedRoute?.distance_km);
  const arrival    = fmtArrival(selectedRoute?.eta_min);
  const routeType  = selectedRoute?.route_type || 'balanced';
  const destName   = destination?.name || destination?.full_name || 'Destination';
  const pct        = selectedRoute?.danger_percent;
  const risk       = riskInfo(pct);
  const badge      = ROUTE_BADGE[routeType] || ROUTE_BADGE.balanced;

  const headerY = headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] });
  const panelY  = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [260, 0] });
  const fabScale = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={s.root}>

      {/* ── MAP ── */}
      <WebView
        ref={webRef}
        source={{ html, baseUrl: 'https://localhost' }}
        style={StyleSheet.absoluteFill}
        javaScriptEnabled domStorageEnabled mixedContentMode="always"
        allowUniversalAccessFromFileURLs allowFileAccess originWhitelist={['*']}
        scrollEnabled={false} overScrollMode="never" bounces={false}
        injectedJavaScript={INJECT_JS}
        onMessage={onMsg}
        startInLoadingState
        renderLoading={() => (
          <View style={s.splash}>
            <LinearGradient colors={[Colors.gradientFrom, Colors.gradientTo]} style={s.splashIconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="navigate" size={28} color="#fff" />
            </LinearGradient>
            <Text style={s.splashTitle}>Preparing navigation</Text>
            <Text style={s.splashSub} numberOfLines={1}>{destName}</Text>
          </View>
        )}
      />

      {/* ── HEADER GRADIENT CARD ── */}
      <Animated.View style={[s.headerWrap, { top: 0, transform: [{ translateY: headerY }] }]}>
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.headerGrad, { paddingTop: insets.top + 12 }]}
        >
          {/* decorative circles — same as dashboard */}
          <View style={s.decor1} />
          <View style={s.decor2} />

          <View style={s.headerRow}>
            {/* Back */}
            <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.75} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>

            {/* Destination info */}
            <View style={s.headerInfo}>
              <Text style={s.headerLabel}>NAVIGATING TO</Text>
              <Text style={s.headerDest} numberOfLines={1}>{destName}</Text>
            </View>

            {/* Route type badge */}
            <View style={s.headerBadge}>
              <Ionicons name={badge.icon} size={13} color="#fff" />
              <Text style={s.headerBadgeText}>{badge.label}</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* ── RECENTER FAB ── */}
      <Animated.View style={[s.fabWrap, { bottom: panelH + 14, transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity style={[s.fab, following && s.fabOn]} onPress={recenter} activeOpacity={0.8}>
          <Ionicons name={following ? 'locate' : 'locate-outline'} size={20} color={following ? Colors.primary : Colors.greyLight} />
        </TouchableOpacity>
      </Animated.View>

      {/* ── BOTTOM PANEL ── */}
      <Animated.View
        style={[s.panel, { transform: [{ translateY: panelY }] }]}
        onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
      >
        {/* purple top accent line */}
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.topAccent}
        />

        <View style={[s.panelBody, { paddingBottom: insets.bottom + 24 }]}>

          {/* handle */}
          <View style={s.handle} />

          {/* ── Quick stats row ── same layout as UserDashboard quickStats */}
          <View style={s.statsRow}>

            <View style={s.statItem}>
              <View style={s.statNumRow}>
                <Text style={s.statNum}>{eta.num}</Text>
                {eta.unit ? <Text style={s.statUnit}>{eta.unit}</Text> : null}
              </View>
              <Text style={s.statLabel}>TRAVEL TIME</Text>
            </View>

            <View style={s.statDivider} />

            <View style={s.statItem}>
              <View style={s.statNumRow}>
                <Text style={s.statNum} numberOfLines={1}>{dist.num}</Text>
                {dist.unit ? <Text style={s.statUnit}>{dist.unit}</Text> : null}
              </View>
              <Text style={s.statLabel}>DISTANCE</Text>
            </View>

            {arrival && (
              <>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <View style={s.statNumRow}>
                    <Text style={s.statNum} numberOfLines={1}>{arrival.num}</Text>
                    <Text style={s.statUnit}>{arrival.unit}</Text>
                  </View>
                  <Text style={s.statLabel}>ARRIVAL</Text>
                </View>
              </>
            )}
          </View>

          {/* ── Risk section ── */}
          {pct != null && (
            <View style={s.riskWrap}>
              {/* bar */}
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: risk.color }]} />
              </View>
              {/* label row */}
              <View style={s.riskLabelRow}>
                <View style={[s.riskDot, { backgroundColor: risk.color }]} />
                <Text style={[s.riskLbl, { color: risk.color }]}>{risk.label}</Text>
                <Text style={s.riskPct}>{Math.round(pct)}% risk along route</Text>
              </View>
            </View>
          )}

        </View>
      </Animated.View>

    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — matches SIARA app design language
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  // splash
  splash: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14 },
  splashIconBg: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  splashTitle: { fontSize: 17, fontWeight: '800', color: Colors.heading },
  splashSub: { fontSize: 13, color: Colors.subtext, fontWeight: '500', maxWidth: 240, textAlign: 'center' },

  // ── header gradient card ──
  headerWrap: { position: 'absolute', left: 0, right: 0, zIndex: 10, overflow: 'hidden' },
  headerGrad: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  decor1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -40 },
  decor2: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.05)', top: 10, right: 80 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    flexShrink: 0,
  },
  headerInfo: { flex: 1, gap: 2 },
  headerLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.2 },
  headerDest: { fontSize: 17, fontWeight: '800', color: '#fff' },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    flexShrink: 0,
  },
  headerBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  // ── recenter FAB ──
  fabWrap: { position: 'absolute', right: 16, zIndex: 10 },
  fab: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10,
    elevation: 8,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  fabOn: { borderColor: `${Colors.primary}55`, backgroundColor: Colors.violetLight },

  // ── bottom panel ──
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.09, shadowRadius: 16,
    elevation: 18,
    overflow: 'hidden',
  },
  topAccent: { height: 4 },
  panelBody: { paddingHorizontal: 20, paddingTop: 12, gap: 18 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: Colors.border },

  // quick stats — mirrors UserDashboard pattern
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statNumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  statNum: { fontSize: 22, fontWeight: '800', color: Colors.heading, letterSpacing: -0.5 },
  statUnit: { fontSize: 13, fontWeight: '600', color: Colors.subtext, marginBottom: 4 },
  statLabel: { fontSize: 10, fontWeight: '700', color: Colors.greyLight, letterSpacing: 0.8 },
  statDivider: { width: 1, height: 36, backgroundColor: Colors.border },

  // risk bar
  riskWrap: { gap: 8, paddingBottom: 2 },
  barTrack: { height: 7, borderRadius: 4, backgroundColor: Colors.bg, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  riskLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  riskDot: { width: 8, height: 8, borderRadius: 4 },
  riskLbl: { fontSize: 13, fontWeight: '800' },
  riskPct: { fontSize: 12, color: Colors.subtext, fontWeight: '600' },
});
