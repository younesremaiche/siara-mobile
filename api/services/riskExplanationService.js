const axios = require("axios");

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "gemma3:4b";
const DEFAULT_TIMEOUT_MS = 60000;

const SYSTEM_PROMPT = [
  "You are SIARA, a road safety assistant.",
  "Explain why the road risk prediction was produced.",
  "",
  "Use ONLY the provided data.",
  "Do NOT say \"unknown strongest factor\" if factor lists are empty.",
  "If model XAI factors are available, prioritize them.",
  "If XAI factors are not available, explain using the provided contextual data such as weather, time, location accuracy, nearby incidents, and confidence.",
  "Do not invent exact causes that are not in the data.",
  "Keep the explanation short, maximum 3 sentences.",
  "Use simple language for normal users.",
  "Mention:",
  "1. the risk level and score,",
  "2. the main factors increasing risk,",
  "3. the main factors reducing risk or keeping it moderate.",
  "",
  "Return only plain text. No markdown. No bullet points.",
].join("\n");

const isDev = () => (process.env.NODE_ENV || "development") !== "production";

const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const FEATURE_LABELS = {
  visibility_km: "visibility",
  visibility_mi: "visibility",
  temperature_c: "temperature",
  temperature_f: "temperature",
  humidity_pct: "humidity",
  Humidity_pct: "humidity",
  wind_kmh: "wind",
  wind_speed_mph: "wind",
  pressure_hpa: "pressure",
  precipitation_mm: "precipitation",
  weather_condition: "weather conditions",
  Weather_Condition: "weather conditions",
  Hour: "time of day",
  hour: "time of day",
  Day_of_Week: "day of week",
  is_weekend: "weekend",
  is_night: "night-time driving",
  is_rush_hour: "rush hour",
  traffic_density: "traffic density",
  road_class: "road class",
  is_highway: "highway",
  is_urban: "urban road",
  Junction: "nearby junction",
  Crossing: "pedestrian crossing",
  Traffic_Signal: "traffic signal",
  Stop: "nearby stop sign",
  Roundabout: "roundabout",
  Bump: "speed bump",
  Give_Way: "give-way sign",
  Turning_Loop: "turning loop",
  Railway: "railway crossing",
  Station: "nearby station",
  No_Exit: "no-exit road",
  Amenity: "nearby amenity",
};

const humaniseFeature = (feature) => {
  if (!feature) return "context";
  if (FEATURE_LABELS[feature]) return FEATURE_LABELS[feature];
  return String(feature)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
};

const directionFromText = (text) => {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  if (lower.includes("increase") || lower.includes("raise") || lower.includes("higher") || lower.includes("risk_increase")) {
    return "increasing";
  }
  if (lower.includes("decrease") || lower.includes("lower") || lower.includes("reduce") || lower.includes("risk_reduce")) {
    return "reducing";
  }
  return null;
};

const collectFactorCandidates = (xai, rawPrediction) => {
  const sources = [];
  const pickArray = (obj, keys) => {
    if (!obj || typeof obj !== "object") return;
    for (const key of keys) {
      const value = obj[key];
      if (Array.isArray(value) && value.length > 0) {
        sources.push(value);
      } else if (value && typeof value === "object") {
        const entries = Object.entries(value).map(([k, v]) => ({ feature: k, ...(typeof v === "object" ? v : { value: v }) }));
        if (entries.length > 0) sources.push(entries);
      }
    }
  };

  pickArray(xai, [
    "topFactors",
    "top_factors",
    "factors",
    "explanations",
    "feature_importance",
    "featureImportance",
    "top_reasons",
    "shap_values",
    "shapValues",
  ]);
  pickArray(rawPrediction, [
    "topFactors",
    "top_factors",
    "factors",
    "explanation",
    "featureImportance",
    "feature_importance",
    "shapValues",
    "shap_values",
  ]);

  if (rawPrediction?.xai && typeof rawPrediction.xai === "object") {
    pickArray(rawPrediction.xai, [
      "topFactors",
      "top_factors",
      "factors",
      "explanations",
      "feature_importance",
      "featureImportance",
      "top_reasons",
      "shap_values",
      "shapValues",
    ]);
  }

  return sources.length > 0 ? sources[0] : [];
};

