const pool = require("../db");
const { postToFlask } = require("./risk/mlClient");
const { getCurrentWeatherUi } = require("./risk/weatherProvider");

const MODEL_NAME = "siara_occurrence_rule_fusion";
const MODEL_VERSION_TAG = "occurrence_v1_rule_fusion";
const MODEL_TARGET_TYPE = "accident_occurrence";
const MODEL_ALGORITHM = "rule_fusion";
const MODEL_FEATURE_SET = "segment_time_context_driver_optional";
const MODEL_ARTIFACT_PATH = "internal://rule-fusion/occurrence_v1";
const MODEL_DATA_SOURCE = "SIARA_DB";
const PROTOTYPE_WARNING =
  "Prototype occurrence score. This is not yet a trained calibrated occurrence probability.";

// Trained occurrence model (occurrence_beta_v1) constants. The actual joblib
// artifacts live in api/occurrence-model/occurrence_betav1_final/ and are
// loaded by the Flask service — we never touch them from Node.
const TRAINED_MODEL_NAME = "occurrence_beta_v1";
const TRAINED_MODEL_FEATURE_SET = "occurrence_beta_v1_23_features";
const TRAINED_MODEL_ALGORITHM = "lightgbm";
const TRAINED_MODEL_CALIBRATION = "isotonic";
const TRAINED_MODEL_ARTIFACT_PATH = "api/occurrence-model/occurrence_betav1_final";
const TRAINED_MODEL_DATA_SOURCE = "US_Accidents + OSM + weather cache";
const TRAINED_MODEL_FLASK_PREDICT = "/risk/occurrence/predict";
const TRAINED_MODEL_PROBABILITY_WARNING =
  "The model was trained with sampled negatives. Calibrated probabilities should be interpreted as relative operational risk until recalibrated on realistic local exposure.";
const TRAINED_MODEL_RISK_THRESHOLDS = { moderate: 0.05, high: 0.2, critical: 0.5 };
const TRAINED_MODEL_DECISION_THRESHOLD = 0.2;

const SCORE_MIN = 0.01;
const SCORE_MAX = 0.99;

const DEV_LOGS_ENABLED = (process.env.NODE_ENV || "development") !== "production";

function logOccurrence(event, details = {}) {
  if (DEV_LOGS_ENABLED) {
    console.info("[occurrence-risk]", event, details);
  }
}

function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampScore(value) {
  if (!Number.isFinite(value)) return SCORE_MIN;
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, value));
}

function riskLevelFromScore(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "low";
  if (numeric < 0.25) return "low";
  if (numeric < 0.5) return "moderate";
  if (numeric < 0.75) return "high";
  return "extreme";
}

function parsePositiveBigint(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return text;
}

function coerceTimeBucket(timeBucket) {
  const dt = timeBucket ? new Date(timeBucket) : new Date();
  if (Number.isNaN(dt.getTime())) {
    const error = new Error("Invalid timeBucket");
    error.status = 400;
    throw error;
  }
  // Bucket on minute, matching ml.risk_predictions.time_bucket convention.
  const truncated = new Date(dt);
  truncated.setUTCSeconds(0, 0);
  return truncated;
}

function isHourInRange(hour, start, end) {
  if (start <= end) return hour >= start && hour <= end;
  return hour >= start || hour <= end;
}

function applyTimeRules(timeBucket, contributions) {
  const dt = new Date(timeBucket);
  const hour = dt.getUTCHours();
  const dayOfWeek = dt.getUTCDay();
  let delta = 0;
  const reasons = [];

  if (isHourInRange(hour, 7, 9)) {
    delta += 0.06;
    reasons.push({ feature: "morning_rush_hour", impact: 0.06 });
  }
  if (isHourInRange(hour, 16, 19)) {
    delta += 0.07;
    reasons.push({ feature: "evening_rush_hour", impact: 0.07 });
  }
  if (isHourInRange(hour, 22, 5)) {
    delta += 0.05;
    reasons.push({ feature: "night_window", impact: 0.05 });
  }
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    delta += 0.03;
    reasons.push({ feature: "weekend", impact: 0.03 });
  }

  contributions.time = { delta, reasons, hour, dayOfWeek };
  return delta;
}

function applyWeatherRules(weather, contributions) {
  let delta = 0;
  const reasons = [];
  const visibility = safeNumber(weather?.visibility_km ?? weather?.visibilityKm);
  const precipitation = safeNumber(weather?.precipitation_mm ?? weather?.precipitationMm);
  const wind = safeNumber(weather?.wind_kmh ?? weather?.windKmh);

  if (visibility != null) {
    if (visibility < 1) {
      delta += 0.12;
      reasons.push({ feature: "visibility_lt_1km", impact: 0.12, value: visibility });
    } else if (visibility < 3) {
      delta += 0.08;
      reasons.push({ feature: "visibility_lt_3km", impact: 0.08, value: visibility });
    }
  }
  if (precipitation != null) {
    if (precipitation >= 5) {
      delta += 0.1;
      reasons.push({ feature: "precipitation_gte_5mm", impact: 0.1, value: precipitation });
    } else if (precipitation > 0) {
      delta += 0.05;
      reasons.push({ feature: "precipitation_present", impact: 0.05, value: precipitation });
    }
  }
  if (wind != null && wind >= 40) {
    delta += 0.05;
    reasons.push({ feature: "wind_gte_40kmh", impact: 0.05, value: wind });
  }

  contributions.weather = { delta, reasons, visibility, precipitation, wind };
  return delta;
}

function readBoolean(source, ...keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === true || value === 1 || value === "1" || value === "true") return true;
    if (value === false || value === 0 || value === "0" || value === "false") return false;
  }
  return null;
}

function applyRoadRules(roadFeatures, contributions) {
  let delta = 0;
  const reasons = [];

  const isJunction = readBoolean(
    roadFeatures,
    "junction_flag",
    "is_junction",
    "junction",
  );
  const isRoundabout = readBoolean(
    roadFeatures,
    "roundabout_flag",
    "is_roundabout",
    "roundabout",
  );
  const isUrban = readBoolean(
    roadFeatures,
    "urban_flag",
    "is_urban",
    "urban",
  );
  const maxspeed = safeNumber(roadFeatures?.maxspeed ?? roadFeatures?.max_speed);
  const roadClass = String(roadFeatures?.road_class || "").trim().toLowerCase();

  if (isJunction) {
    delta += 0.06;
    reasons.push({ feature: "junction_flag", impact: 0.06 });
  }
  if (isRoundabout) {
    delta += 0.04;
    reasons.push({ feature: "roundabout_flag", impact: 0.04 });
  }
  if (isUrban) {
    delta += 0.03;
    reasons.push({ feature: "urban_flag", impact: 0.03 });
  }
  if (maxspeed != null) {
    if (maxspeed >= 120) {
      delta += 0.1;
      reasons.push({ feature: "maxspeed_gte_120", impact: 0.1, value: maxspeed });
    } else if (maxspeed >= 90) {
      delta += 0.07;
      reasons.push({ feature: "maxspeed_gte_90", impact: 0.07, value: maxspeed });
    }
  }
  if (roadClass === "motorway" || roadClass === "trunk") {
    delta += 0.06;
    reasons.push({ feature: "road_class_motorway_trunk", impact: 0.06, value: roadClass });
  } else if (roadClass === "primary") {
    delta += 0.04;
    reasons.push({ feature: "road_class_primary", impact: 0.04, value: roadClass });
  }

  contributions.road = { delta, reasons, isJunction, isRoundabout, isUrban, maxspeed, roadClass };
  return delta;
}

function applyContextRules(context, contributions) {
  let delta = 0;
  const reasons = [];

  const recent2h = Math.min(0.12, Number(context?.reports_2h || 0) * 0.04);
  const recent24h = Math.min(0.1, Number(context?.reports_24h || 0) * 0.015);
  const verified24h = Math.min(0.1, Number(context?.verified_reports_24h || 0) * 0.05);
  const spamPenalty = Math.min(0.06, Number(context?.spam_reports_24h || 0) * 0.02);
  const alerts = Math.min(0.15, Number(context?.active_alerts || 0) * 0.08);
  const accidents30 = Math.min(0.14, Number(context?.accidents_30d || 0) * 0.03);
  const accidents365 = Math.min(0.12, Number(context?.accidents_365d || 0) * 0.005);

  if (recent2h > 0) {
    delta += recent2h;
    reasons.push({ feature: "reports_2h", impact: recent2h, count: context?.reports_2h });
  }
  if (recent24h > 0) {
    delta += recent24h;
    reasons.push({ feature: "reports_24h", impact: recent24h, count: context?.reports_24h });
  }
  if (verified24h > 0) {
    delta += verified24h;
    reasons.push({
      feature: "verified_reports_24h",
      impact: verified24h,
      count: context?.verified_reports_24h,
    });
  }
  if (spamPenalty > 0) {
    delta -= spamPenalty;
    reasons.push({
      feature: "spam_reports_24h",
      impact: -spamPenalty,
      count: context?.spam_reports_24h,
    });
  }
  if (alerts > 0) {
    delta += alerts;
    reasons.push({ feature: "active_operational_alerts", impact: alerts, count: context?.active_alerts });
  }
  if (accidents30 > 0) {
    delta += accidents30;
    reasons.push({ feature: "accidents_30d", impact: accidents30, count: context?.accidents_30d });
  }
  if (accidents365 > 0) {
    delta += accidents365;
    reasons.push({ feature: "accidents_365d", impact: accidents365, count: context?.accidents_365d });
  }

  const avgSeverity = safeNumber(context?.avg_historical_severity);
  if (avgSeverity != null) {
    if (avgSeverity >= 3) {
      delta += 0.06;
      reasons.push({ feature: "avg_historical_severity_gte_3", impact: 0.06, value: avgSeverity });
    } else if (avgSeverity >= 2) {
      delta += 0.03;
      reasons.push({ feature: "avg_historical_severity_gte_2", impact: 0.03, value: avgSeverity });
    }
  }

  contributions.context = { delta, reasons, summary: { ...context } };
  return delta;
}

