import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const TABS = [
  { key: 'feed', label: 'Feed', icon: 'newspaper-outline' },
  { key: 'map', label: 'Map', icon: 'map-outline' },
  { key: 'alerts', label: 'Alerts', icon: 'warning-outline' },
  { key: 'report', label: 'Report', icon: 'megaphone-outline' },
  { key: 'dashboard', label: 'Dashboard', icon: 'bar-chart-outline' },
  { key: 'predictions', label: 'Predictions', icon: 'analytics-outline' },
];

const MOCK_POSTS = [
  {
    id: '1',
    author: 'Karim Benali',
    avatar: 'K',
    avatarColor: Colors.primary,
    role: 'Community Reporter',
    time: '25 min ago',
    severity: 'high',
    type: 'incident',
    title: 'Major collision on Boulevard Zirout Youcef - Algiers',
    body: 'Two vehicles collided head-on at the intersection near Didouche Mourad around 14:30. Emergency services are on site and traffic has been diverted through Rue Larbi Ben M\'hidi. Expect delays of 30-45 minutes. Multiple injuries reported, no fatalities confirmed.',
    location: 'Algiers Centre, Wilaya 16',
    likes: 47,
    comments: 18,
    shares: 12,
    liked: false,
    hasImage: true,
  },
  {
    id: '2',
    author: 'SIARA AI',
    avatar: 'AI',
    avatarColor: Colors.secondary,
    role: 'Automated Alert',
    time: '1h ago',
    severity: 'critical',
    type: 'alert',
    title: 'HIGH RISK: Autoroute Est km 42-48 - Elevated accident probability',
    body: 'Our predictive model has detected a 87% accident probability spike in this segment. Contributing factors: heavy rainfall, reduced visibility, historical Friday afternoon pattern. 3 incidents occurred in this exact zone last month. Authorities have been notified.',
    location: 'Autoroute Est, Boumerdes',
    likes: 89,
    comments: 34,
    shares: 56,
    liked: true,
    hasImage: false,
  },
  {
    id: '3',
    author: 'Amina Messaoudi',
    avatar: 'A',
    avatarColor: Colors.accent,
    role: 'Verified Reporter',
    time: '2h ago',
    severity: 'medium',
    type: 'report',
    title: 'Large pothole hazard near Bab Ezzouar campus entrance',
    body: 'A significant pothole has formed on the main road approaching USTHB university campus. Several near-misses have been reported by students. The cavity is approximately 40cm deep and located in the right lane. Temporary cones have been placed by nearby shopkeepers.',
    location: 'Bab Ezzouar, Algiers',
    likes: 31,
    comments: 9,
    shares: 5,
    liked: false,
    hasImage: true,
  },
  {
    id: '4',
    author: 'Yacine Djaballah',
    avatar: 'Y',
    avatarColor: '#E67E22',
    role: 'Civil Engineer',
    time: '3h ago',
    severity: 'low',
    type: 'report',
    title: 'Road resurfacing complete on RN5 - Rouiba section',
    body: 'Good news: the road repair works on National Route 5, Rouiba section, have been completed. New asphalt, lane markings, and guardrails are in place. Speed limit remains 80 km/h through the construction zone until final inspection next week.',
    location: 'Rouiba, Algiers',
    likes: 62,
    comments: 7,
    shares: 14,
    liked: true,
    hasImage: false,
  },
  {
    id: '5',
    author: 'SIARA AI',
    avatar: 'AI',
    avatarColor: Colors.secondary,
    role: 'Weather Intelligence',
    time: '4h ago',
    severity: 'medium',
    type: 'alert',
    title: 'Weather advisory: Dense fog expected in Constantine region',
    body: 'Meteorological data indicates dense fog formation expected between 05:00-09:00 tomorrow in Constantine and surrounding wilayas. Historical analysis shows a 2.3x increase in accident rates during similar conditions. Exercise extreme caution, reduce speed, and use fog lights.',
    location: 'Constantine, Wilaya 25',
    likes: 38,
    comments: 11,
    shares: 22,
    liked: false,
    hasImage: false,
  },
];

