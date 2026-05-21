import React, { useCallback, useContext, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { AuthContext } from '../../contexts/AuthContext';
import { getReport } from '../../services/reportsService';

/* ── Status config ─────────────────────────────────────────────────── */
const STATUS_CFG = {
  pending:      { label: 'Pending',     icon: 'hourglass-outline',     color: '#C86A10', bg: 'rgba(244,162,97,0.14)' },
  under_review: { label: 'Under Review',icon: 'eye-outline',           color: Colors.secondary, bg: 'rgba(29,78,216,0.1)' },
  verified:     { label: 'Verified',    icon: 'checkmark-circle',      color: Colors.accent, bg: 'rgba(15,169,88,0.12)' },
  resolved:     { label: 'Resolved',   icon: 'shield-checkmark',       color: Colors.subtext, bg: 'rgba(107,114,128,0.1)' },
  rejected:     { label: 'Rejected',   icon: 'close-circle',           color: Colors.error, bg: 'rgba(220,38,38,0.1)' },
};

const SEVERITY_COLOR = {
  critical: Colors.severityCritical,
  high:     Colors.severityHigh,
  medium:   Colors.severityMedium,
  low:      Colors.severityLow,
};

/* ── Info row ──────────────────────────────────────────────────────── */
function InfoRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={s.infoRow}>
      <View style={s.infoIconWrap}>
        <Ionicons name={icon} size={14} color={Colors.subtext} />
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

  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    if (!reportId) { setError('No report ID provided.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      setReport(await getReport(reportId));
    } catch (e) {
      setError(e.message || 'Failed to load incident.');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

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
  const sevColor  = SEVERITY_COLOR[String(report.severity || '').toLowerCase()] || Colors.greyLight;
  const isOwner   = user?.id && String(report.reportedBy?.id || '') === String(user.id);

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} translucent={false} />

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>Incident Detail</Text>
        <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.8}>
          <Ionicons name="share-social-outline" size={20} color={Colors.heading} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status + severity banner ── */}
        <View style={[s.statusBanner, { backgroundColor: statusCfg.bg, borderColor: statusCfg.color + '40' }]}>
          <Ionicons name={statusCfg.icon} size={20} color={statusCfg.color} />
          <Text style={[s.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          <View style={[s.sevBadge, { backgroundColor: sevColor + '14' }]}>
            <View style={[s.sevDot, { backgroundColor: sevColor }]} />
            <Text style={[s.sevText, { color: sevColor }]}>{String(report.severity || 'low').toUpperCase()}</Text>
          </View>
        </View>

        {/* ── Title card ── */}
        <View style={s.card}>
          <Text style={s.title}>{report.title}</Text>
          {report.description ? (
            <Text style={s.description}>{report.description}</Text>
          ) : null}
        </View>

        {/* ── Details card ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
            <Text style={s.cardTitle}>Details</Text>
          </View>
          <InfoRow icon="location-outline"   label="Location" value={report.locationLabel} />
          <InfoRow icon="time-outline"        label="Reported" value={report.relativeTime} />
          <InfoRow icon="person-outline"      label="Reporter" value={report.reportedBy?.name} />
          <InfoRow icon="car-outline"         label="Type"     value={report.incidentType?.replace(/_/g, ' ')} />
        </View>

        {/* ── Media ── */}
        {report.media?.length > 0 ? (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="images-outline" size={16} color={Colors.primary} />
              <Text style={s.cardTitle}>Photos</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.mediaRow}>
              {report.media.map((m, i) => (
                <Image key={i} source={{ uri: m.url }} style={s.mediaThumb} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* ── Status meaning card ── */}
        <View style={[s.card, { borderColor: statusCfg.color + '30', backgroundColor: statusCfg.bg }]}>
          <View style={s.cardHeader}>
            <Ionicons name={statusCfg.icon} size={16} color={statusCfg.color} />
            <Text style={[s.cardTitle, { color: statusCfg.color }]}>What this means</Text>
          </View>
          <Text style={s.statusMeaning}>
            {statusKey === 'pending'      && 'This report is waiting to be reviewed by an officer in the area.'}
            {statusKey === 'under_review' && 'An officer has been assigned and is actively reviewing this report.'}
            {statusKey === 'verified'     && 'An officer has confirmed this incident is legitimate. Stay cautious.'}
            {statusKey === 'resolved'     && 'This incident has been handled and the case is closed.'}
            {statusKey === 'rejected'     && 'Officers reviewed this report and marked it as invalid or inaccurate.'}
          </Text>
        </View>

        {/* ── Owner actions ── */}
        {isOwner ? (
          <View style={s.ownerActions}>
            <TouchableOpacity
              style={s.editBtn}
              onPress={() => navigation.navigate('ReportIncident', { editReport: report })}
              activeOpacity={0.85}
            >
              <Ionicons name="create-outline" size={16} color={Colors.primary} />
              <Text style={s.editBtnText}>Edit Report</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

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
  backBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: Colors.heading },
  shareBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center',
  },

  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },

  /* status banner */
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, padding: 14, borderWidth: 1,
  },
  statusLabel: { flex: 1, fontSize: 14, fontWeight: '800' },
  sevBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
  },
  sevDot:  { width: 6, height: 6, borderRadius: 3 },
  sevText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  /* card */
  card: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.borderLight, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle:  { color: Colors.heading, fontSize: 14, fontWeight: '800' },
  title:       { color: Colors.heading, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  description: { color: Colors.text, fontSize: 14, lineHeight: 21 },
  statusMeaning: { color: Colors.text, fontSize: 13, lineHeight: 20 },

  /* info row */
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  infoIconWrap: { width: 22, alignItems: 'center', paddingTop: 1 },
  infoLabel:   { color: Colors.subtext, fontSize: 12, fontWeight: '700', width: 68 },
  infoValue:   { flex: 1, color: Colors.heading, fontSize: 13, fontWeight: '600' },

  /* media */
  mediaRow: { gap: 10 },
  mediaThumb: {
    width: 120, height: 90, borderRadius: 12,
    backgroundColor: Colors.bg,
  },

  /* owner actions */
  ownerActions: { flexDirection: 'row', gap: 10 },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: Colors.violetLight, borderRadius: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: Colors.violetBorder,
  },
  editBtnText: { color: Colors.primary, fontWeight: '800', fontSize: 13 },

  /* loading/error */
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
