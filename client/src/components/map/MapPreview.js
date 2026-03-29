import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '../../theme/colors';
import { buildLeafletHTML, SEVERITY_COLORS } from '../../utils/mapHelpers';

const SAMPLE_POINTS = [
  { lat: 36.75, lng: 3.06, label: 'Algiers', severity: 'high' },
  { lat: 36.36, lng: 6.61, label: 'Constantine', severity: 'medium' },
  { lat: 35.69, lng: -0.63, label: 'Oran', severity: 'high' },
  { lat: 36.47, lng: 2.83, label: 'Blida', severity: 'low' },
  { lat: 36.19, lng: 5.41, label: 'Setif', severity: 'medium' },
  { lat: 34.85, lng: 5.72, label: 'Biskra', severity: 'low' },
  { lat: 35.40, lng: 1.32, label: 'Tiaret', severity: 'medium' },
];

const PREVIEW_MARKERS = SAMPLE_POINTS.map((pt) => ({
  ...pt,
  size: 12,
  color: SEVERITY_COLORS[pt.severity] || '#6B7280',
}));

const PREVIEW_CIRCLES = SAMPLE_POINTS.map((pt) => ({
  lat: pt.lat,
  lng: pt.lng,
  radius: 80000,
  severity: pt.severity,
  fillOpacity: 0.18,
  weight: 1.5,
}));

const PREVIEW_HTML = buildLeafletHTML({
  center: [28.5, 2.5],
  zoom: 5,
  tileLayer: 'voyager',
  markers: PREVIEW_MARKERS,
  circles: PREVIEW_CIRCLES,
  userLocation: null,
  mapLayer: 'points',
});

export default function MapPreview({ style, onPress }) {
  return (
    <TouchableOpacity style={[styles.container, style]} onPress={onPress} activeOpacity={0.95}>
      <WebView
        source={{ html: PREVIEW_HTML, baseUrl: 'https://localhost' }}
        style={StyleSheet.absoluteFill}
        javaScriptEnabled
        mixedContentMode="always"
        allowUniversalAccessFromFileURLs
        allowFileAccess
        originWhitelist={['*']}
        scrollEnabled={false}
        pointerEvents="none"
      />

      {/* Legend overlay */}
      <View style={styles.legendOverlay}>
        {Object.entries({ high: '#EF4444', medium: '#F59E0B', low: '#10B981' }).map(([key, color]) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
          </View>
        ))}
      </View>

      {/* Tap hint */}
      <View style={styles.tapHint}>
        <Text style={styles.tapHintText}>Tap to explore full map</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  legendOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 10,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    color: Colors.text,
    fontWeight: '500',
  },
  tapHint: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(124,58,237,0.9)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
  },
  tapHintText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
});
