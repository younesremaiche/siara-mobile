#!/usr/bin/env node
/**
 * Manual test cases for the SIARA occurrence-risk prototype.
 * These tests exercise the pure rule-fusion / multiplier helpers
 * (no DB writes), so they can run without the Flask service or PostGIS data.
 *
 * Run:
 *     node scripts/testOccurrenceRisk.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const {
  calculateGlobalOccurrenceScore,
  driverMultiplierFromProfile,
  riskLevelFromScore,
  trainedRiskLevelFromProbability,
  applyDriverBehaviorToPrediction,
  mapWeatherToOccurrenceFeatures,
  calculateDewPointC,
  buildOccurrenceFeaturesForSegment,
  TRAINED_MODEL_RISK_THRESHOLDS,
  TRAINED_MODEL_PROBABILITY_WARNING,
  canViewOccurrenceRisk,
} = require("../services/occurrenceRiskService");
const pool = require("../db");
const fs = require("fs");
const axios = require("axios");

const ARTIFACT_DIR = path.join(
  __dirname,
  "..",
  "occurrence-model",
  "occurrence_betav1_final",
);
const FLASK_BASE_URL =
  process.env.ML_SERVICE_BASE_URL || "http://localhost:8000";
const NODE_BASE_URL =
  process.env.API_BASE_URL || `http://localhost:${process.env.PORT_NUM || 5000}`;

function colour(text, code) {
  if (!process.stdout.isTTY) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

let passed = 0;
let failed = 0;
function assert(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`${colour("PASS", 32)} ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`${colour("FAIL", 31)} ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function clamp(value) {
  return Math.max(0.01, Math.min(0.99, value));
}

// --- Case 1: normal weather, no reports/alerts/history, no driver quiz ----
const case1 = calculateGlobalOccurrenceScore({
  timeBucket: new Date("2026-04-29T11:00:00Z"),
  weather: { visibility_km: 12, precipitation_mm: 0, wind_kmh: 8 },
  roadFeatures: { road_class: "residential" },
  context: {},
});
const case1Personalized = clamp(case1.score * driverMultiplierFromProfile(null).multiplier);
assert(
  "Case 1 — quiet baseline keeps risk in 'low' band",
  riskLevelFromScore(case1.score) === "low",
  `score=${case1.score.toFixed(4)}`,
);
assert(
  "Case 1 — no quiz means personalized equals global",
  Math.abs(case1Personalized - case1.score) < 0.0001,
  `personalized=${case1Personalized.toFixed(4)}`,
);

// --- Case 2: bad weather, junction, recent verified reports ---------------
const case2 = calculateGlobalOccurrenceScore({
  timeBucket: new Date("2026-04-29T18:00:00Z"),
  weather: { visibility_km: 0.6, precipitation_mm: 8, wind_kmh: 50 },
  roadFeatures: { road_class: "primary", junction_flag: true, urban_flag: true, maxspeed: 90 },
  context: {
    reports_2h: 2,
    reports_24h: 4,
    verified_reports_24h: 2,
    active_alerts: 1,
    accidents_30d: 3,
  },
});
assert(
  "Case 2 — bad weather + junction + reports raises risk above moderate",
  case2.score > case1.score && riskLevelFromScore(case2.score) !== "low",
  `score=${case2.score.toFixed(4)} level=${riskLevelFromScore(case2.score)}`,
);

// --- Case 3: same scenario, user with high driver-quiz score --------------
const highDriverProfile = { latestRiskScore: 80, latestResultLabel: "high_risk" };
const highDriver = driverMultiplierFromProfile(highDriverProfile);
const case3Personalized = clamp(case2.score * highDriver.multiplier);
assert(
  "Case 3 — high-risk driver multiplier > 1.0",
  highDriver.multiplier > 1.0,
  `multiplier=${highDriver.multiplier}`,
);
assert(
  "Case 3 — personalized >= global (clamped at 0.99)",
  case3Personalized + 1e-6 >= case2.score || case3Personalized === 0.99,
  `personalized=${case3Personalized.toFixed(4)} global=${case2.score.toFixed(4)}`,
);

// --- Case 4: same scenario, user with low driver-quiz score --------------
const lowDriverProfile = { latestRiskScore: 10, latestResultLabel: "low_risk" };
const lowDriver = driverMultiplierFromProfile(lowDriverProfile);
const case4Personalized = clamp(case2.score * lowDriver.multiplier);
assert(
  "Case 4 — low-risk driver multiplier < 1.0",
  lowDriver.multiplier < 1.0,
  `multiplier=${lowDriver.multiplier}`,
);
assert(
  "Case 4 — personalized < global (slightly lower)",
  case4Personalized < case2.score,
  `personalized=${case4Personalized.toFixed(4)} global=${case2.score.toFixed(4)}`,
);

// --- Cases 5/6/7: access control -----------------------------------------
const owner = { userId: "u1", roles: ["citizen"] };
const otherCitizen = { userId: "u2", roles: ["citizen"] };
const policeUser = { userId: "p1", roles: ["police"] };
const policeOfficerUser = { userId: "p2", roles: ["police_officer"] };
const adminUser = { userId: "a1", roles: ["admin"] };

assert(
  "Case 5 — normal user blocked from another user's occurrence risk",
  canViewOccurrenceRisk(otherCitizen, "u1") === false,
);
assert(
  "Case 5b — owner can view their own occurrence risk",
  canViewOccurrenceRisk(owner, "u1") === true,
);
assert(
  "Case 6 — police can view a user's occurrence risk",
  canViewOccurrenceRisk(policeUser, "u1") === true && canViewOccurrenceRisk(policeOfficerUser, "u1") === true,
);
assert(
  "Case 7 — admin can view a user's occurrence risk",
  canViewOccurrenceRisk(adminUser, "u1") === true,
);

// ─── Trained occurrence_beta_v1 helpers ────────────────────────────────────
// These exercise the JS-side glue without needing Flask up. The optional
// network-dependent tests below skip themselves when --skip-network is passed
// or when the service is unreachable.

function loadInferenceSampleRows() {
  const payload = JSON.parse(
    fs.readFileSync(path.join(ARTIFACT_DIR, "inference_sample.json"), "utf8")
      .replace(/\bNaN\b/g, "null"),
  );
  return payload.example_request_rows || [];
}

const trainedSampleRows = loadInferenceSampleRows();
assert(
  "trained_beta · inference_sample.json contains example rows",
  Array.isArray(trainedSampleRows) && trainedSampleRows.length > 0,
  `rows=${trainedSampleRows.length}`,
);

assert(
  "trained_beta · risk thresholds match spec (low/moderate/high/critical)",
  TRAINED_MODEL_RISK_THRESHOLDS.moderate === 0.05
    && TRAINED_MODEL_RISK_THRESHOLDS.high === 0.2
    && TRAINED_MODEL_RISK_THRESHOLDS.critical === 0.5,
);

assert(
  "trained_beta · level mapping 0.07 → moderate, 0.25 → high, 0.6 → critical",
  trainedRiskLevelFromProbability(0.07) === "moderate"
    && trainedRiskLevelFromProbability(0.25) === "high"
    && trainedRiskLevelFromProbability(0.6) === "critical"
    && trainedRiskLevelFromProbability(0.01) === "low",
);

const trainedFakeModelOnly = {
  road_segment_id: "1",
  calibrated_probability: 0.12,
  risk_score: 0.4,
  risk_level: "moderate",
  confidence_score: 0.6,
  model_version: "occurrence_beta_v1",
  top_factors: [],
  explanation_source: "global_importance_fallback",
};

// Personalized scenario A: user with a risky quiz profile.
const personalizedRisky = applyDriverBehaviorToPrediction(trainedFakeModelOnly, {
  latestRiskScore: 80,
  latestResultLabel: "risky",
  latestResultTitle: "Risky driver",
});
assert(
  "trained_beta · risky driver (80) bumps probability above model",
  personalizedRisky.personalized.driver_behavior_applied === true
    && personalizedRisky.personalized.calibrated_probability > trainedFakeModelOnly.calibrated_probability
    && personalizedRisky.personalized.behavior_multiplier > 1,
  `multiplier=${personalizedRisky.personalized.behavior_multiplier} prob=${personalizedRisky.personalized.calibrated_probability}`,
);
assert(
  "trained_beta · risky driver explanation references higher risk",
  /higher/.test(personalizedRisky.personalized.explanation.driver_effect),
);

// Personalized scenario B: user with no quiz profile → personalized == modelOnly.
const personalizedNoQuiz = applyDriverBehaviorToPrediction(trainedFakeModelOnly, null);
assert(
  "trained_beta · missing driver profile preserves model probability",
  personalizedNoQuiz.personalized.driver_behavior_applied === false
    && Math.abs(personalizedNoQuiz.personalized.calibrated_probability - trainedFakeModelOnly.calibrated_probability) < 1e-9
    && personalizedNoQuiz.personalized.behavior_multiplier === 1,
);

// Personalized scenario C: low-risk quiz (20) → multiplier clamped at 0.70.
const personalizedSafe = applyDriverBehaviorToPrediction(trainedFakeModelOnly, {
  latestRiskScore: 20,
  latestResultLabel: "safe",
});
assert(
  "trained_beta · safe driver multiplier clamped near 0.70 floor",
  Math.abs(personalizedSafe.personalized.behavior_multiplier - 0.7) < 1e-6
    && personalizedSafe.personalized.calibrated_probability < trainedFakeModelOnly.calibrated_probability,
  `multiplier=${personalizedSafe.personalized.behavior_multiplier}`,
);

assert(
  "trained_beta · probability warning is exposed for personalized result",
  personalizedSafe.personalized.probability_warning === TRAINED_MODEL_PROBABILITY_WARNING,
);

// ─── Weather → occurrence feature mapping ──────────────────────────────────

const ukWeatherUi = {
  // Shape produced by getCurrentWeatherUi() — temp_c, humidity_pct, etc.
  temperature_c: 21.4,
  humidity_pct: 53,
  pressure_hpa: 1019.4,
  wind_kmh: 2.1,
  wind_direction_deg: 31,
  precipitation_mm: 0,
};
const ukFeatures = mapWeatherToOccurrenceFeatures(ukWeatherUi);
assert(
  "weather_map · UI payload → all 7 features non-null",
  ukFeatures.weather_temp === 21.4
    && ukFeatures.weather_rhum === 53
    && ukFeatures.weather_pres === 1019.4
    && ukFeatures.weather_wspd === 2.1
    && ukFeatures.weather_wdir === 31
    && ukFeatures.weather_prcp === 0
    && ukFeatures.weather_dwpt != null,
  JSON.stringify(ukFeatures),
);

const usWeatherRaw = {
  // Shape produced by the danger-zone overlay row (Fahrenheit/inches/mph).
  "Temperature(F)": 70.52,         // 21.4°C
  "Humidity(%)": 53,
  "Pressure(in)": 30.10,           // ≈ 1019.4 hPa
  "Wind_Speed(mph)": 1.305,        // ≈ 2.1 km/h
  winddirection_10m: 31,
  "Precipitation(in)": 0,
};
const usFeatures = mapWeatherToOccurrenceFeatures(usWeatherRaw);
assert(
  "weather_map · Imperial payload → Celsius temp ≈ 21.4",
  Math.abs(usFeatures.weather_temp - 21.4) < 0.05,
  `weather_temp=${usFeatures.weather_temp}`,
);
assert(
  "weather_map · Imperial payload → hPa pressure ≈ 1019.4",
  Math.abs(usFeatures.weather_pres - 1019.4) < 1.0,
  `weather_pres=${usFeatures.weather_pres}`,
);
assert(
  "weather_map · Imperial payload → km/h wind ≈ 2.1",
  Math.abs(usFeatures.weather_wspd - 2.1) < 0.05,
  `weather_wspd=${usFeatures.weather_wspd}`,
);
assert(
  "weather_map · Imperial payload → mm precip = 0",
  usFeatures.weather_prcp === 0,
  `weather_prcp=${usFeatures.weather_prcp}`,
);
assert(
  "weather_map · Imperial payload → dew point computed",
  usFeatures.weather_dwpt != null,
  `weather_dwpt=${usFeatures.weather_dwpt}`,
);

const dewPoint = calculateDewPointC(20, 50);
assert(
  "weather_map · Magnus dew point (20°C, 50% rhum) ≈ 9.3°C",
  dewPoint != null && Math.abs(dewPoint - 9.3) < 0.5,
  `dwpt=${dewPoint}`,
);

const emptyFeatures = mapWeatherToOccurrenceFeatures(null);
assert(
  "weather_map · null payload → all 7 features null",
  Object.values(emptyFeatures).every((value) => value === null),
);

assert(
  "weather_map · payload with only Pressure(in) converts to hPa",
  Math.abs(mapWeatherToOccurrenceFeatures({ "Pressure(in)": 29.92 }).weather_pres - 1013.25) < 0.5,
);

// Optional network-backed tests. Skip cleanly if --skip-network or the
// services are not reachable — keeps `node scripts/testOccurrenceRisk.js`
// usable from a laptop without a running Flask/Node stack.
const skipNetwork = process.argv.includes("--skip-network");
const skipDb = process.argv.includes("--skip-db");

async function tryFlaskOccurrenceStatus() {
  if (skipNetwork) return { skipped: true };
  try {
    const response = await axios.get(
      `${FLASK_BASE_URL}/risk/occurrence/status`,
      { timeout: 5000 },
    );
    return { skipped: false, data: response.data };
  } catch (error) {
    if (error?.code === "ECONNREFUSED") return { skipped: true, reason: error.message };
    return { skipped: false, error };
  }
}

async function tryFlaskOccurrencePredict() {
  if (skipNetwork) return { skipped: true };
  try {
    const response = await axios.post(
      `${FLASK_BASE_URL}/risk/occurrence/predict`,
      { rows: trainedSampleRows },
      { timeout: 8000 },
    );
    return { skipped: false, data: response.data };
  } catch (error) {
    if (error?.code === "ECONNREFUSED" || error?.response?.status === 503) {
      return { skipped: true, reason: error.message };
    }
    return { skipped: false, error };
  }
}

async function tryFlaskOccurrencePredictMissingField() {
  if (skipNetwork) return { skipped: true };
  try {
    // Drop one required column on purpose so we can assert Flask reports it
    // back via missing_required_features instead of throwing 500.
    const truncatedRow = { ...trainedSampleRows[0] };
    delete truncatedRow.weather_temp;
    const response = await axios.post(
      `${FLASK_BASE_URL}/risk/occurrence/predict`,
      { rows: [truncatedRow] },
      { timeout: 8000 },
    );
    return { skipped: false, data: response.data };
  } catch (error) {
    if (error?.code === "ECONNREFUSED" || error?.response?.status === 503) {
      return { skipped: true, reason: error.message };
    }
    return { skipped: false, error };
  }
}

async function tryNodeOccurrencePredict() {
  if (skipNetwork) return { skipped: true };
  try {
    const response = await axios.post(
      `${NODE_BASE_URL}/api/risk/occurrence/predict`,
      { rows: trainedSampleRows },
      { timeout: 8000 },
    );
    return { skipped: false, data: response.data };
  } catch (error) {
    if (error?.code === "ECONNREFUSED") return { skipped: true, reason: error.message };
    return { skipped: false, error };
  }
}

async function tryBuildOneSegmentFeatureRow() {
  if (skipDb || skipNetwork) return { skipped: true };
  try {
    const row = await pool.query(
      "select id from gis.road_segments where geom is not null order by id limit 1",
    );
    if (row.rowCount === 0) return { skipped: true, reason: "no_segments" };
    const segmentId = String(row.rows[0].id);
    const built = await buildOccurrenceFeaturesForSegment({
      roadSegmentId: segmentId,
      targetTime: new Date(),
    });
    return { skipped: false, segmentId, built };
  } catch (error) {
    if (error?.code === "ECONNREFUSED" || /ECONNREFUSED|getaddrinfo/i.test(error?.message || "")) {
      return { skipped: true, reason: error.message };
    }
    return { skipped: false, error };
  }
}

(async () => {
  const builderResult = await tryBuildOneSegmentFeatureRow();
  if (builderResult.skipped) {
    console.log(
      `SKIP weather_feature_builder · DB/weather unavailable (${
        builderResult.reason || "skipped"
      })`,
    );
  } else if (builderResult.error) {
    failed += 1;
    console.log(
      "FAIL weather_feature_builder · buildOccurrenceFeaturesForSegment threw:",
      builderResult.error.message,
    );
  } else {
    const features = builderResult.built?.features || {};
    console.log(
      `weather_feature_builder · segment=${builderResult.segmentId} row=`,
      JSON.stringify({
        weather_temp: features.weather_temp,
        weather_dwpt: features.weather_dwpt,
        weather_rhum: features.weather_rhum,
        weather_prcp: features.weather_prcp,
        weather_wdir: features.weather_wdir,
        weather_wspd: features.weather_wspd,
        weather_pres: features.weather_pres,
      }),
    );
    const fallbackUsed = Boolean(builderResult.built?.meta?.weatherFallbackUsed);
    if (fallbackUsed) {
      console.log(
        "SKIP weather_feature_builder · weather API fallback used (Open-Meteo unreachable)",
      );
    } else {
      assert(
        "weather_feature_builder · weather_temp populated when Open-Meteo OK",
        features.weather_temp != null,
        `weather_temp=${features.weather_temp}`,
      );
      assert(
        "weather_feature_builder · weather_rhum populated when Open-Meteo OK",
        features.weather_rhum != null,
        `weather_rhum=${features.weather_rhum}`,
      );
      assert(
        "weather_feature_builder · weather_prcp populated when Open-Meteo OK",
        features.weather_prcp != null,
        `weather_prcp=${features.weather_prcp}`,
      );
      assert(
        "weather_feature_builder · weather_wdir populated when Open-Meteo OK",
        features.weather_wdir != null,
        `weather_wdir=${features.weather_wdir}`,
      );
      assert(
        "weather_feature_builder · weather_wspd populated when Open-Meteo OK",
        features.weather_wspd != null,
        `weather_wspd=${features.weather_wspd}`,
      );
      assert(
        "weather_feature_builder · weather_pres populated when Open-Meteo OK",
        features.weather_pres != null,
        `weather_pres=${features.weather_pres}`,
      );
      assert(
        "weather_feature_builder · weather_dwpt populated when temp+rhum available",
        features.weather_dwpt != null,
        `weather_dwpt=${features.weather_dwpt}`,
      );
    }
  }

  const statusResult = await tryFlaskOccurrenceStatus();
  if (statusResult.skipped) {
    console.log("SKIP trained_beta · Flask /risk/occurrence/status not reachable");
  } else if (statusResult.error) {
    failed += 1;
    console.log(
      "FAIL trained_beta · Flask /risk/occurrence/status failed:",
      statusResult.error.message,
    );
  } else {
    const data = statusResult.data || {};
    assert(
      "trained_beta · /status reports model_loaded=true",
      data.model_loaded === true,
      JSON.stringify({
        load_error: data.load_error,
        artifact_dir: data.artifact_dir,
      }),
    );
    assert(
      "trained_beta · /status reports correct feature_count (23)",
      data.feature_count === 23,
      `feature_count=${data.feature_count}`,
    );
    assert(
      "trained_beta · /status reports model_version=occurrence_beta_v1",
      data.model_version === "occurrence_beta_v1",
    );
  }

  const flaskResult = await tryFlaskOccurrencePredict();
  if (flaskResult.skipped) {
    console.log("SKIP trained_beta · Flask /risk/occurrence/predict not reachable");
  } else if (flaskResult.error) {
    failed += 1;
    const detail = flaskResult.error.response?.data || flaskResult.error.message;
    console.log("FAIL trained_beta · Flask /risk/occurrence/predict failed:", JSON.stringify(detail));
  } else {
    const data = flaskResult.data || {};
    const sample = (data.predictions || [])[0] || {};
    assert(
      "trained_beta · Flask returns model_version=occurrence_beta_v1",
      data.model_version === "occurrence_beta_v1",
    );
    assert(
      "trained_beta · Flask response has non-empty predictions",
      Array.isArray(data.predictions) && data.predictions.length === trainedSampleRows.length,
    );
    assert(
      "trained_beta · Flask sample has calibrated_probability + risk_level",
      typeof sample.calibrated_probability === "number"
        && ["low", "moderate", "high", "critical", "unknown"].includes(sample.risk_level),
      `cal=${sample.calibrated_probability} level=${sample.risk_level}`,
    );
    assert(
      "trained_beta · Flask response is NaN-free JSON",
      !JSON.stringify(data).includes("NaN"),
    );
    assert(
      "trained_beta · sample row carries missing_required_features array",
      Array.isArray(sample.missing_required_features),
    );
  }

  const missingResult = await tryFlaskOccurrencePredictMissingField();
  if (missingResult.skipped) {
    console.log(
      "SKIP trained_beta · Flask missing-field probe (service unreachable)",
    );
  } else if (missingResult.error) {
    failed += 1;
    const detail = missingResult.error.response?.data || missingResult.error.message;
    console.log(
      "FAIL trained_beta · Flask missing-field probe should not 500:",
      JSON.stringify(detail),
    );
  } else {
    const sample = (missingResult.data?.predictions || [])[0] || {};
    assert(
      "trained_beta · Flask reports missing_required_features for dropped column",
      Array.isArray(sample.missing_required_features)
        && sample.missing_required_features.includes("weather_temp"),
      `missing=${JSON.stringify(sample.missing_required_features)}`,
    );
    assert(
      "trained_beta · Flask still returns a calibrated_probability when columns missing",
      typeof sample.calibrated_probability === "number",
    );
  }

  const nodeResult = await tryNodeOccurrencePredict();
  if (nodeResult.skipped) {
    console.log("SKIP trained_beta · Node /api/risk/occurrence/predict not reachable");
  } else if (nodeResult.error) {
    failed += 1;
    const detail = nodeResult.error.response?.data || nodeResult.error.message;
    console.log("FAIL trained_beta · Node /api/risk/occurrence/predict failed:", JSON.stringify(detail));
  } else {
    const data = nodeResult.data || {};
    assert(
      "trained_beta · Node proxy returns predictions with model_version",
      Array.isArray(data.predictions) && data.model_version === "occurrence_beta_v1",
    );
  }

  console.log(`\n${passed} passed, ${failed} failed.`);
  try { await pool.end(); } catch { /* idle pool ok */ }
  process.exit(failed === 0 ? 0 : 1);
})();
