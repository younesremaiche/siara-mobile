import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import NotificationBell from '../../components/notifications/NotificationBell';
import ReportCard from '../../components/ReportCard';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';
import useReportsFeed from '../../hooks/useReportsFeed';

const FEED_TABS = [
  { id: 'latest', label: 'Latest' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'verified', label: 'Verified' },
  { id: 'following', label: 'Following' },
];

const SORT_OPTIONS = [
  { id: 'recent', label: 'Recent' },
  { id: 'severity', label: 'Severity' },
];

export default function NewsScreen({ navigation }) {
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

  const followingSupported = feedMeta?.followingSupported !== false;
  const visibleTabs = useMemo(
    () => FEED_TABS.filter((tab) => tab.id !== 'following' || followingSupported || activeFeed === 'following'),
    [activeFeed, followingSupported],
  );

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.screenTitle}>Reports Feed</Text>
          <Text style={styles.screenSubtitle}>Live public reports from the SIARA backend</Text>
        </View>
        <NotificationBell navigation={navigation} style={styles.bellButton} color={Colors.heading} />
      </View>

      <View style={styles.ctaCard}>
        <View style={styles.ctaCopy}>
          <Text style={styles.ctaTitle}>Seen something on the road?</Text>
          <Text style={styles.ctaBody}>Create a report with the real SIARA backend flow.</Text>
        </View>
        <Button onPress={() => navigation.navigate('ReportIncident')}>Report now</Button>
      </View>

      <View style={styles.filterCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {visibleTabs.map((tab) => {
            const selected = activeFeed === tab.id;
            const disabled = tab.id === 'following' && !followingSupported;

            return (
              <TouchableOpacity
                key={tab.id}
                disabled={disabled}
                style={[
                  styles.feedTab,
                  selected && styles.feedTabActive,
                  disabled && styles.feedTabDisabled,
                ]}
                onPress={() => setActiveFeed(tab.id)}
              >
                <Text style={[styles.feedTabText, selected && styles.feedTabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.sortRow}>
          {SORT_OPTIONS.map((option) => {
            const selected = sortMode === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.sortChip, selected && styles.sortChipActive]}
                onPress={() => setSortMode(option.id)}
              >
                <Text style={[styles.sortChipText, selected && styles.sortChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {nearbyMessage ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>{nearbyMessage}</Text>
        </View>
      ) : null}

      {feedError ? (
        <View style={[styles.stateCard, styles.errorCard]}>
          <Text style={styles.stateTitle}>Feed unavailable</Text>
          <Text style={styles.stateText}>{feedError}</Text>
        </View>
      ) : null}

      {!feedError && !isLoading && reports.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>
            {activeFeed === 'following' && !followingSupported
              ? 'Following feed is not available'
              : 'No reports found'}
          </Text>
          <Text style={styles.stateText}>
            {activeFeed === 'following' && !followingSupported
              ? 'The current backend reports feed does not support following yet, so this tab is kept disabled after the backend confirms it.'
              : 'Try another feed tab or pull to refresh.'}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (isLoading && !reports.length && !feedError) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading public reports...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ReportCard report={item} />}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={(
          <View style={styles.footer}>
            {loadMoreError ? <Text style={styles.footerError}>{loadMoreError}</Text> : null}
            {reports.length > 0 && pagination.hasMore ? (
              <Button
                variant="secondary"
                loading={isLoadingMore}
                style={styles.loadMoreButton}
                onPress={loadMore}
              >
                Load more
              </Button>
            ) : reports.length > 0 ? (
              <Text style={styles.footerHint}>You have reached the end of this feed.</Text>
            ) : null}
          </View>
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={(
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={Colors.primary} />
        )}
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
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.bg,
  },
  loadingText: {
    color: Colors.subtext,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 100,
  },
  headerContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 16,
    gap: 16,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  screenTitle: {
    color: Colors.heading,
    fontSize: 26,
    fontWeight: '800',
  },
  screenSubtitle: {
    color: Colors.subtext,
    fontSize: 13,
    marginTop: 4,
  },
  bellButton: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 2,
  },
  ctaCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 14,
  },
  ctaCopy: {
    gap: 6,
  },
  ctaTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  ctaBody: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 20,
  },
  filterCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 12,
  },
  tabRow: {
    gap: 10,
  },
  feedTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  feedTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  feedTabDisabled: {
    opacity: 0.45,
  },
  feedTabText: {
    color: Colors.subtext,
    fontSize: 13,
    fontWeight: '700',
  },
  feedTabTextActive: {
    color: Colors.white,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  sortChipActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  sortChipText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  sortChipTextActive: {
    color: Colors.white,
  },
  infoCard: {
    backgroundColor: Colors.blueLight,
    borderWidth: 1,
    borderColor: Colors.blueBorder,
    borderRadius: 14,
    padding: 12,
  },
  infoText: {
    color: Colors.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  stateCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  stateTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  stateText: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 20,
  },
  separator: {
    height: 14,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'center',
    gap: 10,
  },
  footerError: {
    color: Colors.btnDanger,
    fontSize: 12,
  },
  footerHint: {
    color: Colors.subtext,
    fontSize: 12,
  },
  loadMoreButton: {
    width: '100%',
  },
});
