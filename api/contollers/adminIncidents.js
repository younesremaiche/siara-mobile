const router = require("express").Router();

const {
  applyAdminIncidentAction,
  getAdminIncidentDetail,
  listAdminIncidents,
  normalizeIncidentFilter,
  normalizeSortDir,
  normalizeSortField,
} = require("../services/adminIncidentService");
const { verifyTokenAndAdmin } = require("./verifytoken");

function normalizeIntParam(value, fallback, { min = 0, max = 500 } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

router.get("/incidents", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const payload = await listAdminIncidents({
      filter: normalizeIncidentFilter(req.query?.filter),
      search: req.query?.search || "",
      sortField: normalizeSortField(req.query?.sortField),
      sortDir: normalizeSortDir(req.query?.sortDir),
      limit: normalizeIntParam(req.query?.limit, 250),
      offset: normalizeIntParam(req.query?.offset, 0),
    });

    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get("/incidents/:id", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const incident = await getAdminIncidentDetail(req.params.id);
    return res.status(200).json({ incident });
  } catch (error) {
    return next(error);
  }
});

router.post("/incidents/:id/actions", verifyTokenAndAdmin, async (req, res, next) => {
  try {
    const incident = await applyAdminIncidentAction(
      req.params.id,
      {
        action: req.body?.action,
        note: req.body?.note,
        severity: req.body?.severity,
        mergeTargetReportId: req.body?.mergeTargetReportId,
      },
      req.user.userId,
    );

    return res.status(200).json({ incident });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
