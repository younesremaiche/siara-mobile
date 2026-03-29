const createError = require("http-errors");
const router = require("express").Router();

const { verifyToken } = require("./verifytoken");
const {
  broadcastNotificationUpdated,
  broadcastNotificationsReadAll,
} = require("../services/notificationSocket");
const {
  fetchNotificationsForUser,
  fetchUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} = require("../services/notificationsService");

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
