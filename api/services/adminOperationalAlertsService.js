const createError = require("http-errors");

const pool = require("../db");
const {
  emitNotificationCreatedToUser,
  hasActiveNotificationSubscriber,
} = require("./notificationSocket");
const {
  mapNotificationRow,
  markNotificationAsSent,
} = require("./notificationsService");
const { evaluateAndSendPushForNotification } = require("./pushService");

const ALERT_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALERT_TABS = Object.freeze({
  all: "all",
  active: "active",
  scheduled: "scheduled",
  expired: "expired",
  emergency: "emergency",
});
const ALLOWED_ALERT_TYPES = new Set([
  "incident",
  "weather",
  "roadwork",
  "closure",
  "emergency",
  "advisory",
]);
const ALLOWED_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const ALLOWED_SOURCE_TYPES = new Set(["manual", "report", "weather", "system"]);
const ALLOWED_AUDIENCE_SCOPES = new Set([
  "users_in_zone",
  "all_users",
  "subscribed_users_only",
]);
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const OPERATIONAL_ALERT_NOTIFICATION_EVENTS = Object.freeze({
  started: "OPERATIONAL_ALERT_STARTED",
  expired: "OPERATIONAL_ALERT_EXPIRED",
});
const IN_APP_NOTIFICATION_CHANNEL = "websocket";

function normalizeTab(tab) {
  const normalized = String(tab || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ALERT_TABS, normalized)
    ? normalized
    : ALERT_TABS.all;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized : null;
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizeUuid(value, fieldName, { required = false } = {}) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  if (!ALERT_ID_REGEX.test(normalized)) {
    throw createError(400, `${fieldName} must be a valid id`);
  }

  return normalized;
}

function normalizePositiveInteger(value, fieldName, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function normalizeDateTime(value, fieldName, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createError(400, `${fieldName} must be a valid datetime`);
  }

  return date;
}

function normalizeOptionalNote(value) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw createError(400, "note must be text");
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > 2000) {
    throw createError(400, "note must be at most 2000 characters");
  }

  return normalized;
}

function normalizeAlertType(value, fieldName = "alertType", { required = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  if (!ALLOWED_ALERT_TYPES.has(normalized)) {
    throw createError(400, `${fieldName} is invalid`);
  }

  return normalized;
}

function normalizeSeverity(value, fieldName = "severity", { required = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  if (!ALLOWED_SEVERITIES.has(normalized)) {
    throw createError(400, `${fieldName} is invalid`);
  }

  return normalized;
}

function normalizeSourceType(value, { required = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw createError(400, "sourceType is required");
    }
    return "manual";
  }

  if (!ALLOWED_SOURCE_TYPES.has(normalized)) {
    throw createError(400, "sourceType is invalid");
  }

  return normalized;
}

function normalizeAudienceScope(value, { required = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw createError(400, "audienceScope is required");
    }
    return "users_in_zone";
  }

  if (!ALLOWED_AUDIENCE_SCOPES.has(normalized)) {
    throw createError(400, "audienceScope is invalid");
  }

  return normalized;
}

function normalizeZoneType(value, { required = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw createError(400, "zoneType is required");
    }
    return "admin_area";
  }

  if (normalized !== "admin_area") {
    throw createError(400, "zoneType must be admin_area for this version");
  }

  return normalized;
}

function normalizeRequestedStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized !== "draft") {
    throw createError(400, "Only draft may be explicitly requested");
  }

  return "draft";
}

function normalizePaginationValue(value, fallback, { min = 1, max = 100 } = {}) {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw createError(400, "Pagination values must be integers");
  }

  return Math.min(max, Math.max(min, parsed));
}

function buildOperationalAlertDisplayId(alertId) {
  const normalized = String(alertId || "").replace(/-/g, "").toUpperCase();
  return normalized ? `ALR-${normalized.slice(0, 6)}` : "ALR-UNKNOWN";
}

function formatActorName(name, email) {
  const normalizedName = normalizeOptionalString(name);
  if (normalizedName) {
    return normalizedName;
  }

  return normalizeOptionalString(email) || "Admin";
}

function deriveOperationalAlertStatus(alert, now = new Date()) {
  if (String(alert?.status || "").trim().toLowerCase() === "cancelled") {
    return "cancelled";
  }

  if (String(alert?.status || "").trim().toLowerCase() === "draft") {
    return "draft";
  }

  const startsAt = alert?.startsAt instanceof Date ? alert.startsAt : new Date(alert?.startsAt);
  const endsAt = alert?.endsAt instanceof Date ? alert.endsAt : new Date(alert?.endsAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return "expired";
  }

  if (now < startsAt) {
    return "scheduled";
  }

  if (now >= startsAt && now < endsAt) {
    return "active";
  }

  return "expired";
}

function mapOperationalAlertTrigger({ sourceType, status }) {
  if (sourceType === "weather" || sourceType === "system") {
    return "auto";
  }

  if (status === "scheduled") {
    return "scheduled";
  }

  return "manual";
}

