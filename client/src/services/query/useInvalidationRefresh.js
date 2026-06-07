import React from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Bridge legacy local-state screens (that fetch via services instead of
 * useQuery) into the React Query invalidation graph: calls `onInvalidate`
 * whenever a query whose top-level key equals `keyPrefix` is invalidated.
 *
 * Use it so a screen like the public reports feed refreshes after a
 * create/verify/assign mutation fires invalidateReportWorkflow, without having
 * to migrate its whole paginated data layer to useQuery.
 *
 * @param {string|Array} keyPrefix e.g. 'reports' or queryKeys.reports.all
 * @param {Function} onInvalidate  called (debounced to one frame) on a match
 * @param {boolean} [enabled=true]
 */
export function useInvalidationRefresh(keyPrefix, onInvalidate, enabled = true) {
  const queryClient = useQueryClient();
  const prefix = Array.isArray(keyPrefix) ? keyPrefix[0] : keyPrefix;
  const callbackRef = React.useRef(onInvalidate);
  callbackRef.current = onInvalidate;

  React.useEffect(() => {
    if (!enabled || !prefix) return undefined;

    let scheduled = false;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.type !== 'updated' || event?.action?.type !== 'invalidate') return;
      const key = event?.query?.queryKey;
      if (!Array.isArray(key) || key[0] !== prefix) return;
      // Collapse the burst of invalidations a single workflow fires into one call.
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        if (typeof callbackRef.current === 'function') callbackRef.current();
      });
    });

    return unsubscribe;
  }, [queryClient, prefix, enabled]);
}
