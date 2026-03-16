import React, { useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { Colors } from '../../theme/colors';

export default function Header({ navigation, showBack = false }) {
  const { user } = useContext(AuthContext);

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {showBack ? (
          <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.heading} />
          </TouchableOpacity>
        ) : null}
        <Ionicons name="shield-checkmark" size={24} color={Colors.btnPrimary} />
        <Text style={styles.logo}>SIARA</Text>
      </View>

      <View style={styles.right}>
        {user && (
          <>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation?.navigate('Notifications')}
            >
              <Ionicons name="notifications-outline" size={21} color={Colors.text} />
              <View style={styles.badge} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatar}
              onPress={() => navigation?.navigate('Profile')}
            >
              <Text style={styles.avatarText}>
                {(user.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </TouchableOpacity>
          </>
        )}
        {!user && (
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => navigation?.navigate('Login')}
          >
            <Text style={styles.loginText}>Sign In</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    paddingBottom: 10,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backBtn: {
    marginRight: 8,
    padding: 4,
  },
  logo: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.heading,
    letterSpacing: 1.5,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    position: 'relative',
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.btnPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  loginBtn: {
    backgroundColor: Colors.btnPrimary,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  loginText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
