const router = require("express").Router();

const {
  cancelOperationalAlert,
  createOperationalAlert,
  createOperationalAlertFromTemplate,
  getOperationalAlertById,
  listOperationalAlertTemplates,
  listOperationalAlerts,
  normalizeTab,
  updateOperationalAlert,
} = require("../services/adminOperationalAlertsService");
const { verifyTokenAndAdmin } = require("./verifytoken");

function parseInteger(value, fallback, { min = 1, max = 100 } = {}) {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

router.get("/operational-alerts", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const payload = await listOperationalAlerts({
      tab: normalizeTab(req.query?.tab),
      search: req.query?.search || "",
      page: parseInteger(req.query?.page, 1, { min: 1, max: 1000 }),
      pageSize: parseInteger(req.query?.pageSize, 20, { min: 1, max: 100 }),
    });

    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get("/operational-alert-templates", verifyTokenAndAdmin, async (_req, res, next) => {
  try {
    const items = await listOperationalAlertTemplates();
    return res.status(200).json({ items });
  } catch (error) {
    return next(error);
  }
});

router.post("/operational-alerts/from-template", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const item = await createOperationalAlertFromTemplate(req.body, req.user.userId);
    return res.status(201).json({ item });
  } catch (error) {
    return next(error);
  }
});

router.get("/operational-alerts/:id", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const item = await getOperationalAlertById(req.params.id);
    return res.status(200).json({ item });
  } catch (error) {
    return next(error);
  }
});

router.post("/operational-alerts", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const item = await createOperationalAlert(req.body, req.user.userId);
    return res.status(201).json({ item });
  } catch (error) {
    return next(error);
  }
});

router.put("/operational-alerts/:id", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const item = await updateOperationalAlert(req.params.id, req.body, req.user.userId);
    return res.status(200).json({ item });
  } catch (error) {
    return next(error);
  }
});

router.patch("/operational-alerts/:id", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const item = await updateOperationalAlert(req.params.id, req.body, req.user.userId);
    return res.status(200).json({ item });
  } catch (error) {
    return next(error);
  }
});

router.post("/operational-alerts/:id/cancel", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const item = await cancelOperationalAlert(req.params.id, req.body?.note, req.user.userId);
    return res.status(200).json({ item });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
