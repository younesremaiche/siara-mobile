const createError = require("http-errors");

const pool = require("../db");
const { hasAnyRole, POLICE_ROLE_NAMES } = require("../contollers/verifytoken");
const { mapNotificationRow, markNotificationAsRead } = require("./notificationsService");
const { emitNotificationCreatedToUser } = require("./notificationSocket");
const { evaluateAndSendPushForNotification } = require("./pushService");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INCIDENT_STATUS_VALUES = new Set([
  "pending",
  "under_review",
  "verified",
  "dispatched",
  "resolved",
  "rejected",
]);

const ALERT_SEVERITY_VALUES = new Set(["low", "medium", "high", "critical"]);
const ALERT_TYPE_VALUES = new Set([
  "incident",
  "weather",
  "roadwork",
  "closure",
  "emergency",
  "advisory",
]);
const TARGET_TYPE_VALUES = new Set(["officer", "role", "zone"]);
const INCIDENT_SCOPE_VALUES = new Set(["active", "nearby", "my", "field_reports"]);

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const NEARBY_DISTANCE_METERS = 500;
const ACTIVE_INCIDENT_STATUSES = ["pending", "under_review", "verified", "dispatched"];
const OFFICER_HISTORY_VISIBLE_ACTIONS = new Set([
  "verify_incident",
  "reject_incident",
  "request_backup",
  "assign_self",
  "update_status",
  "field_note",
  "mark_alert_read",
  "manual_log_entry",
]);
const INTERNAL_HISTORY_ACTIONS = new Set(["location_update"]);
const MAX_MANUAL_HISTORY_NOTE_LENGTH = 1000;
const MAX_USABLE_LOCATION_AGE_MS = 15 * 60 * 1000;
const MAX_USABLE_LOCATION_ACCURACY_M = 200;
const HISTORY_ACTION_VALUES = new Set([
  "verify_incident",
  "reject_incident",
  "request_backup",
  "assign_self",
  "assign_officer",
  "update_status",
  "field_note",
  "mark_alert_read",
  "manual_log_entry",
  "select_work_zone",
  "location_update",
]);

const INCIDENT_BASE_SQL = `
  SELECT
    ar.id,
    ar.reported_by,
    ar.assigned_officer_id,
    ar.verified_by_officer_id,
    ar.verified_at,
    ar.resolved_by_officer_id,
    ar.resolved_at,
    ar.source_channel,
    ar.reported_by_role_snapshot,
    ar.incident_type,
    ar.title,
    ar.description,
    ar.status,
    ar.severity_hint,
    ar.location_label,
    ar.occurred_at,
    ar.created_at,
    ar.updated_at,
    ar.incident_location,
    ST_Y(ar.incident_location::geometry) AS lat,
    ST_X(ar.incident_location::geometry) AS lng,
    commune.id AS commune_id,
    commune.name AS commune_name,
    wilaya.id AS wilaya_id,
    wilaya.name AS wilaya_name,
    concat_ws(' ', reporter.first_name, reporter.last_name) AS reporter_name,
    reporter.email AS reporter_email,
    reporter.avatar_url AS reporter_avatar_url,
    concat_ws(' ', assigned.first_name, assigned.last_name) AS assigned_officer_name,
    concat_ws(' ', verifier.first_name, verifier.last_name) AS verified_officer_name,
    concat_ws(' ', resolver.first_name, resolver.last_name) AS resolved_officer_name,
    latest_assignment.id AS latest_assignment_id,
    latest_assignment.assignment_type AS latest_assignment_type,
    latest_assignment.status AS latest_assignment_status,
    latest_assignment.priority_override AS latest_assignment_priority_override,
    latest_assignment.note AS latest_assignment_note,
    latest_assignment.assigned_at AS latest_assignment_assigned_at,
    latest_assignment.closed_at AS latest_assignment_closed_at,
    (
      SELECT COUNT(*)::int
      FROM app.police_operation_history note_history
      WHERE note_history.report_id = ar.id
        AND note_history.action_type = 'field_note'
    ) AS field_note_count,
    COALESCE(
      ar.reported_by_role_snapshot,
      TO_JSONB(
        COALESCE(
          (
            SELECT ARRAY_AGG(DISTINCT role_rows.name ORDER BY role_rows.name)
            FROM auth.user_roles user_role_rows
            JOIN auth.roles role_rows
              ON role_rows.id = user_role_rows.role_id
            WHERE user_role_rows.user_id = ar.reported_by
          ),
          '{}'::varchar[]
        )
      )
    ) AS reporter_role_snapshot
  FROM app.accident_reports ar
  LEFT JOIN auth.users reporter
    ON reporter.id = ar.reported_by
  LEFT JOIN auth.users assigned
    ON assigned.id = ar.assigned_officer_id
  LEFT JOIN auth.users verifier
    ON verifier.id = ar.verified_by_officer_id
  LEFT JOIN auth.users resolver
    ON resolver.id = ar.resolved_by_officer_id
  LEFT JOIN gis.admin_areas commune
    ON commune.level = 'commune'
   AND ar.incident_location IS NOT NULL
   AND ST_Intersects(commune.geom, ar.incident_location::geometry)
  LEFT JOIN gis.admin_areas wilaya
    ON wilaya.id = commune.parent_id
  LEFT JOIN LATERAL (
    SELECT
      ia.id,
      ia.assignment_type,
      ia.status,
      ia.priority_override,
      ia.note,
      ia.assigned_at,
      ia.closed_at
    FROM app.incident_assignments ia
    WHERE ia.report_id = ar.id
    ORDER BY COALESCE(ia.closed_at, ia.assigned_at) DESC, ia.id DESC
    LIMIT 1
  ) latest_assignment ON TRUE
`;

function normalizeRoleName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function ensurePoliceUser(user) {
  if (!user || !hasAnyRole(user, POLICE_ROLE_NAMES)) {
    throw createError(403, "Police access is required");
  }
}

function isValidUuid(value) {
  return UUID_REGEX.test(String(value || "").trim());
}

function normalizeUuid(value, fieldName, { required = false } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  if (!isValidUuid(normalized)) {
    throw createError(400, `${fieldName} must be a valid id`);
  }

  return normalized;
}

function normalizeInteger(
  value,
  fieldName,
  { required = false, min = 1, max = Number.MAX_SAFE_INTEGER } = {},
) {
  if (value == null || value === "") {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw createError(400, `${fieldName} must be a valid integer`);
  }

  return parsed;
}

function normalizeCoordinate(value, fieldName, { min, max }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw createError(400, `${fieldName} must be a valid coordinate`);
  }

  return parsed;
}

function normalizeOptionalNumber(
  value,
  fieldName,
  { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {},
) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw createError(400, `${fieldName} must be a valid number`);
  }

  return parsed;
}

function normalizeString(value, fieldName, { required = false, maxLength = 255 } = {}) {
  if (value == null) {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  if (typeof value !== "string") {
    throw createError(400, `${fieldName} must be text`);
  }

  const normalized = value.trim();
  if (!normalized) {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  if (normalized.length > maxLength) {
    throw createError(400, `${fieldName} must be at most ${maxLength} characters`);
  }

  return normalized;
}

function normalizeOptionalNote(value, fieldName = "note") {
  return normalizeString(value, fieldName, { required: false, maxLength: 2000 });
}

function normalizeRequiredManualHistoryNote(value) {
  return normalizeString(value, "note", {
    required: true,
    maxLength: MAX_MANUAL_HISTORY_NOTE_LENGTH,
  });
}

function normalizeDateTime(value, fieldName, { required = false } = {}) {
  if (value == null || value === "") {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, `${fieldName} must be a valid datetime`);
  }

  return parsed;
}

function normalizeJsonObject(value, fieldName = "metadata") {
  if (value == null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw createError(400, `${fieldName} must be an object`);
  }

  return value;
}

function normalizePageParams(query = {}) {
  const page =
    normalizeInteger(query.page, "page", {
      required: false,
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
    }) || DEFAULT_PAGE;

  const pageSize =
    normalizeInteger(query.pageSize, "pageSize", {
      required: false,
      min: 1,
      max: MAX_PAGE_SIZE,
    }) || DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function normalizeIncidentStatus(value, fieldName = "status", { required = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  if (!INCIDENT_STATUS_VALUES.has(normalized)) {
    throw createError(400, `${fieldName} is invalid`);
  }

  return normalized;
}

function normalizeAlertSeverity(value, fieldName = "severity", { required = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return null;
  }

  if (!ALERT_SEVERITY_VALUES.has(normalized)) {
    throw createError(400, `${fieldName} is invalid`);
  }

  return normalized;
}

function normalizeAlertType(value, fieldName = "alertType", { required = false } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    if (required) {
      throw createError(400, `${fieldName} is required`);
    }
    return "advisory";
  }

  if (!ALERT_TYPE_VALUES.has(normalized)) {
    throw createError(400, `${fieldName} is invalid`);
  }

  return normalized;
}

function normalizeTargetType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!TARGET_TYPE_VALUES.has(normalized)) {
    throw createError(400, "targetType is invalid");
  }

  return normalized;
}

function normalizeIncidentScope(value) {
  const normalized = String(value || "active").trim().toLowerCase();
  if (!INCIDENT_SCOPE_VALUES.has(normalized)) {
    throw createError(400, "scope is invalid");
  }
  return normalized;
}

function severityLabelFromHint(value) {
  const numeric = Number(value);
  if (numeric >= 4) return "critical";
  if (numeric >= 3) return "high";
  if (numeric >= 2) return "medium";
  return "low";
}

function notificationPriorityFromSeverity(severity) {
  switch (String(severity || "").trim().toLowerCase()) {
    case "critical":
    case "high":
      return 1;
    case "medium":
      return 2;
    default:
      return 3;
  }
}

function isDevelopmentEnvironment() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "development";
}

function debugPoliceQuery(label, sql, values) {
  if (!isDevelopmentEnvironment()) {
    return;
  }

  console.debug(`[police] ${label} SQL:\n${sql}`);
  console.debug(`[police] ${label} values:`, values);
}

