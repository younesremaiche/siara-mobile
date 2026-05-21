const path = require("path");

const axios = require("axios");

const pool = require("../db");

const DEFAULT_ML_SERVICE_BASE_URL = process.env.ML_SERVICE_BASE_URL || "http://localhost:8000";
const DEFAULT_REPORT_SPAM_MODEL_PATH =
  process.env.REPORT_SPAM_MODEL_PATH || path.join(__dirname, "..", "anomaly-detection", "best_fakeddit_model.pt");
const DEFAULT_REPORT_SPAM_MODEL_NAME = process.env.REPORT_SPAM_MODEL_NAME || "fakeddit-clip";
const DEFAULT_REPORT_SPAM_MODEL_VERSION =
  process.env.REPORT_SPAM_MODEL_VERSION || path.basename(DEFAULT_REPORT_SPAM_MODEL_PATH);
const DEFAULT_REPORT_SPAM_TIMEOUT_MS = Number(process.env.REPORT_SPAM_TIMEOUT_MS || 30000);
const DEFAULT_REPORT_SPAM_THRESHOLD = normalizePercent(process.env.REPORT_SPAM_THRESHOLD, 50);
const DEFAULT_REPORT_SPAM_THRESHOLD_UNIT = normalizeUnitScore(DEFAULT_REPORT_SPAM_THRESHOLD);
const ML_STATUS = Object.freeze({
  PENDING: "pending",
  WAITING_FOR_TEXT: "waiting_for_text",
  WAITING_FOR_IMAGE: "waiting_for_image",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
});
const DEV_LOGS_ENABLED = (process.env.NODE_ENV || "development") !== "production";
const VALID_PREDICTED_LABELS = new Set([
  "spam",
  "real",
  "out_of_context",
  "invalid_location",
  "suspicious",
]);
const PREDICTED_LABEL_ALIASES = Object.freeze({
  fake: "spam",
  fraudulent: "spam",
  legit: "real",
  genuine: "real",
  out_of_topic: "out_of_context",
  ooc: "out_of_context",
  bad_location: "invalid_location",
  invalid_location_data: "invalid_location",
});

function logReportSpam(event, details = {}) {
  console.info("[report-spam]", event, details);
}

function logReportMl(event, details = {}) {
  if (DEV_LOGS_ENABLED) {
    console.info("[report-ml]", event, details);
  }
}

function normalizePercent(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, normalized));
}

function normalizeUnitScore(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return Math.max(0, Math.min(1, normalized));
}

function pickFirstValue(source, keys) {
  for (const key of keys) {
    if (source?.[key] != null && source[key] !== "") {
      return source[key];
    }
  }

  return null;
}

function truncateText(value, maxLength = 500) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function buildReportText(row) {
  return [row?.title, row?.description]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function buildReportSnapshot(reportRow) {
  return {
    title: reportRow?.title || null,
    description: reportRow?.description || null,
    textPreview: truncateText(buildReportText(reportRow)),
    mediaId: reportRow?.media_id || null,
    imageUrl: reportRow?.image_url || null,
  };
}

function normalizePredictedLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const aliased = PREDICTED_LABEL_ALIASES[normalized] || normalized;
  return VALID_PREDICTED_LABELS.has(aliased) ? aliased : null;
}

function getWaitingStatus(text, imageUrl) {
  if (!text) {
    return ML_STATUS.WAITING_FOR_TEXT;
  }

  if (!imageUrl) {
    return ML_STATUS.WAITING_FOR_IMAGE;
  }

  return null;
}

function normalizeClassifierResult(classifierResult = {}) {
  const predicted_label = normalizePredictedLabel(
    pickFirstValue(classifierResult, [
      "predicted_label",
      "predictedLabel",
      "label",
      "prediction",
      "classification",
    ]),
  );
  const spam_score = normalizeUnitScore(
    pickFirstValue(classifierResult, [
      "spam_score",
      "spamScore",
      "spam_probability",
      "spamProbability",
      "spam_prob",
      "spamProb",
      "spam_score_pct",
      "spamScorePct",
    ]),
  );
  const derived_real_score = spam_score == null ? null : Math.max(0, Math.min(1, 1 - spam_score));
  const real_score = normalizeUnitScore(
    pickFirstValue(classifierResult, [
      "real_score",
      "realScore",
      "real_probability",
      "realProbability",
      "real_prob",
      "realProb",
    ]),
  ) ?? derived_real_score;
  const confidence_score = normalizeUnitScore(
    pickFirstValue(classifierResult, [
      "confidence_score",
      "confidenceScore",
      "confidence",
      "confidence_pct",
      "confidencePct",
    ]),
  );
  const threshold_used = normalizeUnitScore(
    pickFirstValue(classifierResult, [
      "threshold_used",
      "thresholdUsed",
      "threshold",
      "threshold_percent",
      "thresholdPercent",
    ]),
  ) ?? DEFAULT_REPORT_SPAM_THRESHOLD_UNIT;
  const model_name =
    pickFirstValue(classifierResult, ["model_name", "modelName"]) || DEFAULT_REPORT_SPAM_MODEL_NAME;
  const model_version =
    pickFirstValue(classifierResult, ["model_version", "modelVersion"]) || DEFAULT_REPORT_SPAM_MODEL_VERSION;

  return {
    predicted_label,
    spam_score,
    real_score,
    confidence_score,
    threshold_used,
    raw_response: classifierResult || {},
    model_name,
    model_version,
    isComplete: Boolean(predicted_label && spam_score != null),
  };
}

