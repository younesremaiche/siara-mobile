import { request as apiRequest } from './api';

const DEFAULT_PERIOD = '24h';
const DEFAULT_METRIC = 'composite';
const ALLOWED_PERIODS = new Set(['24h', '7d', '30d']);
const ALLOWED_METRICS = new Set(['composite', 'model', 'reports', 'alerts']);

function normalizeApiError(error, fallbackMessage) {
  const nextError = new Error(
    error?.response?.message
      || error?.response?.error
      || error?.message
      || fallbackMessage
  );

  nextError.status = error?.status;
  nextError.code = error?.code;
  nextError.response = error?.response;

  return nextError;
}

function ensureNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function ensureNullableNumber(value, digits = 2) {
  if (value == null || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Number(numeric.toFixed(digits));
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object') {
    return null;
  }

  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function normalizeGeometry(geometry) {
  return geometry && typeof geometry === 'object' ? geometry : null;
}

function normalizeZoneItem(item, feature = null) {
  return {
    adminAreaId: ensureNumber(item?.adminAreaId || feature?.properties?.adminAreaId, 0),
    name: item?.name || feature?.properties?.name || 'Unknown zone',
    level: item?.level || feature?.properties?.level || 'wilaya',
    riskScore: ensureNumber(item?.riskScore || feature?.properties?.riskScore, 0),
    riskLevel: ['low', 'medium', 'high', 'critical'].includes(item?.riskLevel || feature?.properties?.riskLevel)
      ? (item?.riskLevel || feature?.properties?.riskLevel)
      : 'low',
    modelWeightedScore: ensureNullableNumber(item?.modelWeightedScore || feature?.properties?.modelWeightedScore),
    modelAvgScore: ensureNullableNumber(item?.modelAvgScore || feature?.properties?.modelAvgScore),
    topRoadRiskScore: ensureNullableNumber(
      item?.topRoadRiskScore
      || feature?.properties?.topRoadRiskScore
      || feature?.properties?.topRoadRiskScoreValue
    ),
    recentReportCount: ensureNumber(item?.recentReportCount || feature?.properties?.recentReportCount, 0),
    verifiedReportCount: ensureNumber(item?.verifiedReportCount || feature?.properties?.verifiedReportCount, 0),
    pendingReportCount: ensureNumber(item?.pendingReportCount || feature?.properties?.pendingReportCount, 0),
    flaggedReportCount: ensureNumber(item?.flaggedReportCount || feature?.properties?.flaggedReportCount, 0),
    reportScore: ensureNullableNumber(item?.reportScore || feature?.properties?.reportScore),
    activeAlertCount: ensureNumber(item?.activeAlertCount || feature?.properties?.activeAlertCount, 0),
    scheduledAlertCount: ensureNumber(item?.scheduledAlertCount || feature?.properties?.scheduledAlertCount, 0),
    criticalAlertCount: ensureNumber(item?.criticalAlertCount || feature?.properties?.criticalAlertCount, 0),
    alertScore: ensureNullableNumber(item?.alertScore || feature?.properties?.alertScore),
    confidenceAvg: ensureNullableNumber(item?.confidenceAvg || feature?.properties?.confidenceAvg),
    trendVsPrevious: ensureNullableNumber(item?.trendVsPrevious || feature?.properties?.trendVsPrevious),
    topRoadName: item?.topRoadName || feature?.properties?.topRoadName || 'Unknown road',
    centroid: normalizePoint(item?.centroid || feature?.properties?.centroid),
    geometry: normalizeGeometry(item?.geometry || feature?.geometry),
    metricScore: ensureNumber(item?.metricScore || feature?.properties?.metricScore, 0),
    snapshotAt: item?.snapshotAt || feature?.properties?.snapshotAt || null,
  };
}

function normalizeZoneFeature(feature) {
  const normalizedFeature = feature && typeof feature === 'object' ? feature : {};
  const item = normalizeZoneItem(normalizedFeature.properties, normalizedFeature);

  return {
    type: 'Feature',
    geometry: item.geometry,
    properties: item,
  };
}

function normalizeTopRoad(item) {
  return {
    roadSegmentId: ensureNumber(item?.roadSegmentId, 0),
    roadName: item?.roadName || 'Unknown road',
    roadClass: item?.roadClass || null,
    roadWeight: ensureNumber(item?.roadWeight, 1),
    riskScore: ensureNullableNumber(item?.riskScore),
    confidenceAvg: ensureNullableNumber(item?.confidenceAvg),
  };
}

function normalizeRecentReport(item) {
  return {
    reportId: item?.reportId || '',
    displayId: item?.displayId || 'Unknown',
    incidentType: item?.incidentType || 'incident',
    status: item?.status || 'pending',
    severity: ['low', 'medium', 'high'].includes(item?.severity) ? item.severity : 'low',
    location: item?.location || 'Unknown location',
    occurredAt: item?.occurredAt || null,
    createdAt: item?.createdAt || null,
  };
}

function normalizeOperationalAlert(item) {
  return {
    id: item?.id || '',
    title: item?.title || 'Operational alert',
    severity: ['low', 'medium', 'high', 'critical'].includes(item?.severity) ? item.severity : 'low',
    status: ['active', 'scheduled', 'expired', 'cancelled'].includes(item?.status) ? item.status : 'expired',
    startsAt: item?.startsAt || null,
    endsAt: item?.endsAt || null,
  };
}

export function normalizeZonePeriod(period) {
  const normalized = String(period || '').trim().toLowerCase();
  return ALLOWED_PERIODS.has(normalized) ? normalized : DEFAULT_PERIOD;
}

export function normalizeZoneMetric(metric) {
  const normalized = String(metric || '').trim().toLowerCase();
  return ALLOWED_METRICS.has(normalized) ? normalized : DEFAULT_METRIC;
}

export async function fetchAdminZoneMap(period = DEFAULT_PERIOD, metric = DEFAULT_METRIC, options = {}) {
  const query = new URLSearchParams();
  query.set('period', normalizeZonePeriod(period));
  query.set('metric', normalizeZoneMetric(metric));

  try {
    const response = await apiRequest(`/api/admin/zones/map?${query.toString()}`, {
      method: 'GET',
      withAuth: true,
      signal: options.signal,
    });

    const featureCollection = response?.featureCollection && typeof response.featureCollection === 'object'
      ? {
        type: 'FeatureCollection',
        features: Array.isArray(response.featureCollection.features)
          ? response.featureCollection.features
            .map(normalizeZoneFeature)
            .filter((feature) => feature.geometry)
          : [],
      }
      : { type: 'FeatureCollection', features: [] };

    return {
      period: normalizeZonePeriod(response?.period),
      metric: normalizeZoneMetric(response?.metric),
      generatedAt: response?.generatedAt || null,
      summarySource: response?.summarySource || 'ml.zone_risk_summary_current',
      summaryRebuilt: Boolean(response?.summaryRebuilt),
      featureCollection,
      items: Array.isArray(response?.items)
        ? response.items.map((item) => normalizeZoneItem(item))
        : featureCollection.features.map((feature) => feature.properties),
      stats: {
        zoneCount: ensureNumber(response?.stats?.zoneCount, featureCollection.features.length),
        critical: ensureNumber(response?.stats?.critical, 0),
        high: ensureNumber(response?.stats?.high, 0),
        medium: ensureNumber(response?.stats?.medium, 0),
        low: ensureNumber(response?.stats?.low, 0),
      },
    };
  } catch (error) {
    throw normalizeApiError(error, 'Failed to load zone map');
  }
}

export async function fetchAdminZoneDetails(adminAreaId, period = DEFAULT_PERIOD, options = {}) {
  const query = new URLSearchParams();
  query.set('period', normalizeZonePeriod(period));

  try {
    const response = await apiRequest(`/api/admin/zones/${adminAreaId}/details?${query.toString()}`, {
      method: 'GET',
      withAuth: true,
      signal: options.signal,
    });

    return {
      period: normalizeZonePeriod(response?.period),
      generatedAt: response?.generatedAt || null,
      summary: normalizeZoneItem(response?.summary),
      topRoads: Array.isArray(response?.topRoads) ? response.topRoads.map(normalizeTopRoad) : [],
      recentReportsSummary: {
        total: ensureNumber(response?.recentReportsSummary?.total, 0),
        verified: ensureNumber(response?.recentReportsSummary?.verified, 0),
        pending: ensureNumber(response?.recentReportsSummary?.pending, 0),
        flagged: ensureNumber(response?.recentReportsSummary?.flagged, 0),
        items: Array.isArray(response?.recentReportsSummary?.items)
          ? response.recentReportsSummary.items.map(normalizeRecentReport)
          : [],
      },
      operationalAlertsSummary: {
        active: ensureNumber(response?.operationalAlertsSummary?.active, 0),
        scheduled: ensureNumber(response?.operationalAlertsSummary?.scheduled, 0),
        critical: ensureNumber(response?.operationalAlertsSummary?.critical, 0),
        items: Array.isArray(response?.operationalAlertsSummary?.items)
          ? response.operationalAlertsSummary.items.map(normalizeOperationalAlert)
          : [],
      },
    };
  } catch (error) {
    throw normalizeApiError(error, 'Failed to load zone details');
  }
}

export async function rebuildAdminZoneSummary(period = DEFAULT_PERIOD) {
  try {
    const response = await apiRequest('/api/admin/zones/rebuild-summary', {
      method: 'POST',
      withAuth: true,
      body: JSON.stringify({ period: normalizeZonePeriod(period) }),
    });

    return {
      period: normalizeZonePeriod(response?.period),
      snapshotAt: response?.snapshotAt || null,
      zoneCount: ensureNumber(response?.zoneCount, 0),
    };
  } catch (error) {
    throw normalizeApiError(error, 'Failed to rebuild zone summary');
  }
}