function isUsableOfficerLocation(location) {
  if (!location || location.lat == null || location.lng == null) {
    return false;
  }

  const capturedAtMs = location.capturedAt ? new Date(location.capturedAt).getTime() : Number.NaN;
  if (!Number.isFinite(capturedAtMs) || Date.now() - capturedAtMs > MAX_USABLE_LOCATION_AGE_MS) {
    return false;
  }

  if (
    location.accuracyM != null &&
    Number.isFinite(Number(location.accuracyM)) &&
    Number(location.accuracyM) > MAX_USABLE_LOCATION_ACCURACY_M
  ) {
    return false;
  }

  return true;
}

function buildDisplayIncidentId(reportId) {
  const normalized = String(reportId || "").replace(/-/g, "").toUpperCase();
  return normalized ? `INC-${normalized.slice(0, 6)}` : "INC-UNKNOWN";
}

function extractRoleSnapshot(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return extractRoleSnapshot(parsed);
    } catch (_error) {
      return value
        .split(",")
        .map((entry) => String(entry || "").trim())
        .filter(Boolean);
    }
  }

  if (value && typeof value === "object") {
    return Object.values(value)
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }

  return [];
}

function formatPerson(id, name, email = null) {
  if (!id && !name && !email) {
    return null;
  }

  return {
    id: id || null,
    name: name || email || null,
    email: email || null,
  };
}

function mapLocationSummary(areaId, name, level, parentId = null, parentName = null) {
  if (!areaId) {
    return null;
  }

  return {
    id: Number(areaId),
    name: name || null,
    level: level || null,
    parentId: parentId != null ? Number(parentId) : null,
    parentName: parentName || null,
  };
}

