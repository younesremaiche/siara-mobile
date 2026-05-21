// Authenticated user account routes — currently exposes "Export my data".
//
// Reads only from the user's own rows in:
//   - app.travel_histories     (road history, owner column: user_id)
//   - app.accident_reports     (personal reports, owner column: reported_by)
//   - app.report_media         (media for the user's own reports)
//   - app.alert_rules          (personal alerts, owner column: user_id)
//   - app.alert_zones          (zone metadata for the user's alerts)
//
// The user id is taken from the verified access token (req.user.userId);
// any client-supplied user id is ignored. Sensitive moderation, ML, and
// police-internal columns are excluded from the export.

const router = require("express").Router();
const createError = require("http-errors");

const pool = require("../db");
const { verifyToken } = require("./verifytoken");
const { acknowledgeOwnWarning } = require("../services/adminUsersService");
const {
  ensureUserNotificationPreferences,
  fetchActiveMobilePushDevicesForUser,
  fetchActivePushSubscriptionsForUser,
  updateUserNotificationPreferences,
} = require("../services/pushService");
const {
  ALL_CATEGORIES,
  fetchAllCategoryPreferences,
  updateCategoryPreference,
} = require("../services/notificationOrchestrator");

const USER_EXPORT_MAX_ROWS = Math.max(
  100,
  Math.min(50000, Number(process.env.USER_EXPORT_MAX_ROWS) || 5000),
);

const TRAVEL_HISTORY_SQL = `
  select
    id,
    origin_name,
    origin_lat,
    origin_lng,
    destination_name,
    destination_lat,
    destination_lng,
    route_type,
    started_at,
    arrived_at,
    duration_seconds,
    distance_km,
    overall_risk_percent,
    overall_risk_level,
    rating,
    feedback_text,
    created_at
  from app.travel_histories
  where user_id = $1
  order by created_at desc
  limit $2
`;

const REPORTS_SQL = `
  select
    ar.id,
    ar.incident_type,
    ar.title,
    ar.description,
    ar.severity_hint,
    ar.location_label,
    ar.occurred_at,
    ar.created_at,
    ar.updated_at,
    ar.status,
    ar.source_channel,
    ar.comments_count,
    ar.likes_count,
    ar.saw_it_too_count,
    ar.last_commented_at,
    ST_Y(ar.incident_location::geometry) as lat,
    ST_X(ar.incident_location::geometry) as lng
  from app.accident_reports ar
  where ar.reported_by = $1
  order by ar.created_at desc
  limit $2
`;

const REPORT_MEDIA_SQL = `
  select
    rm.id,
    rm.report_id,
    rm.media_type,
    rm.url,
    rm.mime_type,
    rm.file_size,
    rm.uploaded_at
  from app.report_media rm
  join app.accident_reports ar on ar.id = rm.report_id
  where ar.reported_by = $1
  order by rm.uploaded_at desc
`;

const ALERTS_SQL = `
  select
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
    az.id as zone_id,
    az.display_name as zone_display_name,
    az.zone_type as zone_record_type,
    az.radius_m as zone_radius_m,
    case when az.center is not null
      then ST_Y(az.center::geometry) end as zone_center_lat,
    case when az.center is not null
      then ST_X(az.center::geometry) end as zone_center_lng
  from app.alert_rules ar
  left join app.alert_zones az on az.alert_id = ar.id
  where ar.user_id = $1
  order by ar.created_at desc
  limit $2
`;

function normalizeAlertRow(row) {
  const {
    zone_id,
    zone_display_name,
    zone_record_type,
    zone_radius_m,
    zone_center_lat,
    zone_center_lng,
    ...rest
  } = row;

  const zone = zone_id
    ? {
        id: zone_id,
        display_name: zone_display_name,
        zone_type: zone_record_type,
        radius_m: zone_radius_m,
        center_lat: zone_center_lat,
        center_lng: zone_center_lng,
      }
    : null;

  return { ...rest, zone };
}

function attachMediaToReports(reports, mediaRows) {
  const byReportId = new Map();
  for (const media of mediaRows || []) {
    const list = byReportId.get(media.report_id) || [];
    list.push({
      id: media.id,
      media_type: media.media_type,
      url: media.url,
      mime_type: media.mime_type,
      file_size: media.file_size,
      uploaded_at: media.uploaded_at,
    });
    byReportId.set(media.report_id, list);
  }
  return reports.map((report) => ({
    ...report,
    media: byReportId.get(report.id) || [],
  }));
}

