import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDepartureOptions } from '../services/routeRiskService';
import { isAbortError } from '../utils/requestCache';

// Drives the "Best time to leave" card.
// Maps the raw /api/risk/route/departure-options response into a small,
// UI-ready shape: a sorted list of slots, a recommended slot (the lowest-risk
// future slot), and a "spread" flag so the UI can show the all-similar banner
// when the difference between best and worst windows is too small to act on.

const DEPARTURE_OFFSETS_MIN = [0, 30, 60, 120];
const SIMILAR_SPREAD_PP = 5;
const MAX_SLOTS = 6;

function severityFromPct(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return 'low';
  if (n >= 65) return 'critical';
  if (n >= 45) return 'high';
  if (n >= 25) return 'medium';
  return 'low';
}

function pickPct(slot) {
  const candidates = [
    slot?.risk_percent,
    slot?.riskPercent,
    slot?.danger_percent,
    slot?.percent,
    slot?.risk_score,
    slot?.score,
    slot?.expected_risk,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  }
  return null;
}

function pickTimestamp(slot) {
  return slot?.timestamp || slot?.depart_at || slot?.time || slot?.iso || null;
}

function formatWhen(timestampIso, baselineIso) {
  if (!timestampIso) return 'Unknown';
  const date = new Date(timestampIso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const baseline = baselineIso ? new Date(baselineIso) : new Date();
  if (!Number.isNaN(baseline.getTime())) {
    const deltaMs = date.getTime() - baseline.getTime();
    if (deltaMs <= 90_000) return 'Now';
  }
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function normaliseSlot(slot, baselineIso) {
  const ts = pickTimestamp(slot);
  const pct = pickPct(slot);
  if (!ts || pct == null) return null;
  return {
    timestamp: ts,
    when: formatWhen(ts, baselineIso),
    riskPct: pct,
    severity: severityFromPct(pct),
    reasoning: slot?.reasoning || slot?.explanation || slot?.summary || null,
    raw: slot,
  };
}

function buildRecommendation(slots) {
  if (!slots?.length) return null;
  const sorted = [...slots].sort((a, b) => a.riskPct - b.riskPct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const spread = worst.riskPct - best.riskPct;
  const allSimilar = spread < SIMILAR_SPREAD_PP;
  const leaveNowBest = best === slots[0];
  return {
    recommendedTimestamp: best.timestamp,
    bestPct: best.riskPct,
    worstPct: worst.riskPct,
    spread,
    allSimilar,
    leaveNowBest,
  };
}

export default function useDepartureOptions({
  origin,
  destination,
  baselineTimestamp,
  enabled = true,
} = {}) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const tickRef = useRef(0);

  const hasOrigin = Number.isFinite(Number(origin?.lat)) && Number.isFinite(Number(origin?.lng));
  const hasDest = Number.isFinite(Number(destination?.lat)) && Number.isFinite(Number(destination?.lng));
  const canFetch = Boolean(enabled && hasOrigin && hasDest && DEPARTURE_OFFSETS_MIN.length > 0);

  const fetchNow = useCallback(async ({ force = false } = {}) => {
    if (!canFetch) {
      setData(null);
      setState('idle');
      setError('');
      return null;
    }

    const tick = ++tickRef.current;
    const controller = new AbortController();
    setState((current) => (current === 'success' ? 'success' : 'loading'));
    setError('');

    try {
      const parsedBaselineMs = baselineTimestamp ? Date.parse(baselineTimestamp) : NaN;
      const baseMs = Number.isFinite(parsedBaselineMs) ? parsedBaselineMs : Date.now();
      const timestamps = DEPARTURE_OFFSETS_MIN.map((offsetMin) => (
        new Date(baseMs + offsetMin * 60_000).toISOString()
      ));
      const payload = await fetchDepartureOptions({
        origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
        destination: {
          ...(destination.name ? { name: destination.name } : {}),
          lat: Number(destination.lat),
          lng: Number(destination.lng),
        },
        timestamps,
        signal: controller.signal,
        force,
      });

      if (tick !== tickRef.current) return null;

      const rawSlots =
        (Array.isArray(payload?.options) && payload.options)
        || (Array.isArray(payload?.windows) && payload.windows)
        || (Array.isArray(payload?.slots) && payload.slots)
        || (Array.isArray(payload?.departure_options) && payload.departure_options)
        || [];

      const normalised = rawSlots
        .map((slot) => normaliseSlot(slot, timestamps[0]))
        .filter(Boolean)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(0, MAX_SLOTS);

      if (normalised.length === 0) {
        setData(null);
        setState('empty');
        return null;
      }

      const recommendation = buildRecommendation(normalised);
      const slotsWithFlag = normalised.map((slot) => ({
        ...slot,
        isRecommended: slot.timestamp === recommendation.recommendedTimestamp,
      }));

      const next = {
        slots: slotsWithFlag,
        recommendation,
        narrative: payload?.narrative || payload?.summary || null,
      };
      setData(next);
      setState('success');
      return next;
    } catch (err) {
      if (isAbortError(err) || tick !== tickRef.current) return null;
      setState('error');
      setError(err?.message || 'Departure-time service unavailable');
      return null;
    }
  }, [
    baselineTimestamp,
    canFetch,
    destination?.lat,
    destination?.lng,
    destination?.name,
    origin?.lat,
    origin?.lng,
  ]);

  useEffect(() => {
    fetchNow().catch(() => {});
  }, [fetchNow]);

  const retry = useCallback(() => fetchNow({ force: true }), [fetchNow]);

  return useMemo(
    () => ({ data, state, error, retry }),
    [data, error, retry, state],
  );
}