async function ensurePoliceProfile(userId, db = pool) {
  await db.query(
    `
      INSERT INTO app.police_profiles (
        user_id,
        first_zone_selection_completed,
        is_on_duty,
        created_at,
        updated_at
      )
      VALUES ($1::uuid, FALSE, TRUE, NOW(), NOW())
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId],
  );
}

async function fetchOfficerContext(userId, db = pool) {
  await ensurePoliceProfile(userId, db);

  const [profileResult, locationResult] = await Promise.all([
    db.query(
      `
        WITH role_rows AS (
          SELECT
            ur.user_id,
            ARRAY_AGG(DISTINCT r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL) AS roles
          FROM auth.user_roles ur
          JOIN auth.roles r
            ON r.id = ur.role_id
          WHERE ur.user_id = $1::uuid
          GROUP BY ur.user_id
        ),
        active_assignments AS (
          SELECT
            MAX(CASE WHEN zone_level = 'wilaya' AND is_active THEN admin_area_id END) AS active_wilaya_id,
            MAX(CASE WHEN zone_level = 'commune' AND is_active THEN admin_area_id END) AS active_commune_id
          FROM app.police_work_zone_assignments
          WHERE officer_user_id = $1::uuid
            AND is_active = TRUE
            AND (expires_at IS NULL OR expires_at > NOW())
        ),
        subordinate_counts AS (
          SELECT
            supervisor_user_id,
            COUNT(*)::int AS subordinate_count
          FROM app.police_profiles
          WHERE supervisor_user_id IS NOT NULL
          GROUP BY supervisor_user_id
        )
        SELECT
          u.id,
          u.email,
          u.phone,
          u.avatar_url,
          CONCAT_WS(' ', u.first_name, u.last_name) AS full_name,
          COALESCE(role_rows.roles, '{}'::varchar[]) AS roles,
          pp.badge_number,
          pp.rank,
          pp.supervisor_user_id,
          CONCAT_WS(' ', supervisor.first_name, supervisor.last_name) AS supervisor_name,
          pp.default_wilaya_id,
          pp.default_commune_id,
          pp.first_zone_selection_completed,
          pp.is_on_duty,
          pp.created_at,
          pp.updated_at,
          active_assignments.active_wilaya_id,
          active_assignments.active_commune_id,
          default_wilaya.name AS default_wilaya_name,
          default_commune.name AS default_commune_name,
          active_wilaya.name AS active_wilaya_name,
          active_commune.name AS active_commune_name,
          active_commune.parent_id AS active_commune_parent_id,
          COALESCE(subordinate_counts.subordinate_count, 0) AS subordinate_count
        FROM auth.users u
        JOIN app.police_profiles pp
          ON pp.user_id = u.id
        LEFT JOIN role_rows
          ON role_rows.user_id = u.id
        LEFT JOIN active_assignments
          ON TRUE
        LEFT JOIN auth.users supervisor
          ON supervisor.id = pp.supervisor_user_id
        LEFT JOIN gis.admin_areas default_wilaya
          ON default_wilaya.id = pp.default_wilaya_id
        LEFT JOIN gis.admin_areas default_commune
          ON default_commune.id = pp.default_commune_id
        LEFT JOIN gis.admin_areas active_wilaya
          ON active_wilaya.id = active_assignments.active_wilaya_id
        LEFT JOIN gis.admin_areas active_commune
          ON active_commune.id = active_assignments.active_commune_id
        LEFT JOIN subordinate_counts
          ON subordinate_counts.supervisor_user_id = u.id
        WHERE u.id = $1::uuid
        LIMIT 1
      `,
      [userId],
    ),
    db.query(
      `
        SELECT
          id,
          officer_user_id,
          accuracy_m,
          heading,
          speed_kmh,
          source,
          captured_at,
          created_at,
          ST_Y(location::geometry) AS lat,
          ST_X(location::geometry) AS lng
        FROM app.officer_location_updates
        WHERE officer_user_id = $1::uuid
        ORDER BY captured_at DESC, id DESC
        LIMIT 1
      `,
      [userId],
    ),
  ]);

  const row = profileResult.rows[0] || null;
  if (!row) {
    throw createError(404, "Police profile not found");
  }

  return mapOfficerContext(row, locationResult.rows[0] || null);
}

function mapOfficerContext(row, locationRow = null) {
  const roles = Array.isArray(row.roles) ? row.roles : [];
  const isSupervisor =
    roles.some((role) => normalizeRoleName(role) === "admin") ||
    roles.some((role) => normalizeRoleName(role) === "policesupervisor") ||
    Number(row.subordinate_count || 0) > 0;

  const activeCommune = mapLocationSummary(
    row.active_commune_id,
    row.active_commune_name,
    row.active_commune_id ? "commune" : null,
    row.active_commune_parent_id,
    row.active_wilaya_name,
  );

  const activeWilaya = mapLocationSummary(
    row.active_wilaya_id,
    row.active_wilaya_name,
    row.active_wilaya_id ? "wilaya" : null,
  );

  return {
    officer: {
      id: row.id,
      name: row.full_name || row.email || "Officer",
      email: row.email,
      phone: row.phone || null,
      avatarUrl: row.avatar_url || "",
      avatar_url: row.avatar_url || "",
      roles,
      badgeNumber: row.badge_number || null,
      rank: row.rank || null,
      isOnDuty: Boolean(row.is_on_duty),
      isSupervisor,
      supervisor: formatPerson(row.supervisor_user_id, row.supervisor_name),
      firstZoneSelectionCompleted: Boolean(row.first_zone_selection_completed),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    },
    workZone: {
      wilaya:
        activeWilaya ||
        mapLocationSummary(
          row.default_wilaya_id,
          row.default_wilaya_name,
          row.default_wilaya_id ? "wilaya" : null,
        ),
      commune:
        activeCommune ||
        mapLocationSummary(
          row.default_commune_id,
          row.default_commune_name,
          row.default_commune_id ? "commune" : null,
          row.default_wilaya_id,
          row.default_wilaya_name,
        ),
      activeAdminAreaId:
        activeCommune?.id ||
        activeWilaya?.id ||
        row.default_commune_id ||
        row.default_wilaya_id ||
        null,
      firstZoneSelectionCompleted: Boolean(row.first_zone_selection_completed),
    },
    latestLocation: locationRow
      ? {
          id: Number(locationRow.id),
          lat: Number(locationRow.lat),
          lng: Number(locationRow.lng),
          accuracyM: locationRow.accuracy_m == null ? null : Number(locationRow.accuracy_m),
          heading: locationRow.heading == null ? null : Number(locationRow.heading),
          speedKmh: locationRow.speed_kmh == null ? null : Number(locationRow.speed_kmh),
          source: locationRow.source || null,
          capturedAt: locationRow.captured_at ? new Date(locationRow.captured_at).toISOString() : null,
          createdAt: locationRow.created_at ? new Date(locationRow.created_at).toISOString() : null,
        }
      : null,
    isSupervisor,
  };
}

async function requireAdminArea(areaId, expectedLevel = null, db = pool) {
  const normalizedAreaId = normalizeInteger(areaId, "adminAreaId", { required: true });

  const result = await db.query(
    `
      SELECT
        area.id,
        area.name,
        area.level,
        area.parent_id,
        parent.name AS parent_name
      FROM gis.admin_areas area
      LEFT JOIN gis.admin_areas parent
        ON parent.id = area.parent_id
      WHERE area.id = $1::bigint
      LIMIT 1
    `,
    [normalizedAreaId],
  );

  const row = result.rows[0] || null;
  if (!row) {
    throw createError(404, "Selected admin area was not found");
  }

  if (expectedLevel && row.level !== expectedLevel) {
    throw createError(400, `Selected admin area must be a ${expectedLevel}`);
  }

  return {
    id: Number(row.id),
    name: row.name,
    level: row.level,
    parentId: row.parent_id != null ? Number(row.parent_id) : null,
    parentName: row.parent_name || null,
  };
}

function officerScopeMatchesIncident(incident, workZone, userId) {
  if (!incident) {
    return false;
  }

  if (incident.reportedBy?.id === userId) {
    return true;
  }

  if (incident.assignedOfficer?.id === userId) {
    return true;
  }

  if (workZone?.commune?.id && incident.commune?.id) {
    return workZone.commune.id === incident.commune.id;
  }

  if (workZone?.wilaya?.id && incident.wilaya?.id) {
    return workZone.wilaya.id === incident.wilaya.id;
  }

  return false;
}

function mapIncidentRow(row) {
  const severityHint = Number(row.severity_hint || 0);
  const reportedByRoleSnapshot = extractRoleSnapshot(
    row.reporter_role_snapshot || row.reported_by_role_snapshot,
  );

  const reportedByPerson = formatPerson(row.reported_by, row.reporter_name, row.reporter_email);

  return {
    id: row.id,
    displayId: buildDisplayIncidentId(row.id),
    incidentType: row.incident_type,
    title: row.title || "",
    description: row.description || "",
    status: row.status,
    severityHint,
    severity: severityLabelFromHint(severityHint),
    locationLabel: row.location_label || "",
    occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    sourceChannel: row.source_channel || null,
    location: {
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
    },
    distanceMeters: row.distance_meters == null ? null : Number(row.distance_meters),
    reportedByRoleSnapshot,
    reportedBy: reportedByPerson
      ? {
          ...reportedByPerson,
          avatarUrl: row.reporter_avatar_url || "",
          avatar_url: row.reporter_avatar_url || "",
          roles: reportedByRoleSnapshot,
        }
      : null,
    wilaya: mapLocationSummary(row.wilaya_id, row.wilaya_name, row.wilaya_id ? "wilaya" : null),
    commune: mapLocationSummary(
      row.commune_id,
      row.commune_name,
      row.commune_id ? "commune" : null,
      row.wilaya_id,
      row.wilaya_name,
    ),
    assignedOfficer: formatPerson(row.assigned_officer_id, row.assigned_officer_name),
    verifiedByOfficer: formatPerson(row.verified_by_officer_id, row.verified_officer_name),
    resolvedByOfficer: formatPerson(row.resolved_by_officer_id, row.resolved_officer_name),
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    assignment: row.latest_assignment_id
      ? {
          id: Number(row.latest_assignment_id),
          assignmentType: row.latest_assignment_type,
          status: row.latest_assignment_status,
          priorityOverride:
            row.latest_assignment_priority_override == null
              ? null
              : Number(row.latest_assignment_priority_override),
          note: row.latest_assignment_note || null,
          assignedAt: row.latest_assignment_assigned_at
            ? new Date(row.latest_assignment_assigned_at).toISOString()
            : null,
          closedAt: row.latest_assignment_closed_at
            ? new Date(row.latest_assignment_closed_at).toISOString()
            : null,
        }
      : null,
    fieldNoteCount: Number(row.field_note_count || 0),
  };
}

async function getIncidentMedia(reportId, db = pool) {
  const result = await db.query(
    `
      SELECT
        id,
        media_type,
        url,
        uploaded_at
      FROM app.report_media
      WHERE report_id = $1::uuid
      ORDER BY uploaded_at ASC NULLS LAST, id ASC
    `,
    [reportId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    mediaType: row.media_type,
    url: row.url,
    uploadedAt: row.uploaded_at ? new Date(row.uploaded_at).toISOString() : null,
  }));
}

async function getOperationHistoryRows(
  {
    officerUserId = null,
    reportId = null,
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    actionType = null,
    includeInternal = false,
  } = {},
  db = pool,
) {
  const offset = (page - 1) * pageSize;
  const values = [];
  const whereClauses = [];

  if (officerUserId) {
    values.push(officerUserId);
    whereClauses.push(`history.officer_user_id = $${values.length}::uuid`);
  }

  if (reportId) {
    values.push(reportId);
    whereClauses.push(`history.report_id = $${values.length}::uuid`);
  }

  if (actionType) {
    values.push(actionType);
    whereClauses.push(`history.action_type = $${values.length}::text`);
  } else if (!includeInternal) {
    values.push(Array.from(OFFICER_HISTORY_VISIBLE_ACTIONS));
    whereClauses.push(`history.action_type = ANY($${values.length}::text[])`);
  }

  values.push(pageSize, offset);

  const result = await db.query(
    `
      SELECT
        history.*,
        COUNT(*) OVER() AS total_count,
        CONCAT_WS(' ', officer.first_name, officer.last_name) AS officer_name,
        report.title AS report_title,
        alert.title AS alert_title
      FROM app.police_operation_history history
      LEFT JOIN auth.users officer
        ON officer.id = history.officer_user_id
      LEFT JOIN app.accident_reports report
        ON report.id = history.report_id
      LEFT JOIN app.operational_alerts alert
        ON alert.id = history.alert_id
      ${whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY history.created_at DESC, history.id DESC
      LIMIT $${values.length - 1}::int
      OFFSET $${values.length}::int
    `,
    values,
  );

  const items = result.rows.map((row) => ({
    id: Number(row.id),
    actionType: row.action_type,
    fromStatus: row.from_status || null,
    toStatus: row.to_status || null,
    note: row.note || null,
    metadata: row.metadata || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    officer: formatPerson(row.officer_user_id, row.officer_name),
    reportId: row.report_id || null,
    reportTitle: row.report_title || null,
    alertId: row.alert_id || null,
    alertTitle: row.alert_title || null,
  }));

  return {
    items,
    total: Number(result.rows[0]?.total_count || 0),
  };
}

async function recordOperationHistory(
  client,
  {
    officerUserId,
    reportId = null,
    alertId = null,
    actionType,
    fromStatus = null,
    toStatus = null,
    note = null,
    metadata = {},
  },
) {
  if (!HISTORY_ACTION_VALUES.has(actionType)) {
    throw createError(400, "Unsupported action type");
  }

  await client.query(
    `
      INSERT INTO app.police_operation_history (
        officer_user_id,
        report_id,
        alert_id,
        action_type,
        from_status,
        to_status,
        note,
        metadata,
        created_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7, $8::jsonb, NOW())
    `,
    [
      officerUserId,
      reportId,
      alertId,
      actionType,
      fromStatus,
      toStatus,
      note,
      JSON.stringify(metadata || {}),
    ],
  );
}

async function requireIncidentRow(reportId, db = pool) {
  const normalizedReportId = normalizeUuid(reportId, "reportId", { required: true });

  const result = await db.query(
    `
      WITH base AS (
        ${INCIDENT_BASE_SQL}
      )
      SELECT base.*
      FROM base
      WHERE base.id = $1::uuid
      LIMIT 1
    `,
    [normalizedReportId],
  );

  const row = result.rows[0] || null;
  if (!row) {
    throw createError(404, "Incident was not found");
  }

  return row;
}

function applyIncidentScope({
  whereClauses,
  values,
  scope,
  officerContext,
  officerUserId,
  officerLocationLngParam = null,
  officerLocationLatParam = null,
}) {
  const workZone = officerContext?.workZone || {};
  const workZoneCommuneId = workZone?.commune?.id || null;
  const workZoneWilayaId = workZone?.wilaya?.id || null;

  if (scope === "nearby") {
    if (!officerLocationLngParam || !officerLocationLatParam) {
      return { locationRequired: true };
    }

    whereClauses.push(`
      ST_DWithin(
        base.incident_location,
        ST_SetSRID(
          ST_MakePoint(
            $${officerLocationLngParam}::double precision,
            $${officerLocationLatParam}::double precision
          ),
          4326
        )::geography,
        ${NEARBY_DISTANCE_METERS}::double precision
      )
    `);
    whereClauses.push(`base.status <> 'rejected'`);
    whereClauses.push(`base.status <> 'resolved'`);
    return { locationRequired: false };
  }

  if (scope === "my") {
    values.push(officerUserId);
    const userParam = values.length;
    whereClauses.push(`
      (
        base.reported_by = $${userParam}::uuid
        OR base.assigned_officer_id = $${userParam}::uuid
        OR EXISTS (
          SELECT 1
          FROM app.incident_assignments my_assignments
          WHERE my_assignments.report_id = base.id
            AND my_assignments.officer_user_id = $${userParam}::uuid
            AND my_assignments.status = 'active'
        )
      )
    `);
    return { locationRequired: false };
  }

  if (scope === "field_reports") {
    whereClauses.push(`base.status <> 'rejected'`);
    if (workZoneCommuneId) {
      values.push(workZoneCommuneId);
      whereClauses.push(`base.commune_id = $${values.length}::bigint`);
    } else if (workZoneWilayaId) {
      values.push(workZoneWilayaId);
      whereClauses.push(`base.wilaya_id = $${values.length}::bigint`);
    }
    return { locationRequired: false };
  }

  whereClauses.push(`base.status <> 'rejected'`);
  whereClauses.push(`base.status <> 'resolved'`);

  if (workZoneCommuneId) {
    values.push(workZoneCommuneId);
    whereClauses.push(`base.commune_id = $${values.length}::bigint`);
  } else if (workZoneWilayaId) {
    values.push(workZoneWilayaId);
    whereClauses.push(`base.wilaya_id = $${values.length}::bigint`);
  }

  return { locationRequired: false };
}

function applyIncidentFilters({ whereClauses, values, filters = {} }) {
  if (filters.status) {
    values.push(filters.status);
    whereClauses.push(`base.status = $${values.length}::text`);
  }

  if (filters.severity) {
    const severity = String(filters.severity).trim().toLowerCase();

    if (severity === "low") {
      whereClauses.push(`COALESCE(base.severity_hint, 0) <= 1`);
    } else if (severity === "medium") {
      whereClauses.push(`COALESCE(base.severity_hint, 0) = 2`);
    } else if (severity === "high") {
      whereClauses.push(`COALESCE(base.severity_hint, 0) = 3`);
    } else if (severity === "critical") {
      whereClauses.push(`COALESCE(base.severity_hint, 0) >= 4`);
    }
  }

  if (filters.wilayaId) {
    values.push(filters.wilayaId);
    whereClauses.push(`base.wilaya_id = $${values.length}::bigint`);
  }

  if (filters.communeId) {
    values.push(filters.communeId);
    whereClauses.push(`base.commune_id = $${values.length}::bigint`);
  }

  if (filters.search) {
    values.push(`%${String(filters.search).trim().toLowerCase()}%`);
    whereClauses.push(`
      (
        LOWER(base.id::text) LIKE $${values.length}::text
        OR LOWER(COALESCE(base.title, '')) LIKE $${values.length}::text
        OR LOWER(COALESCE(base.description, '')) LIKE $${values.length}::text
        OR LOWER(COALESCE(base.location_label, '')) LIKE $${values.length}::text
        OR LOWER(COALESCE(base.reporter_name, '')) LIKE $${values.length}::text
      )
    `);
  }
}

async function listPoliceIncidents(
  officerUserId,
  {
    scope = "active",
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    status = null,
    severity = null,
    wilayaId = null,
    communeId = null,
    search = null,
  } = {},
  db = pool,
) {
  const normalizedScope = normalizeIncidentScope(scope);
  const officerContext = await fetchOfficerContext(officerUserId, db);
  const nearbyLocation = isUsableOfficerLocation(officerContext.latestLocation)
    ? officerContext.latestLocation
    : null;

  const values = [];
  const whereClauses = [];

  let distanceSelectSql = `NULL::double precision AS distance_meters`;
  let orderBySql = `
    ORDER BY
      COALESCE(base.severity_hint, 0) DESC,
      COALESCE(base.occurred_at, base.created_at) DESC
  `;

  if (normalizedScope === "nearby" && !nearbyLocation) {
    return {
      items: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 1,
        returned: 0,
      },
      scope: normalizedScope,
      locationRequired: true,
    };
  }

  let locationParamIndexes = null;

  if (normalizedScope === "nearby" && nearbyLocation) {
    values.push(nearbyLocation.lng, nearbyLocation.lat);
    locationParamIndexes = {
      lng: values.length - 1,
      lat: values.length,
    };

    distanceSelectSql = `
      ST_Distance(
        base.incident_location,
        ST_SetSRID(
          ST_MakePoint(
            $${locationParamIndexes.lng}::double precision,
            $${locationParamIndexes.lat}::double precision
          ),
          4326
        )::geography
      ) AS distance_meters
    `;

    orderBySql = `
      ORDER BY
        distance_meters ASC,
        COALESCE(base.severity_hint, 0) DESC,
        COALESCE(base.occurred_at, base.created_at) DESC
    `;
  }

  applyIncidentScope({
    whereClauses,
    values,
    scope: normalizedScope,
    officerContext,
    officerUserId,
    officerLocationLngParam: locationParamIndexes?.lng || null,
    officerLocationLatParam: locationParamIndexes?.lat || null,
  });

  applyIncidentFilters({
    whereClauses,
    values,
    filters: {
      status: normalizeIncidentStatus(status, "status"),
      severity: severity ? String(severity).trim().toLowerCase() : null,
      wilayaId: wilayaId ? normalizeInteger(wilayaId, "wilayaId") : null,
      communeId: communeId ? normalizeInteger(communeId, "communeId") : null,
      search: search ? String(search).trim() : null,
    },
  });

  values.push(pageSize, (page - 1) * pageSize);

  const sql = `
    WITH base AS (
      ${INCIDENT_BASE_SQL}
    )
    SELECT
      base.*,
      ${distanceSelectSql},
      COUNT(*) OVER() AS total_count
    FROM base
    ${whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : ""}
    ${orderBySql}
    LIMIT $${values.length - 1}::int
    OFFSET $${values.length}::int
  `;

  try {
    const result = await db.query(sql, values);

    const items = result.rows.map(mapIncidentRow);
    const total = Number(result.rows[0]?.total_count || 0);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
        returned: items.length,
      },
      scope: normalizedScope,
      locationRequired: false,
    };
  } catch (error) {
    debugPoliceQuery("listPoliceIncidents", sql, values);
    throw error;
  }
}

async function getIncidentById(officerUserId, reportId, db = pool) {
  const officerContext = await fetchOfficerContext(officerUserId, db);
  const row = await requireIncidentRow(reportId, db);
  const incident = mapIncidentRow(row);

  if (!officerScopeMatchesIncident(incident, officerContext.workZone, officerUserId)) {
    throw createError(403, "You are not allowed to access this incident");
  }

  const [media, history, nearbyResult] = await Promise.all([
    getIncidentMedia(incident.id, db),
    getOperationHistoryRows({ reportId: incident.id, page: 1, pageSize: 50 }, db),
    db.query(
      `
        WITH base AS (
          ${INCIDENT_BASE_SQL}
        ),
        anchor AS (
          SELECT incident_location
          FROM app.accident_reports
          WHERE id = $1::uuid
          LIMIT 1
        )
        SELECT
          base.*,
          ST_Distance(base.incident_location, anchor.incident_location) AS distance_meters
        FROM base
        CROSS JOIN anchor
        WHERE base.id <> $1::uuid
          AND ST_DWithin(base.incident_location, anchor.incident_location, ${NEARBY_DISTANCE_METERS}::double precision)
        ORDER BY distance_meters ASC, COALESCE(base.occurred_at, base.created_at) DESC
        LIMIT 5
      `,
      [incident.id],
    ),
  ]);

  return {
    incident: {
      ...incident,
      media,
    },
    nearbyIncidents: nearbyResult.rows.map(mapIncidentRow),
    history: history.items,
  };
}

async function getPoliceDashboard(officerUserId, db = pool) {
  const officerContext = await fetchOfficerContext(officerUserId, db);

  const [activeIncidents, nearbyIncidents, myIncidents, recentHistory, alerts, statsResult] =
    await Promise.all([
      listPoliceIncidents(officerUserId, { scope: "active", page: 1, pageSize: 5 }, db),
      listPoliceIncidents(officerUserId, { scope: "nearby", page: 1, pageSize: 5 }, db),
      listPoliceIncidents(officerUserId, { scope: "my", page: 1, pageSize: 5 }, db),
      getOperationHistoryRows({ officerUserId, page: 1, pageSize: 5 }, db),
      listPoliceAlerts(officerUserId, { page: 1, pageSize: 5 }, db),
      db.query(
        `
          WITH base AS (
            ${INCIDENT_BASE_SQL}
          )
          SELECT
            COUNT(*) FILTER (
              WHERE base.status <> 'resolved'
                AND base.status <> 'rejected'
                AND (
                  ($1::bigint IS NOT NULL AND base.commune_id = $1::bigint)
                  OR ($1::bigint IS NULL AND $2::bigint IS NOT NULL AND base.wilaya_id = $2::bigint)
                )
            )::int AS active_count,
            COUNT(*) FILTER (
              WHERE COALESCE(base.severity_hint, 0) >= 3
                AND base.status <> 'resolved'
                AND base.status <> 'rejected'
                AND (
                  ($1::bigint IS NOT NULL AND base.commune_id = $1::bigint)
                  OR ($1::bigint IS NULL AND $2::bigint IS NOT NULL AND base.wilaya_id = $2::bigint)
                )
            )::int AS high_priority_count,
            COUNT(*) FILTER (
              WHERE base.status = 'pending'
                AND (
                  ($1::bigint IS NOT NULL AND base.commune_id = $1::bigint)
                  OR ($1::bigint IS NULL AND $2::bigint IS NOT NULL AND base.wilaya_id = $2::bigint)
                )
            )::int AS pending_verification_count
          FROM base
        `,
        [
          officerContext.workZone?.commune?.id || null,
          officerContext.workZone?.wilaya?.id || null,
        ],
      ),
    ]);

  const unreadAlertsCount = alerts.unreadCount;
  const activeItems = activeIncidents.items || [];
  const nearbyItems = nearbyIncidents.items || [];
  const myItems = myIncidents.items || [];

  return {
    officer: officerContext.officer,
    workZone: officerContext.workZone,
    latestLocation: officerContext.latestLocation,
    requiresZoneSelection: !officerContext.officer.firstZoneSelectionCompleted,
    stats: {
      activeCount: Number(statsResult.rows[0]?.active_count || 0),
      highPriorityCount: Number(statsResult.rows[0]?.high_priority_count || 0),
      pendingVerificationCount: Number(statsResult.rows[0]?.pending_verification_count || 0),
      unreadAlertsCount,
    },
    activeIncidents: activeItems,
    nearbyIncidents: nearbyItems,
    nearbyLocationRequired: Boolean(nearbyIncidents.locationRequired),
    myIncidents: myItems,
    recentHistory: recentHistory.items,
    mapMarkers: [...activeItems, ...nearbyItems, ...myItems].map((item) => ({
      id: item.id,
      title: item.title,
      severity: item.severity,
      status: item.status,
      lat: item.location?.lat,
      lng: item.location?.lng,
      locationLabel: item.locationLabel,
    })),
  };
}

async function getPoliceMe(officerUserId, db = pool) {
  const context = await fetchOfficerContext(officerUserId, db);
  return {
    officer: context.officer,
    workZone: context.workZone,
    latestLocation: context.latestLocation,
    requiresZoneSelection: !context.officer.firstZoneSelectionCompleted,
  };
}

async function getPoliceWorkZoneOptions(officerUserId, { wilayaId = null } = {}, db = pool) {
  const context = await fetchOfficerContext(officerUserId, db);
  const selectedWilayaId = wilayaId
    ? normalizeInteger(wilayaId, "wilayaId")
    : context.workZone?.wilaya?.id || null;

  const [wilayasResult, communesResult] = await Promise.all([
    db.query(
      `
        SELECT id, name
        FROM gis.admin_areas
        WHERE level = 'wilaya'
        ORDER BY name ASC
      `,
    ),
    selectedWilayaId
      ? db.query(
          `
            SELECT id, name
            FROM gis.admin_areas
            WHERE level = 'commune'
              AND parent_id = $1::bigint
            ORDER BY name ASC
          `,
          [selectedWilayaId],
        )
      : Promise.resolve({ rows: [] }),
  ]);

  return {
    wilayas: wilayasResult.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
    })),
    communes: communesResult.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
    })),
    selectedWilayaId,
    selectedCommuneId: context.workZone?.commune?.id || null,
  };
}

async function updatePoliceWorkZone(officerUserId, payload = {}, db = pool) {
  const wilayaId = normalizeInteger(payload.wilayaId, "wilayaId", { required: true });
  const communeId = normalizeInteger(payload.communeId, "communeId", { required: true });

  const [wilaya, commune] = await Promise.all([
    requireAdminArea(wilayaId, "wilaya", db),
    requireAdminArea(communeId, "commune", db),
  ]);

  if (commune.parentId !== wilaya.id) {
    throw createError(400, "Selected commune does not belong to the selected wilaya");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await ensurePoliceProfile(officerUserId, client);

    await client.query(
      `
        UPDATE app.police_profiles
        SET
          default_wilaya_id = $2::bigint,
          default_commune_id = $3::bigint,
          first_zone_selection_completed = TRUE,
          updated_at = NOW()
        WHERE user_id = $1::uuid
      `,
      [officerUserId, wilaya.id, commune.id],
    );

    await client.query(
      `
        UPDATE app.police_work_zone_assignments
        SET
          is_active = FALSE,
          updated_at = NOW()
        WHERE officer_user_id = $1::uuid
          AND is_active = TRUE
      `,
      [officerUserId],
    );

    await client.query(
      `
        INSERT INTO app.police_work_zone_assignments (
          officer_user_id,
          admin_area_id,
          zone_level,
          is_active,
          assigned_by,
          assigned_at,
          created_at,
          updated_at
        )
        VALUES
          ($1::uuid, $2::bigint, 'wilaya', TRUE, $1::uuid, NOW(), NOW(), NOW()),
          ($1::uuid, $3::bigint, 'commune', TRUE, $1::uuid, NOW(), NOW(), NOW())
      `,
      [officerUserId, wilaya.id, commune.id],
    );

    await recordOperationHistory(client, {
      officerUserId,
      actionType: "select_work_zone",
      note: `Active working zone set to ${commune.name}, ${wilaya.name}`,
      metadata: {
        wilayaId: wilaya.id,
        wilayaName: wilaya.name,
        communeId: commune.id,
        communeName: commune.name,
      },
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return getPoliceMe(officerUserId, db);
}

async function updatePoliceLocation(officerUserId, payload = {}, db = pool) {
  const lat = normalizeCoordinate(payload.lat, "lat", { min: -90, max: 90 });
  const lng = normalizeCoordinate(payload.lng, "lng", { min: -180, max: 180 });
  const accuracyM = normalizeOptionalNumber(
    payload.accuracyM ?? payload.accuracy_m,
    "accuracyM",
    { min: 0 },
  );
  const heading = normalizeOptionalNumber(payload.heading, "heading", { min: 0, max: 360 });
  const speedKmh = normalizeOptionalNumber(
    payload.speedKmh ?? payload.speed_kmh,
    "speedKmh",
    { min: 0 },
  );
  const capturedAt =
    normalizeDateTime(payload.capturedAt ?? payload.captured_at, "capturedAt", {
      required: false,
    }) || new Date();
  const source = normalizeString(payload.source || "device", "source", {
    required: true,
    maxLength: 50,
  });

  const client = await db.connect();
  let locationRow = null;

  try {
    await client.query("BEGIN");
    await ensurePoliceProfile(officerUserId, client);

    const insertResult = await client.query(
      `
        INSERT INTO app.officer_location_updates (
          officer_user_id,
          location,
          accuracy_m,
          heading,
          speed_kmh,
          captured_at,
          source,
          created_at
        )
        VALUES (
          $1::uuid,
          ST_SetSRID(ST_MakePoint($2::double precision, $3::double precision), 4326)::geography,
          $4,
          $5,
          $6,
          $7,
          $8::text,
          NOW()
        )
        RETURNING
          id,
          officer_user_id,
          accuracy_m,
          heading,
          speed_kmh,
          source,
          captured_at,
          created_at,
          ST_Y(location::geometry) AS lat,
          ST_X(location::geometry) AS lng
      `,
      [officerUserId, lng, lat, accuracyM, heading, speedKmh, capturedAt, source],
    );

    locationRow = insertResult.rows[0] || null;

    await recordOperationHistory(client, {
      officerUserId,
      actionType: "location_update",
      metadata: {
        visibility: "internal",
        lat,
        lng,
        accuracyM,
        heading,
        speedKmh,
        source,
        capturedAt: capturedAt.toISOString(),
      },
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return {
    ok: true,
    location: mapOfficerContext(
      {
        id: officerUserId,
        roles: [],
        subordinate_count: 0,
      },
      locationRow,
    ).latestLocation,
  };
}

async function updateIncidentAssignmentState(client, reportId, officerUserId, status) {
  await client.query(
    `
      UPDATE app.incident_assignments
      SET
        status = $3::text,
        closed_at = CASE WHEN $3::text = 'active' THEN NULL ELSE COALESCE(closed_at, NOW()) END
      WHERE report_id = $1::uuid
        AND officer_user_id = $2::uuid
        AND status = 'active'
    `,
    [reportId, officerUserId, status],
  );
}

async function applyIncidentAction(officerUserId, reportId, handler, db = pool) {
  const officerContext = await fetchOfficerContext(officerUserId, db);
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const currentRow = await requireIncidentRow(reportId, client);
    const incident = mapIncidentRow(currentRow);

    if (!officerScopeMatchesIncident(incident, officerContext.workZone, officerUserId)) {
      throw createError(403, "You are not allowed to act on this incident");
    }

    await handler({
      client,
      currentRow,
      currentIncident: incident,
      officerContext,
    });

    await client.query("COMMIT");
    return getIncidentById(officerUserId, reportId, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function verifyIncident(officerUserId, reportId, payload = {}, db = pool) {
  const note = normalizeOptionalNote(payload.note);

  return applyIncidentAction(
    officerUserId,
    reportId,
    async ({ client, currentRow }) => {
      await client.query(
        `
          UPDATE app.accident_reports
          SET
            status = 'verified',
            verified_by_officer_id = $2::uuid,
            verified_at = NOW(),
            updated_at = NOW()
          WHERE id = $1::uuid
        `,
        [reportId, officerUserId],
      );

      await recordOperationHistory(client, {
        officerUserId,
        reportId,
        actionType: "verify_incident",
        fromStatus: currentRow.status,
        toStatus: "verified",
        note,
      });
    },
    db,
  );
}

async function rejectIncident(officerUserId, reportId, payload = {}, db = pool) {
  const note = normalizeOptionalNote(payload.note, "note");

  return applyIncidentAction(
    officerUserId,
    reportId,
    async ({ client, currentRow }) => {
      await client.query(
        `
          UPDATE app.accident_reports
          SET
            status = 'rejected',
            updated_at = NOW()
          WHERE id = $1::uuid
        `,
        [reportId],
      );

      await updateIncidentAssignmentState(client, reportId, officerUserId, "cancelled");

      await recordOperationHistory(client, {
        officerUserId,
        reportId,
        actionType: "reject_incident",
        fromStatus: currentRow.status,
        toStatus: "rejected",
        note,
      });
    },
    db,
  );
}

async function assignSelfToIncident(officerUserId, reportId, payload = {}, db = pool) {
  const note = normalizeOptionalNote(payload.note);

  return applyIncidentAction(
    officerUserId,
    reportId,
    async ({ client, currentRow }) => {
      await client.query(
        `
          UPDATE app.incident_assignments
          SET
            status = 'closed',
            closed_at = COALESCE(closed_at, NOW())
          WHERE report_id = $1::uuid
            AND status = 'active'
        `,
        [reportId],
      );

      await client.query(
        `
          INSERT INTO app.incident_assignments (
            report_id,
            officer_user_id,
            assigned_by,
            assignment_type,
            status,
            note,
            assigned_at
          )
          VALUES ($1::uuid, $2::uuid, $2::uuid, 'self', 'active', $3, NOW())
        `,
        [reportId, officerUserId, note],
      );

      await client.query(
        `
          UPDATE app.accident_reports
          SET
            assigned_officer_id = $2::uuid,
            updated_at = NOW()
          WHERE id = $1::uuid
        `,
        [reportId, officerUserId],
      );

      await recordOperationHistory(client, {
        officerUserId,
        reportId,
        actionType: "assign_self",
        fromStatus: currentRow.status,
        toStatus: nextStatus,
        note,
      });
    },
    db,
  );
}

async function updateIncidentStatus(officerUserId, reportId, payload = {}, db = pool) {
  const nextStatus = normalizeIncidentStatus(payload.status, "status", { required: true });
  const note = normalizeOptionalNote(payload.note);

  return applyIncidentAction(
    officerUserId,
    reportId,
    async ({ client, currentRow }) => {
      const updateClauses = ["status = $2::text", "updated_at = NOW()"];
      const values = [reportId, nextStatus];

      if (nextStatus === "verified") {
        updateClauses.push(`verified_by_officer_id = $${values.length + 1}::uuid`);
        values.push(officerUserId);
        updateClauses.push("verified_at = COALESCE(verified_at, NOW())");
      }

      if (nextStatus === "resolved") {
        updateClauses.push(`resolved_by_officer_id = $${values.length + 1}::uuid`);
        values.push(officerUserId);
        updateClauses.push("resolved_at = COALESCE(resolved_at, NOW())");
      }

      await client.query(
        `
          UPDATE app.accident_reports
          SET ${updateClauses.join(", ")}
          WHERE id = $1::uuid
        `,
        values,
      );

      if (nextStatus === "resolved" || nextStatus === "rejected") {
        await updateIncidentAssignmentState(client, reportId, officerUserId, "closed");
      }

      await recordOperationHistory(client, {
        officerUserId,
        reportId,
        actionType: "update_status",
        fromStatus: currentRow.status,
        toStatus: nextStatus,
        note,
      });
    },
    db,
  );
}

async function addIncidentFieldNote(officerUserId, reportId, payload = {}, db = pool) {
  const note = normalizeOptionalNote(payload.note, "note");
  if (!note) {
    throw createError(400, "note is required");
  }

  return applyIncidentAction(
    officerUserId,
    reportId,
    async ({ client, currentRow }) => {
      await recordOperationHistory(client, {
        officerUserId,
        reportId,
        actionType: "field_note",
        fromStatus: currentRow.status,
        toStatus: currentRow.status,
        note,
      });
    },
    db,
  );
}

async function getSupervisorRecipientUserId(officerContext, db = pool) {
  if (officerContext?.officer?.supervisor?.id) {
    return officerContext.officer.supervisor.id;
  }

  const result = await db.query(
    `
      SELECT u.id
      FROM auth.users u
      JOIN auth.user_roles ur
        ON ur.user_id = u.id
      JOIN auth.roles r
        ON r.id = ur.role_id
      WHERE LOWER(r.name) = 'admin'
        AND u.is_active = TRUE
      ORDER BY u.created_at ASC
      LIMIT 1
    `,
  );

  return result.rows[0]?.id || null;
}

async function insertNotificationsForUsers(client, notifications = []) {
  const insertedRows = [];

  for (const notification of notifications) {
    const result = await client.query(
      `
        INSERT INTO app.notifications (
          user_id,
          report_id,
          operational_alert_id,
          channel,
          status,
          priority,
          created_at,
          event_type,
          title,
          body,
          data
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'websocket', 'pending', $4::int, NOW(), $5::text, $6::text, $7::text, $8::jsonb)
        RETURNING *
      `,
      [
        notification.userId,
        notification.reportId || null,
        notification.operationalAlertId || null,
        notification.priority,
        notification.eventType,
        notification.title,
        notification.body,
        JSON.stringify(notification.data || {}),
      ],
    );

    if (result.rows[0]) {
      insertedRows.push(result.rows[0]);
    }
  }

  return insertedRows.map(mapNotificationRow);
}

async function requestIncidentBackup(officerUserId, reportId, payload = {}, db = pool) {
  const note = normalizeOptionalNote(payload.note);
  let supervisorNotificationRows = [];

  const detail = await applyIncidentAction(
    officerUserId,
    reportId,
    async ({ client, currentRow, officerContext }) => {
      const supervisorUserId = await getSupervisorRecipientUserId(officerContext, client);
      await client.query(
        `
          UPDATE app.accident_reports
          SET
            assigned_officer_id = COALESCE(assigned_officer_id, $2::uuid),
            updated_at = NOW()
          WHERE id = $1::uuid
        `,
        [reportId, officerUserId],
      );

      await recordOperationHistory(client, {
        officerUserId,
        reportId,
        actionType: "request_backup",
        fromStatus: currentRow.status,
        toStatus: nextStatus,
        note,
      });

      if (supervisorUserId) {
        supervisorNotificationRows = await insertNotificationsForUsers(client, [
          {
            userId: supervisorUserId,
            reportId,
            operationalAlertId: null,
            priority: 1,
            eventType: "POLICE_BACKUP_REQUESTED",
            title: "Backup requested",
            body: `Officer requested backup for ${currentRow.title || buildDisplayIncidentId(reportId)}.`,
            data: {
              reportId,
              requestedBy: officerUserId,
              source: "police",
              action: "request_backup",
            },
          },
        ]);
      }
    },
    db,
  );

  await Promise.allSettled(
    supervisorNotificationRows.map(async (notification) => {
      emitNotificationCreatedToUser(notification.userId, notification);
      await evaluateAndSendPushForNotification(notification, db);
    }),
  );

  return detail;
}

function normalizeIncidentListParams(query = {}) {
  const { page, pageSize } = normalizePageParams(query);

  return {
    scope: normalizeIncidentScope(query.scope || "active"),
    page,
    pageSize,
    status: query.status ? normalizeIncidentStatus(query.status, "status") : null,
    severity: query.severity ? String(query.severity).trim().toLowerCase() : null,
    wilayaId: query.wilayaId ? normalizeInteger(query.wilayaId, "wilayaId") : null,
    communeId: query.communeId ? normalizeInteger(query.communeId, "communeId") : null,
    search: query.search ? String(query.search).trim() : null,
  };
}

function getOfficerAlertTargetFilters(officerContext = {}) {
  const roleTargets = Array.from(
    new Set(
      (Array.isArray(officerContext.officer?.roles) ? officerContext.officer.roles : [])
        .map((role) => normalizeRoleName(role))
        .filter(Boolean),
    ),
  );

  const adminAreaIds = Array.from(
    new Set(
      [officerContext.workZone?.commune?.id || null, officerContext.workZone?.wilaya?.id || null].filter(
        (value) => value != null,
      ),
    ),
  );

  return {
    roleTargets,
    adminAreaIds,
  };
}

function mapPoliceAlertRow(row) {
  return {
    id: row.alert_id,
    notificationId: row.notification_id || null,
    title: row.title || row.notification_title || "",
    description: row.description || row.notification_body || "",
    alertType: row.alert_type || "advisory",
    severity: row.severity || "medium",
    status: row.status || "active",
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    notificationCreatedAt: row.notification_created_at
      ? new Date(row.notification_created_at).toISOString()
      : null,
    read: Boolean(row.read_at),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    expired: Boolean(row.is_expired),
    data: row.notification_data || {},
  };
}

async function getPoliceAlertAccessRow(officerUserId, officerContext, alertId = null, db = pool) {
  const { roleTargets, adminAreaIds } = getOfficerAlertTargetFilters(officerContext);
  const values = [officerUserId, roleTargets, adminAreaIds];
  const alertFilterSql = alertId ? `AND operational_alert.id = $${values.push(alertId)}::uuid` : "";

  const result = await db.query(
    `
      WITH targeted_alerts AS (
        SELECT DISTINCT target.alert_id
        FROM app.operational_alert_targets target
        WHERE (
          target.target_type = 'officer'
          AND target.target_user_id = $1::uuid
        ) OR (
          target.target_type = 'role'
          AND LOWER(COALESCE(target.target_role, '')) = ANY($2::text[])
        ) OR (
          target.target_type = 'zone'
          AND target.admin_area_id = ANY($3::bigint[])
        )
        UNION
        SELECT DISTINCT n.operational_alert_id AS alert_id
        FROM app.notifications n
        WHERE n.user_id = $1::uuid
          AND n.operational_alert_id IS NOT NULL
      )
      SELECT
        operational_alert.id AS alert_id,
        operational_alert.title,
        operational_alert.description,
        operational_alert.alert_type,
        operational_alert.severity,
        operational_alert.status,
        operational_alert.starts_at,
        operational_alert.ends_at,
        operational_alert.created_at,
        CASE
          WHEN operational_alert.ends_at IS NOT NULL AND operational_alert.ends_at < NOW() THEN TRUE
          ELSE FALSE
        END AS is_expired,
        notification.id AS notification_id,
        notification.read_at,
        notification.created_at AS notification_created_at,
        notification.title AS notification_title,
        notification.body AS notification_body,
        notification.data AS notification_data
      FROM app.operational_alerts operational_alert
      JOIN targeted_alerts targeted
        ON targeted.alert_id = operational_alert.id
      LEFT JOIN LATERAL (
        SELECT n.*
        FROM app.notifications n
        WHERE n.user_id = $1::uuid
          AND n.operational_alert_id = operational_alert.id
        ORDER BY n.created_at DESC NULLS LAST, n.id DESC
        LIMIT 1
      ) notification ON TRUE
      WHERE TRUE
      ${alertFilterSql}
      ORDER BY COALESCE(notification.created_at, operational_alert.created_at) DESC, operational_alert.id DESC
      LIMIT 1
    `,
    values,
  );

  return result.rows[0] || null;
}

async function listPoliceAlerts(
  officerUserId,
  { page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE } = {},
  db = pool,
) {
  const officerContext = await fetchOfficerContext(officerUserId, db);
  const { roleTargets, adminAreaIds } = getOfficerAlertTargetFilters(officerContext);
  const offset = (page - 1) * pageSize;
  const queryValues = [officerUserId, roleTargets, adminAreaIds, pageSize, offset];

  const alertsSql = `
    WITH targeted_alerts AS (
      SELECT DISTINCT target.alert_id
      FROM app.operational_alert_targets target
      WHERE (
        target.target_type = 'officer'
        AND target.target_user_id = $1::uuid
      ) OR (
        target.target_type = 'role'
        AND LOWER(COALESCE(target.target_role, '')) = ANY($2::text[])
      ) OR (
        target.target_type = 'zone'
        AND target.admin_area_id = ANY($3::bigint[])
      )
      UNION
      SELECT DISTINCT n.operational_alert_id AS alert_id
      FROM app.notifications n
      WHERE n.user_id = $1::uuid
        AND n.operational_alert_id IS NOT NULL
    ),
    alert_rows AS (
      SELECT
        operational_alert.id AS alert_id,
        operational_alert.title,
        operational_alert.description,
        operational_alert.alert_type,
        operational_alert.severity,
        operational_alert.status,
        operational_alert.starts_at,
        operational_alert.ends_at,
        operational_alert.created_at,
        CASE
          WHEN operational_alert.ends_at IS NOT NULL AND operational_alert.ends_at < NOW() THEN TRUE
          ELSE FALSE
        END AS is_expired,
        notification.id AS notification_id,
        notification.read_at,
        notification.created_at AS notification_created_at,
        notification.title AS notification_title,
        notification.body AS notification_body,
        notification.data AS notification_data
      FROM app.operational_alerts operational_alert
      JOIN targeted_alerts targeted
        ON targeted.alert_id = operational_alert.id
      LEFT JOIN LATERAL (
        SELECT n.*
        FROM app.notifications n
        WHERE n.user_id = $1::uuid
          AND n.operational_alert_id = operational_alert.id
        ORDER BY n.created_at DESC NULLS LAST, n.id DESC
        LIMIT 1
      ) notification ON TRUE
    )
    SELECT
      alert_rows.*,
      COUNT(*) OVER() AS total_count
    FROM alert_rows
    ORDER BY COALESCE(alert_rows.notification_created_at, alert_rows.created_at) DESC, alert_rows.alert_id DESC
    LIMIT $4::int
    OFFSET $5::int
  `;

  const unreadCountSql = `
    WITH targeted_alerts AS (
      SELECT DISTINCT target.alert_id
      FROM app.operational_alert_targets target
      WHERE (
        target.target_type = 'officer'
        AND target.target_user_id = $1::uuid
      ) OR (
        target.target_type = 'role'
        AND LOWER(COALESCE(target.target_role, '')) = ANY($2::text[])
      ) OR (
        target.target_type = 'zone'
        AND target.admin_area_id = ANY($3::bigint[])
      )
      UNION
      SELECT DISTINCT n.operational_alert_id AS alert_id
      FROM app.notifications n
      WHERE n.user_id = $1::uuid
        AND n.operational_alert_id IS NOT NULL
    )
    SELECT COUNT(*)::int AS unread_count
    FROM app.operational_alerts operational_alert
    JOIN targeted_alerts targeted
      ON targeted.alert_id = operational_alert.id
    LEFT JOIN LATERAL (
      SELECT n.read_at
      FROM app.notifications n
      WHERE n.user_id = $1::uuid
        AND n.operational_alert_id = operational_alert.id
      ORDER BY n.created_at DESC NULLS LAST, n.id DESC
      LIMIT 1
    ) notification ON TRUE
    WHERE notification.read_at IS NULL
  `;

  const [result, unreadCountResult] = await Promise.all([
    db.query(alertsSql, queryValues),
    db.query(unreadCountSql, [officerUserId, roleTargets, adminAreaIds]),
  ]);

  const items = result.rows.map(mapPoliceAlertRow);
  const total = Number(result.rows[0]?.total_count || 0);

  return {
    items,
    unreadCount: Number(unreadCountResult.rows[0]?.unread_count || 0),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      returned: items.length,
    },
  };
}

async function markPoliceAlertAsRead(officerUserId, alertId, db = pool) {
  const normalizedAlertId = normalizeUuid(alertId, "alertId", { required: true });
  const officerContext = await fetchOfficerContext(officerUserId, db);
  const alertRow = await getPoliceAlertAccessRow(
    officerUserId,
    officerContext,
    normalizedAlertId,
    db,
  );

  if (!alertRow) {
    throw createError(404, "Alert was not found");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    let notificationId = alertRow.notification_id || null;

    if (!notificationId) {
      const insertedNotifications = await insertNotificationsForUsers(client, [
        {
          userId: officerUserId,
          reportId: null,
          operationalAlertId: normalizedAlertId,
          priority: notificationPriorityFromSeverity(alertRow.severity),
          eventType: "POLICE_SUPERVISOR_ALERT",
          title: alertRow.title || "Police alert",
          body: alertRow.description || "",
          data: {
            alertId: normalizedAlertId,
            alertType: alertRow.alert_type || "advisory",
            severity: alertRow.severity || "medium",
            source: "police",
          },
        },
      ]);

      notificationId = insertedNotifications[0]?.id || null;
    }

    const notification = notificationId
      ? await markNotificationAsRead(officerUserId, notificationId, client)
      : null;

    if (!alertRow.read_at) {
      await recordOperationHistory(client, {
        officerUserId,
        alertId: normalizedAlertId,
        actionType: "mark_alert_read",
        note: `Acknowledged alert: ${alertRow.title || "Police alert"}`,
        metadata: {
          notificationId,
          expired: Boolean(alertRow.is_expired),
        },
      });
    }

    await client.query("COMMIT");

    return {
      alert: mapPoliceAlertRow({
        ...alertRow,
        notification_id: notification?.id || notificationId,
        read_at: notification?.readAt || alertRow.read_at || new Date(),
      }),
      notification,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function listPoliceOperationHistory(officerUserId, query = {}, db = pool) {
  const { page, pageSize } = normalizePageParams(query);
  const actionType = query.actionType ? String(query.actionType).trim().toLowerCase() : null;
  const reportId = query.reportId ? normalizeUuid(query.reportId, "reportId") : null;

  if (actionType && !HISTORY_ACTION_VALUES.has(actionType)) {
    throw createError(400, "actionType is invalid");
  }

  const { items, total } = await getOperationHistoryRows(
    {
      officerUserId,
      reportId,
      page,
      pageSize,
      actionType,
      includeInternal: false,
    },
    db,
  );

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
      returned: items.length,
    },
  };
}

async function addManualPoliceHistoryEntry(officerUserId, payload = {}, db = pool) {
  const note = normalizeRequiredManualHistoryNote(payload.note);
  const metadata = normalizeJsonObject(payload.metadata, "metadata");
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await ensurePoliceProfile(officerUserId, client);

    await recordOperationHistory(client, {
      officerUserId,
      actionType: "manual_log_entry",
      note,
      metadata,
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const { items } = await getOperationHistoryRows(
    {
      officerUserId,
      page: 1,
      pageSize: 1,
      actionType: "manual_log_entry",
    },
    db,
  );

  return {
    item: items[0] || null,
  };
}

async function assertSupervisorAccess(user, db = pool) {
  ensurePoliceUser(user);
  const context = await fetchOfficerContext(user.userId, db);

  if (!context.isSupervisor) {
    throw createError(403, "Supervisor access is required");
  }

  return context;
}

async function canSupervisorManageOfficer(supervisorUserId, officerUserId, db = pool) {
  const result = await db.query(
    `
      SELECT
        pp.user_id,
        pp.supervisor_user_id
      FROM app.police_profiles pp
      WHERE pp.user_id = $1::uuid
      LIMIT 1
    `,
    [officerUserId],
  );

  const row = result.rows[0] || null;
  return Boolean(row && row.supervisor_user_id === supervisorUserId);
}

async function listSupervisorOfficers(supervisorUser, query = {}, db = pool) {
  const supervisorContext = await assertSupervisorAccess(supervisorUser, db);
  const isAdmin = supervisorContext.officer.roles.some((role) => normalizeRoleName(role) === "admin");
  const search = query.search ? String(query.search).trim().toLowerCase() : null;
  const wilayaId = query.wilayaId ? normalizeInteger(query.wilayaId, "wilayaId") : null;
  const communeId = query.communeId ? normalizeInteger(query.communeId, "communeId") : null;
  const onDuty = query.onDuty == null ? null : String(query.onDuty).trim().toLowerCase() === "true";

  const values = [];
  const whereClauses = [
    `
      EXISTS (
        SELECT 1
        FROM auth.user_roles officer_roles
        JOIN auth.roles officer_role_names
          ON officer_role_names.id = officer_roles.role_id
        WHERE officer_roles.user_id = u.id
          AND LOWER(officer_role_names.name) = 'police'
      )
    `,
  ];

  if (!isAdmin) {
    values.push(supervisorUser.userId);
    whereClauses.push(`pp.supervisor_user_id = $${values.length}::uuid`);
  }

  if (onDuty != null) {
    values.push(onDuty);
    whereClauses.push(`pp.is_on_duty = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    whereClauses.push(`
      (
        LOWER(CONCAT_WS(' ', u.first_name, u.last_name)) LIKE $${values.length}::text
        OR LOWER(COALESCE(u.email, '')) LIKE $${values.length}::text
        OR LOWER(COALESCE(pp.badge_number, '')) LIKE $${values.length}::text
      )
    `);
  }

  if (wilayaId) {
    values.push(wilayaId);
    whereClauses.push(`
      (
        active_wilaya.id = $${values.length}::bigint
        OR (active_commune.parent_id IS NOT NULL AND active_commune.parent_id = $${values.length}::bigint)
      )
    `);
  }

  if (communeId) {
    values.push(communeId);
    whereClauses.push(`active_commune.id = $${values.length}::bigint`);
  }

  const result = await db.query(
    `
      SELECT
        u.id,
        CONCAT_WS(' ', u.first_name, u.last_name) AS full_name,
        u.email,
        u.phone,
        u.avatar_url,
        pp.badge_number,
        pp.rank,
        pp.is_on_duty,
        active_wilaya.id AS active_wilaya_id,
        active_wilaya.name AS active_wilaya_name,
        active_commune.id AS active_commune_id,
        active_commune.name AS active_commune_name,
        latest_location.captured_at,
        latest_location.accuracy_m,
        ST_Y(latest_location.location::geometry) AS lat,
        ST_X(latest_location.location::geometry) AS lng
      FROM app.police_profiles pp
      JOIN auth.users u
        ON u.id = pp.user_id
      LEFT JOIN app.police_work_zone_assignments active_wilaya_assignment
        ON active_wilaya_assignment.officer_user_id = u.id
       AND active_wilaya_assignment.zone_level = 'wilaya'
       AND active_wilaya_assignment.is_active = TRUE
      LEFT JOIN gis.admin_areas active_wilaya
        ON active_wilaya.id = active_wilaya_assignment.admin_area_id
      LEFT JOIN app.police_work_zone_assignments active_commune_assignment
        ON active_commune_assignment.officer_user_id = u.id
       AND active_commune_assignment.zone_level = 'commune'
       AND active_commune_assignment.is_active = TRUE
      LEFT JOIN gis.admin_areas active_commune
        ON active_commune.id = active_commune_assignment.admin_area_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM app.officer_location_updates location_updates
        WHERE location_updates.officer_user_id = u.id
        ORDER BY location_updates.captured_at DESC, location_updates.id DESC
        LIMIT 1
      ) latest_location ON TRUE
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY pp.is_on_duty DESC, full_name ASC, u.id ASC
    `,
    values,
  );

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      name: row.full_name || row.email || "Officer",
      email: row.email,
      phone: row.phone || null,
      avatarUrl: row.avatar_url || "",
      badgeNumber: row.badge_number || null,
      rank: row.rank || null,
      isOnDuty: Boolean(row.is_on_duty),
      workZone: {
        wilaya: mapLocationSummary(
          row.active_wilaya_id,
          row.active_wilaya_name,
          row.active_wilaya_id ? "wilaya" : null,
        ),
        commune: mapLocationSummary(
          row.active_commune_id,
          row.active_commune_name,
          row.active_commune_id ? "commune" : null,
        ),
      },
      latestLocation:
        row.lat == null || row.lng == null
          ? null
          : {
              lat: Number(row.lat),
              lng: Number(row.lng),
              accuracyM: row.accuracy_m == null ? null : Number(row.accuracy_m),
              capturedAt: row.captured_at ? new Date(row.captured_at).toISOString() : null,
            },
    })),
  };
}

