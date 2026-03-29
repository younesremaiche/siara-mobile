const createError = require("http-errors");
const router = require("express").Router();

const pool = require("../db");
const { verifyToken } = require("./verifytoken");

const ALLOWED_INCIDENT_TYPES = new Set([
  "accident",
  "roadworks",
  "traffic",
  "danger",
  "ai_prediction",
]);
const ALLOWED_SEVERITIES = new Set(["low", "medium", "high"]);
const ALLOWED_TIME_RANGE_TYPES = new Set(["all", "day", "night", "custom"]);
const ALLOWED_FREQUENCY_TYPES = new Set(["immediate", "digest", "first"]);
const ALLOWED_DIGEST_INTERVALS = new Set(["hourly", "daily", "weekly"]);
const ALLOWED_STATUSES = new Set(["active", "paused", "archived"]);

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeOptionalString(value) {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeTimeValue(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) {
    return null;
  }

  return `${match[1]}:${match[2]}`;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))];
}

function parsePositiveInteger(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseBooleanQuery(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }

  return fallback;
}

function parseLatitude(value) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < -90 || parsed > 90) {
    return null;
  }
  return parsed;
}

function parseLongitude(value) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < -180 || parsed > 180) {
    return null;
  }
  return parsed;
}

function parseConfidenceValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

function toShortTime(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, 5);
  }

  return String(value).slice(0, 5);
}

function formatTimeWindow(timeRangeType, customTimeStart, customTimeEnd) {
  if (timeRangeType === "day") {
    return "06:00 - 22:00";
  }

  if (timeRangeType === "night") {
    return "22:00 - 06:00";
  }

  if (timeRangeType === "custom") {
    return `${toShortTime(customTimeStart)} - ${toShortTime(customTimeEnd)}`;
  }

  return "24/7";
}

