// =============================================================================
// adminSystemSettingsService — backs the admin "System Settings" page.
//
// The single table app.system_settings is a flat key/value/jsonb store. This
// service hides that detail behind a structured payload that mirrors the four
// tabs of the UI (severity, notifications, geofencing, general). Defaults live
// in DEFAULTS below and are merged on top of any persisted overrides so the UI
// always renders something sensible — even on a fresh database with zero rows.
//
// Only the keys listed in ALLOWED_KEYS can be written; everything else is
// dropped silently. The shape of each value is validated lightly so the
// frontend can't store anything that would break a later reader.
// =============================================================================

const pool = require("../db");

const ALLOWED_KEYS = new Set([
  "severity.rules",
  "notifications.channels",
  "geofence.rules",
  "general.auto_approve",
  "general.maintenance_mode",
  "general.incident_archive_days",
  "general.audit_log_retention",
  "general.api_rate_limit_per_min",
  "general.max_upload_mb",
]);

const ALLOWED_SEVERITIES = new Set(["low", "medium", "high"]);
const ALLOWED_RETENTION = new Set(["1y", "2y", "5y", "indefinite"]);
const ALLOWED_ARCHIVE_DAYS = new Set([30, 60, 90, 365, 0 /* never */]);

const DEFAULTS = Object.freeze({
  "severity.rules": [
    { id: 1, name: "Multi-vehicle collision",  autoSeverity: "high",   minConfidence: 80, enabled: true  },
    { id: 2, name: "Pedestrian incident",      autoSeverity: "high",   minConfidence: 70, enabled: true  },
    { id: 3, name: "Weather hazard",           autoSeverity: "medium", minConfidence: 65, enabled: true  },
    { id: 4, name: "Roadwork obstruction",     autoSeverity: "low",    minConfidence: 60, enabled: true  },
    { id: 5, name: "Traffic congestion",       autoSeverity: "low",    minConfidence: 50, enabled: false },
    { id: 6, name: "Night-time incident",      autoSeverity: "medium", minConfidence: 60, enabled: true  },
  ],
  "notifications.channels": [
    { id: "push",    name: "Push Notifications", enabled: true,  minSeverity: "medium", description: "Mobile push alerts to affected users" },
    { id: "sms",     name: "SMS Alerts",         enabled: true,  minSeverity: "high",   description: "SMS to registered users in zone" },
    { id: "in_app",  name: "In-App Banner",      enabled: true,  minSeverity: "low",    description: "Non-intrusive banner in the Siara app" },
    { id: "email",   name: "Email Digest",       enabled: false, minSeverity: "medium", description: "Daily email summary of incidents" },
    { id: "webhook", name: "Webhook (External)", enabled: false, minSeverity: "high",   description: "POST to external API endpoints" },
  ],
  "geofence.rules": [
    { id: 1, name: "Algiers Metro Area",        lat: 36.7538, lng: 3.0588, radiusKm: 15, events: ["collision", "weather"],  active: true  },
    { id: 2, name: "Highway E-W Corridor",      lat: 36.4000, lng: 4.5000, radiusKm: 5,  events: ["collision", "roadwork"], active: true  },
    { id: 3, name: "Port Zones (Oran, Annaba)", lat: 35.6976, lng: -0.6337, radiusKm: 8, events: ["hazard"],                active: true  },
    { id: 4, name: "University Districts",      lat: 36.7600, lng: 3.0500, radiusKm: 3,  events: ["collision", "traffic"],  active: false },
  ],
  "general.auto_approve": false,
  "general.maintenance_mode": false,
  "general.incident_archive_days": 90,
  "general.audit_log_retention": "2y",
  "general.api_rate_limit_per_min": 100,
  "general.max_upload_mb": 10,
});

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sanitizeSeverityRules(value) {
  if (!Array.isArray(value)) return DEFAULTS["severity.rules"];
  return value
    .filter((rule) => rule && typeof rule === "object")
    .slice(0, 50) // hard cap so a buggy client can't blow this up
    .map((rule, index) => ({
      id: Number.isInteger(rule.id) ? rule.id : index + 1,
      name: String(rule.name || "Untitled rule").slice(0, 120),
      autoSeverity: ALLOWED_SEVERITIES.has(String(rule.autoSeverity || "").toLowerCase())
        ? String(rule.autoSeverity).toLowerCase()
        : "medium",
      minConfidence: clampInt(rule.minConfidence, 0, 100, 60),
      enabled: rule.enabled !== false,
    }));
}

function sanitizeNotificationChannels(value) {
  if (!Array.isArray(value)) return DEFAULTS["notifications.channels"];
  return value
    .filter((channel) => channel && typeof channel === "object")
    .slice(0, 20)
    .map((channel, index) => ({
      id: String(channel.id || `channel_${index + 1}`).slice(0, 40),
      name: String(channel.name || "Channel").slice(0, 80),
      description: String(channel.description || "").slice(0, 280),
      enabled: channel.enabled !== false,
      minSeverity: ALLOWED_SEVERITIES.has(String(channel.minSeverity || "").toLowerCase())
        ? String(channel.minSeverity).toLowerCase()
        : "medium",
    }));
}

