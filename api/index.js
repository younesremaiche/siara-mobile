const express = require("express");
const http = require("http");
const path = require("path");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const cors = require("cors");
const cookieParser = require("cookie-parser");
dotenv.config({
  path: path.join(__dirname, ".env"),
  override: process.env.NODE_ENV !== "production",
});
const pool = require("./db");
const authRoutes = require("./contollers/auth");
const adminIncidentRoutes = require("./contollers/adminIncidents");
const adminModelRoutes = require("./contollers/adminModels");
const adminOperationalAlertRoutes = require("./contollers/adminOperationalAlerts");
const adminOverviewRoutes = require("./contollers/adminOverview");
const adminZonesRoutes = require("./contollers/adminZones");
const adminAreaRoutes = require("./contollers/adminAreas");
const alertRoutes = require("./contollers/alerts");
const emailRoutes = require("./contollers/emails");
const dashboardRoutes = require("./contollers/dashboard");
const notificationRoutes = require("./contollers/notifications");
const policeRoutes = require("./contollers/police");
const pushRoutes = require("./contollers/push");
const reportRoutes = require("./contollers/reports");
const driverQuizRoutes = require("./contollers/driverQuiz");
const occurrenceRiskRoutes = require("./contollers/occurrenceRisk");
const occurrenceModelRoutes = require("./contollers/occurrenceModel");
const adminUsersRoutes = require("./contollers/adminUsers");
const adminAnalyticsRoutes = require("./contollers/adminAnalytics");
const adminSystemSettingsRoutes = require("./contollers/adminSystemSettings");
const reportDangerHeatmapRoutes = require("./contollers/reportDangerHeatmap");
const travelHistoryRoutes = require("./contollers/travelHistory");
const dangerSubscriptionRoutes = require("./contollers/dangerSubscriptions");
const accountRoutes = require("./contollers/account");
const userPreferencesRoutes = require("./contollers/userPreferences");
const userLocationRoutes = require("./contollers/userLocation");
const { startNotificationListener } = require("./services/notificationListener");
const { initializeNotificationSocketServer } = require("./services/notificationSocket");
const { startWeeklySummaryScheduler } = require("./services/weeklySummaryScheduler");
const { ensureLocalUploadRoot } = require("./services/reportMediaStorage");
const {
  predictDriverRisk,
  predictDriverRiskStream,
  predictCurrentRisk,
  predictRiskOverlay,
  predictRiskExplain,
  predictNearbyZones,
  predictRouteGuide,
  testQuizExplanation,
  getCurrentWeather,
  getReversePlace,
  getRiskForecast24h,
} = require("./contollers/Model/models");
const { generateRiskExplanation } = require("./services/riskExplanationService");
const { generateRouteExplanation } = require("./services/routeExplanationService");
const { findRouteAlerts } = require("./services/routeAlertsService");
const { getZoneProfile } = require("./services/zoneProfileService");
const { withRiskDeadline } = require("./services/riskTimeouts");

const app = express();
const httpServer = http.createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(cookieParser());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Serve trained-model assets (calibration curves, importance plots) for Admin
// pages. Read-only on disk; safe to expose because they contain no PII.
app.use(
  "/model-assets",
  express.static(path.join(__dirname, "occurrence-model"), {
    index: false,
    fallthrough: true,
  }),
);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminIncidentRoutes);
app.use("/api/admin", adminModelRoutes);
app.use("/api/admin", adminOperationalAlertRoutes);
app.use("/api/admin", adminOverviewRoutes);
app.use("/api/admin", adminZonesRoutes);
app.use("/api/admin", adminAnalyticsRoutes);
app.use("/api/admin", adminSystemSettingsRoutes);
app.use("/api/admin-areas", adminAreaRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/police", policeRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/driver-quiz", driverQuizRoutes);
app.use("/api/occurrence-risk", occurrenceRiskRoutes);
// Trained occurrence_beta_v1 model proxy. Lives alongside the rule-based
// /api/occurrence-risk surface above and never replaces it.
app.use("/api/risk/occurrence", occurrenceModelRoutes);
app.use("/api/model/risk/occurrence", occurrenceModelRoutes);
// Spec aliases for police/admin scoped occurrence-risk routes.
app.use("/api/admin/users", (req, res, next) => {
  const match = req.path.match(/^\/([^/]+)\/occurrence-risk\/?$/);
  if (!match) return next();
  req.url = `/admin/users/${encodeURIComponent(match[1])}`;
  return occurrenceRiskRoutes(req, res, next);
});
app.use("/api/police/users", (req, res, next) => {
  const match = req.path.match(/^\/([^/]+)\/occurrence-risk\/?$/);
  if (!match) return next();
  req.url = `/police/users/${encodeURIComponent(match[1])}`;
  return occurrenceRiskRoutes(req, res, next);
});
// Spec aliases: /api/admin/users/:userId/driver-quiz and /api/police/users/:userId/driver-quiz
app.use("/api/admin/users", (req, res, next) => {
  const match = req.path.match(/^\/([^/]+)\/driver-quiz\/?$/);
  if (!match) return next();
  req.url = `/admin/users/${encodeURIComponent(match[1])}`;
  return driverQuizRoutes(req, res, next);
});
app.use("/api/police/users", (req, res, next) => {
  const match = req.path.match(/^\/([^/]+)\/driver-quiz\/?$/);
  if (!match) return next();
  req.url = `/police/users/${encodeURIComponent(match[1])}`;
  return driverQuizRoutes(req, res, next);
});
// Admin users management. Mounted AFTER the alias middlewares above so that
// /api/admin/users/:userId/{driver-quiz,occurrence-risk} still resolve first.
app.use("/api/admin/users", adminUsersRoutes);

