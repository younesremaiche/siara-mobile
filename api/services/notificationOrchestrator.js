// Centralized notification orchestration.
//
// Public entry points: notifyNearbyUsersForReport, notifyOfficerAssignedToIncident,
// notifySupervisorOfOfficerStatusChange, notifyPoliceWorkZoneIncident,
// notifyNearbyOfficersForBackup, dispatchNotificationToAllPlatforms.
//
// Per-platform fan-out: in-app (app.notifications + Socket.IO), web push
// (VAPID via pushService), mobile push (Expo via pushService), and a
// best-effort email queue line. Every per-channel attempt — including
// skipped ones — writes a row to app.notification_delivery_log so the
// "why didn't user X get a push?" question has a single source of truth.
//
// This service deliberately does NOT replace the existing alert-rule pipeline
// in reportNotificationService.js. That trigger continues to match user
// alert_rules; the orchestrator covers the new event types that were
// previously not notified at all (work-zone incidents, supervisor assigns,
// officer status changes, true within-5km nearby fan-out).

const pool = require("../db");
const { mapNotificationRow } = require("./notificationsService");
const { emitNotificationCreatedToUser } = require("./notificationSocket");
const {
  ensureUserNotificationPreferences,
  fetchActiveMobilePushDevicesForUser,
  fetchActivePushSubscriptionsForUser,
  sendPushToUser,
} = require("./pushService");

const ORCHESTRATOR_DEBUG_ENABLED =
  process.env.NODE_ENV !== "production"
  || process.env.NOTIFICATION_DEBUG === "true"
  || process.env.ORCHESTRATOR_DEBUG === "true";

// ---------------------------------------------------------------------------
// Categories — kept in sync with app.user_notification_category_preferences.
// ---------------------------------------------------------------------------

const NOTIFICATION_CATEGORIES = Object.freeze({
  INCIDENT_NEARBY: "incident_nearby",
  USER_ALERT_MATCH: "user_alert_match",
  POLICE_ASSIGNMENT: "police_assignment",
  POLICE_STATUS_UPDATE: "police_status_update",
  POLICE_WORK_ZONE_INCIDENT: "police_work_zone_incident",
  POLICE_BACKUP: "police_backup",
  OPERATIONAL_ALERT: "operational_alert",
  SYSTEM: "system",
});

const ALL_CATEGORIES = Object.freeze(Object.values(NOTIFICATION_CATEGORIES));

// Default per-category preferences applied on first-touch. Stricter defaults
// for email; everything else opt-out.
const CATEGORY_DEFAULTS = {
  [NOTIFICATION_CATEGORIES.INCIDENT_NEARBY]: {
    in_app_enabled: true,
    mobile_push_enabled: true,
    web_push_enabled: true,
    email_enabled: false,
    important_only: false,
  },
  [NOTIFICATION_CATEGORIES.USER_ALERT_MATCH]: {
    in_app_enabled: true,
    mobile_push_enabled: true,
    web_push_enabled: true,
    email_enabled: false,
    important_only: false,
  },
  [NOTIFICATION_CATEGORIES.POLICE_ASSIGNMENT]: {
    in_app_enabled: true,
    mobile_push_enabled: true,
    web_push_enabled: true,
    email_enabled: false,
    important_only: false,
  },
  [NOTIFICATION_CATEGORIES.POLICE_STATUS_UPDATE]: {
    in_app_enabled: true,
    mobile_push_enabled: true,
    web_push_enabled: true,
    email_enabled: false,
    important_only: false,
  },
  [NOTIFICATION_CATEGORIES.POLICE_WORK_ZONE_INCIDENT]: {
    in_app_enabled: true,
    mobile_push_enabled: true,
    web_push_enabled: true,
    email_enabled: false,
    important_only: false,
  },
  [NOTIFICATION_CATEGORIES.POLICE_BACKUP]: {
    in_app_enabled: true,
    mobile_push_enabled: true,
    web_push_enabled: true,
    email_enabled: false,
    important_only: false,
  },
  [NOTIFICATION_CATEGORIES.OPERATIONAL_ALERT]: {
    in_app_enabled: true,
    mobile_push_enabled: true,
    web_push_enabled: true,
    email_enabled: false,
    important_only: false,
  },
  [NOTIFICATION_CATEGORIES.SYSTEM]: {
    in_app_enabled: true,
    mobile_push_enabled: false,
    web_push_enabled: false,
    email_enabled: false,
    important_only: false,
  },
};

// ---------------------------------------------------------------------------
// Event types — each event maps to a category and default priority.
// `important` events bypass push_mode='important_only' and category-level
// important_only filters; they also bypass dedupe TTL when force=true is set.
// ---------------------------------------------------------------------------