async function fetchReportSpamInputs(reportId, db = pool) {
  const result = await db.query(
    `
      select
        ar.id,
        ar.reported_by,
        ar.title,
        ar.description,
        ar.incident_type,
        ST_Y(ar.incident_location::geometry) as lat,
        ST_X(ar.incident_location::geometry) as lon,
        media.id as media_id,
        media.url as image_url
      from app.accident_reports ar
      left join lateral (
        select
          rm.id,
          rm.url
        from app.report_media rm
        where rm.report_id = ar.id
          and rm.media_type = 'image'
        order by rm.uploaded_at asc nulls last, rm.id asc
        limit 1
      ) media on true
      where ar.id = $1
      limit 1
    `,
    [reportId],
  );

  return result.rows[0] || null;
}

const NEAR_ROAD_STRICT_M = Number(process.env.REPORT_NEAR_ROAD_STRICT_M) || 100;
const NEAR_ROAD_RELAXED_M = Number(process.env.REPORT_NEAR_ROAD_RELAXED_M) || 250;

async function checkLocationAgainstRoadNetwork(lat, lon, db = pool) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  const coordsValid =
    Number.isFinite(latNum)
    && Number.isFinite(lonNum)
    && latNum >= -90
    && latNum <= 90
    && lonNum >= -180
    && lonNum <= 180;

  if (!coordsValid) {
    return { coordsValid: false, nearRoad: false, distanceMeters: null, segmentId: null };
  }

  try {
    const result = await db.query(
      `
        select
          id,
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) as distance_m
        from gis.road_segments
        where ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
        order by distance_m asc
        limit 1
      `,
      [lonNum, latNum, NEAR_ROAD_RELAXED_M],
    );

    if (result.rows.length === 0) {
      return {
        coordsValid: true,
        nearRoad: false,
        distanceMeters: null,
        segmentId: null,
      };
    }

    const row = result.rows[0];
    const distance = Number(row.distance_m);
    return {
      coordsValid: true,
      nearRoad: Number.isFinite(distance) && distance <= NEAR_ROAD_STRICT_M,
      distanceMeters: Number.isFinite(distance) ? distance : null,
      segmentId: row.id || null,
    };
  } catch (error) {
    logReportSpam("location_check_failed", {
      message: error?.message || "unknown_error",
      code: error?.code || null,
    });
    return { coordsValid, nearRoad: false, distanceMeters: null, segmentId: null };
  }
}

async function updateReportMlStatus(db, reportId, mlStatus) {
  await db.query(
    `
      update app.accident_reports
      set ml_status = $2
      where id = $1
    `,
    [reportId, mlStatus],
  );
}

async function updateReportMlSnapshot(db, reportId, prediction) {
  await db.query(
    `
      update app.accident_reports
      set
        ml_status = $2,
        latest_predicted_label = $3,
        latest_spam_score = $4,
        latest_ml_confidence = $5,
        latest_model_version = $6,
        latest_classified_at = $7
      where id = $1
    `,
    [
      reportId,
      ML_STATUS.COMPLETED,
      prediction.predicted_label,
      prediction.spam_score,
      prediction.confidence_score,
      prediction.model_version,
      new Date().toISOString(),
    ],
  );
}

