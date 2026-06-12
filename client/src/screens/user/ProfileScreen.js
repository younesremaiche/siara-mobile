import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../../contexts/AuthContext';
import { Colors } from '../../theme/colors';
import { loadDriverQuizState } from '../../services/driverQuizStorage';
import DriverQuizModal from '../../components/quiz/DriverQuizModal';
import PhotoViewer from '../../components/ui/PhotoViewer';
import useMyAlerts from '../../hooks/useMyAlerts';
import { useMyReports } from '../../features/reports/hooks/useReportQueries';
import { useFocusRefresh } from '../../services/query/useFocusRefresh';

const { width } = Dimensions.get('window');

const MENU_ITEMS = [
  { key: 'editProfile', icon: 'person-outline', label: 'Edit Profile', chevron: true, color: Colors.primary },
  { key: 'notifications', icon: 'notifications-outline', label: 'Notification Preferences', chevron: true, color: Colors.secondary },
  { key: 'privacy', icon: 'lock-closed-outline', label: 'Privacy & Security', chevron: true, color: Colors.accent },
  { key: 'help', icon: 'help-circle-outline', label: 'Help & Support', chevron: true, color: Colors.warning },
];

const SEVERITY_COLORS = {
  critical: Colors.severityCritical || Colors.error,
  high:     Colors.severityHigh     || Colors.error,
  medium:   Colors.severityMedium   || Colors.warning,
  low:      Colors.severityLow      || Colors.accent,
};

function getSeverityColor(severity) {
  return SEVERITY_COLORS[String(severity || '').toLowerCase()] || Colors.greyLight;
}

