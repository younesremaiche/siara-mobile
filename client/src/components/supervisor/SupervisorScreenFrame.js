import React from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

/* ── Design tokens ─────────────────────────────────────────────── */
export const S = {
  gold1:   '#1C1200',  // darkest amber bg
  gold2:   '#3B2600',  // mid amber
  gold3:   '#5C3D00',  // lighter amber
  accent:  '#F59E0B',  // amber-400
  accent2: '#D97706',  // amber-600
  light:   '#FDE68A',  // amber-200 text
  muted:   'rgba(253,230,138,0.55)',
  white:   '#FFFFFF',
  card:    '#241800',  // card background
  border:  'rgba(245,158,11,0.18)',
  borderLight: 'rgba(245,158,11,0.10)',
};

/* ── Status palette ─────────────────────────────────────────────── */
const STATUS_PALETTE = {
  pending:      { bg: 'rgba(234,179,8,0.14)',   fg: '#D97706' },
  under_review: { bg: 'rgba(59,130,246,0.12)',  fg: '#3B82F6' },
  verified:     { bg: 'rgba(34,197,94,0.12)',   fg: '#22C55E' },
  dispatched:   { bg: 'rgba(168,85,247,0.12)',  fg: '#A855F7' },
  resolved:     { bg: 'rgba(100,116,139,0.12)', fg: '#94A3B8' },
  rejected:     { bg: 'rgba(239,68,68,0.12)',   fg: '#EF4444' },
};

const SEVERITY_TOKENS = {
  critical: { bg: 'rgba(239,68,68,0.15)',  fg: '#EF4444', label: 'CRITICAL' },
  high:     { bg: 'rgba(249,115,22,0.15)', fg: '#F97316', label: 'HIGH'     },
  medium:   { bg: 'rgba(234,179,8,0.15)',  fg: '#EAB308', label: 'MEDIUM'   },
  low:      { bg: 'rgba(34,197,94,0.15)',  fg: '#22C55E', label: 'LOW'      },
};

/* ── Atoms ──────────────────────────────────────────────────────── */
export function SupervisorStatusPill({ status }) {
  const key = String(status || '').toLowerCase();
  const pal = STATUS_PALETTE[key] || { bg: 'rgba(100,116,139,0.12)', fg: '#94A3B8' };
  return (
    <View style={[a.pill, { backgroundColor: pal.bg }]}>
      <View style={[a.pillDot, { backgroundColor: pal.fg }]} />
      <Text style={[a.pillText, { color: pal.fg }]}>
        {(status || 'unknown').replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

export function SupervisorSeverityTag({ severity }) {
  const t = SEVERITY_TOKENS[String(severity || '').toLowerCase()] || SEVERITY_TOKENS.low;
  return (
    <View style={[a.sevTag, { backgroundColor: t.bg }]}>
      <Text style={[a.sevText, { color: t.fg }]}>{t.label}</Text>
    </View>
  );
}

export function SupervisorSectionCard({ title, icon, children, action }) {
  return (
    <View style={a.card}>
      <View style={a.cardHeader}>
        <View style={a.cardIconWrap}>
          <Ionicons name={icon} size={15} color={S.accent} />
        </View>
        <Text style={a.cardTitle}>{title}</Text>
        {action ? action : null}
      </View>
      <View style={a.cardBody}>{children}</View>
    </View>
  );
}

export function SupervisorListItem({ title, subtitle, meta = [], right, onPress }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={a.listItem} onPress={onPress} activeOpacity={0.78}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={a.listTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={a.listSub} numberOfLines={2}>{subtitle}</Text> : null}
        {meta.filter(Boolean).length > 0 && (
          <View style={a.metaRow}>
            {meta.filter(Boolean).map((m, i) => (
              <Text key={i} style={a.metaText}>{m}</Text>
            ))}
          </View>
        )}
      </View>
      {right ? <View style={{ marginLeft: 10 }}>{right}</View> : null}
      {onPress ? <Ionicons name="chevron-forward" size={14} color={S.muted} style={{ marginLeft: 6 }} /> : null}
    </Wrap>
  );
}

const a = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillDot: { width: 5, height: 5, borderRadius: 3 },
  pillText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

  sevTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  sevText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  card: {
    backgroundColor: S.card, borderRadius: 18, borderWidth: 1, borderColor: S.border,
    overflow: 'hidden', marginBottom: 0,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: S.borderLight,
  },
  cardIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { flex: 1, color: S.light, fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  cardBody: { padding: 14, gap: 2 },

  listItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: S.borderLight,
  },
  listTitle: { color: S.light, fontSize: 13, fontWeight: '700' },
  listSub:   { color: S.muted, fontSize: 12, lineHeight: 17 },
  metaRow:   { flexDirection: 'row', gap: 10, marginTop: 2 },
  metaText:  { color: S.muted, fontSize: 11 },
});

