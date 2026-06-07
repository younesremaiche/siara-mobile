import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addPoliceFieldNote,
  assignSelfToPoliceIncident,
  createManualPoliceHistoryEntry,
  getPoliceDashboard,
  getPoliceIncident,
  getPoliceMe,
  getPoliceWorkZoneOptions,
  listPoliceAlerts,
  listPoliceIncidents,
  listPoliceOperationHistory,
  markPoliceAlertRead,
  rejectPoliceIncident,
  requestPoliceBackup,
  syncPoliceDeviceLocation,
  updatePoliceIncidentStatus,
  updatePoliceWorkZone,
  verifyPoliceIncident,
} from '../../../services/policeService';
import { queryKeys } from '../../../services/query/queryKeys';
import { invalidatePoliceWorkflow } from '../../../services/query/workflowInvalidation';

export function usePoliceMe(options = {}) {
  return useQuery({
    queryKey: queryKeys.police.me,
    queryFn: getPoliceMe,
    ...options,
  });
}

export function usePoliceDashboard(options = {}) {
  return useQuery({
    queryKey: queryKeys.police.dashboard,
    queryFn: getPoliceDashboard,
    refetchInterval: 30 * 1000,
    ...options,
  });
}

export function usePoliceIncidents(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.police.incidents(params),
    queryFn: () => listPoliceIncidents(params),
    ...options,
  });
}

export function usePoliceIncident(incidentId, options = {}) {
  return useQuery({
    queryKey: queryKeys.police.incident(incidentId),
    queryFn: () => getPoliceIncident(incidentId),
    enabled: Boolean(incidentId) && (options.enabled ?? true),
    ...options,
  });
}

export function usePoliceAlerts(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.police.alerts(params),
    queryFn: () => listPoliceAlerts(params),
    ...options,
  });
}

export function usePoliceOperationHistory(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.police.history(params),
    queryFn: () => listPoliceOperationHistory(params),
    ...options,
  });
}

export function usePoliceWorkZoneOptions(wilayaId = null, options = {}) {
  return useQuery({
    queryKey: queryKeys.police.workZoneOptions(wilayaId),
    queryFn: () => getPoliceWorkZoneOptions(wilayaId),
    ...options,
  });
}

export function usePoliceIncidentActionMutation(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: async ({ incidentId, action, payload = {} }) => {
      switch (action) {
        case 'verify':
          return verifyPoliceIncident(incidentId, payload);
        case 'reject':
          return rejectPoliceIncident(incidentId, payload);
        case 'resolve':
        case 'status':
          return updatePoliceIncidentStatus(incidentId, payload);
        case 'backup':
          return requestPoliceBackup(incidentId, payload);
        case 'assign_self':
          return assignSelfToPoliceIncident(incidentId, payload);
        case 'note':
          return addPoliceFieldNote(incidentId, payload);
        default:
          throw new Error(`Unsupported police action: ${action}`);
      }
    },
    onSuccess: async (result, variables, context) => {
      if (variables?.incidentId) {
        queryClient.setQueryData(queryKeys.police.incident(variables.incidentId), result);
      }
      // incidentId === reportId (incidents are accident_reports); pass once.
      await invalidatePoliceWorkflow(queryClient, {
        reportId: variables?.incidentId,
      });
      await options.onSuccess?.(result, variables, context);
    },
  });
}

export function useUpdatePoliceWorkZoneMutation(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: updatePoliceWorkZone,
    onSuccess: async (result, variables, context) => {
      queryClient.setQueryData(queryKeys.police.me, result);
      await invalidatePoliceWorkflow(queryClient);
      await options.onSuccess?.(result, variables, context);
    },
  });
}

export function useSyncPoliceLocationMutation(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: syncPoliceDeviceLocation,
    onSuccess: async (result, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.police.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.supervisor?.all });
      await options.onSuccess?.(result, variables, context);
    },
  });
}

export function useMarkPoliceAlertReadMutation(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: markPoliceAlertRead,
    onSuccess: async (result, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.police.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.police.dashboard });
      await options.onSuccess?.(result, variables, context);
    },
  });
}

export function useCreateManualPoliceHistoryMutation(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: createManualPoliceHistoryEntry,
    onSuccess: async (result, variables, context) => {
      await invalidatePoliceWorkflow(queryClient);
      await options.onSuccess?.(result, variables, context);
    },
  });
}
