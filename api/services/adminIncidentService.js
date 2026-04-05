const createError = require("http-errors");

const pool = require("../db");
const { refreshReporterTrustScore } = require("./reportSpamDetectionService");

const DASHBOARD_TIMEZONE = "Africa/Algiers";
const INCIDENT_FILTERS = Object.freeze({
  all: "all",
  pending: "pending",
  suspicious: "suspicious",
  "pending-review": "pending-review",
  "ai-flagged": "ai-flagged",
  community: "community",
  merged: "merged",
  archived: "archived",
});
const SORT_FIELDS = Object.freeze({
  id: "id",
  incidentType: "incidentType",
  location: "location",
  severity: "severity",
  spamScore: "spamScore",
  confidence: "confidence",
  reporterScore: "reporterScore",
  createdAt: "createdAt",
  classifiedAt: "classifiedAt",
  status: "status",
});
const SORT_DIRECTIONS = new Set(["asc", "desc"]);
const COMPLETED_ASSESSMENT_STATUS = "completed";
const RECOGNIZED_ASSESSMENT_STATUSES = new Set(["completed", "pending", "failed"]);
const OPEN_FLAG_STATUSES = new Set(["open", "pending"]);
const TERMINAL_FLAG_STATUSES = new Set(["resolved", "dismissed", "closed"]);
const ACTIONABLE_STATUSES = new Set(["pending", "flagged"]);
const MODERATION_ACTIONS = new Set([
  "verify",
  "reject",
  "archive",
  "merge",
  "flag",
  "request_info",
  "change_severity",
  "note",
]);

function normalizeIncidentFilter(filter) {
  const normalized = String(filter || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(INCIDENT_FILTERS, normalized)
    ? normalized
    : INCIDENT_FILTERS.all;
}

function normalizeSortField(sortField) {
  return Object.prototype.hasOwnProperty.call(SORT_FIELDS, sortField)
    ? sortField
    : SORT_FIELDS.confidence;
}

function normalizeSortDir(sortDir) {
  const normalized = String(sortDir || "").trim().toLowerCase();
  return SORT_DIRECTIONS.has(normalized) ? normalized : "desc";
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

function normalizeAssessmentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return RECOGNIZED_ASSESSMENT_STATUSES.has(normalized) ? normalized : null;
}

function normalizeConfidenceScore(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = parsed <= 1.2 ? parsed * 100 : parsed;
  return Math.round(normalized);
}

function normalizeMlPercent(value, digits = 2) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const multiplier = 10 ** digits;
  return Math.round(parsed * multiplier) / multiplier;
}

function hasPendingSpamReview(row) {
  return row?.latest_predicted_label === "spam" && !String(row?.review_verdict || "").trim();
}

function buildDisplayIncidentId(reportId) {
  const normalized = String(reportId || "").replace(/-/g, "").toUpperCase();
  return normalized ? `INC-${normalized.slice(0, 6)}` : "INC-UNKNOWN";
}

