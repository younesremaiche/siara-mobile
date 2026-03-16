import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../theme/colors';
import AdminHeader from '../../components/layout/AdminHeader';

// ── Filter tabs ──────────────────────────────────────────
const TABS = ['All', 'Pending', 'Approved', 'Rejected', 'Escalated'];

// ── Mock incidents (Algeria locations) ──────────────────
const INCIDENTS = [
  {
    id: 'INC-3001',
    type: 'Multi-vehicle collision',
    location: 'RN1, Km 34, Blida',
    severity: 'Critical',
    status: 'Pending',
    reportedBy: 'AI System',
    date: '2026-03-06 08:14',
    description: 'Major collision involving 3 vehicles on the national highway near Blida.',
  },
  {
    id: 'INC-3002',
    type: 'Overturned truck',
    location: 'A1 Autoroute, Bouira',
    severity: 'High',
    status: 'Pending',
    reportedBy: 'Karim B.',
    date: '2026-03-06 08:01',
    description: 'Heavy goods vehicle overturned blocking two lanes of the autoroute.',
  },
  {
    id: 'INC-3003',
    type: 'Pedestrian accident',
    location: 'RN5, Tizi Ouzou Center',
    severity: 'High',
    status: 'Approved',
    reportedBy: 'Amina L.',
    date: '2026-03-06 07:48',
    description: 'Pedestrian hit near a school zone during morning rush hour.',
  },
  {
    id: 'INC-3004',
    type: 'Rear-end chain collision',
    location: 'CW12, Setif Industrial Zone',
    severity: 'Medium',
    status: 'Pending',
    reportedBy: 'AI System',
    date: '2026-03-06 07:35',
    description: 'Four-car chain collision at industrial zone entry roundabout.',
  },
  {
    id: 'INC-3005',
    type: 'Minor fender bender',
    location: 'RN4, Tipaza Coastal Road',
    severity: 'Low',
    status: 'Rejected',
    reportedBy: 'Fatima Z.',
    date: '2026-03-06 07:20',
    description: 'Minor bump at a coastal roundabout. No injuries reported.',
  },
  {
    id: 'INC-3006',
    type: 'Motorcycle skid',
    location: 'RN11, Djelfa Bypass',
    severity: 'Medium',
    status: 'Escalated',
    reportedBy: 'Youssef M.',
    date: '2026-03-06 07:05',
    description: 'Motorcycle skidded on wet road surface, rider injured.',
  },
  {
    id: 'INC-3007',
    type: 'Bus collision',
    location: 'A1, Algiers Tunnel Entrance',
    severity: 'Critical',
    status: 'Approved',
    reportedBy: 'AI System',
    date: '2026-03-06 06:50',
    description: 'Public transport bus collision at tunnel entrance. Multiple injuries.',
  },
  {
    id: 'INC-3008',
    type: 'Parked car sideswiped',
    location: 'RN3, Constantine Ring Road',
    severity: 'Low',
    status: 'Rejected',
    reportedBy: 'Said K.',
    date: '2026-03-06 06:30',
    description: 'Parked vehicle sideswiped. Driver fled the scene.',
  },
];

const severityColor = (s) => {
  const map = {
    Critical: Colors.severityCritical,
    High: Colors.severityHigh,
    Medium: Colors.severityMedium,
    Low: Colors.severityLow,
  };
  return map[s] || Colors.grey;
};

const statusColor = (s) => {
  const map = {
    Pending: Colors.adminWarning,
    Approved: Colors.adminSuccess,
    Rejected: Colors.adminDanger,
    Escalated: Colors.severityHigh,
  };
  return map[s] || Colors.grey;
};

const typeIcon = (type) => {
  const lower = type.toLowerCase();
  if (lower.includes('bus')) return 'bus';
  if (lower.includes('motorcycle')) return 'bicycle';
  if (lower.includes('pedestrian')) return 'walk';
  if (lower.includes('truck')) return 'cube';
  return 'car';
};