async function insertReportMlPrediction(db, reportId, prediction) {
  if (!prediction?.isComplete) {
    logReportSpam("history_insert_skipped", {
      reportId,
      reason: "incomplete_prediction",
      predicted_label: prediction?.predicted_label || null,
      spam_score: prediction?.spam_score ?? null,
    });
    return false;
  }

  await db.query(
    `
      insert into app.report_ml_predictions (
        report_id,
        model_name,
        model_version,
        predicted_label,
        spam_score,
        real_score,
        confidence_score,
        threshold_used,
        inference_status,
        raw_response,
        created_at
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'completed',
        $9::jsonb,
        now()
      )
    `,
    [
      reportId,
      prediction.model_name,
      prediction.model_version,
      prediction.predicted_label,
      prediction.spam_score,
      prediction.real_score,
      prediction.confidence_score,
      prediction.threshold_used,
      JSON.stringify(prediction.raw_response || {}),
    ],
  );

  return true;
}

async function callSpamClassifier({ text, imageUrl }) {
  const response = await axios.post(
    `${DEFAULT_ML_SERVICE_BASE_URL.replace(/\/$/, "")}/report-spam/classify`,
    {
      text,
      image_url: imageUrl,
      model_path: DEFAULT_REPORT_SPAM_MODEL_PATH,
      model_name: DEFAULT_REPORT_SPAM_MODEL_NAME,
      model_version: DEFAULT_REPORT_SPAM_MODEL_VERSION,
      threshold_percent: DEFAULT_REPORT_SPAM_THRESHOLD,
    },
    {
      timeout: DEFAULT_REPORT_SPAM_TIMEOUT_MS,
    },
  );

  return response.data || {};
}

async function callReportValidator({
  title,
  description,
  incidentType,
  lat,
  lon,
  nearRoad,
  distanceMeters,
  hasImage,
  imageRelated,
}) {
  const response = await axios.post(
    `${DEFAULT_ML_SERVICE_BASE_URL.replace(/\/$/, "")}/report/validate`,
    {
      title: title || null,
      description: description || null,
      incident_type: incidentType || null,
      lat,
      lon,
      near_road: nearRoad,
      distance_to_road_m: distanceMeters,
      has_image: Boolean(hasImage),
      image_related: imageRelated == null ? null : Boolean(imageRelated),
    },
    {
      timeout: DEFAULT_REPORT_SPAM_TIMEOUT_MS,
    },
  );

  return response.data || {};
}

