import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildLeafletHTML } from '../../utils/mapHelpers';

// Leaflet-based replacement for react-native-maps on the admin screens.
// Renders markers and/or polygons. Set interactive={false} for a display-only
// mini-map (taps/drags are swallowed by the wrapper). Pass a `key` from the
// parent when the content should fully reset (e.g. selection/period change).
const DEFAULT_CENTER = [28.0, 2.5];

export default function AdminLeafletMap({
  center,
  zoom = 6,
  markers = [],
  polygons = [],
  onMarkerPress,
  onPolygonPress,
  interactive = true,
  style,
}) {
  const webRef = useRef(null);

  const html = useMemo(
    () =>
      buildLeafletHTML({
        center: Array.isArray(center) ? center : DEFAULT_CENTER,
        zoom,
        tileLayer: 'voyager',
        markers,
        polygons,
        mapLayer: 'points',
        showZoomControl: interactive,
      }),
    [center, zoom, markers, polygons, interactive],
  );

  const onMessage = useCallback(
    (event) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'markerPress' && msg.marker) {
          onMarkerPress?.(msg.marker);
        } else if (msg.type === 'polygonPress' && msg.id != null) {
          onPolygonPress?.(msg.id);
        }
      } catch {
        // ignore malformed messages
      }
    },
    [onMarkerPress, onPolygonPress],
  );

  return (
    <View style={[styles.fill, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl: 'https://localhost' }}
        style={StyleSheet.absoluteFill}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowUniversalAccessFromFileURLs
        allowFileAccess
        originWhitelist={['*']}
        scrollEnabled={false}
        nestedScrollEnabled
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