function calculateGlobalOccurrenceScore({
  timeBucket,
  weather = null,
  roadFeatures = null,
  context = null,
}) {
  const contributions = {};
  let score = 0.08;
  contributions.baseline = 0.08;
  score += applyTimeRules(timeBucket, contributions);
  score += applyWeatherRules(weather || {}, contributions);
  score += applyRoadRules(roadFeatures || {}, contributions);
  score += applyContextRules(context || {}, contributions);

  const clamped = clampScore(score);
  contributions.raw_score = Number(score.toFixed(4));
  contributions.clamped_score = Number(clamped.toFixed(4));
  return { score: clamped, contributions };
}

function driverMultiplierFromProfile(profile) {
  if (!profile || profile.latestRiskScore == null) {
    return {
      multiplier: 1.0,
      normalizedDriverRisk: 0.5,
      hasProfile: false,
      reason:
        "Neutral multiplier applied because no driver quiz result is available for this user.",
    };
  }
  const numeric = Number(profile.latestRiskScore);
  if (!Number.isFinite(numeric)) {
    return {
      multiplier: 1.0,
      normalizedDriverRisk: 0.5,
      hasProfile: false,
      reason: "Neutral multiplier applied because driver quiz risk score is invalid.",
    };
  }
  const normalized = Math.max(0, Math.min(1, numeric / 100));
  const multiplier = 0.85 + normalized * 0.4;
  return {
    multiplier: Number(multiplier.toFixed(4)),
    normalizedDriverRisk: Number(normalized.toFixed(4)),
    hasProfile: true,
    reason: `Driver quiz risk score ${Math.round(numeric)}/100 mapped to multiplier ${multiplier.toFixed(2)}.`,
  };
}

