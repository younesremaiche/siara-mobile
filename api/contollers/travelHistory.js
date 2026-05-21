const router = require("express").Router();
const createError = require("http-errors");

const {
  listMyTravelHistory,
  getTravelHistoryDetail,
  completeTravelHistory,
  updateTravelHistoryRating,
  getMySafetySummary,
} = require("../services/travelHistoryService");
const { verifyToken } = require("./verifytoken");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureUuid(value, label = "id") {
  const text = String(value || "").trim();
  if (!UUID_REGEX.test(text)) {
    throw createError(400, `Invalid ${label}`);
  }
  return text;
}

function rethrow(error) {
  if (error?.status && Number.isInteger(error.status)) {
    return createError(error.status, error.message || "Travel history error");
  }
  return error;
}

router.get("/me", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");
    const result = await listMyTravelHistory(userId, {
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(rethrow(error));
  }
});

router.get("/me/safety-summary", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");
    const result = await getMySafetySummary(userId);
    return res.status(200).json(result);
  } catch (error) {
    return next(rethrow(error));
  }
});

router.post("/complete", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");
    const result = await completeTravelHistory(userId, req.body || {});
    return res.status(201).json(result);
  } catch (error) {
    return next(rethrow(error));
  }
});

router.get("/:id", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");
    const id = ensureUuid(req.params.id, "travel history id");
    const item = await getTravelHistoryDetail(userId, id);
    if (!item) throw createError(404, "Travel history not found");
    return res.status(200).json(item);
  } catch (error) {
    return next(rethrow(error));
  }
});

router.patch("/:id/rating", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");
    const id = ensureUuid(req.params.id, "travel history id");
    const result = await updateTravelHistoryRating(userId, id, {
      rating: req.body?.rating,
      feedbackText: req.body?.feedbackText,
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(rethrow(error));
  }
});

module.exports = router;
