// TODO(schema): police module disabled pending DB migration.
// The mobile client still ships a Police mode UI, but the production schema
// (auth.users, app.accident_reports, etc.) does not yet contain the police
// tables this module needs:
//   app.police_profiles
//   app.police_work_zone_assignments
//   app.officer_location_updates
//   app.incident_assignments
//   app.police_operation_history
//   app.operational_alert_targets
// Nor the police-specific columns on app.accident_reports
// (assigned_officer_id, verified_by_officer_id, verified_at,
//  resolved_by_officer_id, resolved_at, source_channel,
//  reported_by_role_snapshot).
//
// Until those are provisioned, every export here throws a clear error so
// callers fail loudly rather than silently returning wrong data.

const createError = require('http-errors');

const POLICE_DISABLED_ERROR = () =>
  createError(
    503,
    'police_module_disabled: police schema not yet provisioned in this environment',
  );

function disabled() {
  throw POLICE_DISABLED_ERROR();
}

async function disabledAsync() {
  throw POLICE_DISABLED_ERROR();
}

// Synchronous helper (callers may not await it).
function normalizeIncidentListParams() {
  return {
    scope: 'all',
    status: undefined,
    page: 1,
    pageSize: 0,
  };
}

module.exports = {
  addManualPoliceHistoryEntry: disabledAsync,
  assignIncidentBySupervisor: disabledAsync,
  assignSelfToIncident: disabledAsync,
  createSupervisorAlert: disabledAsync,
  getIncidentById: disabledAsync,
  getPoliceDashboard: disabledAsync,
  getPoliceMe: disabledAsync,
  getPoliceWorkZoneOptions: disabledAsync,
  listPoliceAlerts: disabledAsync,
  listPoliceIncidents: disabledAsync,
  listPoliceOperationHistory: disabledAsync,
  listSupervisorOfficers: disabledAsync,
  markPoliceAlertAsRead: disabledAsync,
  rejectIncident: disabledAsync,
  requestIncidentBackup: disabledAsync,
  updateIncidentStatus: disabledAsync,
  updatePoliceLocation: disabledAsync,
  updatePoliceWorkZone: disabledAsync,
  verifyIncident: disabledAsync,
  addIncidentFieldNote: disabledAsync,
  normalizeIncidentListParams,
  // Re-exported for callers that introspect availability.
  isPoliceModuleEnabled: () => false,
};
