import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';

// ── Tabs ─────────────────────────────────────────────────
const TABS = ['All', 'At Risk', 'Top Contributors', 'Suspended', 'Admins'];

// ── Trust Score Algorithm Factors ────────────────────────
const TRUST_FACTORS = [
  { label: 'Report Accuracy', weight: 35, icon: 'checkmark-circle', desc: 'Historical accuracy of submitted reports' },
  { label: 'Account Age', weight: 20, icon: 'time', desc: 'Duration since account creation' },
  { label: 'Verification Level', weight: 20, icon: 'shield-checkmark', desc: 'Phone, email, ID verification status' },
  { label: 'Community Standing', weight: 15, icon: 'people', desc: 'Upvotes and positive interactions' },
  { label: 'False Report Ratio', weight: 10, icon: 'warning', desc: 'Percentage of reports marked false (inverted)' },
];

// ── Mock Users ───────────────────────────────────────────
const USERS = [
  {
    id: 'USR-001',
    name: 'Karim Benali',
    email: 'karim.b@mail.dz',
    role: 'Admin',
    trustScore: 94,
    totalReports: 87,
    falseReports: 1,
    falseRatio: 1.1,
    joinDate: '2024-06-15',
    lastActive: '2026-03-06 07:45',
    verified: true,
    risk: 'Low',
    suspended: false,
  },
  {
    id: 'USR-002',
    name: 'Amina Larbi',
    email: 'amina.l@mail.dz',
    role: 'Contributor',
    trustScore: 91,
    totalReports: 64,
    falseReports: 0,
    falseRatio: 0,
    joinDate: '2024-09-22',
    lastActive: '2026-03-06 06:30',
    verified: true,
    risk: 'Low',
    suspended: false,
  },
  {
    id: 'USR-003',
    name: 'Youssef Mebarki',
    email: 'youssef.m@mail.dz',
    role: 'Contributor',
    trustScore: 82,
    totalReports: 43,
    falseReports: 2,
    falseRatio: 4.7,
    joinDate: '2025-01-08',
    lastActive: '2026-03-05 22:10',
    verified: true,
    risk: 'Low',
    suspended: false,
  },
  {
    id: 'USR-004',
    name: 'Fatima Zouaoui',
    email: 'fatima.z@mail.dz',
    role: 'User',
    trustScore: 76,
    totalReports: 31,
    falseReports: 3,
    falseRatio: 9.7,
    joinDate: '2025-03-18',
    lastActive: '2026-03-06 05:55',
    verified: true,
    risk: 'Low',
    suspended: false,
  },
  {
    id: 'USR-005',
    name: 'Said Khellaf',
    email: 'said.k@mail.dz',
    role: 'User',
    trustScore: 68,
    totalReports: 22,
    falseReports: 3,
    falseRatio: 13.6,
    joinDate: '2025-05-12',
    lastActive: '2026-03-05 19:40',
    verified: false,
    risk: 'Medium',
    suspended: false,
  },
  {
    id: 'USR-006',
    name: 'Rachid Hamadi',
    email: 'rachid.h@mail.dz',
    role: 'User',
    trustScore: 55,
    totalReports: 18,
    falseReports: 4,
    falseRatio: 22.2,
    joinDate: '2025-07-30',
    lastActive: '2026-03-04 16:20',
    verified: false,
    risk: 'Medium',
    suspended: false,
  },
  {
    id: 'USR-007',
    name: 'Nadia Boumaza',
    email: 'nadia.b@mail.dz',
    role: 'User',
    trustScore: 42,
    totalReports: 15,
    falseReports: 5,
    falseRatio: 33.3,
    joinDate: '2025-09-14',
    lastActive: '2026-03-03 11:00',
    verified: false,
    risk: 'High',
    suspended: false,
  },
  {
    id: 'USR-008',
    name: 'Mohamed Toumi',
    email: 'mohamed.t@mail.dz',
    role: 'User',
    trustScore: 35,
    totalReports: 28,
    falseReports: 11,
    falseRatio: 39.3,
    joinDate: '2025-04-01',
    lastActive: '2026-03-02 08:15',
    verified: true,
    risk: 'High',
    suspended: false,
  },
  {
    id: 'USR-009',
    name: 'Hakim Djerba',
    email: 'hakim.d@mail.dz',
    role: 'User',
    trustScore: 18,
    totalReports: 9,
    falseReports: 6,
    falseRatio: 66.7,
    joinDate: '2025-11-22',
    lastActive: '2026-02-20 14:30',
    verified: false,
    risk: 'Critical',
    suspended: true,
  },
  {
    id: 'USR-010',
    name: 'Leila Mansouri',
    email: 'leila.m@mail.dz',
    role: 'User',
    trustScore: 12,
    totalReports: 6,
    falseReports: 5,
    falseRatio: 83.3,
    joinDate: '2026-01-05',
    lastActive: '2026-02-15 09:00',
    verified: false,
    risk: 'Critical',
    suspended: true,
  },
  {
    id: 'USR-011',
    name: 'Djamel Bouzid',
    email: 'djamel.b@mail.dz',
    role: 'Admin',
    trustScore: 97,
    totalReports: 12,
    falseReports: 0,
    falseRatio: 0,
    joinDate: '2024-01-10',
    lastActive: '2026-03-06 08:00',
    verified: true,
    risk: 'Low',
    suspended: false,
  },
];

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

  const filtered = useMemo(() => {
    switch (activeTab) {
      case 'All':
        return USERS;
      case 'At Risk':
        return USERS.filter((u) => u.risk === 'High' || u.risk === 'Critical');
      case 'Top Contributors':
        return USERS.filter((u) => u.trustScore >= 80 && u.totalReports >= 30);
      case 'Suspended':
        return USERS.filter((u) => u.suspended);
      case 'Admins':
        return USERS.filter((u) => u.role === 'Admin');
      default:
        return USERS;
    }
  }, [activeTab]);

  const handleAction = (user, action) => {
    Alert.alert(
      `${action} User`,
      `Are you sure you want to ${action.toLowerCase()} ${user.name} (${user.id})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => Alert.alert('Done', `${user.name} has been ${action.toLowerCase()}ed.`) },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <AdminHeader title="User Management" subtitle="Trust scores & moderation" navigation={navigation} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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
            const count = (() => {
              switch (tab) {
                case 'All': return USERS.length;
                case 'At Risk': return USERS.filter((u) => u.risk === 'High' || u.risk === 'Critical').length;
                case 'Top Contributors': return USERS.filter((u) => u.trustScore >= 80 && u.totalReports >= 30).length;
                case 'Suspended': return USERS.filter((u) => u.suspended).length;
                case 'Admins': return USERS.filter((u) => u.role === 'Admin').length;
                default: return 0;
              }
            })();
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

        <Text style={styles.resultsText}>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</Text>

        {/* ── User Cards ──────────────────────────── */}
        {filtered.map((user) => (
          <View key={user.id} style={styles.userCard}>
            {/* Header row */}
            <View style={styles.userHeader}>
              <View style={[styles.userAvatar, { backgroundColor: trustBarColor(user.trustScore) + '30', borderColor: trustBarColor(user.trustScore), borderWidth: 2 }]}>
                <Text style={[styles.avatarText, { color: trustBarColor(user.trustScore) }]}>
                  {user.name.split(' ').map((n) => n[0]).join('')}
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
                <Text style={styles.userId}>{user.id}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={[styles.roleBadge, { backgroundColor: roleColor(user.role) + '20', borderColor: roleColor(user.role) + '40' }]}>
                  <Text style={[styles.roleText, { color: roleColor(user.role) }]}>{user.role}</Text>
                </View>
                {user.suspended && (
                  <View style={[styles.roleBadge, { backgroundColor: Colors.adminDanger + '20', borderColor: Colors.adminDanger + '40' }]}>
                    <Text style={[styles.roleText, { color: Colors.adminDanger }]}>Suspended</Text>
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
              <TouchableOpacity style={[styles.actionBtn, styles.actionWarn]} onPress={() => handleAction(user, 'Warn')}>
                <Ionicons name="alert-circle-outline" size={14} color={Colors.adminWarning} />
                <Text style={[styles.actionText, { color: Colors.adminWarning }]}>Warn</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionSuspend]} onPress={() => handleAction(user, 'Suspend')}>
                <Ionicons name="pause-circle-outline" size={14} color={Colors.severityHigh} />
                <Text style={[styles.actionText, { color: Colors.severityHigh }]}>Suspend</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBan]} onPress={() => handleAction(user, 'Ban')}>
                <Ionicons name="ban-outline" size={14} color={Colors.adminDanger} />
                <Text style={[styles.actionText, { color: Colors.adminDanger }]}>Ban</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionPromote]} onPress={() => handleAction(user, 'Promote')}>
                <Ionicons name="star-outline" size={14} color={Colors.adminSuccess} />
                <Text style={[styles.actionText, { color: Colors.adminSuccess }]}>Promote</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={Colors.grey} />
            <Text style={styles.emptyText}>No users in this category</Text>
          </View>
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
  actionSuspend: { borderColor: 'rgba(249,115,22,0.3)', backgroundColor: 'rgba(249,115,22,0.08)' },
  actionBan: { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' },
  actionPromote: { borderColor: 'rgba(34,197,94,0.3)', backgroundColor: 'rgba(34,197,94,0.08)' },
  actionText: { fontSize: 11, fontWeight: '600' },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: Colors.grey, fontSize: 14 },
});