function formatAgo(value, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  const days = Math.floor(diffMs / dayMs);
  const hours = Math.floor((diffMs % dayMs) / hourMs);
  const minutes = Math.floor((diffMs % hourMs) / minuteMs);

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${Math.max(1, minutes)}m`;
}

function mapSeverityLabel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "low";
  }

  if (parsed >= 3) {
    return "high";
  }

  if (parsed === 2) {
    return "medium";
  }

  return "low";
}

function normalizeSeverityHint(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "critical" || normalized === "high") {
    return 3;
  }
  if (normalized === "medium") {
    return 2;
  }
  if (normalized === "low") {
    return 1;
  }

  throw createError(400, "severity must be one of: low, medium, high");
}

function normalizeOptionalNote(value) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw createError(400, "note must be text");
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > 2000) {
    throw createError(400, "note must be at most 2000 characters");
  }

  return normalized;
}

function normalizeModerationAction(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!MODERATION_ACTIONS.has(normalized)) {
    throw createError(400, "action is invalid");
  }

  return normalized;
}

function isFlagOpen(row) {
  const status = String(row?.status || "").trim().toLowerCase();

  if (row?.resolved_at) {
    return false;
  }

  if (!status) {
    return true;
  }

  if (OPEN_FLAG_STATUSES.has(status)) {
    return true;
  }

  return !TERMINAL_FLAG_STATUSES.has(status);
}

function confidenceSql(columnName) {
  return `
    CASE
      WHEN ${columnName} IS NULL THEN NULL
      WHEN ${columnName} <= 1.2 THEN ${columnName} * 100
      ELSE ${columnName}
    END
  `;
}

function buildIncidentFilterSql(filterKey) {
  switch (normalizeIncidentFilter(filterKey)) {
    case INCIDENT_FILTERS.pending:
      return `base.status = 'pending'`;
    case INCIDENT_FILTERS.suspicious:
      return `base.latest_predicted_label = 'spam'`;
    case INCIDENT_FILTERS["pending-review"]:
      return `base.latest_predicted_label = 'spam' AND coalesce(nullif(btrim(base.review_verdict), ''), '') = ''`;
    case INCIDENT_FILTERS.archived:
      return `base.status = 'archived'`;
    case INCIDENT_FILTERS.merged:
      return `(base.status = 'merged' OR base.merged_into_report_id IS NOT NULL)`;
    case INCIDENT_FILTERS.community:
      return `base.open_flag_count > 0`;
    case INCIDENT_FILTERS["ai-flagged"]:
      return `base.confidence_status = 'completed' AND base.ai_severity_value >= 3`;
    case INCIDENT_FILTERS.all:
    default:
      return `true`;
  }
}

function buildOrderBy(sortField, sortDir) {
  const direction = normalizeSortDir(sortDir).toUpperCase();
  const normalizedField = normalizeSortField(sortField);

  const orderByMap = {
    id: `base.display_id ${direction}, base.created_at DESC`,
    incidentType: `base.incident_type ${direction}, base.created_at DESC`,
    location: `base.location ${direction}, base.created_at DESC`,
    severity: `base.severity_value ${direction}, base.created_at DESC`,
    spamScore: `base.latest_spam_score ${direction} NULLS LAST, base.created_at DESC`,
    confidence: `base.sortable_confidence ${direction} NULLS LAST, base.created_at DESC`,
    reporterScore: `base.open_flag_count DESC, base.created_at DESC`,
    createdAt: `base.created_at ${direction}`,
    classifiedAt: `base.latest_classified_at ${direction} NULLS LAST, base.created_at DESC`,
    status: `base.status ${direction}, base.created_at DESC`,
  };

  return orderByMap[normalizedField] || orderByMap.confidence;
}

function buildIncidentBaseCte() {
  return `
    WITH base AS (
      SELECT
        ar.id AS report_id,
        concat('INC-', upper(substr(replace(ar.id::text, '-', ''), 1, 6))) AS display_id,
        ar.incident_type,
        ar.title,
        ar.status,
        ar.severity_hint,
        ar.created_at,
        ar.merged_into_report_id,
        ar.ml_status,
        ar.latest_predicted_label,
        ar.latest_spam_score,
        ar.latest_ml_confidence,
        ar.latest_model_version,
        ar.latest_classified_at,
        ar.review_verdict,
        COALESCE(NULLIF(BTRIM(ar.location_label), ''), 'Unknown location') AS location,
        latest_assessment.predicted_severity AS ai_severity_value,
        CASE
          WHEN lower(coalesce(latest_assessment.assessment_status, '')) IN ('completed', 'pending', 'failed')
            THEN lower(latest_assessment.assessment_status)
          ELSE NULL
        END AS confidence_status,
        CASE
          WHEN lower(coalesce(latest_assessment.assessment_status, '')) = 'completed'
            THEN ${confidenceSql("latest_assessment.confidence_score")}
          ELSE NULL
        END AS sortable_confidence,
        COALESCE(flag_counts.open_flag_count, 0)::int AS open_flag_count,
        concat_ws(' ', reporter.first_name, reporter.last_name) AS reporter_name,
        reporter.email AS reporter_email
      FROM app.accident_reports ar
      LEFT JOIN auth.users reporter
        ON reporter.id = ar.reported_by
      LEFT JOIN LATERAL (
        SELECT
          aia.predicted_severity,
          aia.confidence_score,
          aia.assessment_status,
          aia.assessed_at,
          aia.updated_at
        FROM app.report_ai_assessments aia
        WHERE aia.report_id = ar.id
        ORDER BY aia.assessed_at DESC, aia.updated_at DESC
        LIMIT 1
      ) latest_assessment ON true
      LEFT JOIN LATERAL (
        SELECT
          count(*)::int AS open_flag_count
        FROM app.report_flags rf
        WHERE rf.report_id = ar.id
          AND rf.resolved_at IS NULL
          AND coalesce(lower(rf.status), 'open') NOT IN ('resolved', 'dismissed', 'closed')
      ) flag_counts ON true
    )
  `;
}

function mapIncidentRow(row, now = new Date()) {
  const confidenceStatus = normalizeAssessmentStatus(row.confidence_status);
  const hasCompletedAssessment = confidenceStatus === COMPLETED_ASSESSMENT_STATUS;
  const severityValue = hasCompletedAssessment && row.ai_severity_value != null
    ? row.ai_severity_value
    : row.severity_hint;

  return {
    reportId: row.report_id,
    displayId: row.display_id || buildDisplayIncidentId(row.report_id),
    incidentType: row.incident_type,
    title: row.title || "",
    location: row.location,
    severity: mapSeverityLabel(severityValue),
    severitySource: hasCompletedAssessment && row.ai_severity_value != null ? "ai" : "hint",
    confidence: hasCompletedAssessment ? normalizeConfidenceScore(row.sortable_confidence) : null,
    confidenceStatus,
    mlStatus: row.ml_status || null,
    predictedLabel: row.latest_predicted_label || null,
    spamScore: normalizeMlPercent(row.latest_spam_score),
    mlConfidence: normalizeMlPercent(row.latest_ml_confidence),
    modelVersion: row.latest_model_version || null,
    classifiedAt: row.latest_classified_at ? new Date(row.latest_classified_at).toISOString() : null,
    reviewVerdict: row.review_verdict || null,
    pendingSpamReview: hasPendingSpamReview(row),
    reporterScore: null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    ago: formatAgo(row.created_at, now),
    status: row.status,
    openFlagCount: Number(row.open_flag_count || 0),
    mergedIntoReportId: row.merged_into_report_id || null,
  };
}

async function fetchIncidentCounts(db = pool) {
  const result = await db.query(`
    ${buildIncidentBaseCte()}
    SELECT
      count(*)::int AS all_count,
      count(*) FILTER (WHERE base.status = 'pending')::int AS pending_count,
      count(*) FILTER (WHERE base.status = 'archived')::int AS archived_count,
      count(*) FILTER (
        WHERE base.status = 'merged'
          OR base.merged_into_report_id IS NOT NULL
      )::int AS merged_count,
      count(*) FILTER (WHERE base.open_flag_count > 0)::int AS community_count,
      count(*) FILTER (WHERE base.latest_predicted_label = 'spam')::int AS suspicious_count,
      count(*) FILTER (
        WHERE base.latest_predicted_label = 'spam'
          AND coalesce(nullif(btrim(base.review_verdict), ''), '') = ''
      )::int AS pending_review_count,
      count(*) FILTER (
        WHERE base.confidence_status = 'completed'
          AND base.ai_severity_value >= 3
      )::int AS ai_flagged_count,
      count(*) FILTER (WHERE base.confidence_status = 'completed')::int AS completed_ai_count
    FROM base
  `);

  const row = result.rows[0] || {};

  return {
    all: Number(row.all_count || 0),
    pending: Number(row.pending_count || 0),
    suspicious: Number(row.suspicious_count || 0),
    "pending-review": Number(row.pending_review_count || 0),
    "ai-flagged": Number(row.ai_flagged_count || 0),
    community: Number(row.community_count || 0),
    merged: Number(row.merged_count || 0),
    archived: Number(row.archived_count || 0),
    completedAiReports: Number(row.completed_ai_count || 0),
  };
}

async function listAdminIncidents(
  {
    filter = INCIDENT_FILTERS.all,
    search = "",
    sortField = SORT_FIELDS.confidence,
    sortDir = "desc",
    limit = 250,
    offset = 0,
  } = {},
  db = pool,
) {
  const normalizedFilter = normalizeIncidentFilter(filter);
  const normalizedSortField = normalizeSortField(sortField);
  const normalizedSortDir = normalizeSortDir(sortDir);
  const values = [];
  const whereClauses = [buildIncidentFilterSql(normalizedFilter)];
  const trimmedSearch = String(search || "").trim().toLowerCase();

  if (trimmedSearch) {
    values.push(`%${trimmedSearch}%`);
    whereClauses.push(`
      (
        lower(base.display_id) LIKE $${values.length}
        OR lower(base.report_id::text) LIKE $${values.length}
        OR lower(base.title) LIKE $${values.length}
        OR lower(base.location) LIKE $${values.length}
        OR lower(coalesce(base.reporter_name, '')) LIKE $${values.length}
        OR lower(coalesce(base.reporter_email, '')) LIKE $${values.length}
      )
    `);
  }

  values.push(limit, offset);

  const [counts, rowsResult] = await Promise.all([
    fetchIncidentCounts(db),
    db.query(
      `
        ${buildIncidentBaseCte()}
        SELECT
          base.report_id,
          base.display_id,
          base.incident_type,
          base.title,
          base.location,
          base.status,
          base.severity_hint,
          base.ml_status,
          base.latest_predicted_label,
          base.latest_spam_score,
          base.latest_ml_confidence,
          base.latest_model_version,
          base.latest_classified_at,
          base.review_verdict,
          base.ai_severity_value,
          base.confidence_status,
          base.sortable_confidence,
          base.open_flag_count,
          base.created_at,
          base.merged_into_report_id
        FROM base
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY ${buildOrderBy(normalizedSortField, normalizedSortDir)}
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values,
    ),
  ]);

  const now = new Date();
  const incidents = rowsResult.rows.map((row) => mapIncidentRow(row, now));

  return {
    incidents,
    counts,
    meta: {
      filter: normalizedFilter,
      search: trimmedSearch,
      sortField: normalizedSortField,
      sortDir: normalizedSortDir,
      returned: incidents.length,
      completedAiReports: counts.completedAiReports,
    },
  };
}

