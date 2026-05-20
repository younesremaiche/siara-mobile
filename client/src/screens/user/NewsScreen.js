import React, { useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationBell from '../../components/notifications/NotificationBell';
import ReportCard from '../../components/ReportCard';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';
import useReportsFeed from '../../hooks/useReportsFeed';

const FEED_TABS = [
  { id: 'latest',    label: 'Latest',    icon: 'flame-outline' },
  { id: 'nearby',    label: 'Nearby',    icon: 'location-outline' },
  { id: 'verified',  label: 'Verified',  icon: 'checkmark-circle-outline' },
  { id: 'following', label: 'Following', icon: 'people-outline' },
];

const SORT_OPTIONS = [
  { id: 'recent',   label: 'Recent',   icon: 'time-outline' },
  { id: 'severity', label: 'Severity', icon: 'trending-up-outline' },
];

export default function NewsScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const {
    activeFeed,
    setActiveFeed,
    sortMode,
    setSortMode,
    reports,
    pagination,
    feedMeta,
    nearbyMessage,
    isLoading,
    isRefreshing,
    isLoadingMore,
    feedError,
    loadMoreError,
    refresh,
    loadMore,
  } = useReportsFeed();

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const followingSupported = feedMeta?.followingSupported !== false;
  const visibleTabs = useMemo(
    () => FEED_TABS.filter((tab) => tab.id !== 'following' || followingSupported || activeFeed === 'following'),
    [activeFeed, followingSupported],
  );

  const header = (
    <View style={s.headerWrap}>

      {/* ── CTA card ── */}
      <TouchableOpacity
        style={s.ctaOuter}
        onPress={() => navigation.navigate('ReportIncident')}
        activeOpacity={0.92}
      >
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.ctaGrad}
        >
          <View style={s.ctaDecor1} />
          <View style={s.ctaDecor2} />

          <View style={s.ctaBody}>
            <View style={s.ctaIconWrap}>
              <Ionicons name="warning-outline" size={22} color={Colors.primary} />
            </View>
            <View style={s.ctaCopy}>
              <Text style={s.ctaTitle}>Seen something on the road?</Text>
              <Text style={s.ctaSub}>Help the community — submit a live report</Text>
            </View>
          </View>

          <View style={s.ctaBtn}>
            <Text style={s.ctaBtnText}>Report now</Text>
            <Ionicons name="arrow-forward" size={13} color={Colors.primary} />
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* ── Filter card ── */}
      <View style={s.filterCard}>
        {/* Feed type tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
          {visibleTabs.map((tab) => {
            const active   = activeFeed === tab.id;
            const disabled = tab.id === 'following' && !followingSupported;
            return (
              <TouchableOpacity
                key={tab.id}
                disabled={disabled}
                style={[s.feedTab, active && s.feedTabActive, disabled && s.feedTabDisabled]}
                onPress={() => setActiveFeed(tab.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tab.icon}
                  size={13}
                  color={active ? Colors.white : Colors.subtext}
                />
                <Text style={[s.feedTabText, active && s.feedTabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={s.divider} />

        {/* Sort row */}
        <View style={s.sortRow}>
          <Text style={s.sortLabel}>Sort by</Text>
          {SORT_OPTIONS.map((opt) => {
            const active = sortMode === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[s.sortChip, active && s.sortChipActive]}
                onPress={() => setSortMode(opt.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={opt.icon}
                  size={12}
                  color={active ? Colors.white : Colors.primary}
                />
                <Text style={[s.sortChipText, active && s.sortChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Nearby info ── */}
      {nearbyMessage ? (
        <View style={s.infoCard}>
          <Ionicons name="location" size={14} color={Colors.secondary} />
          <Text style={s.infoText}>{nearbyMessage}</Text>
        </View>
      ) : null}

      {/* ── Feed error ── */}
      {feedError ? (
        <View style={s.errorCard}>
          <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
          <View style={s.errorBody}>
            <Text style={s.errorTitle}>Feed unavailable</Text>
            <Text style={s.errorText}>{feedError}</Text>
          </View>
        </View>
      ) : null}

      {/* ── Empty state ── */}
      {!feedError && !isLoading && reports.length === 0 ? (
        <View style={s.emptyCard}>
          <View style={s.emptyIconBg}>
            <Ionicons name="newspaper-outline" size={28} color={Colors.greyLight} />
          </View>
          <Text style={s.emptyTitle}>
            {activeFeed === 'following' && !followingSupported
              ? 'Following feed unavailable'
              : 'No reports found'}
          </Text>
          <Text style={s.emptyText}>
            {activeFeed === 'following' && !followingSupported
              ? 'The following feed is not yet supported by the backend.'
              : 'Try another tab or pull down to refresh.'}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const gradientHeader = (
    <LinearGradient
      colors={[Colors.gradientFrom, Colors.gradientTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[s.gradHeader, { paddingTop: insets.top + 14 }]}
    >
      <View style={s.gradDecor1} />
      <View style={s.gradDecor2} />
      <View style={s.gradRow}>
        <View style={s.gradText}>
          <Text style={s.gradTitle}>Reports Feed</Text>
          <Text style={s.gradSub}>Live reports from the community</Text>
        </View>
        <View style={s.gradBell}>
          <NotificationBell navigation={navigation} color={Colors.white} />
        </View>
      </View>
    </LinearGradient>
  );

  if (isLoading && !reports.length && !feedError) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.gradientFrom} translucent={false} />
        {gradientHeader}
        <View style={s.loadingState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadingText}>Loading public reports…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.gradientFrom} translucent={false} />
      {gradientHeader}
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={s.cardWrap}>
            <ReportCard report={item} />
          </View>
        )}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        ListFooterComponent={(
          <View style={[s.footer, { paddingBottom: insets.bottom + 24 }]}>
            {loadMoreError ? (
              <Text style={s.footerError}>{loadMoreError}</Text>
            ) : null}
            {reports.length > 0 && pagination.hasMore ? (
              <Button
                variant="secondary"
                loading={isLoadingMore}
                style={s.loadMoreBtn}
                onPress={loadMore}
              >
                Load more
              </Button>
            ) : reports.length > 0 ? (
              <View style={s.endRow}>
                <View style={s.endLine} />
                <Text style={s.endText}>End of feed</Text>
                <View style={s.endLine} />
              </View>
            ) : null}
          </View>
        )}
        contentContainerStyle={s.listContent}
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  loadingState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: 14,
  },
  loadingText: { color: Colors.subtext, fontSize: 14 },

  listContent: { paddingBottom: 8 },

  // ── Gradient header ──
  gradHeader: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  gradDecor1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -40,
  },
  gradDecor2: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -30, left: 30,
  },
  gradRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gradText: { gap: 3 },
  gradTitle: { fontSize: 22, fontWeight: '800', color: Colors.white },
  gradSub:   { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  gradBell: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── List header (CTA + filters) ──
  headerWrap: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 16,
  },

  // CTA card
  ctaOuter: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaGrad: {
    borderRadius: 20,
    padding: 18,
    gap: 14,
    overflow: 'hidden',
  },
  ctaDecor1: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -30,
  },
  ctaDecor2: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -20, right: 80,
  },
  ctaBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ctaIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaCopy: { flex: 1, gap: 3 },
  ctaTitle: { fontSize: 15, fontWeight: '800', color: Colors.white },
  ctaSub:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 17 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.white,
    borderRadius: 12, paddingVertical: 11,
  },
  ctaBtnText: { fontSize: 14, fontWeight: '800', color: Colors.primary },

  // Filter card
  filterCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  tabRow: { gap: 8 },
  feedTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 9,
    borderRadius: 999, backgroundColor: Colors.bg,
    borderWidth: 1, borderColor: Colors.border,
  },
  feedTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  feedTabDisabled: { opacity: 0.4 },
  feedTabText: { fontSize: 13, fontWeight: '700', color: Colors.subtext },
  feedTabTextActive: { color: Colors.white },

  divider: { height: 1, backgroundColor: Colors.border },

  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortLabel: { fontSize: 12, fontWeight: '700', color: Colors.subtext, marginRight: 2 },
  sortChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.violetLight,
    borderWidth: 1, borderColor: Colors.violetBorder,
  },
  sortChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sortChipText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  sortChipTextActive: { color: Colors.white },

  // Info / error / empty
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.blueLight,
    borderWidth: 1, borderColor: Colors.blueBorder,
    borderRadius: 14, padding: 12,
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.secondary, lineHeight: 18 },

  errorCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 14, padding: 14,
  },
  errorBody: { flex: 1, gap: 3 },
  errorTitle: { fontSize: 14, fontWeight: '800', color: Colors.heading },
  errorText:  { fontSize: 13, color: Colors.subtext, lineHeight: 18 },

  emptyCard: {
    alignItems: 'center',
    paddingVertical: 32, paddingHorizontal: 24,
    gap: 10,
  },
  emptyIconBg: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.heading },
  emptyText:  { fontSize: 13, color: Colors.subtext, textAlign: 'center', lineHeight: 20 },

  // List
  cardWrap: { paddingHorizontal: 18 },
  separator: { height: 12 },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 16,
    alignItems: 'center',
    gap: 10,
  },
  footerError: { fontSize: 12, color: Colors.error },
  loadMoreBtn: { width: '100%' },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' },
  endLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  endText: { fontSize: 12, color: Colors.greyLight, fontWeight: '600' },
});
