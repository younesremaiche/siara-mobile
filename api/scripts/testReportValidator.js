#!/usr/bin/env node
/**
 * Manual test cases for the SIARA report validator.
 *
 * Hits the Flask /report/validate endpoint directly (no DB writes) and
 * exercises every label: real, spam, out_of_context, invalid_location,
 * suspicious. Useful for sanity-checking the new pipeline in CI / dev.
 *
 * Run with:
 *     node scripts/testReportValidator.js
 *
 * Requires the Flask ML service (ML_SERVICE_BASE_URL, default
 * http://localhost:8000) to be up and the validator model trained
 * (python anomaly-detection/train_report_validator.py).
 */

const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const axios = require("axios");

const ML_BASE_URL = (
  process.env.ML_SERVICE_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");
const ENDPOINT = `${ML_BASE_URL}/report/validate`;
const TIMEOUT_MS = Number(process.env.REPORT_SPAM_TIMEOUT_MS) || 15000;

const TEST_CASES = [
  {
    name: "real - accident on highway with valid location near road",
    expectedLabel: "real",
    payload: {
      title: "Accident grave sur la rocade",
      description: "Voiture renversee a la sortie 14, ambulance arrivee, circulation bloquee",
      incident_type: "accident",
      lat: 36.752,
      lon: 3.042,
      near_road: true,
      distance_to_road_m: 12,
      has_image: true,
      image_related: true,
    },
  },
  {
    name: "spam - obvious promotion text",
    expectedLabel: "spam",
    payload: {
      title: "Promotion solde 50%",
      description: "Achetez maintenant lien dans bio cliquez ici offre limitee",
      incident_type: "other",
      lat: 36.75,
      lon: 3.06,
      near_road: true,
      distance_to_road_m: 20,
      has_image: false,
      image_related: null,
    },
  },
  {
    name: "out_of_context - football match chatter",
    expectedLabel: "out_of_context",
    payload: {
      title: "Resultats du match",
      description: "Real Madrid a marque trois buts ce soir incroyable",
      incident_type: "other",
      lat: 36.75,
      lon: 3.06,
      near_road: true,
      distance_to_road_m: 18,
      has_image: false,
      image_related: null,
    },
  },
  {
    name: "invalid_location - lat/lon out of range",
    expectedLabel: "invalid_location",
    payload: {
      title: "Accident",
      description: "Voiture renversee sur la nationale",
      incident_type: "accident",
      lat: 999,
      lon: 999,
      near_road: false,
      distance_to_road_m: null,
      has_image: false,
      image_related: null,
    },
  },
  {
    name: "suspicious - vague text far from any road",
    expectedLabel: "suspicious",
    payload: {
      title: "Truc bizarre",
      description: "Y a un truc bizarre la-bas, je sais pas",
      incident_type: "other",
      lat: 36.75,
      lon: 3.06,
      near_road: false,
      distance_to_road_m: 800,
      has_image: false,
      image_related: null,
    },
  },
  {
    name: "real - road-related text but valid coords with no road segment nearby (relaxed pass)",
    expectedLabel: "real",
    payload: {
      title: "Embouteillage important",
      description: "Bouchon enorme sur l'autoroute est, plus de 30 minutes d'attente",
      incident_type: "traffic",
      lat: 36.755,
      lon: 3.05,
      near_road: false,
      distance_to_road_m: 180,
      has_image: false,
      image_related: null,
    },
  },
];

function colour(text, code) {
  if (!process.stdout.isTTY) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

async function runCase(testCase, index) {
  const label = `${index + 1}. ${testCase.name}`;
  try {
    const response = await axios.post(ENDPOINT, testCase.payload, { timeout: TIMEOUT_MS });
    const data = response.data || {};
    const ok = data.label === testCase.expectedLabel;
    const status = ok ? colour("PASS", 32) : colour("FAIL", 31);
    console.log(`${status}  ${label}`);
    console.log(
      `       expected=${testCase.expectedLabel} got=${data.label} ` +
        `spam=${data.spam_score} real=${data.real_score} conf=${data.confidence_score}`,
    );
    if (Array.isArray(data.reasons) && data.reasons.length > 0) {
      console.log(`       reasons: ${data.reasons.join(" | ")}`);
    }
    if (data.spam_score != null && (data.spam_score < 0 || data.spam_score > 1)) {
      console.log(colour(`       SCORE WARNING: spam_score=${data.spam_score} out of [0, 1]`, 33));
    }
    return ok;
  } catch (error) {
    const status = colour("ERROR", 31);
    const message =
      error?.response?.data?.error
      || error?.response?.data?.details
      || error?.message
      || "unknown_error";
    console.log(`${status} ${label} -> ${message}`);
    return false;
  }
}

async function main() {
  console.log(`SIARA report validator manual tests against ${ENDPOINT}\n`);
  let passed = 0;
  let failed = 0;
  for (let i = 0; i < TEST_CASES.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await runCase(TEST_CASES[i], i);
    if (ok) passed += 1;
    else failed += 1;
  }
  console.log(`\n${passed} passed, ${failed} failed (of ${TEST_CASES.length}).`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("test runner crashed", error);
  process.exit(1);
});