async function resolveAlertRecipients(
  { targetType, targetUserId = null, targetRole = null, adminAreaId = null },
  supervisorUser,
  db = pool,
) {
  const supervisorContext = await assertSupervisorAccess(supervisorUser, db);
  const isAdmin = supervisorContext.officer.roles.some((role) => normalizeRoleName(role) === "admin");

  if (targetType === "officer") {
    const normalizedTargetUserId = normalizeUuid(targetUserId, "targetUserId", { required: true });
    if (!isAdmin && !(await canSupervisorManageOfficer(supervisorUser.userId, normalizedTargetUserId, db))) {
      throw createError(403, "You cannot target this officer");
    }

    return [normalizedTargetUserId];
  }

  const values = [];
  const whereClauses = [
    `
      EXISTS (
        SELECT 1
        FROM auth.user_roles role_rows
        JOIN auth.roles role_names
          ON role_names.id = role_rows.role_id
        WHERE role_rows.user_id = pp.user_id
          AND LOWER(role_names.name) = LOWER($1::text)
      )
    `,
  ];

  values.push(
    targetType === "role"
      ? normalizeString(targetRole, "targetRole", { required: true, maxLength: 100 })
      : "police",
  );

  if (!isAdmin) {
    values.push(supervisorUser.userId);
    whereClauses.push(`pp.supervisor_user_id = $${values.length}::uuid`);
  }

  if (adminAreaId) {
    values.push(adminAreaId);
    whereClauses.push(`
      EXISTS (
        SELECT 1
        FROM app.police_work_zone_assignments zone_assignments
        JOIN gis.admin_areas assigned_areas
          ON assigned_areas.id = zone_assignments.admin_area_id
        WHERE zone_assignments.officer_user_id = pp.user_id
          AND zone_assignments.is_active = TRUE
          AND (
            zone_assignments.admin_area_id = $${values.length}::bigint
            OR assigned_areas.parent_id = $${values.length}::bigint
          )
        )
    `);
  }

  const result = await db.query(
    `
      SELECT pp.user_id
      FROM app.police_profiles pp
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY pp.user_id ASC
    `,
    values,
  );

  return result.rows.map((row) => row.user_id);
}

