const router = require("express").Router();
const createError = require("http-errors");

const {
  listAdminUsers,
  listAdminRoles,
  getAdminUserDetails,
  updateAdminUserStatus,
  updateAdminUserRoles,
  recalculateUserTrustScoreForAdmin,
} = require("../services/adminUsersService");
const { verifyTokenAndAdmin } = require("./verifytoken");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureUuid(value) {
  const text = String(value || "").trim();
  if (!UUID_REGEX.test(text)) {
    throw createError(400, "Invalid user id");
  }
  return text;
}

function rethrow(error) {
  if (error?.status && Number.isInteger(error.status)) {
    throw createError(error.status, error.message || "Admin users error");
  }
  throw error;
}

router.get("/", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const result = await listAdminUsers(req.query || {});
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.get("/roles", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const roles = await listAdminRoles();
    return res.status(200).json({ roles });
  } catch (error) {
    return next(error);
  }
});

router.get("/:userId", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const userId = ensureUuid(req.params.userId);
    const user = await getAdminUserDetails(userId);
    if (!user) throw createError(404, "User not found");
    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:userId/status", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const userId = ensureUuid(req.params.userId);
    const user = await updateAdminUserStatus(
      userId,
      {
        status: req.body?.status,
        note: req.body?.note,
        reason: req.body?.reason,
        bannedUntil: req.body?.bannedUntil ?? req.body?.banned_until ?? null,
        warningReason: req.body?.warningReason ?? req.body?.warning_reason ?? null,
        warningExpiresAt:
          req.body?.warningExpiresAt ?? req.body?.warning_expires_at ?? null,
      },
      req.user,
    );
    return res.status(200).json({ user });
  } catch (error) {
    try {
      rethrow(error);
    } catch (httpError) {
      return next(httpError);
    }
    return next(error);
  }
});

router.patch("/:userId/roles", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const userId = ensureUuid(req.params.userId);
    const user = await updateAdminUserRoles(
      userId,
      { roles: req.body?.roles },
      req.user,
    );
    return res.status(200).json({ user });
  } catch (error) {
    try {
      rethrow(error);
    } catch (httpError) {
      return next(httpError);
    }
    return next(error);
  }
});

router.post("/:userId/recalculate-trust", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const userId = ensureUuid(req.params.userId);
    const user = await recalculateUserTrustScoreForAdmin(userId, req.user);
    return res.status(200).json({ user });
  } catch (error) {
    try {
      rethrow(error);
    } catch (httpError) {
      return next(httpError);
    }
    return next(error);
  }
});

module.exports = router;
