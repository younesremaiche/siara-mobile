const router = require("express").Router();

const { getDashboard } = require("../services/dashboardService");
const { verifyToken } = require("./verifytoken");

function parseBooleanQuery(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
  }

  return false;
}

router.get("/", verifyToken, async (req, res, next) => {
  try {
    const payload = await getDashboard(
      req.user.userId,
      { forceRefresh: parseBooleanQuery(req.query?.refresh) },
    );

    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