function formatOperationalAlertDuration(alert, now = new Date()) {
  const status = String(alert?.status || "").trim().toLowerCase();
  const startsAt = alert?.startsAt instanceof Date ? alert.startsAt : new Date(alert?.startsAt);
  const endsAt = alert?.endsAt instanceof Date ? alert.endsAt : new Date(alert?.endsAt);

  if (status === "cancelled") {
    return "Cancelled";
  }

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return "\u2014";
  }

  if (status === "scheduled" || now < startsAt) {
    return `Starts ${startsAt.toLocaleTimeString("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;
  }

  if (status === "expired" || now >= endsAt) {
    return "Expired";
  }

  const remainingMs = Math.max(0, endsAt.getTime() - now.getTime());
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const days = Math.floor(remainingMs / dayMs);
  const hours = Math.floor(remainingMs / hourMs);
  const minutes = Math.max(1, Math.ceil(remainingMs / minuteMs));

  if (days >= 1) {
    return `${days} day${days === 1 ? "" : "s"} remaining`;
  }

  if (hours >= 1) {
    return `${hours}h remaining`;
  }

  return `${minutes}m remaining`;
}

function formatTemplateDuration(minutes) {
  const parsed = Number(minutes);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "\u2014";
  }

  if (parsed % (24 * 60) === 0) {
    const days = parsed / (24 * 60);
    return `${days}d`;
  }

  if (parsed % 60 === 0) {
    const hours = parsed / 60;
    return `${hours}h`;
  }

  return `${parsed}m`;
}

function mapOperationalAlertSeverityToPriority(severity) {
  switch (String(severity || "").trim().toLowerCase()) {
    case "critical":
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
    default:
      return 3;
  }
}

function formatOperationalAlertDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function resolveOperationalAlertNotificationEvent(change) {
  const nextStatus = String(change?.toStatus || "").trim().toLowerCase();

  if (nextStatus === "active" && change?.notifyOnStart) {
    return OPERATIONAL_ALERT_NOTIFICATION_EVENTS.started;
  }

  if (nextStatus === "expired" && change?.notifyOnExpire) {
    return OPERATIONAL_ALERT_NOTIFICATION_EVENTS.expired;
  }

  return null;
}

function buildOperationalAlertNotificationBody(alert, eventType) {
  const zoneName = alert?.zoneName || "the targeted zone";
  const endsAtLabel = formatOperationalAlertDateTime(alert?.endsAt);

  if (eventType === OPERATIONAL_ALERT_NOTIFICATION_EVENTS.expired) {
    return endsAtLabel
      ? `${alert.title} in ${zoneName} has expired. Ended at ${endsAtLabel}.`
      : `${alert.title} in ${zoneName} has expired.`;
  }

  if (endsAtLabel) {
    return `${alert.title} is now active in ${zoneName}. Active until ${endsAtLabel}.`;
  }

  return `${alert.title} is now active in ${zoneName}.`;
}

function buildOperationalAlertNotificationData(alert, eventType) {
  const nextStatus =
    eventType === OPERATIONAL_ALERT_NOTIFICATION_EVENTS.expired ? "expired" : "active";

  return {
    operationalAlertId: alert.id,
    adminAreaId: alert.adminAreaId,
    alertType: alert.alertType,
    severity: alert.severity,
    status: nextStatus,
    zoneName: alert.zoneName,
    locationLabel: alert.zoneName,
    incidentType: alert.alertType,
    startsAt: alert.startsAt ? new Date(alert.startsAt).toISOString() : null,
    endsAt: alert.endsAt ? new Date(alert.endsAt).toISOString() : null,
    sourceType: alert.sourceType || "manual",
  };
}

async function fetchAdminAreaOrThrow(adminAreaId, db = pool) {
  const result = await db.query(
    `
      SELECT
        aa.id,
        aa.name,
        aa.level,
        aa.parent_id,
        CASE
          WHEN aa.level = 'commune' THEN aa.parent_id
          WHEN aa.level = 'wilaya' THEN aa.id
          ELSE NULL
        END AS wilaya_id,
        CASE
          WHEN aa.level = 'commune' THEN parent.name
          WHEN aa.level = 'wilaya' THEN aa.name
          ELSE NULL
        END AS wilaya_name
      FROM gis.admin_areas aa
      LEFT JOIN gis.admin_areas parent
        ON parent.id = aa.parent_id
      WHERE aa.id = $1
      LIMIT 1
    `,
    [adminAreaId],
  );

  const row = result.rows[0] || null;
  if (!row) {
    throw createError(404, "Selected admin area was not found");
  }

  return {
    id: Number(row.id),
    name: row.name,
    level: row.level,
    parentId: row.parent_id != null ? Number(row.parent_id) : null,
    wilayaId: row.wilaya_id != null ? Number(row.wilaya_id) : null,
    wilayaName: row.wilaya_name || null,
  };
}

function buildOperationalAlertBaseQuery() {
  return `
    WITH base AS (
      SELECT
        oa.id,
        oa.title,
        oa.description,
        oa.alert_type,
        oa.severity,
        oa.status,
        oa.starts_at,
        oa.ends_at,
        oa.published_at,
        oa.cancelled_at,
        oa.created_at,
        oa.updated_at,
        oa.created_by,
        oa.updated_by,
        oa.cancelled_by,
        oa.source_type,
        oa.source_report_id,
        oa.zone_type,
        oa.admin_area_id,
        oa.zone_label,
        oa.audience_scope,
        oa.notify_on_start,
        oa.notify_on_expire,
        oa.send_push,
        oa.send_email,
        oa.send_sms,
        oa.template_id,
        oa.metadata,
        aa.name AS admin_area_name,
        aa.level AS admin_area_level,
        aa.parent_id AS admin_area_parent_id,
        CASE
          WHEN aa.level = 'commune' THEN parent.id
          WHEN aa.level = 'wilaya' THEN aa.id
          ELSE NULL
        END AS wilaya_id,
        CASE
          WHEN aa.level = 'commune' THEN parent.name
          WHEN aa.level = 'wilaya' THEN aa.name
          ELSE NULL
        END AS wilaya_name,
        concat_ws(' ', creator.first_name, creator.last_name) AS created_by_name,
        creator.email AS created_by_email,
        concat_ws(' ', updater.first_name, updater.last_name) AS updated_by_name,
        updater.email AS updated_by_email,
        concat_ws(' ', canceller.first_name, canceller.last_name) AS cancelled_by_name,
        canceller.email AS cancelled_by_email,
        tpl.name AS template_name,
        tpl.default_duration_minutes AS template_duration_minutes
      FROM app.operational_alerts oa
      LEFT JOIN gis.admin_areas aa
        ON aa.id = oa.admin_area_id
      LEFT JOIN gis.admin_areas parent
        ON parent.id = aa.parent_id
      LEFT JOIN auth.users creator
        ON creator.id = oa.created_by
      LEFT JOIN auth.users updater
        ON updater.id = oa.updated_by
      LEFT JOIN auth.users canceller
        ON canceller.id = oa.cancelled_by
      LEFT JOIN app.operational_alert_templates tpl
        ON tpl.id = oa.template_id
    )
  `;
}

function buildTabWhere(tab) {
  switch (normalizeTab(tab)) {
    case ALERT_TABS.active:
      return `base.status = 'active'`;
    case ALERT_TABS.scheduled:
      return `base.status = 'scheduled'`;
    case ALERT_TABS.expired:
      return `base.status = 'expired'`;
    case ALERT_TABS.emergency:
      return `base.status <> 'draft' AND base.alert_type = 'emergency'`;
    case ALERT_TABS.all:
    default:
      return `base.status <> 'draft'`;
  }
}

function buildOrderBy(tab) {
  switch (normalizeTab(tab)) {
    case ALERT_TABS.active:
      return `base.ends_at ASC, base.created_at DESC`;
    case ALERT_TABS.scheduled:
      return `base.starts_at ASC, base.created_at DESC`;
    case ALERT_TABS.expired:
      return `base.ends_at DESC, base.created_at DESC`;
    case ALERT_TABS.emergency:
      return `base.created_at DESC, base.id DESC`;
    case ALERT_TABS.all:
    default:
      return `
        CASE base.status
          WHEN 'active' THEN 0
          WHEN 'scheduled' THEN 1
          WHEN 'expired' THEN 2
          WHEN 'cancelled' THEN 3
          ELSE 4
        END,
        base.created_at DESC,
        base.id DESC
      `;
  }
}

function mapOperationalAlertRow(row, now = new Date()) {
  const startsAt = row.starts_at ? new Date(row.starts_at) : null;
  const endsAt = row.ends_at ? new Date(row.ends_at) : null;
  const status = deriveOperationalAlertStatus(
    {
      status: row.status,
      startsAt,
      endsAt,
    },
    now,
  );

  return {
    id: row.id,
    displayId: buildOperationalAlertDisplayId(row.id),
    title: row.title,
    description: row.description || "",
    zone: row.admin_area_name || row.zone_label || "Unknown zone",
    zoneLabel: row.zone_label || row.admin_area_name || "Unknown zone",
    severity: row.severity,
    type: row.alert_type,
    trigger: mapOperationalAlertTrigger({
      sourceType: row.source_type,
      status,
    }),
    duration: formatOperationalAlertDuration(
      {
        status,
        startsAt,
        endsAt,
      },
      now,
    ),
    audience: null,
    status,
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    createdBy: formatActorName(row.created_by_name, row.created_by_email),
    updatedBy: row.updated_by ? formatActorName(row.updated_by_name, row.updated_by_email) : null,
    cancelledBy: row.cancelled_by ? formatActorName(row.cancelled_by_name, row.cancelled_by_email) : null,
    createdById: row.created_by,
    adminAreaId: row.admin_area_id != null ? Number(row.admin_area_id) : null,
    adminArea: row.admin_area_id != null ? {
      id: Number(row.admin_area_id),
      name: row.admin_area_name || row.zone_label || "Unknown zone",
      level: row.admin_area_level || null,
      parentId: row.admin_area_parent_id != null ? Number(row.admin_area_parent_id) : null,
      wilayaId: row.wilaya_id != null ? Number(row.wilaya_id) : null,
      wilayaName: row.wilaya_name || null,
    } : null,
    templateId: row.template_id || null,
    templateName: row.template_name || null,
    sourceType: row.source_type,
    sourceReportId: row.source_report_id || null,
    zoneType: row.zone_type,
    audienceScope: row.audience_scope,
    notifyOnStart: Boolean(row.notify_on_start),
    notifyOnExpire: Boolean(row.notify_on_expire),
    sendPush: Boolean(row.send_push),
    sendEmail: Boolean(row.send_email),
    sendSms: Boolean(row.send_sms),
    metadata: row.metadata || {},
  };
}

async function recordOperationalAlertEvent(
  client,
  {
    alertId,
    eventType,
    actorUserId = null,
    fromStatus = null,
    toStatus = null,
    note = null,
    metadata = {},
  },
) {
  await client.query(
    `
      INSERT INTO app.operational_alert_events (
        alert_id,
        event_type,
        actor_user_id,
        from_status,
        to_status,
        note,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      alertId,
      eventType,
      actorUserId,
      fromStatus,
      toStatus,
      note,
      JSON.stringify(normalizeMetadata(metadata)),
    ],
  );
}

