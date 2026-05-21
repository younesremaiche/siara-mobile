import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchNavigationRouteAlerts } from '../services/routeRiskService';
import { distanceMeters, isAbortError } from '../utils/requestCache';

// Polls /api/navigation/route-alerts while navigation is active.
// Caller passes the live position ref (or value) + the selected route.
// Returns the upcoming alerts in distance order, plus mute/dismiss controls
// that feed exclude_ids back into the next poll so the same banner cannot
// re-appear within the mute window.

const DEFAULT_POLL_MS = 12_000;
const MIN_MOVE_M = 60;
const AUTO_PASS_DISMISS_M = 50;
const DEFAULT_MUTE_MS = 5 * 60_000;
const DEFAULT_LOOK_AHEAD_M = 5000;

function severityFromAlert(alert) {
  const raw = String(alert?.severity || alert?.danger_level || '').toLowerCase();
  if (['critical', 'extreme', 'severe'].includes(raw)) return 'critical';
  if (['high'].includes(raw)) return 'high';
  if (['medium', 'moderate'].includes(raw)) return 'medium';
  if (['low'].includes(raw)) return 'low';
  const pct = Number(alert?.danger_percent ?? alert?.percent);
  if (Number.isFinite(pct)) {
    if (pct >= 80) return 'critical';
    if (pct >= 60) return 'high';
    if (pct >= 35) return 'medium';
  }
  return 'low';
}

function normaliseAlert(alert) {
  if (!alert || typeof alert !== 'object') return null;
  const id = String(alert.id || alert.alert_id || alert.uuid || '').trim();
  if (!id) return null;
  const lat = Number(alert.lat ?? alert.latitude ?? alert.location?.lat);
  const lng = Number(alert.lng ?? alert.lon ?? alert.longitude ?? alert.location?.lng);
  return {
    id,
    title: String(alert.title || alert.label || 'Hazard ahead'),
    description: String(alert.description || alert.detail || alert.summary || '').trim(),
    kind: String(alert.kind || alert.type || alert.category || 'hazard').toLowerCase(),
    severity: severityFromAlert(alert),
    distanceM: Number.isFinite(Number(alert.distance_m))
      ? Number(alert.distance_m)
      : Number.isFinite(Number(alert.distanceMeters))
        ? Number(alert.distanceMeters)
      : Number.isFinite(Number(alert.distance))
        ? Number(alert.distance)
        : null,
    location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    actions: Array.isArray(alert.actions) ? alert.actions : null,
    raw: alert,
  };
}

