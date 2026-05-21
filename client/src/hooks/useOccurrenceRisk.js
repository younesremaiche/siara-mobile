import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchOccurrenceRiskSegment,
  predictOccurrenceRiskBatch,
  predictOccurrenceRiskPoint,
  OCCURRENCE_INPUT_REQUIRED_CODE,
  OCCURRENCE_UNAVAILABLE_CODE,
} from '../services/occurrenceRiskService';
import { isAbortError } from '../utils/requestCache';

// Drives the experimental "accident occurrence" card.
// DORMANT — Phase 2 UI is not built yet, so this hook should not be mounted
// anywhere that auto-fires (MapScreen, SiaraMap, background tasks). It only
// runs when the dedicated beta surface explicitly renders it.
//
// Two SIARA endpoints are exposed because the team is A/B-comparing the
// rule-based segment scorer with the trained beta model.

export const OCCURRENCE_HORIZONS = [
  { key: '30m', minutes: 30, label: '30 min' },
  { key: '1h',  minutes: 60, label: '1 hour' },
  { key: '2h',  minutes: 120, label: '2 h' },
];

export const OCCURRENCE_PROVIDERS = {
  primary: {
    key: 'primary',
    label: '/api/occurrence-risk/segment',
    fetcher: fetchOccurrenceRiskSegment,
  },
  alt: {
    key: 'alt',
    label: '/api/risk/occurrence/predict',
    fetcher: predictOccurrenceRiskPoint,
  },
};

function probabilityToPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 1) return n * 100;
  return n;
}

