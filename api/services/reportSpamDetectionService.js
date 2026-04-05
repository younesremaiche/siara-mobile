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
  WAITING_FOR_TEXT: "waiting_for_text",
  WAITING_FOR_IMAGE: "waiting_for_image",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
});
const VALID_PREDICTED_LABELS = new Set(["spam", "real"]);
const PREDICTED_LABEL_ALIASES = Object.freeze({
  fake: "spam",
  fraudulent: "spam",
  legit: "real",
  genuine: "real",
});

function logReportSpam(event, details = {}) {
  console.info("[report-spam]", event, details);
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
  const reportRow = await fetchReportSpamInputs(reportId);
  if (!reportRow) {
    logReportSpam("skip_missing_report", { reportId });
    return {
      reportId,
      mlStatus: null,
      skipped: true,
      reason: "missing_report",
    };
  }

  const text = buildReportText(reportRow);
  const imageUrl = reportRow.image_url || null;
  const waitingStatus = getWaitingStatus(text, imageUrl);

  if (waitingStatus) {
    await updateReportMlStatus(pool, reportId, waitingStatus);
    logReportSpam("waiting_for_inputs", {
      reportId,
      mlStatus: waitingStatus,
    });
    return {
      reportId,
      mlStatus: waitingStatus,
      skipped: true,
      reason: waitingStatus,
    };
  }

  await updateReportMlStatus(pool, reportId, ML_STATUS.PROCESSING);

  try {
    const classifierResponse = await callSpamClassifier({ text, imageUrl });
    const normalizedPrediction = normalizeClassifierResult(classifierResponse);

    logReportSpam("classifier_response", {
      reportId,
      classifier_response: classifierResponse,
    });
    logReportSpam("normalized_prediction", {
      reportId,
      normalized_prediction: normalizedPrediction,
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
    return {
      reportId,
      mlStatus: ML_STATUS.FAILED,
      skipped: false,
      error: error?.response?.data || { message: error?.message || "unknown_error" },
    };
  }
}

async function refreshReporterTrustScore(userId, db = pool) {
  if (!userId) {
    return null;
  }

  const result = await db.query(
    `
      with verdict_counts as (
        select
          count(*) filter (where review_verdict = 'confirmed_legit')::int as legit_count,
          count(*) filter (where review_verdict = 'confirmed_spam')::int as spam_count
        from app.accident_reports
        where reported_by = $1
      )
      update auth.users u
      set
        trust_score = round(
          (
            (
              (coalesce(vc.legit_count, 0)::numeric + 1)
              / nullif((coalesce(vc.legit_count, 0) + coalesce(vc.spam_count, 0) + 2)::numeric, 0)
            ) * 100
          ),
          2
        ),
        trust_last_updated_at = now()
      from verdict_counts vc
      where u.id = $1
      returning
        u.id,
        u.trust_score,
        u.trust_last_updated_at,
        vc.legit_count,
        vc.spam_count
    `,
    [userId],
  );

  return result.rows[0] || null;
}

module.exports = {
  DEFAULT_REPORT_SPAM_MODEL_NAME,
  DEFAULT_REPORT_SPAM_MODEL_VERSION,
  ML_STATUS,
  refreshReportSpamAnalysis,
  refreshReporterTrustScore,
};
