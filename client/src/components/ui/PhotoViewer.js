import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: W, height: H } = Dimensions.get('window');

export default function PhotoViewer({ visible, images, initialIndex = 0, onClose }) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(initialIndex);

  useEffect(() => {
    if (visible) setCurrent(initialIndex);
  }, [visible, initialIndex]);

  if (!images?.length) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={s.root}>

        {/* Top bar */}
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          {images.length > 1 ? (
            <Text style={s.counter}>{current + 1} / {images.length}</Text>
          ) : (
            <View />
          )}
          <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.8} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Images */}
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: W, offset: W * index, index })}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / W);
            setCurrent(idx);
          }}
          keyExtractor={(item, i) => String(item.id || item.url || i)}
          renderItem={({ item }) => (
            <View style={s.imageWrap}>
              <Image
                source={{ uri: item.url }}
                style={s.image}
                resizeMode="contain"
              />
            </View>
          )}
        />

        {/* Dot indicators */}
        {images.length > 1 ? (
          <View style={[s.dots, { paddingBottom: insets.bottom + 20 }]}>
            {images.map((_, i) => (
              <View key={i} style={[s.dot, i === current && s.dotActive]} />
            ))}
          </View>
        ) : (
          <View style={{ height: insets.bottom + 20 }} />
        )}

      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  counter: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },

  imageWrap: {
    width: W,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: W,
    height: H * 0.75,
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 16,
  },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
  },
});
