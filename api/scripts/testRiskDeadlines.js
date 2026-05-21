#!/usr/bin/env node
/*
 * Smoke test for the risk-endpoint deadline plumbing.
 *
 * Hits the canonical risk endpoints and their /api/model/* compatibility
 * aliases against a running siara-api (default http://localhost:5000) and
 * asserts each response arrives inside RISK_DEADLINE_MS plus a small slack.
 *
 * Usage:
 *   node scripts/testRiskDeadlines.js
 *   API_BASE=http://localhost:5000 LAT=36.7538 LNG=3.0588 node scripts/testRiskDeadlines.js
 */

const path = require("path");
const axios = require("axios");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  override: process.env.NODE_ENV !== "production",
});

const API_BASE = process.env.API_BASE || `http://localhost:${process.env.PORT_NUM || 5000}`;
const LAT = Number(process.env.LAT || 36.7538);
const LNG = Number(process.env.LNG || 3.0588);
const RISK_DEADLINE_MS = Number(process.env.RISK_DEADLINE_MS || 20000);
// Allow some slack for client-side overhead and the ML floor; the Flask call is
// allowed to run for ML_DEADLINE_FLOOR_MS even if the deadline is already gone.
const DEADLINE_SLACK_MS = Number(process.env.DEADLINE_SLACK_MS || 5000);
const MAX_TOTAL_MS = RISK_DEADLINE_MS + DEADLINE_SLACK_MS;

const cases = [
  {
    name: "POST /api/risk/current",
    method: "post",
    path: "/api/risk/current",
    body: { lat: LAT, lng: LNG },
  },
  {
    name: "GET /api/risk/forecast24h",
    method: "get",
    path: `/api/risk/forecast24h?lat=${LAT}&lng=${LNG}`,
  },
  {
    name: "GET /api/weather/current",
    method: "get",
    path: `/api/weather/current?lat=${LAT}&lng=${LNG}`,
  },
  {
    name: "POST /api/model/risk/current (compat alias)",
    method: "post",
    path: "/api/model/risk/current",
    body: { lat: LAT, lng: LNG },
  },
  {
    name: "GET /api/model/risk/forecast24h (compat alias)",
    method: "get",
    path: `/api/model/risk/forecast24h?lat=${LAT}&lng=${LNG}`,
  },
];

async function runCase(testCase) {
  const url = `${API_BASE}${testCase.path}`;
  const startedAt = Date.now();
  let outcome = "ok";
  let statusCode = null;
  let errorMessage = null;
  try {
    const response = await (testCase.method === "post"
      ? axios.post(url, testCase.body, { timeout: MAX_TOTAL_MS, validateStatus: () => true })
      : axios.get(url, { timeout: MAX_TOTAL_MS, validateStatus: () => true }));
    statusCode = response.status;
    if (response.status >= 500) {
      outcome = "server_error";
    } else if (response.status >= 400) {
      outcome = "client_error";
    }
  } catch (error) {
    outcome = error.code === "ECONNABORTED" ? "client_timeout" : "exception";
    errorMessage = error.message;
  }
  const elapsedMs = Date.now() - startedAt;
  const withinBudget = elapsedMs <= MAX_TOTAL_MS;
  return { ...testCase, outcome, statusCode, elapsedMs, withinBudget, errorMessage };
}

(async () => {
  console.log(
    `[smoke] base=${API_BASE} lat=${LAT} lng=${LNG} risk_deadline_ms=${RISK_DEADLINE_MS} max_total_ms=${MAX_TOTAL_MS}`,
  );
  const results = [];
  for (const testCase of cases) {
    const result = await runCase(testCase);
    results.push(result);
    const flag = result.withinBudget && result.outcome === "ok" ? "PASS" : "FAIL";
    console.log(
      `[smoke] ${flag} ${result.name} status=${result.statusCode ?? "n/a"} elapsed=${result.elapsedMs}ms outcome=${result.outcome}` +
        (result.errorMessage ? ` error=${result.errorMessage}` : ""),
    );
  }

  const failures = results.filter((r) => !r.withinBudget || r.outcome !== "ok");
  if (failures.length > 0) {
    console.error(`[smoke] ${failures.length}/${results.length} cases failed`);
    process.exit(1);
  }
  console.log(`[smoke] all ${results.length} cases passed`);
})();
