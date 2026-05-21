// PUT /api/users/me/location
//
// Stores the caller's last-known GPS position in app.user_last_known_location.
// The notification orchestrator reads this single-row-per-user table to fan
// out 5 km nearby-incident notifications. Police officers continue to use
// app.officer_location_updates for their on-duty location history (kept
// separate intentionally — different retention, different access pattern).

const router = require("express").Router();
const createError = require("http-errors");

const { verifyToken } = require("./verifytoken");
const { upsertUserLastKnownLocation } = require("../services/notificationOrchestrator");

router.put("/", verifyToken, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const lat = Number(body.lat ?? body.latitude);
    const lng = Number(body.lng ?? body.longitude ?? body.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw createError(400, "lat and lng must be finite numbers");
    }
    if (lat < -90 || lat > 90) {
      throw createError(400, "lat must be between -90 and 90");
    }
    if (lng < -180 || lng > 180) {
      throw createError(400, "lng must be between -180 and 180");
    }

    const accuracyMeters = body.accuracyMeters == null && body.accuracy_m == null
      ? null
      : Number(body.accuracyMeters ?? body.accuracy_m);

    const source = String(body.source || "browser").trim().slice(0, 50) || "browser";

    const result = await upsertUserLastKnownLocation({
      userId: req.user.userId,
      lat,
      lng,
      accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : null,
      source,
    });

    return res.status(200).json({ ok: true, location: result });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