const EVENT_TYPES = Object.freeze({
  INCIDENT_NEARBY_5KM: {
    category: NOTIFICATION_CATEGORIES.INCIDENT_NEARBY,
    defaultPriority: 1,
    important: true,
  },
  POLICE_INCIDENT_ASSIGNED: {
    category: NOTIFICATION_CATEGORIES.POLICE_ASSIGNMENT,
    defaultPriority: 1,
    important: true,
  },
  POLICE_INCIDENT_VERIFIED: {
    category: NOTIFICATION_CATEGORIES.POLICE_STATUS_UPDATE,
    defaultPriority: 2,
    important: false,
  },
  POLICE_INCIDENT_REJECTED: {
    category: NOTIFICATION_CATEGORIES.POLICE_STATUS_UPDATE,
    defaultPriority: 2,
    important: false,
  },
  POLICE_INCIDENT_RESOLVED: {
    category: NOTIFICATION_CATEGORIES.POLICE_STATUS_UPDATE,
    defaultPriority: 2,
    important: false,
  },
  POLICE_INCIDENT_STATUS_CHANGED: {
    category: NOTIFICATION_CATEGORIES.POLICE_STATUS_UPDATE,
    defaultPriority: 2,
    important: false,
  },
  POLICE_WORK_ZONE_INCIDENT: {
    category: NOTIFICATION_CATEGORIES.POLICE_WORK_ZONE_INCIDENT,
    defaultPriority: 1,
    important: true,
  },
  POLICE_BACKUP_REQUESTED: {
    category: NOTIFICATION_CATEGORIES.POLICE_BACKUP,
    defaultPriority: 1,
    important: true,
  },
  // Admin Decision Engine "Request More Info" — pings the original reporter
  // so they see the moderator's question on their Reports page and can answer
  // via POST /api/reports/:id/info-response.
  REPORT_INFO_REQUESTED: {
    category: NOTIFICATION_CATEGORIES.SYSTEM,
    defaultPriority: 1,
    important: true,
  },
});

