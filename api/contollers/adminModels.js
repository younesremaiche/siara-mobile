// Admin-only metrics endpoint for the trained occurrence_beta_v1 model.
// Reads ml.model_versions first, falls back to on-disk artifact JSON if the
// migration hasn't been applied yet, and decorates with live Flask metadata
// when available (cache_hit, load_error, etc.).

const router = require("express").Router();
const fs = require("fs");
const path = require("path");

const pool = require("../db");
const { verifyTokenAndAdmin } = require("./verifytoken");
const { fetchOccurrenceModelMetadata } = require("./occurrenceModel");

const ARTIFACT_DIR = path.join(
  __dirname,
  "..",
  "occurrence-model",
  "occurrence_betav1_final",
);

function readJsonSafe(relName) {
  try {
    const raw = fs.readFileSync(path.join(ARTIFACT_DIR, relName), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readCsvSafe(relName, limit = 40) {
  try {
    const raw = fs.readFileSync(path.join(ARTIFACT_DIR, relName), "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(",").map((c) => c.trim());
    return lines.slice(1, 1 + limit).map((line) => {
      const cols = line.split(",");
      const row = {};
      header.forEach((key, idx) => {
        row[key] = cols[idx] == null ? null : cols[idx].trim();
      });
      return row;
    });
  } catch {
    return [];
  }
}

router.get("/models/occurrence-beta-v1", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const dbResult = await pool.query(
      `
        SELECT
          id,
          model_name,
          target_type,
          algorithm,
          feature_set_name,
          data_source,
          training_start_date,
          training_end_date,
          calibration_method,
          metrics_json,
          training_params_json,
          artifact_path,
          notes,
          status,
          is_active,
          created_at
        FROM ml.model_versions
        WHERE model_name = 'occurrence_beta_v1'
          AND target_type = 'accident_occurrence'
        ORDER BY created_at DESC
        LIMIT 1
      `,
    );

    const modelVersion = dbResult.rows[0] || null;

    // Artifact-on-disk fallback. Always included so the Admin UI can show the
    // full metrics/manifest even if the DB seed hasn't been applied.
    const metricsJson = readJsonSafe("metrics.json");
    const trainingManifest = readJsonSafe("training_manifest.json");
    const featureList = readJsonSafe("feature_list.json") || [];
    const shapTopFeatures = readCsvSafe("shap_top_features.csv", 15);
    const featureImportance = readCsvSafe("feature_importance.csv", 25);

    let liveMetadata = null;
    try {
      liveMetadata = await fetchOccurrenceModelMetadata();
    } catch (error) {
      liveMetadata = {
        enabled: false,
        load_error: error?.message || "Flask occurrence metadata unreachable",
      };
    }

    return res.status(200).json({
      model_name: "occurrence_beta_v1",
      target_type: "accident_occurrence",
      display_name: "Accident Occurrence Prediction",
      algorithm: "lightgbm",
      calibration_method: "isotonic",
      time_window_hours: 1,
      decision_threshold: 0.2,
      risk_level_thresholds: {
        low: 0.0,
        moderate: 0.05,
        high: 0.2,
        critical: 0.5,
      },
      explanation_source: "shap",
      training_prevalence_note:
        "Because the model was trained with sampled negatives, its calibrated probabilities should be interpreted as relative operational risk until recalibrated on realistic exposure.",
      calibration_curve_url: "/model-assets/occurrence_beta_v1/calibration_curve.png",
      // Direct backend URL fallback in case the client doesn't proxy /model-assets in dev.
      calibration_curve_api_url:
        "/model-assets/occurrence_betav1_final/calibration_curve.png",
      model_version: modelVersion,
      metrics: metricsJson,
      training_manifest: trainingManifest,
      feature_list: featureList,
      shap_top_features: shapTopFeatures,
      feature_importance: featureImportance,
      live: liveMetadata,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
