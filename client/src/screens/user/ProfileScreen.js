import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { Colors } from '../../theme/colors';

const { width } = Dimensions.get('window');

const STATS = [
  { value: '124', label: 'Reports', icon: 'flag', color: Colors.primary },
  { value: '47', label: 'Alerts', icon: 'notifications', color: Colors.secondary },
  { value: '92%', label: 'Trust Score', icon: 'shield-checkmark', color: Colors.accent },
];

const MENU_ITEMS = [
  { key: 'editProfile', icon: 'person-outline', label: 'Edit Profile', chevron: true, color: Colors.primary },
  { key: 'notifications', icon: 'notifications-outline', label: 'Notification Preferences', chevron: true, color: Colors.secondary },
  { key: 'privacy', icon: 'lock-closed-outline', label: 'Privacy & Security', chevron: true, color: Colors.accent },
  { key: 'help', icon: 'help-circle-outline', label: 'Help & Support', chevron: true, color: Colors.warning },
];

const BADGES = [
  { name: 'First Report', icon: 'ribbon' },
  { name: 'Verified Reporter', icon: 'shield-checkmark' },
  { name: 'Community Hero', icon: 'people' },
  { name: '100 Reports', icon: 'trophy' },
  { name: 'AI Contributor', icon: 'analytics' },
  { name: 'Safety Champion', icon: 'heart' },
];