export default function useRouteAlerts({
  active,
  route,
  destination,
  positionRef,
  pollMs = DEFAULT_POLL_MS,
  lookAheadM = DEFAULT_LOOK_AHEAD_M,
  muteMs = DEFAULT_MUTE_MS,
} = {}) {
  const [alerts, setAlerts] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | success | error | offline
  const [error, setError] = useState('');
  const mutedRef = useRef(new Map()); // id -> expiresAt
  const lastPolledFromRef = useRef(null);
  const lastFetchAtRef = useRef(0);
  const tickRef = useRef(0);

  const routeId = route?.route_id || route?.route_type || null;

  // Sweep expired mutes every poll-tick — cheap, keeps the exclude set small.
  const collectActiveMutedIds = useCallback(() => {
    const now = Date.now();
    const ids = [];
    mutedRef.current.forEach((expiresAt, id) => {
      if (expiresAt <= now) mutedRef.current.delete(id);
      else ids.push(id);
    });
    return ids;
  }, []);

  const mute = useCallback((id, ms = muteMs) => {
    if (!id) return;
    mutedRef.current.set(String(id), Date.now() + ms);
    setAlerts((prev) => prev.filter((alert) => alert.id !== String(id)));
  }, [muteMs]);

  const dismiss = useCallback((id) => {
    if (!id) return;
    setAlerts((prev) => prev.filter((alert) => alert.id !== String(id)));
  }, []);

  // Auto-dismiss alerts the driver has now passed (within AUTO_PASS_DISMISS_M).
  // Runs on every render; cheap because it only loops over the current alert
  // list (typically 0–3 entries).
  const pos = positionRef?.current || null;
  useEffect(() => {
    if (!pos || !alerts.length) return;
    const passed = alerts.filter((alert) => {
      if (!alert.location) return false;
      return distanceMeters({ lat: pos.latitude, lng: pos.longitude }, alert.location) < AUTO_PASS_DISMISS_M;
    });
    if (passed.length === 0) return;
    setAlerts((prev) => prev.filter((alert) => !passed.find((p) => p.id === alert.id)));
    // Auto-passed alerts are muted briefly so a stale backend reply cannot
    // re-add them before the driver is fully past the hazard.
    passed.forEach((alert) => mutedRef.current.set(alert.id, Date.now() + 30_000));
  }, [alerts, pos]);

  // Polling driver — fires on enable, on noticeable movement, and on a timer.
  useEffect(() => {
    if (!active || !positionRef) return undefined;
    const hasUsablePath = Array.isArray(route?.path) && route.path.length >= 2;
    if (!hasUsablePath) {
      // Backend requires routeSnapshot.path; until we have one, stay quiet.
      setAlerts([]);
      setState('idle');
      setError('');
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    let movementTimer = null;
    const controllerHolder = { current: null };

    async function pollOnce({ forced = false } = {}) {
      const liveLoc = positionRef.current;
      if (!liveLoc) return;

      if (!forced) {
        // Skip if we already polled from a nearby point recently.
        const lastFrom = lastPolledFromRef.current;
        const tooClose =
          lastFrom
          && distanceMeters(
            { lat: lastFrom.latitude, lng: lastFrom.longitude },
            { lat: liveLoc.latitude, lng: liveLoc.longitude },
          ) < MIN_MOVE_M
          && Date.now() - lastFetchAtRef.current < pollMs - 500;
        if (tooClose) return;
      }

      if (controllerHolder.current) {
        try { controllerHolder.current.abort(); } catch { /* ignore */ }
      }
      const controller = new AbortController();
      controllerHolder.current = controller;

      setState((current) => (current === 'success' ? 'success' : 'loading'));
      const fetchTick = ++tickRef.current;
      try {
        // Always send the full route so backend can validate routeSnapshot.path.
        const body = await fetchNavigationRouteAlerts({
          route,
          route_id: routeId,
          userLocation: { lat: liveLoc.latitude, lng: liveLoc.longitude },
          destination,
          look_ahead_m: lookAheadM,
          exclude_ids: collectActiveMutedIds(),
          signal: controller.signal,
        });

        if (cancelled || fetchTick !== tickRef.current) return;

        const list = Array.isArray(body?.alerts)
          ? body.alerts
          : Array.isArray(body)
            ? body
            : [];
        const normalised = list
          .map(normaliseAlert)
          .filter(Boolean)
          .filter((alert) => !mutedRef.current.has(alert.id))
          .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));

        setAlerts(normalised);
        setState('success');
        setError('');
        lastPolledFromRef.current = liveLoc;
        lastFetchAtRef.current = Date.now();
      } catch (err) {
        if (isAbortError(err) || cancelled || fetchTick !== tickRef.current) return;
        // Route hasn't been populated yet — treat as quiet idle, not a UI-facing error.
        if (err?.code === 'ROUTE_PATH_REQUIRED') {
          setState('idle');
          setError('');
          return;
        }
        setState('offline');
        setError(err?.message || 'Live alerts unavailable');
      }
    }

    function schedule() {
      timer = setTimeout(() => {
        if (cancelled) return;
        pollOnce().finally(schedule);
      }, pollMs);
    }

    // First poll happens as soon as we have a position.
    pollOnce({ forced: true }).finally(schedule);

    // Cheap movement watcher: every 2s check if the live position has shifted
    // far enough to warrant an earlier poll.
    movementTimer = setInterval(() => {
      const liveLoc = positionRef.current;
      const lastFrom = lastPolledFromRef.current;
      if (!liveLoc || !lastFrom) return;
      const moved = distanceMeters(
        { lat: lastFrom.latitude, lng: lastFrom.longitude },
        { lat: liveLoc.latitude, lng: liveLoc.longitude },
      );
      if (moved >= MIN_MOVE_M && Date.now() - lastFetchAtRef.current > 4_000) {
        pollOnce({ forced: true });
      }
    }, 2_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (movementTimer) clearInterval(movementTimer);
      if (controllerHolder.current) {
        try { controllerHolder.current.abort(); } catch { /* ignore */ }
      }
    };
  }, [active, collectActiveMutedIds, destination, lookAheadM, pollMs, positionRef, route, routeId]);

  const visibleAlerts = useMemo(() => alerts, [alerts]);

  return {
    alerts: visibleAlerts,
    state,
    error,
    mute,
    dismiss,
  };
}
