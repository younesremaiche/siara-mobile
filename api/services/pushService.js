const createError = require("http-errors");
const webPush = require("web-push");

const pool = require("../db");

const PUSH_ELIGIBLE_EVENTS = new Set([
  "INCIDENT_REPORTED_IN_ZONE",
  "RISK_LEVEL_INCREASED",
  "MULTIPLE_REPORTS_IN_ZONE",
  "USER_ENTERING_WATCHED_ZONE",
  "HIGH_DANGER_NEARBY",
  "OPERATIONAL_ALERT_STARTED",
  "OPERATIONAL_ALERT_EXPIRED",
]);
const PUSH_ALWAYS_URGENT_EVENTS = new Set([
  "RISK_LEVEL_INCREASED",
  "HIGH_DANGER_NEARBY",
]);
const PUSH_MODE_VALUES = new Set(["important_only", "all", "off"]);
const PUSH_TIMEZONE = "Africa/Algiers";
const PUSH_COOLDOWN_MINUTES = Math.max(
  1,
  Number.parseInt(process.env.PUSH_COOLDOWN_MINUTES || "15", 10) || 15,
);
const PUSH_DEBUG_ENABLED =
  process.env.NODE_ENV !== "production"
  || process.env.NOTIFICATION_DEBUG === "true"
  || process.env.PUSH_DEBUG === "true";

let vapidConfigured = false;
let vapidUnavailableLogged = false;

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizePushMode(value, fallback = "important_only") {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (!PUSH_MODE_VALUES.has(normalized)) {
    throw createError(400, "pushMode must be important_only, all, or off");
  }
  return normalized;
}

function normalizeOptionalTime(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createError(400, `${fieldName} must be a time string in HH:MM format`);
  }

  const normalized = value.trim();
  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) {
    throw createError(400, `${fieldName} must be a time string in HH:MM format`);
  }

  return `${match[1]}:${match[2]}`;
}

function parseTimeToMinutes(value) {
  const normalized = normalizeOptionalTime(value, "time");
  if (!normalized) {
    return null;
  }

  const [hour, minute] = normalized.split(":").map(Number);
  return (hour * 60) + minute;
}

function getCurrentTimeInMinutes(timeZone = PUSH_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return parseTimeToMinutes(formatter.format(new Date()));
}

function isWithinQuietHours(preferences) {
  const start = parseTimeToMinutes(preferences?.quietHoursStart || null);
  const end = parseTimeToMinutes(preferences?.quietHoursEnd || null);
  if (start === null || end === null) {
    return false;
  }

  const current = getCurrentTimeInMinutes();
  if (current === null) {
    return false;
  }

  if (start === end) {
    return true;
  }

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

function shouldDeactivateSubscription(error) {
  const statusCode = Number(error?.statusCode || 0);
  if (statusCode === 404 || statusCode === 410) {
    return true;
  }

  const body = String(error?.body || error?.message || "").toLowerCase();
  return body.includes("invalid subscription")
    || body.includes("expired")
    || body.includes("unsubscribed");
}

function ensureWebPushConfigured() {
  if (vapidConfigured) {
    return true;
  }

  const subject = String(process.env.VAPID_SUBJECT || "").trim();
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();

  if (!subject || !publicKey || !privateKey) {
    if (!vapidUnavailableLogged) {
      vapidUnavailableLogged = true;
      console.warn("[push] missing_vapid_configuration");
    }
    return false;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;

  if (PUSH_DEBUG_ENABLED) {
    console.info("[push] vapid_ready", { subject });
  }

  return true;
}

function getPushPublicKey() {
  if (!ensureWebPushConfigured()) {
    throw createError(503, "Web Push is not configured");
  }

  return String(process.env.VAPID_PUBLIC_KEY || "").trim();
}

function mapPushSubscriptionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    userAgent: row.user_agent,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    disabledAt: row.disabled_at,
  };
}

