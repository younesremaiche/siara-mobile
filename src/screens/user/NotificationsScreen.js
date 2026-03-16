import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';

const MOCK_NOTIFS = [
  {
    id: 1,
    type: 'alert',
    title: 'High-risk zone detected',
    body: 'Algiers Centre area experiencing elevated risk. Exercise caution.',
    time: '5m ago',
    read: false,
    severity: 'high',
  },
  {
    id: 2,
    type: 'incident',
    title: 'New incident near you',
    body: 'Collision reported on Blvd Zirout Youcef, 1.2km away.',
    time: '12m ago',
    read: false,
    severity: 'high',
  },
  {
    id: 3,
    type: 'system',
    title: 'Alert triggered',
    body: 'Your "Morning Commute" alert was triggered 3 times today.',
    time: '1h ago',
    read: false,
    severity: 'medium',
  },
  {
    id: 4,
    type: 'alert',
    title: 'Risk level changed',
    body: 'AI model updated risk for your saved route: Medium to High.',
    time: '2h ago',
    read: true,
    severity: 'high',
  },
  {
    id: 5,
    type: 'incident',
    title: 'Your report verified',
    body: 'Your incident report #TRK-A8B3 has been verified by 5 users.',
    time: '3h ago',
    read: true,
    severity: 'low',
  },
  {
    id: 6,
    type: 'system',
    title: 'Weekly safety digest',
    body: '12 incidents in your monitored zones this week. View summary.',
    time: 'Yesterday',
    read: true,
    severity: 'low',
  },
  {
    id: 7,
    type: 'alert',
    title: 'New danger zone identified',
    body: 'AI detected a new high-risk zone near Bab Ezzouar based on recent data.',
    time: 'Yesterday',
    read: true,
    severity: 'medium',
  },
  {
    id: 8,
    type: 'system',
    title: 'App update available',
    body: 'SIARA v1.1 is available with improved map features and bug fixes.',
    time: '2d ago',
    read: true,
    severity: 'low',
  },
];

const CATEGORIES = ['All', 'Alerts', 'Incidents', 'System'];

export default function NotificationsScreen({ navigation }) {
  const [category, setCategory] = useState('All');
  const [notifications, setNotifications] = useState(MOCK_NOTIFS);

  const filtered = notifications.filter((n) => {
    if (category === 'All') return true;
    if (category === 'Alerts') return n.type === 'alert';
    if (category === 'Incidents') return n.type === 'incident';
    if (category === 'System') return n.type === 'system';
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  function markAllRead() {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
  }

  function markAsRead(id) {
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  const iconMap = {
    alert: 'warning',
    incident: 'car',
    system: 'settings',
  };

  const sevColor = (severity) => ({
    low: Colors.severityLow,
    medium: Colors.severityMedium,
    high: Colors.severityHigh,
    critical: Colors.severityCritical,
  }[severity] || Colors.grey);

  function renderNotif({ item }) {
    const color = sevColor(item.severity);
    return (
      <TouchableOpacity
        style={[styles.notifCard, !item.read && styles.notifUnread]}
        onPress={() => markAsRead(item.id)}
        activeOpacity={0.7}
      >
        {/* Unread accent */}
        {!item.read && <View style={[styles.unreadAccent, { backgroundColor: color }]} />}

        <View style={[styles.notifIconWrap, { backgroundColor: `${color}14` }]}>
          <Ionicons
            name={iconMap[item.type] || 'notifications'}
            size={20}
            color={color}
          />
        </View>

        <View style={styles.notifContent}>
          <View style={styles.notifTitleRow}>
            <Text style={[styles.notifTitle, !item.read && styles.notifTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            {!item.read && <View style={[styles.unreadDot, { backgroundColor: color }]} />}
          </View>
          <Text style={styles.notifBody} numberOfLines={2}>
            {item.body}
          </Text>
          <View style={styles.notifMeta}>
            <Ionicons name="time-outline" size={12} color={Colors.greyLight} />
            <Text style={styles.notifTime}>{item.time}</Text>
            <View style={[styles.typePill, { backgroundColor: `${color}14` }]}>
              <Text style={[styles.typePillText, { color }]}>
                {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderHeader() {
    return (
      <View>
        {/* Category tabs */}
        <View style={styles.catRow}>
          {CATEGORIES.map((c) => {
            const isActive = category === c;
            return (
              <TouchableOpacity
                key={c}
                style={[styles.catChip, isActive && styles.catChipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.catText, isActive && styles.catTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Notification count */}
        {filtered.length > 0 && (
          <View style={styles.countRow}>
            <Text style={styles.countText}>
              {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>
    );
  }

  function renderEmpty() {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="notifications-off-outline" size={48} color={Colors.greyLight} />
        </View>
        <Text style={styles.emptyTitle}>No notifications</Text>
        <Text style={styles.emptySubtitle}>
          {category === 'All'
            ? "You're all caught up! New notifications will appear here."
            : `No ${category.toLowerCase()} notifications to display.`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSubtitle}>{unreadCount} unread</Text>
          )}
        </View>
        <TouchableOpacity style={styles.markReadBtn} onPress={markAllRead}>
          <Ionicons name="checkmark-done" size={16} color={Colors.primary} />
          <Text style={styles.markReadText}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        renderItem={renderNotif}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.heading,
    fontSize: 24,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  markReadText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },

  /* Category tabs */
  catRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catChipActive: {
    backgroundColor: Colors.btnPrimary,
    borderColor: Colors.btnPrimary,
  },
  catText: {
    color: Colors.subtext,
    fontSize: 13,
    fontWeight: '500',
  },
  catTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },

  /* Count row */
  countRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  countText: {
    color: Colors.subtext,
    fontSize: 12,
    fontWeight: '500',
  },

  /* List */
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  /* Notification card */
  notifCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  notifUnread: {
    backgroundColor: Colors.white,
    borderColor: Colors.violetBorder,
  },
  unreadAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  notifIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifContent: {
    flex: 1,
  },
  notifTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  notifTitleUnread: {
    color: Colors.heading,
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notifBody: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  notifMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notifTime: {
    color: Colors.greyLight,
    fontSize: 11,
    fontWeight: '500',
    marginRight: 8,
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typePillText: {
    fontSize: 10,
    fontWeight: '600',
  },

  /* Empty state */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: Colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