async function fetchOperationalAlertNotificationContext(alertId, db = pool) {
  const result = await db.query(
    `
      SELECT
        oa.id,
        oa.title,
        oa.alert_type,
        oa.severity,
        oa.status,
        oa.starts_at,
        oa.ends_at,
        oa.admin_area_id,
        oa.zone_label,
        oa.audience_scope,
        oa.source_type,
        oa.send_push,
        oa.send_email,
        oa.send_sms,
        aa.name AS admin_area_name
      FROM app.operational_alerts oa
      LEFT JOIN gis.admin_areas aa
        ON aa.id = oa.admin_area_id
      WHERE oa.id = $1
      LIMIT 1
    `,
    [alertId],
  );

  const row = result.rows[0] || null;
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    alertType: row.alert_type,
    severity: row.severity,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    adminAreaId: row.admin_area_id != null ? Number(row.admin_area_id) : null,
    zoneName: row.admin_area_name || row.zone_label || "Unknown zone",
    audienceScope: row.audience_scope || "users_in_zone",
    sourceType: row.source_type || "manual",
    sendPush: Boolean(row.send_push),
    sendEmail: Boolean(row.send_email),
    sendSms: Boolean(row.send_sms),
  };
}

async function createOperationalAlertNotifications(alert, eventType, db = pool) {
  if (!alert?.id || !alert.adminAreaId || !eventType) {
    return [];
  }

  const result = await db.query(
    `
      WITH recipients AS (
        SELECT DISTINCT ar.user_id
        FROM app.alert_rules ar
        JOIN app.alert_zones az
          ON az.alert_id = ar.id
        WHERE ar.status = 'active'
          AND az.zone_type = 'admin_area'
          AND az.admin_area_id = $1::bigint
      ),
      inserted AS (
        INSERT INTO app.notifications (
          user_id,
          report_id,
          operational_alert_id,
          channel,
          status,
          priority,
          event_type,
          title,
          body,
          data
        )
        SELECT
          recipients.user_id,
          NULL,
          $2::uuid,
          $3::varchar,
          'pending',
          $4::integer,
          $5::varchar,
          $6::text,
          $7::text,
          $8::jsonb
        FROM recipients
        WHERE NOT EXISTS (
          SELECT 1
          FROM app.notifications n
          WHERE n.user_id = recipients.user_id
            AND n.operational_alert_id = $2::uuid
            AND n.event_type = $5::varchar
            AND n.channel = $3::varchar
        )
        RETURNING *
      )
      SELECT *
      FROM inserted
      ORDER BY created_at ASC, id ASC
    `,
    [
      alert.adminAreaId,
      alert.id,
      IN_APP_NOTIFICATION_CHANNEL,
      mapOperationalAlertSeverityToPriority(alert.severity),
      eventType,
      alert.title,
      buildOperationalAlertNotificationBody(alert, eventType),
      JSON.stringify(buildOperationalAlertNotificationData(alert, eventType)),
    ],
  );

  return result.rows.map(mapNotificationRow);
}