async function persistCompletedAnalysis(reportId, prediction) {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await updateReportMlSnapshot(client, reportId, prediction);
    await insertReportMlPrediction(client, reportId, prediction);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function persistFailedAnalysis(reportId, reportRow, error) {
  await updateReportMlStatus(pool, reportId, ML_STATUS.FAILED);

  logReportSpam("persist_failed_snapshot", {
    reportId,
    message: error?.response?.data?.error || error?.message || "spam_classification_failed",
    details: error?.response?.data?.details || null,
    reportSnapshot: buildReportSnapshot(reportRow),
  });
}

async function refreshReportSpamAnalysis(reportId) {
  logReportMl("classification started", { reportId });
  const reportRow = await fetchReportSpamInputs(reportId);
  if (!reportRow) {
    logReportSpam("skip_missing_report", { reportId });
    logReportMl("classification skipped - missing report", { reportId });
    return {
      reportId,
      mlStatus: null,
      skipped: true,
      reason: "missing_report",
    };
  }

  const text = buildReportText(reportRow);
  const imageUrl = reportRow.image_url || null;

  if (!text) {
    await updateReportMlStatus(pool, reportId, ML_STATUS.WAITING_FOR_TEXT);
    logReportMl("classification waiting for inputs", {
      reportId,
      mlStatus: ML_STATUS.WAITING_FOR_TEXT,
      hasText: false,
      hasImage: Boolean(imageUrl),
    });
    return {
      reportId,
      mlStatus: ML_STATUS.WAITING_FOR_TEXT,
      skipped: true,
      reason: ML_STATUS.WAITING_FOR_TEXT,
    };
  }

  await updateReportMlStatus(pool, reportId, ML_STATUS.PROCESSING);

  const locationCheck = await checkLocationAgainstRoadNetwork(
    reportRow.lat,
    reportRow.lon,
  );
  logReportMl("location check", {
    reportId,
    coordsValid: locationCheck.coordsValid,
    nearRoad: locationCheck.nearRoad,
    distanceMeters: locationCheck.distanceMeters,
  });

  logReportMl("sending payload", {
    reportId,
    title: reportRow.title,
    description: truncateText(reportRow.description, 120),
    incidentType: reportRow.incident_type,
    hasImage: Boolean(imageUrl),
    nearRoad: locationCheck.nearRoad,
    distanceMeters: locationCheck.distanceMeters,
  });

  try {
    const validatorResponse = await callReportValidator({
      title: reportRow.title,
      description: reportRow.description,
      incidentType: reportRow.incident_type,
      lat: reportRow.lat,
      lon: reportRow.lon,
      nearRoad: locationCheck.nearRoad,
      distanceMeters: locationCheck.distanceMeters,
      hasImage: Boolean(imageUrl),
      imageRelated: null,
    });
    const normalizedPrediction = normalizeClassifierResult(validatorResponse);

    logReportSpam("classifier_response", {
      reportId,
      classifier_response: validatorResponse,
    });
    logReportSpam("normalized_prediction", {
      reportId,
      normalized_prediction: normalizedPrediction,
    });
    logReportMl("model response", {
      reportId,
      predictedLabel: normalizedPrediction.predicted_label,
      spamScore: normalizedPrediction.spam_score,
      realScore: normalizedPrediction.real_score,
      confidence: normalizedPrediction.confidence_score,
      modelVersion: normalizedPrediction.model_version,
      reasons: validatorResponse?.reasons || [],
    });

    if (!normalizedPrediction.isComplete) {
      await updateReportMlStatus(pool, reportId, ML_STATUS.FAILED);
      logReportSpam("history_insert_skipped", {
        reportId,
        reason: "incomplete_prediction",
        normalized_prediction: normalizedPrediction,
      });
      return {
        reportId,
        mlStatus: ML_STATUS.FAILED,
        skipped: true,
        reason: "incomplete_prediction",
        result: classifierResponse,
      };
    }

    await persistCompletedAnalysis(reportId, normalizedPrediction);
    logReportSpam("completed", {
      reportId,
      predicted_label: normalizedPrediction.predicted_label,
      spam_score: normalizedPrediction.spam_score,
      confidence_score: normalizedPrediction.confidence_score,
    });
    logReportMl("classification saved", {
      reportId,
      mlStatus: ML_STATUS.COMPLETED,
    });
    if (reportRow?.reported_by) {
      try {
        await recalculateUserTrustScore(reportRow.reported_by, pool, {
          reason: "ml_classification_completed",
        });
      } catch (trustError) {
        console.error("[report-ml] trust_recalc_failed", {
          reportId,
          userId: reportRow.reported_by,
          message: trustError?.message,
        });
      }
    }
    return {
      reportId,
      mlStatus: ML_STATUS.COMPLETED,
      skipped: false,
      result: normalizedPrediction,
    };
  } catch (error) {
    await persistFailedAnalysis(reportId, reportRow, error);
    logReportSpam("failed", {
      reportId,
      message: error?.response?.data?.error || error?.message || "unknown_error",
    });
    logReportMl("classification failed", {
      reportId,
      error: error?.response?.data?.error || error?.message || "unknown_error",
    });
    return {
      reportId,
      mlStatus: ML_STATUS.FAILED,
      skipped: false,
      error: error?.response?.data || { message: error?.message || "unknown_error" },
    };
  }
}

function queueReportSpamAnalysis(reportId, context = "queued") {
  if (!reportId) {
    return;
  }

  logReportMl("queued classification", { reportId, context });
  setImmediate(() => {
    refreshReportSpamAnalysis(reportId).catch((error) => {
      console.error("[report-ml] classification failed", {
        reportId,
        context,
        message: error?.message || "unknown_error",
      });
    });
  });
}

async function reclassifyStuckReports({ limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));
  const result = await pool.query(
    `
      select id
      from app.accident_reports
      where ml_status in ('pending', 'failed', 'processing', 'waiting_for_text', 'waiting_for_image')
         or ml_status is null
         or latest_classified_at is null
      order by created_at desc
      limit $1
    `,
    [safeLimit],
  );

  const ids = result.rows.map((row) => row.id);
  logReportMl("reclassify stuck reports", { count: ids.length, limit: safeLimit });

  const outcomes = [];
  for (const reportId of ids) {
    try {
      const outcome = await refreshReportSpamAnalysis(reportId);
      outcomes.push({ reportId, mlStatus: outcome.mlStatus, skipped: Boolean(outcome.skipped) });
    } catch (error) {
      outcomes.push({
        reportId,
        mlStatus: ML_STATUS.FAILED,
        skipped: false,
        error: error?.message || "unknown_error",
      });
    }
  }

  return { processed: outcomes.length, outcomes };
}

const TRUST_SCORE_BASELINE = 50;
const TRUST_SCORE_MIN = 0;
const TRUST_SCORE_MAX = 100;
const TRUST_RECENT_REPORTS_LIMIT = Number(process.env.TRUST_RECENT_REPORTS_LIMIT) || 100;
const TRUST_AI_REAL_SPAM_THRESHOLD = 0.35;
const TRUST_AI_SPAM_THRESHOLD = 0.65;

