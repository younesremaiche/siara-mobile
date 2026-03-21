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
const adminOperationalAlertRoutes = require("./contollers/adminOperationalAlerts");
const adminOverviewRoutes = require("./contollers/adminOverview");
const adminZonesRoutes = require("./contollers/adminZones");
const adminAreaRoutes = require("./contollers/adminAreas");
const alertRoutes = require("./contollers/alerts");
const emailRoutes = require("./contollers/emails");
const dashboardRoutes = require("./contollers/dashboard");
const notificationRoutes = require("./contollers/notifications");
const pushRoutes = require("./contollers/push");
const reportRoutes = require("./contollers/reports");
const { startNotificationListener } = require("./services/notificationListener");
const { initializeNotificationSocketServer } = require("./services/notificationSocket");
const { startWeeklySummaryScheduler } = require("./services/weeklySummaryScheduler");
const {
  predictDriverRisk,
  predictCurrentRisk,
  predictRiskOverlay,
  predictRiskExplain,
  predictNearbyZones,
  predictRouteGuide,
  getCurrentWeather,
  getRiskForecast24h,
} = require("./contollers/Model/models");

const app = express();
const httpServer = http.createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(cookieParser());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminIncidentRoutes);
app.use("/api/admin", adminOperationalAlertRoutes);
app.use("/api/admin", adminOverviewRoutes);
app.use("/api/admin", adminZonesRoutes);
app.use("/api/admin-areas", adminAreaRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/reports", reportRoutes);

app.post("/api/model/predict", predictDriverRisk);
app.get("/api/weather/current", getCurrentWeather);
app.post("/api/risk/current", predictCurrentRisk);
app.get("/api/risk/forecast24h", getRiskForecast24h);
app.post("/api/risk/overlay", predictRiskOverlay);
app.post("/api/risk/explain", predictRiskExplain);
app.post("/api/risk/nearby-zones", predictNearbyZones);
app.post("/api/risk/route", predictRouteGuide);

// Compatibility aliases
app.get("/api/model/weather/current", getCurrentWeather);
app.post("/api/model/risk/current", predictCurrentRisk);
app.get("/api/model/risk/forecast24h", getRiskForecast24h);
app.post("/api/model/risk/overlay", predictRiskOverlay);
app.post("/api/model/risk/explain", predictRiskExplain);
app.post("/api/model/risk/nearby-zones", predictNearbyZones);
app.post("/api/model/risk/route", predictRouteGuide);


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