app.use("/api/map", reportDangerHeatmapRoutes);
app.use("/api/travel-history", travelHistoryRoutes);
app.use("/api/danger-subscriptions", dangerSubscriptionRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/users/me/preferences", userPreferencesRoutes);
app.use("/api/users/me/location", userLocationRoutes);

app.get("/api/zone-profiles", async (req, res, next) => {
  try {
    const lat = Number(req.query?.lat);
    const lng = Number(req.query?.lng ?? req.query?.lon);
    const radiusMeters = Number(req.query?.radiusMeters) || 500;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "lat and lng query parameters are required" });
    }
    const result = await getZoneProfile({ lat, lng, radiusMeters });
    return res.status(200).json(result);
  } catch (error) {
    if (error?.status && Number.isInteger(error.status)) {
      return res.status(error.status).json({ error: error.message });
    }
    return next(error);
  }
});

app.get("/api/road-profiles/:id", async (req, res, next) => {
  try {
    const lat = Number(req.query?.lat);
    const lng = Number(req.query?.lng ?? req.query?.lon);
    const radiusMeters = Number(req.query?.radiusMeters) || 250;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        error:
          "Road profiles by id are not yet supported — pass lat, lng, and radiusMeters query parameters to use the zone-based fallback.",
      });
    }
    const result = await getZoneProfile({ lat, lng, radiusMeters });
    return res.status(200).json({ ...result, roadId: req.params.id });
  } catch (error) {
    if (error?.status && Number.isInteger(error.status)) {
      return res.status(error.status).json({ error: error.message });
    }
    return next(error);
  }
});

app.post("/api/model/predict", predictDriverRisk);
app.post("/api/model/predict/stream", predictDriverRiskStream);
app.get("/api/model/quiz/explanation/test", testQuizExplanation);
app.post("/api/model/quiz/explanation/test", testQuizExplanation);
app.get("/api/weather/current", withRiskDeadline(getCurrentWeather));
app.get("/api/location/reverse", getReversePlace);
app.post("/api/risk/current", withRiskDeadline(predictCurrentRisk));
app.get("/api/risk/forecast24h", withRiskDeadline(getRiskForecast24h));
app.post("/api/risk/overlay", withRiskDeadline(predictRiskOverlay));
app.post("/api/risk/explain", withRiskDeadline(predictRiskExplain));
app.post("/api/predictions/explain-risk", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const risk = body.risk && typeof body.risk === "object" ? body.risk : null;
  const weather = body.weather && typeof body.weather === "object" ? body.weather : null;
  const xai = body.xai && typeof body.xai === "object" ? body.xai : null;
  const rawPrediction =
    body.rawPrediction && typeof body.rawPrediction === "object" ? body.rawPrediction : null;

  if (!risk) {
    return res
      .status(400)
      .json({ ok: false, error: "risk payload is required" });
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("[explain-risk] received", {
      riskKeys: Object.keys(risk),
      hasWeather: Boolean(weather),
      hasXai: Boolean(xai),
      rawPredictionKeys: rawPrediction ? Object.keys(rawPrediction) : [],
    });
  }

  try {
    const result = await generateRiskExplanation({ risk, weather, xai, rawPrediction });
    return res.json({ ok: true, ...result });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[explain-risk] failure", error);
    }
    return res.status(200).json({
      ok: true,
      explanation:
        "SIARA could not generate a detailed explanation right now, so this result is based on the available prediction context only.",
      source: "fallback",
    });
  }
});
app.post("/api/risk/nearby-zones", withRiskDeadline(predictNearbyZones));
app.post("/api/risk/route", withRiskDeadline(predictRouteGuide));

