import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  assignOfficerToIncident,
  createSupervisorAlert,
  getAssignableOfficers,
  getSupervisorAnalytics,
  getSupervisorDashboard,
  getSupervisorGlobalMap,
  getSupervisorIncidents,
  getSupervisorOfficers,
} from '../../../services/supervisorService';
import { queryKeys } from '../../../services/query/queryKeys';
import { invalidateSupervisorWorkflow } from '../../../services/query/workflowInvalidation';

export function useSupervisorDashboard(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.supervisor.dashboard(params),
    queryFn: () => getSupervisorDashboard(params),
    refetchInterval: 30 * 1000,
    ...options,
  });
}

export function useSupervisorAnalytics(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.supervisor.analytics(params),
    queryFn: () => getSupervisorAnalytics(params),
    ...options,
  });
}

export function useSupervisorOfficers(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.supervisor.officers(params),
    queryFn: () => getSupervisorOfficers(params),
    ...options,
  });
}

export function useSupervisorIncidents(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.supervisor.incidents(params),
    queryFn: () => getSupervisorIncidents(params),
    ...options,
  });
}

export function useAssignableOfficers(incidentId, options = {}) {
  return useQuery({
    queryKey: queryKeys.supervisor.assignableOfficers(incidentId),
    queryFn: () => getAssignableOfficers(incidentId),
    enabled: Boolean(incidentId) && (options.enabled ?? true),
    ...options,
  });
}

export function useSupervisorGlobalMap(options = {}) {
  return useQuery({
    queryKey: queryKeys.supervisor.globalMap,
    queryFn: getSupervisorGlobalMap,
    refetchInterval: 30 * 1000,
    ...options,
  });
}

export function useAssignOfficerMutation(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: ({ incidentId, officerId }) => assignOfficerToIncident(incidentId, officerId),
    onSuccess: async (result, variables, context) => {
      // incidentId === reportId (incidents are accident_reports); pass once.
      await invalidateSupervisorWorkflow(queryClient, {
        reportId: variables?.incidentId,
      });
      await options.onSuccess?.(result, variables, context);
    },
  });
}

export function useCreateSupervisorAlertMutation(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: createSupervisorAlert,
    onSuccess: async (result, variables, context) => {
      await invalidateSupervisorWorkflow(queryClient);
      await options.onSuccess?.(result, variables, context);
    },
  });
}
