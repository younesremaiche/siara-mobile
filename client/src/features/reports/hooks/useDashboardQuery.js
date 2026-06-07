import { useQuery } from '@tanstack/react-query';

import { fetchDashboard } from '../../../services/dashboardService';
import { queryKeys } from '../../../services/query/queryKeys';

export function useUserDashboard(options = {}) {
  return useQuery({
    queryKey: queryKeys.dashboard.user,
    queryFn: () => fetchDashboard(),
    refetchInterval: 60 * 1000,
    ...options,
  });
}
