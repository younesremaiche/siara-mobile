const router = require("express").Router();
const createError = require("http-errors");

const {
  listMySubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
} = require("../services/dangerSubscriptionsService");
const { verifyToken } = require("./verifytoken");

function rethrow(error) {
  if (error?.status && Number.isInteger(error.status)) {
    return createError(error.status, error.message);
  }
  return error;
}

router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");
    const result = await listMySubscriptions(userId);
    return res.status(200).json(result);
  } catch (error) {
    return next(rethrow(error));
  }
});

router.post("/", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");
    const result = await createSubscription(userId, req.body || {});
    return res.status(201).json(result);
  } catch (error) {
    return next(rethrow(error));
  }
});

router.patch("/:id", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");
    const result = await updateSubscription(userId, req.params.id, req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return next(rethrow(error));
  }
});

router.delete("/:id", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");
    const result = await deleteSubscription(userId, req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(rethrow(error));
  }
});

module.exports = router;
