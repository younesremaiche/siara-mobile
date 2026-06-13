import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';
import {
  USER_FILTERS,
  fetchAdminUsers,
  recalculateUserTrust,
  riskFromTrust,
  updateAdminUserStatus,
} from '../../services/adminUsersService';

// ── Tabs ─────────────────────────────────────────────────
const TABS = ['All', 'At Risk', 'Top Contributors', 'Banned', 'Admins'];

// ── Trust Score Algorithm Factors ────────────────────────
const TRUST_FACTORS = [
  { label: 'Report Accuracy', weight: 35, icon: 'checkmark-circle', desc: 'Historical accuracy of submitted reports' },
  { label: 'Account Age', weight: 20, icon: 'time', desc: 'Duration since account creation' },
  { label: 'Verification Level', weight: 20, icon: 'shield-checkmark', desc: 'Phone, email, ID verification status' },
  { label: 'Community Standing', weight: 15, icon: 'people', desc: 'Upvotes and positive interactions' },
  { label: 'False Report Ratio', weight: 10, icon: 'warning', desc: 'Percentage of reports marked false (inverted)' },
];

// ── Field formatters (real backend shape → card view-model) ──
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatRole(role) {
  const text = String(role || 'user').replace(/[_-]+/g, ' ').trim();
  return text.replace(/\b\w/g, (m) => m.toUpperCase());
}