const normaliseFactors = (xai, rawPrediction) => {
  const candidates = collectFactorCandidates(xai, rawPrediction);
  const seen = new Set();
  const factors = [];

  for (const entry of candidates) {
    if (!entry || typeof entry !== "object") continue;
    const name = String(entry.feature || entry.name || entry.key || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const weight = safeNumber(
      entry.weight ?? entry.shap ?? entry.shap_value ?? entry.contribution ?? entry.impact_score ?? entry.score,
    );
    const numericImpact = safeNumber(entry.impact);
    const directionRaw = entry.direction || entry.impact_direction || null;
    let direction =
      directionFromText(directionRaw) ||
      directionFromText(typeof entry.impact === "string" ? entry.impact : null);

    if (!direction) {
      const numeric = numericImpact != null ? numericImpact : weight;
      if (numeric != null) {
        if (numeric > 0) direction = "increasing";
        else if (numeric < 0) direction = "reducing";
        else direction = "neutral";
      } else {
        direction = "neutral";
      }
    }

    factors.push({
      name,
      readableLabel: humaniseFeature(name),
      value: entry.value ?? null,
      impact: numericImpact != null ? numericImpact : weight,
      direction,
      source: "model",
    });
  }

  return factors;
};

const deriveContextualFactors = (risk, weather, rawPrediction) => {
  const factors = [];
  const push = (direction, label, value = null, name = label) => {
    factors.push({
      name,
      readableLabel: label,
      value,
      impact: null,
      direction,
      source: "context",
    });
  };

  const visibilityKm = safeNumber(weather?.visibility_km ?? weather?.visibilityKm);
  if (visibilityKm != null) {
    if (visibilityKm >= 10) push("reducing", "good visibility", `${visibilityKm.toFixed(1)} km`, "visibility_km");
    else if (visibilityKm < 3) push("increasing", "low visibility", `${visibilityKm.toFixed(1)} km`, "visibility_km");
  }

  const humidity = safeNumber(weather?.humidity_pct ?? weather?.humidityPct);
  if (humidity != null && humidity >= 85) {
    push("increasing", "high humidity", `${Math.round(humidity)}%`, "humidity_pct");
  }

  const wind = safeNumber(weather?.wind_kmh ?? weather?.windKmh);
  if (wind != null) {
    if (wind >= 35) push("increasing", "strong wind", `${wind.toFixed(1)} km/h`, "wind_kmh");
    else if (wind <= 8) push("reducing", "calm wind", `${wind.toFixed(1)} km/h`, "wind_kmh");
  }

  const condition = String(weather?.condition || "").toLowerCase();
  if (condition) {
    if (/(rain|storm|snow|fog|hail|sleet)/.test(condition)) {
      push("increasing", `${condition} conditions`, condition, "weather_condition");
    } else if (/(clear|sunny|fair)/.test(condition)) {
      push("reducing", "clear weather", condition, "weather_condition");
    }
  }

  const accuracy = safeNumber(risk?.accuracyMeters);
  if (accuracy != null && accuracy > 100) {
    push(
      "neutral",
      "limited location precision",
      `${Math.round(accuracy)} m`,
      "location_accuracy",
    );
  }

  const predictionTime = risk?.predictionTime ? new Date(risk.predictionTime) : null;
  if (predictionTime && !Number.isNaN(predictionTime.getTime())) {
    const hour = predictionTime.getHours();
    if (hour >= 22 || hour <= 5) {
      push("increasing", "night-time driving", `${hour}:00`, "is_night");
    }
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
      push("increasing", "rush hour", `${hour}:00`, "is_rush_hour");
    }
  }

  const sentinelReasons = Array.isArray(rawPrediction?.sentinel?.reasons)
    ? rawPrediction.sentinel.reasons
    : [];
  for (const reason of sentinelReasons) {
    const text = typeof reason === "string" ? reason : reason?.text || reason?.message;
    if (!text) continue;
    push("increasing", String(text).toLowerCase(), null, `sentinel:${text}`);
  }

  const confidence = String(risk?.confidence || "").toLowerCase();
  if (confidence && /(high|good)/.test(confidence)) {
    push(
      "neutral",
      "model has high confidence in this prediction",
      confidence,
      "confidence",
    );
  } else if (confidence && /(low|poor)/.test(confidence)) {
    push(
      "neutral",
      "model has lower confidence due to limited data",
      confidence,
      "confidence",
    );
  }

  return factors;
};

const groupFactors = (factors) => {
  const top = (direction) =>
    factors
      .filter((factor) => factor.direction === direction)
      .sort((a, b) => Math.abs(b.impact ?? 0) - Math.abs(a.impact ?? 0))
      .slice(0, 4);

  return {
    increasingFactors: top("increasing"),
    reducingFactors: top("reducing"),
    neutralFactors: top("neutral"),
  };
};

const formatFactorList = (factors) =>
  factors.map((factor) => factor.readableLabel).filter(Boolean);

const buildPrompt = ({ risk, weather, grouped, hasModelFactors }) => {
  const payload = {
    risk: {
      score: risk?.score ?? risk?.percent ?? risk?.riskScore ?? null,
      level: risk?.level ?? risk?.riskLevel ?? null,
      confidence: risk?.confidence ?? null,
      dataQuality: risk?.dataQuality ?? null,
      accuracyMeters: risk?.accuracyMeters ?? null,
      predictionTime: risk?.predictionTime ?? null,
      locationLabel: risk?.locationLabel ?? null,
    },
    weather: weather || null,
    factors: {
      source: hasModelFactors ? "model_xai" : "contextual",
      increasing: grouped.increasingFactors.map((factor) => ({
        feature: factor.readableLabel,
        rawName: factor.name,
        value: factor.value,
      })),
      reducing: grouped.reducingFactors.map((factor) => ({
        feature: factor.readableLabel,
        rawName: factor.name,
        value: factor.value,
      })),
      neutral: grouped.neutralFactors.map((factor) => ({
        feature: factor.readableLabel,
        rawName: factor.name,
        value: factor.value,
      })),
    },
  };

  return `${SYSTEM_PROMPT}\n\nPrediction and context JSON:\n${JSON.stringify(payload, null, 2)}\n\nExplanation:`;
};