async function requireAdminIncidentRow(reportId, db = pool) {
  if (!isValidUuid(reportId)) {
    throw createError(400, "Invalid report id");
  }

  const result = await db.query(
    `
      SELECT
        ar.id AS report_id,
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
        ar.merged_into_report_id,
        ar.merged_at,
        ar.merged_by,
        ar.merge_reason,
        ar.ml_status,
        ar.latest_predicted_label,
        ar.latest_spam_score,
        ar.latest_ml_confidence,
        ar.latest_model_version,
        ar.latest_classified_at,
        ar.review_verdict,
        ar.reviewed_by,
        ar.reviewed_at,
        ar.review_notes,
        ST_Y(ar.incident_location::geometry) AS lat,
        ST_X(ar.incident_location::geometry) AS lng,
        concat_ws(' ', reporter.first_name, reporter.last_name) AS reporter_name,
        reporter.email AS reporter_email,
        reporter.created_at AS reporter_joined_at,
        (
          SELECT count(*)::int
          FROM app.accident_reports sibling
          WHERE sibling.reported_by = ar.reported_by
        ) AS reporter_report_count,
        latest_assessment.predicted_severity AS ai_severity_value,
        latest_assessment.model_version_id,
        latest_assessment.assessed_at,
        latest_assessment.updated_at AS assessment_updated_at,
        CASE
          WHEN lower(coalesce(latest_assessment.assessment_status, '')) IN ('completed', 'pending', 'failed')
            THEN lower(latest_assessment.assessment_status)
          ELSE NULL
        END AS confidence_status,
        CASE
          WHEN lower(coalesce(latest_assessment.assessment_status, '')) = 'completed'
            THEN ${confidenceSql("latest_assessment.confidence_score")}
          ELSE NULL
        END AS sortable_confidence
      FROM app.accident_reports ar
      LEFT JOIN auth.users reporter
        ON reporter.id = ar.reported_by
      LEFT JOIN LATERAL (
        SELECT
          aia.predicted_severity,
          aia.confidence_score,
          aia.assessment_status,
          aia.model_version_id,
          aia.assessed_at,
          aia.updated_at
        FROM app.report_ai_assessments aia
        WHERE aia.report_id = ar.id
        ORDER BY aia.assessed_at DESC, aia.updated_at DESC
        LIMIT 1
      ) latest_assessment ON true
      WHERE ar.id = $1
      LIMIT 1
    `,
    [reportId],
  );

  const row = result.rows[0] || null;
  if (!row) {
    throw createError(404, "Incident report not found");
  }

  return row;
}

