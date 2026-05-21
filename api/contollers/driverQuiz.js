const router = require("express").Router();
const createError = require("http-errors");

const {
  startDriverQuiz,
  saveDriverQuizResponse,
  completeDriverQuiz,
  getDriverQuizProfile,
  listDriverQuizHistory,
  getDriverQuizAttempt,
  canViewDriverQuizProfile,
} = require("../services/driverQuizService");
const {
  verifyToken,
  verifyTokenAndAdmin,
  verifyTokenAndPolice,
} = require("./verifytoken");

function rethrowAsHttp(error) {
  if (error?.status && Number.isInteger(error.status)) {
    throw createError(error.status, error.message || "Driver quiz error");
  }
  throw error;
}

router.post("/start", verifyToken, async (req, res, next) => {
  try {
    const result = await startDriverQuiz(req.user.userId, {
      quizVersion: req.body?.quizVersion,
      totalQuestions: Number(req.body?.totalQuestions),
      metadata: req.body?.metadata,
    });
    return res.status(201).json(result);
  } catch (error) {
    try {
      rethrowAsHttp(error);
    } catch (httpError) {
      return next(httpError);
    }
    return next(error);
  }
});

router.post("/:attemptId/response", verifyToken, async (req, res, next) => {
  try {
    const result = await saveDriverQuizResponse(
      req.user.userId,
      req.params.attemptId,
      req.body || {},
    );
    return res.status(200).json(result);
  } catch (error) {
    try {
      rethrowAsHttp(error);
    } catch (httpError) {
      return next(httpError);
    }
    return next(error);
  }
});

router.post("/:attemptId/complete", verifyToken, async (req, res, next) => {
  try {
    const result = await completeDriverQuiz(req.user.userId, req.params.attemptId);
    return res.status(200).json(result);
  } catch (error) {
    try {
      rethrowAsHttp(error);
    } catch (httpError) {
      return next(httpError);
    }
    return next(error);
  }
});

router.get("/me/profile", verifyToken, async (req, res, next) => {
  try {
    const profile = await getDriverQuizProfile(req.user.userId);
    return res.status(200).json({ profile });
  } catch (error) {
    return next(error);
  }
});

router.get("/me/history", verifyToken, async (req, res, next) => {
  try {
    const history = await listDriverQuizHistory(req.user.userId, {
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    return res.status(200).json(history);
  } catch (error) {
    return next(error);
  }
});

router.get("/me/attempts/:attemptId", verifyToken, async (req, res, next) => {
  try {
    const data = await getDriverQuizAttempt(req.user.userId, req.params.attemptId);
    if (!data) {
      throw createError(404, "Quiz attempt not found");
    }
    return res.status(200).json(data);
  } catch (error) {
    try {
      rethrowAsHttp(error);
    } catch (httpError) {
      return next(httpError);
    }
    return next(error);
  }
});

async function handleScopedUserView(req, res, next) {
  try {
    const targetUserId = String(req.params.userId || "").trim();
    if (!targetUserId) {
      throw createError(400, "userId is required");
    }
    if (!canViewDriverQuizProfile(req.user, targetUserId)) {
      throw createError(403, "You are not allowed to view this user's quiz profile");
    }
    const [profile, history] = await Promise.all([
      getDriverQuizProfile(targetUserId),
      listDriverQuizHistory(targetUserId, {
        limit: req.query?.limit,
        offset: req.query?.offset,
      }),
    ]);
    return res.status(200).json({ userId: targetUserId, profile, history });
  } catch (error) {
    return next(error);
  }
}

router.get("/admin/users/:userId", verifyTokenAndAdmin, handleScopedUserView);
router.get("/police/users/:userId", verifyTokenAndPolice, handleScopedUserView);

module.exports = router;
