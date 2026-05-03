import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import notifee, {
  AndroidImportance,
  AndroidCategory,
  AndroidColor,
  EventType,
} from '@notifee/react-native';

import { fetchCurrentRisk, fetchCurrentWeather, pickRiskSummary, pickWeatherSummary } from './siaraRiskApi';

const STORAGE_KEY = 'siara:liveRiskNotification:enabled';
const NOTIFICATION_ID = 'siara-live-risk';
const CHANNEL_ID = 'siara_live_risk';
const CHANNEL_NAME = 'Live Road Risk';
const UPDATE_INTERVAL_MS = 60_000;
const REVERSE_GEOCODE_MIN_DELTA_M = 250;

// Public status values consumed by the Settings card pill.
export const LIVE_RISK_STATUS = {
  DISABLED: 'disabled',
  WAITING: 'waiting',
  ACTIVE: 'active',
  PERMREQ: 'permreq',
};

let runnerResolve = null;
let intervalHandle = null;
let foregroundEventUnsub = null;
let backgroundHandlerRegistered = false;
let lastReverseGeocode = { lat: null, lng: null, label: null };

let currentStatus = LIVE_RISK_STATUS.DISABLED;
const statusSubscribers = new Set();

function emitStatus(next) {
  if (next === currentStatus) return;
  currentStatus = next;
  statusSubscribers.forEach((cb) => {
    try { cb(currentStatus); } catch {}
  });
}

export function subscribeLiveRiskStatus(cb) {
  if (typeof cb !== 'function') return () => {};
  statusSubscribers.add(cb);
  // Push current value immediately so subscribers don't render stale state.
  try { cb(currentStatus); } catch {}
  return () => statusSubscribers.delete(cb);
}

export function getLiveRiskStatus() {
  return currentStatus;
}

function safeFormatTime(date) {
  try {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

function distanceMeters(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function ensurePermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { ok: false, reason: 'location_denied' };
  }
  if (Platform.OS === 'android') {
    const settings = await notifee.requestPermission();
    if (settings.authorizationStatus === 0) {
      return { ok: false, reason: 'notification_denied' };
    }
  }
  return { ok: true };
}

// Like ensurePermissions but never prompts. Used on auto-resume so the launch
// flow stays silent — if a permission has been revoked the user re-grants it
// only when they re-tap the toggle.
async function checkPermissionsSilently() {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { ok: false, reason: 'location_denied' };
  }
  if (Platform.OS === 'android') {
    const settings = await notifee.getNotificationSettings();
    if (settings.authorizationStatus === 0) {
      return { ok: false, reason: 'notification_denied' };
    }
  }
  return { ok: true };
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: CHANNEL_NAME,
    importance: AndroidImportance.LOW,
    vibration: false,
    sound: undefined,
  });
}

function buildNotification(payload) {
  const {
    title = 'SIARA Live Road Risk',
    body = 'Monitoring road risk · waiting for live data',
    waiting = false,
  } = payload || {};

  return {
    id: NOTIFICATION_ID,
    title,
    body,
    android: {
      channelId: CHANNEL_ID,
      smallIcon: 'notification_icon',
      color: AndroidColor.PURPLE,
      ongoing: true,
      onlyAlertOnce: true,
      asForegroundService: true,
      category: AndroidCategory.SERVICE,
      importance: AndroidImportance.LOW,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        {
          title: 'Open SIARA',
          pressAction: { id: 'open', launchActivity: 'default' },
        },
        {
          title: 'Stop',
          pressAction: { id: 'stop' },
        },
      ],
    },
  };
}

export async function updateSiaraRiskNotification(payload = {}) {
  if (Platform.OS !== 'android') return;
  await notifee.displayNotification(buildNotification(payload));
}

async function reverseGeocodeIfMoved(lat, lng) {
  const moved = distanceMeters({ lat: lastReverseGeocode.lat, lng: lastReverseGeocode.lng }, { lat, lng });
  if (lastReverseGeocode.label && moved < REVERSE_GEOCODE_MIN_DELTA_M) {
    return lastReverseGeocode.label;
  }
  try {
    const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const place = Array.isArray(places) && places.length ? places[0] : null;
    const label =
      (place && (place.city || place.subregion || place.district || place.region || place.name)) || null;
    lastReverseGeocode = { lat, lng, label };
    return label;
  } catch {
    return lastReverseGeocode.label;
  }
}

