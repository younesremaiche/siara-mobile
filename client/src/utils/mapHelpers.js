// ---------------------------------------------------------------------------
// SIARA – Map utility functions & Leaflet HTML template builder
// ---------------------------------------------------------------------------

// ── Defaults ──
export const DEFAULT_LAT = 28.0339;
export const DEFAULT_LNG = 1.6596;
export const DEFAULT_ZOOM = 6;
export const NEARBY_RADIUS_KM = 25;
export const NEARBY_MAX_DESTINATIONS = 4;
export const ROUTE_SAMPLE_COUNT = 12;
export const NOW_PRESET_REFRESH_MS = 5 * 60 * 1000;
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// ── Tile layer URLs (Leaflet-compatible with {s} subdomains) ──
export const TILE_LAYERS = {
  voyager: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: '&copy; CARTO &copy; OSM',
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 17,
    attribution: '&copy; OpenTopoMap',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: '',
    maxZoom: 18,
    attribution: '&copy; ESRI',
  },
};

// ── Time presets ──
export const TIME_PRESETS = [
  { key: '0', label: 'Now', offsetMs: 0 },
  { key: String(5 * 60 * 1000), label: '+5 min', offsetMs: 5 * 60 * 1000 },
  { key: String(15 * 60 * 1000), label: '+15 min', offsetMs: 15 * 60 * 1000 },
  { key: String(60 * 60 * 1000), label: '+1h', offsetMs: 60 * 60 * 1000 },
  { key: String(3 * 60 * 60 * 1000), label: '+3h', offsetMs: 3 * 60 * 60 * 1000 },
  { key: String(6 * 60 * 60 * 1000), label: '+6h', offsetMs: 6 * 60 * 60 * 1000 },
  { key: 'custom', label: 'Custom', offsetMs: null },
];

