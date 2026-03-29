import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { useNotifications } from '../../contexts/NotificationsContext';

export default function NotificationBell({ navigation, style, color = Colors.text }) {
  const { unreadCount } = useNotifications();

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={() => navigation?.navigate('Notifications')}
      activeOpacity={0.75}
    >
      <Ionicons name="notifications-outline" size={21} color={color} />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'relative',
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.error,
    borderWidth: 1.5,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '800',
  },
});