function initials(name) {
  return String(name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

// Maps a backend user row to the values the card renders.
function toViewModel(u) {
  const total = u.reportStats?.totalReports ?? 0;
  const falseReports =
    (u.reportStats?.spamReports ?? 0)
    + (u.reportStats?.outOfContextReports ?? 0)
    + (u.reportStats?.invalidLocationReports ?? 0)
    + (u.reportStats?.rejectedReports ?? 0);
  const falseRatio = total > 0 ? Math.round((falseReports / total) * 1000) / 10 : 0;
  const trustScore = Number.isFinite(Number(u.trustScore)) ? Math.round(Number(u.trustScore)) : 0;
  return {
    raw: u,
    id: u.id,
    shortId: u.id ? `#${String(u.id).slice(0, 8)}` : '',
    name: u.name || u.email || 'User',
    email: u.email || u.phone || '—',
    role: formatRole(u.primaryRole),
    trustScore,
    totalReports: total,
    falseReports,
    falseRatio,
    joinDate: formatDate(u.createdAt),
    lastActive: formatDate(u.lastActiveAt),
    verified: Boolean(u.emailVerifiedAt),
    risk: riskFromTrust(u.trustScore),
    suspended: u.status === 'banned',
    warned: u.status === 'warned',
  };
}

const riskColor = (r) => {
  const map = { Low: Colors.adminSuccess, Medium: Colors.adminWarning, High: Colors.severityHigh, Critical: Colors.severityCritical };
  return map[r] || Colors.grey;
};

const roleColor = (role) => {
  const map = { Admin: Colors.btnPrimary, Contributor: Colors.adminInfo, User: Colors.grey };
  return map[role] || Colors.grey;
};

const trustBarColor = (score) => {
  if (score >= 80) return Colors.adminSuccess;
  if (score >= 60) return Colors.adminInfo;
  if (score >= 40) return Colors.adminWarning;
  return Colors.adminDanger;
};

// ── Component ────────────────────────────────────────────
export default function AdminUsersScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('All');
  const [users, setUsers] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminUsers({ filter: USER_FILTERS[activeTab] || 'all' });
      setUsers(data.users);
      setCounts(data.counts || {});
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load({ silent: true });
  }, [load]);

  const tabCount = (tab) => {
    switch (tab) {
      case 'All': return counts.all ?? 0;
      case 'At Risk': return counts.atRisk ?? 0;
      case 'Top Contributors': return counts.trusted ?? 0;
      case 'Banned': return counts.banned ?? 0;
      case 'Admins': return counts.admin ?? 0;
      default: return 0;
    }
  };

  const doAction = (user, action) => {
    const apply = async () => {
      setBusyId(user.id);
      try {
        if (action === 'Warn') {
          await updateAdminUserStatus(user.id, { status: 'warned', warningReason: 'Flagged by admin review' });
        } else if (action === 'Ban') {
          await updateAdminUserStatus(user.id, { status: 'banned', reason: 'Banned by admin' });
        } else if (action === 'Unban' || action === 'Unwarn') {
          // status 'active' clears both ban and warning fields server-side.
          await updateAdminUserStatus(user.id, { status: 'active' });
        } else if (action === 'UpdateTrust') {
          await recalculateUserTrust(user.id);
        }
        await load({ silent: true });
      } catch (e) {
        Alert.alert('Action failed', e.message || 'Could not apply the action.');
      } finally {
        setBusyId(null);
      }
    };
    const name = user.name || 'this user';
    const prompts = {
      Warn: `Send a warning to ${name}?`,
      Unwarn: `Clear the warning on ${name}?`,
      Ban: `Ban ${name}? They will lose access.`,
      Unban: `Unban ${name}? Their access will be restored.`,
      UpdateTrust: `Recalculate the trust score for ${name}?`,
    };
    const titles = {
      Warn: 'Warn user',
      Unwarn: 'Clear warning',
      Ban: 'Ban user',
      Unban: 'Unban user',
      UpdateTrust: 'Update trust score',
    };
    Alert.alert(
      titles[action] || `${action} user`,
      prompts[action] || `Apply "${action}" to ${user.name || 'this user'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: action === 'Ban' ? 'destructive' : 'default', onPress: apply },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <AdminHeader title="User Management" subtitle="Trust scores & moderation" navigation={navigation} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.adminInfo} />}
      >
        {/* ── Trust Score Algorithm Card ──────────── */}
        <View style={styles.algoCard}>
          <View style={styles.algoHeader}>
            <View style={styles.algoIconWrap}>
              <Ionicons name="shield-checkmark" size={20} color={Colors.adminInfo} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.algoTitle}>Trust Score Algorithm</Text>
              <Text style={styles.algoDesc}>Composite score (0-100) computed from five weighted factors</Text>
            </View>
          </View>

          {TRUST_FACTORS.map((f, i) => (
            <View key={i} style={[styles.factorRow, i === TRUST_FACTORS.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.factorLeft}>
                <View style={styles.factorIconWrap}>
                  <Ionicons name={f.icon} size={14} color={Colors.adminInfo} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.factorLabel}>{f.label}</Text>
                  <Text style={styles.factorDesc}>{f.desc}</Text>
                </View>
              </View>
              <View style={styles.weightBadge}>
                <Text style={styles.weightText}>{f.weight}%</Text>
              </View>
            </View>
          ))}

          {/* Visual weight bar */}
          <View style={styles.weightBarRow}>
            {TRUST_FACTORS.map((f, i) => {
              const colors = [Colors.adminInfo, Colors.adminSuccess, Colors.btnPrimary, Colors.adminWarning, Colors.adminDanger];
              return (
                <View key={i} style={[styles.weightBarSeg, { flex: f.weight, backgroundColor: colors[i] }]} />
              );
            })}
          </View>
          <View style={styles.weightLabelRow}>
            {TRUST_FACTORS.map((f, i) => (
              <Text key={i} style={styles.weightLabelText}>{f.weight}%</Text>
            ))}
          </View>
        </View>

        {/* ── Tabs ────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={{ marginBottom: 12 }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            const count = tabCount(tab);
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab}</Text>
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading && users.length === 0 ? (
          <View style={styles.empty}>
            <ActivityIndicator size="small" color={Colors.adminInfo} />
            <Text style={styles.emptyText}>Loading users...</Text>
          </View>
        ) : error ? (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={40} color={Colors.adminDanger} />
            <Text style={styles.emptyText}>{error.message || 'Failed to load users.'}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.resultsText}>{users.length} user{users.length !== 1 ? 's' : ''}</Text>

            {/* ── User Cards ──────────────────────────── */}
            {users.map((raw) => {
              const user = toViewModel(raw);
              const busy = busyId === user.id;
              return (
                <View key={user.id} style={[styles.userCard, busy && { opacity: 0.55 }]}>
                  {/* Header row */}
                  <View style={styles.userHeader}>
                    <View style={[styles.userAvatar, { backgroundColor: trustBarColor(user.trustScore) + '30', borderColor: trustBarColor(user.trustScore), borderWidth: 2 }]}>
                      <Text style={[styles.avatarText, { color: trustBarColor(user.trustScore) }]}>
                        {initials(user.name)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.userName}>{user.name}</Text>
                        {user.verified && (
                          <Ionicons name="checkmark-circle" size={14} color={Colors.adminSuccess} />
                        )}
                      </View>
                      <Text style={styles.userEmail}>{user.email}</Text>
                      <Text style={styles.userId}>{user.shortId}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[styles.roleBadge, { backgroundColor: roleColor(user.role) + '20', borderColor: roleColor(user.role) + '40' }]}>
                        <Text style={[styles.roleText, { color: roleColor(user.role) }]}>{user.role}</Text>
                      </View>
                      {user.suspended && (
                        <View style={[styles.roleBadge, { backgroundColor: Colors.adminDanger + '20', borderColor: Colors.adminDanger + '40' }]}>
                          <Text style={[styles.roleText, { color: Colors.adminDanger }]}>Banned</Text>
                        </View>
                      )}
                      {user.warned && (
                        <View style={[styles.roleBadge, { backgroundColor: Colors.adminWarning + '20', borderColor: Colors.adminWarning + '40' }]}>
                          <Text style={[styles.roleText, { color: Colors.adminWarning }]}>Warned</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Trust Score Bar */}
                  <View style={styles.trustRow}>
                    <Text style={styles.trustLabel}>Trust Score</Text>
                    <View style={styles.trustBarTrack}>
                      <View style={[styles.trustBarFill, { width: `${user.trustScore}%`, backgroundColor: trustBarColor(user.trustScore) }]} />
                    </View>
                    <Text style={[styles.trustValue, { color: trustBarColor(user.trustScore) }]}>{user.trustScore}</Text>
                  </View>

                  {/* Stats Grid */}
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{user.totalReports}</Text>
                      <Text style={styles.statLabel}>Reports</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{user.falseReports}</Text>
                      <Text style={styles.statLabel}>False</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={[styles.statValue, { color: user.falseRatio > 20 ? Colors.adminDanger : user.falseRatio > 10 ? Colors.adminWarning : Colors.adminText }]}>
                        {user.falseRatio}%
                      </Text>
                      <Text style={styles.statLabel}>False Ratio</Text>
                    </View>
                    <View style={styles.stat}>
                      <View style={[styles.riskPill, { backgroundColor: riskColor(user.risk) + '20' }]}>
                        <Text style={[styles.riskText, { color: riskColor(user.risk) }]}>{user.risk}</Text>
                      </View>
                      <Text style={styles.statLabel}>Risk</Text>
                    </View>
                  </View>

                  {/* Meta */}
                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="calendar-outline" size={11} color={Colors.grey} />
                      <Text style={styles.metaText}>Joined {user.joinDate}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={11} color={Colors.grey} />
                      <Text style={styles.metaText}>Active {user.lastActive}</Text>
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionsRow}>
                    {user.warned ? (
                      <TouchableOpacity style={[styles.actionBtn, styles.actionRestore]} disabled={busy} onPress={() => doAction(raw, 'Unwarn')}>
                        <Ionicons name="checkmark-circle-outline" size={14} color={Colors.adminSuccess} />
                        <Text style={[styles.actionText, { color: Colors.adminSuccess }]}>Unwarn</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.actionBtn, styles.actionWarn]} disabled={busy} onPress={() => doAction(raw, 'Warn')}>
                        <Ionicons name="alert-circle-outline" size={14} color={Colors.adminWarning} />
                        <Text style={[styles.actionText, { color: Colors.adminWarning }]}>Warn</Text>
                      </TouchableOpacity>
                    )}
                    {user.suspended ? (
                      <TouchableOpacity style={[styles.actionBtn, styles.actionRestore]} disabled={busy} onPress={() => doAction(raw, 'Unban')}>
                        <Ionicons name="lock-open-outline" size={14} color={Colors.adminSuccess} />
                        <Text style={[styles.actionText, { color: Colors.adminSuccess }]}>Unban</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.actionBtn, styles.actionBan]} disabled={busy} onPress={() => doAction(raw, 'Ban')}>
                        <Ionicons name="ban-outline" size={14} color={Colors.adminDanger} />
                        <Text style={[styles.actionText, { color: Colors.adminDanger }]}>Ban</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.actionBtn, styles.actionTrust]} disabled={busy} onPress={() => doAction(raw, 'UpdateTrust')}>
                      <Ionicons name="refresh-outline" size={14} color={Colors.adminInfo} />
                      <Text style={[styles.actionText, { color: Colors.adminInfo }]}>Update Trust</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {users.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color={Colors.grey} />
                <Text style={styles.emptyText}>No users in this category</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  /* Algorithm Card */
  algoCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  algoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  algoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  algoTitle: { color: Colors.adminText, fontSize: 16, fontWeight: '700' },
  algoDesc: { color: Colors.grey, fontSize: 11, marginTop: 2 },

  /* Trust factors */
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
  },
  factorLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  factorIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(59,130,246,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  factorLabel: { color: Colors.adminText, fontSize: 13, fontWeight: '600' },
  factorDesc: { color: Colors.grey, fontSize: 10, marginTop: 1 },
  weightBadge: {
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  weightText: { color: Colors.btnPrimary, fontSize: 12, fontWeight: '700' },

  /* Weight bar visualization */
  weightBarRow: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 14,
  },
  weightBarSeg: { height: '100%' },
  weightLabelRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  weightLabelText: { flex: 1, textAlign: 'center', color: Colors.grey, fontSize: 9, fontWeight: '600' },

  /* Tabs */
  tabs: { gap: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    gap: 6,
  },
  tabActive: { backgroundColor: Colors.violetLight, borderColor: Colors.violetBorder },
  tabText: { color: Colors.grey, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.btnPrimary },
  tabBadge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: 'rgba(124,58,237,0.25)' },
  tabBadgeText: { color: Colors.grey, fontSize: 11, fontWeight: '600' },
  tabBadgeTextActive: { color: Colors.btnPrimary },

  resultsText: { color: Colors.grey, fontSize: 12, marginBottom: 10 },

  /* User card */
  userCard: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  userHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { color: Colors.adminText, fontSize: 14, fontWeight: '700' },
  userEmail: { color: Colors.grey, fontSize: 11, marginTop: 1 },
  userId: { color: Colors.adminInfo, fontSize: 10, fontWeight: '600', marginTop: 1 },

  /* Role badge */
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  /* Trust bar */
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  trustLabel: { color: Colors.grey, fontSize: 11, width: 72 },
  trustBarTrack: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' },
  trustBarFill: { height: '100%', borderRadius: 4 },
  trustValue: { fontSize: 16, fontWeight: '800', width: 30, textAlign: 'right' },

  /* Stats */
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.adminBorder,
  },
  stat: { alignItems: 'center' },
  statValue: { color: Colors.adminText, fontSize: 16, fontWeight: '700' },
  statLabel: { color: Colors.grey, fontSize: 10, marginTop: 2 },

  /* Risk pill */
  riskPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  riskText: { fontSize: 11, fontWeight: '700' },

  /* Meta */
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: Colors.grey, fontSize: 10 },

  /* Actions */
  actionsRow: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  actionWarn: { borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.08)' },
  actionBan: { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' },
  actionRestore: { borderColor: 'rgba(34,197,94,0.3)', backgroundColor: 'rgba(34,197,94,0.08)' },
  actionTrust: { borderColor: 'rgba(59,130,246,0.3)', backgroundColor: 'rgba(59,130,246,0.08)' },
  actionText: { fontSize: 11, fontWeight: '600' },

  /* Empty / states */
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: Colors.grey, fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: { backgroundColor: Colors.adminInfo, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 9, marginTop: 4 },
  retryText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
});
