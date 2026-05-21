const router = require("express").Router();
const createError = require("http-errors");
const multer = require("multer");

const pool = require("../db");
const { deleteCloudinaryAsset, uploadBufferToCloudinary } = require("../services/reportMediaStorage");
const {
  createNotificationsForReport,
  fetchReportNotificationDiagnostics,
} = require("../services/reportNotificationService");
const {
  notifyNearbyUsersForReport,
  notifyPoliceWorkZoneIncident,
} = require("../services/notificationOrchestrator");
const {
  refreshReportSpamAnalysis,
  queueReportSpamAnalysis,
  reclassifyStuckReports,
} = require("../services/reportSpamDetectionService");
const { suggestReportFields } = require("../services/reportSuggestionsService");
const {
  getThreadByReportId,
  linkReportsAsThread,
} = require("../services/incidentThreadsService");
const {
  hasRole: tokenHasRole,
  resolveOptionalAuthenticatedUser,
  verifyToken,
  verifyTokenAndAdmin,
  requireUnbanned,
} = require("./verifytoken");

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
const ALLOWED_STATUSES = new Set(["pending", "under_review", "verified", "dispatched", "rejected", "resolved"]);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_FEED_TYPES = new Set(["latest", "nearby", "verified", "following"]);
const ALLOWED_SORT_TYPES = new Set(["recent", "severity"]);
const ALLOWED_REACTION_TYPES = new Set(["like", "saw_it_too"]);
const REACTION_COUNT_COLUMNS = Object.freeze({
  like: "likes_count",
  saw_it_too: "saw_it_too_count",
});
const MAX_COMMENT_BODY_LENGTH = 500;
const COMMENTS_PREVIEW_LIMIT = 3;
const DEFAULT_COMMENTS_PAGE_LIMIT = 20;
const MAX_COMMENTS_PAGE_LIMIT = 100;
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
});
const NOTIFICATION_DEBUG_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.NOTIFICATION_DEBUG === "true";
const API_PUBLIC_ORIGIN = String(process.env.API_PUBLIC_ORIGIN || process.env.SERVER_PUBLIC_ORIGIN || "")
  .trim()
  .replace(/\/+$/, "");

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
    ar.ml_status,
    ar.latest_predicted_label,
    ar.latest_spam_score,
    ar.latest_ml_confidence,
    ar.latest_model_version,
    ar.latest_classified_at,
    ar.review_verdict,
    ar.info_requested_at,
    ar.info_requested_by,
    ar.info_request_message,
    ar.info_response,
    ar.info_responded_at,
    ar.assigned_officer_id,
    ar.verified_by_officer_id,
    ar.verified_at,
    ar.resolved_by_officer_id,
    ar.resolved_at,
    ar.source_channel,
    ar.reported_by_role_snapshot,
    coalesce(ar.comments_count, 0) as comments_count,
    coalesce(ar.likes_count, 0) as likes_count,
    coalesce(ar.saw_it_too_count, 0) as saw_it_too_count,
    ar.last_commented_at,
    ar.incident_location,
    ST_Y(ar.incident_location::geometry) as lat,
    ST_X(ar.incident_location::geometry) as lng,
    concat_ws(' ', u.first_name, u.last_name) as reporter_name,
    u.first_name as reporter_first_name,
    u.last_name as reporter_last_name,
    u.avatar_url as reporter_avatar_url,
    u.trust_score as reporter_trust_score,
    u.trust_last_updated_at as reporter_trust_updated_at,
    coalesce(
      (
        select array_agg(distinct r.name)
        from auth.user_roles ur
        left join auth.roles r on r.id = ur.role_id
        where ur.user_id = ar.reported_by
          and r.name is not null
      ),
      '{}'::varchar[]
    ) as reporter_roles
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

  const normalizedUrl = normalizeReportMediaUrl(row.url);

  return {
    id: row.id,
    mediaType: row.media_type,
    url: normalizedUrl,
    uploadedAt: row.uploaded_at,
  };
}

function tryParseJson(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[" && trimmed[0] !== '"')) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
}

function extractReportMediaUrlCandidate(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    const parsed = tryParseJson(trimmed);
    if (parsed != null) {
      return extractReportMediaUrlCandidate(parsed);
    }

    return trimmed;
  }

  if (typeof value === "object") {
    const candidate =
      value.url
      || value.secure_url
      || value.secureUrl
      || value.media_url
      || value.mediaUrl
      || value.path
      || "";

    return extractReportMediaUrlCandidate(candidate);
  }

  return "";
}