async function fetchIncidentMedia(reportId, db = pool) {
  const result = await db.query(
    `
      SELECT
        rm.id,
        rm.media_type,
        rm.url,
        rm.uploaded_at
      FROM app.report_media rm
      WHERE rm.report_id = $1
      ORDER BY rm.uploaded_at ASC NULLS LAST, rm.id ASC
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

async function fetchIncidentNearbyReports(reportId, db = pool) {
  const result = await db.query(
    `
      SELECT
        nearby.id AS report_id,
        concat('INC-', upper(substr(replace(nearby.id::text, '-', ''), 1, 6))) AS display_id,
        COALESCE(NULLIF(BTRIM(nearby.location_label), ''), 'Unknown location') AS location,
        nearby.status,
        nearby.severity_hint,
        latest_assessment.predicted_severity AS ai_severity_value,
        CASE
          WHEN lower(coalesce(latest_assessment.assessment_status, '')) = 'completed'
            THEN true
          ELSE false
        END AS has_completed_assessment,
        round((ST_Distance(source.incident_location, nearby.incident_location) / 1000.0)::numeric, 1) AS distance_km
      FROM app.accident_reports source
      JOIN app.accident_reports nearby
        ON nearby.id <> source.id
       AND source.incident_location IS NOT NULL
       AND nearby.incident_location IS NOT NULL
       AND ST_DWithin(source.incident_location, nearby.incident_location, 5000)
      LEFT JOIN LATERAL (
        SELECT
          aia.predicted_severity,
          aia.assessment_status,
          aia.assessed_at,
          aia.updated_at
        FROM app.report_ai_assessments aia
        WHERE aia.report_id = nearby.id
        ORDER BY aia.assessed_at DESC, aia.updated_at DESC
        LIMIT 1
      ) latest_assessment ON true
      WHERE source.id = $1
      ORDER BY distance_km ASC NULLS LAST, nearby.created_at DESC
      LIMIT 5
    `,
    [reportId],
  );

  return result.rows.map((row) => ({
    reportId: row.report_id,
    displayId: row.display_id,
    location: row.location,
    status: row.status,
    severity: mapSeverityLabel(
      row.has_completed_assessment && row.ai_severity_value != null ? row.ai_severity_value : row.severity_hint,
    ),
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
  }));
}

async function fetchIncidentFlags(reportId, db = pool) {
  const result = await db.query(
    `
      SELECT
        rf.id,
        rf.reason,
        rf.comment,
        rf.status,
        rf.created_at,
        rf.resolved_at,
        concat_ws(' ', flagger.first_name, flagger.last_name) AS flagged_by_name
      FROM app.report_flags rf
      LEFT JOIN auth.users flagger
        ON flagger.id = rf.flagged_by
      WHERE rf.report_id = $1
      ORDER BY rf.created_at DESC, rf.id DESC
    `,
    [reportId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    comment: row.comment || "",
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    flaggedBy: row.flagged_by_name || null,
    open: isFlagOpen(row),
  }));
}

async function fetchIncidentReviewActions(reportId, db = pool) {
  const result = await db.query(
    `
      SELECT
        rra.id,
        rra.action,
        rra.from_status,
        rra.to_status,
        rra.note,
        rra.created_at,
        concat_ws(' ', reviewer.first_name, reviewer.last_name) AS reviewed_by_name
      FROM app.report_review_actions rra
      LEFT JOIN auth.users reviewer
        ON reviewer.id = rra.reviewed_by
      WHERE rra.report_id = $1
      ORDER BY rra.created_at DESC, rra.id DESC
    `,
    [reportId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    reviewedBy: row.reviewed_by_name || "Admin",
  }));
}

function buildTimelineEvent({ actor, action, note, toStatus, fromStatus }) {
  const actorText = actor || "Admin";

  switch (action) {
    case "verify":
      return `${actorText} verified the report`;
    case "reject":
      return `${actorText} rejected the report`;
    case "archive":
      return `${actorText} archived the report`;
    case "merge":
      return `${actorText} merged this report`;
    case "flag":
      return `${actorText} flagged this report for additional review`;
    case "request_info":
      return `${actorText} requested more information`;
    case "change_severity":
      return note ? `${actorText} updated the severity (${note})` : `${actorText} updated the severity`;
    case "note":
      return `${actorText} added an internal note`;
    default:
      if (toStatus && fromStatus && toStatus !== fromStatus) {
        return `${actorText} changed status from ${fromStatus} to ${toStatus}`;
      }
      return `${actorText} recorded ${action}`;
  }
}

function buildIncidentTimeline(report, flags, reviewActions) {
  const timeline = [];

  if (report.createdAt) {
    timeline.push({
      id: `created-${report.reportId}`,
      time: report.createdAt,
      event: "Report submitted",
    });
  }

  if (report.aiAssessment.status === "completed" && report.aiAssessment.assessedAt) {
    timeline.push({
      id: `assessment-${report.reportId}`,
      time: report.aiAssessment.assessedAt,
      event: `AI assessment completed (${report.aiAssessment.confidence}% confidence)`,
    });
  } else if (report.aiAssessment.status === "pending") {
    timeline.push({
      id: `assessment-pending-${report.reportId}`,
      time: report.createdAt,
      event: "AI assessment is pending",
    });
  } else if (report.aiAssessment.status === "failed" && report.aiAssessment.assessedAt) {
    timeline.push({
      id: `assessment-failed-${report.reportId}`,
      time: report.aiAssessment.assessedAt,
      event: "AI assessment failed",
    });
  }

  flags.forEach((flag) => {
    timeline.push({
      id: `flag-${flag.id}`,
      time: flag.createdAt,
      event: `Report flagged${flag.reason ? `: ${flag.reason}` : ""}`,
    });
  });

  reviewActions.forEach((reviewAction) => {
    timeline.push({
      id: reviewAction.id,
      time: reviewAction.createdAt,
      event: buildTimelineEvent({
        actor: reviewAction.reviewedBy,
        action: reviewAction.action,
        note: reviewAction.note,
        toStatus: reviewAction.toStatus,
        fromStatus: reviewAction.fromStatus,
      }),
    });
  });

  return timeline
    .filter((entry) => entry.time)
    .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime())
    .map((entry) => ({
      ...entry,
      timeLabel: new Date(entry.time).toLocaleTimeString("en", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));
}

async function getAdminIncidentDetail(reportId, db = pool) {
  const row = await requireAdminIncidentRow(reportId, db);
  const [media, nearbyReports, flags, reviewActions] = await Promise.all([
    fetchIncidentMedia(reportId, db),
    fetchIncidentNearbyReports(reportId, db),
    fetchIncidentFlags(reportId, db),
    fetchIncidentReviewActions(reportId, db),
  ]);

  const confidenceStatus = normalizeAssessmentStatus(row.confidence_status);
  const hasCompletedAssessment = confidenceStatus === COMPLETED_ASSESSMENT_STATUS;
  const severityValue = hasCompletedAssessment && row.ai_severity_value != null
    ? row.ai_severity_value
    : row.severity_hint;

  const incident = {
    reportId: row.report_id,
    displayId: buildDisplayIncidentId(row.report_id),
    incidentType: row.incident_type,
    title: row.title || "",
    description: row.description || "",
    location: row.location_label && String(row.location_label).trim()
      ? row.location_label.trim()
      : "Unknown location",
    coordinates: {
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
    },
    severity: mapSeverityLabel(severityValue),
    severitySource: hasCompletedAssessment && row.ai_severity_value != null ? "ai" : "hint",
    confidence: hasCompletedAssessment ? normalizeConfidenceScore(row.sortable_confidence) : null,
    confidenceStatus,
    mlStatus: row.ml_status || null,
    predictedLabel: row.latest_predicted_label || null,
    spamScore: normalizeMlPercent(row.latest_spam_score),
    mlConfidence: normalizeMlPercent(row.latest_ml_confidence),
    modelVersion: row.latest_model_version || null,
    classifiedAt: row.latest_classified_at ? new Date(row.latest_classified_at).toISOString() : null,
    reviewVerdict: row.review_verdict || null,
    pendingSpamReview: hasPendingSpamReview(row),
    reporterScore: null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
    ago: formatAgo(row.created_at),
    status: row.status,
    mergedIntoReportId: row.merged_into_report_id || null,
    mergedAt: row.merged_at ? new Date(row.merged_at).toISOString() : null,
    mergeReason: row.merge_reason || "",
    openFlagCount: flags.filter((flag) => flag.open).length,
    reporter: {
      id: row.reported_by || null,
      name: row.reporter_name || row.reporter_email || "Unknown reporter",
      email: row.reporter_email || null,
      totalReports: Number(row.reporter_report_count || 0),
      joinedAt: row.reporter_joined_at ? new Date(row.reporter_joined_at).toISOString() : null,
      reporterScore: null,
      accuracy: null,
    },
    aiAssessment: {
      status: confidenceStatus,
      confidence: hasCompletedAssessment ? normalizeConfidenceScore(row.sortable_confidence) : null,
      severity: hasCompletedAssessment && row.ai_severity_value != null
        ? mapSeverityLabel(row.ai_severity_value)
        : null,
      assessedAt: row.assessment_updated_at
        ? new Date(row.assessment_updated_at).toISOString()
        : row.assessed_at
          ? new Date(row.assessed_at).toISOString()
          : null,
      modelVersionId: row.model_version_id || null,
    },
    spamAnalysis: {
      status: row.ml_status || null,
      predictedLabel: row.latest_predicted_label || null,
      spamScore: normalizeMlPercent(row.latest_spam_score),
      confidence: normalizeMlPercent(row.latest_ml_confidence),
      modelVersion: row.latest_model_version || null,
      classifiedAt: row.latest_classified_at ? new Date(row.latest_classified_at).toISOString() : null,
      reviewVerdict: row.review_verdict || null,
      reviewedBy: row.reviewed_by || null,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      reviewNotes: row.review_notes || "",
      pendingReview: hasPendingSpamReview(row),
    },
    media,
    nearbyReports,
    flags,
    reviewActions,
  };

  incident.timeline = buildIncidentTimeline(incident, flags, reviewActions);
  incident.notes = reviewActions
    .filter((reviewAction) => reviewAction.note)
    .map((reviewAction) => ({
      id: reviewAction.id,
      author: reviewAction.reviewedBy,
      time: reviewAction.createdAt,
      text: reviewAction.note,
    }));

  return incident;
}

async function applyAdminIncidentAction(
  reportId,
  {
    action,
    note = null,
    severity = null,
    mergeTargetReportId = null,
  } = {},
  reviewerUserId,
  db = pool,
) {
  const normalizedAction = normalizeModerationAction(action);
  const normalizedNote = normalizeOptionalNote(note);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const currentRow = await requireAdminIncidentRow(reportId, client);
    const currentStatus = currentRow.status;
    const reporterUserId = currentRow.reported_by;
    let nextStatus = currentStatus;
    let nextReviewVerdict = currentRow.review_verdict || null;
    const updateClauses = [];
    const updateValues = [];

    if (normalizedAction === "verify") {
      nextStatus = "verified";
      nextReviewVerdict = "confirmed_legit";
      updateClauses.push(`status = $${updateValues.length + 1}`);
      updateValues.push(nextStatus);
    }

    if (normalizedAction === "reject") {
      nextStatus = "rejected";
      nextReviewVerdict = "confirmed_spam";
      updateClauses.push(`status = $${updateValues.length + 1}`);
      updateValues.push(nextStatus);
    }

    if (normalizedAction === "archive") {
      nextStatus = "archived";
      updateClauses.push(`status = $${updateValues.length + 1}`);
      updateValues.push(nextStatus);
    }

    if (normalizedAction === "flag") {
      nextStatus = "flagged";
      updateClauses.push(`status = $${updateValues.length + 1}`);
      updateValues.push(nextStatus);
    }

    if (normalizedAction === "change_severity") {
      updateClauses.push(`severity_hint = $${updateValues.length + 1}`);
      updateValues.push(normalizeSeverityHint(severity));
    }

    updateClauses.push(`review_verdict = $${updateValues.length + 1}`);
    updateValues.push(nextReviewVerdict);
    updateClauses.push(`reviewed_by = $${updateValues.length + 1}`);
    updateValues.push(reviewerUserId);
    updateClauses.push(`reviewed_at = now()`);
    if (normalizedNote !== null) {
      updateClauses.push(`review_notes = $${updateValues.length + 1}`);
      updateValues.push(normalizedNote);
    }

    if (normalizedAction === "merge") {
      const targetReportId = String(mergeTargetReportId || "").trim();
      if (!isValidUuid(targetReportId)) {
        throw createError(400, "mergeTargetReportId must be a valid report id");
      }
      if (targetReportId === reportId) {
        throw createError(400, "You cannot merge a report into itself");
      }

      await requireAdminIncidentRow(targetReportId, client);

      nextStatus = "merged";
      updateClauses.push(`status = $${updateValues.length + 1}`);
      updateValues.push(nextStatus);
      updateClauses.push(`merged_into_report_id = $${updateValues.length + 1}`);
      updateValues.push(targetReportId);
      updateClauses.push(`merged_at = now()`);
      updateClauses.push(`merged_by = $${updateValues.length + 1}`);
      updateValues.push(reviewerUserId);
      updateClauses.push(`merge_reason = $${updateValues.length + 1}`);
      updateValues.push(normalizedNote);
    }

    if (updateClauses.length > 0) {
      updateValues.push(reportId);

      await client.query(
        `
          UPDATE app.accident_reports
          SET
            ${updateClauses.join(", ")},
            updated_at = now()
          WHERE id = $${updateValues.length}
        `,
        updateValues,
      );
    }

    if (normalizedAction === "flag") {
      await client.query(
        `
          INSERT INTO app.report_flags (
            report_id,
            flagged_by,
            reason,
            comment,
            status
          )
          VALUES ($1, $2, 'admin_review', $3, 'open')
        `,
        [reportId, reviewerUserId, normalizedNote],
      );
    }

    if (["verify", "reject", "archive", "merge"].includes(normalizedAction)) {
      await client.query(
        `
          UPDATE app.report_flags
          SET
            status = 'resolved',
            resolved_at = coalesce(resolved_at, now()),
            resolved_by = coalesce(resolved_by, $2)
          WHERE report_id = $1
            AND resolved_at IS NULL
            AND coalesce(lower(status), 'open') NOT IN ('resolved', 'dismissed', 'closed')
        `,
        [reportId, reviewerUserId],
      );
    }

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
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [reportId, normalizedAction, currentStatus, nextStatus, normalizedNote, reviewerUserId],
    );

    await refreshReporterTrustScore(reporterUserId, client);

    const incident = await getAdminIncidentDetail(reportId, client);

    await client.query("COMMIT");
    return incident;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ACTIONABLE_STATUSES,
  applyAdminIncidentAction,
  buildDisplayIncidentId,
  formatAgo,
  getAdminIncidentDetail,
  listAdminIncidents,
  mapSeverityLabel,
  normalizeIncidentFilter,
  normalizeSortDir,
  normalizeSortField,
};