async function dispatchOperationalAlertNotification(notification, { sendPush = true } = {}) {
  if (!notification?.id || !notification?.userId) {
    return;
  }

  if (sendPush) {
    evaluateAndSendPushForNotification(notification, pool).catch((error) => {
      console.error("[operational-alerts] push_delivery_failed", {
        message: error.message,
        notificationId: notification.id,
        userId: notification.userId,
      });
    });
  }

  if (!hasActiveNotificationSubscriber(notification.userId)) {
    return;
  }

  try {
    const sentNotification = await markNotificationAsSent(notification.id, pool);
    emitNotificationCreatedToUser(notification.userId, sentNotification || notification);
  } catch (error) {
    console.error("[operational-alerts] live_emit_failed", {
      message: error.message,
      notificationId: notification.id,
      userId: notification.userId,
    });
    emitNotificationCreatedToUser(notification.userId, notification);
  }
}

async function queueOperationalAlertFanout(changedAlerts, db = pool) {
  if (!Array.isArray(changedAlerts) || changedAlerts.length === 0) {
    return [];
  }

  const createdNotifications = [];

  for (const change of changedAlerts) {
    const eventType = resolveOperationalAlertNotificationEvent(change);
    if (!eventType) {
      continue;
    }

    const alert = await fetchOperationalAlertNotificationContext(change.id, db);
    if (!alert) {
      continue;
    }

    // Version 1 recipient matching is subscription-backed: active user alert rules
    // targeting the same admin area receive the operational alert notification.
    const insertedNotifications = await createOperationalAlertNotifications(alert, eventType, db);

    if (alert.sendEmail || alert.sendSms) {
      // TODO: Reuse the app's outbound email/SMS pipeline for operational alerts when available.
    }

    if (insertedNotifications.length > 0) {
      createdNotifications.push(...insertedNotifications);
      await Promise.all(
        insertedNotifications.map((notification) =>
          dispatchOperationalAlertNotification(notification, { sendPush: alert.sendPush })),
      );
    }
  }

  return createdNotifications;
}

