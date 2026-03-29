import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import AdminDrawerContent from './AdminDrawerContent';
import { AdminDrawerContext } from '../../contexts/AdminDrawerContext';
import { Colors } from '../../theme/colors';

const DRAWER_WIDTH = 280;

export default function AdminDrawerShell({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState('AdminOverview');
  const stackNavigationRef = useRef(null);
  const progress = useRef(new Animated.Value(0)).current;

  function animateDrawer(nextOpen) {
    Animated.timing(progress, {
      toValue: nextOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  function openDrawer() {
    setIsOpen(true);
    animateDrawer(true);
  }

  function closeDrawer() {
    setIsOpen(false);
    animateDrawer(false);
  }

  function registerNavigation(navigation) {
    stackNavigationRef.current = navigation;
  }

  function navigateTo(screen, params) {
    const navigation = stackNavigationRef.current;

    if (navigation?.navigate) {
      navigation.navigate(screen, params);
    }

    closeDrawer();
  }

  const contextValue = useMemo(
    () => ({
      activeRoute,
      closeDrawer,
      navigateTo,
      openDrawer,
      registerNavigation,
      setActiveRoute,
    }),
    [activeRoute]
  );

  const overlayOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.35],
  });

  const drawerTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH, 0],
  });

  return (
    <AdminDrawerContext.Provider value={contextValue}>
      <View style={styles.root}>
        <View style={styles.content}>{children}</View>

        <Animated.View
          pointerEvents={isOpen ? 'auto' : 'none'}
          style={[styles.overlay, { opacity: overlayOpacity }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
        </Animated.View>

        <Animated.View
          pointerEvents={isOpen ? 'auto' : 'none'}
          style={[
            styles.drawer,
            {
              transform: [{ translateX: drawerTranslateX }],
            },
          ]}
        >
          <AdminDrawerContent />
        </Animated.View>
      </View>
    </AdminDrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 20,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: Colors.adminBg,
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 18,
  },
});
