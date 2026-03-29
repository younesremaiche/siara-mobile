import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useAdminDrawer } from '../../contexts/AdminDrawerContext';
import { Colors } from '../../theme/colors';

const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24) + 8;

export default function AdminHeader({
  title = 'Admin',
  subtitle,
  navigation,
  onMenuPress,
}) {
  const adminDrawer = useAdminDrawer();
  const route = useRoute();

  useEffect(() => {
    adminDrawer?.registerNavigation?.(navigation);
    adminDrawer?.setActiveRoute?.(route.name);
  }, [adminDrawer, navigation, route.name]);

  function openDrawer() {
    if (onMenuPress) {
      onMenuPress();
    } else if (adminDrawer?.openDrawer) {
      adminDrawer.openDrawer();
    } else if (navigation) {
      navigation.openDrawer();
    }
  }

  function navigateTo(screen) {
    if (adminDrawer?.navigateTo) {
      adminDrawer.navigateTo(screen);
    } else if (navigation) {
      navigation.navigate(screen);
    }
  }

  return (
    <View style={styles.header}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.adminBg} />
      <View style={styles.left}>
        <TouchableOpacity onPress={openDrawer} style={styles.menuBtn} activeOpacity={0.7}>
          <Ionicons name="menu" size={24} color={Colors.adminText} />
        </TouchableOpacity>
        <View style={styles.breadcrumb}>
          <Text style={styles.brandCrumb}>SIARA</Text>
          <Ionicons name="chevron-forward" size={12} color={Colors.grey} style={{ opacity: 0.5 }} />
          <Text style={styles.pageCrumb}>{title}</Text>
        </View>
      </View>

      <View style={styles.right}>
        {/* Notification bell */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigateTo('AdminAlerts')}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={20} color={Colors.adminText} />
        </TouchableOpacity>

        {/* Settings gear */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigateTo('AdminSystem')}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={20} color={Colors.adminText} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.adminBg,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: STATUSBAR_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.adminSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandCrumb: {
    color: Colors.grey,
    fontSize: 13,
    fontWeight: '500',
  },
  pageCrumb: {
    color: Colors.adminText,
    fontSize: 14,
    fontWeight: '700',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.adminSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.adminBorder,
  },
});