async function loadRoadSegment(client, roadSegmentId) {
  const result = await client.query(
    `
      select
        id,
        coalesce(road_class, '') as road_class,
        to_jsonb(rs.*) as raw
      from gis.road_segments rs
      where id = $1
      limit 1
    `,
    [roadSegmentId],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  const raw = row.raw || {};
  return {
    id: String(row.id),
    road_class: row.road_class || raw.road_class || null,
    junction_flag: raw.junction_flag ?? raw.is_junction ?? raw.junction ?? null,
    roundabout_flag: raw.roundabout_flag ?? raw.is_roundabout ?? raw.roundabout ?? null,
    urban_flag: raw.urban_flag ?? raw.is_urban ?? raw.urban ?? null,
    maxspeed: raw.maxspeed ?? raw.max_speed ?? null,
  };
}

async function loadSegmentTimeFeatures(client, roadSegmentId, timeBucket) {
  try {
    const result = await client.query(
      `
        select to_jsonb(stf.*) as features
        from ml.segment_time_features stf
        where stf.road_segment_id = $1
          and stf.time_bucket = date_trunc('minute', $2::timestamptz)
        order by stf.id desc
        limit 1
      `,
      [roadSegmentId, new Date(timeBucket).toISOString()],
    );
    return result.rows[0]?.features || null;
  } catch (error) {
    logOccurrence("segment_time_features_unavailable", {
      message: error?.message,
      code: error?.code,
    });
    return null;
  }
}

async function loadContextSignals(client, roadSegmentId, timeBucket) {
  const isoTime = new Date(timeBucket).toISOString();
  const fallback = {
    reports_2h: 0,
    reports_24h: 0,
    verified_reports_24h: 0,
    spam_reports_24h: 0,
    active_alerts: 0,
    accidents_30d: 0,
    accidents_365d: 0,
    avg_historical_severity: null,
  };

  try {
    const reports = await client.query(
      `
        with seg as (
          select geom from gis.road_segments where id = $1 limit 1
        )
        select
          count(*) filter (
            where ar.created_at >= $2::timestamptz - interval '2 hours'
          )::int as reports_2h,
          count(*) filter (
            where ar.created_at >= $2::timestamptz - interval '24 hours'
          )::int as reports_24h,
          count(*) filter (
            where ar.created_at >= $2::timestamptz - interval '24 hours'
              and (
                ar.status = 'verified'
                or ar.review_verdict = 'confirmed_legit'
                or ar.verified_by_officer_id is not null
              )
          )::int as verified_reports_24h,
          count(*) filter (
            where ar.created_at >= $2::timestamptz - interval '24 hours'
              and (
                ar.latest_predicted_label = 'spam'
                or ar.review_verdict = 'confirmed_spam'
              )
          )::int as spam_reports_24h
        from app.accident_reports ar, seg
        where ar.incident_location is not null
          and ST_DWithin(
            ar.incident_location,
            seg.geom::geography,
            300
          )
      `,
      [roadSegmentId, isoTime],
    );
    const row = reports.rows[0] || {};
    fallback.reports_2h = Number(row.reports_2h || 0);
    fallback.reports_24h = Number(row.reports_24h || 0);
    fallback.verified_reports_24h = Number(row.verified_reports_24h || 0);
    fallback.spam_reports_24h = Number(row.spam_reports_24h || 0);
  } catch (error) {
    logOccurrence("reports_context_unavailable", { message: error?.message });
  }

  try {
    const accidents = await client.query(
      `
        with seg as (
          select geom from gis.road_segments where id = $1 limit 1
        )
        select
          count(*) filter (where ae.event_time >= $2::timestamptz - interval '30 days')::int
            as accidents_30d,
          count(*) filter (where ae.event_time >= $2::timestamptz - interval '365 days')::int
            as accidents_365d,
          avg(case when ae.event_time >= $2::timestamptz - interval '365 days' then ae.severity end)
            as avg_severity
        from gis.accident_events ae, seg
        where ae.location is not null
          and ST_DWithin(ae.location::geography, seg.geom::geography, 300)
      `,
      [roadSegmentId, isoTime],
    );
    const row = accidents.rows[0] || {};
    fallback.accidents_30d = Number(row.accidents_30d || 0);
    fallback.accidents_365d = Number(row.accidents_365d || 0);
    if (row.avg_severity != null) {
      fallback.avg_historical_severity = Number(row.avg_severity);
    }
  } catch (error) {
    logOccurrence("accident_history_unavailable", { message: error?.message });
  }

  try {
    const alerts = await client.query(
      `
        with seg as (
          select geom from gis.road_segments where id = $1 limit 1
        )
        select count(distinct oa.id)::int as active_alerts
        from app.operational_alerts oa
        left join gis.admin_areas aa on aa.id = oa.admin_area_id
        cross join seg
        where lower(coalesce(oa.status, '')) = 'active'
          and (oa.starts_at is null or oa.starts_at <= $2::timestamptz)
          and (oa.ends_at is null or oa.ends_at >= $2::timestamptz)
          and (
            aa.geom is null
            or ST_Intersects(aa.geom, seg.geom)
          )
      `,
      [roadSegmentId, isoTime],
    );
    fallback.active_alerts = Number(alerts.rows[0]?.active_alerts || 0);
  } catch (error) {
    logOccurrence("operational_alerts_unavailable", { message: error?.message });
  }

  return fallback;
}

async function loadDriverProfile(client, userId) {
  if (!userId) return null;
  try {
    const result = await client.query(
      `
        select
          user_id,
          latest_attempt_id,
          latest_risk_score,
          latest_result_label,
          latest_result_title,
          latest_result_description,
          latest_recommendation_description,
          category_scores,
          last_completed_at
        from app.user_driver_quiz_profile
        where user_id = $1
        limit 1
      `,
      [userId],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      userId: row.user_id,
      latestAttemptId: row.latest_attempt_id,
      latestRiskScore: row.latest_risk_score == null ? null : Number(row.latest_risk_score),
      latestResultLabel: row.latest_result_label,
      latestResultTitle: row.latest_result_title,
      latestResultDescription: row.latest_result_description,
      latestRecommendationDescription: row.latest_recommendation_description,
      categoryScores: row.category_scores || {},
      lastCompletedAt: row.last_completed_at,
    };
  } catch (error) {
    logOccurrence("driver_profile_unavailable", { message: error?.message });
    return null;
  }
}

async function ensureModelVersionId(client) {
  const select = await client.query(
    `
      select id
      from ml.model_versions
      where model_name = $1
        and target_type = $2
      order by created_at desc
      limit 1
    `,
    [MODEL_NAME, MODEL_TARGET_TYPE],
  );
  if (select.rowCount > 0) {
    return select.rows[0].id;
  }
  const insert = await client.query(
    `
      insert into ml.model_versions (
        model_name,
        target_type,
        algorithm,
        feature_set_name,
        data_source,
        calibration_method,
        artifact_path,
        status,
        is_active,
        created_at
      )
      values ($1, $2, $3, $4, $5, 'not_calibrated', $6, 'active', true, now())
      returning id
    `,
    [
      MODEL_NAME,
      MODEL_TARGET_TYPE,
      MODEL_ALGORITHM,
      MODEL_FEATURE_SET,
      MODEL_DATA_SOURCE,
      MODEL_ARTIFACT_PATH,
    ],
  );
  return insert.rows[0].id;
}

async function persistGlobalPrediction(
  client,
  { roadSegmentId, timeBucket, score, contributions, modelVersionId },
) {
  const featureRow = await client.query(
    `
      select id
      from ml.segment_time_features
      where road_segment_id = $1
        and time_bucket = date_trunc('minute', $2::timestamptz)
      order by id desc
      limit 1
    `,
    [roadSegmentId, new Date(timeBucket).toISOString()],
  );
  const featureId = featureRow.rows[0]?.id || null;
  const riskLevel = riskLevelFromScore(score);
  const globalScoreRounded = Number(score.toFixed(4));
  const confidenceScore = 0.5;

  console.log("[occurrence-risk] persisting global prediction", {
    roadSegmentId,
    timeBucket: new Date(timeBucket).toISOString(),
    globalScore: globalScoreRounded,
    globalRiskLevel: riskLevel,
    sourceType: "live",
    algorithm: MODEL_ALGORITHM,
  });

  // Prototype occurrence model: do NOT store a calibrated probability — this
  // is a rule-fusion score, not a calibrated trained probability. Use the
  // existing "live" source_type per the ml.risk_predictions check constraint;
  // the rule_fusion identity lives on the model_versions row instead.
  const insert = await client.query(
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
        $1, $2, $3,
        date_trunc('minute', $4::timestamptz),
        $5, $6, NULL, $7, false, 'live', 'active', $8, now()
      )
      on conflict (road_segment_id, time_bucket, model_version_id)
      do update set
        feature_id = excluded.feature_id,
        risk_score = excluded.risk_score,
        risk_level = excluded.risk_level,
        calibrated_probability = NULL,
        confidence_score = excluded.confidence_score,
        drift_flag = false,
        source_type = excluded.source_type,
        status = excluded.status,
        warning_message = excluded.warning_message,
        predicted_at = now()
      returning id
    `,
    [
      roadSegmentId,
      modelVersionId,
      featureId,
      new Date(timeBucket).toISOString(),
      globalScoreRounded,
      riskLevel,
      confidenceScore,
      PROTOTYPE_WARNING,
    ],
  );
  return { predictionId: insert.rows[0]?.id || null, riskLevel, featureId };
}

async function persistPersonalizedPrediction(
  client,
  {
    userId,
    roadSegmentId,
    timeBucket,
    globalPredictionId,
    globalScore,
    globalRiskLevel,
    personalizedScore,
    personalizedRiskLevel,
    driverProfile,
    explanation,
  },
) {
  const result = await client.query(
    `
      insert into app.user_occurrence_risk_predictions (
        user_id,
        road_segment_id,
        global_prediction_id,
        time_bucket,
        global_occurrence_score,
        personalized_occurrence_score,
        global_risk_level,
        personalized_risk_level,
        driver_risk_score,
        driver_result_label,
        driver_category_scores,
        explanation,
        model_version,
        created_at
      )
      values (
        $1, $2, $3,
        date_trunc('minute', $4::timestamptz),
        $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, now()
      )
      on conflict (user_id, road_segment_id, time_bucket, model_version)
      do update set
        global_prediction_id = excluded.global_prediction_id,
        global_occurrence_score = excluded.global_occurrence_score,
        personalized_occurrence_score = excluded.personalized_occurrence_score,
        global_risk_level = excluded.global_risk_level,
        personalized_risk_level = excluded.personalized_risk_level,
        driver_risk_score = excluded.driver_risk_score,
        driver_result_label = excluded.driver_result_label,
        driver_category_scores = excluded.driver_category_scores,
        explanation = excluded.explanation,
        created_at = now()
      returning id, created_at
    `,
    [
      userId,
      roadSegmentId,
      globalPredictionId,
      new Date(timeBucket).toISOString(),
      Number(globalScore.toFixed(4)),
      Number(personalizedScore.toFixed(4)),
      globalRiskLevel,
      personalizedRiskLevel,
      driverProfile?.latestRiskScore ?? null,
      driverProfile?.latestResultLabel ?? null,
      JSON.stringify(driverProfile?.categoryScores || {}),
      JSON.stringify(explanation || {}),
      MODEL_VERSION_TAG,
    ],
  );
  return result.rows[0] || null;
}

async function predictOccurrenceRiskForSegment({
  userId = null,
  roadSegmentId,
  timeBucket,
  weather = null,
  roadFeaturesOverride = null,
  contextOverride = null,
  persist = true,
  db = pool,
} = {}) {
  const segmentIdText = parsePositiveBigint(roadSegmentId);
  if (!segmentIdText) {
    const error = new Error("roadSegmentId must be a positive integer");
    error.status = 400;
    throw error;
  }
  const truncatedTime = coerceTimeBucket(timeBucket);

  const useTransaction = persist && db === pool;
  const client = useTransaction ? await db.connect() : db;

  try {
    if (useTransaction) await client.query("begin");

    const segment = await loadRoadSegment(client, segmentIdText);
    if (!segment) {
      const error = new Error("road segment not found");
      error.status = 404;
      throw error;
    }

    const featureRow = await loadSegmentTimeFeatures(client, segmentIdText, truncatedTime);
    const roadFeatures = {
      ...segment,
      ...(featureRow || {}),
      ...(roadFeaturesOverride || {}),
    };
    const effectiveWeather = weather || (featureRow ? {
      visibility_km: featureRow.visibility_km ?? featureRow.visibility,
      precipitation_mm: featureRow.precipitation_mm ?? featureRow.precipitation,
      wind_kmh: featureRow.wind_kmh ?? featureRow.wind_speed_kmh,
    } : null);

    const context = contextOverride
      ? contextOverride
      : await loadContextSignals(client, segmentIdText, truncatedTime);

    const driverProfile = await loadDriverProfile(client, userId);
    const driver = driverMultiplierFromProfile(driverProfile);

    const { score: globalScore, contributions } = calculateGlobalOccurrenceScore({
      timeBucket: truncatedTime,
      weather: effectiveWeather,
      roadFeatures,
      context,
    });
    const personalizedScore = clampScore(globalScore * driver.multiplier);
    const globalRiskLevel = riskLevelFromScore(globalScore);
    const personalizedRiskLevel = riskLevelFromScore(personalizedScore);

    const explanation = {
      model_version: MODEL_VERSION_TAG,
      warning: PROTOTYPE_WARNING,
      time: contributions.time,
      weather: contributions.weather,
      road: contributions.road,
      context: contributions.context,
      baseline: contributions.baseline,
      raw_score: contributions.raw_score,
      clamped_score: contributions.clamped_score,
      driver_behavior: driver,
    };

    let globalPredictionId = null;
    let modelVersionId = null;
    let savedPersonalized = null;
    if (persist) {
      modelVersionId = await ensureModelVersionId(client);
      const globalSaved = await persistGlobalPrediction(client, {
        roadSegmentId: segmentIdText,
        timeBucket: truncatedTime,
        score: globalScore,
        contributions,
        modelVersionId,
      });
      globalPredictionId = globalSaved.predictionId;

      if (userId) {
        savedPersonalized = await persistPersonalizedPrediction(client, {
          userId,
          roadSegmentId: segmentIdText,
          timeBucket: truncatedTime,
          globalPredictionId,
          globalScore,
          globalRiskLevel,
          personalizedScore,
          personalizedRiskLevel,
          driverProfile,
          explanation,
        });
      }
    }

    if (useTransaction) await client.query("commit");

    logOccurrence("predicted", {
      roadSegmentId: segmentIdText,
      userId: userId || null,
      timeBucket: truncatedTime.toISOString(),
      globalScore: Number(globalScore.toFixed(4)),
      driverMultiplier: driver.multiplier,
      personalizedScore: Number(personalizedScore.toFixed(4)),
      modelVersion: MODEL_VERSION_TAG,
      globalPredictionId,
      hasDriverProfile: driver.hasProfile,
    });

    return {
      road_segment_id: segmentIdText,
      time_bucket: truncatedTime.toISOString(),
      global_occurrence_score: Number(globalScore.toFixed(4)),
      global_risk_level: globalRiskLevel,
      personalized_occurrence_score: Number(personalizedScore.toFixed(4)),
      personalized_risk_level: personalizedRiskLevel,
      confidence_score: 0.5,
      driver_behavior: {
        has_driver_profile: driver.hasProfile,
        latest_risk_score: driverProfile?.latestRiskScore ?? null,
        latest_result_label: driverProfile?.latestResultLabel ?? null,
        multiplier: driver.multiplier,
        normalized_driver_risk: driver.normalizedDriverRisk,
        reason: driver.reason,
      },
      explanation,
      persisted: {
        global_prediction_id: globalPredictionId,
        personalized_prediction_id: savedPersonalized?.id || null,
        model_version: MODEL_VERSION_TAG,
      },
      warning: PROTOTYPE_WARNING,
    };
  } catch (error) {
    if (useTransaction) await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    if (useTransaction) client.release();
  }
}

async function listUserOccurrenceRiskHistory(userId, { limit = 20, offset = 0 } = {}, db = pool) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const result = await db.query(
    `
      select id, road_segment_id, time_bucket, global_occurrence_score,
             personalized_occurrence_score, global_risk_level, personalized_risk_level,
             driver_risk_score, driver_result_label, model_version, created_at
      from app.user_occurrence_risk_predictions
      where user_id = $1
      order by created_at desc
      limit $2 offset $3
    `,
    [userId, safeLimit + 1, safeOffset],
  );
  const hasMore = result.rows.length > safeLimit;
  const rows = hasMore ? result.rows.slice(0, safeLimit) : result.rows;
  return {
    items: rows.map((row) => ({
      id: row.id,
      roadSegmentId: String(row.road_segment_id),
      timeBucket: row.time_bucket,
      globalOccurrenceScore: Number(row.global_occurrence_score),
      personalizedOccurrenceScore: Number(row.personalized_occurrence_score),
      globalRiskLevel: row.global_risk_level,
      personalizedRiskLevel: row.personalized_risk_level,
      driverRiskScore:
        row.driver_risk_score == null ? null : Number(row.driver_risk_score),
      driverResultLabel: row.driver_result_label,
      modelVersion: row.model_version,
      createdAt: row.created_at,
    })),
    pagination: { limit: safeLimit, offset: safeOffset, hasMore },
  };
}

// ─── Trained occurrence model (occurrence_beta_v1) helpers ──────────────────

function trainedRiskLevelFromProbability(probability) {
  const numeric = Number(probability);
  if (!Number.isFinite(numeric)) return "low";
  if (numeric >= TRAINED_MODEL_RISK_THRESHOLDS.critical) return "critical";
  if (numeric >= TRAINED_MODEL_RISK_THRESHOLDS.high) return "high";
  if (numeric >= TRAINED_MODEL_RISK_THRESHOLDS.moderate) return "moderate";
  return "low";
}

function trainedBooleanFlag(value) {
  if (value === true || value === 1 || value === "1" || value === "true" || value === "T" || value === "t") {
    return "T";
  }
  return "F";
}

function trainedOnewayFlag(value) {
  if (value === true || value === 1 || value === "1" || value === "true" || value === "T" || value === "t" || value === "yes") {
    return "T";
  }
  return "B";
}

function trainedNumericOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

// ─── Weather unit conversions (model-side) ──────────────────────────────────
// The occurrence model was trained on Meteostat units: Celsius, %, mm,
// degrees, km/h, hPa. The existing /risk/current helper (getCurrentWeatherUi)
// already returns weather in those units, so most fields map 1:1. The
// conversions below cover the few callers that may still hand us
// Fahrenheit/inches/mph (e.g. raw payloads from the danger-zone overlay
// service).

function fahrenheitToCelsius(value) {
  const numeric = trainedNumericOrNull(value);
  return numeric == null ? null : (numeric - 32) * (5 / 9);
}

function inHgToHpa(value) {
  const numeric = trainedNumericOrNull(value);
  return numeric == null ? null : numeric * 33.8638866667;
}

function mphToKmhLocal(value) {
  const numeric = trainedNumericOrNull(value);
  return numeric == null ? null : numeric * 1.609344;
}

function inchesToMm(value) {
  const numeric = trainedNumericOrNull(value);
  return numeric == null ? null : numeric * 25.4;
}

// Magnus approximation for dew point in Celsius.
// Returns null if temperature or humidity are missing/invalid.
function calculateDewPointC(tempC, rhum) {
  const t = trainedNumericOrNull(tempC);
  const h = trainedNumericOrNull(rhum);
  if (t == null || h == null || h <= 0) return null;
  const a = 17.27;
  const b = 237.7;
  const alpha = (a * t) / (b + t) + Math.log(h / 100);
  const denominator = a - alpha;
  if (denominator === 0) return null;
  return (b * alpha) / denominator;
}

function roundOrNull(value, digits = 2) {
  const numeric = trainedNumericOrNull(value);
  if (numeric == null) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

// Convert any of the weather payload shapes SIARA produces into the seven
// occurrence-model weather features. Accepts:
//   - getCurrentWeatherUi() output (temperature_c, humidity_pct, ...)
//   - raw model rows (Temperature(F), Humidity(%), Pressure(in), ...)
//   - hybrid payloads (windspeed_10m_kmh / winddirection_10m)
// Anything missing is returned as null so the trained-model preprocessor
// can impute it.
function mapWeatherToOccurrenceFeatures(weather) {
  if (!weather || typeof weather !== "object") {
    return {
      weather_temp: null,
      weather_dwpt: null,
      weather_rhum: null,
      weather_prcp: null,
      weather_wdir: null,
      weather_wspd: null,
      weather_pres: null,
    };
  }

  // Temperature → Celsius
  let weatherTemp = trainedNumericOrNull(
    weather.weather_temp
    ?? weather.temperature_c
    ?? weather.temp_c,
  );
  if (weatherTemp == null) {
    weatherTemp = fahrenheitToCelsius(
      weather["Temperature(F)"] ?? weather.temperature_f ?? weather.temp_f,
    );
  }

  // Relative humidity → %
  const weatherRhum = trainedNumericOrNull(
    weather.weather_rhum
    ?? weather.humidity_pct
    ?? weather.relative_humidity_2m
    ?? weather["Humidity(%)"]
    ?? weather.rhum,
  );

  // Pressure → hPa
  let weatherPres = trainedNumericOrNull(
    weather.weather_pres
    ?? weather.pressure_hpa
    ?? weather.pressure_msl
    ?? weather.pres,
  );
  if (weatherPres == null) {
    weatherPres = inHgToHpa(weather["Pressure(in)"] ?? weather.pressure_in);
  }

  // Wind speed → km/h (prefer existing km/h, else convert from mph)
  let weatherWspd = trainedNumericOrNull(
    weather.weather_wspd
    ?? weather.windspeed_10m_kmh
    ?? weather.wind_speed_kmh
    ?? weather.wind_kmh
    ?? weather.wspd,
  );
  if (weatherWspd == null) {
    weatherWspd = mphToKmhLocal(
      weather["Wind_Speed(mph)"]
      ?? weather.wind_speed_mph
      ?? weather.wind_mph
      ?? weather.windspeed_mph,
    );
  }
  // If only windspeed_10m is present without a unit suffix, assume the
  // Open-Meteo defaults that SIARA's helper requests (km/h). The
  // wind_speed_10m field from Open-Meteo is in the unit the request asked
  // for — when callers don't tell us, km/h is the safer assumption for
  // this codebase because getCurrentWeatherUi already returns km/h.
  if (weatherWspd == null) {
    weatherWspd = trainedNumericOrNull(weather.windspeed_10m ?? weather.wind_speed_10m);
  }

  // Wind direction → degrees (0–360, numeric only)
  const weatherWdir = trainedNumericOrNull(
    weather.weather_wdir
    ?? weather.wind_direction_deg
    ?? weather.winddirection_10m
    ?? weather.wind_direction_10m
    ?? weather.wdir,
  );

  // Precipitation → mm
  let weatherPrcp = trainedNumericOrNull(
    weather.weather_prcp
    ?? weather.precipitation_mm
    ?? weather.precip_mm
    ?? weather.prcp,
  );
  if (weatherPrcp == null) {
    weatherPrcp = inchesToMm(weather["Precipitation(in)"] ?? weather.precipitation_in);
  }

  // Dew point → Celsius (direct value if provided, else Magnus from temp/rhum)
  let weatherDwpt = trainedNumericOrNull(
    weather.weather_dwpt
    ?? weather.dewpoint_c
    ?? weather.dwpt,
  );
  if (weatherDwpt == null) {
    const dewpointF = trainedNumericOrNull(weather["Dewpoint(F)"] ?? weather.dewpoint_f);
    if (dewpointF != null) {
      weatherDwpt = fahrenheitToCelsius(dewpointF);
    }
  }
  if (weatherDwpt == null) {
    weatherDwpt = calculateDewPointC(weatherTemp, weatherRhum);
  }

  return {
    weather_temp: roundOrNull(weatherTemp, 2),
    weather_dwpt: roundOrNull(weatherDwpt, 2),
    weather_rhum: roundOrNull(weatherRhum, 1),
    weather_prcp: roundOrNull(weatherPrcp, 3),
    weather_wdir: roundOrNull(weatherWdir, 1),
    weather_wspd: roundOrNull(weatherWspd, 2),
    weather_pres: roundOrNull(weatherPres, 2),
  };
}

function trainedTimePartsFromBucket(timeBucket) {
  const dt = new Date(timeBucket);
  if (Number.isNaN(dt.getTime())) {
    const error = new Error("Invalid timeBucket for occurrence_beta_v1 features");
    error.status = 400;
    throw error;
  }
  // Use UTC to keep predictions deterministic against the same payload from
  // any client timezone — matches how the danger-zone pipeline uses UTC too.
  const month = dt.getUTCMonth() + 1;
  const weekday = dt.getUTCDay();
  const hour = dt.getUTCHours();
  const hourOfWeek = weekday * 24 + hour;
  // Saturday = 6, Sunday = 0 in JS — matching the training notebook's "weekend"
  // convention (treats both weekend days alike).
  const isWeekend = weekday === 0 || weekday === 6 ? 1 : 0;
  // Conservative night window: 22:00 → 05:59 inclusive.
  const isNight = hour >= 22 || hour < 6 ? 1 : 0;
  return { month, weekday, hour, hourOfWeek, isWeekend, isNight };
}

async function loadSegmentForTrainedModel(client, roadSegmentId) {
  const result = await client.query(
    `
      select
        rs.id,
        coalesce(rs.road_class, '') as road_class,
        ST_Length(rs.geom::geography) as segment_length_m,
        ST_Y(ST_Centroid(rs.geom)) as centroid_lat,
        ST_X(ST_Centroid(rs.geom)) as centroid_lng,
        to_jsonb(rs.*) as raw
      from gis.road_segments rs
      where rs.id = $1
      limit 1
    `,
    [roadSegmentId],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  const raw = row.raw || {};
  return {
    id: String(row.id),
    roadClass: row.road_class || raw.road_class || null,
    segmentLengthM: trainedNumericOrNull(row.segment_length_m),
    centroidLat: trainedNumericOrNull(row.centroid_lat),
    centroidLng: trainedNumericOrNull(row.centroid_lng),
    oneway: raw.oneway,
    bridge: raw.bridge ?? raw.is_bridge,
    tunnel: raw.tunnel ?? raw.is_tunnel,
  };
}

async function loadTrainedPastSegmentCounts(client, roadSegmentId, timeBucket, hourOfWeek) {
  // gis.accident_events.event_time + .location are assumed (the rule-fusion
  // path uses the same columns at line 425). If the table lacks any of these,
  // counts default to 0 so a feature row is always produced.
  try {
    const isoTime = new Date(timeBucket).toISOString();
    const result = await client.query(
      `
        with seg as (
          select id, geom from gis.road_segments where id = $1 limit 1
        )
        select
          count(*) filter (
            where ae.event_time < $2::timestamptz
          )::int as past_segment_positive_count,
          count(*) filter (
            where ae.event_time >= $2::timestamptz - interval '7 days'
              and ae.event_time < $2::timestamptz
          )::int as past_segment_positive_count_7d,
          count(*) filter (
            where ae.event_time >= $2::timestamptz - interval '30 days'
              and ae.event_time < $2::timestamptz
          )::int as past_segment_positive_count_30d,
          count(*) filter (
            where ae.event_time < $2::timestamptz
              and (
                (extract(dow from ae.event_time)::int * 24)
                + extract(hour from ae.event_time)::int
              ) = $3
          )::int as past_segment_hourofweek_count
        from gis.accident_events ae, seg
        where ae.location is not null
          and ST_DWithin(ae.location::geography, seg.geom::geography, 50)
      `,
      [roadSegmentId, isoTime, hourOfWeek],
    );
    const row = result.rows[0] || {};
    return {
      pastSegmentPositiveCount: Number(row.past_segment_positive_count || 0),
      pastSegmentPositiveCount7d: Number(row.past_segment_positive_count_7d || 0),
      pastSegmentPositiveCount30d: Number(row.past_segment_positive_count_30d || 0),
      pastSegmentHourOfWeekCount: Number(row.past_segment_hourofweek_count || 0),
    };
  } catch (error) {
    logOccurrence("trained_past_segment_counts_unavailable", {
      message: error?.message,
      code: error?.code,
    });
    return {
      pastSegmentPositiveCount: 0,
      pastSegmentPositiveCount7d: 0,
      pastSegmentPositiveCount30d: 0,
      pastSegmentHourOfWeekCount: 0,
    };
  }
}

async function loadTrainedPastRoadClassCount(client, roadClass, timeBucket) {
  if (!roadClass) return 0;
  try {
    const isoTime = new Date(timeBucket).toISOString();
    const result = await client.query(
      `
        select count(*)::int as past_road_class_positive_count
        from gis.accident_events ae
        join gis.road_segments rs on rs.id = ae.road_segment_id
        where ae.event_time < $2::timestamptz
          and lower(coalesce(rs.road_class, '')) = lower($1)
      `,
      [roadClass, isoTime],
    );
    return Number(result.rows[0]?.past_road_class_positive_count || 0);
  } catch (error) {
    logOccurrence("trained_past_road_class_count_unavailable", {
      message: error?.message,
      code: error?.code,
    });
    return 0;
  }
}

async function fetchWeatherForOccurrenceSegment({
  centroidLat,
  centroidLng,
  targetTimeIso,
  deadline,
  roadSegmentId,
}) {
  if (centroidLat == null || centroidLng == null) {
    logOccurrence("weather_enrichment_skipped", {
      roadSegmentId,
      reason: "segment_centroid_unavailable",
    });
    return { weatherPayload: null, fallbackUsed: true };
  }
  try {
    const weatherPayload = await getCurrentWeatherUi(
      centroidLat,
      centroidLng,
      targetTimeIso,
      deadline,
    );
    return { weatherPayload: weatherPayload || null, fallbackUsed: !weatherPayload };
  } catch (error) {
    console.warn(
      "[occurrence-risk] weather_enrichment_failed",
      JSON.stringify({
        roadSegmentId,
        centroidLat,
        centroidLng,
        targetTimeIso,
        message: error?.message,
        code: error?.code,
      }),
    );
    return { weatherPayload: null, fallbackUsed: true };
  }
}

async function buildOccurrenceFeaturesForSegment({
  roadSegmentId,
  targetTime,
  weather = null,
  deadline = null,
  db = pool,
} = {}) {
  const segmentIdText = parsePositiveBigint(roadSegmentId);
  if (!segmentIdText) {
    const error = new Error("roadSegmentId must be a positive integer");
    error.status = 400;
    throw error;
  }
  const timeParts = trainedTimePartsFromBucket(targetTime);
  const truncatedTime = coerceTimeBucket(targetTime);

  const client = db === pool ? await db.connect() : db;
  const useTransaction = db === pool;
  try {
    const segment = await loadSegmentForTrainedModel(client, segmentIdText);
    if (!segment) {
      const error = new Error("road segment not found");
      error.status = 404;
      throw error;
    }

    const [segmentCounts, roadClassCount] = await Promise.all([
      loadTrainedPastSegmentCounts(
        client,
        segmentIdText,
        truncatedTime,
        timeParts.hourOfWeek,
      ),
      loadTrainedPastRoadClassCount(client, segment.roadClass, truncatedTime),
    ]);

    // Weather enrichment: prefer the caller-supplied payload (e.g. a unit test
    // override), otherwise hit the existing /risk/current helper so we reuse
    // the same Open-Meteo client + cache that powers /risk/current and
    // /risk/overlay — no duplicate API code.
    let weatherFallbackUsed = false;
    let weatherSource = weather ? "caller_supplied" : null;
    let weatherPayload = weather || null;
    if (!weatherPayload) {
      const fetched = await fetchWeatherForOccurrenceSegment({
        centroidLat: segment.centroidLat,
        centroidLng: segment.centroidLng,
        targetTimeIso: truncatedTime.toISOString(),
        deadline,
        roadSegmentId: segmentIdText,
      });
      weatherPayload = fetched.weatherPayload;
      weatherFallbackUsed = fetched.fallbackUsed;
      weatherSource = fetched.weatherPayload ? "open_meteo_current" : "fallback_null";
    }

    const weatherFeatures = mapWeatherToOccurrenceFeatures(weatherPayload);

    // Build the 23-feature row in the exact order Flask expects (Flask reorders
    // by feature_list.json anyway, but keeping the local ordering aligned makes
    // diffs easier to read).
    const features = {
      month: timeParts.month,
      weekday: timeParts.weekday,
      hour: timeParts.hour,
      hour_of_week: timeParts.hourOfWeek,
      is_weekend: timeParts.isWeekend,
      is_night: timeParts.isNight,
      road_class: segment.roadClass || "unknown",
      segment_length_m: segment.segmentLengthM,
      oneway: trainedOnewayFlag(segment.oneway),
      bridge: trainedBooleanFlag(segment.bridge),
      tunnel: trainedBooleanFlag(segment.tunnel),
      ...weatherFeatures,
      past_segment_positive_count: segmentCounts.pastSegmentPositiveCount,
      past_segment_positive_count_7d: segmentCounts.pastSegmentPositiveCount7d,
      past_segment_positive_count_30d: segmentCounts.pastSegmentPositiveCount30d,
      past_road_class_positive_count: roadClassCount,
      past_segment_hourofweek_count: segmentCounts.pastSegmentHourOfWeekCount,
    };

    const hasWeather = Object.values(weatherFeatures).some((value) => value != null);
    logOccurrence("weather_features_built", {
      roadSegmentId: segmentIdText,
      hasWeather,
      weather_temp: weatherFeatures.weather_temp,
      weather_rhum: weatherFeatures.weather_rhum,
      weather_prcp: weatherFeatures.weather_prcp,
      weather_wspd: weatherFeatures.weather_wspd,
      weather_pres: weatherFeatures.weather_pres,
      weather_wdir: weatherFeatures.weather_wdir,
      weather_dwpt: weatherFeatures.weather_dwpt,
      weatherSource,
      weatherFallbackUsed,
    });

    return {
      roadSegmentId: segmentIdText,
      timeBucket: truncatedTime,
      features,
      meta: {
        roadClass: segment.roadClass,
        segmentLengthM: segment.segmentLengthM,
        centroidLat: segment.centroidLat,
        centroidLng: segment.centroidLng,
        weatherSource,
        weatherFallbackUsed,
      },
    };
  } finally {
    if (useTransaction) client.release();
  }
}

async function buildOccurrenceFeaturesForRoute({
  routeSegments,
  startTime,
  weather = null,
  db = pool,
} = {}) {
  if (!Array.isArray(routeSegments) || routeSegments.length === 0) return [];
  const out = [];
  for (const segment of routeSegments) {
    const segmentId = parsePositiveBigint(segment?.roadSegmentId ?? segment?.road_segment_id ?? segment?.segment_id);
    if (!segmentId) continue;
    try {
      const featureRow = await buildOccurrenceFeaturesForSegment({
        roadSegmentId: segmentId,
        // ETA per segment is optional — fall back to the route start time so a
        // missing segment ETA never blocks the rest of the route from scoring.
        targetTime: segment?.targetTime || segment?.estimated_arrival || startTime,
        weather: segment?.weather || weather,
        deadline,
        db,
      });
      out.push(featureRow);
    } catch (error) {
      logOccurrence("trained_route_feature_skip", {
        roadSegmentId: segmentId,
        message: error?.message,
        status: error?.status,
      });
    }
  }
  return out;
}

function buildTrainedPredictionFailure(error, fallback) {
  const status = error?.response?.status;
  const message =
    error?.response?.data?.error || error?.message || "Occurrence model unavailable";
  return {
    available: false,
    httpStatus: status || 502,
    message,
    fallback,
  };
}

async function predictOccurrenceForSegments({
  featureRows,
  deadline = null,
} = {}) {
  if (!Array.isArray(featureRows) || featureRows.length === 0) {
    return {
      available: true,
      model_version: TRAINED_MODEL_NAME,
      predictions: [],
      probability_interpretation: "relative_operational_risk",
      decision_threshold: TRAINED_MODEL_DECISION_THRESHOLD,
      risk_level_thresholds: TRAINED_MODEL_RISK_THRESHOLDS,
      probability_warning: TRAINED_MODEL_PROBABILITY_WARNING,
    };
  }

  let response;
  try {
    response = await postToFlask(
      TRAINED_MODEL_FLASK_PREDICT,
      { rows: featureRows.map((row) => row.features) },
      deadline,
    );
  } catch (error) {
    return buildTrainedPredictionFailure(error);
  }

  const data = response?.data || {};
  const rawPredictions = Array.isArray(data.predictions) ? data.predictions : [];
  const predictions = featureRows.map((row, index) => {
    const prediction = rawPredictions[index] || {};
    const calibrated = trainedNumericOrNull(prediction.calibrated_probability);
    const missingRequired = Array.isArray(prediction.missing_required_features)
      ? prediction.missing_required_features
      : [];
    if (missingRequired.length > 0) {
      logOccurrence("trained_model_missing_required_features", {
        roadSegmentId: row.roadSegmentId,
        missing: missingRequired,
      });
    }
    return {
      road_segment_id: row.roadSegmentId,
      time_bucket: row.timeBucket instanceof Date
        ? row.timeBucket.toISOString()
        : row.timeBucket,
      risk_score: trainedNumericOrNull(prediction.risk_score),
      calibrated_probability: calibrated,
      risk_level: calibrated == null
        ? "unknown"
        : prediction.risk_level || trainedRiskLevelFromProbability(calibrated),
      confidence_score: trainedNumericOrNull(prediction.confidence_score),
      top_factors: Array.isArray(prediction.top_factors) ? prediction.top_factors : [],
      explanation_source: prediction.explanation_source || null,
      missing_required_features: missingRequired,
      model_version: data.model_version || TRAINED_MODEL_NAME,
      meta: row.meta || null,
    };
  });

  return {
    available: true,
    model_version: data.model_version || TRAINED_MODEL_NAME,
    selected_model: data.selected_model || TRAINED_MODEL_ALGORITHM,
    calibration_method: data.calibration_method || TRAINED_MODEL_CALIBRATION,
    decision_threshold: data.decision_threshold ?? TRAINED_MODEL_DECISION_THRESHOLD,
    risk_level_thresholds: data.risk_level_thresholds || TRAINED_MODEL_RISK_THRESHOLDS,
    probability_interpretation: "relative_operational_risk",
    probability_warning: TRAINED_MODEL_PROBABILITY_WARNING,
    feature_list: data.feature_list || null,
    predictions,
  };
}

function logTrainedModelSuccess({ segmentCount, modelVersion }) {
  logOccurrence("trained_model_success", {
    modelVersion: modelVersion || TRAINED_MODEL_NAME,
    segmentCount,
  });
}

function applyDriverBehaviorToPrediction(modelPrediction, driverProfile) {
  const driver = driverMultiplierFromProfile(driverProfile);
  const calibrated = trainedNumericOrNull(modelPrediction?.calibrated_probability);

  if (!driver.hasProfile || calibrated == null) {
    const sameRiskLevel = calibrated == null
      ? modelPrediction?.risk_level || "low"
      : trainedRiskLevelFromProbability(calibrated);
    return {
      personalized: {
        ...modelPrediction,
        risk_level: sameRiskLevel,
        driver_behavior_applied: false,
        driver_risk_score: driverProfile?.latestRiskScore ?? null,
        driver_result_label: driverProfile?.latestResultLabel ?? null,
        driver_result_title: driverProfile?.latestResultTitle ?? null,
        behavior_multiplier: 1,
        behavior_delta: 0,
        probability_warning: TRAINED_MODEL_PROBABILITY_WARNING,
        explanation: {
          base_model:
            "The model estimates the road/time risk from road, weather, time, and historical accident patterns.",
          driver_effect:
            "No driver quiz profile was available, so the personalized score is the same as the model score.",
        },
      },
      driver,
    };
  }

  // Spec formula: clamp(1 + (driver_risk_score - 50)/100, 0.70, 1.50).
  const driverScore = Number(driverProfile.latestRiskScore);
  const rawMultiplier = 1 + (driverScore - 50) / 100;
  const behaviorMultiplier = Math.min(1.5, Math.max(0.7, rawMultiplier));
  const personalizedProbability = Math.min(
    1,
    Math.max(0, calibrated * behaviorMultiplier),
  );
  const behaviorDelta = personalizedProbability - calibrated;
  const personalizedLevel = trainedRiskLevelFromProbability(personalizedProbability);

  let driverEffectText;
  if (behaviorMultiplier > 1.0001) {
    driverEffectText = `The personalized risk is higher because the latest driver quiz (score ${Math.round(driverScore)}/100) indicates riskier driving behavior.`;
  } else if (behaviorMultiplier < 0.9999) {
    driverEffectText = `The personalized risk is lower because the latest driver quiz (score ${Math.round(driverScore)}/100) indicates safer driving behavior.`;
  } else {
    driverEffectText =
      "The driver quiz score is neutral, so the personalized risk matches the model score.";
  }

  return {
    personalized: {
      ...modelPrediction,
      calibrated_probability: Number(personalizedProbability.toFixed(6)),
      risk_score: trainedNumericOrNull(modelPrediction.risk_score),
      risk_level: personalizedLevel,
      driver_behavior_applied: true,
      driver_risk_score: driverScore,
      driver_result_label: driverProfile.latestResultLabel ?? null,
      driver_result_title: driverProfile.latestResultTitle ?? null,
      behavior_multiplier: Number(behaviorMultiplier.toFixed(4)),
      behavior_delta: Number(behaviorDelta.toFixed(6)),
      probability_warning: TRAINED_MODEL_PROBABILITY_WARNING,
      explanation: {
        base_model:
          "The model estimates the road/time risk from road, weather, time, and historical accident patterns.",
        driver_effect: driverEffectText,
      },
    },
    driver,
  };
}

async function predictPersonalizedOccurrenceForUser({
  userId = null,
  segmentIds,
  targetTime,
  weather = null,
  deadline = null,
  db = pool,
} = {}) {
  const ids = (Array.isArray(segmentIds) ? segmentIds : [segmentIds])
    .map((id) => parsePositiveBigint(id))
    .filter(Boolean);
  if (ids.length === 0) {
    const error = new Error("At least one valid roadSegmentId is required");
    error.status = 400;
    throw error;
  }

  const truncatedTime = coerceTimeBucket(targetTime);
  const client = db === pool ? await db.connect() : db;
  const useTransaction = db === pool;
  try {
    const driverProfile = userId ? await loadDriverProfile(client, userId) : null;
    const featureRows = [];
    for (const id of ids) {
      try {
        const row = await buildOccurrenceFeaturesForSegment({
          roadSegmentId: id,
          targetTime: truncatedTime,
          weather,
          deadline,
          db: client,
        });
        featureRows.push(row);
      } catch (error) {
        logOccurrence("trained_personalized_skip_segment", {
          roadSegmentId: id,
          message: error?.message,
          status: error?.status,
        });
      }
    }

    const trained = await predictOccurrenceForSegments({ featureRows, deadline });
    if (!trained.available) {
      return { available: false, error: trained, segments: [] };
    }
    logTrainedModelSuccess({
      segmentCount: trained.predictions?.length || 0,
      modelVersion: trained.model_version,
    });

    const segments = trained.predictions.map((modelPrediction) => {
      const { personalized, driver } = applyDriverBehaviorToPrediction(
        modelPrediction,
        driverProfile,
      );
      const modelOnly = {
        road_segment_id: modelPrediction.road_segment_id,
        time_bucket: modelPrediction.time_bucket,
        risk_score: modelPrediction.risk_score,
        calibrated_probability: modelPrediction.calibrated_probability,
        risk_level: modelPrediction.risk_level,
        confidence_score: modelPrediction.confidence_score,
        model_version: modelPrediction.model_version,
        top_factors: modelPrediction.top_factors,
        explanation_source: modelPrediction.explanation_source,
        probability_warning: TRAINED_MODEL_PROBABILITY_WARNING,
      };
      return {
        road_segment_id: modelPrediction.road_segment_id,
        modelOnly,
        personalized,
        driver_meta: {
          has_driver_profile: driver.hasProfile,
          latest_risk_score: driverProfile?.latestRiskScore ?? null,
          latest_result_label: driverProfile?.latestResultLabel ?? null,
          latest_result_title: driverProfile?.latestResultTitle ?? null,
          last_completed_at: driverProfile?.lastCompletedAt || null,
        },
      };
    });

    return {
      available: true,
      model_version: trained.model_version,
      selected_model: trained.selected_model,
      calibration_method: trained.calibration_method,
      decision_threshold: trained.decision_threshold,
      risk_level_thresholds: trained.risk_level_thresholds,
      probability_interpretation: trained.probability_interpretation,
      probability_warning: trained.probability_warning,
      driver_profile: driverProfile
        ? {
            latest_risk_score: driverProfile.latestRiskScore,
            latest_result_label: driverProfile.latestResultLabel,
            latest_result_title: driverProfile.latestResultTitle,
            last_completed_at: driverProfile.lastCompletedAt,
          }
        : null,
      segments,
    };
  } finally {
    if (useTransaction) client.release();
  }
}

async function ensureTrainedModelVersionId(client) {
  const select = await client.query(
    `
      select id
      from ml.model_versions
      where model_name = $1
        and target_type = $2
      order by created_at desc
      limit 1
    `,
    [TRAINED_MODEL_NAME, MODEL_TARGET_TYPE],
  );
  if (select.rowCount > 0) return select.rows[0].id;
  const insert = await client.query(
    `
      insert into ml.model_versions (
        model_name, target_type, algorithm, feature_set_name,
        data_source, calibration_method, artifact_path, status,
        is_active, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, 'deployed', true, now())
      returning id
    `,
    [
      TRAINED_MODEL_NAME,
      MODEL_TARGET_TYPE,
      TRAINED_MODEL_ALGORITHM,
      TRAINED_MODEL_FEATURE_SET,
      TRAINED_MODEL_DATA_SOURCE,
      TRAINED_MODEL_CALIBRATION,
      TRAINED_MODEL_ARTIFACT_PATH,
    ],
  );
  return insert.rows[0].id;
}

async function persistTrainedGlobalPrediction(client, {
  roadSegmentId,
  timeBucket,
  modelVersionId,
  calibratedProbability,
  rawRiskScore,
  riskLevel,
  confidenceScore,
}) {
  // ml.segment_time_features is optional metadata. If the table is missing
  // (or the lookup fails for any other reason) we still want to persist the
  // prediction — feature_id is just a join key. Wrap the lookup in a
  // SAVEPOINT so a "relation does not exist" doesn't poison the outer txn.
  let featureId = null;
  try {
    await client.query("savepoint trained_feature_lookup");
    const featureRow = await client.query(
      `
        select id
        from ml.segment_time_features
        where road_segment_id = $1
          and time_bucket = date_trunc('minute', $2::timestamptz)
        order by id desc
        limit 1
      `,
      [roadSegmentId, new Date(timeBucket).toISOString()],
    );
    featureId = featureRow.rows[0]?.id || null;
    await client.query("release savepoint trained_feature_lookup");
  } catch (featureError) {
    await client.query("rollback to savepoint trained_feature_lookup").catch(() => {});
    await client.query("release savepoint trained_feature_lookup").catch(() => {});
    logOccurrence("trained_feature_lookup_skipped", {
      roadSegmentId,
      message: featureError?.message,
      code: featureError?.code,
    });
  }
  const insert = await client.query(
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
        $1, $2, $3,
        date_trunc('minute', $4::timestamptz),
        $5, $6, $7, $8, false, 'live', 'active', $9, now()
      )
      on conflict (road_segment_id, time_bucket, model_version_id)
      do update set
        feature_id = excluded.feature_id,
        risk_score = excluded.risk_score,
        risk_level = excluded.risk_level,
        calibrated_probability = excluded.calibrated_probability,
        confidence_score = excluded.confidence_score,
        drift_flag = false,
        source_type = excluded.source_type,
        status = excluded.status,
        warning_message = excluded.warning_message,
        predicted_at = now()
      returning id
    `,
    [
      roadSegmentId,
      modelVersionId,
      featureId,
      new Date(timeBucket).toISOString(),
      rawRiskScore == null ? null : Number(rawRiskScore),
      riskLevel || "low",
      calibratedProbability == null ? null : Number(calibratedProbability),
      confidenceScore == null ? null : Number(confidenceScore),
      TRAINED_MODEL_PROBABILITY_WARNING,
    ],
  );
  return insert.rows[0]?.id || null;
}