const TRUST_DELTAS = Object.freeze({
  officer_verified: 3,
  ai_real: 1,
  resolved_legit: 2,
  suspicious: -2,
  spam: -4,
  out_of_context: -3,
  invalid_location: -3,
  officer_rejected: -6,
});

function classifyReportForTrust(report) {
  if (!report) return null;
  const reviewVerdict = String(report.review_verdict || "").trim().toLowerCase();
  if (reviewVerdict === "confirmed_legit" || report.verified_by_officer_id) {
    return "officer_verified";
  }
  if (reviewVerdict === "confirmed_spam" || reviewVerdict === "rejected") {
    return "officer_rejected";
  }

  const status = String(report.status || "").trim().toLowerCase();
  if (status === "resolved" && reviewVerdict !== "confirmed_spam") {
    return "resolved_legit";
  }

  const predictedLabel = String(report.latest_predicted_label || "").trim().toLowerCase();
  const spamScore = Number(report.latest_spam_score);
  const safeSpam = Number.isFinite(spamScore) ? spamScore : null;

  if (predictedLabel === "spam" || (safeSpam != null && safeSpam >= TRUST_AI_SPAM_THRESHOLD)) {
    return "spam";
  }
  if (predictedLabel === "out_of_context") return "out_of_context";
  if (predictedLabel === "invalid_location") return "invalid_location";
  if (predictedLabel === "suspicious") return "suspicious";
  if (
    predictedLabel === "real"
    && safeSpam != null
    && safeSpam < TRUST_AI_REAL_SPAM_THRESHOLD
  ) {
    return "ai_real";
  }
  return null;
}

async function recalculateUserTrustScore(userId, db = pool, options = {}) {
  if (!userId) {
    return null;
  }

  const reason = options.reason || "manual";
  const limit = Math.max(1, Math.min(500, Number(options.limit) || TRUST_RECENT_REPORTS_LIMIT));

  const previous = await db.query(
    `select trust_score from auth.users where id = $1 limit 1`,
    [userId],
  );
  if (previous.rowCount === 0) {
    logReportMl("trust score skipped - user not found", { userId, reason });
    return null;
  }

  const previousScore = Number(previous.rows[0]?.trust_score);

  const reportsResult = await db.query(
    `
      select
        id,
        status,
        review_verdict,
        latest_predicted_label,
        latest_spam_score,
        verified_by_officer_id,
        resolved_at
      from app.accident_reports
      where reported_by = $1
      order by created_at desc
      limit $2
    `,
    [userId, limit],
  );

  const counters = {
    total: reportsResult.rowCount,
    officer_verified: 0,
    officer_rejected: 0,
    ai_real: 0,
    resolved_legit: 0,
    suspicious: 0,
    spam: 0,
    out_of_context: 0,
    invalid_location: 0,
    unscored: 0,
  };

  let score = TRUST_SCORE_BASELINE;
  for (const row of reportsResult.rows) {
    const bucket = classifyReportForTrust(row);
    if (!bucket) {
      counters.unscored += 1;
      continue;
    }
    counters[bucket] += 1;
    score += TRUST_DELTAS[bucket] || 0;
  }

  score = Math.max(TRUST_SCORE_MIN, Math.min(TRUST_SCORE_MAX, score));
  const rounded = Math.round(score * 100) / 100;

  const updated = await db.query(
    `
      update auth.users
      set trust_score = $2, trust_last_updated_at = now()
      where id = $1
      returning id, trust_score, trust_last_updated_at
    `,
    [userId, rounded],
  );

  logReportMl("trust score recalculated", {
    userId,
    reason,
    oldTrustScore: Number.isFinite(previousScore) ? previousScore : null,
    newTrustScore: rounded,
    counters,
  });

  return updated.rows[0] || null;
}

// Backwards-compatible alias used by adminIncidentService.
async function refreshReporterTrustScore(userId, db = pool) {
  return recalculateUserTrustScore(userId, db, { reason: "officer_review" });
}

module.exports = {
  DEFAULT_REPORT_SPAM_MODEL_NAME,
  DEFAULT_REPORT_SPAM_MODEL_VERSION,
  ML_STATUS,
  TRUST_SCORE_BASELINE,
  TRUST_SCORE_MIN,
  TRUST_SCORE_MAX,
  TRUST_DELTAS,
  classifyReportForTrust,
  recalculateUserTrustScore,
  refreshReportSpamAnalysis,
  queueReportSpamAnalysis,
  reclassifyStuckReports,
  refreshReporterTrustScore,
};