function normalizeReportMediaUrl(value) {
  const candidate = extractReportMediaUrlCandidate(value);
  if (!candidate) {
    return "";
  }

  if (/^https?:\/\//i.test(candidate) || /^data:/i.test(candidate) || /^blob:/i.test(candidate)) {
    return candidate;
  }

  if (candidate.startsWith("//")) {
    return `https:${candidate}`;
  }

  const normalizedPath = candidate.replace(/\\/g, "/");

  if (normalizedPath.startsWith("/uploads/")) {
    return API_PUBLIC_ORIGIN ? `${API_PUBLIC_ORIGIN}${normalizedPath}` : normalizedPath;
  }

  if (normalizedPath.startsWith("uploads/")) {
    return API_PUBLIC_ORIGIN ? `${API_PUBLIC_ORIGIN}/${normalizedPath}` : `/${normalizedPath}`;
  }

  return normalizedPath;
}

function normalizeMlPercent(value, digits = 2) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = parsed <= 1.2 ? parsed * 100 : parsed;
  const multiplier = 10 ** digits;
  return Math.round(normalized * multiplier) / multiplier;
}

function buildSpamAnalysis(row) {
  if (!row) {
    return null;
  }

  const reviewVerdict = String(row.review_verdict || "").trim() || null;
  const predictedLabel = String(row.latest_predicted_label || "").trim() || null;

  return {
    status: String(row.ml_status || "").trim() || null,
    predictedLabel,
    spamScore: normalizeMlPercent(row.latest_spam_score),
    confidence: normalizeMlPercent(row.latest_ml_confidence),
    modelVersion: String(row.latest_model_version || "").trim() || null,
    classifiedAt: row.latest_classified_at ? new Date(row.latest_classified_at).toISOString() : null,
    reviewVerdict,
    pendingReview: predictedLabel === "spam" && !reviewVerdict,
  };
}

function getReportQualityBadge(row) {
  if (!row) {
    return { code: "unverified", label: "Unverified", style: "neutral", icon: "help" };
  }

  if (row.verified_by_officer_id) {
    return {
      code: "officer_verified",
      label: "Verified by officer",
      style: "positive_strong",
      icon: "shield_check",
    };
  }

  const predictedLabel = String(row.latest_predicted_label || "").trim().toLowerCase();
  const spamScoreRaw = Number(row.latest_spam_score);
  // Stored as decimal 0..1; normalize legacy >1 values defensively without
  // multiplying twice.
  const spamScore = Number.isFinite(spamScoreRaw)
    ? spamScoreRaw > 1.2
      ? spamScoreRaw / 100
      : spamScoreRaw
    : null;
  const mlStatus = String(row.ml_status || "").trim().toLowerCase();

  if (predictedLabel === "real" && spamScore != null && spamScore < 0.35) {
    return {
      code: "ai_verified",
      label: "AI verified",
      style: "positive",
      icon: "check_circle",
    };
  }
  if (predictedLabel === "suspicious") {
    return {
      code: "needs_review",
      label: "Needs review",
      style: "warning",
      icon: "alert_triangle",
    };
  }
  if (predictedLabel === "spam" || (spamScore != null && spamScore >= 0.65)) {
    return {
      code: "probably_spam",
      label: "Probably spam",
      style: "danger",
      icon: "alert_octagon",
    };
  }
  if (predictedLabel === "out_of_context") {
    return {
      code: "out_of_context",
      label: "Out of SIARA context",
      style: "muted_warning",
      icon: "info",
    };
  }
  if (predictedLabel === "invalid_location") {
    return {
      code: "invalid_location",
      label: "Suspicious location",
      style: "warning",
      icon: "map_pin_alert",
    };
  }
  if (mlStatus === "pending" || mlStatus === "processing") {
    return {
      code: "checking",
      label: "Checking report",
      style: "neutral",
      icon: "loader",
    };
  }

  return { code: "unverified", label: "Unverified", style: "neutral", icon: "clock" };
}