export default function ProfileScreen({ navigation }) {
  const { user, setUser, logout } = useContext(AuthContext);
  const [showBadges, setShowBadges] = useState(false);
  const [editVisible, setEditVisible] = useState(false);

  // ── Edit form state ──
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBio, setEditBio] = useState('');

  const initials = (user?.name || 'User')
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  function openEditProfile() {
    setEditName(user?.name || '');
    setEditEmail(user?.email || '');
    setEditPhone(user?.phone || '');
    setEditLocation(user?.location || '');
    setEditBio(user?.bio || '');
    setEditVisible(true);
  }

  function saveProfile() {
    if (!editName.trim()) {
      Alert.alert('Validation', 'Name cannot be empty.');
      return;
    }
    if (!editEmail.trim() || !/\S+@\S+\.\S+/.test(editEmail.trim())) {
      Alert.alert('Validation', 'Please enter a valid email address.');
      return;
    }
    const updated = {
      ...user,
      name: editName.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim(),
      location: editLocation.trim(),
      bio: editBio.trim(),
    };
    setUser(updated);
    setEditVisible(false);
  }

  function handleLogout() {
    logout();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={styles.headerBg} />
        <View style={styles.avatarSection}>
          <View style={styles.avatarOuter}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.name}>{user?.name || 'User'}</Text>
          <Text style={styles.email}>{user?.email || 'user@siara.dz'}</Text>
          <View style={styles.roleBadge}>
            <Ionicons
              name={user?.role === 'admin' ? 'shield' : 'person'}
              size={12}
              color={Colors.primary}
            />
            <Text style={styles.roleText}>
              {user?.role === 'admin' ? 'Administrator' : 'Community Member'}
            </Text>
          </View>

          {/* Extra profile info */}
          {(user?.phone || user?.location || user?.bio) && (
            <View style={styles.profileInfoRow}>
              {!!user?.phone && (
                <View style={styles.profileInfoItem}>
                  <Ionicons name="call-outline" size={13} color={Colors.subtext} />
                  <Text style={styles.profileInfoText}>{user.phone}</Text>
                </View>
              )}
              {!!user?.location && (
                <View style={styles.profileInfoItem}>
                  <Ionicons name="location-outline" size={13} color={Colors.subtext} />
                  <Text style={styles.profileInfoText}>{user.location}</Text>
                </View>
              )}
              {!!user?.bio && (
                <Text style={styles.profileBioText}>{user.bio}</Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        {STATS.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: `${s.color}14` }]}>
              <Ionicons name={s.icon} size={18} color={s.color} />
            </View>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Profile Completion */}
      <View style={styles.completionCard}>
        <View style={styles.completionHeader}>
          <Text style={styles.completionTitle}>Profile Completion</Text>
          <Text style={styles.completionPct}>65%</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: '65%' }]} />
        </View>
        <Text style={styles.completionHint}>
          Complete your profile to unlock all features
        </Text>
      </View>

      {/* Badges section */}
      <TouchableOpacity
        style={styles.badgesHeader}
        onPress={() => setShowBadges(!showBadges)}
        activeOpacity={0.7}
      >
        <View style={styles.badgesHeaderLeft}>
          <View style={[styles.sectionIconWrap, { backgroundColor: Colors.violetLight }]}>
            <Ionicons name="trophy" size={18} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Badges & Achievements</Text>
            <Text style={styles.sectionSubtitle}>{BADGES.length} badges earned</Text>
          </View>
        </View>
        <Ionicons
          name={showBadges ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.subtext}
        />
      </TouchableOpacity>

      {showBadges && (
        <View style={styles.badgesGrid}>
          {BADGES.map((b) => (
            <View key={b.name} style={styles.badgeCard}>
              <View style={styles.badgeIconWrap}>
                <Ionicons name={b.icon} size={24} color={Colors.primary} />
              </View>
              <Text style={styles.badgeName}>{b.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Settings menu */}
      <View style={styles.menuCard}>
        <Text style={styles.menuTitle}>Settings</Text>
        {MENU_ITEMS.map((item, index) => (
          <TouchableOpacity
            key={item.key}
            style={[
              styles.menuItem,
              index < MENU_ITEMS.length - 1 && styles.menuItemBorder,
            ]}
            onPress={() => {
              if (item.key === 'editProfile') openEditProfile();
              if (item.key === 'notifications') navigation.navigate('Settings');
              if (item.key === 'privacy') navigation.navigate('Settings');
              if (item.key === 'help') navigation.navigate('Contact');
            }}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: `${item.color}14` }]}>
              <Ionicons name={item.icon} size={20} color={item.color} />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            {item.chevron && (
              <Ionicons name="chevron-forward" size={18} color={Colors.greyLight} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Safety Score */}
      <View style={styles.safetyCard}>
        <View style={styles.safetyHeader}>
          <Text style={styles.safetyTitle}>Safety Score</Text>
          <View style={styles.safetyBadge}>
            <Text style={styles.safetyBadgeText}>Good</Text>
          </View>
        </View>
        <View style={styles.safetyScoreRow}>
          <View style={styles.safetyCircle}>
            <Text style={styles.safetyValue}>78</Text>
            <Text style={styles.safetyMax}>/100</Text>
          </View>
          <View style={styles.safetyDetails}>
            <View style={styles.safetyDetailRow}>
              <Text style={styles.safetyDetailLabel}>Accuracy</Text>
              <View style={styles.safetyDetailBar}>
                <View style={[styles.safetyDetailFill, { width: '85%', backgroundColor: Colors.accent }]} />
              </View>
            </View>
            <View style={styles.safetyDetailRow}>
              <Text style={styles.safetyDetailLabel}>Activity</Text>
              <View style={styles.safetyDetailBar}>
                <View style={[styles.safetyDetailFill, { width: '72%', backgroundColor: Colors.secondary }]} />
              </View>
            </View>
            <View style={styles.safetyDetailRow}>
              <Text style={styles.safetyDetailLabel}>Community</Text>
              <View style={styles.safetyDetailBar}>
                <View style={[styles.safetyDetailFill, { width: '68%', backgroundColor: Colors.primary }]} />
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={Colors.btnDanger} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      {/* ════════ Edit Profile Modal ════════ */}
      <Modal visible={editVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.editOverlay}
        >
          <View style={styles.editSheet}>
            {/* Header */}
            <View style={styles.editHeader}>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.subtext} />
              </TouchableOpacity>
              <Text style={styles.editTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={saveProfile}>
                <Text style={styles.editSaveText}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.editBody}>
              {/* Avatar preview */}
              <View style={styles.editAvatarRow}>
                <View style={styles.editAvatarCircle}>
                  <Text style={styles.editAvatarText}>
                    {(editName || 'U').split(' ').map((n) => n.charAt(0)).join('').toUpperCase().slice(0, 2)}
                  </Text>
                </View>
              </View>

              {/* Fields */}
              <Text style={styles.editLabel}>Full Name</Text>
              <View style={styles.editInputWrap}>
                <Ionicons name="person-outline" size={18} color={Colors.grey} style={styles.editInputIcon} />
                <TextInput
                  style={styles.editInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Your full name"
                  placeholderTextColor={Colors.grey}
                />
              </View>

              <Text style={styles.editLabel}>Email</Text>
              <View style={styles.editInputWrap}>
                <Ionicons name="mail-outline" size={18} color={Colors.grey} style={styles.editInputIcon} />
                <TextInput
                  style={styles.editInput}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="email@example.com"
                  placeholderTextColor={Colors.grey}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.editLabel}>Phone</Text>
              <View style={styles.editInputWrap}>
                <Ionicons name="call-outline" size={18} color={Colors.grey} style={styles.editInputIcon} />
                <TextInput
                  style={styles.editInput}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="+213 555 123 456"
                  placeholderTextColor={Colors.grey}
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={styles.editLabel}>Location</Text>
              <View style={styles.editInputWrap}>
                <Ionicons name="location-outline" size={18} color={Colors.grey} style={styles.editInputIcon} />
                <TextInput
                  style={styles.editInput}
                  value={editLocation}
                  onChangeText={setEditLocation}
                  placeholder="City, Country"
                  placeholderTextColor={Colors.grey}
                />
              </View>

              <Text style={styles.editLabel}>Bio</Text>
              <View style={[styles.editInputWrap, { height: 90, alignItems: 'flex-start' }]}>
                <Ionicons name="document-text-outline" size={18} color={Colors.grey} style={[styles.editInputIcon, { marginTop: 12 }]} />
                <TextInput
                  style={[styles.editInput, { height: 80, textAlignVertical: 'top' }]}
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="Tell us a bit about yourself..."
                  placeholderTextColor={Colors.grey}
                  multiline
                  maxLength={200}
                />
              </View>
              <Text style={styles.editCharCount}>{editBio.length}/200</Text>

              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    paddingBottom: 40,
  },

  /* Profile header */
  profileHeader: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  headerBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: Colors.btnPrimary,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  avatarSection: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 70 : 58,
  },
  avatarOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 14,
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.primary,
    fontSize: 32,
    fontWeight: '800',
  },
  name: {
    color: Colors.heading,
    fontSize: 22,
    fontWeight: '800',
  },
  email: {
    color: Colors.subtext,
    fontSize: 13,
    marginTop: 4,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  roleText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },

  /* Stats */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 4,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    gap: 6,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    color: Colors.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: Colors.subtext,
    fontSize: 11,
    fontWeight: '500',
  },

  /* Profile Completion */
  completionCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  completionTitle: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '600',
  },
  completionPct: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.bg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: Colors.btnPrimary,
    borderRadius: 4,
  },
  completionHint: {
    color: Colors.subtext,
    fontSize: 12,
    marginTop: 8,
  },

  /* Badges section */
  badgesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  badgesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: Colors.subtext,
    fontSize: 12,
    marginTop: 2,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  badgeCard: {
    width: (width - 60) / 3,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  badgeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeName: {
    color: Colors.text,
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '500',
  },

  /* Settings menu */
  menuCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  menuTitle: {
    color: Colors.heading,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: {
    flex: 1,
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '500',
  },

  /* Safety Score */
  safetyCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  safetyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  safetyTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  safetyBadge: {
    backgroundColor: 'rgba(15,169,88,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  safetyBadgeText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  safetyScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  safetyCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  safetyValue: {
    color: Colors.accent,
    fontSize: 28,
    fontWeight: '900',
  },
  safetyMax: {
    color: Colors.subtext,
    fontSize: 11,
    marginTop: -4,
  },
  safetyDetails: {
    flex: 1,
    gap: 10,
  },
  safetyDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  safetyDetailLabel: {
    color: Colors.subtext,
    fontSize: 11,
    fontWeight: '500',
    width: 65,
  },
  safetyDetailBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.bg,
    borderRadius: 3,
    overflow: 'hidden',
  },
  safetyDetailFill: {
    height: 6,
    borderRadius: 3,
  },

  /* Logout */
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.2)',
  },
  logoutText: {
    color: Colors.btnDanger,
    fontSize: 15,
    fontWeight: '600',
  },

  bottomSpacer: {
    height: 20,
  },

  /* Extra profile info */
  profileInfoRow: {
    marginTop: 10,
    alignItems: 'center',
    gap: 4,
  },
  profileInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  profileInfoText: {
    color: Colors.subtext,
    fontSize: 12,
  },
  profileBioText: {
    color: Colors.text,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 30,
    lineHeight: 18,
  },

  /* Edit Profile Modal */
  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  editSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  editTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.heading,
  },
  editSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
  },
  editBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  editAvatarRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  editAvatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarText: {
    color: Colors.primary,
    fontSize: 28,
    fontWeight: '800',
  },
  editLabel: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 14,
  },
  editInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 48,
  },
  editInputIcon: {
    marginLeft: 14,
    marginRight: 4,
  },
  editInput: {
    flex: 1,
    height: 48,
    fontSize: 14,
    color: Colors.text,
    paddingHorizontal: 8,
  },
  editCharCount: {
    textAlign: 'right',
    color: Colors.subtext,
    fontSize: 11,
    marginTop: 4,
  },
});