async function persistTrainedPersonalizedPrediction(client, {
  userId,
  roadSegmentId,
  timeBucket,
  globalPredictionId,
  modelOnly,
  personalized,
  driverProfile,
}) {
  if (!userId) return null;
  const explanation = {
    model_version: TRAINED_MODEL_NAME,
    warning: TRAINED_MODEL_PROBABILITY_WARNING,
    modelOnly: {
      calibrated_probability: modelOnly?.calibrated_probability ?? null,
      risk_level: modelOnly?.risk_level ?? null,
      risk_score: modelOnly?.risk_score ?? null,
    },
    personalized: {
      calibrated_probability: personalized?.calibrated_probability ?? null,
      risk_level: personalized?.risk_level ?? null,
      behavior_multiplier: personalized?.behavior_multiplier ?? 1,
      behavior_delta: personalized?.behavior_delta ?? 0,
      driver_behavior_applied: personalized?.driver_behavior_applied ?? false,
    },
    explanation_text: personalized?.explanation || null,
    top_factors: modelOnly?.top_factors || [],
  };

  const result = await client.query(
    `
      insert into app.user_occurrence_risk_predictions (
        user_id,
        road_segment_id,
        global_prediction_id,
        time_bucket,
        global_occurrence_score,
        personalized_occurrence_score,
        global_risk_level,
        personalized_risk_level,
        driver_risk_score,
        driver_result_label,
        driver_category_scores,
        explanation,
        model_version,
        created_at
      )
      values (
        $1, $2, $3,
        date_trunc('minute', $4::timestamptz),
        $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, now()
      )
      on conflict (user_id, road_segment_id, time_bucket, model_version)
      do update set
        global_prediction_id = excluded.global_prediction_id,
        global_occurrence_score = excluded.global_occurrence_score,
        personalized_occurrence_score = excluded.personalized_occurrence_score,
        global_risk_level = excluded.global_risk_level,
        personalized_risk_level = excluded.personalized_risk_level,
        driver_risk_score = excluded.driver_risk_score,
        driver_result_label = excluded.driver_result_label,
        driver_category_scores = excluded.driver_category_scores,
        explanation = excluded.explanation,
        created_at = now()
      returning id
    `,
    [
      userId,
      roadSegmentId,
      globalPredictionId,
      new Date(timeBucket).toISOString(),
      modelOnly?.calibrated_probability ?? null,
      personalized?.calibrated_probability ?? null,
      modelOnly?.risk_level || "low",
      personalized?.risk_level || "low",
      driverProfile?.latestRiskScore ?? null,
      driverProfile?.latestResultLabel ?? null,
      JSON.stringify(driverProfile?.categoryScores || {}),
      JSON.stringify(explanation),
      TRAINED_MODEL_NAME,
    ],
  );
  return result.rows[0]?.id || null;
}

