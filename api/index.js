const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const cors = require("cors");
const cookieParser = require("cookie-parser");
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
app.use(cors({ origin: true, credentials: true }));
dotenv.config();
app.use(cookieParser());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.json());

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

app.listen(process.env.PORT_NUM || 5000, () => {
  console.log("Backend server is running !!");
});

