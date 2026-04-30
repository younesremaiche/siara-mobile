import React from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';

const SEVERITY_TOKENS = {
  critical: { bg: 'rgba(239,68,68,0.10)', fg: '#B91C1C', border: '#EF4444', label: 'CRITICAL' },
  high:     { bg: 'rgba(249,115,22,0.10)', fg: '#C2410C', border: '#F97316', label: 'HIGH' },
  medium:   { bg: 'rgba(234,179,8,0.12)',  fg: '#A16207', border: '#EAB308', label: 'MEDIUM' },
  low:      { bg: 'rgba(34,197,94,0.10)',  fg: '#15803D', border: '#22C55E', label: 'LOW' },
  info:     { bg: 'rgba(59,130,246,0.10)', fg: '#1D4ED8', border: '#3B82F6', label: 'INFO' },
};

function severityToken(severity) {
  return SEVERITY_TOKENS[String(severity || 'info').toLowerCase()] || SEVERITY_TOKENS.info;
}

export function PoliceSeverityTag({ severity, label }) {
  const token = severityToken(severity);
  return (
    <View style={[styles.tag, { backgroundColor: token.bg }]}>
      <Ionicons name="alert-circle" size={11} color={token.fg} />
      <Text style={[styles.tagText, { color: token.fg }]}>{label || token.label}</Text>
    </View>
  );
}

export function PoliceStatusPill({ status }) {
  const value = String(status || '').toLowerCase();
  const palette = {
    pending:       { bg: 'rgba(234,179,8,0.12)', fg: '#A16207' },
    under_review:  { bg: 'rgba(59,130,246,0.10)', fg: '#1D4ED8' },
    verified:      { bg: 'rgba(34,197,94,0.10)', fg: '#15803D' },
    dispatched:    { bg: 'rgba(124,58,237,0.10)', fg: '#6D28D9' },
    resolved:      { bg: 'rgba(100,116,139,0.10)', fg: '#475569' },
    rejected:      { bg: 'rgba(239,68,68,0.10)', fg: '#B91C1C' },
  }[value] || { bg: 'rgba(100,116,139,0.10)', fg: '#475569' };
  return (
    <View style={[styles.statusPill, { backgroundColor: palette.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: palette.fg }]} />
      <Text style={[styles.statusPillText, { color: palette.fg }]}>{(status || 'unknown').replace(/_/g, ' ')}</Text>
    </View>
  );
}

