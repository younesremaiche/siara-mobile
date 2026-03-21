import React, { useState, useContext } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import { Colors } from '../../theme/colors';

const SECTIONS = [
  {
    title: 'Notifications',
    icon: 'notifications',
    color: Colors.primary,
    bg: Colors.violetLight,
    items: [
      { key: 'push', icon: 'phone-portrait-outline', label: 'Push Notifications', type: 'toggle' },
      { key: 'email', icon: 'mail-outline', label: 'Email Notifications', type: 'toggle' },
      { key: 'sms', icon: 'chatbubble-outline', label: 'SMS Notifications', type: 'toggle' },
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

  const [toggles, setToggles] = useState({
    push: true,
    email: true,
    sms: false,
    locationSharing: true,
    profileVisibility: true,
    twoFA: false,
    darkMode: false,
  });

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDanger, setShowDanger] = useState(false);

  function handleToggle(key) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleLogout() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          logout();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
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
          logout();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
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
                  value={toggles[item.key]}
                  onValueChange={() => handleToggle(item.key)}
                  trackColor={{ true: Colors.btnPrimary, false: Colors.border }}
                  thumbColor={Colors.white}
                  disabled={item.disabled}
                />
              ) : (
                <TouchableOpacity onPress={() => handleChevron(item.key)}>
                  <Ionicons name="chevron-forward" size={20} color={Colors.greyLight} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      ))}

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
