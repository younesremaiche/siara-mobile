// Express router for the trained accident-occurrence model (occurrence_beta_v1).
// Acts as a thin proxy to the Flask ML microservice. The rule-based occurrence
// service at api/services/occurrenceRiskService.js is unaffected — that stays
// the fallback path for the legacy /api/occurrence-risk/* surface.

const router = require("express").Router();
const axios = require("axios");

const { postToFlask, ML_SERVICE_BASE_URL, TIMEOUT_MS } = require("../services/risk/mlClient");

const FLASK_PREDICT_PATH = "/risk/occurrence/predict";
const FLASK_METADATA_PATH = "/risk/occurrence/metadata";

async function getFromFlask(path) {
  return axios.get(`${ML_SERVICE_BASE_URL}${path}`, { timeout: TIMEOUT_MS });
}

function badGateway(res, error, fallbackMessage) {
  const status = error?.response?.status;
  if (status && status >= 400 && status < 600) {
    return res.status(status).json(error.response.data || { error: fallbackMessage });
  }
  return res.status(502).json({
    error: fallbackMessage,
    details: process.env.NODE_ENV !== "production" ? error?.message : undefined,
  });
}

// Public-facing prediction endpoint. The Flask service rejects an empty rows[]
// with 400; we keep the validation here too so we never bother Flask with an
// obviously-broken payload.
router.post("/predict", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const rows = Array.isArray(body.rows) ? body.rows : null;

  if (!rows || rows.length === 0) {
    return res.status(400).json({ error: "rows[] is required and must be a non-empty list" });
  }

  try {
    const response = await postToFlask(FLASK_PREDICT_PATH, { rows });
    return res.status(200).json(response.data);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[occurrence-model] predict_failed", {
        message: error?.message,
        status: error?.response?.status,
      });
    }
    return badGateway(res, error, "Failed to predict occurrence risk");
  }
});

// Internal helper used by the admin metrics controller and the smoke script.
async function fetchMetadata() {
  const response = await getFromFlask(FLASK_METADATA_PATH);
  return response.data;
}

router.get("/metadata", async (req, res) => {
  try {
    const data = await fetchMetadata();
    return res.status(200).json(data);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[occurrence-model] metadata_failed", { message: error?.message });
    }
    return badGateway(res, error, "Failed to load occurrence model metadata");
  }
});

module.exports = router;
module.exports.fetchOccurrenceModelMetadata = fetchMetadata;
