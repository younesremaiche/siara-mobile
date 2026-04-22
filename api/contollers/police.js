const router = require("express").Router();

const {
  assignIncidentBySupervisor,
  assignSelfToIncident,
  createSupervisorAlert,
  getIncidentById,
  getPoliceDashboard,
  getPoliceMe,
  getPoliceWorkZoneOptions,
  listPoliceAlerts,
  listPoliceIncidents,
  listPoliceOperationHistory,
  listSupervisorOfficers,
  markPoliceAlertAsRead,
  rejectIncident,
  requestIncidentBackup,
  updateIncidentStatus,
  updatePoliceLocation,
  updatePoliceWorkZone,
  verifyIncident,
  addIncidentFieldNote,
  addManualPoliceHistoryEntry,
  normalizeIncidentListParams,
} = require("../services/policeService");
const {
  verifyTokenAndPolice,
  verifyToken,
} = require("./verifytoken");

async function requirePoliceSupervisor(req, res, next) {
  try {
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get("/me", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await getPoliceMe(req.user.userId));
  } catch (error) {
    return next(error);
  }
});

router.get("/work-zone/options", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await getPoliceWorkZoneOptions(req.user.userId, req.query || {}));
  } catch (error) {
    return next(error);
  }
});

router.put("/me/work-zone", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await updatePoliceWorkZone(req.user.userId, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.post("/me/location", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await updatePoliceLocation(req.user.userId, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.get("/dashboard", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await getPoliceDashboard(req.user.userId));
  } catch (error) {
    return next(error);
  }
});

router.get("/incidents", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await listPoliceIncidents(req.user.userId, normalizeIncidentListParams(req.query || {})));
  } catch (error) {
    return next(error);
  }
});

router.get("/incidents/:id", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await getIncidentById(req.user.userId, req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.post("/incidents/:id/verify", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await verifyIncident(req.user.userId, req.params.id, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.post("/incidents/:id/reject", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await rejectIncident(req.user.userId, req.params.id, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.post("/incidents/:id/request-backup", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await requestIncidentBackup(req.user.userId, req.params.id, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.post("/incidents/:id/assign-self", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await assignSelfToIncident(req.user.userId, req.params.id, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.post("/incidents/:id/status", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await updateIncidentStatus(req.user.userId, req.params.id, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.post("/incidents/:id/field-note", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await addIncidentFieldNote(req.user.userId, req.params.id, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.get("/alerts", verifyTokenAndPolice, async (req, res, next) => {
  try {
    const page = req.query?.page ? Number.parseInt(req.query.page, 10) : undefined;
    const pageSize = req.query?.pageSize ? Number.parseInt(req.query.pageSize, 10) : undefined;
    return res.status(200).json(await listPoliceAlerts(req.user.userId, { page, pageSize }));
  } catch (error) {
    return next(error);
  }
});

router.patch("/alerts/:id/read", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json({
      notification: await markPoliceAlertAsRead(req.user.userId, req.params.id),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/operation-history", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await listPoliceOperationHistory(req.user.userId, req.query || {}));
  } catch (error) {
    return next(error);
  }
});

router.post("/operation-history/manual", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(201).json(await addManualPoliceHistoryEntry(req.user.userId, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.get("/supervisor/officers", verifyTokenAndPolice, requirePoliceSupervisor, async (req, res, next) => {
  try {
    return res.status(200).json(await listSupervisorOfficers(req.user, req.query || {}));
  } catch (error) {
    return next(error);
  }
});

router.post("/supervisor/alerts", verifyTokenAndPolice, requirePoliceSupervisor, async (req, res, next) => {
  try {
    return res.status(201).json(await createSupervisorAlert(req.user, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.post("/supervisor/incidents/:id/assign", verifyTokenAndPolice, requirePoliceSupervisor, async (req, res, next) => {
  try {
    return res.status(200).json(await assignIncidentBySupervisor(req.user, req.params.id, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

