import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { useNotifications } from '../../contexts/NotificationsContext';
import {
  formatRelativeTime,
  getNotificationVisuals,
  groupNotificationsByDate,
} from '../../utils/notifications';

export default function NotificationsScreen({ navigation }) {
  const {
    items,
    unreadCount,
    loading,
    refreshing,
    error,
    refreshNotifications,
    markAllRead,
    openNotification,
  } = useNotifications();

  const sections = useMemo(() => groupNotificationsByDate(items), [items]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.heading} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'Everything is up to date'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.markReadBtn, unreadCount === 0 && styles.markReadBtnDisabled]}
          onPress={() => markAllRead()}
          disabled={unreadCount === 0}
        >
          <Ionicons name="checkmark-done" size={16} color={unreadCount === 0 ? Colors.greyLight : Colors.primary} />
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>Loading notifications...</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refreshNotifications()}
              tintColor={Colors.primary}
            />
          }
          contentContainerStyle={sections.length === 0 ? styles.emptyList : styles.listContent}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const visuals = getNotificationVisuals(item);
            return (
              <TouchableOpacity
                style={[styles.card, !item.read && styles.cardUnread]}
                activeOpacity={0.78}
                onPress={() => openNotification(item)}
              >
                {!item.read ? <View style={[styles.unreadAccent, { backgroundColor: visuals.color }]} /> : null}
                <View style={[styles.iconWrap, { backgroundColor: visuals.bg }]}>
                  <Ionicons name={visuals.icon} size={20} color={visuals.color} />
                </View>
                <View style={styles.cardCopy}>
                  <View style={styles.cardTopRow}>
                    <Text style={[styles.cardTitle, !item.read && styles.cardTitleUnread]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.cardTime}>{formatRelativeTime(item.createdAt || item.sentAt)}</Text>
                  </View>
                  <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.metaPill, { backgroundColor: visuals.bg }]}>
                      <Text style={[styles.metaPillText, { color: visuals.color }]}>{visuals.label}</Text>
                    </View>
                    {!item.read ? <Text style={styles.unreadLabel}>Unread</Text> : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={(
            <View style={styles.centerState}>
              <Ionicons name="notifications-off-outline" size={46} color={Colors.greyLight} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.centerText}>Live alerts and route updates will appear here.</Text>
            </View>
          )}
          ListFooterComponent={error ? <Text style={styles.errorText}>{error}</Text> : <View style={styles.footerSpace} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.heading,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.subtext,
  },
  markReadBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markReadBtnDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: Colors.border,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sectionHeader: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardUnread: {
    backgroundColor: '#FCFCFF',
  },
  unreadAccent: {
    position: 'absolute',
    top: 14,
    left: 0,
    bottom: 14,
    width: 4,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: {
    flex: 1,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.heading,
  },
  cardTitleUnread: {
    fontWeight: '800',
  },
  cardTime: {
    fontSize: 11,
    color: Colors.grey,
  },
  cardBody: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.subtext,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  unreadLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: {
    fontSize: 13,
    color: Colors.subtext,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.heading,
  },
  errorText: {
    marginTop: 6,
    marginBottom: 20,
    textAlign: 'center',
    color: Colors.error,
    fontSize: 12,
  },
  footerSpace: {
    height: 18,
  },
});
