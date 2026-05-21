const pool = require("../db");

const TYPE_KEYWORDS = [
  { type: "accident", patterns: [/\b(accident|crash|collision|wreck|smash|fender)\b/i, /\b(rollover|head[- ]?on)\b/i] },
  { type: "traffic", patterns: [/\b(traffic|jam|congestion|backed up|gridlock|standstill)\b/i] },
  { type: "danger", patterns: [/\b(obstacle|hazard|debris|object|pothole|sinkhole|landslide)\b/i] },
  { type: "weather", patterns: [/\b(rain|fog|storm|hail|snow|ice|wind|flood|sandstorm|visibility)\b/i] },
  { type: "roadworks", patterns: [/\b(construction|roadwork|works|closure|lane closed|detour|maintenance)\b/i] },
];

const SEVERITY_KEYWORDS = [
  { severity: "high", patterns: [/\b(fatal|deadly|severe|major|serious|critical|injuries|injured|trapped|fire|smoke|overturned|head[- ]?on)\b/i] },
  { severity: "medium", patterns: [/\b(blocking|blocked|two[- ]car|multiple|lane|stopped traffic|hazard)\b/i] },
  { severity: "low", patterns: [/\b(minor|small|slow|cleared|moving)\b/i] },
];

const DUPLICATE_RADIUS_METERS = 300;
const DUPLICATE_LOOKBACK_HOURS = 6;
const MAX_DUPLICATES = 5;

const safeNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function suggestType({ title, description }) {
  const text = `${title || ""} ${description || ""}`.toLowerCase();
  for (const entry of TYPE_KEYWORDS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(text)) {
        return { type: entry.type, confidence: "medium" };
      }
    }
  }
  return null;
}

function suggestSeverity({ title, description }) {
  const text = `${title || ""} ${description || ""}`.toLowerCase();
  for (const entry of SEVERITY_KEYWORDS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(text)) {
        return { severity: entry.severity, confidence: "medium" };
      }
    }
  }
  return null;
}

async function findDuplicateCandidates({ lat, lng, type }) {
  const safeLat = safeNumber(lat);
  const safeLng = safeNumber(lng);
  if (safeLat == null || safeLng == null) return [];

  const params = [safeLng, safeLat, DUPLICATE_RADIUS_METERS, DUPLICATE_LOOKBACK_HOURS];
  let typeClause = "";
  if (type) {
    params.push(type);
    typeClause = `AND ar.incident_type = $${params.length}`;
  }

  const sql = `
    SELECT
      ar.id,
      ar.title,
      ar.description,
      ar.incident_type,
      ar.severity_hint,
      ar.created_at,
      ST_Y(ar.incident_location::geometry) AS lat,
      ST_X(ar.incident_location::geometry) AS lng,
      ar.verified_by_officer_id,
      ar.saw_it_too_count,
      ar.likes_count,
      ST_Distance(
        ar.incident_location::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      ) AS distance_meters
    FROM app.accident_reports ar
    WHERE ar.incident_location IS NOT NULL
      AND ar.created_at >= NOW() - ($4::int * INTERVAL '1 hour')
      AND COALESCE(ar.latest_predicted_label, 'real') <> 'spam'
      AND ST_DWithin(
        ar.incident_location::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
      ${typeClause}
    ORDER BY ar.created_at DESC
    LIMIT ${MAX_DUPLICATES}
  `;
  const result = await pool.query(sql, params);
  return (result.rows || []).map((row) => ({
    reportId: row.id,
    title: row.title || "Recent report nearby",
    descriptionSnippet:
      typeof row.description === "string" ? row.description.slice(0, 160) : null,
    incidentType: row.incident_type || null,
    severityHint: Number(row.severity_hint) || 0,
    distanceMeters: Math.round(Number(row.distance_meters) || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    verifiedByPolice: Boolean(row.verified_by_officer_id),
    sawItTooCount: Number(row.saw_it_too_count) || 0,
    likesCount: Number(row.likes_count) || 0,
  }));
}

function buildWarnings({ title, description, lat, lng, duplicates }) {
  const warnings = [];
  const titleLength = String(title || "").trim().length;
  if (titleLength < 5) {
    warnings.push({
      kind: "title_short",
      message: "Add at least 5 characters to the title so other drivers can recognise the incident.",
    });
  }
  if (!String(description || "").trim()) {
    warnings.push({
      kind: "description_missing",
      message: "A short description (lane, direction, road) helps police triage and reduces duplicate reports.",
    });
  }
  if (lat == null || lng == null) {
    warnings.push({
      kind: "no_location",
      message: "No coordinates yet — pick GPS or a search result so we can match this with nearby reports.",
    });
  }
  if (duplicates.length > 0) {
    warnings.push({
      kind: "duplicate",
      message: `${duplicates.length} similar ${duplicates.length === 1 ? "report" : "reports"} within 300 m in the last ${DUPLICATE_LOOKBACK_HOURS}h. Confirm the existing one instead of creating a duplicate when possible.`,
    });
  }
  return warnings;
}

async function suggestReportFields({ title, description, lat, lng, imageMetadata } = {}) {
  const typeSuggestion = suggestType({ title, description });
  const severitySuggestion = suggestSeverity({ title, description });
  const duplicates = await findDuplicateCandidates({
    lat,
    lng,
    type: typeSuggestion?.type || null,
  });
  const warnings = buildWarnings({ title, description, lat, lng, duplicates });

  return {
    suggestedType: typeSuggestion?.type || null,
    suggestedTypeConfidence: typeSuggestion?.confidence || null,
    suggestedSeverity: severitySuggestion?.severity || null,
    suggestedSeverityConfidence: severitySuggestion?.confidence || null,
    duplicateCandidates: duplicates,
    warnings,
    imageMetadata: imageMetadata || null,
  };
}

module.exports = {
  suggestReportFields,
};
