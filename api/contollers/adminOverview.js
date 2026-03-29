const router = require("express").Router();

const { getAdminOverview, normalizeRange } = require("../services/adminOverviewService");
const { verifyTokenAndAdmin } = require("./verifytoken");

router.get("/overview", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const range = normalizeRange(req.query?.range);
    const payload = await getAdminOverview(range);

    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