function sanitizeGeofenceRules(value) {
  if (!Array.isArray(value)) return DEFAULTS["geofence.rules"];
  return value
    .filter((rule) => rule && typeof rule === "object")
    .slice(0, 100)
    .map((rule, index) => {
      const lat = Number(rule.lat);
      const lng = Number(rule.lng);
      const radius = Number(rule.radiusKm);
      return {
        id: Number.isInteger(rule.id) ? rule.id : index + 1,
        name: String(rule.name || "Untitled zone").slice(0, 120),
        lat: Number.isFinite(lat) ? Number(lat.toFixed(6)) : 0,
        lng: Number.isFinite(lng) ? Number(lng.toFixed(6)) : 0,
        radiusKm: clampInt(radius, 1, 500, 5),
        events: Array.isArray(rule.events)
          ? rule.events.map((e) => String(e).toLowerCase().slice(0, 32)).slice(0, 12)
          : [],
        active: rule.active !== false,
      };
    });
}

function sanitizeRetention(value) {
  return ALLOWED_RETENTION.has(String(value)) ? String(value) : "2y";
}

function sanitizeArchiveDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 90;
  if (ALLOWED_ARCHIVE_DAYS.has(Math.round(n))) return Math.round(n);
  return 90;
}

const SANITIZERS = Object.freeze({
  "severity.rules":                 sanitizeSeverityRules,
  "notifications.channels":         sanitizeNotificationChannels,
  "geofence.rules":                 sanitizeGeofenceRules,
  "general.auto_approve":           (v) => Boolean(v),
  "general.maintenance_mode":       (v) => Boolean(v),
  "general.incident_archive_days":  sanitizeArchiveDays,
  "general.audit_log_retention":    sanitizeRetention,
  "general.api_rate_limit_per_min": (v) => clampInt(v, 1, 100000, 100),
  "general.max_upload_mb":          (v) => clampInt(v, 1, 1024, 10),
});

async function loadAllSettings(db = pool) {
  const result = await db.query(
    `select key, value, updated_at from app.system_settings where key = any($1::text[])`,
    [[...ALLOWED_KEYS]],
  );
  const stored = new Map();
  for (const row of result.rows) {
    stored.set(row.key, { value: row.value, updatedAt: row.updated_at });
  }

  const merged = {};
  for (const key of ALLOWED_KEYS) {
    const sanitizer = SANITIZERS[key];
    const storedRow = stored.get(key);
    const rawValue = storedRow ? storedRow.value : DEFAULTS[key];
    merged[key] = {
      value: sanitizer ? sanitizer(rawValue) : rawValue,
      updatedAt: storedRow ? storedRow.updatedAt : null,
    };
  }
  return merged;
}

function shapeAsTabPayload(settingsByKey) {
  const get = (key) => settingsByKey[key]?.value;
  return {
    severity: {
      rules: get("severity.rules"),
    },
    notifications: {
      channels: get("notifications.channels"),
    },
    geofencing: {
      rules: get("geofence.rules"),
    },
    general: {
      autoApprove:           get("general.auto_approve"),
      maintenanceMode:       get("general.maintenance_mode"),
      incidentArchiveDays:   get("general.incident_archive_days"),
      auditLogRetention:     get("general.audit_log_retention"),
      apiRateLimitPerMin:    get("general.api_rate_limit_per_min"),
      maxUploadMb:           get("general.max_upload_mb"),
    },
    updatedAt: Object.values(settingsByKey).reduce(
      (latest, entry) => (entry.updatedAt && (!latest || entry.updatedAt > latest)) ? entry.updatedAt : latest,
      null,
    ),
  };
}

/** Public entry point — single payload shaped per-tab so the UI can mount fast. */
async function getSystemSettings(db = pool) {
  const settingsByKey = await loadAllSettings(db);
  return shapeAsTabPayload(settingsByKey);
}

/**
 * Updates one or more keys. Accepts either { key, value } or
 * { settings: [{key, value}, ...] }. Unknown keys are dropped silently so a
 * misbehaving client can't write arbitrary rows.
 */
async function updateSystemSettings(payload, actor = null, db = pool) {
  const updates = [];
  if (payload && Array.isArray(payload.settings)) {
    for (const entry of payload.settings) {
      if (entry && typeof entry === "object" && ALLOWED_KEYS.has(entry.key)) {
        updates.push({ key: entry.key, value: entry.value });
      }
    }
  } else if (payload && typeof payload === "object" && payload.key && ALLOWED_KEYS.has(payload.key)) {
    updates.push({ key: payload.key, value: payload.value });
  }

  if (updates.length === 0) {
    const error = new Error("No valid settings provided");
    error.status = 400;
    throw error;
  }

  const client = await db.connect();
  try {
    await client.query("begin");
    for (const { key, value } of updates) {
      const sanitizer = SANITIZERS[key];
      const sanitized = sanitizer ? sanitizer(value) : value;
      await client.query(
        `
          insert into app.system_settings (key, value, updated_at, updated_by)
          values ($1, $2::jsonb, now(), $3)
          on conflict (key)
          do update set value      = excluded.value,
                        updated_at = now(),
                        updated_by = excluded.updated_by
        `,
        [key, JSON.stringify(sanitized), actor?.userId || actor?.id || null],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return getSystemSettings(db);
}

/** Reset all settings to defaults (used by the "Reset to Defaults" button). */
async function resetSystemSettings(actor = null, db = pool) {
  await db.query(`delete from app.system_settings`);
  return getSystemSettings(db);
}

module.exports = {
  ALLOWED_KEYS,
  DEFAULTS,
  getSystemSettings,
  updateSystemSettings,
  resetSystemSettings,
};
