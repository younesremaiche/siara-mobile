import {
  getDangerColor,
  normalizeDangerLevel,
  normalizePosition,
} from './mapHelpers';

const ROUTE_LABELS = {
  fastest: 'Fastest',
  safest: 'Safest',
  balanced: 'Balanced',
};

const ROUTE_REASONS = {
  fastest: 'Baseline fastest route',
  safest: 'Lowest predicted occurrence risk',
  balanced: 'Best tradeoff between speed and occurrence risk',
};

// ── Occurrence-risk helpers ────────────────────────────────────────────────
// The accident-occurrence model is the PRIMARY Road Guide signal. The backend
// exposes per-route `occurrence_summary` (model + personalized averages) and
// per-segment `occurrence.{modelOnly,personalized}`. We surface the
// PERSONALIZED value when a driver-quiz profile was applied, otherwise the
// MODEL-only value. The multiclass severity model is secondary detail only.

const OCCURRENCE_COLORS = {
  low: '#22c55e',
  moderate: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

export function getOccurrenceColor(level) {
  const key = String(level || '').trim().toLowerCase();
  return OCCURRENCE_COLORS[key] || null;
}

function probabilityToPercent(probability) {
  const numeric = Number(probability);
  if (!Number.isFinite(numeric)) return null;
  // calibrated_probability is a 0..1 value; clamp then scale to 0..100.
  return Math.max(0, Math.min(100, numeric * 100));
}

// Route-level occurrence headline: personalized when a driver profile was
// applied, else model-only. Returns null when occurrence is unavailable so the
// caller can fall back to severity / show "N/A".
export function pickRouteOccurrence(route) {
  const summary = route?.occurrence_summary;
  if (!summary || typeof summary !== 'object') return null;
  const applied = summary.driver_behavior_applied === true;
  const probability = applied
    ? (summary.average_personalized_probability ?? summary.average_modelOnly_probability)
    : (summary.average_modelOnly_probability ?? summary.average_personalized_probability);
  const level = applied
    ? (summary.average_personalized_risk_level ?? summary.average_modelOnly_risk_level)
    : (summary.average_modelOnly_risk_level ?? summary.average_personalized_risk_level);
  const percent = probabilityToPercent(probability);
  if (percent == null) return null;
  return {
    probability: Number(probability),
    percent: roundMetric(percent, 2),
    level: level || null,
    source: applied ? 'personalized' : 'model',
  };
}

// Segment-level occurrence: personalized when driver behaviour was applied,
// else model-only. Returns null when the segment carries no occurrence block.
export function pickSegmentOccurrence(segment) {
  const occ = segment?.occurrence;
  if (!occ || typeof occ !== 'object') return null;
  const personalized = occ.personalized || null;
  const model = occ.modelOnly || null;
  const applied = personalized?.driver_behavior_applied === true;
  const chosen = applied ? personalized : (model || personalized);
  const probability = chosen?.calibrated_probability;
  const percent = probabilityToPercent(probability);
  if (percent == null) return null;
  return {
    probability: Number(probability),
    percent: roundMetric(percent, 2),
    level: chosen?.risk_level || null,
    source: applied ? 'personalized' : 'model',
  };
}

// Ranking metric for "safest": occurrence rank score (lower = safer). Uses the
// route's personalized-or-model occurrence average; falls back to the severity
// weighted danger score when occurrence is unavailable so routes still sort.
function occurrenceRankScore(route) {
  const occ = toNumber(route?.occurrence_rank_score);
  if (occ != null) return occ;
  return toNumber(route?.weighted_danger_score);
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundMetric(value, digits = 2) {
  const numeric = toNumber(value);
  if (numeric == null) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(a, b) {
  if (!a || !b) return 0;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizePathPoint(point) {
  if (Array.isArray(point) && point.length >= 2) {
    return normalizePosition({ lat: point[0], lng: point[1] });
  }
  return normalizePosition(point);
}

function normalizePath(path) {
  if (!Array.isArray(path)) return [];
  return path.map(normalizePathPoint).filter(Boolean);
}

function uniqueRoutes(routes) {
  const used = new Set();
  return routes.filter((route) => {
    const key = String(route?.route_id || route?.id || '');
    if (!key || used.has(key)) return false;
    used.add(key);
    return true;
  });
}

function compareEta(a, b) {
  const etaA = normalizeMetric(a?.eta_min ?? a?.duration_min, 0, null);
  const etaB = normalizeMetric(b?.eta_min ?? b?.duration_min, 0, null);
  if (etaA !== etaB) return etaA - etaB;
  return normalizeMetric(occurrenceRankScore(a), 0, null) - normalizeMetric(occurrenceRankScore(b), 0, null);
}

function compareRisk(a, b) {
  const riskA = normalizeMetric(occurrenceRankScore(a), 0, null);
  const riskB = normalizeMetric(occurrenceRankScore(b), 0, null);
  if (riskA !== riskB) return riskA - riskB;
  return normalizeMetric(a?.eta_min ?? a?.duration_min, 0, null) - normalizeMetric(b?.eta_min ?? b?.duration_min, 0, null);
}

function compareBalanced(a, b) {
  if (a?.balance_score !== b?.balance_score) {
    return normalizeMetric(a?.balance_score, 0, null) - normalizeMetric(b?.balance_score, 0, null);
  }
  return compareRisk(a, b);
}

function pickBestRoute(routes, comparator, usedIds) {
  const preferred = routes.filter((route) => !usedIds.has(route.route_id));
  const candidates = preferred.length > 0 ? preferred : routes;
  return [...candidates].sort(comparator)[0] || null;
}

function formatEtaDelta(deltaMinutes) {
  const delta = toNumber(deltaMinutes);
  if (delta == null) return null;
  if (Math.abs(delta) < 0.5) return 'Same ETA as fastest';
  const rounded = Math.round(Math.abs(delta));
  return `${delta > 0 ? '+' : '-'}${rounded} min vs fastest`;
}

function formatRiskDelta(deltaPercent) {
  const delta = toNumber(deltaPercent);
  if (delta == null) return null;
  if (Math.abs(delta) < 1) return 'Same predicted occurrence risk';
  return `${delta > 0 ? '+' : '-'}${Math.round(Math.abs(delta))}% occurrence risk vs fastest`;
}

function buildComparisonText(routeType, etaDelta, riskDelta) {
  if (routeType === 'fastest') {
    return 'Baseline fastest route';
  }
  return [formatEtaDelta(etaDelta), formatRiskDelta(riskDelta)].filter(Boolean).join(' | ');
}

function describeRiskConcentration(bucketKey) {
  if (bucketKey === 'start') return 'Occurrence risk is concentrated in the beginning';
  if (bucketKey === 'middle') return 'Occurrence risk is concentrated in the middle';
  return 'Occurrence risk is concentrated in the end';
}

function buildMeasuredSegments(route) {
  const segments = Array.isArray(route?.segments) ? route.segments : [];
  let cursorKm = 0;

  return segments.map((segment, index) => {
    const path = normalizePath(segment?.path);
    const distanceKm = roundMetric(
      toNumber(segment?.distance_km) ?? calculatePathDistanceKm(path),
      2,
    ) || 0;
    const dangerPercent = roundMetric(
      toNumber(segment?.danger_percent) ?? route?.danger_percent ?? route?.weighted_danger_score ?? 0,
      2,
    ) || 0;
    const dangerLevel = normalizeDangerLevel(segment?.danger_level, dangerPercent);
    const occ = pickSegmentOccurrence(segment);
    const startKm = cursorKm;
    const endKm = cursorKm + distanceKm;
    cursorKm = endKm;

    return {
      ...segment,
      id: String(segment?.segment_id || `segment_${index}`),
      index,
      path,
      distance_km: distanceKm,
      start_km: roundMetric(startKm, 2) || 0,
      end_km: roundMetric(endKm, 2) || 0,
      danger_percent: dangerPercent,
      danger_level: dangerLevel,
      // Primary occurrence-risk fields (null when occurrence is unavailable).
      occurrence_percent: occ?.percent ?? null,
      occurrence_level: occ?.level ?? null,
      occurrence_probability: occ?.probability ?? null,
      occurrence_source: occ?.source ?? null,
      // Colour the risk strip by occurrence (primary) when available, else by
      // the severity danger level so the profile still renders.
      color: occ?.level
        ? (getOccurrenceColor(occ.level) || getDangerColor(dangerLevel))
        : getDangerColor(dangerLevel),
    };
  });
}

export { normalizePosition, normalizeDangerLevel };

export function calculatePathDistanceKm(path) {
  const normalized = normalizePath(path);
  if (normalized.length < 2) return 0;

  let total = 0;
  for (let index = 0; index < normalized.length - 1; index += 1) {
    total += haversineDistanceKm(normalized[index], normalized[index + 1]);
  }
  return roundMetric(total, 2) || 0;
}

export function calculateWeightedDangerScore(segments, fallbackDangerPercent = null) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return roundMetric(fallbackDangerPercent ?? 0, 2) || 0;
  }

  const measured = buildMeasuredSegments({ segments, danger_percent: fallbackDangerPercent });
  const weightedTotal = measured.reduce((sum, segment) => {
    const weight = Math.max(segment.distance_km || 0, 0.05);
    return sum + weight * (segment.danger_percent || 0);
  }, 0);
  const weightSum = measured.reduce((sum, segment) => sum + Math.max(segment.distance_km || 0, 0.05), 0);

  if (weightSum <= 0) {
    return roundMetric(fallbackDangerPercent ?? 0, 2) || 0;
  }

  return roundMetric(weightedTotal / weightSum, 2) || 0;
}

export function normalizeMetric(value, minValue = 0, maxValue = 100) {
  const numeric = toNumber(value);
  const min = toNumber(minValue);
  const max = toNumber(maxValue);

  if (numeric == null) {
    if (min != null && max != null) return 1;
    return max == null ? Number.MAX_SAFE_INTEGER : max;
  }
  if (min == null || max == null) return numeric;
  if (Math.abs(max - min) < 1e-9) return 0;
  return (numeric - min) / (max - min);
}

export function normalizeGuidanceRoute(route, routeIndex = 0) {
  if (!route || typeof route !== 'object') return null;

  const path = normalizePath(route?.path);
  const baseDangerPercent = roundMetric(
    toNumber(route?.summary?.danger_percent ?? route?.danger_percent ?? route?.total_danger),
    2,
  );
  const segments = buildMeasuredSegments({
    segments: route?.segments || [],
    danger_percent: baseDangerPercent,
  });
  const weightedDangerScore = calculateWeightedDangerScore(segments, baseDangerPercent);
  const distanceKm = roundMetric(
    toNumber(route?.distance_km) ?? calculatePathDistanceKm(path),
    2,
  );
  const etaMin = roundMetric(toNumber(route?.eta_min ?? route?.duration_min), 1);
  const dangerPercent = baseDangerPercent ?? weightedDangerScore;
  const dangerLevel = normalizeDangerLevel(route?.summary?.danger_level ?? route?.danger_level, dangerPercent);

  // Occurrence is the primary signal: headline value (personalized-or-model)
  // and the rank score used to pick the safest route. Null-safe — degrades to
  // the severity weighted danger score when occurrence is unavailable.
  const occ = pickRouteOccurrence(route);
  const occurrenceRank = occ?.percent != null ? roundMetric(occ.percent, 4) : null;

  return {
    ...route,
    route_id: String(route?.route_id || `route_${routeIndex + 1}`),
    order: routeIndex,
    path,
    segments,
    distance_km: distanceKm,
    eta_min: etaMin,
    duration_min: etaMin,
    danger_percent: roundMetric(dangerPercent, 2) || 0,
    danger_level: dangerLevel,
    weighted_danger_score: weightedDangerScore,
    occurrence_summary: route?.occurrence_summary || null,
    occurrence_percent: occ?.percent ?? null,
    occurrence_level: occ?.level ?? null,
    occurrence_probability: occ?.probability ?? null,
    occurrence_source: occ?.source ?? null,
    occurrence_rank_score: occurrenceRank,
    route_warning: String(route?.route_warning || '').trim() || null,
    routing_source: route?.routing_source || null,
    destination: route?.destination || null,
  };
}

export function classifyRouteAlternatives(routes) {
  const normalizedRoutes = uniqueRoutes(routes).filter(Boolean);
  if (!normalizedRoutes.length) {
    return {
      recommendedType: 'fastest',
      byType: {},
    };
  }

  const etaValues = normalizedRoutes
    .map((route) => toNumber(route?.eta_min))
    .filter((value) => value != null);
  const riskValues = normalizedRoutes
    .map((route) => occurrenceRankScore(route))
    .filter((value) => value != null);

  const minEta = etaValues.length ? Math.min(...etaValues) : 0;
  const maxEta = etaValues.length ? Math.max(...etaValues) : minEta;
  const minRisk = riskValues.length ? Math.min(...riskValues) : 0;
  const maxRisk = riskValues.length ? Math.max(...riskValues) : minRisk;

  const scoredRoutes = normalizedRoutes.map((route) => {
    const etaNorm = normalizeMetric(route.eta_min, minEta, maxEta);
    const riskNorm = normalizeMetric(occurrenceRankScore(route), minRisk, maxRisk);
    return {
      ...route,
      eta_norm: etaNorm,
      risk_norm: riskNorm,
      balance_score: roundMetric(etaNorm * 0.45 + riskNorm * 0.55, 4) || 0,
    };
  });

  const usedIds = new Set();
  const fastest = pickBestRoute(scoredRoutes, compareEta, usedIds);
  if (fastest) usedIds.add(fastest.route_id);
  const safest = pickBestRoute(scoredRoutes, compareRisk, usedIds);
  if (safest) usedIds.add(safest.route_id);
  const balanced = pickBestRoute(scoredRoutes, compareBalanced, usedIds);

  const byType = {
    fastest: fastest || null,
    safest: safest || fastest || null,
    balanced: balanced || safest || fastest || null,
  };

  return {
    recommendedType: byType.balanced ? 'balanced' : byType.safest ? 'safest' : 'fastest',
    byType,
  };
}

export function buildRouteRiskProfile(route) {
  const measuredSegments = buildMeasuredSegments(route);
  if (!measuredSegments.length) return [];

  const totalDistanceKm =
    measuredSegments[measuredSegments.length - 1]?.end_km ||
    route?.distance_km ||
    measuredSegments.reduce((sum, segment) => sum + segment.distance_km, 0) ||
    1;

  return measuredSegments.map((segment) => ({
    id: segment.id,
    width_percent: Math.max((segment.distance_km / totalDistanceKm) * 100, 6),
    distance_km: segment.distance_km,
    danger_percent: segment.danger_percent,
    danger_level: segment.danger_level,
    occurrence_percent: segment.occurrence_percent ?? null,
    occurrence_level: segment.occurrence_level ?? null,
    occurrence_source: segment.occurrence_source ?? null,
    color: segment.color,
    start_km: segment.start_km,
    end_km: segment.end_km,
    segment,
  }));
}

export function buildAheadRouteHazards(route) {
  const profile = buildRouteRiskProfile(route);
  if (!profile.length) return [];

  const totalDistance = profile[profile.length - 1]?.end_km || route?.distance_km || 0;
  const notes = [];
  const seen = new Set();

  const addNote = (note) => {
    if (!note || seen.has(note) || notes.length >= 3) return;
    seen.add(note);
    notes.push(note);
  };

  // Prefer the occurrence level/percent (primary) and fall back to severity.
  // Threshold checks key off the level labels (already calibrated server-side
  // for occurrence's smaller probability scale); concentration weighting uses
  // the percent as a within-route ratio, so the absolute scale cancels out.
  const effLevel = (item) => item.occurrence_level || item.danger_level;
  const effPercent = (item) => (
    item.occurrence_percent != null ? item.occurrence_percent : (item.danger_percent || 0)
  );
  const isHigh = (item) => ['high', 'critical', 'extreme'].includes(effLevel(item));
  const isModeratePlus = (item) => ['moderate', 'high', 'critical', 'extreme'].includes(effLevel(item));

  const firstHighRisk = profile.find(isHigh);
  if (firstHighRisk && firstHighRisk.start_km <= Math.max(1, totalDistance * 0.15)) {
    addNote('High occurrence-risk segment starts almost immediately');
  }

  const bucketTotals = { start: 0, middle: 0, end: 0 };
  profile.forEach((item) => {
    const midpoint = (item.start_km + item.end_km) / 2;
    const bucket = midpoint < totalDistance / 3
      ? 'start'
      : midpoint < (2 * totalDistance) / 3
        ? 'middle'
        : 'end';
    bucketTotals[bucket] += Math.max(item.distance_km, 0.05) * effPercent(item);
  });

  const totalWeightedRisk = Object.values(bucketTotals).reduce((sum, value) => sum + value, 0);
  if (totalWeightedRisk > 0) {
    const dominantBucket = Object.entries(bucketTotals).sort((a, b) => b[1] - a[1])[0];
    if (dominantBucket && dominantBucket[1] / totalWeightedRisk >= 0.45) {
      addNote(describeRiskConcentration(dominantBucket[0]));
    }
  }

  const tailRisk = profile
    .filter((item) => item.start_km >= totalDistance * 0.65)
    .reduce((sum, item) => sum + Math.max(item.distance_km, 0.05) * effPercent(item), 0);
  const headRisk = profile
    .filter((item) => item.end_km <= Math.max(2, totalDistance * 0.35))
    .reduce((sum, item) => sum + Math.max(item.distance_km, 0.05) * effPercent(item), 0);
  if (tailRisk > headRisk * 1.15 && tailRisk > 0) {
    addNote('Occurrence risk increases near destination');
  }

  const nearTermCluster = profile.filter(
    (item) => item.start_km < 5 && isModeratePlus(item),
  );
  if (nearTermCluster.length >= 2) {
    addNote('Moderate occurrence-risk cluster in next 5 km');
  }

  return notes;
}

export function buildRouteComparisonRows(routes, classification = classifyRouteAlternatives(routes)) {
  const fastestRoute = classification?.byType?.fastest || routes[0] || null;
  const recommendedType = classification?.recommendedType || 'balanced';

  return ['fastest', 'safest', 'balanced']
    .map((routeType) => {
      const route = classification?.byType?.[routeType];
      if (!route) return null;

      const etaDelta = roundMetric(
        (toNumber(route.eta_min) ?? 0) - (toNumber(fastestRoute?.eta_min) ?? 0),
        1,
      ) || 0;
      const riskDelta = roundMetric(
        (occurrenceRankScore(route) ?? 0) - (occurrenceRankScore(fastestRoute) ?? 0),
        1,
      ) || 0;

      return {
        ...route,
        route_type: routeType,
        route_label: ROUTE_LABELS[routeType],
        recommendedReason: ROUTE_REASONS[routeType],
        isRecommended: routeType === recommendedType,
        eta_delta_min: etaDelta,
        risk_delta_percent: riskDelta,
        comparisonText: buildComparisonText(routeType, etaDelta, riskDelta),
        risk_profile: buildRouteRiskProfile(route),
        hazard_notes: buildAheadRouteHazards(route),
      };
    })
    .filter(Boolean);
}

export function normalizeGuidedRoutePayload(payload) {
  const routes = (Array.isArray(payload?.routes) ? payload.routes : [payload])
    .map((route, index) => normalizeGuidanceRoute(route, index))
    .filter(Boolean);

  const classification = classifyRouteAlternatives(routes);
  const comparisonRows = buildRouteComparisonRows(routes, classification);

  return {
    origin: normalizePosition(payload?.origin),
    destination: normalizeNominatimResult(payload?.destination) || payload?.destination || null,
    routes,
    comparisonRows,
    recommendedType: classification.recommendedType,
    byType: comparisonRows.reduce((acc, row) => {
      acc[row.route_type] = row;
      return acc;
    }, {}),
    hasFallbackRouting: comparisonRows.some(
      (route) => route.routing_source === 'straight_line' || route.route_warning === 'osrm_failed',
    ),
  };
}

export function normalizeNominatimResult(item) {
  if (!item) return null;
  const lat = toNumber(item?.lat);
  const lng = toNumber(item?.lng ?? item?.lon);
  if (lat == null || lng == null) return null;

  const parts = String(item?.display_name || item?.full_name || item?.name || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const name = String(item?.name || parts[0] || 'Destination').trim();
  const subtitle = String(
    item?.subtitle || parts.slice(1, 3).join(', ') || item?.type || '',
  ).trim();
  const fullName = String(item?.full_name || item?.display_name || [name, subtitle].filter(Boolean).join(', ')).trim();

  return {
    id: String(item?.id || item?.place_id || `${lat}:${lng}`),
    name,
    subtitle,
    full_name: fullName || name,
    lat,
    lng,
  };
}
