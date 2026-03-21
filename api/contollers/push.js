const createError = require("http-errors");
const router = require("express").Router();

const { verifyToken } = require("./verifytoken");
const {
  deactivatePushSubscription,
  ensureUserNotificationPreferences,
  getPushPublicKey,
  sendPushToUser,
  upsertPushSubscription,
  updateUserNotificationPreferences,
} = require("../services/pushService");

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

router.post("/test", verifyToken, async (req, res, next) => {
  try {
    const testNotificationId = `test-${Date.now()}`;
    const payload = {
      notificationId: testNotificationId,
      eventType: "TEST_PUSH",
      title: "SIARA system alerts enabled",
      body: "This is a test browser notification from SIARA.",
      url: "/notifications?pushTest=1",
      priority: 2,
      zoneName: null,
      icon: "/siara-push-icon.svg",
      badge: "/siara-push-badge.svg",
      data: {
        notificationId: testNotificationId,
        url: "/notifications?pushTest=1",
      },
    };

    const result = await sendPushToUser(req.user.userId, payload);
    return res.status(200).json({
      ok: result.ok,
      sentCount: result.sentCount,
      deactivatedCount: result.deactivatedCount,
      failureCount: result.failureCount,
      reason: result.reason,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