function clampPercent(value) {
  const n = probabilityToPercent(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function normaliseLevel(level, pct) {
  const raw = String(level || '').toLowerCase();
  if (['extreme', 'critical', 'very_high'].includes(raw)) return 'critical';
  if (['high'].includes(raw)) return 'high';
  if (['medium', 'moderate'].includes(raw)) return 'medium';
  if (['low'].includes(raw)) return 'low';
  const p = Number(pct);
  if (!Number.isFinite(p)) return null;
  if (p >= 75) return 'critical';
  if (p >= 55) return 'high';
  if (p >= 25) return 'medium';
  return 'low';
}

function buildLabel(level) {
  if (level === 'critical') return 'Very high likelihood';
  if (level === 'high') return 'High likelihood';
  if (level === 'medium') return 'Moderate likelihood';
  if (level === 'low') return 'Low likelihood';
  return 'Occurrence probability unavailable';
}

function firstDefined(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function firstPercent(values) {
  for (const value of values) {
    const pct = probabilityToPercent(value);
    if (pct != null) return Math.max(0, Math.min(100, pct));
  }
  return null;
}

function firstNumber(values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function prettyResultLabel(value) {
  if (!value) return null;
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatLevelLabel(level) {
  if (level === 'critical') return 'Very high';
  if (level === 'high') return 'High';
  if (level === 'medium') return 'Moderate';
  if (level === 'low') return 'Low';
  return 'Unknown';
}

function pickNarrative(payload, level) {
  return (
    payload?.explanation
    || payload?.narrative
    || payload?.summary
    || payload?.text
    || (level === 'critical'
      ? 'Multiple converging factors suggest elevated occurrence likelihood. Drive cautiously.'
      : level === 'high'
        ? 'Recent reports cluster near this segment for the selected horizon.'
        : level === 'medium'
          ? 'Above the local baseline. Stay attentive.'
          : level === 'low'
            ? 'Near baseline for this segment.'
            : 'The occurrence model did not return a usable probability.')
  );
}

function normaliseResponse(payload) {
  const modelPct = firstPercent([
    payload?.occurrenceRisk?.calibratedProbability,
    payload?.occurrenceRisk?.score,
    payload?.modelOnly?.calibrated_probability,
    payload?.modelOnly?.risk_score,
    payload?.calibratedProbability,
    payload?.calibrated_probability,
    payload?.probability,
    payload?.occurrence_percent,
    payload?.percent,
  ]);
  const personalizedPct = firstPercent([
    payload?.personalizedRisk?.score,
    payload?.personalized?.calibrated_probability,
    payload?.personalized?.risk_score,
    payload?.personalized_occurrence_score,
  ]);
  const driverQuizApplied = Boolean(
    payload?.personalizedRisk
    || payload?.personalized?.driver_behavior_applied === true,
  );
  const pct = driverQuizApplied && personalizedPct != null ? personalizedPct : modelPct;
  const modelLevel = normaliseLevel(firstDefined([
    payload?.occurrenceRisk?.riskLevel,
    payload?.modelOnly?.risk_level,
    payload?.riskLevel,
    payload?.risk_level,
    payload?.level,
  ]), modelPct);
  const personalizedLevel = normaliseLevel(firstDefined([
    payload?.personalizedRisk?.riskLevel,
    payload?.personalized?.risk_level,
  ]), personalizedPct);
  const level = driverQuizApplied && personalizedPct != null
    ? personalizedLevel || modelLevel
    : modelLevel || personalizedLevel;
  const confidence = clampPercent(
    payload?.occurrenceRisk?.confidence
    ?? payload?.modelOnly?.confidence_score
    ?? payload?.confidence
    ?? payload?.model_confidence,
  );
  const baselineFactor = Number(payload?.baseline_factor ?? payload?.factor);
  const samples = Number(payload?.samples ?? payload?.support ?? payload?.n_samples);
  const driverRiskScore = firstNumber([
    payload?.personalizedRisk?.driverRiskScore,
    payload?.personalized?.driver_risk_score,
    payload?.driver_meta?.latest_risk_score,
  ]);
  const driverResultLabel = prettyResultLabel(firstDefined([
    payload?.personalizedRisk?.driverResultLabel,
    payload?.personalized?.driver_result_label,
    payload?.driver_meta?.latest_result_label,
  ]));
  const driverMultiplier = firstNumber([
    payload?.personalizedRisk?.driverMultiplier,
    payload?.personalized?.behavior_multiplier,
  ]);
  const behaviorDeltaPct = firstPercent([
    payload?.personalizedRisk?.behaviorDelta,
    payload?.personalized?.behavior_delta,
  ]);
  return {
    pct,
    level,
    label: payload?.label || buildLabel(level),
    narrative: pickNarrative(payload, level),
    confidence: confidence != null ? confidence : null,
    baselineFactor: Number.isFinite(baselineFactor) ? baselineFactor : null,
    samples: Number.isFinite(samples) ? Math.round(samples) : null,
    modelPct,
    personalizedPct,
    modelLevel,
    personalizedLevel,
    modelLevelLabel: formatLevelLabel(modelLevel),
    personalizedLevelLabel: formatLevelLabel(personalizedLevel),
    driverQuizApplied,
    driverRiskScore,
    driverResultLabel,
    driverMultiplier,
    behaviorDeltaPct,
    modelVersion:
      payload?.occurrenceRisk?.modelVersion
      || payload?.modelOnly?.model_version
      || payload?.model_version
      || null,
    predictionTime: payload?.time_bucket || payload?.timestamp || new Date().toISOString(),
    updatedAt: payload?.updated_at || payload?.timestamp || payload?.time_bucket || new Date().toISOString(),
    raw: payload,
  };
}

export default function useOccurrenceRisk({
  lat,
  lng,
  roadSegmentId,
  segmentId,
  timeBucket,
  timestamp,
  rows,
  weather,
  context,
  enabled = true,
  requestKey,
  initialHorizonKey = '1h',
  initialProvider = 'primary',
} = {}) {
  const [horizonKey, setHorizonKey] = useState(initialHorizonKey);
  const [providerKey, setProviderKey] = useState(initialProvider);
  const [data, setData] = useState(null);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const requestTickRef = useRef(0);
  const lastAutoRequestRef = useRef(null);

  const horizon = OCCURRENCE_HORIZONS.find((h) => h.key === horizonKey) || OCCURRENCE_HORIZONS[1];
  const provider = OCCURRENCE_PROVIDERS[providerKey] || OCCURRENCE_PROVIDERS.primary;

  const fetchNow = useCallback(async ({ force = false } = {}) => {
    if (!enabled) {
      setData(null);
      setState('idle');
      setError('');
      return null;
    }
    if (providerKey === 'primary') {
      const id = Number(roadSegmentId ?? segmentId);
      if (!Number.isInteger(id) || id <= 0) {
        setData(null);
        setState('idle');
        setError('');
        return null;
      }
    }
    if (providerKey === 'alt' && (!Array.isArray(rows) || rows.length === 0)) {
      setData(null);
      setState('idle');
      setError('');
      return null;
    }

    const tick = ++requestTickRef.current;
    const controller = new AbortController();
    setState('loading');
    setError('');

    try {
      const payload = providerKey === 'alt' && Array.isArray(rows) && rows.length > 0
        ? await predictOccurrenceRiskBatch({
          rows: rows.map((row) => ({
            ...row,
            timestamp: timestamp || row?.timestamp,
            horizon_minutes: row?.horizon_minutes || horizon.minutes,
          })),
          signal: controller.signal,
          force,
        }).then((response) => {
          const list =
            (Array.isArray(response?.predictions) && response.predictions)
            || (Array.isArray(response?.results) && response.results)
            || (Array.isArray(response?.data) && response.data)
            || [];
          return list[0] ?? response;
        })
        : await provider.fetcher({
          roadSegmentId,
          segmentId,
          timeBucket,
          timestamp,
          weather,
          context,
          personalize: true,
          persist: true,
          horizon_minutes: horizon.minutes,
          signal: controller.signal,
          force,
        });
      if (tick !== requestTickRef.current) return null;
      const normalised = normaliseResponse(payload);
      setData(normalised);
      setState('success');
      return normalised;
    } catch (err) {
      if (isAbortError(err) || tick !== requestTickRef.current) return null;
      if (err?.code === OCCURRENCE_UNAVAILABLE_CODE) {
        setData(null);
        setState('unavailable');
        setError('');
        return null;
      }
      if (err?.code === OCCURRENCE_INPUT_REQUIRED_CODE) {
        setData(null);
        setState('idle');
        setError('');
        return null;
      }
      setState('error');
      setError(err?.message || 'Occurrence model unavailable');
      return null;
    }
  }, [context, enabled, horizon.minutes, provider, providerKey, roadSegmentId, rows, segmentId, timeBucket, timestamp, weather]);

  useEffect(() => {
    if (!enabled) {
      lastAutoRequestRef.current = null;
      setData(null);
      setState('idle');
      setError('');
      return;
    }
    const key = requestKey || 'default';
    if (lastAutoRequestRef.current === key) return;
    lastAutoRequestRef.current = key;
    fetchNow().catch(() => {});
  }, [enabled, fetchNow, requestKey]);

  const retry = useCallback(() => fetchNow({ force: true }), [fetchNow]);

  return {
    data,
    state,
    error,
    horizon,
    horizonKey,
    setHorizonKey,
    provider,
    providerKey,
    setProviderKey,
    retry,
  };
}