async function createSupervisorAlert(supervisorUser, payload = {}, db = pool) {
  await assertSupervisorAccess(supervisorUser, db);

  const title = normalizeString(payload.title, "title", { required: true, maxLength: 200 });
  const description = normalizeString(payload.description, "description", {
    required: true,
    maxLength: 2000,
  });
  const severity = normalizeAlertSeverity(payload.severity, "severity", { required: true });
  const alertType = normalizeAlertType(payload.alertType, "alertType", { required: false });
  const targetType = normalizeTargetType(payload.targetType);
  const adminAreaId = normalizeInteger(payload.adminAreaId, "adminAreaId", { required: true });
  const startsAt =
    normalizeDateTime(payload.startsAt, "startsAt", { required: false }) || new Date();
  const endsAt = normalizeDateTime(payload.endsAt, "endsAt", { required: true });
  const metadata = normalizeJsonObject(payload.metadata);

  if (endsAt <= startsAt) {
    throw createError(400, "endsAt must be after startsAt");
  }

  const adminArea = await requireAdminArea(adminAreaId, null, db);
  const recipients = await resolveAlertRecipients(
    {
      targetType,
      targetUserId: payload.targetUserId || null,
      targetRole: payload.targetRole || null,
      adminAreaId,
    },
    supervisorUser,
    db,
  );

  if (recipients.length === 0) {
    throw createError(404, "No recipient officers matched the alert target");
  }

  const derivedStatus = startsAt > new Date() ? "scheduled" : "active";
  const client = await db.connect();
  let alertRow = null;
  let insertedNotifications = [];

  try {
    await client.query("BEGIN");

    const insertAlertResult = await client.query(
      `
        INSERT INTO app.operational_alerts (
          created_by,
          updated_by,
          source_type,
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
          metadata
        )
        VALUES (
          $1::uuid,
          $1::uuid,
          'manual',
          $2::text,
          $3::text,
          $4::text,
          $5::text,
          $6::text,
          $7,
          $8,
          NOW(),
          'admin_area',
          $9::bigint,
          $10::text,
          'users_in_zone',
          TRUE,
          FALSE,
          TRUE,
          FALSE,
          FALSE,
          $11::jsonb
        )
        RETURNING *
      `,
      [
        supervisorUser.userId,
        title,
        description,
        alertType,
        severity,
        derivedStatus,
        startsAt,
        endsAt,
        adminArea.id,
        adminArea.name,
        JSON.stringify({
          ...metadata,
          targetType,
          targetUserId: payload.targetUserId || null,
          targetRole: payload.targetRole || null,
          recipientCount: recipients.length,
        }),
      ],
    );

    alertRow = insertAlertResult.rows[0] || null;

    await client.query(
      `
        INSERT INTO app.operational_alert_targets (
          alert_id,
          target_type,
          target_user_id,
          target_role,
          admin_area_id,
          created_at
        )
        VALUES ($1::uuid, $2::text, $3::uuid, $4::text, $5::bigint, NOW())
      `,
      [
        alertRow.id,
        targetType,
        targetType === "officer"
          ? normalizeUuid(payload.targetUserId, "targetUserId", { required: true })
          : null,
        targetType === "role"
          ? normalizeString(payload.targetRole, "targetRole", { required: true, maxLength: 100 })
          : null,
        adminArea.id,
      ],
    );

    await recordOperationHistory(client, {
      officerUserId: supervisorUser.userId,
      alertId: alertRow.id,
      actionType: "field_note",
      note: `Supervisor alert created for ${recipients.length} officer(s)`,
      metadata: {
        title,
        targetType,
        recipientCount: recipients.length,
      },
    });

    insertedNotifications = await insertNotificationsForUsers(
      client,
      recipients.map((recipientUserId) => ({
        userId: recipientUserId,
        reportId: null,
        operationalAlertId: alertRow.id,
        priority: notificationPriorityFromSeverity(severity),
        eventType: "POLICE_SUPERVISOR_ALERT",
        title,
        body: description,
        data: {
          alertId: alertRow.id,
          alertType,
          severity,
          adminAreaId: adminArea.id,
          adminAreaName: adminArea.name,
          targetType,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
      })),
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await Promise.allSettled(
    insertedNotifications.map(async (notification) => {
      emitNotificationCreatedToUser(notification.userId, notification);
      await evaluateAndSendPushForNotification(notification, db);
    }),
  );

  return {
    alert: {
      id: alertRow.id,
      title: alertRow.title,
      description: alertRow.description,
      alertType: alertRow.alert_type,
      severity: alertRow.severity,
      status: alertRow.status,
      startsAt: alertRow.starts_at ? new Date(alertRow.starts_at).toISOString() : null,
      endsAt: alertRow.ends_at ? new Date(alertRow.ends_at).toISOString() : null,
      adminArea: {
        id: adminArea.id,
        name: adminArea.name,
        level: adminArea.level,
      },
      targetType,
      recipientCount: recipients.length,
    },
  };
}

async function assignIncidentBySupervisor(supervisorUser, reportId, payload = {}, db = pool) {
  const officerUserId = normalizeUuid(payload.officerUserId, "officerUserId", { required: true });
  const note = normalizeOptionalNote(payload.note);
  const priorityOverride = normalizeOptionalNumber(
    payload.priorityOverride,
    "priorityOverride",
    { min: 1, max: 4 },
  );
  const assignmentType = String(payload.assignmentType || "supervisor").trim().toLowerCase();

  if (!["supervisor", "manual"].includes(assignmentType)) {
    throw createError(400, "assignmentType is invalid");
  }

  const supervisorContext = await assertSupervisorAccess(supervisorUser, db);
  const isAdmin = supervisorContext.officer.roles.some((role) => normalizeRoleName(role) === "admin");

  if (!isAdmin && !(await canSupervisorManageOfficer(supervisorUser.userId, officerUserId, db))) {
    throw createError(403, "You cannot assign incidents to this officer");
  }

  const client = await db.connect();
  let officerNotifications = [];

  try {
    await client.query("BEGIN");
    const currentRow = await requireIncidentRow(reportId, client);

    await client.query(
      `
        UPDATE app.incident_assignments
        SET
          status = 'closed',
          closed_at = COALESCE(closed_at, NOW())
        WHERE report_id = $1::uuid
          AND status = 'active'
      `,
      [reportId],
    );

    await client.query(
      `
        INSERT INTO app.incident_assignments (
          report_id,
          officer_user_id,
          assigned_by,
          assignment_type,
          status,
          priority_override,
          note,
          assigned_at
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, 'active', $5, $6, NOW())
      `,
      [reportId, officerUserId, supervisorUser.userId, assignmentType, priorityOverride, note],
    );

    await client.query(
      `
        UPDATE app.accident_reports
        SET
          assigned_officer_id = $2::uuid,
          status = CASE WHEN status = 'pending' THEN 'under_review' ELSE status END,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [reportId, officerUserId],
    );

    await recordOperationHistory(client, {
      officerUserId: supervisorUser.userId,
      reportId,
      actionType: "assign_officer",
      fromStatus: currentRow.status,
      toStatus: currentRow.status === "pending" ? "under_review" : currentRow.status,
      note,
      metadata: {
        assignedOfficerId: officerUserId,
        priorityOverride,
      },
    });

    officerNotifications = await insertNotificationsForUsers(client, [
      {
        userId: officerUserId,
        reportId,
        operationalAlertId: null,
        priority: 1,
        eventType: "POLICE_INCIDENT_ASSIGNED",
        title: "Incident assigned",
        body: `A supervisor assigned ${currentRow.title || buildDisplayIncidentId(reportId)} to you.`,
        data: {
          reportId,
          assignedBy: supervisorUser.userId,
          action: "assign_incident",
        },
      },
    ]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await Promise.allSettled(
    officerNotifications.map(async (notification) => {
      emitNotificationCreatedToUser(notification.userId, notification);
      await evaluateAndSendPushForNotification(notification, db);
    }),
  );

  return getIncidentById(officerUserId, reportId, db);
}

module.exports = {
  addManualPoliceHistoryEntry,
  assignIncidentBySupervisor,
  assignSelfToIncident,
  createSupervisorAlert,
  getIncidentById,
  getPoliceDashboard,
  getPoliceMe,
  getPoliceWorkZoneOptions,
  listPoliceAlerts,
  listPoliceIncidents,
  listPoliceOperationHistory,
  listSupervisorOfficers,
  markPoliceAlertAsRead,
  rejectIncident,
  requestIncidentBackup,
  updateIncidentStatus,
  updatePoliceLocation,
  updatePoliceWorkZone,
  verifyIncident,
  addIncidentFieldNote,
  normalizeIncidentListParams,
}; 