const createError = require("http-errors");
const router = require("express").Router();

const pool = require("../db");
const { verifyToken } = require("./verifytoken");
const {
  broadcastNotificationUpdated,
  broadcastNotificationsReadAll,
  emitNotificationCreatedToUser,
} = require("../services/notificationSocket");
const {
  fetchNotificationsForUser,
  fetchUnreadNotificationCount,
  mapNotificationRow,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  markNotificationAsSent,
} = require("../services/notificationsService");
const {
  sendPushToUser,
  upsertMobilePushDevice,
  upsertPushSubscription,
} = require("../services/pushService");
const { recordDeliveryAttempt } = require("../services/notificationOrchestrator");

const NOTIFICATION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseInteger(value, fieldName, { defaultValue = 0, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw createError(400, `${fieldName} must be an integer`);
  }
  if (parsed < min || parsed > max) {
    throw createError(400, `${fieldName} is out of range`);
  }

  return parsed;
}

router.get("/", verifyToken, async (req, res, next) => {
  try {
    const limit = parseInteger(req.query?.limit, "limit", {
      defaultValue: DEFAULT_LIMIT,
      min: 1,
      max: MAX_LIMIT,
    });
    const offset = parseInteger(req.query?.offset, "offset", {
      defaultValue: 0,
      min: 0,
    });

    const items = await fetchNotificationsForUser(req.user.userId, { limit, offset });
    return res.status(200).json({
      items,
      pagination: {
        limit,
        offset,
        returned: items.length,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/unread-count", verifyToken, async (req, res, next) => {
  try {
    const count = await fetchUnreadNotificationCount(req.user.userId);
    return res.status(200).json({ count });
  } catch (error) {
    return next(error);
  }
});

router.patch("/read-all", verifyToken, async (req, res, next) => {
  try {
    const result = await markAllNotificationsAsRead(req.user.userId);
    const payload = {
      ids: result.ids,
      readAt: result.readAt,
    };

    if (result.updatedCount > 0) {
      broadcastNotificationsReadAll(req.user.userId, payload);
    }

    return res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

// Register a mobile push device (alias of /api/push/mobile/register; centralized
// per the notification-settings spec).
router.post("/register-mobile-device", verifyToken, async (req, res, next) => {
  try {
    const device = await upsertMobilePushDevice(req.user.userId, req.body || {});
    return res.status(200).json({ device });
  } catch (error) {
    return next(error);
  }
});

// Register a web push subscription (alias of /api/push/subscribe).
router.post("/register-web-push", verifyToken, async (req, res, next) => {
  try {
    const subscription = await upsertPushSubscription(
      req.user.userId,
      req.body || {},
      { userAgent: req.get("user-agent") || null },
    );
    return res.status(200).json({ subscription });
  } catch (error) {
    return next(error);
  }
});

// Deactivate a device — accepts either a mobile_push_devices id or a
// push_subscriptions id. We probe both tables (scoped to the caller) and
// flip is_active=false on whichever matches.
router.delete("/devices/:id", verifyToken, async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      throw createError(400, "device id is required");
    }

    const userId = req.user.userId;

    const mobile = await pool.query(
      `
        update app.mobile_push_devices
           set is_active = false,
               disabled_at = coalesce(disabled_at, now()),
               updated_at = now()
         where id::text = $1
           and user_id = $2::uuid
        returning id
      `,
      [id, userId],
    );
    if (mobile.rowCount > 0) {
      return res.status(200).json({ ok: true, kind: "mobile" });
    }

    const web = await pool.query(
      `
        update app.push_subscriptions
           set is_active = false,
               disabled_at = coalesce(disabled_at, now())
         where id::text = $1
           and user_id = $2::uuid
        returning id
      `,
      [id, userId],
    );
    if (web.rowCount > 0) {
      return res.status(200).json({ ok: true, kind: "web" });
    }

    throw createError(404, "Device not found for this user");
  } catch (error) {
    return next(error);
  }
});

// Send a test notification across all platforms (matches /api/push/test
// behaviour but lives under the spec path /api/notifications/test).
// app.notifications.channel is constrained to ('websocket','email','push','sms')
// — we use 'websocket' here because the primary notification row represents
// the in-app/website live notification. The per-delivery breakdown (web push,
// mobile push) is written to app.notification_delivery_log below. Permitted to
// have report_id+operational_alert_id both NULL because TEST_PUSH is on the
// system-notification allowlist of notifications_one_source_check.
router.post("/test", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const title = "SIARA notification test";
    const body = "This is a test notification across all your enabled platforms.";

    const insertResult = await pool.query(
      `
        insert into app.notifications (
          user_id, channel, status, priority, event_type, title, body, data
        )
        values ($1::uuid, 'websocket', 'pending', 2, 'TEST_PUSH', $2, $3, $4::jsonb)
        returning *
      `,
      [userId, title, body, JSON.stringify({ test: true, url: "/notifications?pushTest=1" })],
    );

    const notification = mapNotificationRow(insertResult.rows[0]);
    console.info("[notifications-test] notification_created", {
      notificationId: notification?.id || null,
      userId,
      channel: notification?.channel || null,
      eventType: "TEST_PUSH",
    });

    const payload = {
      notificationId: notification?.id || null,
      eventType: "TEST_PUSH",
      title,
      body,
      url: "/notifications?pushTest=1",
      priority: 2,
      icon: "/siara-push-icon.svg",
      badge: "/siara-push-badge.svg",
      data: { notificationId: notification?.id || null, url: "/notifications?pushTest=1" },
    };

    // 1. WebSocket delivery (in-app live emit).
    let websocketStatus = "sent";
    let websocketError = null;
    if (notification) {
      console.info("[notifications-test] websocket_delivery_attempted", {
        notificationId: notification.id,
        userId,
      });
      try {
        const sent = await markNotificationAsSent(notification.id);
        emitNotificationCreatedToUser(userId, sent || notification);
      } catch (emitError) {
        websocketStatus = "failed";
        websocketError = emitError.message;
        console.error("[notifications-test] live_emit_failed", {
          message: emitError.message,
          notificationId: notification.id,
        });
      }
    } else {
      websocketStatus = "skipped";
      websocketError = "notification_insert_failed";
    }

    await recordDeliveryAttempt({
      notificationId: notification?.id || null,
      userId,
      channel: "websocket",
      platform: "web",
      status: websocketStatus,
      errorMessage: websocketError,
      deliveredAt: websocketStatus === "sent" ? new Date().toISOString() : null,
      metadata: { source: "notifications_test_endpoint" },
    });

    // 2. Mobile + web push (sent in parallel by sendPushToUser; we then record
    // per-channel delivery_log rows so "why was nothing sent?" stays answerable).
    const pushResult = await sendPushToUser(userId, payload);
    const web = pushResult?.channels?.web || pushResult;
    const mobile = pushResult?.channels?.mobile || pushResult;

    if (web?.ok) {
      console.info("[notifications-test] web_push_delivery_attempted", {
        notificationId: notification?.id || null,
        userId,
        sentCount: web.sentCount || 0,
      });
    } else {
      console.info("[notifications-test] web_push_delivery_skipped", {
        notificationId: notification?.id || null,
        userId,
        reason: web?.reason || "send_failed",
      });
    }
    await recordDeliveryAttempt({
      notificationId: notification?.id || null,
      userId,
      channel: "web_push",
      platform: "browser",
      provider: "vapid",
      status: web?.ok ? "sent" : (web?.reason === "no_active_subscriptions" ? "skipped" : "failed"),
      errorMessage: web?.ok ? null : (web?.reason || "send_failed"),
      deliveredAt: web?.ok ? new Date().toISOString() : null,
      metadata: {
        source: "notifications_test_endpoint",
        sentCount: web?.sentCount || 0,
        deactivatedCount: web?.deactivatedCount || 0,
        failureCount: web?.failureCount || 0,
      },
    });

    if (mobile?.ok) {
      console.info("[notifications-test] mobile_push_delivery_attempted", {
        notificationId: notification?.id || null,
        userId,
        sentCount: mobile.sentCount || 0,
      });
    } else {
      console.info("[notifications-test] mobile_push_delivery_skipped", {
        notificationId: notification?.id || null,
        userId,
        reason: mobile?.reason || "send_failed",
      });
    }
    await recordDeliveryAttempt({
      notificationId: notification?.id || null,
      userId,
      channel: "mobile_push",
      platform: "mobile",
      status: mobile?.ok ? "sent" : (mobile?.reason === "no_active_mobile_devices" ? "skipped" : "failed"),
      errorMessage: mobile?.ok ? null : (mobile?.reason || "send_failed"),
      deliveredAt: mobile?.ok ? new Date().toISOString() : null,
      metadata: {
        source: "notifications_test_endpoint",
        sentCount: mobile?.sentCount || 0,
        deactivatedCount: mobile?.deactivatedCount || 0,
        failureCount: mobile?.failureCount || 0,
      },
    });

    return res.status(200).json({
      ok: pushResult.ok,
      sentCount: pushResult.sentCount,
      deactivatedCount: pushResult.deactivatedCount,
      failureCount: pushResult.failureCount,
      reason: pushResult.reason,
      notificationId: notification?.id || null,
      channels: pushResult.channels || null,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/read", verifyToken, async (req, res, next) => {
  try {
    const notificationId = String(req.params.id || "").trim();
    if (!NOTIFICATION_ID_REGEX.test(notificationId)) {
      throw createError(400, "Invalid notification id");
    }

    const notification = await markNotificationAsRead(req.user.userId, notificationId);
    if (!notification) {
      throw createError(404, "Notification not found");
    }

    broadcastNotificationUpdated(req.user.userId, notification);
    return res.status(200).json({ notification });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