router.get("/export", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      throw createError(401, "Authentication required");
    }

    const [travelResult, reportsResult, mediaResult, alertsResult] = await Promise.all([
      pool.query(TRAVEL_HISTORY_SQL, [userId, USER_EXPORT_MAX_ROWS]),
      pool.query(REPORTS_SQL, [userId, USER_EXPORT_MAX_ROWS]),
      pool.query(REPORT_MEDIA_SQL, [userId]),
      pool.query(ALERTS_SQL, [userId, USER_EXPORT_MAX_ROWS]),
    ]);

    const roadHistory = travelResult.rows;
    const reports = attachMediaToReports(reportsResult.rows, mediaResult.rows);
    const alerts = alertsResult.rows.map(normalizeAlertRow);

    const truncatedSections = [];
    if (roadHistory.length >= USER_EXPORT_MAX_ROWS) truncatedSections.push("road_history");
    if (reports.length >= USER_EXPORT_MAX_ROWS) truncatedSections.push("reports");
    if (alerts.length >= USER_EXPORT_MAX_ROWS) truncatedSections.push("alerts");

    const exportedAt = new Date();
    const datePart = exportedAt.toISOString().slice(0, 10);

    const payload = {
      exported_at: exportedAt.toISOString(),
      user_id: userId,
      sections: ["road_history", "reports", "alerts"],
      road_history: roadHistory,
      reports,
      alerts,
      truncated_sections: truncatedSections,
    };

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="siara-user-data-${datePart}.json"`,
    );
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error("[Node] /api/account/export error:", error.message);
    return next(error);
  }
});

// Notification settings — combined view of:
//   - account-wide preferences (push_enabled, push_mode, quiet_hours, in_app)
//   - per-category preferences (8 categories × 4 channels + important_only)
//   - active web push subscriptions + mobile push devices (for the "Manage devices" UI)
router.get("/notification-settings", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw createError(401, "Authentication required");

    const [account, categories, webSubs, mobileDevices] = await Promise.all([
      ensureUserNotificationPreferences(userId),
      fetchAllCategoryPreferences(userId),
      fetchActivePushSubscriptionsForUser(userId),
      fetchActiveMobilePushDevicesForUser(userId),
    ]);

    return res.status(200).json({
      account,
      categories,
      devices: {
        web: webSubs.map((sub) => ({
          id: sub.id,
          userAgent: sub.userAgent,
          createdAt: sub.createdAt,
          lastUsedAt: sub.lastUsedAt,
        })),
        mobile: mobileDevices.map((device) => ({
          id: device.id,
          platform: device.platform,
          provider: device.provider,
          deviceName: device.deviceName,
          appVersion: device.appVersion,
          createdAt: device.createdAt,
          lastUsedAt: device.lastUsedAt,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
});

// PUT body shape (all fields optional, missing keys leave existing values alone):
//   { account: { pushEnabled, pushMode, inAppEnabled, quietHoursStart, quietHoursEnd },
//     categories: { incident_nearby: { in_app_enabled, mobile_push_enabled, ... }, ... } }
router.put("/notification-settings", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw createError(401, "Authentication required");

    const body = req.body && typeof req.body === "object" ? req.body : {};

    if (body.account && typeof body.account === "object") {
      await updateUserNotificationPreferences(userId, body.account);
    }

    if (body.categories && typeof body.categories === "object") {
      const tasks = [];
      for (const [category, patch] of Object.entries(body.categories)) {
        if (!ALL_CATEGORIES.includes(category)) continue;
        if (!patch || typeof patch !== "object") continue;
        tasks.push(updateCategoryPreference(userId, category, patch));
      }
      await Promise.all(tasks);
    }

    const [account, categories] = await Promise.all([
      ensureUserNotificationPreferences(userId),
      fetchAllCategoryPreferences(userId),
    ]);
    return res.status(200).json({ account, categories });
  } catch (error) {
    return next(error);
  }
});

// Dismiss the moderation warning banner for the authenticated user. Idempotent.
router.post("/warning/acknowledge", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      throw createError(401, "Authentication required");
    }
    const updated = await acknowledgeOwnWarning(userId);
    return res.status(200).json({ user: updated });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