async function syncOperationalAlertStatuses(db = pool, now = new Date()) {
  const result = await db.query(
    `
      WITH status_targets AS (
        SELECT
          oa.id,
          oa.status AS from_status,
          oa.notify_on_start,
          oa.notify_on_expire,
          oa.title,
          CASE
            WHEN oa.status = 'cancelled' THEN 'cancelled'
            WHEN oa.status = 'draft' THEN 'draft'
            WHEN $1::timestamptz < oa.starts_at THEN 'scheduled'
            WHEN $1::timestamptz >= oa.starts_at AND $1::timestamptz < oa.ends_at THEN 'active'
            ELSE 'expired'
          END AS to_status
        FROM app.operational_alerts oa
      ),
      updated AS (
        UPDATE app.operational_alerts oa
        SET
          status = status_targets.to_status,
          published_at = CASE
            WHEN status_targets.to_status <> 'draft' THEN COALESCE(oa.published_at, now())
            ELSE oa.published_at
          END,
          updated_at = now()
        FROM status_targets
        WHERE oa.id = status_targets.id
          AND status_targets.from_status <> status_targets.to_status
          AND status_targets.from_status <> 'cancelled'
          AND status_targets.from_status <> 'draft'
        RETURNING
          oa.id,
          status_targets.from_status,
          status_targets.to_status,
          status_targets.notify_on_start,
          status_targets.notify_on_expire,
          status_targets.title
      ),
      inserted_events AS (
        INSERT INTO app.operational_alert_events (
          alert_id,
          event_type,
          actor_user_id,
          from_status,
          to_status,
          note,
          metadata
        )
        SELECT
          updated.id,
          CASE
            WHEN updated.to_status = 'active' THEN 'activated'
            WHEN updated.to_status = 'expired' THEN 'expired'
            ELSE 'updated'
          END,
          NULL,
          updated.from_status,
          updated.to_status,
          NULL,
          '{}'::jsonb
        FROM updated
        WHERE updated.to_status IN ('active', 'expired')
      )
      SELECT *
      FROM updated
    `,
    [now],
  );

  const changedAlerts = result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    notifyOnStart: Boolean(row.notify_on_start),
    notifyOnExpire: Boolean(row.notify_on_expire),
  }));

  await queueOperationalAlertFanout(changedAlerts, db);
  return changedAlerts;
}

async function fetchOperationalAlertCounts(db = pool) {
  const result = await db.query(
    `
      ${buildOperationalAlertBaseQuery()}
      SELECT
        count(*) FILTER (WHERE base.status <> 'draft')::int AS all_count,
        count(*) FILTER (WHERE base.status = 'active')::int AS active_count,
        count(*) FILTER (WHERE base.status = 'scheduled')::int AS scheduled_count,
        count(*) FILTER (WHERE base.status = 'expired')::int AS expired_count,
        count(*) FILTER (
          WHERE base.status <> 'draft'
            AND base.alert_type = 'emergency'
        )::int AS emergency_count,
        (
          SELECT count(*)::int
          FROM app.operational_alert_templates tpl
          WHERE tpl.is_active = true
        ) AS template_count
      FROM base
    `,
  );

  const row = result.rows[0] || {};

  return {
    all: Number(row.all_count || 0),
    active: Number(row.active_count || 0),
    scheduled: Number(row.scheduled_count || 0),
    expired: Number(row.expired_count || 0),
    emergency: Number(row.emergency_count || 0),
    templates: Number(row.template_count || 0),
  };
}

