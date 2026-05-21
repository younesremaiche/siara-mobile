const router = require("express").Router();

const pool = require("../db");
const {
  assignIncidentBySupervisor,
  assignSelfToIncident,
  createSupervisorAlert,
  getIncidentById,
  getPoliceDashboard,
  getPoliceMe,
  getPoliceWorkZoneOptions,
  listAssignableOfficersForIncident,
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
  deleteIncidentFieldNote,
  updateIncidentFieldNote,
  normalizeIncidentListParams,
} = require("../services/policeService");
const {
  verifyTokenAndPolice,
  verifyToken,
  hasAnyRole,
  hasRole,
  POLICE_SUPERVISOR_ROLE_NAMES,
} = require("./verifytoken");
const { getPriorityQueue } = require("../services/policePriorityQueueService");
const {
  getSupervisorDashboard,
  getSupervisorAnalytics,
  getSupervisorGlobalMap,
} = require("../services/supervisorService");

async function requirePoliceSupervisor(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (hasAnyRole(req.user, POLICE_SUPERVISOR_ROLE_NAMES) || hasRole(req.user, "admin")) {
      return next();
    }

    // Fallback: a user can also act as supervisor if at least one police profile
    // lists them as supervisor_user_id, even when role normalization differs.
    const result = await pool.query(
      `
        SELECT 1
        FROM app.police_profiles
        WHERE supervisor_user_id = $1::uuid
        LIMIT 1
      `,
      [userId],
    );

    if (result.rowCount > 0) {
      return next();
    }

    return res.status(403).json({ error: "Police supervisor access required" });
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

router.patch("/incidents/:id/field-note/:noteId", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await updateIncidentFieldNote(
      req.user.userId,
      req.params.id,
      req.params.noteId,
      req.body || {},
    ));
  } catch (error) {
    return next(error);
  }
});

router.delete("/incidents/:id/field-note/:noteId", verifyTokenAndPolice, async (req, res, next) => {
  try {
    return res.status(200).json(await deleteIncidentFieldNote(
      req.user.userId,
      req.params.id,
      req.params.noteId,
    ));
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

router.get(
  "/supervisor/incidents/:id/assignable-officers",
  verifyTokenAndPolice,
  requirePoliceSupervisor,
  async (req, res, next) => {
    try {
      return res.status(200).json(
        await listAssignableOfficersForIncident(req.user, req.params.id, req.query || {}),
      );
    } catch (error) {
      return next(error);
    }
  },
);

router.post("/supervisor/incidents/:id/assign", verifyTokenAndPolice, requirePoliceSupervisor, async (req, res, next) => {
  try {
    return res.status(200).json(await assignIncidentBySupervisor(req.user, req.params.id, req.body || {}));
  } catch (error) {
    return next(error);
  }
});

router.get("/supervisor/dashboard", verifyTokenAndPolice, requirePoliceSupervisor, async (req, res, next) => {
  try {
    return res.status(200).json(await getSupervisorDashboard(req.user, req.query || {}));
  } catch (error) {
    return next(error);
  }
});

router.get("/supervisor/analytics", verifyTokenAndPolice, requirePoliceSupervisor, async (req, res, next) => {
  try {
    return res.status(200).json(await getSupervisorAnalytics(req.user, req.query || {}));
  } catch (error) {
    return next(error);
  }
});

router.get("/supervisor/global-map", verifyTokenAndPolice, requirePoliceSupervisor, async (req, res, next) => {
  try {
    return res.status(200).json(await getSupervisorGlobalMap(req.user));
  } catch (error) {
    return next(error);
  }
});

router.get("/priority-queue", verifyTokenAndPolice, async (req, res, next) => {
  try {
    const limit = req.query?.limit ? Number(req.query.limit) : 25;
    const result = await getPriorityQueue({ limit });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
