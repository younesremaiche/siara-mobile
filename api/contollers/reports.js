const router = require("express").Router();
const createError = require("http-errors");
const multer = require("multer");

const pool = require("../db");
const { deleteCloudinaryAsset, uploadBufferToCloudinary } = require("../services/reportMediaStorage");
const { verifyToken } = require("./verifytoken");

const REPORT_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_INCIDENT_TYPES = new Set([
  "accident",
  "traffic",
  "danger",
  "weather",
  "roadworks",
  "other",
]);
const ALLOWED_STATUSES = new Set(["pending", "verified", "rejected", "resolved"]);
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FEED_TYPES = new Set(["latest", "nearby", "verified", "following"]);
const ALLOWED_SORT_TYPES = new Set(["recent", "severity"]);
const MAX_REPORT_MEDIA_FILES = 5;
const MAX_REPORT_MEDIA_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_REPORT_LIST_LIMIT = 10;
const MAX_REPORT_LIST_LIMIT = 100;
const DEFAULT_NEARBY_RADIUS_KM = 25;
const MAX_NEARBY_RADIUS_KM = 200;
const SEVERITY_TO_HINT = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
});
const HINT_TO_SEVERITY = Object.freeze({
  1: "low",
  2: "medium",
  3: "high",
  4: "critical",
});
const NOTIFICATION_DEBUG_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.NOTIFICATION_DEBUG === "true";

async function fetchReportNotificationDiagnostics(reportId, db = pool) {
  const result = await db.query(
    `
      select
        (
          select count(*)::int
          from app.alert_trigger_log atl
          where atl.report_id = $1
        ) as matched_rule_count,
        (
          select count(*)::int
          from app.notifications n
          where n.report_id = $1
        ) as notification_count,
        coalesce(
          (
            select json_agg(distinct atl.alert_id)
            from app.alert_trigger_log atl
            where atl.report_id = $1
          ),
          '[]'::json
        ) as matched_alert_ids
    `,
    [reportId],
  );

  return result.rows[0] || {
    matched_rule_count: 0,
    notification_count: 0,
    matched_alert_ids: [],
  };
}

const REPORT_SELECT_SQL = `
  select
    ar.id,
    ar.reported_by,
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
    ST_Y(ar.incident_location::geometry) as lat,
    ST_X(ar.incident_location::geometry) as lng,
    concat_ws(' ', u.first_name, u.last_name) as reporter_name,
    u.first_name as reporter_first_name,
    u.last_name as reporter_last_name
  from app.accident_reports ar
  left join auth.users u on u.id = ar.reported_by
`;

const REPORT_MEDIA_SELECT_SQL = `
  select
    rm.id,
    rm.report_id,
    rm.media_type,
    rm.url,
    rm.storage_key,
    rm.mime_type,
    rm.file_size,
    rm.uploaded_at
  from app.report_media rm
`;

const uploadReportImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_REPORT_MEDIA_FILES,
    fileSize: MAX_REPORT_MEDIA_FILE_SIZE_BYTES,
  },
  fileFilter(_req, file, callback) {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(createError(400, "Only JPEG, PNG, and WebP images are allowed"));
      return;
    }

    callback(null, true);
  },
});

function hasRole(user, roleName) {
  return Array.isArray(user?.roles) && user.roles.includes(roleName);
}

function isValidUuid(value) {
  return REPORT_ID_REGEX.test(String(value || "").trim());
}