function formatRelativeTime(value) {
  if (!value) {
    return "Never";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Never";
  }

  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return "Just now";
  }

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < hour) {
    return `${Math.max(1, Math.floor(diffMs / minute))}m`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h`;
  }

  if (diffMs < week) {
    return `${Math.floor(diffMs / day)}d`;
  }

  return `${Math.floor(diffMs / week)}w`;
}

function getHighestSeverity(severityLevels) {
  if (severityLevels.includes("high")) {
    return "high";
  }

  if (severityLevels.includes("medium")) {
    return "medium";
  }

  return "low";
}

function normalizeRecentTriggers(value) {
  let parsed = [];

  if (Array.isArray(value)) {
    parsed = value;
  } else if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch (_error) {
      parsed = [];
    }
  }

  return parsed.map((item) => ({
    id: item.id,
    type: item.type || "event",
    severity: item.severity || "medium",
    title: item.title || "Alert trigger",
    time: formatRelativeTime(item.time),
    matchedAt: item.time || null,
  }));
}

function normalizeGeoJson(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  }

  if (typeof value === "object") {
    return value;
  }

  return null;
}

function formatAlertRow(row, { includeGeometry = false } = {}) {
  const severityLevels = Array.isArray(row.severity_levels) ? row.severity_levels : [];
  const incidentTypes = Array.isArray(row.incident_types) ? row.incident_types : [];
  const zoneRecordType = row.zone_record_type || null;
  const center =
    row.center_lat !== null && row.center_lng !== null
      ? {
          lat: Number(row.center_lat),
          lng: Number(row.center_lng),
        }
      : null;
  const adminAreaCenter =
    row.admin_center_lat !== null && row.admin_center_lng !== null
      ? {
          lat: Number(row.admin_center_lat),
          lng: Number(row.admin_center_lng),
        }
      : null;

  let zone = null;
  let area = {
    name: row.zone_display_name || "Zone",
    wilaya: null,
    commune: null,
    center,
  };

  if (zoneRecordType === "admin_area") {
    const isCommune = row.admin_area_level === "commune";
    zone = {
      id: row.zone_id,
      zoneType: isCommune ? "commune" : "wilaya",
      displayName: row.zone_display_name || row.admin_area_name,
      adminAreaId: row.admin_area_id !== null ? Number(row.admin_area_id) : null,
      wilayaId: row.wilaya_id !== null ? Number(row.wilaya_id) : null,
      wilayaName: row.wilaya_name || null,
      communeId: row.commune_id !== null ? Number(row.commune_id) : null,
      communeName: row.commune_name || null,
      radiusM: null,
      radiusKm: null,
      center: adminAreaCenter,
      geometry: includeGeometry
        ? normalizeGeoJson(row.admin_area_geojson) || normalizeGeoJson(row.zone_geojson)
        : null,
    };

    area = {
      name: isCommune ? row.commune_name || row.admin_area_name : row.wilaya_name || row.admin_area_name,
      wilaya: row.wilaya_name || null,
      commune: isCommune ? row.commune_name || null : null,
      center: adminAreaCenter,
    };
  } else if (zoneRecordType === "radius") {
    zone = {
      id: row.zone_id,
      zoneType: "radius",
      displayName: row.zone_display_name || `${Number(row.radius_m) / 1000} km radius`,
      adminAreaId: null,
      wilayaId: row.radius_wilaya_id !== null ? Number(row.radius_wilaya_id) : null,
      wilayaName: row.radius_wilaya_name || null,
      communeId: null,
      communeName: null,
      radiusM: row.radius_m !== null ? Number(row.radius_m) : null,
      radiusKm: row.radius_m !== null ? Number((Number(row.radius_m) / 1000).toFixed(1)) : null,
      center,
      geometry: includeGeometry ? normalizeGeoJson(row.zone_geojson) : null,
    };

    area = {
      name: zone.displayName,
      wilaya: row.radius_wilaya_name || null,
      commune: null,
      center,
    };
  }

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    incidentTypes,
    severityLevels,
    severity: getHighestSeverity(severityLevels),
    timeRangeType: row.time_range_type,
    customTimeStart: toShortTime(row.custom_time_start),
    customTimeEnd: toShortTime(row.custom_time_end),
    timeWindow: formatTimeWindow(row.time_range_type, row.custom_time_start, row.custom_time_end),
    weatherRelated: row.weather_related,
    aiConfidenceMin: row.ai_confidence_min !== null ? Number(row.ai_confidence_min) : null,
    frequencyType: row.frequency_type,
    digestInterval: row.digest_interval,
    muteDuplicates: row.mute_duplicates,
    notifications: {
      app: row.delivery_app,
      email: row.delivery_email,
      sms: row.delivery_sms,
    },
    zone,
    area,
    triggerCount: Number(row.trigger_count || 0),
    lastTriggeredAt: row.last_triggered_at || null,
    lastTriggered: formatRelativeTime(row.last_triggered_at),
    recentTriggers: normalizeRecentTriggers(row.recent_triggers),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ALERT_SELECT_SQL = `
  SELECT
    ar.id,
    ar.name,
    ar.status,
    ar.incident_types,
    ar.severity_levels,
    ar.time_range_type,
    ar.custom_time_start,
    ar.custom_time_end,
    ar.weather_related,
    ar.ai_confidence_min,
    ar.frequency_type,
    ar.digest_interval,
    ar.mute_duplicates,
    ar.delivery_app,
    ar.delivery_email,
    ar.delivery_sms,
    ar.created_at,
    ar.updated_at,
    az.id AS zone_id,
    az.display_name AS zone_display_name,
    az.zone_type AS zone_record_type,
    az.admin_area_id,
    az.radius_m,
    ST_AsGeoJSON(az.geom)::jsonb AS zone_geojson,
    ST_Y(az.center::geometry) AS center_lat,
    ST_X(az.center::geometry) AS center_lng,
    ST_AsGeoJSON(aa.geom)::jsonb AS admin_area_geojson,
    ST_Y(COALESCE(aa.centroid::geometry, ST_Centroid(aa.geom))) AS admin_center_lat,
    ST_X(COALESCE(aa.centroid::geometry, ST_Centroid(aa.geom))) AS admin_center_lng,
    aa.level AS admin_area_level,
    aa.name AS admin_area_name,
    commune.id AS commune_id,
    commune.name AS commune_name,
    wilaya.id AS wilaya_id,
    wilaya.name AS wilaya_name,
    radius_wilaya.id AS radius_wilaya_id,
    radius_wilaya.name AS radius_wilaya_name,
    COALESCE(trigger_stats.trigger_count, 0) AS trigger_count,
    trigger_stats.last_triggered_at,
    COALESCE(trigger_recent.recent_triggers, '[]'::json) AS recent_triggers
  FROM app.alert_rules ar
  LEFT JOIN app.alert_zones az
    ON az.alert_id = ar.id
  LEFT JOIN gis.admin_areas aa
    ON aa.id = az.admin_area_id
  LEFT JOIN gis.admin_areas commune
    ON commune.id = CASE WHEN aa.level = 'commune' THEN aa.id ELSE NULL END
  LEFT JOIN gis.admin_areas wilaya
    ON wilaya.id = CASE
      WHEN aa.level = 'commune' THEN aa.parent_id
      WHEN aa.level = 'wilaya' THEN aa.id
      ELSE NULL
    END
  LEFT JOIN LATERAL (
    SELECT w.id, w.name
    FROM gis.admin_areas w
    WHERE w.level = 'wilaya'
      AND az.center IS NOT NULL
      AND ST_Intersects(w.geom, az.center::geometry)
    ORDER BY w.id ASC
    LIMIT 1
  ) AS radius_wilaya ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS trigger_count,
      MAX(atl.matched_at) AS last_triggered_at
    FROM app.alert_trigger_log atl
    WHERE atl.alert_id = ar.id
  ) AS trigger_stats ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_agg(
      json_build_object(
        'id', recent.id,
        'type', COALESCE(recent.metadata->>'incidentType', recent.metadata->>'type', recent.source_kind),
        'severity', COALESCE(recent.metadata->>'severity', 'medium'),
        'time', recent.matched_at,
        'title', COALESCE(recent.metadata->>'title', recent.message_preview, INITCAP(recent.source_kind) || ' alert')
      )
      ORDER BY recent.matched_at DESC
    ) AS recent_triggers
    FROM (
      SELECT *
      FROM app.alert_trigger_log atl
      WHERE atl.alert_id = ar.id
      ORDER BY atl.matched_at DESC
      LIMIT 4
    ) AS recent
  ) AS trigger_recent ON TRUE
  WHERE ar.user_id = $1
