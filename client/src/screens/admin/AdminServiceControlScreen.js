import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';
import { HEALTHCHECK_URL, API_BASE_URL } from '../../config/api';

const SERVICES = [
  {
    id: 'api',
    name: 'Backend API',
    description: 'Express server (auth, reports, alerts, dashboard)',
    icon: 'server-outline',
    healthcheck: HEALTHCHECK_URL,
  },
  {
    id: 'db',
    name: 'PostgreSQL + PostGIS',
    description: 'Primary data store and geospatial extension',
    icon: 'cube-outline',
    derivedFrom: 'api',
  },
  {
    id: 'ml',
    name: 'ML Service',
    description: 'Risk prediction & route scoring (Flask)',
    icon: 'analytics-outline',
    healthcheck: `${API_BASE_URL}/api/risk/forecast24h?lat=36.75&lon=3.06`,
  },
  {
    id: 'llm',
    name: 'LLM Explainer (Ollama)',
    description: 'Quiz / risk natural-language explanations',
    icon: 'bulb-outline',
    healthcheck: `${API_BASE_URL}/api/model/quiz/explanation/test`,
  },
  {
    id: 'sockets',
    name: 'Realtime Notifications',
    description: 'Socket.io notification channel',
    icon: 'flash-outline',
    derivedFrom: 'api',
  },
];

async function pingService(url) {
  if (!url) return { ok: false, latency: null, error: 'No URL configured' };
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    const latency = Date.now() - started;
    return { ok: res.ok || res.status < 500, latency, status: res.status };
  } catch (e) {
    return { ok: false, latency: Date.now() - started, error: e?.message || 'Unreachable' };
  }
}

export default function AdminServiceControlScreen({ navigation }) {
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  const runChecks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const results = {};
    await Promise.all(
      SERVICES.map(async (svc) => {
        if (svc.derivedFrom) return;
        results[svc.id] = await pingService(svc.healthcheck);
      }),
    );
    SERVICES.forEach((svc) => {
      if (svc.derivedFrom) {
        results[svc.id] = results[svc.derivedFrom] || { ok: false, latency: null };
      }
    });
    setStatuses(results);
    setLastChecked(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await runChecks({ silent: true });
  }, [runChecks]);

  const overallHealthy =
    Object.values(statuses).length > 0 &&
    Object.values(statuses).every((s) => s?.ok);

  const okCount = Object.values(statuses).filter((s) => s?.ok).length;
  const totalCount = SERVICES.length;

  return (
    <View style={styles.root}>
      <AdminHeader title="Service Control" subtitle="Backend health & status" navigation={navigation} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={[styles.banner, overallHealthy ? styles.bannerOk : styles.bannerWarn]}>
          <Ionicons
            name={overallHealthy ? 'checkmark-circle' : 'warning'}
            size={24}
            color={overallHealthy ? Colors.success : Colors.warning}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.bannerTitle}>
              {overallHealthy ? 'All services operational' : 'Some services need attention'}
            </Text>
            <Text style={styles.bannerSub}>
              {okCount}/{totalCount} healthy
              {lastChecked ? ` · checked ${lastChecked.toLocaleTimeString()}` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => runChecks()} disabled={loading} style={styles.bannerBtn}>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="refresh" size={18} color={Colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {SERVICES.map((svc) => {
          const status = statuses[svc.id];
          const ok = status?.ok;
          const latency = status?.latency;
          return (
            <View key={svc.id} style={styles.card}>
              <View style={[styles.iconWrap, { backgroundColor: ok ? 'rgba(34,197,94,0.10)' : 'rgba(220,38,38,0.10)' }]}>
                <Ionicons name={svc.icon} size={20} color={ok ? Colors.success : Colors.error} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{svc.name}</Text>
                  <View style={[styles.statusPill, ok ? styles.pillOk : styles.pillDown]}>
                    <View style={[styles.dot, { backgroundColor: ok ? Colors.success : Colors.error }]} />
                    <Text style={[styles.statusText, { color: ok ? Colors.success : Colors.error }]}>
                      {loading && !status ? 'Checking…' : ok ? 'UP' : 'DOWN'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardDesc}>{svc.description}</Text>

                {status ? (
                  <View style={styles.metaRow}>
                    {Number.isFinite(latency) ? (
                      <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={12} color={Colors.subtext} />
                        <Text style={styles.metaText}>{latency} ms</Text>
                      </View>
                    ) : null}
                    {status.status ? (
                      <View style={styles.metaItem}>
                        <Ionicons name="pulse-outline" size={12} color={Colors.subtext} />
                        <Text style={styles.metaText}>HTTP {status.status}</Text>
                      </View>
                    ) : null}
                    {status.error ? (
                      <Text style={[styles.metaText, { color: Colors.error, flex: 1 }]} numberOfLines={1}>
                        {status.error}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}

        <Text style={styles.footnote}>
          Pull to refresh. Statuses are derived from healthcheck endpoints; this panel does not start or stop services.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.adminSurface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  bannerOk:   { borderColor: 'rgba(34,197,94,0.35)' },
  bannerWarn: { borderColor: 'rgba(245,158,11,0.35)' },
  bannerTitle: { color: Colors.adminText, fontSize: 15, fontWeight: '700' },
  bannerSub: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  bannerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    flexDirection: 'row',
    backgroundColor: Colors.adminSurface,
    borderColor: Colors.adminBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { color: Colors.adminText, fontSize: 15, fontWeight: '700', flex: 1 },
  cardDesc: { color: '#94A3B8', fontSize: 12, marginTop: 2 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillOk:   { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.35)' },
  pillDown: { backgroundColor: 'rgba(220,38,38,0.10)', borderColor: 'rgba(220,38,38,0.35)' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },

  footnote: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
    fontStyle: 'italic',
  },
});