function mapNotificationPreferenceRow(row) {
  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    inAppEnabled: Boolean(row.in_app_enabled),
    pushEnabled: Boolean(row.push_enabled),
    pushMode: normalizePushMode(row.push_mode || "important_only"),
    quietHoursStart: row.quiet_hours_start
      ? String(row.quiet_hours_start).slice(0, 5)
      : null,
    quietHoursEnd: row.quiet_hours_end
      ? String(row.quiet_hours_end).slice(0, 5)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureUserNotificationPreferences(userId, db = pool) {
  const result = await db.query(
    `
      with inserted as (
        insert into app.user_notification_preferences (user_id)
        values ($1)
        on conflict (user_id) do nothing
        returning *
      )
      select *
      from inserted
      union all
      select p.*
      from app.user_notification_preferences p
      where p.user_id = $1
        and not exists (select 1 from inserted)
      limit 1
    `,
    [userId],
  );

  return mapNotificationPreferenceRow(result.rows[0] || null);
}

async function updateUserNotificationPreferences(userId, input = {}, db = pool) {
  const current = await ensureUserNotificationPreferences(userId, db);

  let pushMode = Object.prototype.hasOwnProperty.call(input, "pushMode")
    ? normalizePushMode(input.pushMode)
    : current.pushMode;
  let pushEnabled = Object.prototype.hasOwnProperty.call(input, "pushEnabled")
    ? Boolean(input.pushEnabled)
    : current.pushEnabled;

  if (pushMode === "off") {
    pushEnabled = false;
  } else if (pushEnabled && pushMode === "off") {
    pushMode = "important_only";
  }

  const inAppEnabled = Object.prototype.hasOwnProperty.call(input, "inAppEnabled")
    ? Boolean(input.inAppEnabled)
    : current.inAppEnabled;
  const quietHoursStart = Object.prototype.hasOwnProperty.call(input, "quietHoursStart")
    ? normalizeOptionalTime(input.quietHoursStart, "quietHoursStart")
    : current.quietHoursStart;
  const quietHoursEnd = Object.prototype.hasOwnProperty.call(input, "quietHoursEnd")
    ? normalizeOptionalTime(input.quietHoursEnd, "quietHoursEnd")
    : current.quietHoursEnd;

  const result = await db.query(
    `
      insert into app.user_notification_preferences (
        user_id,
        in_app_enabled,
        push_enabled,
        push_mode,
        quiet_hours_start,
        quiet_hours_end,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, now(), now())
      on conflict (user_id) do update
      set
        in_app_enabled = excluded.in_app_enabled,
        push_enabled = excluded.push_enabled,
        push_mode = excluded.push_mode,
        quiet_hours_start = excluded.quiet_hours_start,
        quiet_hours_end = excluded.quiet_hours_end,
        updated_at = now()
      returning *
    `,
    [
      userId,
      inAppEnabled,
      pushEnabled,
      pushMode,
      quietHoursStart,
      quietHoursEnd,
    ],
  );

  return mapNotificationPreferenceRow(result.rows[0] || null);
}

function normalizePushSubscriptionPayload(payload = {}) {
  const subscription = normalizeObject(payload);
  const keys = normalizeObject(subscription.keys);

  const endpoint = String(subscription.endpoint || "").trim();
  const p256dh = String(keys.p256dh || subscription.p256dh || "").trim();
  const auth = String(keys.auth || subscription.auth || "").trim();

  if (!endpoint) {
    throw createError(400, "Push subscription endpoint is required");
  }

  if (!p256dh || !auth) {
    throw createError(400, "Push subscription keys are required");
  }

  return {
    endpoint,
    p256dh,
    auth,
  };
}

async function upsertPushSubscription(
  userId,
  payload,
  { userAgent = null } = {},
  db = pool,
) {
  const subscription = normalizePushSubscriptionPayload(payload);
  const result = await db.query(
    `
      insert into app.push_subscriptions (
        user_id,
        endpoint,
        p256dh,
        auth,
        user_agent,
        is_active,
        created_at,
        disabled_at
      )
      values ($1, $2, $3, $4, $5, true, now(), null)
      on conflict (endpoint) do update
      set
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        is_active = true,
        disabled_at = null
      returning *
    `,
    [
      userId,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      userAgent,
    ],
  );

  return mapPushSubscriptionRow(result.rows[0] || null);
}

async function deactivatePushSubscription(userId, endpoint, db = pool) {
  const result = await db.query(
    `
      update app.push_subscriptions
      set
        is_active = false,
        disabled_at = coalesce(disabled_at, now())
      where user_id = $1
        and endpoint = $2
      returning *
    `,
    [userId, endpoint],
  );

  return mapPushSubscriptionRow(result.rows[0] || null);
}

async function fetchActivePushSubscriptionsForUser(userId, db = pool) {
  const result = await db.query(
    `
      select *
      from app.push_subscriptions
      where user_id = $1
        and is_active = true
      order by created_at desc, id desc
    `,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.user_agent,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    disabledAt: row.disabled_at,
  }));
}

