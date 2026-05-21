// Thin client for the Flask ML microservice.
// Behavior preserved verbatim from models.js.

const axios = require("axios");
const { flaskTimeoutFor } = require("../riskTimeouts");

const LEGACY_ML_SERVICE_URL = process.env.ML_SERVICE_URL;
const ML_SERVICE_BASE_URL =
  process.env.ML_SERVICE_BASE_URL ||
  (LEGACY_ML_SERVICE_URL
    ? LEGACY_ML_SERVICE_URL.replace(/\/predict\/?$/, "")
    : "http://localhost:8000");

const TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS || 15000);
const STREAM_TIMEOUT_MS = Number(process.env.ML_SERVICE_STREAM_TIMEOUT_MS || 300000);

async function postToFlask(path, body, deadline = null) {
  return axios.post(`${ML_SERVICE_BASE_URL}${path}`, body, {
    timeout: flaskTimeoutFor(deadline, TIMEOUT_MS),
  });
}

function writeSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function postToFlaskStream(path, body) {
  return axios.post(`${ML_SERVICE_BASE_URL}${path}`, body, {
    responseType: "stream",
    timeout: STREAM_TIMEOUT_MS,
    validateStatus: () => true,
    headers: {
      Accept: "text/event-stream",
    },
  });
}

async function readStreamText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

module.exports = {
  ML_SERVICE_BASE_URL,
  TIMEOUT_MS,
  STREAM_TIMEOUT_MS,
  postToFlask,
  postToFlaskStream,
  readStreamText,
  writeSse,
};