const SEVERITY_CONFIG = {
  low: { color: Colors.severityLow, label: 'Low', icon: 'shield-checkmark' },
  medium: { color: Colors.severityMedium, label: 'Medium', icon: 'alert-circle' },
  high: { color: Colors.severityHigh, label: 'High', icon: 'warning' },
  critical: { color: Colors.severityCritical, label: 'Critical', icon: 'flame' },
};

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export default function NewsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('feed');
  const [search, setSearch] = useState('');
  const [posts, setPosts] = useState(MOCK_POSTS);

  const filteredPosts = posts.filter((p) => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleLike = (id) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 }
          : p
      )
    );
  };

  const renderPost = ({ item }) => {
    const sev = SEVERITY_CONFIG[item.severity];
    return (
      <View style={styles.postCard}>
        {/* Post Header */}
        <View style={styles.postHeader}>
          <View style={styles.postAuthorRow}>
            <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
              <Text style={styles.avatarText}>{item.avatar}</Text>
            </View>
            <View style={styles.authorInfo}>
              <View style={styles.authorNameRow}>
                <Text style={styles.authorName}>{item.author}</Text>
                {item.author === 'SIARA AI' && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.secondary} />
                  </View>
                )}
              </View>
              <View style={styles.authorMetaRow}>
                <Text style={styles.authorRole}>{item.role}</Text>
                <View style={styles.dotSeparator} />
                <Text style={styles.postTime}>{item.time}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.severityBadge, { backgroundColor: sev.color + '18' }]}>
            <Ionicons name={sev.icon} size={12} color={sev.color} />
            <Text style={[styles.severityText, { color: sev.color }]}>{sev.label}</Text>
          </View>
        </View>

        {/* Post Content */}
        <Text style={styles.postTitle}>{item.title}</Text>
        <Text style={styles.postBody} numberOfLines={4}>{item.body}</Text>

        {/* Location */}
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={14} color={Colors.grey} />
          <Text style={styles.locationText}>{item.location}</Text>
        </View>

        {/* Image Placeholder */}
        {item.hasImage && (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={32} color={Colors.greyLight} />
            <Text style={styles.imagePlaceholderText}>Media attachment</Text>
          </View>
        )}

        {/* Engagement Stats */}
        <View style={styles.engagementRow}>
          <Text style={styles.engagementText}>
            {item.likes} likes
          </Text>
          <Text style={styles.engagementText}>
            {item.comments} comments {'\u00B7'} {item.shares} shares
          </Text>
        </View>

        {/* Divider */}
        <View style={styles.postDivider} />

        {/* Action Buttons */}
        <View style={styles.postActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.6}
            onPress={() => toggleLike(item.id)}
          >
            <Ionicons
              name={item.liked ? 'heart' : 'heart-outline'}
              size={20}
              color={item.liked ? Colors.severityCritical : Colors.grey}
            />
            <Text style={[styles.actionText, item.liked && { color: Colors.severityCritical }]}>
              Like
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.6}>
            <Ionicons name="chatbubble-outline" size={19} color={Colors.grey} />
            <Text style={styles.actionText}>Comment</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.6}>
            <Ionicons name="share-social-outline" size={20} color={Colors.grey} />
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.6}>
            <Ionicons name="bookmark-outline" size={19} color={Colors.grey} />
            <Text style={styles.actionText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* ========== TOP HEADER ========== */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderLeft}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>U</Text>
          </View>
          <View>
            <Text style={styles.greeting}>Good afternoon,</Text>
            <Text style={styles.userName}>User</Text>
          </View>
        </View>
        <View style={styles.topHeaderRight}>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
            <Ionicons name="search-outline" size={22} color={Colors.heading} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
            <View>
              <Ionicons name="notifications-outline" size={22} color={Colors.heading} />
              <View style={styles.notifDot} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* ========== TAB NAVIGATION ========== */}
      <View style={styles.tabWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                activeOpacity={0.7}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={active ? Colors.white : Colors.grey}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ========== SEARCH BAR ========== */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.greyLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search posts, incidents, alerts..."
            placeholderTextColor={Colors.greyLight}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.greyLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ========== POST COMPOSER ========== */}
      <View style={styles.composerSection}>
        <View style={styles.composer}>
          <View style={[styles.composerAvatar, { backgroundColor: Colors.primary }]}>
            <Text style={styles.composerAvatarText}>U</Text>
          </View>
          <TouchableOpacity
            style={styles.composerInput}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ReportIncident')}
          >
            <Text style={styles.composerPlaceholder}>What's on your mind? Report an incident...</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.composerMediaBtn} activeOpacity={0.7}>
            <Ionicons name="camera-outline" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.composerActions}>
          <TouchableOpacity style={styles.composerAction} activeOpacity={0.7}>
            <Ionicons name="image-outline" size={18} color={Colors.accent} />
            <Text style={styles.composerActionText}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.composerAction} activeOpacity={0.7}>
            <Ionicons name="location-outline" size={18} color={Colors.secondary} />
            <Text style={styles.composerActionText}>Location</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.composerAction} activeOpacity={0.7}>
            <Ionicons name="warning-outline" size={18} color={Colors.severityHigh} />
            <Text style={styles.composerActionText}>Alert</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ========== LIVE INDICATOR ========== */}
      <View style={styles.liveBar}>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live Feed</Text>
        </View>
        <Text style={styles.postCount}>{filteredPosts.length} posts</Text>
      </View>

      {/* ========== FEED ========== */}
      <FlatList
        data={filteredPosts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.feedContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="newspaper-outline" size={48} color={Colors.greyLight} />
            <Text style={styles.emptyTitle}>No posts found</Text>
            <Text style={styles.emptySubtitle}>Try adjusting your search terms</Text>
          </View>
        }
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  STYLES                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  /* ---------- Top Header ---------- */
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 58 : 44,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  userAvatarText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  greeting: {
    color: Colors.subtext,
    fontSize: 12,
  },
  userName: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.severityCritical,
    borderWidth: 1.5,
    borderColor: Colors.bg,
  },

  /* ---------- Tabs ---------- */
  tabWrapper: {
    backgroundColor: Colors.white,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tabScroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabLabel: {
    color: Colors.grey,
    fontSize: 13,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: Colors.white,
  },

  /* ---------- Search ---------- */
  searchSection: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
    backgroundColor: Colors.bg,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: Colors.heading,
    fontSize: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },

  /* ---------- Composer ---------- */
  composerSection: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  composerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  composerAvatarText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  composerInput: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  composerPlaceholder: {
    color: Colors.greyLight,
    fontSize: 13,
  },
  composerMediaBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  composerActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  composerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  composerActionText: {
    color: Colors.subtext,
    fontSize: 12,
    fontWeight: '600',
  },

  /* ---------- Live Bar ---------- */
  liveBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.bg,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  liveText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  postCount: {
    color: Colors.subtext,
    fontSize: 12,
  },

  /* ---------- Post Card ---------- */
  feedContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  postCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    elevation: 2,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  postAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  authorInfo: {
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  authorName: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  verifiedBadge: {
    marginLeft: 2,
  },
  authorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  authorRole: {
    color: Colors.subtext,
    fontSize: 11,
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.greyLight,
  },
  postTime: {
    color: Colors.greyLight,
    fontSize: 11,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  postTitle: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginBottom: 8,
  },
  postBody: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  locationText: {
    color: Colors.grey,
    fontSize: 12,
  },

  /* Image placeholder */
  imagePlaceholder: {
    backgroundColor: Colors.bg,
    borderRadius: 12,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  imagePlaceholderText: {
    color: Colors.greyLight,
    fontSize: 12,
    marginTop: 6,
  },

  /* Engagement */
  engagementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  engagementText: {
    color: Colors.subtext,
    fontSize: 12,
  },
  postDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 10,
  },

  /* Actions */
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionText: {
    color: Colors.grey,
    fontSize: 12,
    fontWeight: '600',
  },

  /* ---------- Empty State ---------- */
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtitle: {
    color: Colors.subtext,
    fontSize: 13,
    marginTop: 4,
  },
});
