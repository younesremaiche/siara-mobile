import React, { useState, useContext, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  StyleSheet,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationsContext';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';
import {
  startSiaraLiveRiskNotification,
  stopSiaraLiveRiskNotification,
  isSiaraRiskNotificationEnabled,
  subscribeLiveRiskStatus,
  LIVE_RISK_STATUS,
} from '../../services/siaraRiskNotificationService';

function LiveRiskStatusPill({ status, busy }) {
  const map = {
    [LIVE_RISK_STATUS.ACTIVE]: {
      label: 'Active — monitoring road risk',
      bg: 'rgba(34,197,94,0.10)',
      border: 'rgba(34,197,94,0.25)',
      color: '#15803d',
      icon: 'pulse',
    },
    [LIVE_RISK_STATUS.WAITING]: {
      label: busy ? 'Starting…' : 'Waiting for live data',
      bg: Colors.violetLight,
      border: Colors.violetBorder,
      color: Colors.primary,
      icon: 'sync',
    },
    [LIVE_RISK_STATUS.PERMREQ]: {
      label: 'Permissions required',
      bg: 'rgba(244,162,97,0.12)',
      border: 'rgba(244,162,97,0.40)',
      color: '#b45309',
      icon: 'warning-outline',
    },
    [LIVE_RISK_STATUS.DISABLED]: {
      label: 'Disabled',
      bg: '#F1F5F9',
      border: Colors.border,
      color: Colors.subtext,
      icon: 'pause-circle-outline',
    },
  };
  const cfg = map[status] || map[LIVE_RISK_STATUS.DISABLED];
  return (
    <View style={[styles.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Ionicons name={cfg.icon} size={14} color={cfg.color} />
      <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

const SECTIONS = [
  {
    title: 'Notifications',
    icon: 'notifications',
    color: Colors.primary,
    bg: Colors.violetLight,
    items: [
      { key: 'push', icon: 'phone-portrait-outline', label: 'Phone Push Notifications', type: 'toggle' },
      { key: 'inApp', icon: 'notifications-outline', label: 'In-App Notifications', type: 'toggle' },
    ],
  },
  {
    title: 'Privacy',
    icon: 'lock-closed',
    color: Colors.secondary,
    bg: Colors.blueLight,
    items: [
      { key: 'locationSharing', icon: 'location-outline', label: 'Location Sharing', type: 'toggle' },
      { key: 'profileVisibility', icon: 'eye-outline', label: 'Profile Visibility', type: 'toggle' },
    ],
  },
  {
    title: 'Security',
    icon: 'shield-checkmark',
    color: Colors.accent,
    bg: 'rgba(15,169,88,0.08)',
    items: [
      { key: 'twoFA', icon: 'key-outline', label: 'Two-Factor Auth', type: 'toggle' },
      { key: 'changePassword', icon: 'lock-open-outline', label: 'Change Password', type: 'chevron' },
    ],
  },
  {
    title: 'Display',
    icon: 'color-palette',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.08)',
    items: [
      { key: 'darkMode', icon: 'moon-outline', label: 'Dark Mode', type: 'toggle', disabled: true },
    ],
  },
  {
    title: 'Data',
    icon: 'server',
    color: Colors.warning,
    bg: 'rgba(244,162,97,0.1)',
    items: [
      { key: 'clearCache', icon: 'trash-outline', label: 'Clear Cache', type: 'chevron' },
      { key: 'exportData', icon: 'download-outline', label: 'Export Data', type: 'chevron' },
    ],
  },
];

export default function SettingsScreen({ navigation }) {
  const { user, logout } = useContext(AuthContext);
  const {
    preferences,
    preferencesLoading,
    pushRegistrationError,
    pushDiagnostics,
    updatePreferences,
    refreshNotifications,
  } = useNotifications();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (typeof refreshNotifications === 'function') {
        await refreshNotifications();
      } else {
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (_error) {
      // ignore
    }
    setRefreshing(false);
  }, [refreshNotifications]);

  const [toggles, setToggles] = useState({
    locationSharing: true,
    profileVisibility: true,
    twoFA: false,
    darkMode: false,
  });

  const [liveRiskEnabled, setLiveRiskEnabled] = useState(false);
  const [liveRiskBusy, setLiveRiskBusy] = useState(false);
  const [liveRiskStatus, setLiveRiskStatus] = useState(LIVE_RISK_STATUS.DISABLED);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enabled = await isSiaraRiskNotificationEnabled();
      if (!cancelled) setLiveRiskEnabled(enabled);
    })();
    const unsub = subscribeLiveRiskStatus((next) => {
      if (cancelled) return;
      setLiveRiskStatus(next);
      // Auto-resume can flip the persisted flag back to false on permreq;
      // mirror that here so the toggle reflects reality.
      if (next === LIVE_RISK_STATUS.PERMREQ || next === LIVE_RISK_STATUS.DISABLED) {
        setLiveRiskEnabled(false);
      } else {
        setLiveRiskEnabled(true);
      }
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDanger, setShowDanger] = useState(false);

  async function handleToggle(key) {
    if (key === 'push' || key === 'inApp') {
      const patch = key === 'push'
        ? { pushEnabled: !(preferences?.pushEnabled ?? false) }
        : { inAppEnabled: !(preferences?.inAppEnabled ?? true) };

      try {
        await updatePreferences(patch);
      } catch (_error) {
        Alert.alert('Notifications', 'Could not update notification preferences right now.');
      }
      return;
    }

    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleLiveRiskToggle() {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Live Road Risk',
        'Persistent live notification is only available on Android for now.',
      );
      return;
    }
    if (liveRiskBusy) return;
    setLiveRiskBusy(true);
    try {
      if (liveRiskEnabled) {
        await stopSiaraLiveRiskNotification();
      } else {
        const result = await startSiaraLiveRiskNotification();
        if (!result?.ok) {
          if (result?.reason === 'location_denied') {
            Alert.alert(
              'Location required',
              'SIARA needs location permission to monitor road risk in real time. Enable it in Settings and try again.',
            );
          } else if (result?.reason === 'notification_denied') {
            Alert.alert(
              'Notifications disabled',
              'SIARA needs permission to show the live risk notification. Enable notifications in Settings.',
            );
          } else {
            Alert.alert('Live Road Risk', 'Could not start the live notification right now.');
          }
        }
      }
    } catch (error) {
      Alert.alert('Live Road Risk', error?.message || 'Something went wrong.');
    } finally {
      setLiveRiskBusy(false);
    }
  }

  function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          // Clear auth store - AppNavigator will automatically switch to PublicStack
          logout();
        },
      },
    ]);
  }

  function handleDelete() {
    if (deleteConfirm !== 'DELETE') {
      Alert.alert('Error', 'Please type DELETE to confirm.');
      return;
    }
    Alert.alert('Account Deleted', 'Your account has been deleted.', [
      {
        text: 'OK',
        onPress: () => {
          // Clear auth store - AppNavigator will automatically switch to PublicStack
          logout();
        },
      },
    ]);
  }

  function handleChevron(key) {
    if (key === 'changePassword') {
      Alert.alert('Change Password', 'Password change flow would go here.');
    } else if (key === 'clearCache') {
      Alert.alert('Clear Cache', 'Cache has been cleared successfully.');
    } else if (key === 'exportData') {
      Alert.alert('Export Data', 'Your data export will be sent to your email.');
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Profile preview */}
      <View style={styles.profilePreview}>
        <View style={styles.profileAvatarSmall}>
          <Text style={styles.profileAvatarText}>
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name || 'User'}</Text>
          <Text style={styles.profileEmail}>{user?.email || 'user@siara.dz'}</Text>
        </View>
        <TouchableOpacity
          style={styles.editProfileBtn}
          onPress={() => navigation.navigate('Profile')}
        >
          <Ionicons name="create-outline" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Settings sections */}
      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, { backgroundColor: section.bg }]}>
              <Ionicons name={section.icon} size={18} color={section.color} />
            </View>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>

          {section.items.map((item, index) => (
            <View
              key={item.key}
              style={[
                styles.settingRow,
                index < section.items.length - 1 && styles.settingRowBorder,
              ]}
            >
              <View style={styles.settingLeft}>
                <View style={styles.settingIconWrap}>
                  <Ionicons name={item.icon} size={18} color={Colors.text} />
                </View>
                <Text style={styles.settingLabel}>{item.label}</Text>
                {item.disabled && (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>Soon</Text>
                  </View>
                )}
              </View>
              {item.type === 'toggle' ? (
                <Switch
                  value={
                    item.key === 'push'
                      ? Boolean(preferences?.pushEnabled)
                      : item.key === 'inApp'
                        ? Boolean(preferences?.inAppEnabled)
                        : Boolean(toggles[item.key])
                  }
                  onValueChange={() => handleToggle(item.key)}
                  trackColor={{ true: Colors.btnPrimary, false: Colors.border }}
                  thumbColor={Colors.white}
                  disabled={item.disabled || (preferencesLoading && (item.key === 'push' || item.key === 'inApp'))}
                />
              ) : (
                <TouchableOpacity onPress={() => handleChevron(item.key)}>
                  <Ionicons name="chevron-forward" size={20} color={Colors.greyLight} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {section.title === 'Notifications' && pushRegistrationError ? (
            <Text style={styles.sectionNote}>{pushRegistrationError}</Text>
          ) : null}
        </View>
      ))}

      {/* Live Road Risk Notification — dedicated card */}
      <View style={styles.liveCard}>
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.liveCardHead}
        >
          <View style={styles.liveCardIcon}>
            <Ionicons name="speedometer" size={22} color={Colors.white} />
          </View>
          <View style={styles.liveCardTitleWrap}>
            <View style={styles.liveCardTitleRow}>
              <Text style={styles.liveCardTitle}>Live Road Risk Notification</Text>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            </View>
            <Text style={styles.liveCardDesc}>
              Keep SIARA active in your notification panel and update your current road-risk level while you are outside the app.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.liveCardBody}>
          <View style={styles.liveCardRow}>
            <Text style={styles.liveCardSwitchLabel}>Enable</Text>
            <Switch
              value={Boolean(liveRiskEnabled)}
              onValueChange={handleLiveRiskToggle}
              trackColor={{ true: Colors.btnPrimary, false: Colors.border }}
              thumbColor={Colors.white}
              disabled={Platform.OS !== 'android' || liveRiskBusy}
            />
          </View>

          <View style={styles.liveCardHint}>
            <Ionicons name="time-outline" size={12} color={Colors.subtext} />
            <Text style={styles.liveCardHintText}>Updates every 60 seconds while active.</Text>
          </View>

          {Platform.OS === 'android' ? (
            <LiveRiskStatusPill status={liveRiskStatus} busy={liveRiskBusy} />
          ) : (
            <View style={[styles.statusPill, styles.statusPillIos]}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.subtext} />
              <Text style={styles.statusPillTextIos}>
                Persistent live notification is only available on Android for now.
              </Text>
            </View>
          )}
        </View>
      </View>

      {__DEV__ ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(59,130,246,0.10)' }]}>
              <Ionicons name="bug-outline" size={18} color={Colors.secondary} />
            </View>
            <Text style={styles.sectionTitle}>Push Diagnostics</Text>
          </View>
          <Text style={styles.sectionNote}>
            Permission: {String(pushDiagnostics?.permissionStatus || 'unknown')}
          </Text>
          <Text style={styles.sectionNote}>
            Project ID: {pushDiagnostics?.projectIdPresent ? 'present' : 'missing'}
          </Text>
          <Text style={styles.sectionNote}>
            Expo token: {pushDiagnostics?.expoPushTokenPresent ? 'present' : 'missing'}
          </Text>
          <Text style={styles.sectionNote}>
            Backend token register: {pushDiagnostics?.backendTokenRegisterSucceeded ? 'succeeded' : pushDiagnostics?.backendTokenRegisterFailed ? 'failed' : 'pending'}
          </Text>
          {pushDiagnostics?.backendStoredTokenPreview ? (
            <Text style={styles.sectionNote}>
              Stored token: {pushDiagnostics.backendStoredTokenPreview}
            </Text>
          ) : null}
          {pushDiagnostics?.lastForegroundNotification ? (
            <Text style={styles.sectionNote}>
              Last foreground notification: {pushDiagnostics.lastForegroundNotification.title || pushDiagnostics.lastForegroundNotification.identifier || 'received'}
            </Text>
          ) : null}
          {pushDiagnostics?.lastNotificationResponse ? (
            <Text style={styles.sectionNote}>
              Last notification response: {pushDiagnostics.lastNotificationResponse.actionIdentifier || 'tap'}
            </Text>
          ) : null}
          {pushDiagnostics?.lastError ? (
            <Text style={styles.sectionNote}>{pushDiagnostics.lastError}</Text>
          ) : null}
        </View>
      ) : null}

      {/* Danger zone */}
      <TouchableOpacity
        style={styles.dangerHeader}
        onPress={() => setShowDanger(!showDanger)}
        activeOpacity={0.7}
      >
        <View style={styles.dangerHeaderLeft}>
          <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(220,38,38,0.08)' }]}>
            <Ionicons name="alert-circle" size={18} color={Colors.btnDanger} />
          </View>
          <Text style={[styles.sectionTitle, { color: Colors.btnDanger }]}>Danger Zone</Text>
        </View>
        <Ionicons
          name={showDanger ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.btnDanger}
        />
      </TouchableOpacity>

      {showDanger && (
        <View style={styles.dangerCard}>
          <Text style={styles.dangerText}>
            Deleting your account is permanent and cannot be undone.
            All your data, reports, and alerts will be lost.
          </Text>
          <TextInput
            style={styles.dangerInput}
            placeholder='Type "DELETE" to confirm'
            placeholderTextColor={Colors.greyLight}
            value={deleteConfirm}
            onChangeText={setDeleteConfirm}
          />
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            activeOpacity={0.7}
          >
            <Ionicons name="trash" size={16} color={Colors.btnDanger} />
            <Text style={styles.deleteBtnText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={Colors.btnDanger} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      {/* App info */}
      <View style={styles.appInfo}>
        <Text style={styles.appVersion}>SIARA Mobile v1.0.0</Text>
        <Text style={styles.appCopy}>Road Safety Intelligence Platform</Text>
      </View>

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

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '700',
  },

  /* Profile preview */
  profilePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  profileAvatarSmall: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarText: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  profileEmail: {
    color: Colors.subtext,
    fontSize: 12,
    marginTop: 2,
  },
  editProfileBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Section cards */
  sectionCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionNote: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.subtext,
  },

  /* Setting rows */
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  settingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingLabel: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '500',
  },
  /* Live Road Risk dedicated card */
  liveCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  liveCardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
  },
  liveCardIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveCardTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  liveCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  liveCardTitle: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  newBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  newBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  liveCardDesc: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  liveCardBody: {
    padding: 14,
  },
  liveCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveCardSwitchLabel: {
    color: Colors.textDark,
    fontSize: 13,
    fontWeight: '600',
  },
  liveCardHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  liveCardHintText: {
    color: Colors.subtext,
    fontSize: 11,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusPillIos: {
    backgroundColor: '#F1F5F9',
    borderColor: Colors.border,
    alignSelf: 'stretch',
  },
  statusPillTextIos: {
    color: Colors.subtext,
    fontSize: 12,
    flex: 1,
    flexShrink: 1,
  },
  comingSoonBadge: {
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  comingSoonText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '600',
  },

  /* Danger zone */
  dangerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.2)',
  },
  dangerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dangerCard: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: 'rgba(220,38,38,0.04)',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.15)',
  },
  dangerText: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  dangerInput: {
    backgroundColor: Colors.white,
    color: Colors.heading,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.btnDanger,
    backgroundColor: 'rgba(220,38,38,0.06)',
  },
  deleteBtnText: {
    color: Colors.btnDanger,
    fontSize: 14,
    fontWeight: '600',
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

  /* App info */
  appInfo: {
    alignItems: 'center',
    marginTop: 24,
  },
  appVersion: {
    color: Colors.subtext,
    fontSize: 12,
    fontWeight: '500',
  },
  appCopy: {
    color: Colors.greyLight,
    fontSize: 11,
    marginTop: 4,
  },

  bottomSpacer: {
    height: 20,
  },
});
