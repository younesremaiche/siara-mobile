import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { S } from '../../components/supervisor/SupervisorScreenFrame';
import { useSupervisorGlobalMap } from '../../features/supervisor/hooks/useSupervisorQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

const SEVERITY_COLOR = { critical: '#EF4444', high: '#F97316', medium: '#EAB308', low: '#22C55E' };
const STATUS_COLOR = {
  pending: '#F59E0B', under_review: '#3B82F6', verified: '#22C55E',
  dispatched: '#A855F7', resolved: '#64748B', rejected: '#EF4444',
};

function severityColor(inc) {
  if (inc.severity) return SEVERITY_COLOR[inc.severity] || '#F59E0B';
  const h = inc.severityHint || 0;
  if (h >= 4) return '#EF4444';
  if (h >= 3) return '#F97316';
  if (h >= 2) return '#EAB308';
  return '#22C55E';
}

function severityBucket(inc) {
  const s = String(inc.severity || '').toLowerCase();
  if (s) return s === 'critical' ? 'high' : s;
  const h = inc.severityHint || 0;
  if (h >= 3) return 'high';
  if (h === 2) return 'medium';
  return 'low';
}

function relativeTime(val) {
  if (!val) return '';
  const diff = Date.now() - new Date(val).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ALGERIA_REGION = { latitude: 28.0, longitude: 2.5, latitudeDelta: 14, longitudeDelta: 14 };

export default function SupervisorMapScreen({ navigation }) {
  const [layer, setLayer] = React.useState('both'); // 'incidents' | 'officers' | 'both'
  const [sev, setSev] = React.useState('all');         // all | high | medium | low
  const [coverage, setCoverage] = React.useState('all'); // all | assigned | unassigned
  const mapRef = React.useRef(null);

  // useSupervisorGlobalMap already polls every 30s and shares its cache, so an
  // assignment elsewhere (which invalidates supervisor.*) refreshes this map too.
  const mapQuery = useSupervisorGlobalMap();
  const data = mapQuery.data;
  const loading = mapQuery.isLoading;
  const error = mapQuery.error?.message || '';
  const load = mapQuery.refetch;
  useFocusRefresh(mapQuery.refetch);

  const incidents = data?.incidents || [];
  const officers  = data?.officers  || [];

  const offWithCoords = officers.filter(o => o.lat && o.lng);
  const incWithCoords = incidents
    .filter(i => i.lat && i.lng)
    .filter(i => sev === 'all' || severityBucket(i) === sev)
    .filter(i => {
      if (coverage === 'all') return true;
      const assigned = Boolean(i.assignedOfficerId || i.assignedOfficerName);
      return coverage === 'assigned' ? assigned : !assigned;
    });

  // Legend counts reflect what is currently visible after filtering.
  const sevCounts = { high: 0, medium: 0, low: 0 };
  incWithCoords.forEach(i => { const b = severityBucket(i); if (sevCounts[b] != null) sevCounts[b] += 1; });
  const onDutyCount = offWithCoords.filter(o => o.isOnDuty).length;

  function fitMap() {
    const all = [
      ...(layer !== 'officers' ? incWithCoords.map(i => ({ latitude: i.lat, longitude: i.lng })) : []),
      ...(layer !== 'incidents' ? offWithCoords.map(o => ({ latitude: o.lat, longitude: o.lng })) : []),
    ];
    if (all.length === 0 || !mapRef.current) return;
    mapRef.current.fitToCoordinates(all, { edgePadding: { top: 60, right: 40, bottom: 60, left: 40 }, animated: true });
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <LinearGradient
        colors={[S.gold1, S.gold2, S.gold3]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={18} color={S.light} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Global Map</Text>
            <Text style={s.subtitle}>
              {incWithCoords.length} incidents · {offWithCoords.length} officers
            </Text>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={load} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={18} color={S.muted} />
          </TouchableOpacity>
        </View>

        {/* Layer toggle */}
        <View style={s.layerRow}>
          {[
            ['both',      'Both'],
            ['incidents', 'Incidents'],
            ['officers',  'Officers'],
          ].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[s.layerBtn, layer === key && s.layerBtnActive]}
              onPress={() => setLayer(key)}
              activeOpacity={0.8}
            >
              <Text style={[s.layerText, layer === key && s.layerTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Severity + coverage filters (apply to incidents) */}
        {layer !== 'officers' ? (
          <>
            <View style={[s.layerRow, { marginTop: 8 }]}>
              {[['all', 'All Sev'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[s.layerBtn, sev === key && s.layerBtnActive]}
                  onPress={() => setSev(key)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.layerText, sev === key && s.layerTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[s.layerRow, { marginTop: 8 }]}>
              {[['all', 'All'], ['assigned', 'Assigned'], ['unassigned', 'Unassigned']].map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[s.layerBtn, coverage === key && s.layerBtnActive]}
                  onPress={() => setCoverage(key)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.layerText, coverage === key && s.layerTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
      </LinearGradient>

      {/* Map */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={S.accent} />
          <Text style={s.loadText}>Loading map data...</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={32} color="#EF4444" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load} activeOpacity={0.85}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={ALGERIA_REGION}
            onMapReady={fitMap}
            mapType="standard"
            showsUserLocation={false}
            showsCompass
            showsScale
          >
            {/* Incident markers */}
            {layer !== 'officers' && incWithCoords.map(inc => (
              <Marker
                key={inc.id}
                coordinate={{ latitude: inc.lat, longitude: inc.lng }}
                pinColor={severityColor(inc)}
              >
                <Callout tooltip onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: inc.id })}>
                  <View style={s.callout}>
                    <Text style={s.calloutTitle} numberOfLines={2}>{inc.title || 'Incident'}</Text>
                    {inc.locationLabel ? <Text style={s.calloutSub}>{inc.locationLabel}</Text> : null}
                    <View style={s.calloutTags}>
                      <Text style={[s.calloutTag, { color: severityColor(inc) }]}>
                        {severityBucket(inc).toUpperCase()}
                      </Text>
                      <Text style={[s.calloutTag, { color: STATUS_COLOR[inc.status] || '#94A3B8' }]}>
                        {(inc.status || '').replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <Text style={s.calloutSub}>
                      {inc.assignedOfficerName ? `Officer: ${inc.assignedOfficerName}` : 'Unassigned'}
                    </Text>
                    <Text style={s.calloutLink}>Tap to view details ›</Text>
                  </View>
                </Callout>
              </Marker>
            ))}

            {/* Officer markers */}
            {layer !== 'incidents' && offWithCoords.map(off => (
              <Marker
                key={off.id}
                coordinate={{ latitude: off.lat, longitude: off.lng }}
              >
                {/* Custom officer pin */}
                <View style={[s.officerPin, { borderColor: off.isOnDuty ? '#22C55E' : '#64748B' }]}>
                  <Ionicons name="shield" size={13} color={off.isOnDuty ? '#22C55E' : '#64748B'} />
                </View>
                <Callout tooltip>
                  <View style={s.callout}>
                    <Text style={s.calloutTitle}>{off.name || 'Officer'}</Text>
                    {off.rank || off.badgeNumber ? (
                      <Text style={s.calloutSub}>
                        {[off.rank, off.badgeNumber ? `#${off.badgeNumber}` : null].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                    <Text style={[s.calloutTag, { color: off.isOnDuty ? '#22C55E' : '#94A3B8', marginTop: 4 }]}>
                      {off.isOnDuty ? 'ON DUTY' : 'OFF DUTY'}
                    </Text>
                    {(off.communeName || off.wilayaName) ? (
                      <Text style={s.calloutSub}>{[off.communeName, off.wilayaName].filter(Boolean).join(', ')}</Text>
                    ) : null}
                    {off.locationCapturedAt ? (
                      <Text style={s.calloutSub}>Last seen {relativeTime(off.locationCapturedAt)}</Text>
                    ) : null}
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>

          {/* Fit button */}
          <TouchableOpacity style={s.fitBtn} onPress={fitMap} activeOpacity={0.85}>
            <Ionicons name="expand-outline" size={20} color={S.light} />
          </TouchableOpacity>

          {/* Legend with live counts */}
          <View style={s.legend}>
            {layer !== 'officers' ? (
              <>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: '#F97316' }]} />
                  <Text style={s.legendText}>High {sevCounts.high}</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: '#EAB308' }]} />
                  <Text style={s.legendText}>Med {sevCounts.medium}</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={s.legendText}>Low {sevCounts.low}</Text>
                </View>
              </>
            ) : null}
            {layer !== 'incidents' ? (
              <View style={s.legendItem}>
                <Ionicons name="shield" size={12} color="#22C55E" />
                <Text style={s.legendText}>{onDutyCount}/{offWithCoords.length} on duty</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.gold1 },

  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  backBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  refreshBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { color: S.light, fontSize: 19, fontWeight: '900' },
  subtitle: { color: S.muted, fontSize: 11, marginTop: 1 },

  layerRow: { flexDirection: 'row', gap: 8 },
  layerBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: S.border,
    alignItems: 'center',
  },
  layerBtnActive: { backgroundColor: 'rgba(245,158,11,0.22)', borderColor: 'rgba(245,158,11,0.5)' },
  layerText:      { color: S.muted, fontSize: 12, fontWeight: '700' },
  layerTextActive:{ color: S.accent, fontSize: 12, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  loadText:  { color: S.muted, fontSize: 13 },
  errorText: { color: '#EF4444', fontSize: 13, textAlign: 'center' },
  retryBtn:  { backgroundColor: S.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  callout: {
    backgroundColor: '#1C1200', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    minWidth: 160, maxWidth: 220,
  },
  calloutTitle: { color: S.light, fontSize: 13, fontWeight: '800', marginBottom: 2 },
  calloutSub:   { color: S.muted, fontSize: 11, marginTop: 2 },
  calloutTags:  { flexDirection: 'row', gap: 8, marginTop: 4 },
  calloutTag:   { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  calloutLink:  { color: S.accent, fontSize: 11, fontWeight: '800', marginTop: 6 },

  officerPin: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#1C1200', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },

  fitBtn: {
    position: 'absolute', bottom: 80, right: 14,
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: '#1C1200', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },

  legend: {
    position: 'absolute', bottom: 14, left: 14,
    flexDirection: 'row', gap: 10,
    backgroundColor: 'rgba(28,18,0,0.88)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: S.muted, fontSize: 10, fontWeight: '600' },
});