async function tickOnce() {
  let lat = null;
  let lng = null;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    lat = pos?.coords?.latitude ?? null;
    lng = pos?.coords?.longitude ?? null;
  } catch (error) {
    if (__DEV__) console.warn('[siaraRiskNotification] location_failed', error?.message);
  }

  if (lat == null || lng == null) {
    emitStatus(LIVE_RISK_STATUS.WAITING);
    await updateSiaraRiskNotification({
      body: 'Monitoring road risk · waiting for location',
      waiting: true,
    });
    return;
  }

  let risk = null;
  let weather = null;
  try {
    risk = pickRiskSummary(await fetchCurrentRisk({ lat, lng }));
  } catch (error) {
    if (__DEV__) console.warn('[siaraRiskNotification] risk_failed', error?.message);
  }

  try {
    weather = pickWeatherSummary(await fetchCurrentWeather({ lat, lng }));
  } catch (error) {
    if (__DEV__) console.warn('[siaraRiskNotification] weather_failed', error?.message);
  }

  const place = await reverseGeocodeIfMoved(lat, lng);

  if (!risk || risk.percent == null) {
    emitStatus(LIVE_RISK_STATUS.WAITING);
    await updateSiaraRiskNotification({
      body: 'Monitoring road risk · waiting for live data',
      waiting: true,
    });
    return;
  }

  const lines = [`Current risk: ${risk.percent}%${risk.level ? ` · ${risk.level}` : ''}`];
  if (place) lines.push(`Location: ${place}`);
  if (weather) lines.push(weather);
  lines.push(`Updated ${safeFormatTime(new Date())}`);

  emitStatus(LIVE_RISK_STATUS.ACTIVE);
  await updateSiaraRiskNotification({ body: lines.join('\n') });
}

function startTickLoop() {
  if (intervalHandle) return;
  // Fire once immediately so the user sees real data fast.
  tickOnce().catch(() => {});
  intervalHandle = setInterval(() => {
    tickOnce().catch(() => {});
  }, UPDATE_INTERVAL_MS);
}

function stopTickLoop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

function ensureForegroundServiceRegistered() {
  // Notifee requires a service runner whose returned promise lifetime equals the service lifetime.
  notifee.registerForegroundService(() => {
    return new Promise((resolve) => {
      runnerResolve = resolve;
      startTickLoop();
    });
  });
}

function ensureBackgroundEventHandler() {
  if (backgroundHandlerRegistered) return;
  backgroundHandlerRegistered = true;
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type !== EventType.ACTION_PRESS) return;
    if (detail?.pressAction?.id === 'stop') {
      await stopSiaraLiveRiskNotification();
    }
  });
}

export function ensureSiaraRiskNotificationWired() {
  if (Platform.OS !== 'android') return;
  ensureForegroundServiceRegistered();
  ensureBackgroundEventHandler();

  // Foreground action handler so taps inside the app stop the service too.
  if (!foregroundEventUnsub) {
    foregroundEventUnsub = notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type !== EventType.ACTION_PRESS) return;
      if (detail?.pressAction?.id === 'stop') {
        await stopSiaraLiveRiskNotification();
      }
    });
  }
}

export async function startSiaraLiveRiskNotification() {
  if (Platform.OS !== 'android') {
    // iOS placeholder — a non-dismissible persistent notification is not allowed.
    // Live Activities support can be added later behind this same entry point.
    return { ok: false, reason: 'ios_unsupported' };
  }

  const perms = await ensurePermissions();
  if (!perms.ok) {
    return perms;
  }

  ensureSiaraRiskNotificationWired();
  await ensureChannel();
  await AsyncStorage.setItem(STORAGE_KEY, '1');

  emitStatus(LIVE_RISK_STATUS.WAITING);
  // Show the notification first (waiting state). asForegroundService:true makes
  // Android start the service and invoke the registered runner, which then drives
  // the polling loop.
  await updateSiaraRiskNotification({
    body: 'Monitoring road risk · waiting for live data',
    waiting: true,
  });

  return { ok: true };
}

// Silent auto-resume invoked at app startup. Honors the persisted enabled flag
// — which is cleared by stopSiaraLiveRiskNotification() — so a user-triggered
// Stop never re-arms itself.
export async function tryResumeSiaraLiveRiskNotification() {
  if (Platform.OS !== 'android') return { ok: false, reason: 'ios_unsupported' };

  const wasEnabled = await isSiaraRiskNotificationEnabled();
  if (!wasEnabled) return { ok: false, reason: 'not_enabled' };

  const perms = await checkPermissionsSilently();
  if (!perms.ok) {
    // Reflect reality: clear the flag so the toggle shows OFF, surface the
    // permreq status so the card explains why.
    await AsyncStorage.setItem(STORAGE_KEY, '0');
    emitStatus(LIVE_RISK_STATUS.PERMREQ);
    return perms;
  }

  ensureSiaraRiskNotificationWired();
  await ensureChannel();

  emitStatus(LIVE_RISK_STATUS.WAITING);
  await updateSiaraRiskNotification({
    body: 'Monitoring road risk · waiting for live data',
    waiting: true,
  });

  return { ok: true };
}

export async function stopSiaraLiveRiskNotification() {
  // Persist enabled=false BEFORE anything else so a Stop press from the
  // notification (which can be received while the JS app is killed and only
  // wakes up via onBackgroundEvent) cannot leave the flag set and trigger an
  // unwanted auto-resume on next launch.
  await AsyncStorage.setItem(STORAGE_KEY, '0');
  stopTickLoop();

  if (Platform.OS === 'android') {
    try { await notifee.stopForegroundService(); } catch {}
    try { await notifee.cancelNotification(NOTIFICATION_ID); } catch {}
  }

  if (runnerResolve) {
    try { runnerResolve(); } catch {}
    runnerResolve = null;
  }
  emitStatus(LIVE_RISK_STATUS.DISABLED);
  return { ok: true };
}

export async function isSiaraRiskNotificationEnabled() {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v === '1';
  } catch {
    return false;
  }
}
