const axios = require("axios");

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "gemma3:4b";
// Keep the timeout short so the API stays responsive even when Ollama is
// unavailable or slow. If it doesn't answer in time, the deterministic
// template summary takes over via the fallback path. Override with
// OLLAMA_EXPLAIN_TIMEOUT_MS if you want to give the model more time.
const DEFAULT_TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = [
  "You are SIARA, a road safety assistant.",
  "Explain in plain language WHY the recommended route is the right choice for this driver.",
  "",
  "Use ONLY the structured data provided.",
  "Do not invent accident clusters, weather, or police reports that are not in the input.",
  "Keep the explanation short, maximum 3 sentences.",
  "Mention the recommended route type, the risk percent vs the fastest route, and the main reason it is safer (or that it is the fastest).",
  "Use simple language for a normal driver. No markdown, no bullet points.",
].join("\n");

const isDev = () => (process.env.NODE_ENV || "development") !== "production";

const safeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const roundTo = (value, digits = 1) => {
  const n = safeNumber(value);
  if (n == null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const normaliseLevel = (level, percent) => {
  const text = String(level || "").trim().toLowerCase();
  if (text === "extreme" || text === "critical" || text === "high") return "high";
  if (text === "moderate" || text === "medium") return "medium";
  if (text === "low") return "low";
  const n = safeNumber(percent);
  if (n == null) return "low";
  if (n >= 50) return "high";
  if (n >= 25) return "medium";
  return "low";
};

const titleCase = (text) => {
  if (!text) return "";
  return String(text).charAt(0).toUpperCase() + String(text).slice(1);
};

const findRoute = (routes, type) => {
  if (!Array.isArray(routes)) return null;
  return routes.find((r) => String(r?.route_type || "").toLowerCase() === type) || null;
};

const summaryOf = (route) => {
  if (!route || typeof route !== "object") return null;
  const summary = route.summary || {};
  return {
    route_type: String(route.route_type || "").toLowerCase() || null,
    danger_percent: safeNumber(summary.danger_percent),
    danger_level: summary.danger_level || null,
    duration_min: safeNumber(route.duration_min ?? route.eta_min),
    distance_km: safeNumber(route.distance_km),
    is_recommended: Boolean(route.is_recommended),
    segment_count: Array.isArray(route.segments) ? route.segments.length : 0,
  };
};

const countHighRiskSegments = (route) => {
  if (!route || !Array.isArray(route.segments)) return 0;
  let count = 0;
  for (const seg of route.segments) {
    const level = normaliseLevel(seg?.danger_level, seg?.danger_percent);
    if (level === "high") count += 1;
  }
  return count;
};

const buildComparison = (selected, alternatives) => {
  const fastest = findRoute(alternatives, "fastest");
  const safest = findRoute(alternatives, "safest");
  const balanced = findRoute(alternatives, "balanced");

  const fastestRisk = safeNumber(fastest?.summary?.danger_percent);
  const safestRisk = safeNumber(safest?.summary?.danger_percent);
  const balancedRisk = safeNumber(balanced?.summary?.danger_percent);

  const fastestEta = safeNumber(fastest?.duration_min ?? fastest?.eta_min);
  const safestEta = safeNumber(safest?.duration_min ?? safest?.eta_min);
  const balancedEta = safeNumber(balanced?.duration_min ?? balanced?.eta_min);

  const safestExtraMinutes =
    fastestEta != null && safestEta != null ? Math.max(0, safestEta - fastestEta) : null;
  const balancedExtraMinutes =
    fastestEta != null && balancedEta != null ? Math.max(0, balancedEta - fastestEta) : null;

  const recommendedReason = (() => {
    const type = String(selected?.route_type || "").toLowerCase();
    if (type === "safest") return "Lowest predicted risk along the route.";
    if (type === "fastest") return "Fastest arrival without significantly higher risk.";
    if (type === "balanced") return "Best tradeoff between travel time and predicted risk.";
    return "Recommended based on current risk and travel-time tradeoff.";
  })();

  return {
    fastestRisk: roundTo(fastestRisk, 1),
    safestRisk: roundTo(safestRisk, 1),
    balancedRisk: roundTo(balancedRisk, 1),
    fastestEtaMin: roundTo(fastestEta, 1),
    safestEtaMin: roundTo(safestEta, 1),
    balancedEtaMin: roundTo(balancedEta, 1),
    safestExtraMinutes: roundTo(safestExtraMinutes, 1),
    balancedExtraMinutes: roundTo(balancedExtraMinutes, 1),
    recommendedReason,
  };
};

const buildClusterReasons = (selected, alternatives, heatmapClustersNearRoute) => {
  const reasons = [];
  const clusters = Array.isArray(heatmapClustersNearRoute) ? heatmapClustersNearRoute : [];
  if (clusters.length === 0) return reasons;

  const highRiskClusters = clusters.filter((c) => {
    const level = normaliseLevel(c?.severity || c?.danger_level, c?.severity_score || c?.danger_percent);
    return level === "high";
  });

  if (highRiskClusters.length > 0) {
    reasons.push({
      type: "cluster",
      label: `Avoids ${highRiskClusters.length} high-risk accident ${highRiskClusters.length === 1 ? "cluster" : "clusters"}`,
      detail:
        highRiskClusters
          .slice(0, 2)
          .map((c) => c?.name || c?.label || c?.location_label || "high-density area")
          .join(" • ") || null,
      impact: "positive",
      impactLabel: highRiskClusters.length === 1 ? "−1 cluster" : `−${highRiskClusters.length} clusters`,
    });
  } else if (clusters.length > 0) {
    reasons.push({
      type: "cluster",
      label: `${clusters.length} accident ${clusters.length === 1 ? "cluster" : "clusters"} near route`,
      detail: "Lower-severity zones — proceed with caution.",
      impact: "neutral",
      impactLabel: "monitor",
    });
  }

  return reasons;
};

const buildSegmentReasons = (selected, alternatives) => {
  const reasons = [];
  const selectedHigh = countHighRiskSegments(selected);
  const fastest = findRoute(alternatives, "fastest");
  const fastestHigh = countHighRiskSegments(fastest);

  if (fastest && selected?.route_type !== "fastest" && fastestHigh > selectedHigh) {
    const skipped = fastestHigh - selectedHigh;
    reasons.push({
      type: "segment",
      label: `${skipped} high-risk road ${skipped === 1 ? "segment" : "segments"} skipped`,
      detail: "Compared to the fastest route alternative.",
      impact: "positive",
      impactLabel: `−${skipped} segment${skipped === 1 ? "" : "s"}`,
    });
  } else if (selectedHigh > 0) {
    reasons.push({
      type: "segment",
      label: `${selectedHigh} high-risk ${selectedHigh === 1 ? "segment" : "segments"} on route`,
      detail: "Stay alert and reduce speed in flagged areas.",
      impact: "negative",
      impactLabel: `${selectedHigh} segment${selectedHigh === 1 ? "" : "s"}`,
    });
  }

  return reasons;
};

const buildReportReasons = (nearbyReports) => {
  const reasons = [];
  if (!Array.isArray(nearbyReports) || nearbyReports.length === 0) return reasons;

  const verifiedCount = nearbyReports.filter((r) => {
    const verdict = String(r?.review_verdict || r?.verification_status || "").toLowerCase();
    return verdict === "verified" || verdict === "confirmed" || r?.is_police_verified === true;
  }).length;

  reasons.push({
    type: "reports",
    label: `${nearbyReports.length} recent ${nearbyReports.length === 1 ? "report" : "reports"} near route`,
    detail:
      verifiedCount > 0
        ? `${verifiedCount} police-verified, ${Math.max(0, nearbyReports.length - verifiedCount)} pending review`
        : "Pending review — confidence may be lower",
    impact: verifiedCount > 0 ? "negative" : "neutral",
    impactLabel: nearbyReports.length === 1 ? "1 report" : `${nearbyReports.length} reports`,
  });

  return reasons;
};

const buildTimeReasons = (timestamp) => {
  const reasons = [];
  if (!timestamp) return reasons;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return reasons;
  const hour = date.getHours();
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
    reasons.push({
      type: "time",
      label: "Rush hour traffic window",
      detail: `Departure at ${date.toTimeString().slice(0, 5)} — peak risk between 17:00–20:00.`,
      impact: "negative",
      impactLabel: "rush hour",
    });
  } else if (hour >= 22 || hour <= 5) {
    reasons.push({
      type: "time",
      label: "Night-time driving",
      detail: `Departure at ${date.toTimeString().slice(0, 5)} — lower visibility increases risk.`,
      impact: "negative",
      impactLabel: "night",
    });
  }
  return reasons;
};

const buildTradeoffReason = (selected, comparison) => {
  if (!selected || !comparison) return null;
  const type = String(selected?.route_type || "").toLowerCase();
  const selectedRisk = safeNumber(selected?.summary?.danger_percent);

  if (type === "fastest") return null;

  if (
    comparison.fastestEtaMin != null &&
    comparison.fastestRisk != null &&
    selectedRisk != null
  ) {
    const selectedEta = safeNumber(selected?.duration_min ?? selected?.eta_min);
    const extra =
      selectedEta != null ? Math.max(0, Math.round(selectedEta - comparison.fastestEtaMin)) : null;
    const riskDrop = Math.max(0, Math.round(comparison.fastestRisk - selectedRisk));
    if (extra != null && riskDrop > 0) {
      return {
        type: "tradeoff",
        label: extra === 0
          ? `Same ETA, ${riskDrop}% lower risk than fastest route`
          : `Adds ${extra} min for ${riskDrop}% lower risk`,
        detail: "Compared to the fastest route alternative.",
        impact: extra === 0 || riskDrop >= extra * 5 ? "positive" : "neutral",
        impactLabel: extra === 0 ? `−${riskDrop}% risk` : `+${extra} min`,
      };
    }
  }
  return null;
};

const buildTemplateSummary = (selected, comparison) => {
  const type = String(selected?.route_type || "balanced").toLowerCase();
  const selectedRisk = safeNumber(selected?.summary?.danger_percent);
  const fastestRisk = comparison?.fastestRisk;
  const selectedEta = safeNumber(selected?.duration_min ?? selected?.eta_min);
  const fastestEta = comparison?.fastestEtaMin;
  const label = titleCase(type);

  if (type === "fastest") {
    return `${label} route selected. Predicted risk is ${selectedRisk != null ? `${Math.round(selectedRisk)}%` : "estimated low"} along the way — no safer alternative offered a meaningful gain.`;
  }

  if (selectedRisk != null && fastestRisk != null && fastestRisk > selectedRisk) {
    const drop = Math.max(0, Math.round(fastestRisk - selectedRisk));
    const extra =
      selectedEta != null && fastestEta != null
        ? Math.max(0, Math.round(selectedEta - fastestEta))
        : null;
    if (drop > 0 && extra != null) {
      return `SIARA recommends the ${type} route because predicted risk drops by ${drop}% versus the fastest alternative. It adds about ${extra} minute${extra === 1 ? "" : "s"} but avoids the higher-risk corridor.`;
    }
    if (drop > 0) {
      return `SIARA recommends the ${type} route — predicted risk is ${drop}% lower than the fastest alternative.`;
    }
  }

  return `SIARA recommends the ${type} route based on the current balance of predicted risk and travel time.`;
};

const buildPrompt = ({ selected, comparison, reasons, destination, timestamp }) => {
  const payload = {
    recommended_route: {
      route_type: String(selected?.route_type || "balanced"),
      risk_percent: safeNumber(selected?.summary?.danger_percent),
      risk_level: selected?.summary?.danger_level || null,
      duration_min: safeNumber(selected?.duration_min ?? selected?.eta_min),
      distance_km: safeNumber(selected?.distance_km),
    },
    comparison,
    reasons: reasons.map((r) => ({
      type: r.type,
      label: r.label,
      detail: r.detail || null,
      impact: r.impact || null,
    })),
    destination: destination
      ? {
          name: destination.name || null,
          lat: safeNumber(destination.lat),
          lng: safeNumber(destination.lng),
        }
      : null,
    timestamp: timestamp || null,
  };

  return `${SYSTEM_PROMPT}\n\nRoute decision JSON:\n${JSON.stringify(payload, null, 2)}\n\nExplanation:`;
};

const sanitiseExplanation = (text) => {
  if (!text) return "";
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
        num_predict: 200,
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

const generateRouteExplanation = async ({
  selectedRoute,
  alternatives,
  destination,
  timestamp,
  heatmapClustersNearRoute,
  nearbyReports,
} = {}) => {
  const selected = selectedRoute && typeof selectedRoute === "object" ? selectedRoute : null;
  const altList = Array.isArray(alternatives) && alternatives.length > 0
    ? alternatives
    : selected
      ? [selected]
      : [];

  if (!selected) {
    return {
      summary: "No route is currently selected, so SIARA cannot explain the recommendation yet.",
      reasons: [],
      comparison: null,
      source: "fallback",
    };
  }

  const comparison = buildComparison(selected, altList);

  const reasons = [
    ...buildClusterReasons(selected, altList, heatmapClustersNearRoute),
    ...buildSegmentReasons(selected, altList),
    ...buildReportReasons(nearbyReports),
    ...buildTimeReasons(timestamp),
  ];

  const tradeoff = buildTradeoffReason(selected, comparison);
  if (tradeoff) reasons.push(tradeoff);

  const prompt = buildPrompt({
    selected: summaryOf(selected) || selected,
    comparison,
    reasons,
    destination,
    timestamp,
  });

  let summary = "";
  let source = "fallback";

  try {
    const raw = await callOllama(prompt);
    const text = sanitiseExplanation(raw);
    if (text) {
      summary = text;
      source = "ollama";
    }
  } catch (error) {
    if (isDev()) {
      console.warn("[explain-route] ollama_unavailable", {
        message: error?.message,
        code: error?.code,
      });
    }
  }

  if (!summary) {
    summary = buildTemplateSummary(selected, comparison);
  }

  const recommendedRouteType = String(selected?.route_type || "").toLowerCase() || null;
  const recommendedRiskPercent = safeNumber(selected?.summary?.danger_percent);
  const recommendedRiskLevel =
    selected?.summary?.danger_level || normaliseLevel(null, recommendedRiskPercent);

  return {
    summary,
    reasons,
    comparison,
    recommendedRouteType,
    recommendedRiskLevel,
    recommendedRiskPercent: roundTo(recommendedRiskPercent, 1),
    source,
  };
};

module.exports = {
  generateRouteExplanation,
};