const callOllama = async (prompt) => {
  const baseUrl = (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
  const model = process.env.OLLAMA_EXPLAIN_MODEL || DEFAULT_OLLAMA_MODEL;
  const timeoutMs = Number(process.env.OLLAMA_EXPLAIN_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  const response = await axios.post(
    `${baseUrl}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 220,
      },
    },
    {
      timeout: timeoutMs,
      headers: { "Content-Type": "application/json" },
    },
  );

  const raw = response?.data?.response;
  return typeof raw === "string" ? raw.trim() : "";
};

const sanitiseExplanation = (text) => {
  if (!text) return "";
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const looksGeneric = (text) => {
  if (!text) return true;
  const lower = text.toLowerCase();
  const genericMarkers = [
    "unknown",
    "not available",
    "insufficient information",
    "strongest factor is currently unknown",
    "no information",
    "cannot determine",
  ];
  return genericMarkers.some((marker) => lower.includes(marker));
};

const formatScore = (risk) => {
  const score = safeNumber(risk?.score ?? risk?.percent ?? risk?.riskScore);
  return score != null ? score.toFixed(1) : "the current";
};

const formatLevel = (risk) => {
  const level = String(risk?.level ?? risk?.riskLevel ?? "").trim();
  return level || "estimated";
};

const buildFallbackExplanation = (risk, grouped) => {
  const score = formatScore(risk);
  const level = formatLevel(risk);
  const confidence = String(risk?.confidence || "").trim() || "unspecified";
  const increasing = formatFactorList(grouped.increasingFactors);
  const reducing = formatFactorList(grouped.reducingFactors);

  if (increasing.length === 0 && reducing.length === 0) {
    return `SIARA estimated a ${score}% ${level} risk from the available map, weather, and prediction data. The model confidence is ${confidence}, but detailed XAI factors were not returned for this prediction.`;
  }

  const increasingText =
    increasing.length > 0 ? increasing.slice(0, 2).join(" and ") : "the current overall context";
  const reducingText =
    reducing.length > 0 ? reducing.slice(0, 2).join(" and ") : "the rest of the available conditions";

  return `SIARA estimated a ${score}% ${level} risk using the current road, weather, and location context. Risk is increased mainly by ${increasingText}. Risk is reduced or kept moderate by ${reducingText}.`;
};

const generateRiskExplanation = async ({ risk, weather, xai, rawPrediction } = {}) => {
  const safeRisk = risk && typeof risk === "object" ? risk : null;
  const safeWeather = weather && typeof weather === "object" ? weather : null;
  const safeXai = xai && typeof xai === "object" ? xai : null;
  const safeRaw = rawPrediction && typeof rawPrediction === "object" ? rawPrediction : null;

  if (!safeRisk) {
    return {
      explanation: "No risk prediction is available yet.",
      source: "fallback",
      factors: { increasingFactors: [], reducingFactors: [], neutralFactors: [] },
    };
  }

  const modelFactors = normaliseFactors(safeXai, safeRaw);
  const hasModelFactors = modelFactors.length > 0;
  const factors = hasModelFactors
    ? modelFactors
    : deriveContextualFactors(safeRisk, safeWeather, safeRaw);
  const grouped = groupFactors(factors);

  if (isDev()) {
    console.debug("[explain-risk] backend payload", {
      hasModelFactors,
      factorCount: factors.length,
      increasing: grouped.increasingFactors.map((factor) => factor.readableLabel),
      reducing: grouped.reducingFactors.map((factor) => factor.readableLabel),
      weatherKeys: safeWeather ? Object.keys(safeWeather) : [],
      rawXaiKeys: safeXai ? Object.keys(safeXai) : [],
      rawPredictionKeys: safeRaw ? Object.keys(safeRaw) : [],
    });
  }

  const prompt = buildPrompt({ risk: safeRisk, weather: safeWeather, grouped, hasModelFactors });

  try {
    const raw = await callOllama(prompt);
    const text = sanitiseExplanation(raw);
    if (text && !looksGeneric(text)) {
      return {
        explanation: text,
        source: "ollama",
        factors: grouped,
      };
    }
    if (isDev() && text) {
      console.debug("[explain-risk] ollama generic, falling back", { text });
    }
  } catch (error) {
    if (isDev()) {
      console.warn("[explain-risk] ollama_unavailable", {
        message: error.message,
        code: error.code,
      });
    }
  }

  return {
    explanation: buildFallbackExplanation(safeRisk, grouped),
    source: "fallback",
    factors: grouped,
  };
};

module.exports = {
  generateRiskExplanation,
};
