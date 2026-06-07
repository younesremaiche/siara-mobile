import React, { useContext } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { AuthContext } from '../../contexts/AuthContext';
import { useReportDetail } from '../../features/reports/hooks/useReportQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

/* ── Status config ─────────────────────────────────────────────────── */
const STATUS_CFG = {
  pending:      { label: 'Pending',      icon: 'hourglass-outline', color: '#C86A10', bg: 'rgba(244,162,97,0.16)' },
  under_review: { label: 'Under Review', icon: 'eye-outline',       color: Colors.secondary, bg: 'rgba(29,78,216,0.12)' },
  verified:     { label: 'Verified',     icon: 'checkmark-circle',  color: Colors.accent, bg: 'rgba(15,169,88,0.14)' },
  resolved:     { label: 'Resolved',     icon: 'shield-checkmark',  color: Colors.subtext, bg: 'rgba(107,114,128,0.12)' },
  rejected:     { label: 'Rejected',     icon: 'close-circle',      color: Colors.error, bg: 'rgba(220,38,38,0.12)' },
};

// Plain-language, citizen-friendly explanation of each status.
const STATUS_MEANING = {
  pending:      'Your report was submitted and is waiting for an officer in the area to review it.',
  under_review: 'An officer has picked up your report and is reviewing it right now.',
  verified:     'An officer confirmed this incident is real. Stay cautious in the area.',
  resolved:     'This incident has been handled and the case is now closed.',
  rejected:     'After review, officers marked this report as invalid, inaccurate, or a duplicate.',
};

// Linear lifecycle for the progress tracker (the happy path).
const LIFECYCLE = [
  { key: 'pending',      label: 'Submitted',    icon: 'document-text' },
  { key: 'under_review', label: 'Under Review', icon: 'eye' },
  { key: 'verified',     label: 'Verified',     icon: 'shield-checkmark' },
  { key: 'resolved',     label: 'Resolved',     icon: 'checkmark-done' },
];

const SEVERITY_COLOR = {
  critical: Colors.severityCritical,
  high:     Colors.severityHigh,
  medium:   Colors.severityMedium,
  low:      Colors.severityLow,
};

const TYPE_ICONS = {
  accident: 'car-sport-outline',
  fire:     'flame-outline',
  flood:    'water-outline',
  hazard:   'warning-outline',
  roadblock:'remove-circle-outline',
  crime:    'alert-circle-outline',
  weather:  'cloudy-outline',
};

function severityColor(severity) {
  return SEVERITY_COLOR[String(severity || '').toLowerCase()] || Colors.greyLight;
}
function typeIcon(type) {
  return TYPE_ICONS[String(type || '').toLowerCase()] || 'alert-circle-outline';
}

/* ── Lifecycle progress tracker ───────────────────────────────────────
   Replaces the old "What this means" box: a visual stepper makes the
   report's position in the workflow self-explanatory. Rejected is a
   terminal off-path state, rendered distinctly. */
function StatusTracker({ statusKey }) {
  if (statusKey === 'rejected') {
    return (
      <View style={tr.row}>
        <Step state="done" icon="document-text" label="Submitted" isFirst />
        <Step state="rejected" icon="close" label="Rejected" isLast />
      </View>
    );
  }

  const currentIndex = Math.max(0, LIFECYCLE.findIndex((s) => s.key === statusKey));

  return (
    <View style={tr.row}>
      {LIFECYCLE.map((stage, i) => {
        const state = i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'future';
        return (
          <Step
            key={stage.key}
            state={state}
            icon={stage.icon}
            label={stage.label}
            leftActive={i > 0 && i <= currentIndex}
            rightActive={i < currentIndex}
            isFirst={i === 0}
            isLast={i === LIFECYCLE.length - 1}
          />
        );
      })}
    </View>
  );
}