async function markPushSubscriptionUsed(subscriptionId, db = pool) {
  await db.query(
    `
      update app.push_subscriptions
      set
        is_active = true,
        last_used_at = now()
      where id = $1
    `,
    [subscriptionId],
  );
}

async function disablePushSubscription(subscriptionId, db = pool) {
  await db.query(
    `
      update app.push_subscriptions
      set
        is_active = false,
        disabled_at = coalesce(disabled_at, now())
      where id = $1
    `,
    [subscriptionId],
  );
}

function normalizeNotificationForPush(notification) {
  if (!notification || typeof notification !== "object") {
    return null;
  }

  const data = normalizeObject(notification.data);
  const reportId = notification.reportId || notification.report_id || data.reportId || null;
  const operationalAlertId =
    notification.operationalAlertId
    || notification.operational_alert_id
    || data.operationalAlertId
    || null;

  return {
    id: notification.id || null,
    userId: notification.userId || notification.user_id || null,
    reportId,
    operationalAlertId,
    eventType: notification.eventType || notification.event_type || null,
    title: String(notification.title || "").trim(),
    body: String(notification.body || "").trim(),
    priority: Number(notification.priority ?? 2) || 2,
    data,
    createdAt: notification.createdAt || notification.created_at || null,
  };
}

function appendNotificationQuery(url, notification) {
  const fallbackPath = "/notifications";

  try {
    const resolved = new URL(url || fallbackPath, "https://siara.local");
    if (notification?.id) {
      resolved.searchParams.set("notification", notification.id);
    }
    if (notification?.reportId && !resolved.searchParams.get("report")) {
      resolved.searchParams.set("report", notification.reportId);
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch (_error) {
    return fallbackPath;
  }
}

function buildPushPayload(notification) {
  const normalized = normalizeNotificationForPush(notification);
  if (!normalized) {
    return null;
  }

  const zoneName = normalized.data.zoneName || normalized.data.locationLabel || null;
  const fallbackUrl = normalized.reportId
    ? `/incident/${normalized.reportId}`
    : "/notifications";
  const rawUrl = normalized.data.reportUrl || normalized.data.mapUrl || fallbackUrl;
  const url = appendNotificationQuery(rawUrl, normalized);

  return {
    notificationId: normalized.id,
    eventType: normalized.eventType,
    title: normalized.title || "SIARA alert",
    body: normalized.body || "A watched-zone alert was triggered.",
    url,
    priority: normalized.priority,
    zoneName,
    icon: "/siara-push-icon.svg",
    badge: "/siara-push-badge.svg",
    tag: normalized.id,
    data: {
      notificationId: normalized.id,
      reportId: normalized.reportId,
      operationalAlertId: normalized.operationalAlertId,
      zoneName,
      eventType: normalized.eventType,
      url,
    },
  };
}

async function fetchNotificationPushState(notificationId, db = pool) {
  const result = await db.query(
    `
      select data
      from app.notifications
      where id = $1
      limit 1
    `,
    [notificationId],
  );

  return normalizeObject(result.rows[0]?.data?.push);
}

async function updateNotificationPushState(notificationId, patch = {}, db = pool) {
  const nextPatch = Object.entries(normalizeObject(patch)).reduce((accumulator, [key, value]) => {
    if (value !== undefined) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});

  if (!notificationId || Object.keys(nextPatch).length === 0) {
    return null;
  }

  const result = await db.query(
    `
      update app.notifications
      set data = jsonb_set(
        coalesce(data, '{}'::jsonb),
        '{push}',
        coalesce(data->'push', '{}'::jsonb) || $2::jsonb,
        true
      )
      where id = $1
      returning data
    `,
    [notificationId, JSON.stringify(nextPatch)],
  );

  return normalizeObject(result.rows[0]?.data?.push);
}

function isUrgentPushNotification(notification) {
  return notification.priority <= 1 || PUSH_ALWAYS_URGENT_EVENTS.has(notification.eventType);
}

function isMediumPriorityOrHigher(notification) {
  return notification.priority <= 2;
}

function decidePushEligibility(notification, preferences) {
  if (!notification?.id || !notification?.userId) {
    return { ok: false, reason: "invalid_notification" };
  }

  if (!PUSH_ELIGIBLE_EVENTS.has(notification.eventType)) {
    return { ok: false, reason: "event_not_eligible" };
  }

  if (!preferences?.pushEnabled) {
    return { ok: false, reason: "push_disabled" };
  }

  if (preferences.pushMode === "off") {
    return { ok: false, reason: "push_mode_off" };
  }

  if (isWithinQuietHours(preferences)) {
    return { ok: false, reason: "quiet_hours" };
  }

  if (preferences.pushMode === "important_only" && !isUrgentPushNotification(notification)) {
    return { ok: false, reason: "not_important_enough" };
  }

  if (preferences.pushMode === "all" && !isMediumPriorityOrHigher(notification)) {
    return { ok: false, reason: "below_medium_priority" };
  }

  return { ok: true };
}

async function isNotificationWithinPushCooldown(notification, db = pool) {
  const normalized = normalizeNotificationForPush(notification);
  if (!normalized?.userId || !normalized?.eventType) {
    return false;
  }

  const since = new Date(Date.now() - (PUSH_COOLDOWN_MINUTES * 60 * 1000));
  const result = await db.query(
    `
      select id, data, created_at
      from app.notifications
      where user_id = $1
        and id <> $2
        and event_type = $3
        and created_at >= $4
      order by created_at desc
      limit 25
    `,
    [normalized.userId, normalized.id, normalized.eventType, since.toISOString()],
  );

  const zoneName = String(normalized.data.zoneName || "").trim().toLowerCase();
  return result.rows.some((row) => {
    const data = normalizeObject(row.data);
    const push = normalizeObject(data.push);
    const priorZone = String(data.zoneName || "").trim().toLowerCase();
    const priorPushAt = push.sentAt || push.deliveredAt || null;
    if (!priorPushAt) {
      return false;
    }

    const priorPushTime = new Date(priorPushAt).getTime();
    if (Number.isNaN(priorPushTime) || priorPushTime < since.getTime()) {
      return false;
    }

    if (zoneName && priorZone && zoneName !== priorZone) {
      return false;
    }

    return true;
  });
}

function mapPushUrgency(priority) {
  if (priority <= 1) {
    return "high";
  }
  if (priority === 2) {
    return "normal";
  }
  return "low";
}

async function sendPushToUser(userId, payload, { db = pool } = {}) {
  if (!ensureWebPushConfigured()) {
    return {
      ok: false,
      sentCount: 0,
      deactivatedCount: 0,
      failureCount: 0,
      reason: "missing_vapid_configuration",
    };
  }

  const subscriptions = await fetchActivePushSubscriptionsForUser(userId, db);
  if (subscriptions.length === 0) {
    return {
      ok: false,
      sentCount: 0,
      deactivatedCount: 0,
      failureCount: 0,
      reason: "no_active_subscriptions",
    };
  }

  let sentCount = 0;
  let deactivatedCount = 0;
  let failureCount = 0;

  const body = JSON.stringify(payload || {});
  const options = {
    TTL: payload?.priority <= 1 ? 1200 : 3600,
    urgency: mapPushUrgency(Number(payload?.priority ?? 2)),
    topic: payload?.notificationId
      ? String(payload.notificationId).replace(/[^a-z0-9_-]/gi, "").slice(0, 32)
      : undefined,
  };

  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        body,
        options,
      );

      sentCount += 1;
      await markPushSubscriptionUsed(subscription.id, db);
    } catch (error) {
      if (shouldDeactivateSubscription(error)) {
        deactivatedCount += 1;
        await disablePushSubscription(subscription.id, db);
      } else {
        failureCount += 1;
      }

      console.warn("[push] delivery_failed", {
        userId,
        endpoint: subscription.endpoint,
        statusCode: error?.statusCode || null,
        message: error?.message || "Unknown push delivery error",
      });
    }
  }

  return {
    ok: sentCount > 0,
    sentCount,
    deactivatedCount,
    failureCount,
    reason: sentCount > 0
      ? null
      : deactivatedCount > 0 && failureCount === 0
        ? "subscriptions_invalid"
        : "send_failed",
  };
}

