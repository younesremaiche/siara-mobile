#!/usr/bin/env node
/**
 * Smoke test for the trained occurrence_beta_v1 model.
 * - Loads example rows from the artifact's inference_sample.json.
 * - Calls the Flask service directly (or the Node proxy if --via-node is set).
 * - Asserts model_version / risk_level / calibrated_probability are present
 *   and that the response contains no NaN values.
 *
 * Run:
 *     cd api && node scripts/testOccurrenceModel.js
 *     cd api && node scripts/testOccurrenceModel.js --via-node
 *
 * Env:
 *     ML_SERVICE_BASE_URL (default http://localhost:8000)
 *     API_BASE_URL (default http://localhost:5000)
 */

const path = require("path");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ARGS = new Set(process.argv.slice(2));
const VIA_NODE = ARGS.has("--via-node");

const SAMPLE_PATH = path.join(
  __dirname,
  "..",
  "occurrence-model",
  "occurrence_betav1_final",
  "inference_sample.json",
);
const FEATURE_LIST_PATH = path.join(
  __dirname,
  "..",
  "occurrence-model",
  "occurrence_betav1_final",
  "feature_list.json",
);

const ML_SERVICE_BASE_URL = (process.env.ML_SERVICE_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");
const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS || 15000);

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

function loadJson(p) {
  // inference_sample.json contains bare NaN tokens which JSON.parse rejects;
  // replace them with null before parsing.
  const raw = fs.readFileSync(p, "utf8").replace(/\bNaN\b/g, "null");
  return JSON.parse(raw);
}

function containsNaNString(value) {
  if (value == null) return false;
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value === "string") return value === "NaN";
  if (Array.isArray(value)) return value.some(containsNaNString);
  if (typeof value === "object") return Object.values(value).some(containsNaNString);
  return false;
}

async function run() {
  console.log(`[occurrence-model-test] reading sample rows from ${SAMPLE_PATH}`);
  const sample = loadJson(SAMPLE_PATH);
  const featureList = loadJson(FEATURE_LIST_PATH);
  const rows = sample.example_request_rows;

  assert(
    "Sample file has a non-empty example_request_rows array",
    Array.isArray(rows) && rows.length > 0,
    `rows=${rows?.length || 0}`,
  );
  assert(
    "feature_list.json has 23 features",
    Array.isArray(featureList) && featureList.length === 23,
    `count=${featureList?.length}`,
  );

  const endpoint = VIA_NODE
    ? `${API_BASE_URL}/api/risk/occurrence/predict`
    : `${ML_SERVICE_BASE_URL}/risk/occurrence/predict`;

  console.log(`[occurrence-model-test] POST ${endpoint} with ${rows.length} rows`);

  let response;
  try {
    response = await axios.post(endpoint, { rows }, { timeout: TIMEOUT_MS });
  } catch (error) {
    failed += 1;
    console.log(`${colour("FAIL", 31)} request to ${endpoint} failed: ${error.message}`);
    if (error.response?.data) console.log(JSON.stringify(error.response.data, null, 2));
    console.log(`\n${passed} passed, ${failed} failed.`);
    process.exit(1);
  }

  const body = response.data || {};
  assert(
    "Response model_version === 'occurrence_beta_v1'",
    body.model_version === "occurrence_beta_v1",
    `got '${body.model_version}'`,
  );
  assert(
    "Response includes predictions[]",
    Array.isArray(body.predictions) && body.predictions.length === rows.length,
    `len=${body.predictions?.length} expected=${rows.length}`,
  );

  body.predictions?.forEach((pred, idx) => {
    assert(
      `predictions[${idx}].calibrated_probability is a number in [0, 1]`,
      typeof pred.calibrated_probability === "number"
        && pred.calibrated_probability >= 0
        && pred.calibrated_probability <= 1,
      `got ${pred.calibrated_probability}`,
    );
    assert(
      `predictions[${idx}].risk_level ∈ {low, moderate, high, critical}`,
      ["low", "moderate", "high", "critical"].includes(pred.risk_level),
      `got '${pred.risk_level}'`,
    );
  });

  assert(
    "Response JSON contains no NaN tokens",
    !containsNaNString(body),
    "scan of full response payload",
  );

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