const NEARBY_RADIUS_METERS = 5000;
const DEFAULT_BACKUP_RADIUS_METERS = 5000;
const DEDUPE_WINDOW_MINUTES = Math.max(
  1,
  Number.parseInt(process.env.NOTIFICATION_DEDUPE_MINUTES || "60", 10) || 60,
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function debugLog(event, payload = {}) {
  if (!ORCHESTRATOR_DEBUG_ENABLED) return;
  console.info(`[notify-orchestrator] ${event}`, payload);
}

function normalizeData(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function buildMapDeepLink(reportId, lat, lng) {
  if (!reportId) return "/notifications";
  const params = new URLSearchParams({ reportId: String(reportId) });
  if (Number.isFinite(Number(lat))) params.set("lat", String(lat));
  if (Number.isFinite(Number(lng))) params.set("lng", String(lng));
  return `/map?${params.toString()}`;
}

function buildPoliceMapDeepLink({ reportId, assignmentId }) {
  if (!reportId) return "/police/map";
  const params = new URLSearchParams({ reportId: String(reportId) });
  if (assignmentId) params.set("assignmentId", String(assignmentId));
  return `/police/map?${params.toString()}`;
}

function buildMobileDeepLink({ screen, reportId, assignmentId, lat, lng }) {
  const params = new URLSearchParams();
  if (reportId) params.set("reportId", String(reportId));
  if (assignmentId) params.set("assignmentId", String(assignmentId));
  if (Number.isFinite(Number(lat))) params.set("lat", String(lat));
  if (Number.isFinite(Number(lng))) params.set("lng", String(lng));
  const query = params.toString();
  return `siara://${screen || "map"}${query ? `?${query}` : ""}`;
}

// ---------------------------------------------------------------------------
// Category-preference reads (auto-seeds defaults on first access)
// ---------------------------------------------------------------------------

async function ensureCategoryPreference(userId, category, db = pool) {
  const defaults = CATEGORY_DEFAULTS[category] || CATEGORY_DEFAULTS[NOTIFICATION_CATEGORIES.SYSTEM];

  const result = await db.query(
    `
      with inserted as (
        insert into app.user_notification_category_preferences (
          user_id, category,
          in_app_enabled, mobile_push_enabled, web_push_enabled, email_enabled, important_only
        )
        values ($1::uuid, $2::text, $3, $4, $5, $6, $7)
        on conflict (user_id, category) do nothing
        returning *
      )
      select * from inserted
      union all
      select * from app.user_notification_category_preferences
      where user_id = $1::uuid and category = $2::text
        and not exists (select 1 from inserted)
      limit 1
    `,
    [
      userId,
      category,
      defaults.in_app_enabled,
      defaults.mobile_push_enabled,
      defaults.web_push_enabled,
      defaults.email_enabled,
      defaults.important_only,
    ],
  );

  const row = result.rows[0] || null;
  if (!row) return defaults;
  return {
    in_app_enabled: Boolean(row.in_app_enabled),
    mobile_push_enabled: Boolean(row.mobile_push_enabled),
    web_push_enabled: Boolean(row.web_push_enabled),
    email_enabled: Boolean(row.email_enabled),
    important_only: Boolean(row.important_only),
  };
}

async function fetchAllCategoryPreferences(userId, db = pool) {
  // Auto-seed in one round-trip per category, then return the full set.
  await Promise.all(
    ALL_CATEGORIES.map((category) => ensureCategoryPreference(userId, category, db)),
  );

  const result = await db.query(
    `
      select category,
             in_app_enabled,
             mobile_push_enabled,
             web_push_enabled,
             email_enabled,
             important_only
        from app.user_notification_category_preferences
       where user_id = $1::uuid
    `,
    [userId],
  );

  const byCategory = {};
  for (const row of result.rows) {
    byCategory[row.category] = {
      in_app_enabled: Boolean(row.in_app_enabled),
      mobile_push_enabled: Boolean(row.mobile_push_enabled),
      web_push_enabled: Boolean(row.web_push_enabled),
      email_enabled: Boolean(row.email_enabled),
      important_only: Boolean(row.important_only),
    };
  }
  return byCategory;
}

async function updateCategoryPreference(userId, category, patch, db = pool) {
  if (!ALL_CATEGORIES.includes(category)) {
    const error = new Error(`Unknown notification category: ${category}`);
    error.status = 400;
    throw error;
  }

  // Read-then-merge: ensures defaults are seeded and only specified fields change.
  const current = await ensureCategoryPreference(userId, category, db);
  const next = {
    in_app_enabled: patch.in_app_enabled ?? current.in_app_enabled,
    mobile_push_enabled: patch.mobile_push_enabled ?? current.mobile_push_enabled,
    web_push_enabled: patch.web_push_enabled ?? current.web_push_enabled,
    email_enabled: patch.email_enabled ?? current.email_enabled,
    important_only: patch.important_only ?? current.important_only,
  };

  await db.query(
    `
      insert into app.user_notification_category_preferences (
        user_id, category,
        in_app_enabled, mobile_push_enabled, web_push_enabled, email_enabled, important_only,
        created_at, updated_at
      )
      values ($1::uuid, $2::text, $3, $4, $5, $6, $7, now(), now())
      on conflict (user_id, category) do update set
        in_app_enabled = excluded.in_app_enabled,
        mobile_push_enabled = excluded.mobile_push_enabled,
        web_push_enabled = excluded.web_push_enabled,
        email_enabled = excluded.email_enabled,
        important_only = excluded.important_only,
        updated_at = now()
    `,
    [
      userId,
      category,
      next.in_app_enabled,
      next.mobile_push_enabled,
      next.web_push_enabled,
      next.email_enabled,
      next.important_only,
    ],
  );

  return next;
}

// ---------------------------------------------------------------------------
// Delivery-log writer
// ---------------------------------------------------------------------------

async function recordDeliveryAttempt({
  notificationId,
  userId,
  channel,
  platform = null,
  deviceId = null,
  status,
  provider = null,
  providerMessageId = null,
  errorMessage = null,
  deliveredAt = null,
  metadata = {},
}, db = pool) {
  try {
    await db.query(
      `
        insert into app.notification_delivery_log (
          notification_id, user_id, channel, platform, device_id,
          status, provider, provider_message_id, error_message,
          delivered_at, metadata
        )
        values ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
        notificationId,
        userId,
        channel,
        platform,
        deviceId,
        status,
        provider,
        providerMessageId,
        errorMessage,
        deliveredAt,
        JSON.stringify(metadata || {}),
      ],
    );
  } catch (error) {
    // Never let logging failures cascade into delivery failures.
    console.warn("[notify-orchestrator] delivery_log_write_failed", {
      message: error.message,
      notificationId,
      userId,
      channel,
    });
  }
}

// ---------------------------------------------------------------------------
// Dedupe: skip a notification if the same dedupeKey is already represented
// by a notification row created within DEDUPE_WINDOW_MINUTES.
// ---------------------------------------------------------------------------

async function isDuplicateDedupeKey(dedupeKey, db = pool) {
  if (!dedupeKey) return false;
  const result = await db.query(
    `
      select 1
        from app.notifications
       where created_at >= now() - ($2::int * interval '1 minute')
         and data->>'dedupeKey' = $1
       limit 1
    `,
    [dedupeKey, DEDUPE_WINDOW_MINUTES],
  );
  return result.rowCount > 0;
}

// ---------------------------------------------------------------------------
// Notification row insert
// ---------------------------------------------------------------------------

async function insertNotificationRow({
  userId, reportId = null, eventType, title, body, priority, data,
}, db = pool) {
  const result = await db.query(
    `
      insert into app.notifications (
        user_id, report_id, channel, status, priority, created_at,
        event_type, title, body, data
      )
      values ($1::uuid, $2, 'websocket', 'pending', $3, now(), $4, $5, $6, $7::jsonb)
      returning *
    `,
    [
      userId,
      reportId,
      Number(priority) || 2,
      eventType,
      title,
      body,
      JSON.stringify(data || {}),
    ],
  );

  return mapNotificationRow(result.rows[0] || null);
}

// ---------------------------------------------------------------------------
// Email — current emailService requires a templateKey; we don't have a generic
// notification template, so we log the queue intent and write a delivery_log
// row with status='skipped'+reason. Wire a real template later by extending
// emailService.renderTemplate() and calling it here.
// ---------------------------------------------------------------------------

async function dispatchEmail({ notificationId, userId }, db = pool) {
  await recordDeliveryAttempt({
    notificationId,
    userId,
    channel: "email",
    status: "skipped",
    errorMessage: "no_generic_notification_template",
    metadata: { note: "Extend emailService templates to enable transactional notification email." },
  }, db);
  debugLog("email_queued/skipped", {
    notificationId,
    userId,
    reason: "no_generic_notification_template",
  });
  return { sent: false, reason: "no_generic_notification_template" };
}

// ---------------------------------------------------------------------------
// Core dispatcher — fan a single notification out to all enabled platforms.
// ---------------------------------------------------------------------------

async function dispatchNotificationToAllPlatforms({
  userId,
  eventType,
  title,
  body,
  data = {},
  priority,
  reportId = null,
  category: explicitCategory = null,
  force = false,
  dedupeKey = null,
  db = pool,
} = {}) {
  if (!userId || !eventType) {
    return { ok: false, reason: "invalid_input" };
  }

  const eventMeta = EVENT_TYPES[eventType] || { category: NOTIFICATION_CATEGORIES.SYSTEM, defaultPriority: 2, important: false };
  const category = explicitCategory || eventMeta.category;
  const effectivePriority = Number(priority) || eventMeta.defaultPriority || 2;
  const isImportant = Boolean(force) || Boolean(eventMeta.important);

  // 1. Dedupe — duplicate suppression takes precedence over everything except force.
  if (dedupeKey && !force) {
    const duplicate = await isDuplicateDedupeKey(dedupeKey, db);
    if (duplicate) {
      debugLog("dedupe_suppressed", { userId, eventType, dedupeKey });
      return { ok: false, reason: "duplicate_suppressed" };
    }
  }

  // 2. Account-level account-wide preferences + per-category preference.
  const accountPrefs = await ensureUserNotificationPreferences(userId, db);
  const categoryPrefs = await ensureCategoryPreference(userId, category, db);

  // 3. Hard account-level disable still blocks even forced notifications.
  if (!accountPrefs?.inAppEnabled && !categoryPrefs.mobile_push_enabled && !categoryPrefs.web_push_enabled) {
    debugLog("user_pref_disabled", { userId, eventType, category });
    return { ok: false, reason: "user_pref_disabled" };
  }

  // 4. Insert the notification row. We do this BEFORE per-channel gating so that
  // a delivery_log row can reference an existing notification_id even when every
  // channel is skipped — keeps "why didn't this fire?" answerable.
  const enrichedData = {
    ...normalizeData(data),
    category,
    eventType,
    important: isImportant,
    dedupeKey: dedupeKey || null,
  };

  const notification = await insertNotificationRow({
    userId,
    reportId,
    eventType,
    title,
    body,
    priority: effectivePriority,
    data: enrichedData,
  }, db);

  if (!notification?.id) {
    return { ok: false, reason: "notification_insert_failed" };
  }

  debugLog("notification_created", {
    notificationId: notification.id,
    userId,
    eventType,
    category,
    priority: effectivePriority,
    important: isImportant,
  });

  // 5. In-app channel — always inserted; emit live to socket if user is online.
  const inAppPlatformLog = { channel: "in_app", notificationId: notification.id, userId };
  if (categoryPrefs.in_app_enabled || isImportant) {
    try {
      emitNotificationCreatedToUser(userId, notification);
      await recordDeliveryAttempt({
        ...inAppPlatformLog,
        platform: "web",
        status: "sent",
        deliveredAt: new Date().toISOString(),
      }, db);
      debugLog("in_app_emitted", { notificationId: notification.id, userId });
    } catch (error) {
      await recordDeliveryAttempt({
        ...inAppPlatformLog,
        platform: "web",
        status: "failed",
        errorMessage: error.message,
      }, db);
    }
  } else {
    await recordDeliveryAttempt({
      ...inAppPlatformLog,
      platform: "web",
      status: "skipped",
      errorMessage: "channel_disabled",
    }, db);
    debugLog("in_app_skipped", { notificationId: notification.id, userId, reason: "channel_disabled" });
  }

  // 6. Account-wide push gating (push_mode/quiet_hours apply to BOTH web + mobile).
  const pushModeAllows = isImportant || (accountPrefs.pushEnabled && accountPrefs.pushMode !== "off");
  const isImportantEnoughForMode =
    isImportant
    || accountPrefs.pushMode === "all"
    || (accountPrefs.pushMode === "important_only" && isImportant);
  const allowPushOverall = pushModeAllows && isImportantEnoughForMode;

  // Web push.
  await dispatchWebPushChannel({
    notification,
    userId,
    payload: buildPushPayloadFromNotification(notification, enrichedData),
    enabled: categoryPrefs.web_push_enabled && allowPushOverall,
    skipReason: !allowPushOverall
      ? (accountPrefs.pushMode === "off" ? "channel_disabled" : "important_only_not_important")
      : !categoryPrefs.web_push_enabled
        ? "channel_disabled"
        : null,
  }, db);

  // Mobile push.
  await dispatchMobilePushChannel({
    notification,
    userId,
    payload: buildPushPayloadFromNotification(notification, enrichedData),
    enabled: categoryPrefs.mobile_push_enabled && allowPushOverall,
    skipReason: !allowPushOverall
      ? (accountPrefs.pushMode === "off" ? "channel_disabled" : "important_only_not_important")
      : !categoryPrefs.mobile_push_enabled
        ? "channel_disabled"
        : null,
  }, db);

  // 7. Email — opt-in, currently logs queued/skipped (see dispatchEmail comment).
  if (categoryPrefs.email_enabled) {
    await dispatchEmail({ notificationId: notification.id, userId }, db);
  } else {
    await recordDeliveryAttempt({
      notificationId: notification.id,
      userId,
      channel: "email",
      status: "skipped",
      errorMessage: "channel_disabled",
    }, db);
  }

  return {
    ok: true,
    notificationId: notification.id,
    eventType,
    category,
    important: isImportant,
  };
}

function buildPushPayloadFromNotification(notification, data) {
  const url = data?.url || data?.mapUrl || `/notifications`;
  return {
    notificationId: notification.id,
    eventType: notification.eventType,
    title: notification.title,
    body: notification.body,
    url,
    priority: notification.priority,
    zoneName: data?.locationLabel || null,
    icon: "/siara-push-icon.svg",
    badge: "/siara-push-badge.svg",
    tag: notification.id,
    data: {
      notificationId: notification.id,
      reportId: notification.reportId || data?.reportId || null,
      assignmentId: data?.assignmentId || null,
      eventType: notification.eventType,
      url,
      mobileUrl: data?.mobileUrl || null,
      actions: data?.actions || [],
    },
  };
}

async function dispatchWebPushChannel({ notification, userId, payload, enabled, skipReason }, db) {
  if (!enabled) {
    const subscriptions = await fetchActivePushSubscriptionsForUser(userId, db).catch(() => []);
    const reason = skipReason || (subscriptions.length === 0 ? "no_active_web_push_subscription" : "channel_disabled");
    await recordDeliveryAttempt({
      notificationId: notification.id,
      userId,
      channel: "web_push",
      platform: "browser",
      status: "skipped",
      errorMessage: reason,
    }, db);
    debugLog("web_push_skipped", { notificationId: notification.id, userId, reason });
    return;
  }

  const subscriptions = await fetchActivePushSubscriptionsForUser(userId, db).catch(() => []);
  if (subscriptions.length === 0) {
    await recordDeliveryAttempt({
      notificationId: notification.id,
      userId,
      channel: "web_push",
      platform: "browser",
      status: "skipped",
      errorMessage: "no_active_web_push_subscription",
    }, db);
    debugLog("web_push_skipped", {
      notificationId: notification.id,
      userId,
      reason: "no_active_web_push_subscription",
    });
    return;
  }

  // Use existing sendPushToUser which handles both web and mobile in parallel;
  // we filter the channel results here so each delivery_log row is per-channel.
  const result = await sendPushToUser(userId, payload, { db });
  const web = result?.channels?.web || result;
  await recordDeliveryAttempt({
    notificationId: notification.id,
    userId,
    channel: "web_push",
    platform: "browser",
    provider: "vapid",
    status: web?.ok ? "sent" : (web?.reason === "no_active_subscriptions" ? "skipped" : "failed"),
    errorMessage: web?.ok ? null : (web?.reason || "send_failed"),
    deliveredAt: web?.ok ? new Date().toISOString() : null,
    metadata: {
      sentCount: web?.sentCount || 0,
      deactivatedCount: web?.deactivatedCount || 0,
      failureCount: web?.failureCount || 0,
    },
  }, db);
  debugLog(web?.ok ? "web_push_sent" : "web_push_skipped", {
    notificationId: notification.id,
    userId,
    reason: web?.reason || null,
    sentCount: web?.sentCount || 0,
  });
}

async function dispatchMobilePushChannel({ notification, userId, payload, enabled, skipReason }, db) {
  if (!enabled) {
    const devices = await fetchActiveMobilePushDevicesForUser(userId, db).catch(() => []);
    const reason = skipReason || (devices.length === 0 ? "no_active_mobile_device" : "channel_disabled");
    await recordDeliveryAttempt({
      notificationId: notification.id,
      userId,
      channel: "mobile_push",
      platform: "mobile",
      status: "skipped",
      errorMessage: reason,
    }, db);
    debugLog("mobile_push_skipped", { notificationId: notification.id, userId, reason });
    return;
  }

  const devices = await fetchActiveMobilePushDevicesForUser(userId, db).catch(() => []);
  if (devices.length === 0) {
    await recordDeliveryAttempt({
      notificationId: notification.id,
      userId,
      channel: "mobile_push",
      platform: "mobile",
      status: "skipped",
      errorMessage: "no_active_mobile_device",
    }, db);
    debugLog("mobile_push_skipped", {
      notificationId: notification.id,
      userId,
      reason: "no_active_mobile_device",
    });
    return;
  }

  // sendPushToUser dispatches both channels; for the mobile log we read the mobile result.
  const result = await sendPushToUser(userId, payload, { db });
  const mobile = result?.channels?.mobile || result;
  await recordDeliveryAttempt({
    notificationId: notification.id,
    userId,
    channel: "mobile_push",
    platform: "mobile",
    provider: devices[0]?.provider || null,
    status: mobile?.ok ? "sent" : (mobile?.reason === "no_active_mobile_devices" ? "skipped" : "failed"),
    errorMessage: mobile?.ok ? null : (mobile?.reason || "send_failed"),
    deliveredAt: mobile?.ok ? new Date().toISOString() : null,
    metadata: {
      sentCount: mobile?.sentCount || 0,
      deactivatedCount: mobile?.deactivatedCount || 0,
      failureCount: mobile?.failureCount || 0,
      tickets: mobile?.tickets || [],
    },
  }, db);
  debugLog(mobile?.ok ? "mobile_push_sent" : "mobile_push_skipped", {
    notificationId: notification.id,
    userId,
    reason: mobile?.reason || null,
    sentCount: mobile?.sentCount || 0,
  });
}

// ---------------------------------------------------------------------------
// High-level event helpers
// ---------------------------------------------------------------------------

async function fetchReportSnapshot(reportId, db = pool) {
  const result = await db.query(
    `
      select
        ar.id,
        ar.reported_by,
        ar.incident_type,
        ar.title,
        ar.description,
        ar.status,
        ar.severity_hint,
        ar.location_label,
        ST_Y(ar.incident_location::geometry) as lat,
        ST_X(ar.incident_location::geometry) as lng,
        ar.latest_spam_score,
        ar.latest_predicted_label,
        ar.latest_ml_confidence
      from app.accident_reports ar
      where ar.id = $1::uuid
      limit 1
    `,
    [reportId],
  );
  return result.rows[0] || null;
}

// 1. notifyNearbyUsersForReport — forced fan-out to civilians within 5 km.
//    Bypasses alert-rule matching. Respects only:
//      - hard account disable (in_app + push both off)
//      - device disabled (handled by web/mobile push paths)
//      - category-level per-channel toggles for incident_nearby
async function notifyNearbyUsersForReport(reportId, db = pool) {
  const report = await fetchReportSnapshot(reportId, db);
  if (!report) {
    debugLog("nearby_skipped", { reportId, reason: "report_not_found" });
    return { ok: false, recipients: [], reason: "report_not_found" };
  }

  if (report.incident_type !== "accident") {
    debugLog("nearby_skipped", { reportId, reason: "incident_type_not_accident", incidentType: report.incident_type });
    return { ok: false, recipients: [], reason: "incident_type_not_accident" };
  }

  if (!Number.isFinite(Number(report.lat)) || !Number.isFinite(Number(report.lng))) {
    debugLog("nearby_skipped", { reportId, reason: "missing_geometry" });
    return { ok: false, recipients: [], reason: "missing_geometry" };
  }

  const candidates = await db.query(
    `
      select ull.user_id
        from app.user_last_known_location ull
       where ull.user_id <> $1::uuid
         and ST_DWithin(
           ull.location,
           ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
           $4
         )
    `,
    [report.reported_by, Number(report.lng), Number(report.lat), NEARBY_RADIUS_METERS],
  );

  if (candidates.rows.length === 0) {
    debugLog("recipients_resolved", { reportId, recipientCount: 0, scope: "nearby_5km" });
    return { ok: true, recipients: [] };
  }

  debugLog("recipients_resolved", {
    reportId,
    recipientCount: candidates.rows.length,
    scope: "nearby_5km",
  });

  const url = buildMapDeepLink(report.id, report.lat, report.lng);
  const mobileUrl = buildMobileDeepLink({ screen: "map", reportId: report.id, lat: report.lat, lng: report.lng });

  const results = [];
  for (const { user_id: userId } of candidates.rows) {
    const result = await dispatchNotificationToAllPlatforms({
      userId,
      eventType: "INCIDENT_NEARBY_5KM",
      title: "Accident reported nearby",
      body: `An accident was reported near you${report.location_label ? ` (${report.location_label})` : ""}.`,
      reportId: report.id,
      force: true,
      dedupeKey: `INCIDENT_NEARBY_5KM:${report.id}:${userId}`,
      data: {
        reportId: report.id,
        lat: report.lat,
        lng: report.lng,
        locationLabel: report.location_label,
        incidentType: report.incident_type,
        screen: "map",
        url,
        mapUrl: url,
        mobileUrl,
      },
      db,
    });
    results.push({ userId, ...result });
  }

  return { ok: true, recipients: results };
}

// 2. notifyOfficerAssignedToIncident — single-target actionable notification.
async function notifyOfficerAssignedToIncident({
  reportId,
  assignmentId,
  officerUserId,
  supervisorUserId = null,
  db = pool,
}) {
  if (!officerUserId || !reportId) {
    return { ok: false, reason: "invalid_input" };
  }
  const report = await fetchReportSnapshot(reportId, db);
  if (!report) return { ok: false, reason: "report_not_found" };

  const url = buildPoliceMapDeepLink({ reportId: report.id, assignmentId });
  const mobileUrl = buildMobileDeepLink({
    screen: "policeAssignment",
    reportId: report.id,
    assignmentId,
    lat: report.lat,
    lng: report.lng,
  });

  return dispatchNotificationToAllPlatforms({
    userId: officerUserId,
    eventType: "POLICE_INCIDENT_ASSIGNED",
    title: "New incident assigned",
    body: `${report.title || "An incident"} was assigned to you${report.location_label ? ` (${report.location_label})` : ""}.`,
    reportId: report.id,
    force: true,
    dedupeKey: `POLICE_INCIDENT_ASSIGNED:${assignmentId || report.id}:${officerUserId}`,
    data: {
      reportId: report.id,
      assignmentId,
      incidentType: report.incident_type,
      title: report.title,
      severityHint: report.severity_hint == null ? null : Number(report.severity_hint),
      status: report.status,
      locationLabel: report.location_label,
      lat: report.lat,
      lng: report.lng,
      latest_spam_score: report.latest_spam_score == null ? null : Number(report.latest_spam_score),
      latest_predicted_label: report.latest_predicted_label || null,
      latest_ml_confidence: report.latest_ml_confidence == null ? null : Number(report.latest_ml_confidence),
      supervisorUserId,
      screen: "policeAssignment",
      url,
      mapUrl: url,
      mobileUrl,
      actions: [
        { id: "accept", label: "Accept" },
        { id: "decline", label: "Decline" },
      ],
    },
    db,
  });
}

// 3. notifySupervisorOfOfficerStatusChange — verify/reject/resolve/status-change.
async function notifySupervisorOfOfficerStatusChange({
  reportId,
  officerUserId,
  supervisorUserId,
  oldStatus,
  newStatus,
  db = pool,
}) {
  if (!supervisorUserId || !reportId || !newStatus) {
    return { ok: false, reason: "invalid_input" };
  }
  const report = await fetchReportSnapshot(reportId, db);
  if (!report) return { ok: false, reason: "report_not_found" };

  const eventType =
    newStatus === "verified" ? "POLICE_INCIDENT_VERIFIED"
    : newStatus === "rejected" ? "POLICE_INCIDENT_REJECTED"
    : newStatus === "resolved" ? "POLICE_INCIDENT_RESOLVED"
    : "POLICE_INCIDENT_STATUS_CHANGED";

  const officerNameRow = officerUserId
    ? await db.query(
        `select concat_ws(' ', first_name, last_name) as name from auth.users where id = $1::uuid limit 1`,
        [officerUserId],
      )
    : { rows: [] };

  const url = buildPoliceMapDeepLink({ reportId: report.id });

  return dispatchNotificationToAllPlatforms({
    userId: supervisorUserId,
    eventType,
    title: `Incident ${newStatus}`,
    body: `${officerNameRow.rows[0]?.name?.trim() || "Officer"} changed ${report.title || "an incident"} from ${oldStatus || "?"} to ${newStatus}.`,
    reportId: report.id,
    dedupeKey: `POLICE_INCIDENT_STATUS_CHANGED:${report.id}:${oldStatus || ""}:${newStatus}:${supervisorUserId}`,
    data: {
      reportId: report.id,
      incidentType: report.incident_type,
      title: report.title,
      oldStatus,
      newStatus,
      officerUserId,
      officerName: officerNameRow.rows[0]?.name || null,
      locationLabel: report.location_label,
      lat: report.lat,
      lng: report.lng,
      latest_spam_score: report.latest_spam_score == null ? null : Number(report.latest_spam_score),
      latest_predicted_label: report.latest_predicted_label || null,
      latest_ml_confidence: report.latest_ml_confidence == null ? null : Number(report.latest_ml_confidence),
      screen: "policeAssignment",
      url,
      mapUrl: url,
    },
    db,
  });
}

// 4. notifyPoliceWorkZoneIncident — all officers whose work_zone_assignment covers
//    the incident's commune (or its parent wilaya for wilaya-level officers).
async function notifyPoliceWorkZoneIncident(reportId, db = pool) {
  const report = await fetchReportSnapshot(reportId, db);
  if (!report) return { ok: false, recipients: [], reason: "report_not_found" };
  if (!Number.isFinite(Number(report.lat)) || !Number.isFinite(Number(report.lng))) {
    return { ok: false, recipients: [], reason: "missing_geometry" };
  }

  // Resolve commune and parent wilaya for the incident point.
  const areaResult = await db.query(
    `
      select commune.id as commune_id,
             commune.name as commune_name,
             wilaya.id as wilaya_id,
             wilaya.name as wilaya_name
        from gis.admin_areas commune
   left join gis.admin_areas wilaya on wilaya.id = commune.parent_id
       where commune.level = 'commune'
         and commune.geom is not null
         and ST_Intersects(
           commune.geom,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)
         )
       order by commune.id asc
       limit 1
    `,
    [Number(report.lng), Number(report.lat)],
  );
  const area = areaResult.rows[0];
  if (!area) {
    debugLog("work_zone_skipped", { reportId, reason: "no_matching_commune" });
    return { ok: false, recipients: [], reason: "no_matching_commune" };
  }

  // Resolve active officers whose assignment matches the incident's commune
  // (commune-level zone) or its parent wilaya (wilaya-level zone).
  const officerIdParams = [area.commune_id, area.wilaya_id || null];
  const officerResult = await db.query(
    `
      select distinct pwza.officer_user_id as user_id
        from app.police_work_zone_assignments pwza
       where pwza.is_active = true
         and (pwza.expires_at is null or pwza.expires_at > now())
         and (
           (pwza.zone_level = 'commune' and pwza.admin_area_id = $1::bigint)
           or
           ($2::bigint is not null and pwza.zone_level = 'wilaya' and pwza.admin_area_id = $2::bigint)
         )
    `,
    officerIdParams,
  );

  if (officerResult.rows.length === 0) {
    debugLog("recipients_resolved", { reportId, scope: "work_zone", recipientCount: 0 });
    return { ok: true, recipients: [] };
  }

  debugLog("recipients_resolved", {
    reportId,
    scope: "work_zone",
    recipientCount: officerResult.rows.length,
    communeId: area.commune_id,
    wilayaId: area.wilaya_id,
  });

  const url = buildPoliceMapDeepLink({ reportId: report.id });
  const mobileUrl = buildMobileDeepLink({
    screen: "policeAssignment",
    reportId: report.id,
    lat: report.lat,
    lng: report.lng,
  });

  const results = [];
  for (const { user_id: officerId } of officerResult.rows) {
    const result = await dispatchNotificationToAllPlatforms({
      userId: officerId,
      eventType: "POLICE_WORK_ZONE_INCIDENT",
      title: `Incident in ${area.commune_name || "your zone"}`,
      body: `${report.title || "An incident"} was reported in ${area.commune_name || "your zone"}.`,
      reportId: report.id,
      force: true,
      dedupeKey: `POLICE_WORK_ZONE_INCIDENT:${report.id}:${officerId}`,
      data: {
        reportId: report.id,
        incidentType: report.incident_type,
        title: report.title,
        severityHint: report.severity_hint == null ? null : Number(report.severity_hint),
        locationLabel: report.location_label,
        lat: report.lat,
        lng: report.lng,
        communeId: area.commune_id,
        communeName: area.commune_name,
        wilayaId: area.wilaya_id,
        wilayaName: area.wilaya_name,
        screen: "policeAssignment",
        url,
        mapUrl: url,
        mobileUrl,
      },
      db,
    });
    results.push({ userId: officerId, ...result });
  }

  return { ok: true, recipients: results };
}

// 5. notifyNearbyOfficersForBackup — urgent fan-out to officers within radius.
async function notifyNearbyOfficersForBackup({
  reportId = null,
  requesterOfficerId,
  radiusMeters = DEFAULT_BACKUP_RADIUS_METERS,
  db = pool,
}) {
  if (!requesterOfficerId) return { ok: false, reason: "invalid_input", recipients: [] };

  // Resolve requester's latest location.
  const requesterRow = await db.query(
    `
      select ST_Y(olu.location::geometry) as lat,
             ST_X(olu.location::geometry) as lng,
             concat_ws(' ', u.first_name, u.last_name) as requester_name
        from app.officer_location_updates olu
        join auth.users u on u.id = olu.officer_user_id
       where olu.officer_user_id = $1::uuid
       order by olu.captured_at desc
       limit 1
    `,
    [requesterOfficerId],
  );
  const requester = requesterRow.rows[0];
  if (!requester) {
    debugLog("backup_skipped", { reportId, reason: "no_requester_location" });
    return { ok: false, recipients: [], reason: "no_requester_location" };
  }

  // Latest location per other on-duty officer within radius.
  const nearbyOfficers = await db.query(
    `
      with latest as (
        select distinct on (olu.officer_user_id)
               olu.officer_user_id,
               olu.location,
               olu.captured_at
          from app.officer_location_updates olu
         where olu.officer_user_id <> $1::uuid
         order by olu.officer_user_id, olu.captured_at desc
      )
      select latest.officer_user_id as user_id,
             ST_Y(latest.location::geometry) as lat,
             ST_X(latest.location::geometry) as lng,
             ST_Distance(
               latest.location,
               ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
             ) as distance_m
        from latest
        join app.police_profiles pp on pp.user_id = latest.officer_user_id
       where pp.is_on_duty = true
         and ST_DWithin(
           latest.location,
           ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
           $4
         )
    `,
    [requesterOfficerId, Number(requester.lng), Number(requester.lat), Number(radiusMeters)],
  );

  if (nearbyOfficers.rows.length === 0) {
    debugLog("recipients_resolved", { reportId, scope: "backup", recipientCount: 0 });
    return { ok: true, recipients: [] };
  }

  debugLog("recipients_resolved", {
    reportId,
    scope: "backup",
    recipientCount: nearbyOfficers.rows.length,
    radiusMeters,
  });

  const url = buildPoliceMapDeepLink({ reportId });
  const dedupeAnchor = reportId || `loc:${Math.round(Number(requester.lat) * 1e4) / 1e4},${Math.round(Number(requester.lng) * 1e4) / 1e4}`;
  const results = [];

  for (const officer of nearbyOfficers.rows) {
    const distance = Math.round(Number(officer.distance_m) || 0);
    const mobileUrl = buildMobileDeepLink({
      screen: "policeAssignment",
      reportId,
      lat: requester.lat,
      lng: requester.lng,
    });
    const result = await dispatchNotificationToAllPlatforms({
      userId: officer.user_id,
      eventType: "POLICE_BACKUP_REQUESTED",
      title: "Backup requested",
      body: `${requester.requester_name?.trim() || "An officer"} requested backup ~${distance} m away.`,
      reportId,
      force: true,
      priority: 1,
      dedupeKey: `POLICE_BACKUP_REQUESTED:${dedupeAnchor}:${requesterOfficerId}:${officer.user_id}`,
      data: {
        reportId,
        requesterOfficerId,
        requesterName: requester.requester_name || null,
        lat: requester.lat,
        lng: requester.lng,
        distanceMeters: distance,
        screen: "policeAssignment",
        url,
        mapUrl: url,
        mobileUrl,
        actions: [
          { id: "accept", label: "Accept backup" },
          { id: "decline", label: "Decline" },
          { id: "navigate", label: "Navigate" },
        ],
      },
      db,
    });
    results.push({ userId: officer.user_id, ...result });
  }

  return { ok: true, recipients: results };
}

// ---------------------------------------------------------------------------
// User-location ping helper (used by /api/users/me/location)
// ---------------------------------------------------------------------------

async function upsertUserLastKnownLocation({
  userId, lat, lng, accuracyMeters = null, source = "browser",
}, db = pool) {
  if (!userId) throw Object.assign(new Error("userId is required"), { status: 400 });
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw Object.assign(new Error("lat and lng must be finite numbers"), { status: 400 });
  }

  await db.query(
    `
      insert into app.user_last_known_location (
        user_id, location, accuracy_m, source, captured_at, updated_at
      )
      values (
        $1::uuid,
        ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
        $4, $5, now(), now()
      )
      on conflict (user_id) do update set
        location = excluded.location,
        accuracy_m = excluded.accuracy_m,
        source = excluded.source,
        captured_at = now(),
        updated_at = now()
    `,
    [userId, Number(lng), Number(lat), accuracyMeters == null ? null : Number(accuracyMeters), source],
  );

  return { userId, lat: Number(lat), lng: Number(lng), accuracyMeters, source };
}

module.exports = {
  NOTIFICATION_CATEGORIES,
  ALL_CATEGORIES,
  CATEGORY_DEFAULTS,
  EVENT_TYPES,
  dispatchNotificationToAllPlatforms,
  notifyNearbyUsersForReport,
  notifyOfficerAssignedToIncident,
  notifySupervisorOfOfficerStatusChange,
  notifyPoliceWorkZoneIncident,
  notifyNearbyOfficersForBackup,
  ensureCategoryPreference,
  fetchAllCategoryPreferences,
  updateCategoryPreference,
  upsertUserLastKnownLocation,
  recordDeliveryAttempt,
};