// ── Severity color maps ──
export const SEVERITY_COLORS = {
  high: '#EF4444',
  extreme: '#B91C1C',
  medium: '#F59E0B',
  moderate: '#F59E0B',
  low: '#22C55E',
};

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------
export function normalizePosition(pos) {
  if (!pos) return null;
  const lat = parseFloat(pos.lat ?? pos.latitude);
  const lng = parseFloat(pos.lng ?? pos.lon ?? pos.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function isValidCoordinate(coord) {
  return coord != null && Number.isFinite(coord.latitude) && Number.isFinite(coord.longitude);
}

// ---------------------------------------------------------------------------
// Incident / danger color helpers
// ---------------------------------------------------------------------------
export function getIncidentColor(severity) {
  const level = String(severity || '').toLowerCase();
  if (level === 'high' || level === 'extreme') return '#ef4444';
  if (level === 'medium' || level === 'moderate') return '#f59e0b';
  return '#22c55e';
}

export function getDangerColor(level) {
  const riskLevel = String(level || '').toLowerCase();
  if (riskLevel === 'extreme') return '#b91c1c';
  if (riskLevel === 'high') return '#ef4444';
  if (riskLevel === 'moderate' || riskLevel === 'medium') return '#f59e0b';
  return '#22c55e';
}

export function normalizeDangerLevel(level, dangerPercent) {
  const text = String(level || '').trim().toLowerCase();
  if (['extreme', 'high', 'moderate', 'low'].includes(text)) return text;
  const percent = parseFloat(dangerPercent);
  if (!Number.isFinite(percent)) return 'low';
  if (percent < 25) return 'low';
  if (percent < 50) return 'moderate';
  if (percent < 75) return 'high';
  return 'extreme';
}

export function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return `${Math.round(numeric)}%`;
}

// ---------------------------------------------------------------------------
// Heatmap helpers
// ---------------------------------------------------------------------------
export function getWeight(severity) {
  if (severity === 'high' || severity === 'extreme') return 1;
  if (severity === 'medium' || severity === 'moderate') return 0.7;
  return 0.4;
}

export function getHeatRadius(severity) {
  if (severity === 'high' || severity === 'extreme') return 900;
  if (severity === 'medium' || severity === 'moderate') return 650;
  return 450;
}

// ---------------------------------------------------------------------------
// Segment path extraction
// ---------------------------------------------------------------------------
export function getSegmentPath(segment) {
  if (!segment) return [];
  const raw = segment.path || segment.polyline || segment.coords || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) {
        return normalizePosition({ lat: point[0], lng: point[1] });
      }
      return normalizePosition(point);
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Sentinel / data quality helpers
// ---------------------------------------------------------------------------
function prettySentinelField(fieldRaw) {
  const field = String(fieldRaw || '').trim().toLowerCase();
  const map = {
    pressure_msl: 'pressure',
    relative_humidity_2m: 'humidity',
    windspeed_10m: 'wind speed',
    winddirection_10m: 'wind direction',
    temperature_2m: 'temperature',
    cloudcover: 'cloud cover',
  };
  return map[field] || field.replace(/_/g, ' ');
}

function mapSentinelReason(reasonRaw) {
  const code = String(reasonRaw || '').trim().toLowerCase();
  if (!code) return null;
  if (code === 'outside_dz') return 'GPS location looks outside Algeria (or invalid).';
  if (code === 'missing_weather') return 'Weather data is unavailable right now.';
  if (code === 'model_ood_high') return 'Conditions are extremely rare compared to training data.';
  if (code === 'model_ood_medium') return 'Conditions are uncommon compared to training data.';
  if (code === 'model_ood_low') return 'Conditions are slightly atypical compared to training data.';
  if (code.startsWith('bad_')) {
    const field = prettySentinelField(code.slice(4));
    return `Weather data looks corrupted: ${field} is out of expected range.`;
  }
  return code.replace(/_/g, ' ');
}

function mapSentinelReasons(reasons) {
  if (!Array.isArray(reasons)) return [];
  const seen = new Set();
  return reasons
    .map(mapSentinelReason)
    .filter((text) => {
      if (!text || seen.has(text)) return false;
      seen.add(text);
      return true;
    });
}

function mapQualityOodFeature(item) {
  if (!item || typeof item !== 'object') return null;
  const feature = prettySentinelField(
    String(item.feature || '')
      .replace(/[()]/g, '')
      .replace(/\//g, '_')
      .replace(/\s+/g, '_')
  );
  const reason = String(item.reason || '').trim().toLowerCase();
  if (reason === 'clipped_to_training_range') return `Value clipped to training range: ${feature}`;
  if (reason === 'unknown_category') return `Unknown category mapped to default: ${feature}`;
  if (reason === 'out_of_range') return `Value out of valid range: ${feature}`;
  if (!reason) return `Input quality issue: ${feature}`;
  return `${reason.replace(/_/g, ' ')}: ${feature}`;
}

function buildFallbackQualityDetails(qualitySignals) {
  if (!qualitySignals || typeof qualitySignals !== 'object') return [];
  const lines = [];
  const missing = Array.isArray(qualitySignals.missing_features) ? qualitySignals.missing_features : [];
  missing.forEach((field) => lines.push(`Missing input defaulted: ${prettySentinelField(field)}`));
  const clipped = Array.isArray(qualitySignals.clipped_features) ? qualitySignals.clipped_features : [];
  clipped.forEach((field) => lines.push(`Value clipped to expected range: ${prettySentinelField(field)}`));
  const oodFeatures = Array.isArray(qualitySignals.ood_features) ? qualitySignals.ood_features : [];
  oodFeatures.forEach((item) => {
    const message = mapQualityOodFeature(item);
    if (message) lines.push(message);
  });
  if (qualitySignals.invalid_start_time) lines.push('Provided timestamp is invalid; model used fallback time.');
  const seen = new Set();
  return lines.filter((line) => {
    if (!line || seen.has(line)) return false;
    seen.add(line);
    return true;
  });
}

export function parseSentinelInfo(data) {
  if (!data) return null;
  const sentinel = data.sentinel ?? null;
  const qualitySignals = data.quality_signals ?? null;
  const sentinelError = sentinel ? String(sentinel.error || '').trim() : '';
  const sentinelValid = Boolean(sentinel && !sentinelError && Number.isFinite(Number(sentinel.ood_percent)));
  const oodPct = sentinelValid ? Math.max(0, Math.min(100, Math.round(Number(sentinel.ood_percent)))) : null;
  const confidenceLabel = sentinelValid ? (String(sentinel.confidence || '').trim().toLowerCase() || null) : null;
  const isOod = sentinelValid ? Boolean(sentinel.is_ood) : false;
  const reasons = mapSentinelReasons(sentinel?.reasons);
  const bannerTitle = String(sentinel?.banner?.title || '').trim();
  const bannerDetail = String(sentinel?.banner?.detail || '').trim();
  const fallbackDetails = buildFallbackQualityDetails(qualitySignals);
  const hasSentinel = Boolean(
    sentinelError || reasons.length > 0 || bannerTitle || fallbackDetails.length > 0 || isOod || (oodPct != null && oodPct > 50)
  );

  return {
    hasSentinel,
    sentinelError,
    sentinelValid,
    oodPct,
    confidenceLabel,
    isOod,
    reasons,
    bannerTitle,
    bannerDetail,
    fallbackDetails,
  };
}

// ---------------------------------------------------------------------------
// Nominatim search result normalizer
// ---------------------------------------------------------------------------
export function normalizeNominatimResult(item) {
  if (!item) return null;
  const lat = parseFloat(item.lat);
  const lng = parseFloat(item.lon ?? item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const parts = String(item.display_name || '').split(',').map((part) => part.trim());
  const name = String(item.name || parts[0] || 'Destination').trim();
  const subtitle = String(item.subtitle || parts.slice(1, 3).join(', ') || item.type || '').trim();
  return {
    id: String(item.place_id || `${lat}:${lng}`),
    name,
    subtitle,
    full_name: item.display_name || name,
    lat,
    lng,
  };
}

// ---------------------------------------------------------------------------
// Leaflet HTML template builder
// ---------------------------------------------------------------------------
// Generates a full HTML document that renders an interactive Leaflet map
// inside a WebView.  All dynamic data (markers, polylines, user location,
// circles, tile layer, center/zoom) is injected as JSON so the template
// only needs to be rebuilt when those values change.
// ---------------------------------------------------------------------------

export function buildLeafletHTML({
  center = [DEFAULT_LAT, DEFAULT_LNG],
  zoom = DEFAULT_ZOOM,
  tileLayer = 'voyager',
  markers = [],
  circles = [],
  polylines = [],
  userLocation = null,
  mapLayer = 'points',
} = {}) {
  const tile = TILE_LAYERS[tileLayer] || TILE_LAYERS.voyager;
  const markersJSON = JSON.stringify(markers);
  const circlesJSON = JSON.stringify(circles);
  const polylinesJSON = JSON.stringify(polylines);
  const userJSON = JSON.stringify(userLocation);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{width:100%;height:100%;background:#f6f7fb;overflow:hidden;touch-action:none}
    .leaflet-control-attribution{font-size:8px!important;opacity:.6}
    .leaflet-control-zoom{display:none!important}
    .marker-dot{position:relative;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 11px/1 -apple-system,system-ui,sans-serif}
    .report-pin{position:relative;width:28px;height:40px;pointer-events:none}
    .report-pin__body{position:absolute;left:0;top:0;width:28px;height:28px;border-radius:14px 14px 14px 4px;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.28)}
    .report-pin__glyph{position:absolute;left:50%;top:50%;transform:translate(-50%,-62%);font-size:13px;line-height:1}
    .user-dot{width:16px;height:16px;border-radius:50%;background:#7A3DF0;border:3px solid #fff;box-shadow:0 1px 8px rgba(122,61,240,.5)}
    .marker-tooltip{font-size:12px;font-weight:600;padding:4px 8px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.15);border:none}
    .legend{position:absolute;bottom:10px;left:10px;z-index:1000;background:rgba(255,255,255,.94);border-radius:10px;padding:8px 12px;font-family:-apple-system,system-ui,sans-serif;font-size:11px;box-shadow:0 2px 8px rgba(0,0,0,.12);backdrop-filter:blur(8px)}
    .legend-item{display:flex;align-items:center;margin:3px 0}
    .legend-dot{width:10px;height:10px;border-radius:50%;margin-right:8px;border:1.5px solid rgba(255,255,255,.8);box-shadow:0 1px 3px rgba(0,0,0,.2)}
    .legend-label{color:#4A4A4A;font-weight:500}
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="legend">
    <div style="font-weight:700;margin-bottom:4px;color:#232323">Risk Levels</div>
    <div class="legend-item"><div class="legend-dot" style="background:#EF4444"></div><span class="legend-label">High</span></div>
    <div class="legend-item"><div class="legend-dot" style="background:#F59E0B"></div><span class="legend-label">Medium</span></div>
    <div class="legend-item"><div class="legend-dot" style="background:#22C55E"></div><span class="legend-label">Low</span></div>
  </div>
  <script>
    // ── Initialize map ──
    var map = L.map('map',{
      zoomControl:false,
      attributionControl:true,
    }).setView([${center[0]},${center[1]}],${zoom});

    L.tileLayer('${tile.url}',{
      maxZoom:${tile.maxZoom},
      ${tile.subdomains ? `subdomains:'${tile.subdomains}',` : ''}
      attribution:'${tile.attribution}',
    }).addTo(map);

    // ── Severity colors ──
    var sevColors={high:'#EF4444',extreme:'#B91C1C',medium:'#F59E0B',moderate:'#F59E0B',low:'#22C55E'};
    function getColor(s){return sevColors[(s||'').toLowerCase()]||'#6B7280'}

    // ── Render circles (heatmap / danger zones) ──
    var circleData=${circlesJSON};
    circleData.forEach(function(c){
      if(c.lat==null||c.lng==null) return;
      L.circle([c.lat,c.lng],{
        radius:c.radius||800,
        fillColor:c.color||getColor(c.severity),
        fillOpacity:c.fillOpacity||0.15,
        color:c.color||getColor(c.severity),
        weight:c.weight||1.5,
        opacity:c.opacity||0.4,
      }).addTo(map);
    });

    // ── Render markers ──
    var markerData=${markersJSON};
    markerData.forEach(function(m){
      if(m.lat==null||m.lng==null) return;
      var color=m.color||getColor(m.severity);
      var size=m.size||12;
      var markerHtml=m.isReport
        ? '<div class="report-pin"><div class="report-pin__body" style="background:'+color+'"></div>'+(m.glyph?'<span class="report-pin__glyph">'+String(m.glyph)+'</span>':'')+'</div>'
        : '<div class="marker-dot" style="width:'+size+'px;height:'+size+'px;background:'+color+'"></div>';
      var iconSize=m.iconSize||[size,size];
      var iconAnchor=m.iconAnchor||[size/2,size/2];
      var icon=L.divIcon({
        className:'',
        html:markerHtml,
        iconSize:iconSize,
        iconAnchor:iconAnchor,
      });
      var marker=L.marker([m.lat,m.lng],{icon:icon});
      if(m.label){
        marker.bindTooltip(m.label,{
          permanent:false,
          direction:'top',
          offset:[0,-size/2-2],
          className:'marker-tooltip',
        });
      }
      marker.on('click',function(){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'markerPress',marker:m}));
      });
      marker.addTo(map);
    });

    // ── Render polylines ──
    var polyData=${polylinesJSON};
    polyData.forEach(function(p){
      if(!p.coords||p.coords.length<2) return;
      var latlngs=p.coords.map(function(c){return[c[0],c[1]]});
      var line=L.polyline(latlngs,{
        color:p.color||'#7A3DF0',
        weight:p.weight||5,
        opacity:p.opacity||0.8,
        dashArray:p.dashArray||null,
        lineCap:'round',
        lineJoin:'round',
      });
      if(p.tappable){
        line.on('click',function(){
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'polylinePress',segment:p.segment||null}));
        });
      }
      line.addTo(map);
    });

    // ── User location ──
    var userLoc=${userJSON};
    if(userLoc&&userLoc.latitude!=null&&userLoc.longitude!=null){
      L.circle([userLoc.latitude,userLoc.longitude],{
        radius:160,
        fillColor:'rgba(124,58,237,0.12)',
        fillOpacity:1,
        color:'rgba(124,58,237,0.25)',
        weight:1,
      }).addTo(map);
      var userIcon=L.divIcon({
        className:'',
        html:'<div class="user-dot"></div>',
        iconSize:[16,16],
        iconAnchor:[8,8],
      });
      L.marker([userLoc.latitude,userLoc.longitude],{icon:userIcon,zIndexOffset:1000})
       .bindTooltip('You are here',{permanent:false,direction:'top',offset:[0,-12],className:'marker-tooltip'})
       .addTo(map);
    }

    // ── Handle messages from React Native ──
    document.addEventListener('message',function(e){handleMsg(e)});
    window.addEventListener('message',function(e){handleMsg(e)});
    function handleMsg(e){
      try{
        var msg=JSON.parse(e.data);
        if(msg.type==='setView'){
          map.setView([msg.lat,msg.lng],msg.zoom||map.getZoom(),{animate:true});
        }
        if(msg.type==='fitBounds'&&msg.bounds){
          map.fitBounds(msg.bounds,{padding:[60,60],animate:true});
        }
      }catch(err){}
    }

    map.on('moveend',function(){
      var center=map.getCenter();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type:'mapRegionChange',
        center:{lat:center.lat,lng:center.lng},
        zoom:map.getZoom(),
      }));
    });

    // Notify RN that the map is ready
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'mapReady'}));
  <\/script>
</body>
</html>`;
}