async function predictTrainedOccurrenceRiskForSegment({
  userId = null,
  roadSegmentId,
  timeBucket,
  weather = null,
  persist = true,
  deadline = null,
  db = pool,
} = {}) {
  const segmentIdText = parsePositiveBigint(roadSegmentId);
  if (!segmentIdText) {
    const error = new Error("roadSegmentId must be a positive integer");
    error.status = 400;
    throw error;
  }
  const truncatedTime = coerceTimeBucket(timeBucket);

  const useTransaction = persist && db === pool;
  const client = useTransaction ? await db.connect() : db === pool ? await db.connect() : db;
  try {
    if (useTransaction) await client.query("begin");

    const personalized = await predictPersonalizedOccurrenceForUser({
      userId,
      segmentIds: [segmentIdText],
      targetTime: truncatedTime,
      weather,
      deadline,
      db: client,
    });

    if (!personalized.available) {
      const error = new Error(personalized.error?.message || "Occurrence model unavailable");
      error.status = personalized.error?.httpStatus || 502;
      throw error;
    }

    const segment = personalized.segments[0];
    if (!segment) {
      const error = new Error("Trained occurrence model returned no predictions");
      error.status = 502;
      throw error;
    }

    let modelVersionId = null;
    let globalPredictionId = null;
    let personalizedRowId = null;
    let persistedSuccessfully = false;
    if (persist) {
      logOccurrence("trained_model_persisting", {
        roadSegmentId: segmentIdText,
        modelVersion: TRAINED_MODEL_NAME,
        calibratedProbability: segment.modelOnly?.calibrated_probability,
        riskLevel: segment.modelOnly?.risk_level,
        userId: userId || null,
      });
      // Wrap the whole persistence block in a SAVEPOINT. Without this, the
      // first failing INSERT would put the outer transaction into an aborted
      // state and the subsequent COMMIT would throw, causing the caller to
      // think the trained-model run failed and fall back to rule_fusion —
      // even though Flask already returned 200 with a valid prediction.
      const useSavepoint = useTransaction;
      try {
        if (useSavepoint) await client.query("savepoint trained_persist");
        modelVersionId = await ensureTrainedModelVersionId(client);
        globalPredictionId = await persistTrainedGlobalPrediction(client, {
          roadSegmentId: segmentIdText,
          timeBucket: truncatedTime,
          modelVersionId,
          calibratedProbability: segment.modelOnly.calibrated_probability,
          rawRiskScore: segment.modelOnly.risk_score,
          riskLevel: segment.modelOnly.risk_level,
          confidenceScore: segment.modelOnly.confidence_score,
        });
        if (userId) {
          const driverProfile = await loadDriverProfile(client, userId);
          personalizedRowId = await persistTrainedPersonalizedPrediction(client, {
            userId,
            roadSegmentId: segmentIdText,
            timeBucket: truncatedTime,
            globalPredictionId,
            modelOnly: segment.modelOnly,
            personalized: segment.personalized,
            driverProfile,
          });
        }
        if (useSavepoint) await client.query("release savepoint trained_persist");
        persistedSuccessfully = true;
        logOccurrence("trained_model_persisted", {
          roadSegmentId: segmentIdText,
          modelVersion: TRAINED_MODEL_NAME,
          modelVersionId,
          globalPredictionId,
          personalizedPredictionId: personalizedRowId,
          calibratedProbability: segment.modelOnly?.calibrated_probability,
          riskLevel: segment.modelOnly?.risk_level,
        });
      } catch (persistError) {
        // Roll the persistence inserts back inside the savepoint so the outer
        // transaction stays committable. Without this, COMMIT below would
        // throw "current transaction is aborted" and the caller would fall
        // back to rule_fusion even though Flask succeeded.
        if (useSavepoint) {
          await client.query("rollback to savepoint trained_persist").catch(() => {});
          await client.query("release savepoint trained_persist").catch(() => {});
        }
        logOccurrence("trained_persist_failed", {
          roadSegmentId: segmentIdText,
          modelVersion: TRAINED_MODEL_NAME,
          message: persistError?.message,
          code: persistError?.code,
        });
      }
    }

    if (useTransaction) await client.query("commit");

    // Explicit semantic wrappers — the spec asks for clearly-named blocks the
    // UI can render without re-interpreting field names. These coexist with
    // `modelOnly` / `personalized` (kept for backwards compat).
    const occurrenceRiskBlock = {
      score: segment.modelOnly?.risk_score ?? null,
      calibratedProbability: segment.modelOnly?.calibrated_probability ?? null,
      riskLevel: segment.modelOnly?.risk_level ?? null,
      confidence: segment.modelOnly?.confidence_score ?? null,
      modelVersion: personalized.model_version || TRAINED_MODEL_NAME,
      source: "trained_model",
      topFactors: Array.isArray(segment.modelOnly?.top_factors)
        ? segment.modelOnly.top_factors
        : [],
    };
    // personalizedRisk is only meaningful when the driver multiplier actually
    // got applied — when no quiz profile exists, the personalized number is
    // identical to occurrenceRisk and would just clutter the response.
    const personalizedRiskBlock = segment.personalized?.driver_behavior_applied
      ? {
          score: segment.personalized?.calibrated_probability ?? null,
          driverMultiplier: segment.personalized?.behavior_multiplier ?? null,
          riskLevel: segment.personalized?.risk_level ?? null,
          source: "occurrence_beta_v1_adjusted_by_driver_profile",
          driverRiskScore: segment.personalized?.driver_risk_score ?? null,
          driverResultLabel: segment.personalized?.driver_result_label ?? null,
          behaviorDelta: segment.personalized?.behavior_delta ?? null,
        }
      : null;

    return {
      road_segment_id: segmentIdText,
      time_bucket: truncatedTime.toISOString(),
      scoring_source: "trained_model",
      model_version: personalized.model_version,
      selected_model: personalized.selected_model,
      calibration_method: personalized.calibration_method,
      decision_threshold: personalized.decision_threshold,
      probability_interpretation: personalized.probability_interpretation,
      probability_warning: personalized.probability_warning,
      occurrenceRisk: occurrenceRiskBlock,
      personalizedRisk: personalizedRiskBlock,
      modelOnly: segment.modelOnly,
      personalized: segment.personalized,
      driver_meta: segment.driver_meta,
      persisted: {
        model_version: TRAINED_MODEL_NAME,
        global_prediction_id: globalPredictionId,
        personalized_prediction_id: personalizedRowId,
        successful: persistedSuccessfully,
      },
    };
  } catch (error) {
    if (useTransaction) await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    if (useTransaction || db === pool) client.release();
  }
}

