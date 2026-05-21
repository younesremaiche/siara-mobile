// Admin System Settings endpoints.
//   GET    /api/admin/system-settings          → full per-tab payload
//   PATCH  /api/admin/system-settings          → save one or more keys
//   POST   /api/admin/system-settings/reset    → restore defaults

const router = require("express").Router();

const {
  getSystemSettings,
  updateSystemSettings,
  resetSystemSettings,
} = require("../services/adminSystemSettingsService");
const { verifyTokenAndAdmin } = require("./verifytoken");

router.get("/system-settings", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const settings = await getSystemSettings();
    return res.status(200).json(settings);
  } catch (error) {
    return next(error);
  }
});

router.patch("/system-settings", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const settings = await updateSystemSettings(req.body || {}, req.user);
    return res.status(200).json(settings);
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

router.post("/system-settings/reset", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const settings = await resetSystemSettings(req.user);
    return res.status(200).json(settings);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
