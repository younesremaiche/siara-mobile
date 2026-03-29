const pool = require("../db");

const ACTIVE_MODEL_CACHE_TTL_MS = Number(process.env.RISK_MODEL_CACHE_TTL_MS || 60 * 1000);
const EMPTY_MODEL_CACHE_TTL_MS = Number(process.env.RISK_MODEL_EMPTY_CACHE_TTL_MS || 15 * 1000);
const NEAREST_SEGMENT_MAX_DISTANCE_METERS = Number(
  process.env.RISK_NEAREST_SEGMENT_MAX_DISTANCE_METERS || 150,
);
const MAX_WARNING_MESSAGE_LENGTH = Number(process.env.RISK_WARNING_MESSAGE_MAX_LENGTH || 500);
const DEFAULT_EXPLANATION_LIMIT = 8;

let activeModelCache = {
  id: null,
  expiresAt: 0,
};

function logPersistence(event, details = {}) {
  console.info("[risk/persist]", event, details);
}

function formatDbError(error) {
  return {
    message: error?.message || "unknown_error",
    code: error?.code || null,
    detail: error?.detail || null,
    constraint: error?.constraint || null,
    table: error?.table || null,
    schema: error?.schema || null,
  };
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRiskLevel(level, dangerPercent = null) {
  const text = String(level || "").trim().toLowerCase();
  if (text === "low" || text === "moderate" || text === "high" || text === "extreme") {
    return text;
  }

  const percent = safeNumber(dangerPercent);
  if (percent == null) {
    return "low";
  }
  if (percent < 25) return "low";
  if (percent < 50) return "moderate";
  if (percent < 75) return "high";
  return "extreme";
}

function normalizeProbability(dangerPercent) {
  const percent = safeNumber(dangerPercent);
  if (percent == null) {
    return null;
  }
  return clampNumber(percent / 100, 0, 1);
}

function normalizeConfidenceScore(prediction) {
  const numericConfidence = safeNumber(prediction?.confidence);
  if (numericConfidence != null) {
    return clampNumber(numericConfidence > 1 ? numericConfidence / 100 : numericConfidence, 0, 1);
  }

  const sentinelConfidence = String(prediction?.sentinel?.confidence || "")
    .trim()
    .toLowerCase();
  if (sentinelConfidence === "high") return 0.9;
  if (sentinelConfidence === "medium") return 0.6;
  if (sentinelConfidence === "low") return 0.3;
  return null;
}

function normalizeWarningText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function buildWarningMessage(prediction) {
  const parts = [];
  const bannerTitle = normalizeWarningText(prediction?.sentinel?.banner?.title);
  const bannerDetail = normalizeWarningText(prediction?.sentinel?.banner?.detail);

  if (bannerTitle) parts.push(bannerTitle);
  if (bannerDetail) parts.push(bannerDetail);

  const reasons = Array.isArray(prediction?.sentinel?.reasons) ? prediction.sentinel.reasons : [];
  for (const reason of reasons.slice(0, 2)) {
    const text = normalizeWarningText(reason);
    if (text) {
      parts.push(text.replace(/_/g, " "));
    }
  }

  const oodCount = safeNumber(prediction?.quality_signals?.ood_count);
  if (parts.length === 0 && oodCount != null && oodCount > 0) {
    parts.push(`OOD checks: ${Math.round(oodCount)}`);
  }

  const missingCount = safeNumber(prediction?.quality_signals?.missing_count);
  if (parts.length === 0 && missingCount != null && missingCount > 0) {
    parts.push(`Missing inputs: ${Math.round(missingCount)}`);
  }

  const message = parts.join(" | ").trim();
  if (!message) {
    return null;
  }
  return message.slice(0, MAX_WARNING_MESSAGE_LENGTH);
}

function deriveDriftFlag(prediction) {
  if (prediction?.sentinel?.is_ood === true) {
    return true;
  }
  const reasons = Array.isArray(prediction?.sentinel?.reasons) ? prediction.sentinel.reasons : [];
  if (reasons.length > 0) {
    return true;
  }
  const oodCount = safeNumber(prediction?.quality_signals?.ood_count);
  return oodCount != null && oodCount > 0;
}

function parseNumericRoadSegmentId(value) {
  if (typeof value === "bigint" && value > 0n) {
    return value.toString();
  }
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : null;
}

function coerceTimestamp(timestamp, fallbackValue = new Date()) {
  const dt = new Date(timestamp || fallbackValue);
  if (Number.isNaN(dt.getTime())) {
    return new Date(fallbackValue);
  }
  return dt;
}

function normalizePredictionPayload(prediction, timestamp) {
  const dangerPercent = safeNumber(prediction?.danger_percent);
  const calibratedProbability = normalizeProbability(dangerPercent);
  const confidenceScore = normalizeConfidenceScore(prediction);

  return {
    timestamp: coerceTimestamp(timestamp),
    riskScore: calibratedProbability ?? 0,
    riskLevel: normalizeRiskLevel(prediction?.danger_level, dangerPercent),
    calibratedProbability,
    confidenceScore,
    driftFlag: deriveDriftFlag(prediction),
    warningMessage: buildWarningMessage(prediction),
  };
}

async function getActiveModelVersionId(client) {
  if (activeModelCache.expiresAt > Date.now()) {
    return activeModelCache.id;
  }

  const result = await client.query(
    `
      select id
      from ml.model_versions
      where is_active = true
        and lower(coalesce(status, '')) in ('deployed', 'active')
      order by created_at desc
      limit 1
    `,
  );

  const modelVersionId = result.rows[0]?.id || null;
  logPersistence("model_version_resolved", {
    model_version_id: modelVersionId,
  });
  activeModelCache = {
    id: modelVersionId,
    expiresAt: Date.now() + (modelVersionId ? ACTIVE_MODEL_CACHE_TTL_MS : EMPTY_MODEL_CACHE_TTL_MS),
  };
  return modelVersionId;
}

async function findNearestRoadSegmentId(client, lat, lng, maxDistanceMeters = NEAREST_SEGMENT_MAX_DISTANCE_METERS) {
  const latitude = safeNumber(lat);
  const longitude = safeNumber(lng);
  if (latitude == null || longitude == null) {
    return null;
  }

  const result = await client.query(
    `
      with p as (
        select ST_SetSRID(ST_MakePoint($2, $1), 4326) as geom
      )
      select rs.id
      from gis.road_segments rs
      cross join p
      where ST_DWithin(rs.geom::geography, p.geom::geography, $3)
      order by rs.geom <-> p.geom
      limit 1
    `,
    [latitude, longitude, maxDistanceMeters],
  );

  return result.rows[0]?.id || null;
}

async function findFeatureId(client, roadSegmentId, timestamp) {
  const result = await client.query(
    `
      select id
      from ml.segment_time_features
      where road_segment_id = $1
        and time_bucket = date_trunc('minute', $2::timestamptz)
      order by id desc
      limit 1
    `,
    [roadSegmentId, coerceTimestamp(timestamp).toISOString()],
  );

  return result.rows[0]?.id || null;
}

async function upsertPredictionRecord(client, {
  roadSegmentId,
  timestamp,
  prediction,
  context = "prediction",
}) {
  const modelVersionId = await getActiveModelVersionId(client);
  if (!modelVersionId) {
    logPersistence("skip", {
      context,
      reason: "missing_active_model_version",
      road_segment_id: roadSegmentId,
    });
    return {
      skipped: true,
      reason: "missing_active_model_version",
      roadSegmentId,
      predictionId: null,
    };
  }

  const normalized = normalizePredictionPayload(prediction, timestamp);
  const featureId = await findFeatureId(client, roadSegmentId, normalized.timestamp);
  logPersistence("normalized", {
    context,
    model_version_id: modelVersionId,
    road_segment_id: roadSegmentId,
    feature_id: featureId,
    time_bucket: normalized.timestamp.toISOString(),
    calibrated_probability: normalized.calibratedProbability,
    confidence_score: normalized.confidenceScore,
    risk_level: normalized.riskLevel,
    drift_flag: normalized.driftFlag,
  });
  const result = await client.query(
    `
      insert into ml.risk_predictions (
        road_segment_id,
        model_version_id,
        feature_id,
        time_bucket,
        risk_score,
        risk_level,
        calibrated_probability,
        confidence_score,
        drift_flag,
        source_type,
        status,
        warning_message,
        predicted_at
      )
      values (
        $1,
        $2,
        $3,
        date_trunc('minute', $4::timestamptz),
        $5,
        $6,
        $7,
        $8,
        $9,
        'live',
        'active',
        $10,
        now()
      )
      on conflict (road_segment_id, time_bucket, model_version_id)
      do update set
        feature_id = excluded.feature_id,
        risk_score = excluded.risk_score,
        risk_level = excluded.risk_level,
        calibrated_probability = excluded.calibrated_probability,
        confidence_score = excluded.confidence_score,
        drift_flag = excluded.drift_flag,
        source_type = excluded.source_type,
        status = excluded.status,
        warning_message = excluded.warning_message,
        predicted_at = now()
      returning id, road_segment_id, model_version_id, time_bucket
    `,
    [
      roadSegmentId,
      modelVersionId,
      featureId,
      normalized.timestamp.toISOString(),
      normalized.riskScore,
      normalized.riskLevel,
      normalized.calibratedProbability,
      normalized.confidenceScore,
      normalized.driftFlag,
      normalized.warningMessage,
    ],
  );

  return {
    skipped: false,
    reason: null,
    roadSegmentId,
    featureId,
    predictionId: result.rows[0]?.id || null,
    modelVersionId,
    timeBucket: result.rows[0]?.time_bucket || null,
  };
}

async function resolveRoadSegment(client, {
  roadSegmentId,
  lat,
  lng,
  allowNearestSegmentLookup = false,
}) {
  const numericRoadSegmentId = parseNumericRoadSegmentId(roadSegmentId);
  if (numericRoadSegmentId) {
    return numericRoadSegmentId;
  }
  if (!allowNearestSegmentLookup) {
    return null;
  }
  return findNearestRoadSegmentId(client, lat, lng);
}

async function persistPrediction({
  prediction,
  timestamp,
  roadSegmentId,
  lat,
  lng,
  allowNearestSegmentLookup = false,
  context = "prediction",
}) {
  const client = await pool.connect();
  try {
    logPersistence("enter", {
      context,
      incoming_road_segment_id: roadSegmentId ?? null,
      lat: safeNumber(lat),
      lng: safeNumber(lng),
      allow_nearest_lookup: allowNearestSegmentLookup,
      timestamp: coerceTimestamp(timestamp).toISOString(),
    });
    await client.query("BEGIN");
    const resolvedRoadSegmentId = await resolveRoadSegment(client, {
      roadSegmentId,
      lat,
      lng,
      allowNearestSegmentLookup,
    });
    logPersistence("road_segment_resolved", {
      context,
      road_segment_id: resolvedRoadSegmentId,
    });

    if (!resolvedRoadSegmentId) {
      await client.query("ROLLBACK");
      logPersistence("skip", {
        context,
        reason: "missing_road_segment_id",
        incoming_road_segment_id: roadSegmentId ?? null,
      });
      return {
        skipped: true,
        reason: "missing_road_segment_id",
        roadSegmentId: null,
        predictionId: null,
      };
    }

    const upserted = await upsertPredictionRecord(client, {
      roadSegmentId: resolvedRoadSegmentId,
      timestamp,
      prediction,
      context,
    });

    await client.query("COMMIT");
    logPersistence(upserted.skipped ? "skip" : "upsert_success", {
      context,
      reason: upserted.reason,
      road_segment_id: resolvedRoadSegmentId,
      model_version_id: upserted.modelVersionId || null,
      prediction_id: upserted.predictionId || null,
      time_bucket: upserted.timeBucket || null,
    });
    return {
      ...upserted,
      roadSegmentId: resolvedRoadSegmentId,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[risk/persist] error", {
      context,
      incoming_road_segment_id: roadSegmentId ?? null,
      lat: safeNumber(lat),
      lng: safeNumber(lng),
      ...formatDbError(error),
    });
    throw error;
  } finally {
    client.release();
  }
}