function Step({ state, icon, label, leftActive, rightActive, isFirst, isLast }) {
  const isRejected = state === 'rejected';
  const nodeStyle = [
    tr.node,
    state === 'done' && tr.nodeDone,
    state === 'active' && tr.nodeActive,
    isRejected && tr.nodeRejected,
  ];
  const nodeIcon = state === 'done' ? 'checkmark' : icon;
  const iconColor = state === 'future' ? Colors.greyLight : Colors.white;
  const labelStyle = [
    tr.label,
    (state === 'done' || state === 'active') && { color: Colors.heading, fontWeight: '700' },
    isRejected && { color: Colors.error, fontWeight: '700' },
  ];

  return (
    <View style={tr.step}>
      <View style={tr.lineWrap}>
        <View style={[tr.line, !isFirst && leftActive ? tr.lineActive : null, isFirst && tr.lineHidden]} />
        <View style={nodeStyle}>
          <Ionicons name={nodeIcon} size={16} color={iconColor} />
        </View>
        <View style={[tr.line, !isLast && rightActive ? tr.lineActive : null, isLast && tr.lineHidden]} />
      </View>
      <Text style={labelStyle} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* ── Info row ──────────────────────────────────────────────────────── */
function InfoRow({ icon, label, value, last }) {
  if (!value) return null;
  return (
    <View style={[s.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={s.infoIconWrap}>
        <Ionicons name={icon} size={15} color={Colors.primary} />
      </View>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN SCREEN
══════════════════════════════════════════════════════════════════════ */
export default function IncidentDetailScreen({ navigation, route }) {
  const reportId = route?.params?.reportId;
  const insets = useSafeAreaInsets();
  const { user } = useContext(AuthContext);

  // Shared cache via useReportDetail: this detail view now participates in
  // workflow invalidation, so a police/admin status change refreshes it live.
  const detailQuery = useReportDetail(reportId);
  const report = detailQuery.data;
  const loading = Boolean(reportId) && detailQuery.isLoading;
  const error = !reportId ? 'No report ID provided.' : (detailQuery.error?.message || '');
  const load = detailQuery.refetch;
  useFocusRefresh(detailQuery.refetch, Boolean(reportId));

  const handleShare = async () => {
    if (!report) return;
    try {
      await Share.share({
        message: `SIARA Alert: ${report.title} — ${String(report.severity || '').toUpperCase()} severity at ${report.locationLabel || 'unknown location'}`,
      });
    } catch {}
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <View style={s.center}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={s.loadingText}>Loading incident...</Text>
      </View>
    );
  }

  /* ── Error ── */
  if (error || !report) {
    return (
      <View style={s.center}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
        <View style={s.errorIconWrap}>
          <Ionicons name="alert-circle-outline" size={32} color={Colors.error} />
        </View>
        <Text style={s.errorTitle}>Could not load incident</Text>
        <Text style={s.errorSub}>{error || 'Report not found.'}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={load} activeOpacity={0.85}>
          <Text style={s.retryBtnText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.backLink} onPress={() => navigation.goBack()}>
          <Text style={s.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusKey = (report.displayStatus || report.status || 'pending').toLowerCase();
  const statusCfg = STATUS_CFG[statusKey] || STATUS_CFG.pending;
  const sevColor  = severityColor(report.severity);
  const isOwner   = user?.id && String(report.reportedBy?.id || '') === String(user.id);

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} translucent={false} />

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.iconBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>Incident Detail</Text>
        <TouchableOpacity style={s.iconBtn} onPress={handleShare} activeOpacity={0.8}>
          <Ionicons name="share-social-outline" size={19} color={Colors.heading} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={s.hero}>
          <View style={[s.heroAccent, { backgroundColor: sevColor }]} />
          <View style={s.heroBody}>
            <View style={[s.typeIconWrap, { backgroundColor: `${sevColor}1A` }]}>
              <Ionicons name={typeIcon(report.incidentType)} size={26} color={sevColor} />
            </View>
            <Text style={s.heroTitle}>{report.title || 'Incident'}</Text>
            <View style={s.heroChips}>
              <View style={[s.statusPill, { backgroundColor: statusCfg.bg }]}>
                <Ionicons name={statusCfg.icon} size={13} color={statusCfg.color} />
                <Text style={[s.statusPillText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              </View>
              <View style={[s.sevPill, { backgroundColor: `${sevColor}14`, borderColor: `${sevColor}33` }]}>
                <View style={[s.sevDot, { backgroundColor: sevColor }]} />
                <Text style={[s.sevPillText, { color: sevColor }]}>{String(report.severity || 'low').toUpperCase()}</Text>
              </View>
            </View>
            {report.relativeTime ? (
              <Text style={s.heroTime}>Reported {report.relativeTime}</Text>
            ) : null}
          </View>
        </View>

        {/* ── Status progress tracker (replaces the old "What this means" card) ── */}
        <View style={s.card}>
          <Text style={s.cardKicker}>Report Status</Text>
          <StatusTracker statusKey={statusKey} />
          <View style={[s.meaningBox, { backgroundColor: statusCfg.bg }]}>
            <Ionicons name="information-circle" size={16} color={statusCfg.color} />
            <Text style={[s.meaningText, { color: statusCfg.color }]}>
              {STATUS_MEANING[statusKey] || STATUS_MEANING.pending}
            </Text>
          </View>
        </View>

        {/* ── Description ── */}
        {report.description ? (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="reader-outline" size={16} color={Colors.primary} />
              <Text style={s.cardTitle}>Description</Text>
            </View>
            <Text style={s.description}>{report.description}</Text>
          </View>
        ) : null}

        {/* ── Details ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
            <Text style={s.cardTitle}>Details</Text>
          </View>
          <InfoRow icon="location-outline" label="Location" value={report.locationLabel} />
          <InfoRow icon="time-outline"     label="Reported" value={report.relativeTime} />
          <InfoRow icon="person-outline"   label="Reporter" value={report.reportedBy?.name} />
          <InfoRow icon="pricetag-outline" label="Type"     value={report.incidentType?.replace(/_/g, ' ')} last />
        </View>

        {/* ── Photos ── */}
        {report.media?.length > 0 ? (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="images-outline" size={16} color={Colors.primary} />
              <Text style={s.cardTitle}>Photos</Text>
              <Text style={s.cardCount}>{report.media.length}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.mediaRow}>
              {report.media.map((media, i) => (
                <Image key={i} source={{ uri: media.url }} style={s.mediaThumb} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* ── Owner actions ── */}
        {isOwner ? (
          <TouchableOpacity
            style={s.editBtn}
            onPress={() => navigation.navigate('ReportIncident', { editReport: report })}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={17} color={Colors.primary} />
            <Text style={s.editBtnText}>Edit Report</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

/* ── Tracker styles ──────────────────────────────────────────────────── */
const tr = StyleSheet.create({
  row: { flexDirection: 'row', marginTop: 6, marginBottom: 14 },
  step: { flex: 1, alignItems: 'center' },
  lineWrap: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  line: { flex: 1, height: 3, backgroundColor: Colors.border, borderRadius: 2 },
  lineActive: { backgroundColor: Colors.accent },
  lineHidden: { backgroundColor: 'transparent' },
  node: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 2, borderColor: Colors.border,
  },
  nodeDone: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  nodeActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  nodeRejected: { backgroundColor: Colors.error, borderColor: Colors.error },
  label: { color: Colors.subtext, fontSize: 10, marginTop: 6, textAlign: 'center', fontWeight: '600' },
});

/* ── Screen styles ───────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },

  /* header */
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: Colors.heading },

  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },

  /* hero */
  hero: {
    backgroundColor: Colors.white, borderRadius: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.borderLight,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  heroAccent: { height: 5, width: '100%' },
  heroBody: { padding: 18, alignItems: 'center' },
  typeIconWrap: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  heroTitle: { color: Colors.heading, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  heroChips: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
  },
  statusPillText: { fontSize: 12, fontWeight: '800' },
  sevPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
  },
  sevDot: { width: 6, height: 6, borderRadius: 3 },
  sevPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  heroTime: { color: Colors.subtext, fontSize: 12, marginTop: 10 },

  /* card */
  card: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.borderLight, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardKicker: { color: Colors.subtext, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle:  { color: Colors.heading, fontSize: 14, fontWeight: '800', flex: 1 },
  cardCount: {
    color: Colors.primary, fontSize: 12, fontWeight: '800',
    backgroundColor: Colors.violetLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden',
  },
  description: { color: Colors.text, fontSize: 14, lineHeight: 21 },

  /* status meaning line under the tracker */
  meaningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 12, padding: 12,
  },
  meaningText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },

  /* info row */
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  infoIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: Colors.violetLight, alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { color: Colors.subtext, fontSize: 12, fontWeight: '700', width: 70 },
  infoValue: { flex: 1, color: Colors.heading, fontSize: 13, fontWeight: '600', textAlign: 'right' },

  /* media */
  mediaRow: { gap: 10, paddingTop: 2 },
  mediaThumb: { width: 150, height: 110, borderRadius: 14, backgroundColor: Colors.bg },

  /* owner actions */
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.violetLight, borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.violetBorder,
  },
  editBtnText: { color: Colors.primary, fontWeight: '800', fontSize: 14 },

  /* loading / error */
  loadingText: { color: Colors.subtext, fontSize: 14, marginTop: 8 },
  errorIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(220,38,38,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  errorTitle: { color: Colors.heading, fontSize: 16, fontWeight: '800' },
  errorSub:   { color: Colors.subtext, fontSize: 13, textAlign: 'center' },
  retryBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 11, marginTop: 4,
  },
  retryBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },
  backLink: { marginTop: 4 },
  backLinkText: { color: Colors.subtext, fontSize: 13 },
});
