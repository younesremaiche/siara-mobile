const pool = require("../db");

const ALLOWED_TYPES = new Set(["zone", "route", "point"]);
const ALLOWED_THRESHOLDS = new Set(["low", "moderate", "high", "extreme"]);
const MAX_NAME_LEN = 80;
const MAX_RADIUS_METERS = 50000; // 50 km
const MIN_RADIUS_METERS = 100;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureUuid(value, label) {
  const text = String(value || "").trim();
  if (!UUID_REGEX.test(text)) {
    const error = new Error(`Invalid ${label}`);
    error.status = 400;
    throw error;
  }
  return text;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function normalisePayload(input) {
  if (!input || typeof input !== "object") badRequest("Payload is required");

  const name = String(input.name || "").trim().slice(0, MAX_NAME_LEN);
  if (!name) badRequest("name is required");

  const type = String(input.type || "").trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) badRequest("type must be zone, route or point");

  const threshold = String(input.riskThreshold || "high").trim().toLowerCase();
  if (!ALLOWED_THRESHOLDS.has(threshold)) badRequest("risk_threshold invalid");

  let centerLat = safeNumber(input.centerLat ?? input.center?.lat);
  let centerLng = safeNumber(input.centerLng ?? input.center?.lng);
  let radius = safeNumber(input.radiusMeters);
  let geometry = null;

  if (type === "zone" || type === "point") {
    if (centerLat == null || centerLng == null) {
      badRequest("center coordinates are required for zone/point subscriptions");
    }
    if (type === "zone") {
      if (radius == null) radius = 1500;
      radius = Math.max(MIN_RADIUS_METERS, Math.min(MAX_RADIUS_METERS, Math.round(radius)));
    } else {
      radius = Math.max(MIN_RADIUS_METERS, Math.min(2000, radius || 500));
    }
  } else if (type === "route") {
    const path = Array.isArray(input.geometry?.path)
      ? input.geometry.path
      : Array.isArray(input.path)
        ? input.path
        : null;
    if (!path || path.length < 2) {
      badRequest("route subscriptions need a path with at least 2 points");
    }
    geometry = { path };
    if (centerLat == null || centerLng == null) {
      const mid = path[Math.floor(path.length / 2)];
      centerLat = Array.isArray(mid) ? safeNumber(mid[0]) : safeNumber(mid?.lat);
      centerLng = Array.isArray(mid) ? safeNumber(mid[1]) : safeNumber(mid?.lng);
    }
    if (radius == null) radius = 1000;
    radius = Math.max(MIN_RADIUS_METERS, Math.min(MAX_RADIUS_METERS, Math.round(radius)));
  }

  return {
    name,
    type,
    threshold,
    centerLat,
    centerLng,
    radius,
    geometry,
    notifyOnReports: input.notifyOnReports !== false,
    notifyOnHighRisk: input.notifyOnHighRisk !== false,
    notifyOnPoliceVerified: input.notifyOnPoliceVerified !== false,
    isActive: input.isActive !== false,
  };
}

function rowToDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    centerLat: row.center_lat != null ? Number(row.center_lat) : null,
    centerLng: row.center_lng != null ? Number(row.center_lng) : null,
    radiusMeters: row.radius_meters != null ? Number(row.radius_meters) : null,
    geometry: row.geometry || null,
    riskThreshold: row.risk_threshold,
    notifyOnReports: Boolean(row.notify_on_reports),
    notifyOnHighRisk: Boolean(row.notify_on_high_risk),
    notifyOnPoliceVerified: Boolean(row.notify_on_police_verified),
    isActive: Boolean(row.is_active),
    lastEvaluatedAt: row.last_evaluated_at
      ? new Date(row.last_evaluated_at).toISOString()
      : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

async function listMySubscriptions(userId) {
  const safeId = ensureUuid(userId, "userId");
  const result = await pool.query(
    `SELECT * FROM app.danger_subscriptions
     WHERE user_id = $1
     ORDER BY is_active DESC, created_at DESC`,
    [safeId],
  );
  return { items: (result.rows || []).map(rowToDto) };
}

async function createSubscription(userId, payload) {
  const safeId = ensureUuid(userId, "userId");
  const data = normalisePayload(payload);
  const result = await pool.query(
    `INSERT INTO app.danger_subscriptions (
      user_id, name, type,
      center_lat, center_lng, radius_meters, geometry,
      risk_threshold,
      notify_on_reports, notify_on_high_risk, notify_on_police_verified,
      is_active
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6, $7::jsonb,
      $8,
      $9, $10, $11,
      $12
    )
    RETURNING *`,
    [
      safeId,
      data.name,
      data.type,
      data.centerLat,
      data.centerLng,
      data.radius,
      data.geometry ? JSON.stringify(data.geometry) : null,
      data.threshold,
      data.notifyOnReports,
      data.notifyOnHighRisk,
      data.notifyOnPoliceVerified,
      data.isActive,
    ],
  );
  return rowToDto(result.rows[0]);
}

async function updateSubscription(userId, subscriptionId, payload) {
  const safeUserId = ensureUuid(userId, "userId");
  const safeSubId = ensureUuid(subscriptionId, "subscription id");
  const data = normalisePayload(payload);
  const result = await pool.query(
    `UPDATE app.danger_subscriptions SET
       name = $1,
       type = $2,
       center_lat = $3,
       center_lng = $4,
       radius_meters = $5,
       geometry = $6::jsonb,
       risk_threshold = $7,
       notify_on_reports = $8,
       notify_on_high_risk = $9,
       notify_on_police_verified = $10,
       is_active = $11,
       updated_at = NOW()
     WHERE id = $12 AND user_id = $13
     RETURNING *`,
    [
      data.name,
      data.type,
      data.centerLat,
      data.centerLng,
      data.radius,
      data.geometry ? JSON.stringify(data.geometry) : null,
      data.threshold,
      data.notifyOnReports,
      data.notifyOnHighRisk,
      data.notifyOnPoliceVerified,
      data.isActive,
      safeSubId,
      safeUserId,
    ],
  );
  if (result.rowCount === 0) {
    const error = new Error("Subscription not found");
    error.status = 404;
    throw error;
  }
  return rowToDto(result.rows[0]);
}

async function deleteSubscription(userId, subscriptionId) {
  const safeUserId = ensureUuid(userId, "userId");
  const safeSubId = ensureUuid(subscriptionId, "subscription id");
  const result = await pool.query(
    `DELETE FROM app.danger_subscriptions
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [safeSubId, safeUserId],
  );
  if (result.rowCount === 0) {
    const error = new Error("Subscription not found");
    error.status = 404;
    throw error;
  }
  return { id: safeSubId };
}

module.exports = {
  listMySubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
};
