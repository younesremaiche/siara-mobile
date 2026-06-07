import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createReport,
  getReport,
  listReports,
  updateReport,
  uploadReportMedia,
} from '../../../services/reportsService';
import { queryKeys } from '../../../services/query/queryKeys';
import { invalidateReportWorkflow } from '../../../services/query/workflowInvalidation';

export function useReports(params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.reports.list(params),
    queryFn: () => listReports(params),
    ...options,
  });
}

export function useMyReports(userId, params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.reports.mine(userId, params),
    queryFn: async () => {
      const result = await listReports(params);
      const reports = Array.isArray(result?.reports) ? result.reports : [];

      return {
        ...result,
        reports: userId
          ? reports.filter((report) => String(report.reportedBy?.id || '') === String(userId))
          : reports,
      };
    },
    enabled: Boolean(userId) && (options.enabled ?? true),
    ...options,
  });
}

export function useReportDetail(reportId, options = {}) {
  return useQuery({
    queryKey: queryKeys.reports.detail(reportId),
    queryFn: () => getReport(reportId),
    enabled: Boolean(reportId) && (options.enabled ?? true),
    ...options,
  });
}

export function useCreateReportMutation(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: createReport,
    onSuccess: async (report, variables, context) => {
      await invalidateReportWorkflow(queryClient, { reportId: report?.id });
      await options.onSuccess?.(report, variables, context);
    },
  });
}

export function useUpdateReportMutation(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: ({ reportId, data }) => updateReport(reportId, data),
    onSuccess: async (report, variables, context) => {
      await invalidateReportWorkflow(queryClient, { reportId: report?.id || variables.reportId });
      await options.onSuccess?.(report, variables, context);
    },
  });
}

export function useUploadReportMediaMutation(options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: ({ reportId, files }) => uploadReportMedia(reportId, files),
    onSuccess: async (report, variables, context) => {
      await invalidateReportWorkflow(queryClient, { reportId: report?.id || variables.reportId });
      await options.onSuccess?.(report, variables, context);
    },
  });
}
