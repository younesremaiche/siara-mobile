import { queryClient as defaultQueryClient } from './queryClient';
import { queryKeys } from './queryKeys';

function invalidate(queryClient, queryKey) {
  return queryClient.invalidateQueries({ queryKey });
}

// Cross-role invalidation is intentional, not lazy. In SIARA a single action
// genuinely propagates across every role's views: a police verify/reject/resolve
// changes the citizen's report detail, the police lists/dashboard, the
// supervisor dashboard/incidents/map, and the aggregate dashboards. Narrowing
// this per-mutation would reintroduce exactly the stale-state bugs this layer
// exists to prevent. invalidateQueries only refetches *active* (mounted) queries
// and dedupes, so the cost is bounded. `admin`/`notifications` keys are included
// for forward-compatibility (no queries register under them yet → harmless).
//
// Note on ids: an "incident" and a "report" are the SAME row (police incidents
// are accident_reports), so reportId and incidentId share one id space and both
// reports.detail(id) and police.incident(id) refer to the same entity.
export async function invalidateReportWorkflow(
  queryClient = defaultQueryClient,
  { reportId = null, incidentId = null } = {},
) {
  const tasks = [
    invalidate(queryClient, queryKeys.reports.all),
    invalidate(queryClient, queryKeys.police.all),
    invalidate(queryClient, queryKeys.supervisor.all),
    invalidate(queryClient, queryKeys.admin.all),
    invalidate(queryClient, queryKeys.notifications.all),
    invalidate(queryClient, queryKeys.dashboard.all),
  ];

  const id = reportId || incidentId;
  if (id) {
    tasks.push(
      invalidate(queryClient, queryKeys.reports.detail(id)),
      invalidate(queryClient, queryKeys.police.incident(id)),
    );
  }

  await Promise.all(tasks);
}

export async function invalidatePoliceWorkflow(queryClient = defaultQueryClient, payload = {}) {
  await invalidateReportWorkflow(queryClient, payload);
}

export async function invalidateSupervisorWorkflow(queryClient = defaultQueryClient, payload = {}) {
  await invalidateReportWorkflow(queryClient, payload);
}

// Real-time bridge: a socket notification represents a backend domain event
// (new incident, assignment, verify/reject/resolve, backup, supervisor alert).
// These event types all affect report/incident-derived caches, so an incoming
// one should refresh the same query slices a local mutation would.
const WORKFLOW_EVENT_KEYWORDS = ['INCIDENT', 'REPORT', 'POLICE', 'ALERT', 'BACKUP', 'ASSIGN'];

export function isWorkflowNotificationEvent(eventType) {
  const type = String(eventType || '').toUpperCase();
  if (!type) return false;
  return WORKFLOW_EVENT_KEYWORDS.some((keyword) => type.includes(keyword));
}

function extractReportId(notification = {}) {
  const data = notification.data && typeof notification.data === 'object' ? notification.data : {};
  const candidate = notification.reportId
    ?? notification.report_id
    ?? notification.incidentId
    ?? notification.incident_id
    ?? data.reportId
    ?? data.report_id
    ?? data.incidentId
    ?? data.incident_id
    ?? null;
  return candidate ? String(candidate) : null;
}

export async function invalidateForNotification(queryClient = defaultQueryClient, notification = {}) {
  const eventType = notification.eventType || notification.data?.eventType || null;
  if (!isWorkflowNotificationEvent(eventType)) {
    return false;
  }
  const reportId = extractReportId(notification);
  await invalidateReportWorkflow(queryClient, { reportId });
  return true;
}