`;

async function fetchAlertsForUser(
  userId,
  { alertId = null, includeGeometry = false } = {},
  client = pool,
) {
  const params = [userId];
  let sql = ALERT_SELECT_SQL;

  if (alertId) {
    sql += " AND ar.id = $2";
    params.push(alertId);
  }

  sql += " ORDER BY ar.created_at DESC";

  const result = await client.query(sql, params);
  return result.rows.map((row) => formatAlertRow(row, { includeGeometry }));
}

async function getAlertForUserOrThrow(userId, alertId, client = pool, options = {}) {
  const alerts = await fetchAlertsForUser(userId, { alertId, ...options }, client);
  if (alerts.length === 0) {
    throw createError(404, "Alert not found");
  }
  return alerts[0];
}

async function validateZoneInput(client, input) {
  const zoneType = normalizeString(input?.zoneType).toLowerCase();

  if (zoneType === "radius") {
    const radiusM = parsePositiveInteger(input?.radiusM);
    const lat = parseLatitude(input?.center?.lat);
    const lng = parseLongitude(input?.center?.lng);

    if (!radiusM) {
      throw createError(400, "zone.radiusM must be a positive integer");
    }

    if (lat === null || lng === null) {
      throw createError(400, "zone.center must include valid lat/lng coordinates");
    }

    return {
      zoneType,
      displayName: normalizeOptionalString(input?.displayName) || `${Math.round(radiusM / 100) / 10} km radius`,
      radiusM,
      center: { lat, lng },
    };
  }

  if (zoneType !== "wilaya" && zoneType !== "commune") {
    throw createError(400, "zone.zoneType must be one of wilaya, commune, or radius");
  }

  const adminAreaId = parsePositiveInteger(input?.adminAreaId);
  if (!adminAreaId) {
    throw createError(400, "zone.adminAreaId must be a positive integer");
  }

  const areaResult = await client.query(
    `
      SELECT id, parent_id, level, name
      FROM gis.admin_areas
      WHERE id = $1
      LIMIT 1
    `,
    [adminAreaId]
  );

  if (areaResult.rows.length === 0) {
    throw createError(404, "Selected admin area was not found");
  }

  const area = areaResult.rows[0];
  if (area.level !== zoneType) {
    throw createError(400, `Selected admin area is not a ${zoneType}`);
  }

  const requestedWilayaId = parsePositiveInteger(input?.wilayaId);
  if (zoneType === "commune" && requestedWilayaId && Number(area.parent_id) !== requestedWilayaId) {
    throw createError(400, "Selected commune does not belong to the selected wilaya");
  }

  return {
    zoneType,
    adminAreaId: Number(area.id),
    displayName: normalizeOptionalString(input?.displayName) || area.name,
  };
}

function validateAlertPayload(body) {
  const name = normalizeString(body?.name);
  if (!name) {
    throw createError(400, "name is required");
  }

  const incidentTypes = normalizeStringArray(body?.incidentTypes);
  if (incidentTypes.length === 0 || incidentTypes.some((item) => !ALLOWED_INCIDENT_TYPES.has(item))) {
    throw createError(400, "incidentTypes must contain one or more supported values");
  }

  const severityLevels = normalizeStringArray(body?.severityLevels);
  if (severityLevels.length === 0 || severityLevels.some((item) => !ALLOWED_SEVERITIES.has(item))) {
    throw createError(400, "severityLevels must contain one or more supported values");
  }

  const timeRangeType = normalizeString(body?.timeRangeType).toLowerCase() || "all";
  if (!ALLOWED_TIME_RANGE_TYPES.has(timeRangeType)) {
    throw createError(400, "timeRangeType is invalid");
  }

  const customTimeStart = timeRangeType === "custom" ? normalizeTimeValue(body?.customTimeStart) : null;
  const customTimeEnd = timeRangeType === "custom" ? normalizeTimeValue(body?.customTimeEnd) : null;
  if (timeRangeType === "custom" && (!customTimeStart || !customTimeEnd)) {
    throw createError(400, "customTimeStart and customTimeEnd are required for custom time ranges");
  }

  const frequencyType = normalizeString(body?.frequencyType).toLowerCase() || "immediate";
  if (!ALLOWED_FREQUENCY_TYPES.has(frequencyType)) {
    throw createError(400, "frequencyType is invalid");
  }

  const digestInterval = frequencyType === "digest"
    ? normalizeString(body?.digestInterval).toLowerCase()
    : null;
  if (frequencyType === "digest" && !ALLOWED_DIGEST_INTERVALS.has(digestInterval)) {
    throw createError(400, "digestInterval is required for digest alerts");
  }

  const aiConfidenceMin = parseConfidenceValue(body?.aiConfidenceMin);
  if (body?.aiConfidenceMin !== null && body?.aiConfidenceMin !== undefined && body?.aiConfidenceMin !== "" && aiConfidenceMin === null) {
    throw createError(400, "aiConfidenceMin must be between 0 and 100");
  }

  const deliveryApp = normalizeBoolean(body?.deliveryApp, true);
  const deliveryEmail = normalizeBoolean(body?.deliveryEmail, false);
  const deliverySms = normalizeBoolean(body?.deliverySms, false);
  if (!deliveryApp && !deliveryEmail && !deliverySms) {
    throw createError(400, "At least one delivery channel must be enabled");
  }

  return {
    name,
    incidentTypes,
    severityLevels,
    timeRangeType,
    customTimeStart,
    customTimeEnd,
    weatherRelated: normalizeBoolean(body?.weatherRelated, false),
    aiConfidenceMin,
    frequencyType,
    digestInterval: frequencyType === "digest" ? digestInterval : null,
    muteDuplicates: normalizeBoolean(body?.muteDuplicates, true),
    deliveryApp,
    deliveryEmail,
    deliverySms,
  };
}

async function saveZone(client, alertId, zone) {
  if (zone.zoneType === "radius") {
    await client.query(
      `
        INSERT INTO app.alert_zones (
          alert_id,
          display_name,
          zone_type,
          center,
          radius_m
        )
        VALUES (
          $1,
          $2,
          'radius',
          ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
          $5
        )
      `,
      [alertId, zone.displayName, zone.center.lng, zone.center.lat, zone.radiusM]
    );
    return;
  }

  await client.query(
    `
      INSERT INTO app.alert_zones (
        alert_id,
        display_name,
        zone_type,
        admin_area_id
      )
      VALUES ($1, $2, 'admin_area', $3)
    `,
    [alertId, zone.displayName, zone.adminAreaId]
  );
}

router.get("/", verifyToken, async (req, res, next) => {
  try {
    const includeGeometry = parseBooleanQuery(req.query?.includeGeometry, false);
    const items = await fetchAlertsForUser(req.user.userId, { includeGeometry });
    return res.status(200).json({ items });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", verifyToken, async (req, res, next) => {
  try {
    const includeGeometry = parseBooleanQuery(req.query?.includeGeometry, false);
    const item = await getAlertForUserOrThrow(req.user.userId, req.params.id, pool, { includeGeometry });
    return res.status(200).json({ item });
  } catch (error) {
    return next(error);
  }
});

router.post("/", verifyToken, async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const rule = validateAlertPayload(req.body);
    const zone = await validateZoneInput(client, req.body?.zone);

    await client.query("BEGIN");
    transactionStarted = true;

    const insertResult = await client.query(
      `
        INSERT INTO app.alert_rules (
          user_id,
          name,
          status,
          incident_types,
          severity_levels,
          time_range_type,
          custom_time_start,
          custom_time_end,
          weather_related,
          ai_confidence_min,
          frequency_type,
          digest_interval,
          mute_duplicates,
          delivery_app,
          delivery_email,
          delivery_sms
        )
        VALUES (
          $1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        RETURNING id
      `,
      [
        req.user.userId,
        rule.name,
        rule.incidentTypes,
        rule.severityLevels,
        rule.timeRangeType,
        rule.customTimeStart,
        rule.customTimeEnd,
        rule.weatherRelated,
        rule.aiConfidenceMin,
        rule.frequencyType,
        rule.digestInterval,
        rule.muteDuplicates,
        rule.deliveryApp,
        rule.deliveryEmail,
        rule.deliverySms,
      ]
    );

    const alertId = insertResult.rows[0]?.id;
    await saveZone(client, alertId, zone);

    await client.query("COMMIT");
    transactionStarted = false;

    const item = await getAlertForUserOrThrow(req.user.userId, alertId);
    return res.status(201).json({ item });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    return next(error);
  } finally {
    client.release();
  }
});

router.put("/:id", verifyToken, async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const rule = validateAlertPayload(req.body);
    const zone = await validateZoneInput(client, req.body?.zone);

    const existing = await client.query(
      `
        SELECT id
        FROM app.alert_rules
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [req.params.id, req.user.userId]
    );

    if (existing.rows.length === 0) {
      throw createError(404, "Alert not found");
    }

    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(
      `
        UPDATE app.alert_rules
        SET
          name = $1,
          incident_types = $2,
          severity_levels = $3,
          time_range_type = $4,
          custom_time_start = $5,
          custom_time_end = $6,
          weather_related = $7,
          ai_confidence_min = $8,
          frequency_type = $9,
          digest_interval = $10,
          mute_duplicates = $11,
          delivery_app = $12,
          delivery_email = $13,
          delivery_sms = $14,
          updated_at = NOW()
        WHERE id = $15
          AND user_id = $16
      `,
      [
        rule.name,
        rule.incidentTypes,
        rule.severityLevels,
        rule.timeRangeType,
        rule.customTimeStart,
        rule.customTimeEnd,
        rule.weatherRelated,
        rule.aiConfidenceMin,
        rule.frequencyType,
        rule.digestInterval,
        rule.muteDuplicates,
        rule.deliveryApp,
        rule.deliveryEmail,
        rule.deliverySms,
        req.params.id,
        req.user.userId,
      ]
    );

    await client.query(`DELETE FROM app.alert_zones WHERE alert_id = $1`, [req.params.id]);
    await saveZone(client, req.params.id, zone);

    await client.query("COMMIT");
    transactionStarted = false;

    const item = await getAlertForUserOrThrow(req.user.userId, req.params.id);
    return res.status(200).json({ item });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    return next(error);
  } finally {
    client.release();
  }
});

