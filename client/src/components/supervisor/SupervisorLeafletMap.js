import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildLeafletHTML } from '../../utils/mapHelpers';

// Leaflet-based replacement for the old react-native-maps (Google) supervisor
// map. Renders incident + officer markers passed in via `markers`, auto-fits
// to them on first load, and preserves the supervisor's pan/zoom across the
// 30s data refreshes (so a poll never snaps the view back to the default).
const ALGERIA_CENTER = [28.0, 2.5];
const ALGERIA_ZOOM = 5;

const SupervisorLeafletMap = forwardRef(function SupervisorLeafletMap(
  { markers = [], onIncidentPress, style },
  ref,
) {
  const webRef = useRef(null);
  const viewRef = useRef({ center: ALGERIA_CENTER, zoom: ALGERIA_ZOOM });
  const hasFitRef = useRef(false);

  const post = useCallback((msg) => {
    webRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  const fit = useCallback(() => {
    const pts = markers
      .filter((m) => m.lat != null && m.lng != null)
      .map((m) => [m.lat, m.lng]);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      post({ type: 'setView', lat: pts[0][0], lng: pts[0][1], zoom: 12 });
      return;
    }
    post({ type: 'fitBounds', bounds: pts });
  }, [markers, post]);

  useImperativeHandle(ref, () => ({ fit }), [fit]);

  // Rebuild the HTML only when the marker set changes. Read the latest pan/zoom
  // from the ref (non-reactively) so a refresh re-opens at the same view rather
  // than the country-wide default.
  const html = useMemo(
    () =>
      buildLeafletHTML({
        center: viewRef.current.center,
        zoom: viewRef.current.zoom,
        tileLayer: 'voyager',
        markers,
        mapLayer: 'points',
        showZoomControl: true,
      }),
    [markers],
  );

  const onMessage = useCallback(
    (event) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'mapReady') {
          if (!hasFitRef.current) {
            hasFitRef.current = true;
            fit();
          }
        } else if (msg.type === 'mapRegionChange' && msg.center) {
          viewRef.current = {
            center: [msg.center.lat, msg.center.lng],
            zoom: msg.zoom ?? viewRef.current.zoom,
          };
        } else if (
          msg.type === 'markerPress'
          && msg.marker?.kind === 'incident'
          && msg.marker.incidentId != null
        ) {
          onIncidentPress?.(msg.marker.incidentId);
        }
      } catch {
        // ignore malformed messages
      }
    },
    [fit, onIncidentPress],
  );

  return (
    <View style={[styles.fill, style]}>
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
        onMessage={onMessage}
      />
    </View>
  );
});

export default SupervisorLeafletMap;

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
