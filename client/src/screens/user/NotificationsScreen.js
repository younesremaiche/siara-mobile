import React, { useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

  useFocusEffect(useCallback(() => { refreshNotifications(); }, [refreshNotifications]));

  const sections = useMemo(() => groupNotificationsByDate(items), [items]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.gradientFrom} />
      <LinearGradient
        colors={[Colors.gradientFrom, Colors.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerDecor1} />
        <View style={styles.headerDecor2} />
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <View style={styles.titleRow}>
              <Text style={styles.headerTitle}>Notifications</Text>
              {unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.headerSubtitle}>
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
                : 'Everything is up to date'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.markReadBtn, unreadCount === 0 && styles.markReadBtnDisabled]}
            onPress={() => markAllRead()}
            disabled={unreadCount === 0}
            activeOpacity={0.85}
          >
            <Ionicons
              name="checkmark-done"
              size={16}
              color={unreadCount === 0 ? 'rgba(255,255,255,0.5)' : Colors.white}
            />
            <Text style={[styles.markReadText, unreadCount === 0 && styles.markReadTextDisabled]}>
              Mark all
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerDecor1: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  headerDecor2: {
    position: 'absolute',
    bottom: -50,
    left: -20,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.white,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.white,
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.82)',
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  markReadText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
  markReadBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  markReadTextDisabled: {
    color: 'rgba(255,255,255,0.5)',
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
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardUnread: {
    backgroundColor: '#FCFCFF',
    borderColor: Colors.violetBorder,
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