function normalizeExplanationDirection(direction) {
  const text = String(direction || "").trim().toLowerCase();
  if (text === "increases_risk") return "increase";
  if (text === "decreases_risk") return "decrease";
  return "neutral";
}

async function persistExplanations(
  client,
  predictionId,
  explanation,
  limit = DEFAULT_EXPLANATION_LIMIT,
) {
  await client.query(
    "delete from ml.prediction_explanations where prediction_id = $1",
    [predictionId],
  );

  const reasons = Array.isArray(explanation?.xai?.top_reasons)
    ? explanation.xai.top_reasons.slice(0, Math.max(1, Math.min(limit, DEFAULT_EXPLANATION_LIMIT)))
    : [];

  for (let index = 0; index < reasons.length; index += 1) {
    const reason = reasons[index] || {};
    const shapValue = safeNumber(reason.impact) ?? 0;
    await client.query(
      `
        insert into ml.prediction_explanations (
          prediction_id,
          feature_name,
          feature_value,
          shap_value,
          direction,
          rank_order
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        predictionId,
        String(reason.feature || "unknown"),
        reason.value == null ? null : String(reason.value),
        shapValue,
        normalizeExplanationDirection(reason.direction),
        index + 1,
      ],
    );
  }
}

async function persistPredictionWithExplanation({
  prediction,
  explanation,
  timestamp,
  roadSegmentId,
  lat,
  lng,
  allowNearestSegmentLookup = false,
  limit = DEFAULT_EXPLANATION_LIMIT,
  context = "explain",
}) {
  const client = await pool.connect();
  try {
    logPersistence("enter", {
      context,
      incoming_road_segment_id: roadSegmentId ?? null,
      lat: safeNumber(lat),
      lng: safeNumber(lng),
      allow_nearest_lookup: allowNearestSegmentLookup,
      timestamp: coerceTimestamp(timestamp).toISOString(),
      top_k: limit,
    });
    await client.query("BEGIN");
    const resolvedRoadSegmentId = await resolveRoadSegment(client, {
      roadSegmentId,
      lat,
      lng,
      allowNearestSegmentLookup,
    });
    logPersistence("road_segment_resolved", {
      context,
      road_segment_id: resolvedRoadSegmentId,
    });

    if (!resolvedRoadSegmentId) {
      await client.query("ROLLBACK");
      logPersistence("skip", {
        context,
        reason: "missing_road_segment_id",
        incoming_road_segment_id: roadSegmentId ?? null,
      });
      return {
        skipped: true,
        reason: "missing_road_segment_id",
        roadSegmentId: null,
        predictionId: null,
      };
    }

    const upserted = await upsertPredictionRecord(client, {
      roadSegmentId: resolvedRoadSegmentId,
      timestamp,
      prediction,
      context,
    });

    if (!upserted.skipped && upserted.predictionId) {
      await persistExplanations(client, upserted.predictionId, explanation, limit);
      logPersistence("explanations_replaced", {
        context,
        prediction_id: upserted.predictionId,
      });
    }

    await client.query("COMMIT");
    logPersistence(upserted.skipped ? "skip" : "upsert_success", {
      context,
      reason: upserted.reason,
      road_segment_id: resolvedRoadSegmentId,
      model_version_id: upserted.modelVersionId || null,
      prediction_id: upserted.predictionId || null,
      time_bucket: upserted.timeBucket || null,
    });
    return {
      ...upserted,
      roadSegmentId: resolvedRoadSegmentId,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[risk/persist] error", {
      context,
      incoming_road_segment_id: roadSegmentId ?? null,
      lat: safeNumber(lat),
      lng: safeNumber(lng),
      ...formatDbError(error),
    });
    throw error;
  } finally {
    client.release();
  }
}

async function persistPredictions(items) {
  const results = [];
  for (const item of items) {
    try {
      results.push(await persistPrediction(item));
    } catch (error) {
      console.error("[risk/persist] batch_error", {
        context: item?.context || "prediction",
        incoming_road_segment_id: item?.roadSegmentId ?? null,
        ...formatDbError(error),
      });
      results.push({
        skipped: true,
        reason: error.message || "persistence_failed",
        roadSegmentId: null,
        predictionId: null,
        error,
      });
    }
  }
  return results;
}

module.exports = {
  parseNumericRoadSegmentId,
  persistExplanations,
  persistPrediction,
  persistPredictionWithExplanation,
  persistPredictions,
  resolveRoadSegment,
};