const runRouteGuideOnce = async ({ origin, destination, timestamp, maxAlternatives = 3 }) => {
  let captured = { statusCode: null, data: null };
  const fakeReq = {
    body: {
      origin,
      destination,
      timestamp,
      max_alternatives: maxAlternatives,
    },
  };
  const fakeRes = {
    status(code) {
      captured.statusCode = code;
      return {
        json(data) {
          captured.data = data;
          return fakeRes;
        },
      };
    },
    json(data) {
      if (captured.statusCode == null) captured.statusCode = 200;
      captured.data = data;
      return fakeRes;
    },
  };
  try {
    await predictRouteGuide(fakeReq, fakeRes);
  } catch (error) {
    return { ok: false, error: error?.message || "route guide failed" };
  }
  if (captured.statusCode !== 200 || !captured.data) {
    return {
      ok: false,
      error: captured.data?.error || `route guide failed (${captured.statusCode || "no_status"})`,
    };
  }
  return { ok: true, data: captured.data };
};

const formatDepartureLabel = (offsetMs) => {
  const ms = Number(offsetMs);
  if (!Number.isFinite(ms) || Math.abs(ms) < 60 * 1000) return "Now";
  const minutes = Math.round(ms / 60000);
  if (Math.abs(minutes) < 60) {
    return minutes > 0 ? `+${minutes} min` : `${minutes} min`;
  }
  const hours = minutes / 60;
  const rounded = Math.abs(hours) >= 2 ? Math.round(hours) : Math.round(hours * 10) / 10;
  return rounded > 0 ? `+${rounded} h` : `${rounded} h`;
};

app.post("/api/risk/route/departure-options", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const origin = body.origin;
  const destination = body.destination;
  const rawTimestamps = Array.isArray(body.timestamps) ? body.timestamps : [];
  const timestamps = rawTimestamps
    .map((ts) => {
      if (!ts) return null;
      const date = new Date(ts);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    })
    .filter(Boolean)
    .slice(0, 6);

  if (!origin || !destination || timestamps.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "origin, destination and timestamps[] are required",
    });
  }

  const baseTimeMs = (() => {
    const first = new Date(timestamps[0]);
    return Number.isNaN(first.getTime()) ? Date.now() : first.getTime();
  })();

  try {
    const settled = await Promise.allSettled(
      timestamps.map((ts) => runRouteGuideOnce({ origin, destination, timestamp: ts })),
    );

    const options = settled.map((entry, index) => {
      const ts = timestamps[index];
      const offsetMs = new Date(ts).getTime() - baseTimeMs;
      const label = formatDepartureLabel(offsetMs);
      if (entry.status !== "fulfilled" || !entry.value?.ok) {
        return {
          timestamp: ts,
          label,
          etaMin: null,
          distanceKm: null,
          riskPercent: null,
          riskLevel: null,
          recommendedRouteType: null,
          ok: false,
          error: entry.status === "rejected" ? entry.reason?.message : entry.value?.error || "failed",
        };
      }
      const data = entry.value.data;
      const routes = Array.isArray(data?.routes) ? data.routes : [];
      const rec = routes.find((r) => r?.is_recommended) || routes[0] || null;
      const dangerPercent = Number(rec?.summary?.danger_percent);
      return {
        timestamp: ts,
        label,
        etaMin: Number.isFinite(Number(rec?.duration_min)) ? Number(rec.duration_min) : null,
        distanceKm: Number.isFinite(Number(rec?.distance_km)) ? Number(rec.distance_km) : null,
        riskPercent: Number.isFinite(dangerPercent) ? dangerPercent : null,
        riskLevel: rec?.summary?.danger_level || null,
        recommendedRouteType: rec?.route_type || null,
        ok: true,
      };
    });

    const usable = options.filter((opt) => opt.ok && Number.isFinite(Number(opt.riskPercent)));
    const bestOption = usable.length
      ? usable.reduce((best, current) =>
          Number(current.riskPercent) < Number(best.riskPercent) ? current : best,
        )
      : null;

    return res.json({ ok: true, options, bestOption });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[departure-options] failure", error);
    }
    return res.status(500).json({
      ok: false,
      error: "Failed to evaluate departure options",
    });
  }
});

