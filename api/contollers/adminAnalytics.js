// Admin analytics endpoint — feeds the Advanced Analytics dashboard.
// Returns every section the UI renders in a single payload so the page can
// fetch once on mount / period change and avoid a flicker between sections.

const router = require("express").Router();

const {
  getAnalyticsOverview,
  normalizePeriod,
} = require("../services/adminAnalyticsService");
const { verifyTokenAndAdmin } = require("./verifytoken");

router.get("/analytics", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const period = normalizePeriod(req.query?.period);
    const payload = await getAnalyticsOverview(period);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
