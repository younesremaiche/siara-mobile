const createError = require("http-errors");
const router = require("express").Router();

const pool = require("../db");
const { verifyToken } = require("./verifytoken");
const {
  deactivatePushSubscription,
  deactivateMobilePushDevice,
  ensureUserNotificationPreferences,
  getPushPublicKey,
  sendPushToUser,
  upsertMobilePushDevice,
  upsertPushSubscription,
  updateUserNotificationPreferences,
  createMobileDevicePairingSession,
  getMobileDevicePairingSession,
  completeMobileDevicePairingSession,
  cancelMobileDevicePairingSession,
} = require("../services/pushService");
const { mapNotificationRow, markNotificationAsSent } = require("../services/notificationsService");
const { emitNotificationCreatedToUser } = require("../services/notificationSocket");

router.get("/public-key", (req, res, next) => {
  try {
    return res.status(200).json({ publicKey: getPushPublicKey() });
  } catch (error) {
    return next(error);
  }
});

router.get("/preferences", verifyToken, async (req, res, next) => {
  try {
    const preferences = await ensureUserNotificationPreferences(req.user.userId);
    return res.status(200).json({ preferences });
  } catch (error) {
    return next(error);
  }
});

router.patch("/preferences", verifyToken, async (req, res, next) => {
  try {
    const preferences = await updateUserNotificationPreferences(req.user.userId, req.body || {});
    return res.status(200).json({ preferences });
  } catch (error) {
    return next(error);
  }
});

router.post("/subscribe", verifyToken, async (req, res, next) => {
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

router.delete("/unsubscribe", verifyToken, async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || "").trim();
    if (!endpoint) {
      throw createError(400, "endpoint is required");
    }

    const subscription = await deactivatePushSubscription(req.user.userId, endpoint);
    return res.status(200).json({
      ok: true,
      deactivated: Boolean(subscription),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/mobile/register", verifyToken, async (req, res, next) => {
  try {
    const device = await upsertMobilePushDevice(req.user.userId, req.body || {});
    return res.status(200).json({ device });
  } catch (error) {
    return next(error);
  }
});

router.delete("/mobile/unregister", verifyToken, async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) {
      throw createError(400, "token is required");
    }

    const device = await deactivateMobilePushDevice(req.user.userId, token);
    return res.status(200).json({
      ok: true,
      deactivated: Boolean(device),
    });
  } catch (error) {
    return next(error);
  }
});

// ---------- Mobile device pairing (QR flow) ----------
//
// The QR rendered on the web carries ONLY the short-lived pairing code (32
// chars base64url, hashed at rest, single-use, 5-minute TTL). The mobile app
// must be logged in as the same SIARA user; the completion endpoint enforces
// userId equality between the session creator and the JWT used to complete.
// No JWTs / refresh tokens / Expo push tokens / passwords are encoded in the
// QR itself — see api/services/pushService.js for the mechanism.

router.post("/mobile/pairing-sessions", verifyToken, async (req, res, next) => {
  try {
    const meta = (req.body && typeof req.body.meta === "object" && req.body.meta) || {};
    const result = await createMobileDevicePairingSession(req.user.userId, { meta });
    // Response includes the raw pairing code and a deep-link URL exactly
    // once. The frontend renders the URL inside a QR and never stores the
    // code longer than the modal lifetime.
    return res.status(201).json({
      session: result.session,
      pairingUrl: result.pairingUrl,
      code: result.code,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/mobile/pairing-sessions/:id", verifyToken, async (req, res, next) => {
  try {
    const sessionId = String(req.params.id || "").trim();
    if (!sessionId) throw createError(400, "session id is required");
    const session = await getMobileDevicePairingSession(req.user.userId, sessionId);
    return res.status(200).json({ session });
  } catch (error) {
    return next(error);
  }
});

router.delete("/mobile/pairing-sessions/:id", verifyToken, async (req, res, next) => {
  try {
    const sessionId = String(req.params.id || "").trim();
    if (!sessionId) throw createError(400, "session id is required");
    const session = await cancelMobileDevicePairingSession(req.user.userId, sessionId);
    return res.status(200).json({
      ok: true,
      cancelled: Boolean(session),
      session,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/mobile/pairing-sessions/complete", verifyToken, async (req, res, next) => {
  try {
    const result = await completeMobileDevicePairingSession(req.user.userId, req.body || {});
    return res.status(200).json({
      session: result.session,
      device: result.device,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/test", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const title = "SIARA system alerts enabled";
    const body = "This is a test browser notification from SIARA.";
    const eventType = "TEST_PUSH";
    const priority = 2;

    const insertResult = await pool.query(
      `
        INSERT INTO app.notifications (
          user_id, report_id, operational_alert_id, channel, status,
          priority, event_type, title, body, data
        )
        VALUES ($1::uuid, NULL, NULL, 'websocket', 'pending', $2::integer, $3::varchar, $4::text, $5::text, $6::jsonb)
        RETURNING *
      `,
      [
        userId,
        priority,
        eventType,
        title,
        body,
        JSON.stringify({ test: true, url: "/notifications?pushTest=1" }),
      ],
    );

    const notification = mapNotificationRow(insertResult.rows[0]);
    const testNotificationId = notification?.id || `test-${Date.now()}`;

    const payload = {
      notificationId: testNotificationId,
      eventType,
      title,
      body,
      url: "/notifications?pushTest=1",
      priority,
      zoneName: null,
      icon: "/siara-push-icon.svg",
      badge: "/siara-push-badge.svg",
      data: {
        notificationId: testNotificationId,
        url: "/notifications?pushTest=1",
      },
    };

    const result = await sendPushToUser(userId, payload);

    if (notification) {
      try {
        const sent = await markNotificationAsSent(notification.id);
        emitNotificationCreatedToUser(userId, sent || notification);
      } catch (emitError) {
        console.error("[push-test] live_emit_failed", {
          message: emitError.message,
          notificationId: notification.id,
        });
      }
    }

    return res.status(200).json({
      ok: result.ok,
      sentCount: result.sentCount,
      deactivatedCount: result.deactivatedCount,
      failureCount: result.failureCount,
      reason: result.reason,
      notificationId: testNotificationId,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