export default function ProfileScreen({ navigation }) {
  const { user, setUser, logout, isPolice, activeMode, switchToPoliceMode } = useContext(AuthContext);

  // Activity tabs (Alerts / Reports)
  const [activityTab, setActivityTab] = useState('alerts');
  const { alerts: myAlerts, isLoading: alertsLoading, refresh: refreshAlerts } = useMyAlerts();

  // Reports via the shared cache (same source/limit as MyReportsScreen) so the
  // count matches across screens and a new report invalidates this list too.
  const reportsQuery = useMyReports(user?.id, { limit: 100, sort: 'recent' });
  const myReports = Array.isArray(reportsQuery.data?.reports) ? reportsQuery.data.reports : [];
  const reportsLoading = reportsQuery.isLoading;
  useFocusRefresh(reportsQuery.refetch, Boolean(user?.id));

  useFocusEffect(useCallback(() => { refreshAlerts(); }, [refreshAlerts]));

  // Real profile stats (was hardcoded 124 / 47 / 92%).
  const trustScoreRaw = Number(user?.trustScore ?? user?.trust_score);
  const trustScoreValue = Number.isFinite(trustScoreRaw) ? `${Math.round(trustScoreRaw)}%` : '—';
  const stats = [
    { value: reportsLoading ? '—' : String(myReports.length), label: 'Reports', icon: 'flag', color: Colors.primary },
    { value: alertsLoading ? '—' : String(myAlerts.length), label: 'Alerts', icon: 'notifications', color: Colors.secondary },
    { value: trustScoreValue, label: 'Trust Score', icon: 'shield-checkmark', color: Colors.accent },
  ];

  const [editVisible, setEditVisible] = useState(false);
  const [quizSummary, setQuizSummary] = useState({
    completed: false,
    result: null,
  });

  // ── Edit form state ──
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);

  const initials = (user?.name || 'User')
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const showPoliceModeSwitch = isPolice && activeMode !== 'police';
  const roleIconName = user?.role === 'admin' ? 'shield' : isPolice ? 'shield-checkmark' : 'person';
  const roleLabel = user?.role === 'admin'
    ? 'Administrator'
    : isPolice
      ? 'Police & Community Member'
      : 'Community Member';

  function openEditProfile() {
    setEditName(user?.name || '');
    setEditEmail(user?.email || '');
    setEditPhone(user?.phone || '');
    setEditLocation(user?.location || '');
    setEditBio(user?.bio || '');
    setEditAvatar(user?.avatarUri || user?.avatar_url || '');
    setEditVisible(true);
  }

  async function pickAvatar() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Please allow access to your photos to set a profile picture.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setEditAvatar(result.assets[0].uri);
      }
    } catch (error) {
      console.warn('[ProfileScreen] pickAvatar failed:', error?.message || error);
      Alert.alert('Error', 'Could not open the image picker.');
    }
  }

  function removeAvatar() {
    setEditAvatar('');
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
      avatarUri: editAvatar || null,
    };
    setUser(updated);
    setEditVisible(false);
  }

  function handleLogout() {
    // Clear auth store - AppNavigator will automatically switch to PublicStack
    logout();
  }

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      (async () => {
        try {
          const storedState = await loadDriverQuizState();
          if (!isActive) {
            return;
          }

          setQuizSummary({
            completed: storedState.completed,
            result: storedState.result,
          });
        } catch (error) {
          if (isActive) {
            console.warn('[ProfileScreen] failed to load quiz summary', error?.message || error);
          }
        }
      })();

      return () => {
        isActive = false;
      };
    }, []),
  );

  // Quiz opens as an overlay right here (no detour through the Predictions tab).
  const [quizVisible, setQuizVisible] = useState(false);
  const refreshQuizSummary = useCallback(async () => {
    try {
      const storedState = await loadDriverQuizState();
      setQuizSummary({ completed: storedState.completed, result: storedState.result });
    } catch (error) {
      console.warn('[ProfileScreen] failed to refresh quiz summary', error?.message || error);
    }
  }, []);

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={Colors.btnPrimary} />
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
              {user?.avatarUri || user?.avatar_url ? (
                <Image
                  source={{ uri: user.avatarUri || user.avatar_url }}
                  style={styles.avatarImage}
                />
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}
            </View>
          </View>
          <Text style={styles.name}>{user?.name || 'User'}</Text>
          <Text style={styles.email}>{user?.email || 'user@siara.dz'}</Text>
          <View style={styles.roleBadge}>
            <Ionicons
              name={roleIconName}
              size={12}
              color={Colors.primary}
            />
            <Text style={styles.roleText}>
              {roleLabel}
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

      {/* Return to Police mode — only when a police officer is currently in user view */}
      {isPolice && activeMode === 'user' ? (
        <TouchableOpacity style={styles.policeBanner} activeOpacity={0.85} onPress={switchToPoliceMode}>
          <LinearGradient
            colors={['#0D1B2A', '#1A3251', '#1E4976']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.policeBannerGrad}
          >
            <View style={styles.policeBannerIcon}>
              <Ionicons name="shield-checkmark" size={18} color="#93C5FD" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.policeBannerTitle}>You're viewing as a citizen</Text>
              <Text style={styles.policeBannerSub}>Tap to return to Police mode</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(147,197,253,0.7)" />
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      {/* Stats row */}
      <View style={styles.statsRow}>
        {stats.map((s) => (
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

      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.quizLaunchCard}
        onPress={() => setQuizVisible(true)}
      >
        <View style={styles.quizLaunchIconWrap}>
          <Ionicons name="clipboard-outline" size={22} color={Colors.primary} />
        </View>
        <View style={styles.quizLaunchCopy}>
          <View style={styles.quizLaunchLabelRow}>
            <Text style={styles.quizLaunchTitle}>
              {quizSummary.completed ? 'Retake Driver Quiz' : 'Start Driver Quiz'}
            </Text>
            {quizSummary.completed ? (
              <View style={styles.quizLaunchBadge}>
                <Text style={styles.quizLaunchBadgeText}>Quiz completed</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.quizLaunchSubtitle}>
            Take the driving profile assessment
          </Text>
          {quizSummary?.result?.risk_label ? (
            <Text style={styles.quizLaunchMeta}>
              Latest result: {quizSummary.result.risk_label}
            </Text>
          ) : (
            <Text style={styles.quizLaunchMeta}>
              Opens the full assessment immediately from your Predictions tab
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.greyLight} />
      </TouchableOpacity>

      {/* Activity (Alerts / Reports) */}
      <View style={styles.activityCard}>
        <View style={styles.activityHeader}>
          <View style={[styles.sectionIconWrap, { backgroundColor: Colors.violetLight }]}>
            <Ionicons name="pulse" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>My Activity</Text>
            <Text style={styles.sectionSubtitle}>Your alerts and reports</Text>
          </View>
        </View>

        <View style={styles.activityTabs}>
          <TouchableOpacity
            style={[styles.activityTab, activityTab === 'alerts' && styles.activityTabActive]}
            onPress={() => setActivityTab('alerts')}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications" size={15} color={activityTab === 'alerts' ? Colors.primary : Colors.subtext} />
            <Text style={[styles.activityTabText, activityTab === 'alerts' && styles.activityTabTextActive]}>Alerts</Text>
            <View style={[styles.activityTabBadge, activityTab === 'alerts' && styles.activityTabBadgeActive]}>
              <Text style={[styles.activityTabBadgeText, activityTab === 'alerts' && styles.activityTabBadgeTextActive]}>
                {myAlerts.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.activityTab, activityTab === 'reports' && styles.activityTabActive]}
            onPress={() => setActivityTab('reports')}
            activeOpacity={0.7}
          >
            <Ionicons name="megaphone" size={15} color={activityTab === 'reports' ? Colors.primary : Colors.subtext} />
            <Text style={[styles.activityTabText, activityTab === 'reports' && styles.activityTabTextActive]}>Reports</Text>
            <View style={[styles.activityTabBadge, activityTab === 'reports' && styles.activityTabBadgeActive]}>
              <Text style={[styles.activityTabBadgeText, activityTab === 'reports' && styles.activityTabBadgeTextActive]}>
                {myReports.length}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {activityTab === 'alerts' ? (
          alertsLoading ? (
            <View style={styles.activityLoading}><ActivityIndicator color={Colors.primary} /></View>
          ) : myAlerts.length === 0 ? (
            <View style={styles.activityEmpty}>
              <Ionicons name="notifications-off-outline" size={28} color={Colors.greyLight} />
              <Text style={styles.activityEmptyText}>No alerts yet</Text>
              <TouchableOpacity onPress={() => navigation.navigate('CreateAlert')} activeOpacity={0.7}>
                <Text style={styles.activityEmptyAction}>Create your first alert</Text>
              </TouchableOpacity>
            </View>
          ) : (
            myAlerts.slice(0, 5).map((a) => (
              <TouchableOpacity
                key={a.id}
                style={styles.activityItem}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('Alerts')}
              >
                <View style={styles.activityItemRow}>
                  <Text style={styles.activityItemTitle} numberOfLines={1}>{a.name}</Text>
                  <View style={[styles.severityPill, { backgroundColor: `${getSeverityColor(a.severity)}1A` }]}>
                    <Text style={[styles.severityPillText, { color: getSeverityColor(a.severity) }]}>
                      {String(a.severity || 'low').toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.activityItemMeta}>
                  {a.area?.label || a.zone?.label ? (
                    <View style={styles.activityMetaItem}>
                      <Ionicons name="location" size={12} color={Colors.subtext} />
                      <Text style={styles.activityMetaText} numberOfLines={1}>
                        {a.area?.label || a.zone?.label}
                      </Text>
                    </View>
                  ) : null}
                  {a.lastTriggered ? (
                    <View style={styles.activityMetaItem}>
                      <Ionicons name="time-outline" size={12} color={Colors.subtext} />
                      <Text style={styles.activityMetaText}>Last: {a.lastTriggered}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.statusPill, a.status === 'active' ? styles.statusPillActive : styles.statusPillPaused]}>
                    <Text style={[styles.statusPillText, a.status === 'active' ? styles.statusPillActiveText : styles.statusPillPausedText]}>
                      {a.status?.toUpperCase() || 'ACTIVE'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )
        ) : reportsLoading ? (
          <View style={styles.activityLoading}><ActivityIndicator color={Colors.primary} /></View>
        ) : myReports.length === 0 ? (
          <View style={styles.activityEmpty}>
            <Ionicons name="document-outline" size={28} color={Colors.greyLight} />
            <Text style={styles.activityEmptyText}>No reports yet</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ReportIncident')} activeOpacity={0.7}>
              <Text style={styles.activityEmptyAction}>Submit a report</Text>
            </TouchableOpacity>
          </View>
        ) : (
          myReports.slice(0, 5).map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.activityItem}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('IncidentDetail', { reportId: r.id })}
            >
              <View style={styles.activityItemRow}>
                <Text style={styles.activityItemTitle} numberOfLines={1}>{r.title}</Text>
                <View style={[styles.severityPill, { backgroundColor: `${getSeverityColor(r.severity)}1A` }]}>
                  <Text style={[styles.severityPillText, { color: getSeverityColor(r.severity) }]}>
                    {String(r.severity || 'low').toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.activityItemMeta}>
                {r.locationLabel ? (
                  <View style={styles.activityMetaItem}>
                    <Ionicons name="location" size={12} color={Colors.subtext} />
                    <Text style={styles.activityMetaText} numberOfLines={1}>{r.locationLabel}</Text>
                  </View>
                ) : null}
                {r.relativeTime ? (
                  <View style={styles.activityMetaItem}>
                    <Ionicons name="time-outline" size={12} color={Colors.subtext} />
                    <Text style={styles.activityMetaText}>{r.relativeTime}</Text>
                  </View>
                ) : null}
                <View style={[styles.statusPill, r.status === 'verified' ? styles.statusPillActive : styles.statusPillPaused]}>
                  <Text style={[styles.statusPillText, r.status === 'verified' ? styles.statusPillActiveText : styles.statusPillPausedText]}>
                    {r.status?.toUpperCase() || 'PENDING'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

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
            {/* Grab handle */}
            <View style={styles.editHandle} />

            {/* Header */}
            <View style={styles.editHeader}>
              <TouchableOpacity style={styles.editCloseBtn} onPress={() => setEditVisible(false)} activeOpacity={0.8}>
                <Ionicons name="close" size={20} color={Colors.heading} />
              </TouchableOpacity>
              <Text style={styles.editTitle}>Edit Profile</Text>
              <TouchableOpacity style={styles.editSaveBtn} onPress={saveProfile} activeOpacity={0.85}>
                <Ionicons name="checkmark" size={15} color={Colors.white} />
                <Text style={styles.editSaveText}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.editBody}>
              {/* Avatar preview + photo picker */}
              <View style={styles.editAvatarRow}>
                <TouchableOpacity
                  onPress={() => (editAvatar ? setAvatarViewerVisible(true) : pickAvatar())}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[Colors.gradientFrom, Colors.gradientTo]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.editAvatarRing}
                  >
                    <View style={styles.editAvatarCircle}>
                      {editAvatar ? (
                        <Image source={{ uri: editAvatar }} style={styles.editAvatarImage} />
                      ) : (
                        <Text style={styles.editAvatarText}>
                          {(editName || 'U').split(' ').map((n) => n.charAt(0)).join('').toUpperCase().slice(0, 2)}
                        </Text>
                      )}
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                <View style={styles.editAvatarActions}>
                  <TouchableOpacity style={styles.editAvatarChip} onPress={pickAvatar} activeOpacity={0.8}>
                    <Ionicons name="image-outline" size={14} color={Colors.primary} />
                    <Text style={styles.editAvatarActionText}>
                      {editAvatar ? 'Change photo' : 'Add photo'}
                    </Text>
                  </TouchableOpacity>
                  {editAvatar ? (
                    <TouchableOpacity style={styles.editAvatarChipDanger} onPress={removeAvatar} activeOpacity={0.8}>
                      <Ionicons name="trash-outline" size={14} color={Colors.error} />
                      <Text style={styles.editAvatarRemoveText}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
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

          {/* Tap the avatar to view it full-screen */}
          <PhotoViewer
            visible={avatarViewerVisible}
            images={editAvatar ? [{ id: 'avatar', url: editAvatar }] : []}
            onClose={() => setAvatarViewerVisible(false)}
          />
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.bottomSpacer} />
    </ScrollView>

    <DriverQuizModal
      visible={quizVisible}
      forceShow
      onClose={() => setQuizVisible(false)}
      onComplete={() => { refreshQuizSummary(); setQuizVisible(false); }}
    />
    </>
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
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
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

  /* Police banner */
  policeBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  policeBannerGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  policeBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(147,197,253,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  policeBannerTitle: { color: '#F1F5F9', fontSize: 13, fontWeight: '800' },
  policeBannerSub: { color: 'rgba(241,245,249,0.55)', fontSize: 11, marginTop: 2 },

  /* Stats */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 4,
  },
  modeSwitchCard: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0D1B2A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  modeSwitchGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  modeSwitchIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: 'rgba(147,197,253,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeSwitchCopy: {
    flex: 1,
  },
  modeSwitchTitle: {
    color: '#F1F5F9',
    fontSize: 15,
    fontWeight: '800',
  },
  modeSwitchSubtitle: {
    color: 'rgba(241,245,249,0.55)',
    fontSize: 12,
    lineHeight: 18,
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

  /* Driver Quiz launch */
  quizLaunchCard: {
    marginHorizontal: 20,
    marginTop: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  quizLaunchIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quizLaunchCopy: {
    flex: 1,
  },
  quizLaunchLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  quizLaunchTitle: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  quizLaunchSubtitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  quizLaunchMeta: {
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  quizLaunchBadge: {
    backgroundColor: Colors.blueLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  quizLaunchBadgeText: {
    color: Colors.secondary,
    fontSize: 11,
    fontWeight: '700',
  },

  /* Activity (Alerts / Reports) */
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: { color: Colors.heading, fontSize: 14, fontWeight: '700' },
  sectionSubtitle: { color: Colors.subtext, fontSize: 12, marginTop: 2 },
  activityCard: {
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
  activityHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  activityTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.bg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  activityTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  activityTabActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  activityTabText: { color: Colors.subtext, fontSize: 13, fontWeight: '600' },
  activityTabTextActive: { color: Colors.primary },
  activityTabBadge: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityTabBadgeActive: { backgroundColor: Colors.violetLight },
  activityTabBadgeText: { color: Colors.subtext, fontSize: 10, fontWeight: '700' },
  activityTabBadgeTextActive: { color: Colors.primary },
  activityLoading: { paddingVertical: 28, alignItems: 'center' },
  activityEmpty: { paddingVertical: 24, alignItems: 'center', gap: 6 },
  activityEmptyText: { color: Colors.subtext, fontSize: 13, fontWeight: '600' },
  activityEmptyAction: { color: Colors.primary, fontSize: 13, fontWeight: '700', marginTop: 4 },
  activityItem: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  activityItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  activityItemTitle: { flex: 1, color: Colors.heading, fontSize: 14, fontWeight: '700' },
  activityItemMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  activityMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '60%' },
  activityMetaText: { color: Colors.subtext, fontSize: 12 },
  severityPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  severityPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 'auto' },
  statusPillActive: { backgroundColor: 'rgba(15,169,88,0.12)' },
  statusPillPaused: { backgroundColor: Colors.bg },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  statusPillActiveText: { color: Colors.accent },
  statusPillPausedText: { color: Colors.subtext },

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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  editHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
    marginTop: 10,
    marginBottom: 2,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  editCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.heading,
  },
  editSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  editSaveText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.white,
  },
  editBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  editAvatarRow: {
    alignItems: 'center',
    marginBottom: 22,
  },
  editAvatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarCircle: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.white,
  },
  editAvatarImage: {
    width: '100%',
    height: '100%',
  },
  editAvatarText: {
    color: Colors.primary,
    fontSize: 32,
    fontWeight: '800',
  },
  editAvatarActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  editAvatarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  editAvatarChipDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.2)',
  },
  editAvatarActionText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  editAvatarRemoveText: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '700',
  },
  editLabel: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 16,
  },
  editInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    height: 52,
  },
  editInputIcon: {
    marginLeft: 14,
    marginRight: 4,
  },
  editInput: {
    flex: 1,
    height: 50,
    fontSize: 15,
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
