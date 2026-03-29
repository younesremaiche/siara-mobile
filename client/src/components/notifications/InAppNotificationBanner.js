import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { getNotificationVisuals } from '../../utils/notifications';

export default function InAppNotificationBanner({ notification, onPress, onDismiss }) {
  if (!notification) return null;

  const visuals = getNotificationVisuals(notification);

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: visuals.bg }]}>
          <Ionicons name={visuals.icon} size={18} color={visuals.color} />
        </View>
        <TouchableOpacity activeOpacity={0.88} style={styles.copy} onPress={onPress}>
          <Text style={styles.title} numberOfLines={1}>{notification.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{notification.body}</Text>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={8} onPress={onDismiss}>
          <Ionicons name="close" size={18} color={Colors.grey} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 56,
    left: 12,
    right: 12,
    zIndex: 200,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.heading,
  },
  body: {
    fontSize: 12,
    color: Colors.subtext,
    lineHeight: 17,
  },
});