async function evaluateAndSendPushForNotification(notification, db = pool) {
  const normalized = normalizeNotificationForPush(notification);
  const evaluationAt = new Date().toISOString();

  if (!normalized?.id || !normalized?.userId) {
    return {
      ok: false,
      attempted: false,
      reason: "invalid_notification",
    };
  }

  const existingPushState = await fetchNotificationPushState(normalized.id, db);
  if (existingPushState.sentAt || existingPushState.status === "sent") {
    return {
      ok: true,
      attempted: false,
      reason: "already_sent",
    };
  }

  if (!ensureWebPushConfigured()) {
    await updateNotificationPushState(normalized.id, {
      status: "skipped",
      reason: "missing_vapid_configuration",
      lastEvaluatedAt: evaluationAt,
    }, db);

    return {
      ok: false,
      attempted: false,
      reason: "missing_vapid_configuration",
    };
  }

  const preferences = await ensureUserNotificationPreferences(normalized.userId, db);
  const eligibility = decidePushEligibility(normalized, preferences);

  if (!eligibility.ok) {
    await updateNotificationPushState(normalized.id, {
      status: "skipped",
      reason: eligibility.reason,
      mode: preferences.pushMode,
      lastEvaluatedAt: evaluationAt,
    }, db);

    if (PUSH_DEBUG_ENABLED) {
      console.info("[push] skipped", {
        notificationId: normalized.id,
        userId: normalized.userId,
        reason: eligibility.reason,
      });
    }

    return {
      ok: false,
      attempted: false,
      reason: eligibility.reason,
    };
  }

  const withinCooldown = await isNotificationWithinPushCooldown(normalized, db);
  if (withinCooldown) {
    await updateNotificationPushState(normalized.id, {
      status: "skipped",
      reason: "cooldown",
      mode: preferences.pushMode,
      lastEvaluatedAt: evaluationAt,
    }, db);

    if (PUSH_DEBUG_ENABLED) {
      console.info("[push] cooldown_skipped", {
        notificationId: normalized.id,
        userId: normalized.userId,
        eventType: normalized.eventType,
        zoneName: normalized.data.zoneName || null,
        cooldownMinutes: PUSH_COOLDOWN_MINUTES,
      });
    }

    return {
      ok: false,
      attempted: false,
      reason: "cooldown",
    };
  }

  const payload = buildPushPayload(normalized);
  const result = await sendPushToUser(normalized.userId, payload, { db });

  if (result.ok) {
    await updateNotificationPushState(normalized.id, {
      status: "sent",
      reason: null,
      mode: preferences.pushMode,
      lastEvaluatedAt: evaluationAt,
      sentAt: evaluationAt,
      sentCount: result.sentCount,
      deactivatedCount: result.deactivatedCount,
      url: payload.url,
    }, db);

    if (PUSH_DEBUG_ENABLED) {
      console.info("[push] sent", {
        notificationId: normalized.id,
        userId: normalized.userId,
        sentCount: result.sentCount,
        deactivatedCount: result.deactivatedCount,
      });
    }

    return {
      ok: true,
      attempted: true,
      sentCount: result.sentCount,
      deactivatedCount: result.deactivatedCount,
      payload,
    };
  }

  const nextStatus = result.reason === "no_active_subscriptions" ? "skipped" : "failed";
  await updateNotificationPushState(normalized.id, {
    status: nextStatus,
    reason: result.reason,
    mode: preferences.pushMode,
    lastEvaluatedAt: evaluationAt,
    sentCount: result.sentCount,
    deactivatedCount: result.deactivatedCount,
    failureCount: result.failureCount,
    url: payload?.url || null,
  }, db);

  if (PUSH_DEBUG_ENABLED) {
    console.info("[push] not_sent", {
      notificationId: normalized.id,
      userId: normalized.userId,
      reason: result.reason,
      sentCount: result.sentCount,
      deactivatedCount: result.deactivatedCount,
      failureCount: result.failureCount,
    });
  }

  return {
    ok: false,
    attempted: result.reason !== "no_active_subscriptions",
    reason: result.reason,
    sentCount: result.sentCount,
    deactivatedCount: result.deactivatedCount,
    failureCount: result.failureCount,
  };
}

module.exports = {
  PUSH_COOLDOWN_MINUTES,
  buildPushPayload,
  decidePushEligibility,
  ensureUserNotificationPreferences,
  evaluateAndSendPushForNotification,
  fetchActivePushSubscriptionsForUser,
  getPushPublicKey,
  mapNotificationPreferenceRow,
  sendPushToUser,
  upsertPushSubscription,
  updateUserNotificationPreferences,
  deactivatePushSubscription,
};