app.post("/api/navigation/route-alerts", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const routeSnapshot =
    body.routeSnapshot && typeof body.routeSnapshot === "object" ? body.routeSnapshot : null;
  const userLocation =
    body.userLocation && typeof body.userLocation === "object" ? body.userLocation : null;
  const destination =
    body.destination && typeof body.destination === "object" ? body.destination : null;
  const lookAheadKm = Number(body.lookAheadKm);
  const since = body.since || null;

  if (!routeSnapshot || !Array.isArray(routeSnapshot.path) || routeSnapshot.path.length < 2) {
    return res.status(400).json({
      ok: false,
      error: "routeSnapshot.path with at least 2 points is required",
    });
  }

  try {
    const result = await findRouteAlerts({
      routeSnapshot,
      userLocation,
      destination,
      lookAheadKm: Number.isFinite(lookAheadKm) && lookAheadKm > 0 ? lookAheadKm : undefined,
      since,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[route-alerts] failure", error);
    }
    return res.status(500).json({
      ok: false,
      error: "Failed to evaluate route alerts",
    });
  }
});

app.post("/api/risk/route/explain", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const selectedRoute =
    body.selectedRoute && typeof body.selectedRoute === "object" ? body.selectedRoute : null;
  const alternatives = Array.isArray(body.alternatives) ? body.alternatives : [];
  const destination =
    body.destination && typeof body.destination === "object" ? body.destination : null;
  const timestamp = body.timestamp || null;
  const heatmapClustersNearRoute = Array.isArray(body.heatmapClustersNearRoute)
    ? body.heatmapClustersNearRoute
    : [];
  const nearbyReports = Array.isArray(body.nearbyReports) ? body.nearbyReports : [];

  if (!selectedRoute) {
    return res.status(400).json({ ok: false, error: "selectedRoute is required" });
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("[explain-route] received", {
      selectedRouteType: selectedRoute?.route_type || null,
      alternativesCount: alternatives.length,
      heatmapClustersCount: heatmapClustersNearRoute.length,
      nearbyReportsCount: nearbyReports.length,
      hasDestination: Boolean(destination),
      timestamp: timestamp || null,
    });
  }

  try {
    const result = await generateRouteExplanation({
      selectedRoute,
      alternatives,
      destination,
      timestamp,
      heatmapClustersNearRoute,
      nearbyReports,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[explain-route] failure", error);
    }
    return res.status(200).json({
      ok: true,
      summary:
        "SIARA could not generate a detailed route explanation right now. The selected route is still based on the latest risk analysis.",
      reasons: [],
      comparison: null,
      source: "fallback",
    });
  }
});

// Compatibility aliases
app.get("/api/model/weather/current", withRiskDeadline(getCurrentWeather));
app.get("/api/model/location/reverse", getReversePlace);
app.post("/api/model/risk/current", withRiskDeadline(predictCurrentRisk));
app.get("/api/model/risk/forecast24h", withRiskDeadline(getRiskForecast24h));
app.post("/api/model/risk/overlay", withRiskDeadline(predictRiskOverlay));
app.post("/api/model/risk/explain", withRiskDeadline(predictRiskExplain));
app.post("/api/model/risk/nearby-zones", withRiskDeadline(predictNearbyZones));
app.post("/api/model/risk/route", withRiskDeadline(predictRouteGuide));


async function runStartupChecks() {
  try {
    const result = await pool.query(`
      SELECT
        NOW() AS now,
        current_database() AS current_database,
        current_user AS current_user,
        PostGIS_Version() AS postgis_version,
        (
          SELECT id
          FROM ml.model_versions
          WHERE is_active = true
            AND lower(coalesce(status, '')) IN ('deployed', 'active')
          ORDER BY created_at DESC
          LIMIT 1
        ) AS active_model_version_id,
        (
          SELECT count(*)::bigint
          FROM gis.road_segments
        ) AS road_segment_count
    `);
    const row = result.rows[0] || {};
    console.info("[startup] database_ready", row);

    if (!row.active_model_version_id) {
      console.warn("[startup] missing_active_model_version", {
        schema: "ml.model_versions",
      });
    }

    if (Number(row.road_segment_count || 0) <= 0) {
      console.warn("[startup] empty_road_segments", {
        schema: "gis.road_segments",
      });
    }
  } catch (error) {
    console.error("[startup] database_check_failed", {
      message: error.message,
      code: error.code || null,
      detail: error.detail || null,
      table: error.table || null,
      schema: error.schema || null,
    });
  }
}

runStartupChecks();
ensureLocalUploadRoot().catch((error) => {
  console.warn("[startup] upload_root_create_failed", { message: error?.message });
});
initializeNotificationSocketServer(httpServer, {
  cors: {
    origin: allowedOrigin,
    credentials: true,
  },
});
startNotificationListener();
startWeeklySummaryScheduler();

app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});


httpServer.listen(process.env.PORT_NUM || 5000, () => {
  console.log("Backend server is running !!");
});