/* ══════════════════════════════════════════════════════════════════
   MAIN FRAME
══════════════════════════════════════════════════════════════════ */
export default function SupervisorScreenFrame({
  title,
  subtitle,
  stats = [],
  loading = false,
  error = '',
  onRefresh,
  children,
  navigation,
}) {
  return (
    <View style={f.root}>
      {/* Dark amber gradient header */}
      <LinearGradient
        colors={[S.gold1, S.gold2, S.gold3]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={f.header}
      >
        {/* decorative circles */}
        <View style={f.decor1} />
        <View style={f.decor2} />

        <View style={f.headerTop}>
          {navigation ? (
            <TouchableOpacity style={f.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={18} color={S.light} />
            </TouchableOpacity>
          ) : (
            <View style={f.modeBadge}>
              <Ionicons name="eye" size={13} color={S.accent} />
              <Text style={f.modeBadgeText}>SUPERVISOR</Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: navigation ? 10 : 0 }}>
            <Text style={f.title} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={f.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          {onRefresh ? (
            <TouchableOpacity onPress={onRefresh} style={f.refreshBtn} activeOpacity={0.7}>
              <Ionicons name="refresh-outline" size={18} color={S.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {stats.length > 0 && (
          <View style={f.statsRow}>
            {stats.map((st, i) => (
              <React.Fragment key={st.label}>
                {i > 0 && <View style={f.statDiv} />}
                <View style={f.statItem}>
                  <Text style={[f.statValue, { color: st.tone || S.accent }]}>{st.value ?? '—'}</Text>
                  <Text style={f.statLabel}>{st.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}
      </LinearGradient>

      {/* Content */}
      {loading ? (
        <View style={f.center}>
          <ActivityIndicator size="large" color={S.accent} />
          <Text style={f.loadText}>Loading...</Text>
        </View>
      ) : error ? (
        <View style={f.center}>
          <Ionicons name="alert-circle-outline" size={32} color="#EF4444" />
          <Text style={f.errorText}>{error}</Text>
          {onRefresh && (
            <TouchableOpacity style={f.retryBtn} onPress={onRefresh} activeOpacity={0.85}>
              <Text style={f.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          style={f.scroll}
          contentContainerStyle={f.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={S.accent} colors={[S.accent]} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}

const f = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.gold1 },

  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingHorizontal: 18,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  decor1: {
    position: 'absolute', top: -40, right: -40,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(245,158,11,0.07)',
  },
  decor2: {
    position: 'absolute', bottom: -30, left: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(245,158,11,0.05)',
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  backBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  modeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  modeBadgeText: { color: S.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title:    { color: S.light, fontSize: 20, fontWeight: '900' },
  subtitle: { color: S.muted, fontSize: 12, marginTop: 2 },
  refreshBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },

  statsRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, padding: 12 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { color: S.muted, fontSize: 10, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  statDiv:   { width: 1, backgroundColor: 'rgba(245,158,11,0.18)', marginHorizontal: 6 },

  scroll:   { flex: 1 },
  content:  { padding: 14, gap: 12, paddingBottom: 32 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  loadText:  { color: S.muted, fontSize: 13 },
  errorText: { color: '#EF4444', fontSize: 13, textAlign: 'center' },
  retryBtn:  { backgroundColor: S.accent2, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
