import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '../stores/authStore';

/**
 * Global banner that explains why a session ended (forced re-login, account
 * block, or expiry). Reads the transient `sessionNotice` set by the auth store
 * when the global 401/403 handler tears the session down. Rendered once near the
 * root (inside AuthProvider) so it overlays whatever screen is mounted — usually
 * the Login screen, since clearing the session swaps the navigator to public.
 */
const TONES = {
  banned: { bg: '#7F1D1D', icon: 'ban-outline', title: 'Account blocked' },
  inactive: { bg: '#7F1D1D', icon: 'lock-closed-outline', title: 'Account inactive' },
  session: { bg: '#1D4ED8', icon: 'refresh-outline', title: 'Session ended' },
  expired: { bg: '#1D4ED8', icon: 'time-outline', title: 'Session expired' },
};

export default function SessionNoticeBanner() {
  const insets = useSafeAreaInsets();
  const notice = useAuthStore((state) => state.sessionNotice);
  const clearSessionNotice = useAuthStore((state) => state.clearSessionNotice);

  if (!notice) return null;
  const tone = TONES[notice.type] || TONES.expired;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 12, backgroundColor: tone.bg }]}>
      <Ionicons name={tone.icon} size={18} color="#FFFFFF" />
      <View style={styles.body}>
        <Text style={styles.title}>{notice.title || tone.title}</Text>
        {notice.message ? <Text style={styles.message}>{notice.message}</Text> : null}
      </View>
      <TouchableOpacity
        onPress={clearSessionNotice}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={18} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  body: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  message: { color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 17, marginTop: 2 },
});