// ── Component ────────────────────────────────────────────
export default function AdminIncidentsScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = INCIDENTS;
    if (activeTab !== 'All') {
      list = list.filter((i) => i.status === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          i.type.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeTab, search]);

  const handleAction = (incident, action) => {
    console.log(`${action} incident ${incident.id}`);
  };

  const renderIncident = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('AdminIncidentReview', { incident: item })}
    >
      {/* Header row: ID badge + severity pill */}
      <View style={styles.cardHeader}>
        <View style={styles.cardIdBadge}>
          <Ionicons name="document-text" size={12} color={Colors.adminInfo} />
          <Text style={styles.cardId}>{item.id}</Text>
        </View>
        <View style={[styles.sevBadge, { backgroundColor: severityColor(item.severity) + '20' }]}>
          <View style={[styles.sevDot, { backgroundColor: severityColor(item.severity) }]} />
          <Text style={[styles.sevLabel, { color: severityColor(item.severity) }]}>
            {item.severity}
          </Text>
        </View>
      </View>

      {/* Type icon + type text and status pill */}
      <View style={styles.cardTypeRow}>
        <View style={styles.typeBadge}>
          <Ionicons name={typeIcon(item.type)} size={12} color={Colors.btnPrimary} />
          <Text style={styles.typeText}>{item.type}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '15' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
          <Text style={[styles.statusLabel, { color: statusColor(item.status) }]}>
            {item.status}
          </Text>
        </View>
      </View>

      {/* Location */}
      <View style={styles.cardMeta}>
        <Ionicons name="location-outline" size={13} color={Colors.grey} />
        <Text style={styles.cardLocation} numberOfLines={1}>
          {item.location}
        </Text>
      </View>

      {/* Reporter & date */}
      <View style={styles.cardInfoRow}>
        <View style={styles.infoItem}>
          <Ionicons name="person-outline" size={11} color={Colors.grey} />
          <Text style={styles.infoText}>{item.reportedBy}</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="time-outline" size={11} color={Colors.grey} />
          <Text style={styles.infoText}>{item.date}</Text>
        </View>
      </View>

      {/* Action buttons: Review / Approve / Reject */}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionReview]}
          onPress={() => navigation.navigate('AdminIncidentReview', { incident: item })}
        >
          <Ionicons name="eye-outline" size={14} color={Colors.adminInfo} />
          <Text style={[styles.actionText, { color: Colors.adminInfo }]}>Review</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionApprove]}
          onPress={() => handleAction(item, 'Approve')}
        >
          <Ionicons name="checkmark-circle-outline" size={14} color={Colors.adminSuccess} />
          <Text style={[styles.actionText, { color: Colors.adminSuccess }]}>Approve</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionReject]}
          onPress={() => handleAction(item, 'Reject')}
        >
          <Ionicons name="close-circle-outline" size={14} color={Colors.adminDanger} />
          <Text style={[styles.actionText, { color: Colors.adminDanger }]}>Reject</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      <AdminHeader title="Incident Management" navigation={navigation} />

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={Colors.grey} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ID, type, location..."
            placeholderTextColor={Colors.grey}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.grey} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            const count =
              tab === 'All'
                ? INCIDENTS.length
                : INCIDENTS.filter((i) => i.status === tab).length;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab}</Text>
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Results count */}
      <View style={styles.resultsBar}>
        <Text style={styles.resultsText}>
          {filtered.length} incident{filtered.length !== 1 ? 's' : ''} found
        </Text>
      </View>

      {/* Incident list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderIncident}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="file-tray-outline" size={48} color={Colors.grey} />
            <Text style={styles.emptyText}>No incidents match your filters</Text>
          </View>
        }
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.adminBg },

  /* Search */
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: { flex: 1, color: Colors.adminText, fontSize: 14, padding: 0 },

  /* Tabs */
  tabsWrap: { marginTop: 10 },
  tabs: { paddingHorizontal: 16, gap: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    gap: 6,
  },
  tabActive: {
    backgroundColor: Colors.violetLight,
    borderColor: Colors.btnPrimary,
  },
  tabText: { color: Colors.grey, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.btnPrimary },
  tabBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeActive: { backgroundColor: Colors.violetBorder },
  tabBadgeText: { color: Colors.grey, fontSize: 11, fontWeight: '600' },
  tabBadgeTextActive: { color: Colors.btnPrimary },

  /* Results */
  resultsBar: { paddingHorizontal: 16, paddingVertical: 8 },
  resultsText: { color: Colors.grey, fontSize: 12 },

  /* List */
  list: { paddingHorizontal: 16, paddingBottom: 30 },

  /* Card */
  card: {
    backgroundColor: Colors.adminSurface,
    borderWidth: 1,
    borderColor: Colors.adminBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardId: { color: Colors.adminInfo, fontSize: 14, fontWeight: '700' },
  sevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  sevDot: { width: 7, height: 7, borderRadius: 4 },
  sevLabel: { fontSize: 11, fontWeight: '600' },

  /* Type & status */
  cardTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 4,
  },
  typeText: { color: Colors.btnPrimary, fontSize: 11, fontWeight: '600' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '600' },

  /* Meta */
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  cardLocation: { color: Colors.grey, fontSize: 12, flex: 1 },

  /* Info row */
  cardInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { color: Colors.grey, fontSize: 11 },

  /* Action buttons */
  cardActions: { flexDirection: 'row', gap: 8 },
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
  actionReview: {
    borderColor: 'rgba(59,130,246,0.3)',
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  actionApprove: {
    borderColor: 'rgba(34,197,94,0.3)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  actionReject: {
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  actionText: { fontSize: 11, fontWeight: '600' },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: Colors.grey, fontSize: 14 },
});