function normalizeRequiredString(value, fieldName, { minLength = 1, maxLength = 255 } = {}) {
  if (typeof value !== "string") {
    throw createError(400, `${fieldName} is required`);
  }

  const normalized = value.trim();
  if (normalized.length < minLength) {
    throw createError(400, `${fieldName} must be at least ${minLength} characters`);
  }
  if (normalized.length > maxLength) {
    throw createError(400, `${fieldName} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function normalizeOptionalString(value, { maxLength = 1000 } = {}) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw createError(400, "Invalid text field");
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > maxLength) {
    throw createError(400, `Text field must be at most ${maxLength} characters`);
  }
  return normalized;
}

function normalizeIncidentType(value) {
  const incidentType = normalizeRequiredString(value, "incidentType", {
    minLength: 2,
    maxLength: 40,
  }).toLowerCase();

  if (!ALLOWED_INCIDENT_TYPES.has(incidentType)) {
    throw createError(400, "incidentType is invalid");
  }
  return incidentType;
}

function normalizeSeverity(value) {
  const severity = normalizeRequiredString(value, "severity", {
    minLength: 3,
    maxLength: 10,
  }).toLowerCase();

  if (!Object.prototype.hasOwnProperty.call(SEVERITY_TO_HINT, severity)) {
    throw createError(400, "severity must be one of: low, medium, high");
  }

  return {
    severity,
    severityHint: SEVERITY_TO_HINT[severity],
  };
}

function normalizeStatus(value) {
  const status = normalizeRequiredString(value, "status", {
    minLength: 3,
    maxLength: 20,
  }).toLowerCase();

  if (!ALLOWED_STATUSES.has(status)) {
    throw createError(400, "status is invalid");
  }
  return status;
}

function normalizeCoordinate(value, fieldName, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw createError(400, `${fieldName} must be a valid number`);
  }
  if (numeric < min || numeric > max) {
    throw createError(400, `${fieldName} is out of range`);
  }
  return numeric;
}

function normalizeOccurredAt(value) {
  if (value == null || value === "") {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, "occurredAt must be a valid datetime");
  }

  if (parsed.getTime() > Date.now() + 5 * 60 * 1000) {
    throw createError(400, "occurredAt cannot be in the future");
  }

  return parsed.toISOString();
}

function normalizeQueryInteger(value, fieldName, { defaultValue = 0, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === "") {
    return defaultValue;
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    throw createError(400, `${fieldName} must be an integer`);
  }
  if (numeric < min || numeric > max) {
    throw createError(400, `${fieldName} is out of range`);
  }

  return numeric;
}

function normalizeQueryNumber(
  value,
  fieldName,
  { defaultValue = null, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {},
) {
  if (value == null || value === "") {
    return defaultValue;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw createError(400, `${fieldName} must be a valid number`);
  }
  if (numeric < min || numeric > max) {
    throw createError(400, `${fieldName} is out of range`);
  }

  return numeric;
}

function normalizeFeed(value) {
  const normalized = String(value || "latest").trim().toLowerCase();
  if (!ALLOWED_FEED_TYPES.has(normalized)) {
    throw createError(400, "feed must be one of: latest, nearby, verified, following");
  }
  return normalized;
}

function normalizeSort(value) {
  const normalized = String(value || "recent").trim().toLowerCase();
  if (!ALLOWED_SORT_TYPES.has(normalized)) {
    throw createError(400, "sort must be one of: recent, severity");
  }
  return normalized;
}

function normalizeReportListQuery(query) {
  const feed = normalizeFeed(query?.feed);
  const sort = normalizeSort(query?.sort);
  const limit = normalizeQueryInteger(query?.limit, "limit", {
    defaultValue: DEFAULT_REPORT_LIST_LIMIT,
    min: 1,
    max: MAX_REPORT_LIST_LIMIT,
  });
  const offset = normalizeQueryInteger(query?.offset, "offset", {
    defaultValue: 0,
    min: 0,
  });

  const lat = normalizeQueryNumber(query?.lat, "lat", {
    defaultValue: null,
    min: -90,
    max: 90,
  });
  const lng = normalizeQueryNumber(query?.lng, "lng", {
    defaultValue: null,
    min: -180,
    max: 180,
  });
  const radiusKm = normalizeQueryNumber(query?.radiusKm, "radiusKm", {
    defaultValue: DEFAULT_NEARBY_RADIUS_KM,
    min: 0.1,
    max: MAX_NEARBY_RADIUS_KM,
  });

  if (feed === "nearby" && (lat == null || lng == null)) {
    throw createError(400, "lat and lng are required for the nearby feed");
  }

  return {
    feed,
    sort,
    limit,
    offset,
    lat,
    lng,
    radiusKm,
  };
}

function mapMediaRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    mediaType: row.media_type,
    url: row.url,
    uploadedAt: row.uploaded_at,
  };
}

function mapReportRow(row) {
  if (!row) {
    return null;
  }

  const severityHint = Number(row.severity_hint);

  return {
    id: row.id,
    incidentType: row.incident_type,
    title: row.title,
    description: row.description || "",
    status: row.status,
    severityHint,
    severity: HINT_TO_SEVERITY[severityHint] || null,
    locationLabel: row.location_label || "",
    location: {
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
    },
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    distanceKm:
      row.distance_meters == null ? null : Number((Number(row.distance_meters) / 1000).toFixed(2)),
    reportedBy: row.reported_by
      ? {
          id: row.reported_by,
          name:
            row.reporter_name ||
            [row.reporter_first_name, row.reporter_last_name].filter(Boolean).join(" ") ||
            null,
        }
      : null,
  };
}

async function fetchReportRowById(reportId, db = pool) {
  const result = await db.query(`${REPORT_SELECT_SQL} where ar.id = $1 limit 1`, [reportId]);
  return result.rows[0] || null;
}

async function fetchReportMediaRows(reportId, db = pool) {
  const result = await db.query(
    `${REPORT_MEDIA_SELECT_SQL} where rm.report_id = $1 order by rm.uploaded_at asc nulls last, rm.id asc`,
    [reportId],
  );
  return result.rows;
}

async function fetchReportMedia(reportId, db = pool) {
  const rows = await fetchReportMediaRows(reportId, db);
  return rows.map(mapMediaRow);
}

async function fetchReportMediaMap(reportIds, db = pool) {
  if (!Array.isArray(reportIds) || reportIds.length === 0) {
    return new Map();
  }

  const result = await db.query(
    `
      ${REPORT_MEDIA_SELECT_SQL}
      where rm.report_id = any($1::uuid[])
      order by rm.uploaded_at asc nulls last, rm.id asc
    `,
    [reportIds],
  );

  const mediaMap = new Map();
  for (const reportId of reportIds) {
    mediaMap.set(reportId, []);
  }

  for (const row of result.rows) {
    const existingMedia = mediaMap.get(row.report_id) || [];
    existingMedia.push(mapMediaRow(row));
    mediaMap.set(row.report_id, existingMedia);
  }

  return mediaMap;
}

async function buildReportResponse(row, db = pool) {
  const report = mapReportRow(row);
  if (!report) {
    return null;
  }

  return {
    ...report,
    media: await fetchReportMedia(report.id, db),
  };
}

async function buildReportsResponse(rows, db = pool) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const reportIds = rows.map((row) => row.id);
  const mediaMap = await fetchReportMediaMap(reportIds, db);

  return rows.map((row) => ({
    ...mapReportRow(row),
    media: mediaMap.get(row.id) || [],
  }));
}

async function requireExistingReport(reportId, db = pool) {
  const row = await fetchReportRowById(reportId, db);
  if (!row) {
    throw createError(404, "Report not found");
  }
  return row;
}

async function requireExistingReportMedia(reportId, mediaId, db = pool) {
  const result = await db.query(
    `${REPORT_MEDIA_SELECT_SQL} where rm.report_id = $1 and rm.id = $2 limit 1`,
    [reportId, mediaId],
  );

  if (!result.rows[0]) {
    throw createError(404, "Report media not found");
  }

  return result.rows[0];
}

function getLocationInput(body) {
  const nestedLocation =
    body?.location && typeof body.location === "object" && !Array.isArray(body.location)
      ? body.location
      : null;

  return {
    lat: nestedLocation?.lat ?? body?.lat,
    lng: nestedLocation?.lng ?? body?.lng,
    label: nestedLocation?.label ?? body?.locationLabel,
  };
}

function normalizeCreatePayload(body) {
  const { severity, severityHint } = normalizeSeverity(body?.severity);
  const locationInput = getLocationInput(body);

  return {
    incidentType: normalizeIncidentType(body?.incidentType),
    title: normalizeRequiredString(body?.title, "title", {
      minLength: 2,
      maxLength: 100,
    }),
    description: normalizeOptionalString(body?.description, { maxLength: 500 }),
    severity,
    severityHint,
    locationLabel: normalizeOptionalString(locationInput.label, { maxLength: 300 }),
    lat: normalizeCoordinate(locationInput.lat, "lat", -90, 90),
    lng: normalizeCoordinate(locationInput.lng, "lng", -180, 180),
    occurredAt: normalizeOccurredAt(body?.occurredAt),
  };
}

function normalizeUpdatePayload(body, { isAdmin }) {
  const updates = {};
  const recognizedKeys = new Set([
    "incidentType",
    "title",
    "description",
    "severity",
    "location",
    "locationLabel",
    "lat",
    "lng",
    "occurredAt",
    "status",
  ]);
  const hasRecognizedInput = Object.keys(body || {}).some((key) => recognizedKeys.has(key));

  if (!hasRecognizedInput) {
    throw createError(400, "No updatable fields were provided");
  }

  if (Object.prototype.hasOwnProperty.call(body, "incidentType")) {
    updates.incidentType = normalizeIncidentType(body.incidentType);
  }

  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    updates.title = normalizeRequiredString(body.title, "title", {
      minLength: 2,
      maxLength: 100,
    });
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    updates.description = normalizeOptionalString(body.description, { maxLength: 500 });
  }

  if (Object.prototype.hasOwnProperty.call(body, "severity")) {
    const severity = normalizeSeverity(body.severity);
    updates.severity = severity.severity;
    updates.severityHint = severity.severityHint;
  }

  const locationInput = getLocationInput(body);
  const locationLatProvided = locationInput.lat !== undefined;
  const locationLngProvided = locationInput.lng !== undefined;
  if (locationLatProvided || locationLngProvided) {
    if (!locationLatProvided || !locationLngProvided) {
      throw createError(400, "Both lat and lng are required when updating location");
    }

    updates.lat = normalizeCoordinate(locationInput.lat, "lat", -90, 90);
    updates.lng = normalizeCoordinate(locationInput.lng, "lng", -180, 180);
  }

  if (Object.prototype.hasOwnProperty.call(body, "locationLabel") || locationInput.label !== undefined) {
    updates.locationLabel = normalizeOptionalString(locationInput.label, { maxLength: 300 });
  }

  if (Object.prototype.hasOwnProperty.call(body, "occurredAt")) {
    updates.occurredAt = normalizeOccurredAt(body.occurredAt);
  }

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    if (!isAdmin) {
      throw createError(403, "Only admins can change report status");
    }
    updates.status = normalizeStatus(body.status);
  }

  if (Object.keys(updates).length === 0) {
    throw createError(400, "No valid updates were provided");
  }

  return updates;
}

function ensureCanManageReport(row, user) {
  const isAdmin = hasRole(user, "admin");
  const isOwner = row.reported_by && row.reported_by === user?.userId;

  if (!isOwner && !isAdmin) {
    throw createError(403, "You are not allowed to modify this report");
  }

  return { isAdmin, isOwner };
}

function runReportMediaUpload(req, res) {
  return new Promise((resolve, reject) => {
    uploadReportImages.array("images", MAX_REPORT_MEDIA_FILES)(req, res, (error) => {
      if (!error) {
        resolve(req.files || []);
        return;
      }

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          reject(createError(400, "Each image must be 5 MB or smaller"));
          return;
        }

        if (error.code === "LIMIT_FILE_COUNT") {
          reject(createError(400, "You can upload up to 5 images per request"));
          return;
        }

        if (error.code === "LIMIT_UNEXPECTED_FILE") {
          reject(createError(400, 'Image files must be sent in the "images" field'));
          return;
        }
      }

      reject(error);
    });
  });
}

async function cleanupUploadedAssets(uploadedAssets) {
  for (const uploadedAsset of uploadedAssets) {
    try {
      await deleteCloudinaryAsset(uploadedAsset.storageKey);
    } catch (error) {
      console.error("Failed to clean up uploaded report media asset", {
        message: error.message,
        storageKey: uploadedAsset.storageKey,
      });
    }
  }
}

async function deleteRemoteMediaIfNeeded(mediaRows) {
  for (const mediaRow of mediaRows) {
    if (!mediaRow.storage_key) {
      continue;
    }

    await deleteCloudinaryAsset(mediaRow.storage_key);
  }
}

async function listReports(query, db = pool) {
  const normalizedQuery = normalizeReportListQuery(query);

  if (normalizedQuery.feed === "following") {
    return {
      reports: [],
      pagination: {
        limit: normalizedQuery.limit,
        offset: normalizedQuery.offset,
        hasMore: false,
        returned: 0,
      },
      meta: {
        feed: normalizedQuery.feed,
        sort: normalizedQuery.sort,
        followingSupported: false,
      },
    };
  }

  const values = [];
  let parameterIndex = 1;
  const whereClauses = [];

  const userPointSql =
    normalizedQuery.feed === "nearby"
      ? `ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography`
      : null;

  const selectSql =
    normalizedQuery.feed === "nearby"
      ? `
        select
          base.*,
          ST_Distance(base.incident_location, ${userPointSql}) as distance_meters
        from (${REPORT_SELECT_SQL}) base
      `
      : `
        select
          base.*,
          null::double precision as distance_meters
        from (${REPORT_SELECT_SQL}) base
      `;

  if (normalizedQuery.feed === "nearby") {
    values.push(normalizedQuery.lng, normalizedQuery.lat);
    parameterIndex = 3;
    whereClauses.push(`ST_DWithin(base.incident_location, ${userPointSql}, $${parameterIndex++} * 1000)`);
    values.push(normalizedQuery.radiusKm);
  }

  if (normalizedQuery.feed === "verified") {
    whereClauses.push("base.status = 'verified'");
  } else {
    whereClauses.push("base.status <> 'rejected'");
  }

  const orderClauses = [];
  if (normalizedQuery.sort === "severity") {
    orderClauses.push("base.severity_hint desc nulls last");
  }
  orderClauses.push("coalesce(base.occurred_at, base.created_at) desc");
  orderClauses.push("base.created_at desc");
  if (normalizedQuery.feed === "nearby") {
    orderClauses.push("distance_meters asc");
  }

  values.push(normalizedQuery.limit + 1, normalizedQuery.offset);

  const result = await db.query(
    `
      ${selectSql}
      ${whereClauses.length ? `where ${whereClauses.join(" and ")}` : ""}
      order by ${orderClauses.join(", ")}
      limit $${parameterIndex++}
      offset $${parameterIndex}
    `,
    values,
  );

  const hasMore = result.rows.length > normalizedQuery.limit;
  const rows = hasMore ? result.rows.slice(0, normalizedQuery.limit) : result.rows;
  const reports = await buildReportsResponse(rows, db);

  return {
    reports,
    pagination: {
      limit: normalizedQuery.limit,
      offset: normalizedQuery.offset,
      hasMore,
      returned: reports.length,
    },
    meta: {
      feed: normalizedQuery.feed,
      sort: normalizedQuery.sort,
      followingSupported: true,
    },
  };
}

router.get("/", async (req, res, next) => {
  try {
    return res.status(200).json(await listReports(req.query || {}));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }

    const row = await requireExistingReport(reportId);
    return res.status(200).json({ report: await buildReportResponse(row) });
  } catch (error) {
    return next(error);
  }
});

router.post("/", verifyToken, async (req, res, next) => {
  try {
    const payload = normalizeCreatePayload(req.body || {});

    const insertResult = await pool.query(
      `
        insert into app.accident_reports (
          reported_by,
          incident_type,
          title,
          description,
          status,
          severity_hint,
          incident_location,
          location_label,
          occurred_at
        )
        values (
          $1,
          $2,
          $3,
          $4,
          'pending',
          $5,
          ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
          $8,
          $9::timestamptz
        )
        returning id
      `,
      [
        req.user.userId,
        payload.incidentType,
        payload.title,
        payload.description,
        payload.severityHint,
        payload.lng,
        payload.lat,
        payload.locationLabel,
        payload.occurredAt,
      ],
    );

    const reportId = insertResult.rows[0]?.id;
    if (NOTIFICATION_DEBUG_ENABLED) {
      const notificationDiagnostics = await fetchReportNotificationDiagnostics(reportId);

      console.info("[reports] created", {
        reportId,
        reportedBy: req.user.userId,
        incidentType: payload.incidentType,
        severityHint: payload.severityHint,
        locationLabel: payload.locationLabel,
        matchedRuleCount: Number(notificationDiagnostics.matched_rule_count || 0),
        notificationCount: Number(notificationDiagnostics.notification_count || 0),
        matchedAlertIds: notificationDiagnostics.matched_alert_ids || [],
      });
    }

    const createdRow = await requireExistingReport(reportId);
    return res.status(201).json({ report: await buildReportResponse(createdRow) });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/media", verifyToken, async (req, res, next) => {
  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }

    const existingRow = await requireExistingReport(reportId);
    ensureCanManageReport(existingRow, req.user);

    const files = await runReportMediaUpload(req, res);
    if (!files.length) {
      throw createError(400, "At least one image is required");
    }

    const uploadedAssets = [];

    try {
      for (const file of files) {
        const uploadedAsset = await uploadBufferToCloudinary(file.buffer, {
          reportId,
          originalFilename: file.originalname,
        });
        uploadedAssets.push(uploadedAsset);
      }
    } catch (error) {
      await cleanupUploadedAssets(uploadedAssets);
      throw error;
    }

    const client = await pool.connect();

    try {
      await client.query("begin");

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const uploadedAsset = uploadedAssets[index];

        await client.query(
          `
            insert into app.report_media (
              report_id,
              media_type,
              url,
              storage_key,
              mime_type,
              file_size,
              uploaded_at
            )
            values ($1, 'image', $2, $3, $4, $5, now())
          `,
          [reportId, uploadedAsset.secureUrl, uploadedAsset.storageKey, file.mimetype, file.size],
        );
      }

      const updatedRow = await requireExistingReport(reportId, client);
      const report = await buildReportResponse(updatedRow, client);

      await client.query("commit");
      return res.status(201).json({
        report,
        media: report.media,
      });
    } catch (error) {
      await client.query("rollback");
      await cleanupUploadedAssets(uploadedAssets);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", verifyToken, async (req, res, next) => {
  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }

    const existingRow = await requireExistingReport(reportId);
    const permission = ensureCanManageReport(existingRow, req.user);
    const updates = normalizeUpdatePayload(req.body || {}, permission);

    const setClauses = [];
    const values = [];
    let parameterIndex = 1;

    if (updates.incidentType !== undefined) {
      setClauses.push(`incident_type = $${parameterIndex++}`);
      values.push(updates.incidentType);
    }

    if (updates.title !== undefined) {
      setClauses.push(`title = $${parameterIndex++}`);
      values.push(updates.title);
    }

    if (updates.description !== undefined) {
      setClauses.push(`description = $${parameterIndex++}`);
      values.push(updates.description);
    }

    if (updates.severityHint !== undefined) {
      setClauses.push(`severity_hint = $${parameterIndex++}`);
      values.push(updates.severityHint);
    }

    if (updates.locationLabel !== undefined) {
      setClauses.push(`location_label = $${parameterIndex++}`);
      values.push(updates.locationLabel);
    }

    if (updates.lat !== undefined && updates.lng !== undefined) {
      setClauses.push(
        `incident_location = ST_SetSRID(ST_MakePoint($${parameterIndex}, $${parameterIndex + 1}), 4326)::geography`,
      );
      values.push(updates.lng, updates.lat);
      parameterIndex += 2;
    }

    if (updates.occurredAt !== undefined) {
      setClauses.push(`occurred_at = $${parameterIndex++}::timestamptz`);
      values.push(updates.occurredAt);
    }

    if (updates.status !== undefined) {
      setClauses.push(`status = $${parameterIndex++}`);
      values.push(updates.status);
    }

    setClauses.push("updated_at = now()");
    values.push(reportId);

    await pool.query(
      `
        update app.accident_reports
        set ${setClauses.join(", ")}
        where id = $${parameterIndex}
      `,
      values,
    );

    const updatedRow = await requireExistingReport(reportId);
    return res.status(200).json({ report: await buildReportResponse(updatedRow) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/media/:mediaId", verifyToken, async (req, res, next) => {
  try {
    const reportId = String(req.params.id || "").trim();
    const mediaId = String(req.params.mediaId || "").trim();

    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }
    if (!isValidUuid(mediaId)) {
      throw createError(400, "Invalid media id");
    }

    const existingRow = await requireExistingReport(reportId);
    ensureCanManageReport(existingRow, req.user);

    const mediaRow = await requireExistingReportMedia(reportId, mediaId);
    await deleteRemoteMediaIfNeeded([mediaRow]);
    await pool.query(`delete from app.report_media where id = $1 and report_id = $2`, [mediaId, reportId]);

    const updatedRow = await requireExistingReport(reportId);
    return res.status(200).json({
      id: mediaId,
      message: "Report media deleted successfully",
      report: await buildReportResponse(updatedRow),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", verifyToken, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }

    await client.query("begin");

    const existingRow = await requireExistingReport(reportId, client);
    ensureCanManageReport(existingRow, req.user);

    const mediaRows = await fetchReportMediaRows(reportId, client);
    await deleteRemoteMediaIfNeeded(mediaRows);

    await client.query(`delete from app.accident_reports where id = $1`, [reportId]);
    await client.query("commit");

    return res.status(200).json({ id: reportId, message: "Report deleted successfully" });
  } catch (error) {
    await client.query("rollback");
    return next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
