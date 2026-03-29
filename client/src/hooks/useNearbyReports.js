import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_REPORT_RADIUS_KM, fetchNearbyReports } from '../services/mapReportsService';

export default function useNearbyReports({
  lat,
  lng,
  radiusKm = DEFAULT_REPORT_RADIUS_KM,
  enabled = true,
  refreshKey = 0,
} = {}) {
  const [reports, setReports] = useState([]);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [manualRefreshKey, setManualRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setManualRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      setReports([]);
      setState('idle');
      setError('');
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      setState((current) => (current === 'success' ? 'refreshing' : 'loading'));
      setError('');

      try {
        const payload = await fetchNearbyReports({
          lat,
          lng,
          radiusKm,
          signal: controller.signal,
        });
        if (cancelled) return;
        setReports(payload.reports || []);
        setState('success');
      } catch (nextError) {
        if (cancelled || nextError?.name === 'AbortError') return;
        setReports([]);
        setState('error');
        setError(nextError.message || 'Failed to load nearby reports');
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, lat, lng, manualRefreshKey, radiusKm, refreshKey]);

  return {
    reports,
    state,
    error,
    refresh,
  };
}
