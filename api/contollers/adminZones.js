const router = require("express").Router();

const {
  getZoneDetails,
  getZoneMap,
  normalizeZoneMetric,
  normalizeZonePeriod,
  rebuildZoneRiskSummary,
} = require("../services/adminZonesService");
const { verifyTokenAndAdmin } = require("./verifytoken");

router.get("/zones/map", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const payload = await getZoneMap(
      normalizeZonePeriod(req.query?.period),
      normalizeZoneMetric(req.query?.metric),
    );

    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get("/zones/:id/details", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const payload = await getZoneDetails(
      req.params.id,
      normalizeZonePeriod(req.query?.period),
    );

    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.post("/zones/rebuild-summary", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const payload = await rebuildZoneRiskSummary(normalizeZonePeriod(req.body?.period));
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