function canViewOccurrenceRisk(requestUser, targetUserId) {
  if (!requestUser || !targetUserId) return false;
  const requesterId = requestUser.userId || requestUser.id;
  if (requesterId && String(requesterId) === String(targetUserId)) return true;
  const roles = Array.isArray(requestUser.roles) ? requestUser.roles : [];
  if (roles.includes("admin")) return true;
  const policeRoles = ["police", "police_officer", "police officer"];
  if (roles.some((role) => policeRoles.includes(String(role).toLowerCase()))) return true;
  return false;
}

// Public entry point: try the trained model first, fall back to rule-fusion if
// Flask is unreachable / the artifact is missing. Returns a response shape with
// both `modelOnly` and `personalized` plus a clear `scoring_source` label so
// callers/UI can tell which path produced the score.
async function predictOccurrenceRisk({
  userId = null,
  roadSegmentId,
  timeBucket,
  weather = null,
  roadFeaturesOverride = null,
  contextOverride = null,
  persist = true,
  deadline = null,
  db = pool,
} = {}) {
  try {
    const trained = await predictTrainedOccurrenceRiskForSegment({
      userId,
      roadSegmentId,
      timeBucket,
      weather,
      persist,
      deadline,
      db,
    });
    return trained;
  } catch (error) {
    const status = Number(error?.status);
    // 4xx errors (bad input, missing segment) should NOT silently fall back —
    // the caller's payload is wrong and rule-fusion would mask that.
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      throw error;
    }
    logOccurrence("trained_model_fallback_to_rule_fusion", {
      roadSegmentId,
      message: error?.message,
      status: error?.status,
    });
  }

  const ruleFusion = await predictOccurrenceRiskForSegment({
    userId,
    roadSegmentId,
    timeBucket,
    weather,
    roadFeaturesOverride,
    contextOverride,
    persist,
    db,
  });

  // Adapt rule-fusion shape to the modelOnly/personalized contract so the
  // controller and UI can stay schema-agnostic about which scoring source
  // ran. Note: rule-fusion calibrated_probability is intentionally null —
  // the rule-fusion score is not a calibrated probability.
  const modelOnly = {
    road_segment_id: ruleFusion.road_segment_id,
    time_bucket: ruleFusion.time_bucket,
    risk_score: ruleFusion.global_occurrence_score,
    calibrated_probability: null,
    risk_level: ruleFusion.global_risk_level,
    confidence_score: ruleFusion.confidence_score,
    model_version: ruleFusion.persisted?.model_version || MODEL_VERSION_TAG,
    top_factors: [],
    explanation_source: "rule_fusion",
    probability_warning: PROTOTYPE_WARNING,
  };
  const personalized = {
    ...modelOnly,
    risk_score: ruleFusion.personalized_occurrence_score,
    risk_level: ruleFusion.personalized_risk_level,
    driver_behavior_applied: Boolean(ruleFusion.driver_behavior?.has_driver_profile),
    driver_risk_score: ruleFusion.driver_behavior?.latest_risk_score ?? null,
    driver_result_label: ruleFusion.driver_behavior?.latest_result_label ?? null,
    behavior_multiplier: ruleFusion.driver_behavior?.multiplier ?? 1,
    behavior_delta:
      (ruleFusion.personalized_occurrence_score || 0)
      - (ruleFusion.global_occurrence_score || 0),
    explanation: {
      base_model:
        "Rule-fusion fallback score combining road, weather, time, and context heuristics.",
      driver_effect: ruleFusion.driver_behavior?.reason || "No driver profile applied.",
    },
  };
  // Mirror the trained-model semantic wrappers so the frontend can read the
  // same fields no matter which scoring path actually ran. For rule-fusion,
  // `calibratedProbability` is null on purpose — the score is heuristic, not
  // a calibrated probability.
  const occurrenceRiskBlock = {
    score: ruleFusion.global_occurrence_score ?? null,
    calibratedProbability: null,
    riskLevel: ruleFusion.global_risk_level ?? null,
    confidence: ruleFusion.confidence_score ?? null,
    modelVersion: ruleFusion.persisted?.model_version || MODEL_VERSION_TAG,
    source: "rule_fusion",
    topFactors: [],
  };
  const personalizedRiskBlock = ruleFusion.driver_behavior?.has_driver_profile
    ? {
        score: ruleFusion.personalized_occurrence_score ?? null,
        driverMultiplier: ruleFusion.driver_behavior?.multiplier ?? null,
        riskLevel: ruleFusion.personalized_risk_level ?? null,
        source: "rule_fusion_adjusted_by_driver_profile",
        driverRiskScore: ruleFusion.driver_behavior?.latest_risk_score ?? null,
        driverResultLabel: ruleFusion.driver_behavior?.latest_result_label ?? null,
        behaviorDelta:
          (ruleFusion.personalized_occurrence_score || 0)
          - (ruleFusion.global_occurrence_score || 0),
      }
    : null;
  return {
    road_segment_id: ruleFusion.road_segment_id,
    time_bucket: ruleFusion.time_bucket,
    scoring_source: "rule_fusion",
    model_version: ruleFusion.persisted?.model_version || MODEL_VERSION_TAG,
    probability_warning: PROTOTYPE_WARNING,
    occurrenceRisk: occurrenceRiskBlock,
    personalizedRisk: personalizedRiskBlock,
    modelOnly,
    personalized,
    driver_meta: {
      has_driver_profile: Boolean(ruleFusion.driver_behavior?.has_driver_profile),
      latest_risk_score: ruleFusion.driver_behavior?.latest_risk_score ?? null,
      latest_result_label: ruleFusion.driver_behavior?.latest_result_label ?? null,
      latest_result_title: null,
      last_completed_at: null,
    },
    rule_fusion: ruleFusion,
    persisted: ruleFusion.persisted || null,
  };
}

module.exports = {
  MODEL_NAME,
  MODEL_VERSION_TAG,
  PROTOTYPE_WARNING,
  TRAINED_MODEL_NAME,
  TRAINED_MODEL_RISK_THRESHOLDS,
  TRAINED_MODEL_PROBABILITY_WARNING,
  predictOccurrenceRisk,
  predictOccurrenceRiskForSegment,
  predictTrainedOccurrenceRiskForSegment,
  predictPersonalizedOccurrenceForUser,
  predictOccurrenceForSegments,
  buildOccurrenceFeaturesForSegment,
  buildOccurrenceFeaturesForRoute,
  calculateGlobalOccurrenceScore,
  driverMultiplierFromProfile,
  riskLevelFromScore,
  trainedRiskLevelFromProbability,
  applyDriverBehaviorToPrediction,
  mapWeatherToOccurrenceFeatures,
  calculateDewPointC,
  listUserOccurrenceRiskHistory,
  canViewOccurrenceRisk,
};
