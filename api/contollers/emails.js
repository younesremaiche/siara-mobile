const router = require("express").Router();

const { verifyTokenAndAdmin } = require("./verifytoken");
const { runWeeklySummaryJob } = require("../services/weeklySummaryService");

router.post("/weekly-summary/run", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const result = await runWeeklySummaryJob({
      targetUserId: req.body.userId || null,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