function getReporterTrustTier(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) {
    return { code: "unknown", label: "Reporter trust unknown", style: "neutral" };
  }
  if (numeric >= 80) {
    return { code: "high", label: "High confidence reporter", style: "positive" };
  }
  if (numeric >= 60) {
    return { code: "trusted", label: "Trusted reporter", style: "positive_muted" };
  }
  if (numeric >= 40) {
    return { code: "normal", label: "New/normal reporter", style: "neutral" };
  }
  if (numeric >= 20) {
    return { code: "low", label: "Low confidence reporter", style: "warning" };
  }
  return { code: "very_low", label: "Very low confidence reporter", style: "danger" };
}

function mapReportRow(row, { social, viewerUserId = null } = {}) {
  if (!row) {
    return null;
  }

  const severityHint = Number(row.severity_hint);
  const socialState = social || {};

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
    spamAnalysis: buildSpamAnalysis(row),
    qualityBadge: getReportQualityBadge(row),
    sourceChannel: row.source_channel || null,
    reportedByRoleSnapshot: Array.isArray(row.reported_by_role_snapshot)
      ? row.reported_by_role_snapshot
      : [],
    assignedOfficerId: row.assigned_officer_id || null,
    verifiedByOfficerId: row.verified_by_officer_id || null,
    verifiedAt: row.verified_at || null,
    resolvedByOfficerId: row.resolved_by_officer_id || null,
    resolvedAt: row.resolved_at || null,
    commentsCount: Number(row.comments_count || 0),
    likesCount: Number(row.likes_count || 0),
    sawItTooCount: Number(row.saw_it_too_count || 0),
    lastCommentedAt: row.last_commented_at || null,
    viewerHasLiked: Boolean(socialState.viewerHasLiked),
    viewerSawItToo: Boolean(socialState.viewerSawItToo),
    commentsPreview: Array.isArray(socialState.commentsPreview) ? socialState.commentsPreview : [],
    // Only the reporter who owns the report can see the moderator dialogue.
    // The admin/police paths use their own DTOs (adminIncidentService) which
    // already include this data unconditionally for staff viewers.
    infoRequest:
      row.info_requested_at
      && viewerUserId
      && row.reported_by
      && String(row.reported_by) === String(viewerUserId)
        ? {
            pending: !row.info_responded_at,
            askedAt: new Date(row.info_requested_at).toISOString(),
            message: row.info_request_message || "",
            respondedAt: row.info_responded_at
              ? new Date(row.info_responded_at).toISOString()
              : null,
            response: row.info_response || "",
          }
        : null,
    reportedBy: row.reported_by
      ? (() => {
          const trustScoreRaw = Number(row.reporter_trust_score);
          const trustScore = Number.isFinite(trustScoreRaw) ? trustScoreRaw : null;
          return {
            id: row.reported_by,
            name:
              row.reporter_name ||
              [row.reporter_first_name, row.reporter_last_name].filter(Boolean).join(" ") ||
              null,
            avatar_url: row.reporter_avatar_url || "",
            avatarUrl: row.reporter_avatar_url || "",
            roles: Array.isArray(row.reporter_roles) ? row.reporter_roles : [],
            trustScore,
            trustLastUpdatedAt: row.reporter_trust_updated_at
              ? new Date(row.reporter_trust_updated_at).toISOString()
              : null,
            trustTier: getReporterTrustTier(trustScore),
          };
        })()
      : null,
  };
}

function mapCommentRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    reportId: row.report_id,
    body: row.body || "",
    isDeleted: Boolean(row.is_deleted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: row.user_id
      ? {
          id: row.user_id,
          name:
            [row.author_first_name, row.author_last_name].filter(Boolean).join(" ") || null,
          avatarUrl: row.author_avatar_url || "",
          avatar_url: row.author_avatar_url || "",
        }
      : null,
  };
}

async function fetchViewerReactionsMap(reportIds, viewerUserId, db = pool) {
  if (!viewerUserId || !Array.isArray(reportIds) || reportIds.length === 0) {
    return new Map();
  }

  const result = await db.query(
    `
      select report_id, reaction_type
      from app.report_reactions
      where user_id = $1
        and report_id = any($2::uuid[])
    `,
    [viewerUserId, reportIds],
  );

  const map = new Map();
  for (const reportId of reportIds) {
    map.set(reportId, { viewerHasLiked: false, viewerSawItToo: false });
  }
  for (const row of result.rows) {
    const entry = map.get(row.report_id) || { viewerHasLiked: false, viewerSawItToo: false };
    if (row.reaction_type === "like") entry.viewerHasLiked = true;
    if (row.reaction_type === "saw_it_too") entry.viewerSawItToo = true;
    map.set(row.report_id, entry);
  }
  return map;
}

