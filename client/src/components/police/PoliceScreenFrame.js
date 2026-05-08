import React from 'react';
import {
  ActivityIndicator,
  Image,
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
import { Colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';

/* ── Design tokens ─────────────────────────────────────────────────── */
const H1 = '#0D1B2A';   // deep navy
const H2 = '#1A3251';   // mid navy-blue
const H3 = '#1E4976';   // lighter navy accent

const SEVERITY_TOKENS = {
  critical: { bg: 'rgba(239,68,68,0.11)',  fg: '#B91C1C', border: '#EF4444', dot: '#EF4444', label: 'CRITICAL' },
  high:     { bg: 'rgba(249,115,22,0.11)', fg: '#C2410C', border: '#F97316', dot: '#F97316', label: 'HIGH'     },
  medium:   { bg: 'rgba(234,179,8,0.13)',  fg: '#A16207', border: '#EAB308', dot: '#EAB308', label: 'MEDIUM'   },
  low:      { bg: 'rgba(34,197,94,0.11)',  fg: '#15803D', border: '#22C55E', dot: '#22C55E', label: 'LOW'      },
  info:     { bg: 'rgba(59,130,246,0.11)', fg: '#1D4ED8', border: '#3B82F6', dot: '#3B82F6', label: 'INFO'     },
};
function severityToken(s) {
  return SEVERITY_TOKENS[String(s || 'info').toLowerCase()] || SEVERITY_TOKENS.info;
}

const STATUS_PALETTE = {
  pending:      { bg: 'rgba(234,179,8,0.12)',   fg: '#A16207' },
  under_review: { bg: 'rgba(59,130,246,0.10)',  fg: '#1D4ED8' },
  verified:     { bg: 'rgba(34,197,94,0.10)',   fg: '#15803D' },
  dispatched:   { bg: 'rgba(124,58,237,0.10)',  fg: '#6D28D9' },
  resolved:     { bg: 'rgba(100,116,139,0.10)', fg: '#475569' },
  rejected:     { bg: 'rgba(239,68,68,0.10)',   fg: '#B91C1C' },
};

/* ══════════════════════════════════════════════════════════════════════
   ATOMS
══════════════════════════════════════════════════════════════════════ */

export function PoliceSeverityTag({ severity, label }) {
  const t = severityToken(severity);
  return (
    <View style={[s.tag, { backgroundColor: t.bg, borderColor: t.border + '55' }]}>
      <View style={[s.tagDot, { backgroundColor: t.dot }]} />
      <Text style={[s.tagText, { color: t.fg }]}>{label || t.label}</Text>
    </View>
  );
}

export function PoliceStatusPill({ status }) {
  const key  = String(status || '').toLowerCase();
  const pal  = STATUS_PALETTE[key] || { bg: 'rgba(100,116,139,0.10)', fg: '#475569' };
  return (
    <View style={[s.statusPill, { backgroundColor: pal.bg }]}>
      <View style={[s.statusDot, { backgroundColor: pal.fg }]} />
      <Text style={[s.statusPillText, { color: pal.fg }]}>
        {(status || 'unknown').replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

/* ── Stat tile — light version (used outside dark header) ─────────── */
export function PoliceStatTile({ label, value, sublabel, tone = Colors.primary, icon = 'analytics-outline' }) {
  return (
    <View style={s.statTile}>
      <View style={[s.statIconBox, { backgroundColor: tone + '18' }]}>
        <Ionicons name={icon} size={17} color={tone} />
      </View>
      <Text style={s.statTileLabel}>{String(label || '').toUpperCase()}</Text>
      <Text style={[s.statTileValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sublabel ? <Text style={s.statTileSub} numberOfLines={1}>{sublabel}</Text> : null}
      <View style={[s.statBar, { backgroundColor: tone + '22' }]}>
        <View style={[s.statBarFill, { backgroundColor: tone }]} />
      </View>
    </View>
  );
}
export function PoliceStatCard(props) { return <PoliceStatTile {...props} />; }

/* ══════════════════════════════════════════════════════════════════════
   OFFICER CARD
══════════════════════════════════════════════════════════════════════ */
export function PoliceOfficerCard({
  name, rank, badgeNumber, avatarUrl,
  isOnDuty = true, wilaya, commune, onWorkZonePress,
}) {
  const initials = (name || 'OF')
    .split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <View style={s.officerCard}>
      <LinearGradient colors={[H1, H2, H3]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.officerBanner}>
        <View style={s.oDecor1} /><View style={s.oDecor2} />

        {/* Avatar */}
        <View style={s.avatarRing}>
          {avatarUrl
            ? <Image source={{ uri: avatarUrl }} style={s.avatarImg} />
            : <Text style={s.avatarInitials}>{initials}</Text>}
          <View style={[s.dutyDot, { backgroundColor: isOnDuty ? '#22C55E' : '#94A3B8' }]} />
        </View>

        {/* Name / rank */}
        <View style={{ flex: 1 }}>
          <Text style={s.officerName} numberOfLines={1}>{name || 'Officer'}</Text>
          <Text style={s.officerRank} numberOfLines={1}>{rank || 'Police Officer'}</Text>
          <View style={[s.dutyPill, { backgroundColor: isOnDuty ? 'rgba(34,197,94,0.22)' : 'rgba(148,163,184,0.2)' }]}>
            <View style={[s.dutyPillDot, { backgroundColor: isOnDuty ? '#22C55E' : '#94A3B8' }]} />
            <Text style={[s.dutyPillText, { color: isOnDuty ? '#22C55E' : '#94A3B8' }]}>
              {isOnDuty ? 'ON DUTY' : 'OFF DUTY'}
            </Text>
          </View>
        </View>

        {/* Shield icon */}
        <View style={s.officerShieldWrap}>
          <Ionicons name="shield-checkmark" size={28} color="rgba(147,197,253,0.35)" />
        </View>
      </LinearGradient>

      {/* Meta row */}
      <View style={s.officerMeta}>
        {[
          { label: 'BADGE',   value: badgeNumber || 'Pending' },
          { label: 'WILAYA',  value: wilaya  || '—' },
          { label: 'COMMUNE', value: commune || '—' },
        ].map((item, i, arr) => (
          <React.Fragment key={item.label}>
            <View style={s.officerMetaItem}>
              <Text style={s.officerMetaLabel}>{item.label}</Text>
              <Text style={s.officerMetaValue} numberOfLines={1}>{item.value}</Text>
            </View>
            {i < arr.length - 1 && <View style={s.officerMetaDivider} />}
          </React.Fragment>
        ))}
      </View>

      {onWorkZonePress && (
        <TouchableOpacity style={s.officerCta} onPress={onWorkZonePress} activeOpacity={0.85}>
          <Ionicons name="map-outline" size={15} color={Colors.primary} />
          <Text style={s.officerCtaText}>Manage work zone</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   INCIDENT CARD
══════════════════════════════════════════════════════════════════════ */
export function PoliceIncidentCard({
  displayId, title, severity = 'medium', locationText,
  description, timeAgo, status, onPress,
  onPrimaryAction, primaryActionLabel = 'Start Review',
  onSecondaryAction, secondaryActionLabel = 'View',
}) {
  const t = severityToken(severity);
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={s.incidentCard} activeOpacity={0.92} onPress={onPress}>
      <View style={[s.incidentAccent, { backgroundColor: t.border }]} />
      <View style={s.incidentBody}>
        <View style={s.incidentTopRow}>
          {displayId && (
            <View style={s.idBadge}><Text style={s.idBadgeText}>{displayId}</Text></View>
          )}
          <PoliceSeverityTag severity={severity} />
          {status && <PoliceStatusPill status={status} />}
        </View>
        {title     && <Text style={s.incidentTitle}     numberOfLines={2}>{title}</Text>}
        {locationText && (
          <View style={s.incidentMeta}>
            <Ionicons name="location-outline" size={12} color={Colors.subtext} />
            <Text style={s.incidentMetaText} numberOfLines={1}>{locationText}</Text>
          </View>
        )}
        {description && <Text style={s.incidentDesc} numberOfLines={2}>{description}</Text>}
        <View style={s.incidentFooter}>
          <View style={s.incidentMeta}>
            <Ionicons name="time-outline" size={12} color={Colors.subtext} />
            <Text style={s.incidentMetaText}>{timeAgo || 'just now'}</Text>
          </View>
          <View style={s.incidentActions}>
            {onSecondaryAction && (
              <TouchableOpacity style={s.btnGhost} onPress={onSecondaryAction} activeOpacity={0.85}>
                <Ionicons name="eye-outline" size={13} color={Colors.heading} />
                <Text style={s.btnGhostText}>{secondaryActionLabel}</Text>
              </TouchableOpacity>
            )}
            {onPrimaryAction && (
              <TouchableOpacity style={s.btnPrimary} onPress={onPrimaryAction} activeOpacity={0.85}>
                <Ionicons name="play-circle-outline" size={13} color={Colors.white} />
                <Text style={s.btnPrimaryText}>{primaryActionLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Wrap>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   QUICK ACTION TILE
══════════════════════════════════════════════════════════════════════ */
export function PoliceQuickActionTile({ icon = 'apps-outline', tone = Colors.primary, label, sublabel, count, onPress }) {
  return (
    <TouchableOpacity style={s.actionTile} onPress={onPress} activeOpacity={0.88}>
      <View style={s.actionTileTop}>
        <View style={[s.actionIconWrap, { backgroundColor: tone + '18' }]}>
          <Ionicons name={icon} size={21} color={tone} />
        </View>
        {typeof count === 'number' && (
          <View style={[s.actionCount, { backgroundColor: tone + '18' }]}>
            <Text style={[s.actionCountText, { color: tone }]}>{count}</Text>
          </View>
        )}
      </View>
      <Text style={s.actionLabel} numberOfLines={1}>{label}</Text>
      {sublabel && <Text style={s.actionSublabel} numberOfLines={2}>{sublabel}</Text>}
    </TouchableOpacity>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TIMELINE ITEM
══════════════════════════════════════════════════════════════════════ */
export function PoliceTimelineItem({ icon = 'ellipse', title, subtitle, timeLabel, isLast }) {
  return (
    <View style={s.tlRow}>
      <View style={s.tlLeft}>
        <View style={s.tlDot}>
          <Ionicons name={icon} size={11} color={Colors.primary} />
        </View>
        {!isLast && <View style={s.tlLine} />}
      </View>
      <View style={s.tlBody}>
        <Text style={s.tlTitle} numberOfLines={1}>{title || 'Activity'}</Text>
        {subtitle  && <Text style={s.tlSub}  numberOfLines={2}>{subtitle}</Text>}
        {timeLabel && <Text style={s.tlTime}>{timeLabel}</Text>}
      </View>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   SECTION CARD
══════════════════════════════════════════════════════════════════════ */
export function PoliceSectionCard({ title, icon, children, actionLabel, onActionPress, count }) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.cardHeaderLeft}>
          {icon && (
            <View style={s.cardIconWrap}>
              <Ionicons name={icon} size={14} color={Colors.primary} />
            </View>
          )}
          <Text style={s.cardTitle}>{title}</Text>
          {typeof count === 'number' && (
            <View style={s.cardBadge}><Text style={s.cardBadgeText}>{count}</Text></View>
          )}
        </View>
        {actionLabel && onActionPress && (
          <TouchableOpacity onPress={onActionPress} activeOpacity={0.85} style={s.cardAction}>
            <Text style={s.cardActionText}>{actionLabel}</Text>
            <Ionicons name="arrow-forward" size={12} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>
      <View style={s.cardDivider} />
      {children}
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MISC EXPORTS
══════════════════════════════════════════════════════════════════════ */
export function PoliceChip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress} activeOpacity={0.85}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PoliceListItem({ title, subtitle, meta = [], right, onPress }) {
  const inner = (
    <View style={s.listItem}>
      <View style={s.listItemMain}>
        <Text style={s.listItemTitle}>{title}</Text>
        {subtitle && <Text style={s.listItemSub}>{subtitle}</Text>}
        {meta.filter(Boolean).length > 0 && (
          <View style={s.metaRow}>
            {meta.filter(Boolean).map(m => <Text key={m} style={s.metaText}>{m}</Text>)}
          </View>
        )}
      </View>
      {right && <View style={s.listItemRight}>{right}</View>}
    </View>
  );
  return onPress
    ? <TouchableOpacity onPress={onPress} activeOpacity={0.88}>{inner}</TouchableOpacity>
    : inner;
}

export function PoliceEmptyState({ icon = 'document-text-outline', title, body }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={24} color={Colors.subtext} />
      </View>
      <Text style={s.emptyTitle}>{title || 'Nothing yet'}</Text>
      {body && <Text style={s.emptyBody}>{body}</Text>}
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN FRAME
══════════════════════════════════════════════════════════════════════ */

/* Dark stat tile — lives inside the gradient header */
function DarkStatTile({ label, value, sublabel, tone, icon = 'analytics-outline' }) {
  const c = tone || '#60A5FA';
  return (
    <View style={s.dStatTile}>
      <View style={s.dStatTop}>
        <View style={[s.dStatIcon, { backgroundColor: c + '22' }]}>
          <Ionicons name={icon} size={14} color={c} />
        </View>
        <Text style={s.dStatLabel}>{String(label || '').toUpperCase()}</Text>
      </View>
      <Text style={[s.dStatValue, { color: c }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sublabel && <Text style={s.dStatSub} numberOfLines={1}>{sublabel}</Text>}
    </View>
  );
}

export default function PoliceScreenFrame({
  title, subtitle, liveLabel, stats = [],
  loading = false, error = '', onRefresh, children,
}) {

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.rootContent}
      refreshControl={
        onRefresh
          ? <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#60A5FA" />
          : undefined
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Dark gradient header ── */}
      <LinearGradient
        colors={[H1, H2, H3]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        {/* decorative blobs */}
        <View style={s.hDecor1} /><View style={s.hDecor2} /><View style={s.hDecor3} />

        {/* top bar */}
        {onRefresh && (
          <View style={s.hTopBar}>
            <View />
            <TouchableOpacity style={s.refreshBtn} onPress={onRefresh} activeOpacity={0.85}>
              <Ionicons name="refresh" size={17} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        )}

        {/* title row */}
        <View style={s.hTitleRow}>
          <View style={s.hShieldBox}>
            <Ionicons name="shield-checkmark" size={24} color="#93C5FD" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.hTitle} numberOfLines={1}>{title || 'Police'}</Text>
            {subtitle && <Text style={s.hSubtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
          {liveLabel && (
            <View style={s.livePill}>
              <View style={[s.liveDot, loading && s.liveDotWait]} />
              <Text style={s.liveText}>{liveLabel}</Text>
            </View>
          )}
        </View>

        {/* stats */}
        {stats.length > 0 && (
          <View style={s.dStatsGrid}>
            {stats.map(item => (
              <View key={item.label} style={[s.dStatCell, stats.length >= 4 && s.dStatCellHalf]}>
                <DarkStatTile {...item} />
              </View>
            ))}
          </View>
        )}
      </LinearGradient>

      {/* ── Body ── */}
      <View style={s.body}>
        {error ? (
          <View style={[s.card, s.errorCard]}>
            <View style={s.errorRow}>
              <Ionicons name="alert-circle" size={17} color={Colors.btnDanger} />
              <Text style={s.errorTitle}>Something went wrong</Text>
            </View>
            <Text style={s.errorBody}>{error}</Text>
            {onRefresh && (
              <TouchableOpacity style={s.errorRetry} onPress={onRefresh} activeOpacity={0.85}>
                <Ionicons name="refresh" size={13} color={Colors.btnDanger} />
                <Text style={s.errorRetryText}>Try again</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {loading && !children ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={s.loadingText}>Loading…</Text>
          </View>
        ) : null}

        {children}
      </View>
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   STYLES
══════════════════════════════════════════════════════════════════════ */
const s = StyleSheet.create({

  /* ── Root ── */
  root: { flex: 1, backgroundColor: Colors.bg },
  rootContent: { paddingBottom: 112 },
  body: { paddingHorizontal: 18, paddingTop: 20, gap: 16 },

  /* ── Hero header ── */
  hero: {
    paddingTop: Platform.OS === 'ios' ? 58 : 46,
    paddingBottom: 26,
    paddingHorizontal: 20,
    gap: 18,
    overflow: 'hidden',
  },
  hDecor1: {
    position: 'absolute', top: -60, right: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  hDecor2: {
    position: 'absolute', bottom: -40, left: -50,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  hDecor3: {
    position: 'absolute', top: 30, left: '45%',
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(96,165,250,0.05)',
  },

  /* top bar */
  hTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(147,197,253,0.13)',
    borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(147,197,253,0.22)',
  },
  modeBtnText: { color: '#93C5FD', fontSize: 12, fontWeight: '700' },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)',
  },

  /* title row */
  hTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  hShieldBox: {
    width: 48, height: 48, borderRadius: 15,
    backgroundColor: 'rgba(96,165,250,0.14)',
    borderWidth: 1, borderColor: 'rgba(96,165,250,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  hTitle: { color: '#F1F5F9', fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  hSubtitle: { color: 'rgba(241,245,249,0.48)', fontSize: 12, marginTop: 2 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(34,197,94,0.17)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.28)',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  liveDotWait: { backgroundColor: '#F59E0B' },
  liveText: { color: '#22C55E', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  /* dark stats grid */
  dStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dStatCell: { flexBasis: '30%', flexGrow: 1, minWidth: 0 },
  dStatCellHalf: { flexBasis: '47%' },
  dStatTile: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16, padding: 13,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    gap: 5,
  },
  dStatTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dStatIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dStatLabel: { color: 'rgba(241,245,249,0.5)', fontSize: 9, fontWeight: '700', letterSpacing: 0.7 },
  dStatValue: { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  dStatSub: { color: 'rgba(241,245,249,0.42)', fontSize: 11 },

  /* ── Light stat tile (used by screens that show it outside the header) ── */
  statTile: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: Colors.borderLight, gap: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  statIconBox: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statTileLabel: { color: Colors.subtext, fontSize: 9, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  statTileValue: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  statTileSub: { color: Colors.subtext, fontSize: 11 },
  statBar: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  statBarFill: { width: '55%', height: '100%', borderRadius: 2 },

  /* ── Officer card ── */
  officerCard: {
    borderRadius: 22, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.borderLight,
    backgroundColor: Colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09, shadowRadius: 14, elevation: 3,
  },
  officerBanner: {
    flexDirection: 'row', alignItems: 'center',
    gap: 14, padding: 18, overflow: 'hidden',
  },
  oDecor1: {
    position: 'absolute', top: -30, right: -30,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  oDecor2: {
    position: 'absolute', bottom: -20, left: '35%',
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(96,165,250,0.06)',
  },
  avatarRing: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(147,197,253,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: 'rgba(147,197,253,0.38)',
  },
  avatarImg: { width: 60, height: 60, borderRadius: 30 },
  avatarInitials: { color: '#93C5FD', fontSize: 20, fontWeight: '800' },
  dutyDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2.5, borderColor: H1,
  },
  officerName: { color: '#F1F5F9', fontSize: 17, fontWeight: '800' },
  officerRank: { color: 'rgba(241,245,249,0.58)', fontSize: 12, marginTop: 2 },
  dutyPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    gap: 5, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 999, marginTop: 7,
  },
  dutyPillDot: { width: 5, height: 5, borderRadius: 3 },
  dutyPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  officerShieldWrap: { opacity: 0.8 },
  officerMeta: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 15,
    backgroundColor: '#F8FAFC',
  },
  officerMetaItem: { flex: 1, alignItems: 'center', gap: 4 },
  officerMetaLabel: { color: Colors.subtext, fontSize: 9, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  officerMetaValue: { color: Colors.heading, fontSize: 13, fontWeight: '800' },
  officerMetaDivider: { width: 1, height: 26, backgroundColor: Colors.border },
  officerCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 13, marginHorizontal: 16, marginBottom: 15,
    borderRadius: 14, backgroundColor: Colors.violetLight,
    borderWidth: 1, borderColor: Colors.violetBorder,
  },
  officerCtaText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },

  /* ── Incident card ── */
  incidentCard: {
    backgroundColor: Colors.white, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: Colors.borderLight,
    flexDirection: 'row', marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  incidentAccent: { width: 4 },
  incidentBody: { flex: 1, padding: 14, gap: 7 },
  incidentTopRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  idBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
  },
  idBadgeText: { color: Colors.heading, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  incidentTitle: { color: Colors.heading, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  incidentMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  incidentMetaText: { color: Colors.subtext, fontSize: 12, flexShrink: 1 },
  incidentDesc: { color: Colors.text, fontSize: 13, lineHeight: 18 },
  incidentFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  incidentActions: { flexDirection: 'row', gap: 6 },
  btnGhost: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  btnGhostText: { color: Colors.heading, fontSize: 12, fontWeight: '700' },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  btnPrimaryText: { color: Colors.white, fontSize: 12, fontWeight: '700' },

  /* ── Tags & pills ── */
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  tagDot: { width: 5, height: 5, borderRadius: 3 },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

  /* ── Quick action tile ── */
  actionTile: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 15,
    borderWidth: 1, borderColor: Colors.borderLight,
    flexBasis: '47%', flexGrow: 1, minWidth: 0, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 7, elevation: 2,
  },
  actionTileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionCount: { minWidth: 26, height: 22, paddingHorizontal: 8, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  actionCountText: { fontSize: 12, fontWeight: '800' },
  actionLabel: { color: Colors.heading, fontSize: 14, fontWeight: '800' },
  actionSublabel: { color: Colors.subtext, fontSize: 11, lineHeight: 15 },

  /* ── Timeline ── */
  tlRow: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  tlLeft: { width: 24, alignItems: 'center' },
  tlDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.violetLight,
    borderWidth: 1, borderColor: Colors.violetBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  tlLine: { flex: 1, width: 2, backgroundColor: Colors.borderLight, marginTop: 3 },
  tlBody: { flex: 1, paddingBottom: 14, gap: 2 },
  tlTitle: { color: Colors.heading, fontSize: 13, fontWeight: '700' },
  tlSub: { color: Colors.text, fontSize: 12, lineHeight: 17 },
  tlTime: { color: Colors.subtext, fontSize: 11, marginTop: 2 },

  /* ── Section card ── */
  card: {
    backgroundColor: Colors.white, borderRadius: 22,
    padding: 16, borderWidth: 1, borderColor: Colors.borderLight, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  cardIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: Colors.violetLight, alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { color: Colors.heading, fontSize: 14, fontWeight: '800' },
  cardBadge: {
    minWidth: 22, height: 20, paddingHorizontal: 7, borderRadius: 10,
    backgroundColor: Colors.violetLight, alignItems: 'center', justifyContent: 'center',
  },
  cardBadgeText: { color: Colors.primary, fontSize: 11, fontWeight: '800' },
  cardAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardActionText: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
  cardDivider: { height: 1, backgroundColor: Colors.borderLight, marginHorizontal: -16 },

  /* ── Chip ── */
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.heading, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: Colors.white },

  /* ── List item ── */
  listItem: {
    backgroundColor: Colors.bg, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.borderLight,
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
  },
  listItemMain: { flex: 1, gap: 5 },
  listItemRight: { alignItems: 'flex-end', justifyContent: 'center' },
  listItemTitle: { color: Colors.heading, fontSize: 14, fontWeight: '800' },
  listItemSub: { color: Colors.text, fontSize: 12, lineHeight: 17 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  metaText: { color: Colors.subtext, fontSize: 11 },

  /* ── Empty state ── */
  empty: { alignItems: 'center', paddingVertical: 22, gap: 9 },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyTitle: { color: Colors.heading, fontSize: 14, fontWeight: '700' },
  emptyBody: { color: Colors.subtext, fontSize: 12, textAlign: 'center', maxWidth: 260, lineHeight: 18 },

  /* ── Error ── */
  errorCard: { borderColor: 'rgba(220,38,38,0.18)', backgroundColor: 'rgba(220,38,38,0.04)' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorTitle: { color: Colors.btnDanger, fontSize: 14, fontWeight: '800' },
  errorBody: { color: Colors.text, fontSize: 12, lineHeight: 17 },
  errorRetry: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,0.08)',
  },
  errorRetryText: { color: Colors.btnDanger, fontSize: 12, fontWeight: '800' },

  /* ── Loading ── */
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 10 },
  loadingText: { color: Colors.subtext, fontSize: 13 },
});
