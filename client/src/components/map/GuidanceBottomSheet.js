import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors } from '../../theme/colors';

const MODE_BY_INDEX = ['map', 'guidance', 'info'];

function closestSnapIndex(value, snapHeights) {
  let closestIndex = 0;
  let smallestDistance = Number.MAX_SAFE_INTEGER;

  snapHeights.forEach((height, index) => {
    const distance = Math.abs(value - height);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

export default function GuidanceBottomSheet({
  displayMode = 'map',
  snapHeights = [],
  onModeChange,
  onHeightChange,
  compactContent,
  bottomOffset = 0,
  contentBottomPadding = 28,
  children,
}) {
  const initialIndex = Math.max(0, MODE_BY_INDEX.indexOf(displayMode));
  const animatedHeight = useRef(new Animated.Value(snapHeights[initialIndex] || 0)).current;
  const heightRef = useRef(snapHeights[initialIndex] || 0);
  const dragStartRef = useRef(heightRef.current);

  useEffect(() => {
    const listenerId = animatedHeight.addListener(({ value }) => {
      heightRef.current = value;
      onHeightChange?.(value);
    });
    return () => animatedHeight.removeListener(listenerId);
  }, [animatedHeight, onHeightChange]);

  useEffect(() => {
    const nextIndex = Math.max(0, MODE_BY_INDEX.indexOf(displayMode));
    const nextHeight = snapHeights[nextIndex] || snapHeights[0] || 0;
    Animated.spring(animatedHeight, {
      toValue: nextHeight,
      friction: 10,
      tension: 70,
      useNativeDriver: false,
    }).start();
  }, [animatedHeight, displayMode, snapHeights]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
    onPanResponderGrant: () => {
      animatedHeight.stopAnimation((value) => {
        dragStartRef.current = value;
      });
    },
    onPanResponderMove: (_, gesture) => {
      const minHeight = snapHeights[0] || 0;
      const maxHeight = snapHeights[snapHeights.length - 1] || minHeight;
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, dragStartRef.current - gesture.dy));
      animatedHeight.setValue(nextHeight);
    },
    onPanResponderRelease: (_, gesture) => {
      const projectedHeight = heightRef.current - gesture.vy * 24;
      const nextIndex = closestSnapIndex(projectedHeight, snapHeights);
      const nextMode = MODE_BY_INDEX[nextIndex] || 'guidance';
      onModeChange?.(nextMode, nextIndex, snapHeights[nextIndex]);
    },
    onPanResponderTerminate: () => {
      const nextIndex = closestSnapIndex(heightRef.current, snapHeights);
      const nextMode = MODE_BY_INDEX[nextIndex] || 'guidance';
      onModeChange?.(nextMode, nextIndex, snapHeights[nextIndex]);
    },
  }), [animatedHeight, onModeChange, snapHeights]);

  return (
    <Animated.View style={[styles.sheet, { height: animatedHeight, bottom: bottomOffset }]}>
      <View style={styles.handleZone} {...panResponder.panHandlers}>
        <View style={styles.handle} />
        <Text style={styles.handleLabel}>
          {displayMode === 'map' ? 'Full map' : displayMode === 'guidance' ? 'Guidance' : 'Full info'}
        </Text>
      </View>

      <View style={styles.body}>
        {displayMode === 'map' ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.compactContent, { paddingBottom: contentBottomPadding }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {compactContent}
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {children}
          </ScrollView>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 18,
    overflow: 'hidden',
    
   
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  handle: {
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 6,
  },
  handleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  compactContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 14,
  },
});