async function fetchCommentsPreviewMap(reportIds, limit = COMMENTS_PREVIEW_LIMIT, db = pool) {
  if (!Array.isArray(reportIds) || reportIds.length === 0) {
    return new Map();
  }

  const safeLimit = Math.max(1, Math.min(10, Number(limit) || COMMENTS_PREVIEW_LIMIT));
  const result = await db.query(
    `
      select
        ranked.id,
        ranked.report_id,
        ranked.user_id,
        ranked.body,
        ranked.is_deleted,
        ranked.created_at,
        ranked.updated_at,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        u.avatar_url as author_avatar_url
      from (
        select
          rc.*,
          row_number() over (partition by rc.report_id order by rc.created_at desc) as rn
        from app.report_comments rc
        where rc.report_id = any($1::uuid[])
          and rc.is_deleted = false
      ) ranked
      left join auth.users u on u.id = ranked.user_id
      where ranked.rn <= $2
      order by ranked.report_id, ranked.created_at desc
    `,
    [reportIds, safeLimit],
  );

  const map = new Map();
  for (const reportId of reportIds) {
    map.set(reportId, []);
  }
  for (const row of result.rows) {
    const list = map.get(row.report_id) || [];
    list.push(mapCommentRow(row));
    map.set(row.report_id, list);
  }
  for (const [key, list] of map.entries()) {
    map.set(key, list.reverse());
  }
  return map;
}