async function listOperationalAlerts(
  {
    tab = ALERT_TABS.all,
    search = "",
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
  } = {},
  db = pool,
) {
  await syncOperationalAlertStatuses(db);

  const normalizedTab = normalizeTab(tab);
  const currentPage = normalizePaginationValue(page, DEFAULT_PAGE, { min: 1, max: 1000 });
  const currentPageSize = normalizePaginationValue(pageSize, DEFAULT_PAGE_SIZE, { min: 1, max: 100 });
  const offset = (currentPage - 1) * currentPageSize;
  const trimmedSearch = String(search || "").trim().toLowerCase();
  const values = [];
  const whereClauses = [buildTabWhere(normalizedTab)];

  if (trimmedSearch) {
    values.push(`%${trimmedSearch}%`);
    whereClauses.push(`
      (
        lower(base.title) LIKE $${values.length}
        OR lower(coalesce(base.admin_area_name, base.zone_label, '')) LIKE $${values.length}
        OR lower(base.alert_type) LIKE $${values.length}
      )
    `);
  }

  const filterValues = [...values];
  values.push(currentPageSize, offset);

  const [counts, totalResult, rowsResult] = await Promise.all([
    fetchOperationalAlertCounts(db),
    db.query(
      `
        ${buildOperationalAlertBaseQuery()}
        SELECT count(*)::int AS total_count
        FROM base
        WHERE ${whereClauses.join(" AND ")}
      `,
      filterValues,
    ),
    db.query(
      `
        ${buildOperationalAlertBaseQuery()}
        SELECT *
        FROM base
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY ${buildOrderBy(normalizedTab)}
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values,
    ),
  ]);

  const total = Number(totalResult.rows[0]?.total_count || 0);
  const now = new Date();
  const items = rowsResult.rows.map((row) => mapOperationalAlertRow(row, now));

  return {
    items,
    counts,
    pagination: {
      page: currentPage,
      pageSize: currentPageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / currentPageSize) : 1,
      returned: items.length,
    },
  };
}

async function fetchOperationalAlertEvents(alertId, db = pool) {
  const result = await db.query(
    `
      SELECT
        e.id,
        e.event_type,
        e.from_status,
        e.to_status,
        e.note,
        e.metadata,
        e.created_at,
        concat_ws(' ', actor.first_name, actor.last_name) AS actor_name,
        actor.email AS actor_email
      FROM app.operational_alert_events e
      LEFT JOIN auth.users actor
        ON actor.id = e.actor_user_id
      WHERE e.alert_id = $1
      ORDER BY e.created_at DESC, e.id DESC
    `,
    [alertId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    eventType: row.event_type,
    fromStatus: row.from_status || null,
    toStatus: row.to_status || null,
    note: row.note || "",
    metadata: row.metadata || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    actor: formatActorName(row.actor_name, row.actor_email),
  }));
}

async function getOperationalAlertById(alertId, db = pool) {
  const normalizedAlertId = normalizeUuid(alertId, "id", { required: true });
  await syncOperationalAlertStatuses(db);

  const result = await db.query(
    `
      ${buildOperationalAlertBaseQuery()}
      SELECT *
      FROM base
      WHERE base.id = $1
      LIMIT 1
    `,
    [normalizedAlertId],
  );

  const row = result.rows[0] || null;
  if (!row) {
    throw createError(404, "Operational alert not found");
  }

  const [events] = await Promise.all([
    fetchOperationalAlertEvents(normalizedAlertId, db),
  ]);

  return {
    ...mapOperationalAlertRow(row),
    events,
  };
}

function normalizeOperationalAlertInput(payload, { partial = false, allowDraft = false } = {}) {
  const result = {};

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "title")) {
    const title = normalizeOptionalString(payload?.title);
    if (!title && !partial) {
      throw createError(400, "title is required");
    }
    if (title !== null) {
      result.title = title;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "description")) {
    result.description = normalizeOptionalString(payload?.description);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "alertType")) {
    const alertType = normalizeAlertType(payload?.alertType, "alertType", { required: !partial });
    if (alertType) {
      result.alertType = alertType;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "severity")) {
    const severity = normalizeSeverity(payload?.severity, "severity", { required: !partial });
    if (severity) {
      result.severity = severity;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "startsAt")) {
    const startsAt = normalizeDateTime(payload?.startsAt, "startsAt", { required: !partial });
    if (startsAt) {
      result.startsAt = startsAt;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "endsAt")) {
    const endsAt = normalizeDateTime(payload?.endsAt, "endsAt", { required: !partial });
    if (endsAt) {
      result.endsAt = endsAt;
    }
  }

  if (result.startsAt && result.endsAt && result.endsAt <= result.startsAt) {
    throw createError(400, "endsAt must be after startsAt");
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "zoneType")) {
    result.zoneType = normalizeZoneType(payload?.zoneType, { required: !partial });
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "adminAreaId")) {
    const adminAreaId = normalizePositiveInteger(payload?.adminAreaId, "adminAreaId", { required: !partial });
    if (adminAreaId) {
      result.adminAreaId = adminAreaId;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "zoneLabel")) {
    result.zoneLabel = normalizeOptionalString(payload?.zoneLabel);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "audienceScope")) {
    result.audienceScope = normalizeAudienceScope(payload?.audienceScope, { required: !partial });
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "notifyOnStart")) {
    result.notifyOnStart = normalizeBoolean(payload?.notifyOnStart, true);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "notifyOnExpire")) {
    result.notifyOnExpire = normalizeBoolean(payload?.notifyOnExpire, false);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "sendPush")) {
    result.sendPush = normalizeBoolean(payload?.sendPush, true);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "sendEmail")) {
    result.sendEmail = normalizeBoolean(payload?.sendEmail, false);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "sendSms")) {
    result.sendSms = normalizeBoolean(payload?.sendSms, false);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "templateId")) {
    result.templateId = normalizeUuid(payload?.templateId, "templateId");
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "sourceType")) {
    result.sourceType = normalizeSourceType(payload?.sourceType, { required: false });
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "sourceReportId")) {
    result.sourceReportId = normalizeUuid(payload?.sourceReportId, "sourceReportId");
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "metadata")) {
    result.metadata = normalizeMetadata(payload?.metadata);
  }

  if (allowDraft && Object.prototype.hasOwnProperty.call(payload, "status")) {
    result.status = normalizeRequestedStatus(payload?.status);
  }

  if (!result.sourceType && result.sourceReportId) {
    result.sourceType = "report";
  }

  if (!result.sourceType && !partial) {
    result.sourceType = "manual";
  }

  if (result.sourceType === "report" && !result.sourceReportId) {
    throw createError(400, "sourceReportId is required when sourceType is report");
  }

  return result;
}

async function insertOperationalAlertRecord(client, fields, actorUserId) {
  const adminArea = await fetchAdminAreaOrThrow(fields.adminAreaId, client);
  const derivedStatus = fields.status === "draft"
    ? "draft"
    : deriveOperationalAlertStatus({
      status: fields.status,
      startsAt: fields.startsAt,
      endsAt: fields.endsAt,
    });

  const result = await client.query(
    `
      INSERT INTO app.operational_alerts (
        created_by,
        updated_by,
        source_type,
        source_report_id,
        title,
        description,
        alert_type,
        severity,
        status,
        starts_at,
        ends_at,
        published_at,
        zone_type,
        admin_area_id,
        zone_label,
        audience_scope,
        notify_on_start,
        notify_on_expire,
        send_push,
        send_email,
        send_sms,
        template_id,
        metadata
      )
      VALUES (
        $1,
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        'admin_area',
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19,
        $20,
        $21::jsonb
      )
      RETURNING id
    `,
    [
      actorUserId,
      fields.sourceType || "manual",
      fields.sourceReportId || null,
      fields.title,
      fields.description || null,
      fields.alertType,
      fields.severity,
      derivedStatus,
      fields.startsAt,
      fields.endsAt,
      derivedStatus === "draft" ? null : new Date(),
      adminArea.id,
      fields.zoneLabel || adminArea.name,
      fields.audienceScope || "users_in_zone",
      fields.notifyOnStart ?? true,
      fields.notifyOnExpire ?? false,
      fields.sendPush ?? true,
      fields.sendEmail ?? false,
      fields.sendSms ?? false,
      fields.templateId || null,
      JSON.stringify(fields.metadata || {}),
    ],
  );

  return {
    id: result.rows[0]?.id,
    status: derivedStatus,
    title: fields.title,
    notifyOnStart: Boolean(fields.notifyOnStart),
    notifyOnExpire: Boolean(fields.notifyOnExpire),
  };
}

async function createOperationalAlert(payload, actorUserId, db = pool) {
  const fields = normalizeOperationalAlertInput(payload, {
    partial: false,
    allowDraft: true,
  });
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const inserted = await insertOperationalAlertRecord(client, fields, actorUserId);

    await recordOperationalAlertEvent(client, {
      alertId: inserted.id,
      eventType: "created",
      actorUserId,
      fromStatus: null,
      toStatus: inserted.status,
      metadata: {
        templateId: fields.templateId || null,
        sourceType: fields.sourceType || "manual",
      },
    });

    await client.query("COMMIT");
    await queueOperationalAlertFanout([
      {
        id: inserted.id,
        title: inserted.title,
        fromStatus: null,
        toStatus: inserted.status,
        notifyOnStart: inserted.notifyOnStart,
        notifyOnExpire: inserted.notifyOnExpire,
      },
    ], db);

    return await getOperationalAlertById(inserted.id, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function fetchOperationalAlertTemplateOrThrow(templateId, db = pool) {
  const normalizedTemplateId = normalizeUuid(templateId, "templateId", { required: true });
  const result = await db.query(
    `
      SELECT
        tpl.id,
        tpl.name,
        tpl.description,
        tpl.alert_type,
        tpl.default_severity,
        tpl.default_title,
        tpl.default_message,
        tpl.default_duration_minutes,
        tpl.send_push,
        tpl.send_email,
        tpl.send_sms,
        tpl.is_active
      FROM app.operational_alert_templates tpl
      WHERE tpl.id = $1
      LIMIT 1
    `,
    [normalizedTemplateId],
  );

  const row = result.rows[0] || null;
  if (!row || row.is_active !== true) {
    throw createError(404, "Operational alert template not found");
  }

  return row;
}

async function listOperationalAlertTemplates(db = pool) {
  const result = await db.query(
    `
      SELECT
        tpl.id,
        tpl.name,
        tpl.description,
        tpl.alert_type,
        tpl.default_severity,
        tpl.default_title,
        tpl.default_message,
        tpl.default_duration_minutes,
        tpl.send_push,
        tpl.send_email,
        tpl.send_sms
      FROM app.operational_alert_templates tpl
      WHERE tpl.is_active = true
      ORDER BY tpl.created_at DESC, tpl.name ASC
    `,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description || "",
    alertType: row.alert_type,
    defaultSeverity: row.default_severity,
    defaultTitle: row.default_title,
    defaultMessage: row.default_message || "",
    defaultDurationMinutes: Number(row.default_duration_minutes || 0),
    defaultDuration: formatTemplateDuration(row.default_duration_minutes),
    sendPush: Boolean(row.send_push),
    sendEmail: Boolean(row.send_email),
    sendSms: Boolean(row.send_sms),
  }));
}

async function createOperationalAlertFromTemplate(payload, actorUserId, db = pool) {
  const template = await fetchOperationalAlertTemplateOrThrow(payload?.templateId, db);
  const startsAt = normalizeDateTime(payload?.startsAt, "startsAt", { required: true });
  const endsAt = payload?.endsAt
    ? normalizeDateTime(payload?.endsAt, "endsAt", { required: true })
    : new Date(startsAt.getTime() + (Number(template.default_duration_minutes || 0) * 60 * 1000));

  if (endsAt <= startsAt) {
    throw createError(400, "endsAt must be after startsAt");
  }

  const adminAreaId = normalizePositiveInteger(payload?.adminAreaId, "adminAreaId", { required: true });
  const audienceScope = normalizeAudienceScope(payload?.audienceScope, { required: false });

  return createOperationalAlert(
    {
      title: normalizeOptionalString(payload?.title) || template.default_title,
      description: normalizeOptionalString(payload?.description) || template.default_message || null,
      alertType: template.alert_type,
      severity: template.default_severity,
      startsAt,
      endsAt,
      zoneType: "admin_area",
      adminAreaId,
      audienceScope,
      notifyOnStart: normalizeBoolean(payload?.notifyOnStart, true),
      notifyOnExpire: normalizeBoolean(payload?.notifyOnExpire, false),
      sendPush: Boolean(template.send_push),
      sendEmail: Boolean(template.send_email),
      sendSms: Boolean(template.send_sms),
      templateId: template.id,
      sourceType: "manual",
      metadata: normalizeMetadata(payload?.metadata),
    },
    actorUserId,
    db,
  );
}

async function fetchExistingOperationalAlertRow(alertId, db = pool) {
  const normalizedAlertId = normalizeUuid(alertId, "id", { required: true });
  const result = await db.query(
    `
      SELECT *
      FROM app.operational_alerts
      WHERE id = $1
      LIMIT 1
    `,
    [normalizedAlertId],
  );

  const row = result.rows[0] || null;
  if (!row) {
    throw createError(404, "Operational alert not found");
  }

  return row;
}

async function updateOperationalAlert(alertId, payload, actorUserId, db = pool) {
  const normalizedAlertId = normalizeUuid(alertId, "id", { required: true });
  const fields = normalizeOperationalAlertInput(payload, { partial: true });
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const existing = await fetchExistingOperationalAlertRow(normalizedAlertId, client);
    if (existing.status === "cancelled") {
      throw createError(400, "Cancelled alerts cannot be edited");
    }

    const startsAt = fields.startsAt || new Date(existing.starts_at);
    const endsAt = fields.endsAt || new Date(existing.ends_at);
    if (endsAt <= startsAt) {
      throw createError(400, "endsAt must be after startsAt");
    }

    const adminAreaId = fields.adminAreaId || Number(existing.admin_area_id);
    const adminArea = await fetchAdminAreaOrThrow(adminAreaId, client);
    const nextStatus = deriveOperationalAlertStatus({
      status: existing.status,
      startsAt,
      endsAt,
    });

    await client.query(
      `
        UPDATE app.operational_alerts
        SET
          title = $1::varchar,
          description = $2::text,
          severity = $3::varchar,
          starts_at = $4::timestamptz,
          ends_at = $5::timestamptz,
          admin_area_id = $6::bigint,
          zone_label = $7::varchar,
          audience_scope = $8::varchar,
          notify_on_start = $9::boolean,
          notify_on_expire = $10::boolean,
          send_push = $11::boolean,
          send_email = $12::boolean,
          send_sms = $13::boolean,
          metadata = $14::jsonb,
          status = $15::varchar,
          published_at = CASE
            WHEN $15::varchar <> 'draft' THEN COALESCE(published_at, now())
            ELSE published_at
          END,
          updated_by = $16::uuid,
          updated_at = now()
        WHERE id = $17::uuid
      `,
      [
        fields.title || existing.title,
        Object.prototype.hasOwnProperty.call(fields, "description")
          ? fields.description
          : existing.description,
        fields.severity || existing.severity,
        startsAt,
        endsAt,
        adminArea.id,
        fields.zoneLabel || adminArea.name,
        fields.audienceScope || existing.audience_scope,
        Object.prototype.hasOwnProperty.call(fields, "notifyOnStart")
          ? fields.notifyOnStart
          : existing.notify_on_start,
        Object.prototype.hasOwnProperty.call(fields, "notifyOnExpire")
          ? fields.notifyOnExpire
          : existing.notify_on_expire,
        Object.prototype.hasOwnProperty.call(fields, "sendPush")
          ? fields.sendPush
          : existing.send_push,
        Object.prototype.hasOwnProperty.call(fields, "sendEmail")
          ? fields.sendEmail
          : existing.send_email,
        Object.prototype.hasOwnProperty.call(fields, "sendSms")
          ? fields.sendSms
          : existing.send_sms,
        JSON.stringify(
          Object.prototype.hasOwnProperty.call(fields, "metadata")
            ? fields.metadata
            : (existing.metadata || {}),
        ),
        nextStatus,
        actorUserId,
        normalizedAlertId,
      ],
    );

    await recordOperationalAlertEvent(client, {
      alertId: normalizedAlertId,
      eventType: "updated",
      actorUserId,
      fromStatus: existing.status,
      toStatus: nextStatus,
      metadata: {
        editedFields: Object.keys(fields),
      },
    });

    await client.query("COMMIT");
    await queueOperationalAlertFanout([
      {
        id: normalizedAlertId,
        title: fields.title || existing.title,
        fromStatus: existing.status,
        toStatus: nextStatus,
        notifyOnStart: Object.prototype.hasOwnProperty.call(fields, "notifyOnStart")
          ? fields.notifyOnStart
          : Boolean(existing.notify_on_start),
        notifyOnExpire: Object.prototype.hasOwnProperty.call(fields, "notifyOnExpire")
          ? fields.notifyOnExpire
          : Boolean(existing.notify_on_expire),
      },
    ], db);

    return await getOperationalAlertById(normalizedAlertId, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function cancelOperationalAlert(alertId, note, actorUserId, db = pool) {
  const normalizedAlertId = normalizeUuid(alertId, "id", { required: true });
  const normalizedNote = normalizeOptionalNote(note);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const existing = await fetchExistingOperationalAlertRow(normalizedAlertId, client);
    if (existing.status !== "cancelled") {
      await client.query(
        `
          UPDATE app.operational_alerts
          SET
            status = 'cancelled',
            cancelled_at = coalesce(cancelled_at, now()),
            cancelled_by = $1,
            updated_by = $1,
            updated_at = now()
          WHERE id = $2
        `,
        [actorUserId, normalizedAlertId],
      );

      await recordOperationalAlertEvent(client, {
        alertId: normalizedAlertId,
        eventType: "cancelled",
        actorUserId,
        fromStatus: existing.status,
        toStatus: "cancelled",
        note: normalizedNote,
      });
    }

    await client.query("COMMIT");
    return await getOperationalAlertById(normalizedAlertId, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  buildOperationalAlertDisplayId,
  createOperationalAlert,
  createOperationalAlertFromTemplate,
  deriveOperationalAlertStatus,
  fetchOperationalAlertCounts,
  formatOperationalAlertDuration,
  getOperationalAlertById,
  listOperationalAlertTemplates,
  listOperationalAlerts,
  normalizeTab,
  updateOperationalAlert,
  cancelOperationalAlert,
};