export function PoliceStatTile({ label, value, sublabel, tone = Colors.primary, icon = 'analytics-outline' }) {
  const tint = tone + '1A'; // ~10% alpha hex append for tinted bg
  return (
    <View style={styles.statTile}>
      <View style={[styles.statAccent, { backgroundColor: tone }]} />
      <View style={styles.statBody}>
        <View style={[styles.statIconWrap, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={16} color={tone} />
        </View>
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.statValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {sublabel ? <Text style={styles.statSublabel} numberOfLines={2}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

// Backward-compat: existing screens still pass `stats` to PoliceScreenFrame.
export function PoliceStatCard(props) {
  return <PoliceStatTile {...props} />;
}

export function PoliceOfficerCard({
  name,
  rank,
  badgeNumber,
  avatarUrl,
  isOnDuty = true,
  wilaya,
  commune,
  onWorkZonePress,
}) {
  const initials = (name || 'OF')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.officerCard}>
      <View style={styles.officerRow}>
        <View style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarInitials}>{initials}</Text>
          )}
          <View style={[styles.dutyDot, { backgroundColor: isOnDuty ? Colors.success : Colors.greyLight }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.officerName} numberOfLines={1}>{name || 'Officer'}</Text>
          <Text style={styles.officerRank} numberOfLines={1}>{rank || 'Police Officer'}</Text>
          <View style={[styles.dutyPill, { backgroundColor: isOnDuty ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.16)' }]}>
            <View style={[styles.statusDot, { backgroundColor: isOnDuty ? '#15803D' : '#64748B' }]} />
            <Text style={[styles.dutyPillText, { color: isOnDuty ? '#15803D' : '#475569' }]}>
              {isOnDuty ? 'ON DUTY' : 'OFF DUTY'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.officerMetaRow}>
        <View style={styles.officerMetaItem}>
          <Text style={styles.officerMetaLabel}>Badge</Text>
          <Text style={styles.officerMetaValue} numberOfLines={1}>{badgeNumber || 'Pending'}</Text>
        </View>
        <View style={styles.officerMetaDivider} />
        <View style={styles.officerMetaItem}>
          <Text style={styles.officerMetaLabel}>Wilaya</Text>
          <Text style={styles.officerMetaValue} numberOfLines={1}>{wilaya || '—'}</Text>
        </View>
        <View style={styles.officerMetaDivider} />
        <View style={styles.officerMetaItem}>
          <Text style={styles.officerMetaLabel}>Commune</Text>
          <Text style={styles.officerMetaValue} numberOfLines={1}>{commune || '—'}</Text>
        </View>
      </View>

      {onWorkZonePress ? (
        <TouchableOpacity style={styles.officerCta} onPress={onWorkZonePress} activeOpacity={0.85}>
          <Ionicons name="map-outline" size={14} color={Colors.primary} />
          <Text style={styles.officerCtaText}>Manage work zone</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function PoliceIncidentCard({
  displayId,
  title,
  severity = 'medium',
  locationText,
  description,
  timeAgo,
  status,
  onPress,
  onPrimaryAction,
  primaryActionLabel = 'Start Review',
  onSecondaryAction,
  secondaryActionLabel = 'View',
}) {
  const token = severityToken(severity);
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.incidentCard} activeOpacity={0.92} onPress={onPress}>
      <View style={[styles.incidentAccent, { backgroundColor: token.border }]} />
      <View style={styles.incidentBody}>
        <View style={styles.incidentTopRow}>
          {displayId ? (
            <View style={styles.idBadge}>
              <Text style={styles.idBadgeText}>{displayId}</Text>
            </View>
          ) : null}
          <PoliceSeverityTag severity={severity} />
          {status ? <PoliceStatusPill status={status} /> : null}
        </View>
        {title ? <Text style={styles.incidentTitle} numberOfLines={2}>{title}</Text> : null}
        {locationText ? (
          <View style={styles.incidentMetaRow}>
            <Ionicons name="location-outline" size={13} color={Colors.subtext} />
            <Text style={styles.incidentMetaText} numberOfLines={2}>{locationText}</Text>
          </View>
        ) : null}
        {description ? <Text style={styles.incidentDescription} numberOfLines={2}>{description}</Text> : null}
        <View style={styles.incidentBottomRow}>
          <View style={styles.incidentMetaRow}>
            <Ionicons name="time-outline" size={13} color={Colors.subtext} />
            <Text style={styles.incidentMetaText}>{timeAgo || 'just now'}</Text>
          </View>
          <View style={styles.incidentActions}>
            {onSecondaryAction ? (
              <TouchableOpacity style={styles.btnGhost} onPress={onSecondaryAction} activeOpacity={0.85}>
                <Ionicons name="eye-outline" size={14} color={Colors.heading} />
                <Text style={styles.btnGhostText}>{secondaryActionLabel}</Text>
              </TouchableOpacity>
            ) : null}
            {onPrimaryAction ? (
              <TouchableOpacity style={styles.btnPrimary} onPress={onPrimaryAction} activeOpacity={0.85}>
                <Ionicons name="play-circle-outline" size={14} color={Colors.white} />
                <Text style={styles.btnPrimaryText}>{primaryActionLabel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Wrapper>
  );
}

export function PoliceQuickActionTile({ icon = 'apps-outline', tone = Colors.primary, label, sublabel, count, onPress }) {
  const tint = tone + '1A';
  return (
    <TouchableOpacity style={styles.actionTile} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.actionTileTop}>
        <View style={[styles.actionIconWrap, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={18} color={tone} />
        </View>
        {typeof count === 'number' ? (
          <View style={[styles.actionCountBadge, { backgroundColor: tint }]}>
            <Text style={[styles.actionCountText, { color: tone }]}>{count}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
      {sublabel ? <Text style={styles.actionSublabel} numberOfLines={2}>{sublabel}</Text> : null}
    </TouchableOpacity>
  );
}

export function PoliceTimelineItem({ icon = 'ellipse', title, subtitle, timeLabel, isLast }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineLeft}>
        <View style={styles.timelineDotWrap}>
          <Ionicons name={icon} size={10} color={Colors.primary} />
        </View>
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.timelineBody}>
        <Text style={styles.timelineTitle} numberOfLines={1}>{title || 'Activity'}</Text>
        {subtitle ? <Text style={styles.timelineSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        {timeLabel ? <Text style={styles.timelineTime}>{timeLabel}</Text> : null}
      </View>
    </View>
  );
}

export function PoliceSectionCard({ title, icon, children, actionLabel, onActionPress, count }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          {icon ? <Ionicons name={icon} size={16} color={Colors.primary} /> : null}
          <Text style={styles.cardTitle}>{title}</Text>
          {typeof count === 'number' ? (
            <View style={styles.cardCountBadge}>
              <Text style={styles.cardCountText}>{count}</Text>
            </View>
          ) : null}
        </View>
        {actionLabel && onActionPress ? (
          <TouchableOpacity onPress={onActionPress} activeOpacity={0.85} style={styles.cardActionWrap}>
            <Text style={styles.cardAction}>{actionLabel}</Text>
            <Ionicons name="arrow-forward" size={13} color={Colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function PoliceChip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PoliceListItem({ title, subtitle, meta = [], right, onPress }) {
  const content = (
    <View style={styles.listItem}>
      <View style={styles.listItemMain}>
        <Text style={styles.listItemTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listItemSubtitle}>{subtitle}</Text> : null}
        {meta.length ? (
          <View style={styles.metaWrap}>
            {meta.filter(Boolean).map((item) => (
              <Text key={item} style={styles.metaText}>{item}</Text>
            ))}
          </View>
        ) : null}
      </View>
      {right ? <View style={styles.listItemRight}>{right}</View> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88}>
      {content}
    </TouchableOpacity>
  );
}

export function PoliceEmptyState({ icon = 'document-text-outline', title, body }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={22} color={Colors.subtext} />
      </View>
      <Text style={styles.emptyTitle}>{title || 'Nothing yet'}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export default function PoliceScreenFrame({
  title,
  subtitle,
  liveLabel,
  stats = [],
  loading = false,
  error = '',
  onRefresh,
  children,
}) {
  const isPolice = useAuthStore((state) => state.isPolice);
  const activeMode = useAuthStore((state) => state.activeMode);
  const switchToUserMode = useAuthStore((state) => state.switchToUserMode);

  const showActions = (isPolice && activeMode === 'police') || onRefresh;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={onRefresh ? <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={Colors.primary} /> : undefined}
      showsVerticalScrollIndicator={false}
    >
      {showActions ? (
        <View style={styles.headerActions}>
          {isPolice && activeMode === 'police' ? (
            <TouchableOpacity style={styles.modeButton} onPress={switchToUserMode} activeOpacity={0.85}>
              <Ionicons name="swap-horizontal" size={14} color={Colors.secondary} />
              <Text style={styles.modeButtonText}>User Mode</Text>
            </TouchableOpacity>
          ) : <View />}
          {onRefresh ? (
            <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.85}>
              <Ionicons name="refresh" size={18} color={Colors.heading} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
        {liveLabel ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{liveLabel}</Text>
          </View>
        ) : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {stats.length ? (
        <View style={styles.statsGrid}>
          {stats.map((item) => (
            <View key={item.label} style={stats.length >= 4 ? styles.statHalf : styles.statThird}>
              <PoliceStatTile {...item} />
            </View>
          ))}
        </View>
      ) : null}

      {error ? (
        <View style={[styles.card, styles.errorCard]}>
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={18} color={Colors.btnDanger} />
            <Text style={styles.errorTitle}>Something went wrong</Text>
          </View>
          <Text style={styles.errorBody}>{error}</Text>
          {onRefresh ? (
            <TouchableOpacity style={styles.errorRetry} onPress={onRefresh} activeOpacity={0.85}>
              <Ionicons name="refresh" size={14} color={Colors.btnDanger} />
              <Text style={styles.errorRetryText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {loading && !children ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : null}

      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: 18, paddingTop: 48, paddingBottom: 110, gap: 16 },

  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: -4,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.blueLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.blueBorder,
  },
  modeButtonText: { color: Colors.secondary, fontSize: 12, fontWeight: '700' },
  refreshButton: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },

  titleBlock: { gap: 6 },
  title: { color: Colors.heading, fontSize: 26, fontWeight: '800' },
  livePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.10)',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#15803D' },
  liveText: { fontSize: 11, fontWeight: '700', color: '#15803D', letterSpacing: 0.4 },
  subtitle: { color: Colors.subtext, fontSize: 13, lineHeight: 18 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statHalf: { flexBasis: '47%', flexGrow: 1, minWidth: 0 },
  statThird: { flexBasis: '30%', flexGrow: 1, minWidth: 0 },

  statTile: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexDirection: 'row',
  },
  statAccent: { width: 4 },
  statBody: { flex: 1, padding: 12, gap: 4 },
  statIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  statLabel: {
    color: Colors.subtext,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statValue: { fontSize: 24, fontWeight: '800' },
  statSublabel: { color: Colors.subtext, fontSize: 11, lineHeight: 14 },

  // Officer card
  officerCard: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 14,
  },
  officerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.violetLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.violetBorder,
    position: 'relative',
  },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarInitials: { color: Colors.primary, fontWeight: '800', fontSize: 16 },
  dutyDot: {
    position: 'absolute',
    bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.white,
  },
  officerName: { color: Colors.heading, fontSize: 16, fontWeight: '800' },
  officerRank: { color: Colors.subtext, fontSize: 12, marginTop: 1 },
  dutyPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 6,
  },
  dutyPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  officerMetaRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bg,
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
  },
  officerMetaItem: { flex: 1, alignItems: 'center', gap: 2 },
  officerMetaLabel: {
    color: Colors.subtext, fontSize: 9, fontWeight: '700',
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  officerMetaValue: { color: Colors.heading, fontSize: 13, fontWeight: '700' },
  officerMetaDivider: { width: 1, height: 22, backgroundColor: Colors.border },
  officerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  officerCtaText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },

  // Incident card
  incidentCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexDirection: 'row',
    marginBottom: 10,
  },
  incidentAccent: { width: 4 },
  incidentBody: { flex: 1, padding: 14, gap: 8 },
  incidentTopRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  idBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  idBadgeText: { color: Colors.heading, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  incidentTitle: { color: Colors.heading, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  incidentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  incidentMetaText: { color: Colors.subtext, fontSize: 12, flexShrink: 1 },
  incidentDescription: { color: Colors.text, fontSize: 13, lineHeight: 18 },
  incidentBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  incidentActions: { flexDirection: 'row', gap: 6 },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnGhostText: { color: Colors.heading, fontSize: 12, fontWeight: '700' },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  btnPrimaryText: { color: Colors.white, fontSize: 12, fontWeight: '700' },

  // Tags & pills
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

  // Quick actions
  actionTile: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    gap: 10,
  },
  actionTileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  actionCountBadge: {
    minWidth: 24, height: 22, paddingHorizontal: 8, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  actionCountText: { fontSize: 12, fontWeight: '800' },
  actionLabel: { color: Colors.heading, fontSize: 14, fontWeight: '800' },
  actionSublabel: { color: Colors.subtext, fontSize: 11, lineHeight: 14 },

  // Timeline
  timelineRow: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  timelineLeft: { width: 22, alignItems: 'center' },
  timelineDotWrap: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.violetLight,
    borderWidth: 1, borderColor: Colors.violetBorder,
  },
  timelineLine: { flex: 1, width: 2, backgroundColor: Colors.border, marginTop: 2 },
  timelineBody: { flex: 1, paddingBottom: 12, gap: 2 },
  timelineTitle: { color: Colors.heading, fontSize: 13, fontWeight: '700' },
  timelineSubtitle: { color: Colors.text, fontSize: 12, lineHeight: 16 },
  timelineTime: { color: Colors.subtext, fontSize: 11, marginTop: 2 },

  // Section card
  card: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardTitle: {
    color: Colors.heading,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardCountBadge: {
    minWidth: 22, height: 20, paddingHorizontal: 7, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bg,
  },
  cardCountText: { color: Colors.heading, fontSize: 11, fontWeight: '800' },
  cardActionWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardAction: { color: Colors.primary, fontSize: 12, fontWeight: '800' },

  // Chips
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.heading, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: Colors.white },

  // Legacy list item
  listItem: {
    backgroundColor: Colors.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  listItemMain: { flex: 1, gap: 6 },
  listItemRight: { alignItems: 'flex-end', justifyContent: 'center' },
  listItemTitle: { color: Colors.heading, fontSize: 14, fontWeight: '800' },
  listItemSubtitle: { color: Colors.text, fontSize: 12, lineHeight: 17 },
  metaWrap: { gap: 3 },
  metaText: { color: Colors.subtext, fontSize: 11 },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingVertical: 18, gap: 8 },
  emptyIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { color: Colors.heading, fontSize: 14, fontWeight: '700' },
  emptyBody: { color: Colors.subtext, fontSize: 12, textAlign: 'center', maxWidth: 260, lineHeight: 17 },

  // Error
  errorCard: { borderColor: 'rgba(220,38,38,0.18)', backgroundColor: 'rgba(220,38,38,0.05)' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorTitle: { color: Colors.btnDanger, fontSize: 14, fontWeight: '800' },
  errorBody: { color: Colors.text, fontSize: 12, lineHeight: 17 },
  errorRetry: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,0.08)',
  },
  errorRetryText: { color: Colors.btnDanger, fontSize: 12, fontWeight: '800' },

  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 10 },
  loadingText: { color: Colors.subtext, fontSize: 13 },
});