async function buildSocialEnrichment(reportIds, viewerUserId, db = pool) {
  if (!Array.isArray(reportIds) || reportIds.length === 0) {
    return new Map();
  }

  const [viewerMap, previewMap] = await Promise.all([
    fetchViewerReactionsMap(reportIds, viewerUserId, db),
    fetchCommentsPreviewMap(reportIds, COMMENTS_PREVIEW_LIMIT, db),
  ]);

  const enrichment = new Map();
  for (const reportId of reportIds) {
    enrichment.set(reportId, {
      ...(viewerMap.get(reportId) || { viewerHasLiked: false, viewerSawItToo: false }),
      commentsPreview: previewMap.get(reportId) || [],
    });
  }
  return enrichment;
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

async function buildReportResponse(row, db = pool, { viewerUserId = null } = {}) {
  if (!row) {
    return null;
  }

  const enrichment = await buildSocialEnrichment([row.id], viewerUserId, db);
  const report = mapReportRow(row, { social: enrichment.get(row.id), viewerUserId });
  if (!report) {
    return null;
  }

  return {
    ...report,
    media: await fetchReportMedia(report.id, db),
  };
}

async function buildReportsResponse(rows, db = pool, { viewerUserId = null } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const reportIds = rows.map((row) => row.id);
  const [mediaMap, enrichment] = await Promise.all([
    fetchReportMediaMap(reportIds, db),
    buildSocialEnrichment(reportIds, viewerUserId, db),
  ]);

  return rows.map((row) => ({
    ...mapReportRow(row, { social: enrichment.get(row.id), viewerUserId }),
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

async function deleteRemoteMediaIfNeeded(mediaRows, { strict = true, context = "report_media_delete" } = {}) {
  for (const mediaRow of mediaRows) {
    if (!mediaRow.storage_key) {
      continue;
    }

    try {
      await deleteCloudinaryAsset(mediaRow.storage_key);
    } catch (error) {
      if (strict) {
        throw error;
      }

      console.error("Failed to delete media asset for report", {
        context,
        mediaId: mediaRow.id,
        reportId: mediaRow.report_id,
        storageKey: mediaRow.storage_key,
        message: error.message,
      });
    }
  }
}

async function listReports(query, db = pool, { viewerUserId = null } = {}) {
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
    // Hide both rejected (confirmed spam / false report) AND archived
    // (admin-soft-deleted) reports from every public-facing feed.
    whereClauses.push("base.status not in ('rejected', 'archived')");
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
  const reports = await buildReportsResponse(rows, db, { viewerUserId });

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

async function resolveViewerUserId(req) {
  try {
    const viewer = await resolveOptionalAuthenticatedUser(req);
    return viewer?.userId || viewer?.id || null;
  } catch (_error) {
    return null;
  }
}

router.get("/", async (req, res, next) => {
  try {
    const viewerUserId = await resolveViewerUserId(req);
    return res
      .status(200)
      .json(await listReports(req.query || {}, pool, { viewerUserId }));
  } catch (error) {
    return next(error);
  }
});

router.post("/suggestions", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = await suggestReportFields({
      title: typeof body.title === "string" ? body.title : "",
      description: typeof body.description === "string" ? body.description : "",
      lat: body.lat,
      lng: body.lng ?? body.lon,
      imageMetadata: body.imageMetadata || null,
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/threads", verifyToken, requireUnbanned, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = await linkReportsAsThread({
      primaryReportId: body.primaryReportId,
      relatedReportIds: Array.isArray(body.relatedReportIds)
        ? body.relatedReportIds
        : [],
      createdBy: req.user?.userId || req.user?.id || null,
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error?.status && Number.isInteger(error.status)) {
      return next(createError(error.status, error.message));
    }
    return next(error);
  }
});

router.get("/:id/thread", async (req, res, next) => {
  try {
    const result = await getThreadByReportId(req.params.id);
    return res.status(200).json(result || { thread: null, members: [] });
  } catch (error) {
    if (error?.status && Number.isInteger(error.status)) {
      return next(createError(error.status, error.message));
    }
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }

    const viewerUserId = await resolveViewerUserId(req);
    const row = await requireExistingReport(reportId);
    return res
      .status(200)
      .json({ report: await buildReportResponse(row, pool, { viewerUserId }) });
  } catch (error) {
    return next(error);
  }
});

router.post("/", verifyToken, requireUnbanned, async (req, res, next) => {
  let reportId = null;
  let client = null;

  try {
    const payload = normalizeCreatePayload(req.body || {});
    client = await pool.connect();
    await client.query("begin");

    const insertResult = await client.query(
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
          occurred_at,
          source_channel,
          reported_by_role_snapshot,
          ml_status
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
          $9::timestamptz,
          $10,
          $11::jsonb,
          'pending'
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
        "web",
        JSON.stringify(Array.isArray(req.user.roles) ? req.user.roles : []),
      ],
    );

    reportId = insertResult.rows[0]?.id;

    if (NOTIFICATION_DEBUG_ENABLED) {
      console.info("[reports] report_created", {
        reportId,
        reportedBy: req.user.userId,
        incidentType: payload.incidentType,
        severityHint: payload.severityHint,
        locationLabel: payload.locationLabel,
        occurredAt: payload.occurredAt,
      });
    }

    const notificationResult = await createNotificationsForReport(reportId, client);
    const notificationDiagnostics = await fetchReportNotificationDiagnostics(reportId, client);

    if (NOTIFICATION_DEBUG_ENABLED) {
      const totalNotificationCount = Number(notificationDiagnostics.notification_count || 0);
      const appInsertedNotificationCount = Number(notificationResult.notifications?.length || 0);
      console.info("[reports] notification_pipeline_status", {
        reportId,
        matchedRuleCount: Number(notificationDiagnostics.matched_rule_count || 0),
        notificationCount: totalNotificationCount,
        appInsertedNotificationCount,
        effectiveInsertedNotificationCount: totalNotificationCount,
        matchedCommuneId: notificationResult.matchedCommuneId,
        matchedWilayaId: notificationResult.matchedWilayaId,
        matchedAlertIds: notificationDiagnostics.matched_alert_ids || [],
        matchedRadiusAlertIds: notificationResult.matchedRadiusAlertIds || [],
        matchedAdminAreaAlertIds: notificationResult.matchedAdminAreaAlertIds || [],
        finalRecipientUserIds: notificationResult.recipientUserIds || [],
        mode:
          appInsertedNotificationCount > 0
            ? "application_pipeline"
            : totalNotificationCount > 0
              ? "database_trigger_present"
              : "no_matching_alerts",
      });
    }

    await client.query("commit");
    client.release();
    client = null;

    queueReportSpamAnalysis(reportId, "report_created");

    // Orchestrator-driven fan-out (post-commit so we never notify for rolled-back rows).
    // notifyNearbyUsersForReport only fires for incident_type=accident; gating lives in the service.
    Promise.allSettled([
      notifyNearbyUsersForReport(reportId).catch((error) => {
        console.warn("[notify-orchestrator] nearby_failed", { reportId, message: error.message });
      }),
      notifyPoliceWorkZoneIncident(reportId).catch((error) => {
        console.warn("[notify-orchestrator] work_zone_failed", { reportId, message: error.message });
      }),
    ]);

    const createdRow = await requireExistingReport(reportId);
    return res.status(201).json({
      report: await buildReportResponse(createdRow, pool, { viewerUserId: req.user.userId }),
    });
  } catch (error) {
    if (client) {
      await client.query("rollback").catch(() => {});
      client.release();
      client = null;
    }
    return next(error);
  }
});

router.post("/:id/media", verifyToken, requireUnbanned, async (req, res, next) => {
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
          mimeType: file.mimetype,
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
      const report = await buildReportResponse(updatedRow, client, { viewerUserId: req.user.userId });

      await client.query("commit");
      queueReportSpamAnalysis(reportId, "report_media_uploaded");
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

router.put("/:id", verifyToken, requireUnbanned, async (req, res, next) => {
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
    if (updates.title !== undefined || updates.description !== undefined) {
      queueReportSpamAnalysis(reportId, "report_text_updated");
    }
    return res.status(200).json({
      report: await buildReportResponse(updatedRow, pool, { viewerUserId: req.user.userId }),
    });
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
    queueReportSpamAnalysis(reportId, "report_media_deleted");

    const updatedRow = await requireExistingReport(reportId);
    return res.status(200).json({
      id: mediaId,
      message: "Report media deleted successfully",
      report: await buildReportResponse(updatedRow, pool, { viewerUserId: req.user.userId }),
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
    await deleteRemoteMediaIfNeeded(mediaRows, {
      strict: false,
      context: "report_delete",
    });

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

const MAX_INFO_RESPONSE_LENGTH = 2000;

router.post("/:id/info-response", verifyToken, requireUnbanned, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }

    const rawResponse = typeof req.body?.response === "string" ? req.body.response : "";
    const responseText = rawResponse.trim();
    if (!responseText) {
      throw createError(400, "Response cannot be empty");
    }
    if (responseText.length > MAX_INFO_RESPONSE_LENGTH) {
      throw createError(
        400,
        `Response must be at most ${MAX_INFO_RESPONSE_LENGTH} characters`,
      );
    }

    await client.query("begin");

    const existingRow = await requireExistingReport(reportId, client);

    // Only the reporter who owns the report may respond.
    if (!existingRow.reported_by || existingRow.reported_by !== req.user?.userId) {
      throw createError(403, "Only the reporter can answer this request");
    }

    if (!existingRow.info_requested_at) {
      throw createError(409, "No pending info request on this report");
    }
    if (existingRow.info_responded_at) {
      throw createError(409, "This info request has already been answered");
    }

    await client.query(
      `
        UPDATE app.accident_reports
        SET info_response = $2,
            info_responded_at = now(),
            updated_at = now()
        WHERE id = $1
      `,
      [reportId, responseText],
    );

    await client.query(
      `
        INSERT INTO app.report_review_actions (
          report_id,
          action,
          from_status,
          to_status,
          note,
          reviewed_by
        )
        VALUES ($1, 'info_response', $2, $2, $3, $4)
      `,
      [reportId, existingRow.status, responseText, req.user.userId],
    );

    await client.query("commit");

    const updatedRow = await requireExistingReport(reportId);
    return res.status(200).json({
      report: await buildReportResponse(updatedRow, pool, { viewerUserId: req.user.userId }),
    });
  } catch (error) {
    await client.query("rollback");
    return next(error);
  } finally {
    client.release();
  }
});

function normalizeCommentBody(value) {
  if (typeof value !== "string") {
    throw createError(400, "Comment body is required");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw createError(400, "Comment body cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_BODY_LENGTH) {
    throw createError(400, `Comment body must be at most ${MAX_COMMENT_BODY_LENGTH} characters`);
  }
  return trimmed;
}

function normalizeReactionType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!ALLOWED_REACTION_TYPES.has(normalized)) {
    throw createError(400, `reactionType must be one of: ${[...ALLOWED_REACTION_TYPES].join(", ")}`);
  }
  return normalized;
}

router.get("/:id/comments", async (req, res, next) => {
  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }
    await requireExistingReport(reportId);

    const limit = normalizeQueryInteger(req.query?.limit, "limit", {
      defaultValue: DEFAULT_COMMENTS_PAGE_LIMIT,
      min: 1,
      max: MAX_COMMENTS_PAGE_LIMIT,
    });
    const offset = normalizeQueryInteger(req.query?.offset, "offset", {
      defaultValue: 0,
      min: 0,
    });

    const result = await pool.query(
      `
        select
          rc.id,
          rc.report_id,
          rc.user_id,
          rc.body,
          rc.is_deleted,
          rc.created_at,
          rc.updated_at,
          u.first_name as author_first_name,
          u.last_name as author_last_name,
          u.avatar_url as author_avatar_url
        from app.report_comments rc
        left join auth.users u on u.id = rc.user_id
        where rc.report_id = $1 and rc.is_deleted = false
        order by rc.created_at desc
        limit $2 offset $3
      `,
      [reportId, limit + 1, offset],
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    return res.status(200).json({
      comments: rows.map(mapCommentRow),
      pagination: { limit, offset, hasMore, returned: rows.length },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/comments", verifyToken, requireUnbanned, async (req, res, next) => {
  let client = null;
  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }
    const body = normalizeCommentBody(req.body?.body);

    client = await pool.connect();
    await client.query("begin");

    const reportExists = await client.query(
      `select 1 from app.accident_reports where id = $1 limit 1`,
      [reportId],
    );
    if (reportExists.rows.length === 0) {
      await client.query("rollback");
      throw createError(404, "Report not found");
    }

    const inserted = await client.query(
      `
        insert into app.report_comments (report_id, user_id, body)
        values ($1, $2, $3)
        returning id, report_id, user_id, body, is_deleted, created_at, updated_at
      `,
      [reportId, req.user.userId, body],
    );

    await client.query(
      `
        update app.accident_reports
        set comments_count = coalesce(comments_count, 0) + 1,
            last_commented_at = now()
        where id = $1
      `,
      [reportId],
    );

    const authorRow = await client.query(
      `select first_name, last_name, avatar_url from auth.users where id = $1 limit 1`,
      [req.user.userId],
    );

    await client.query("commit");

    const commentRow = {
      ...inserted.rows[0],
      author_first_name: authorRow.rows[0]?.first_name || null,
      author_last_name: authorRow.rows[0]?.last_name || null,
      author_avatar_url: authorRow.rows[0]?.avatar_url || null,
    };

    return res.status(201).json({ comment: mapCommentRow(commentRow) });
  } catch (error) {
    if (client) {
      await client.query("rollback").catch(() => {});
    }
    return next(error);
  } finally {
    if (client) client.release();
  }
});

router.delete("/:id/comments/:commentId", verifyToken, async (req, res, next) => {
  let client = null;
  try {
    const reportId = String(req.params.id || "").trim();
    const commentId = String(req.params.commentId || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }
    if (!isValidUuid(commentId)) {
      throw createError(400, "Invalid comment id");
    }

    client = await pool.connect();
    await client.query("begin");

    const existing = await client.query(
      `
        select id, report_id, user_id, is_deleted
        from app.report_comments
        where id = $1 and report_id = $2
        limit 1
      `,
      [commentId, reportId],
    );

    const commentRow = existing.rows[0];
    if (!commentRow) {
      await client.query("rollback");
      throw createError(404, "Comment not found");
    }

    const isAdmin = tokenHasRole(req.user, "admin");
    const isOwner = commentRow.user_id === req.user.userId;
    if (!isAdmin && !isOwner) {
      await client.query("rollback");
      throw createError(403, "You are not allowed to delete this comment");
    }

    if (commentRow.is_deleted) {
      await client.query("commit");
      return res.status(200).json({ id: commentId, alreadyDeleted: true });
    }

    await client.query(
      `update app.report_comments set is_deleted = true, updated_at = now() where id = $1`,
      [commentId],
    );
    await client.query(
      `
        update app.accident_reports
        set comments_count = greatest(coalesce(comments_count, 0) - 1, 0)
        where id = $1
      `,
      [reportId],
    );
    await client.query("commit");

    return res.status(200).json({ id: commentId, message: "Comment deleted" });
  } catch (error) {
    if (client) {
      await client.query("rollback").catch(() => {});
    }
    return next(error);
  } finally {
    if (client) client.release();
  }
});

router.post("/:id/reactions", verifyToken, requireUnbanned, async (req, res, next) => {
  let client = null;
  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }
    const reactionType = normalizeReactionType(req.body?.reactionType);
    const counterColumn = REACTION_COUNT_COLUMNS[reactionType];

    client = await pool.connect();
    await client.query("begin");

    const reportExists = await client.query(
      `select 1 from app.accident_reports where id = $1 limit 1`,
      [reportId],
    );
    if (reportExists.rows.length === 0) {
      await client.query("rollback");
      throw createError(404, "Report not found");
    }

    const inserted = await client.query(
      `
        insert into app.report_reactions (report_id, user_id, reaction_type)
        values ($1, $2, $3)
        on conflict on constraint uq_report_reaction_once do nothing
        returning id
      `,
      [reportId, req.user.userId, reactionType],
    );

    let created = false;
    if (inserted.rows.length > 0) {
      created = true;
      await client.query(
        `
          update app.accident_reports
          set ${counterColumn} = coalesce(${counterColumn}, 0) + 1
          where id = $1
        `,
        [reportId],
      );
    }

    const counts = await client.query(
      `
        select likes_count, saw_it_too_count
        from app.accident_reports
        where id = $1
        limit 1
      `,
      [reportId],
    );
    await client.query("commit");

    return res.status(created ? 201 : 200).json({
      reportId,
      reactionType,
      created,
      active: true,
      likesCount: Number(counts.rows[0]?.likes_count || 0),
      sawItTooCount: Number(counts.rows[0]?.saw_it_too_count || 0),
    });
  } catch (error) {
    if (client) {
      await client.query("rollback").catch(() => {});
    }
    return next(error);
  } finally {
    if (client) client.release();
  }
});

router.delete("/:id/reactions/:reactionType", verifyToken, async (req, res, next) => {
  let client = null;
  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }
    const reactionType = normalizeReactionType(req.params.reactionType);
    const counterColumn = REACTION_COUNT_COLUMNS[reactionType];

    client = await pool.connect();
    await client.query("begin");

    const removed = await client.query(
      `
        delete from app.report_reactions
        where report_id = $1 and user_id = $2 and reaction_type = $3
        returning id
      `,
      [reportId, req.user.userId, reactionType],
    );

    if (removed.rows.length > 0) {
      await client.query(
        `
          update app.accident_reports
          set ${counterColumn} = greatest(coalesce(${counterColumn}, 0) - 1, 0)
          where id = $1
        `,
        [reportId],
      );
    }

    const counts = await client.query(
      `
        select likes_count, saw_it_too_count
        from app.accident_reports
        where id = $1
        limit 1
      `,
      [reportId],
    );
    await client.query("commit");

    return res.status(200).json({
      reportId,
      reactionType,
      removed: removed.rows.length > 0,
      active: false,
      likesCount: Number(counts.rows[0]?.likes_count || 0),
      sawItTooCount: Number(counts.rows[0]?.saw_it_too_count || 0),
    });
  } catch (error) {
    if (client) {
      await client.query("rollback").catch(() => {});
    }
    return next(error);
  } finally {
    if (client) client.release();
  }
});

router.post("/admin/reclassify-stuck", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const limit = Number(req.query?.limit) || Number(req.body?.limit) || 50;
    const result = await reclassifyStuckReports({ limit });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/classify", verifyToken, async (req, res, next) => {
  try {
    const reportId = String(req.params.id || "").trim();
    if (!isValidUuid(reportId)) {
      throw createError(400, "Invalid report id");
    }

    const existingRow = await requireExistingReport(reportId);
    ensureCanManageReport(existingRow, req.user);

    const outcome = await refreshReportSpamAnalysis(reportId);
    const updatedRow = await requireExistingReport(reportId);
    return res.status(200).json({
      classification: outcome,
      report: await buildReportResponse(updatedRow, pool, { viewerUserId: req.user.userId }),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