router.patch("/:id/status", verifyToken, async (req, res, next) => {
  try {
    const status = normalizeString(req.body?.status).toLowerCase();
    if (!ALLOWED_STATUSES.has(status)) {
      throw createError(400, "status must be active, paused, or archived");
    }

    const updateResult = await pool.query(
      `
        UPDATE app.alert_rules
        SET status = $1, updated_at = NOW()
        WHERE id = $2
          AND user_id = $3
        RETURNING id
      `,
      [status, req.params.id, req.user.userId]
    );

    if (updateResult.rows.length === 0) {
      throw createError(404, "Alert not found");
    }

    const item = await getAlertForUserOrThrow(req.user.userId, req.params.id);
    return res.status(200).json({ item });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", verifyToken, async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const existing = await client.query(
      `
        SELECT id
        FROM app.alert_rules
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
      `,
      [req.params.id, req.user.userId]
    );

    if (existing.rows.length === 0) {
      throw createError(404, "Alert not found");
    }

    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(`DELETE FROM app.alert_trigger_log WHERE alert_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM app.alert_zones WHERE alert_id = $1`, [req.params.id]);
    await client.query(
      `
        DELETE FROM app.alert_rules
        WHERE id = $1
          AND user_id = $2
      `,
      [req.params.id, req.user.userId]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({ ok: true });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    return next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
