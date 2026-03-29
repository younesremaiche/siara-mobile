import { useCallback, useEffect, useState } from 'react';
import { fetchMyAlerts } from '../services/alertsService';

export default function useMyAlerts({ includeGeometry = false } = {}) {
  const [alerts, setAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadAlerts = useCallback(async ({ refreshing = false } = {}) => {
    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError('');

    try {
      const items = await fetchMyAlerts({ includeGeometry });
      setAlerts(items);
    } catch (nextError) {
      setAlerts([]);
      setError(nextError.message || 'Failed to load alerts.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [includeGeometry]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const refresh = useCallback(async () => {
    await loadAlerts({ refreshing: true });
  }, [loadAlerts]);

  return {
    alerts,
    isLoading,
    isRefreshing,
    error,
    refresh,
  };
}
