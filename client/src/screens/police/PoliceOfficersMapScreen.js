import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SupervisorLeafletMap from '../../components/supervisor/SupervisorLeafletMap';
import { getPoliceZoneOfficers } from '../../services/policeService';
import { Colors } from '../../theme/colors';

// Police-facing map: on-duty officers in the viewer's own work zone, excluding
// themselves (data is scoped server-side by GET /api/police/zone-officers).
export default function PoliceOfficersMapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getPoliceZoneOfficers();
      setOfficers(data);
      setError('');
    } catch (e) {
      setError(e?.message || 'Failed to load officers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [load]);

  const markers = useMemo(
    () => officers
      .filter((o) => o.lat != null && o.lng != null)
      .map((o) => ({
        id: `off-${o.id}`,
        lat: o.lat,
        lng: o.lng,
        color: '#22C55E',
        size: 16,
        label: `${o.name || 'Officer'}${o.rank ? ` · ${o.rank}` : ''}`,
        kind: 'officer',
      })),
    [officers],
  );

  const located = markers.length;
  const total = officers.length;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={18} color={Colors.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Zone Officers</Text>
          <Text style={styles.subtitle}>
            {total} on-duty officer{total !== 1 ? 's' : ''} in your zone
            {total !== located ? ` · ${located} located` : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => load()} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.mapWrap}>
        <SupervisorLeafletMap ref={mapRef} markers={markers} style={{ flex: 1 }} />

        {loading ? (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.overlay}>
            <Ionicons name="alert-circle-outline" size={30} color={Colors.error} />
            <Text style={styles.overlayText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.85}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && !error && located === 0 ? (
          <View style={styles.overlay} pointerEvents="none">
            <Ionicons name="people-outline" size={34} color={Colors.subtext} />
            <Text style={styles.overlayText}>
              No on-duty officers with a live location in your zone right now.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.primary,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: Colors.white, fontSize: 18, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 1 },
  mapWrap: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 28,
    backgroundColor: 'rgba(246,247,251,0.6)',
  },
  overlayText: { color: Colors.text, fontSize: 13, textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 9, marginTop: 4 },
  retryText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
});
