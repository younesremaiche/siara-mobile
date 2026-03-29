import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  DEFAULT_RADIUS_KM,
  PAGE_SIZE,
  listReports,
} from '../services/reportsService';

function mergeReports(previousReports, nextReports) {
  const reportMap = new Map();

  previousReports.forEach((report) => {
    reportMap.set(report.id, report);
  });

  nextReports.forEach((report) => {
    reportMap.set(report.id, report);
  });

  return Array.from(reportMap.values());
}

export default function useReportsFeed() {
  const [activeFeed, setActiveFeedState] = useState('latest');
  const [sortMode, setSortMode] = useState('recent');
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState({
    limit: PAGE_SIZE,
    offset: 0,
    hasMore: false,
    returned: 0,
  });
  const [feedMeta, setFeedMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [loadMoreError, setLoadMoreError] = useState('');
  const [geoState, setGeoState] = useState({
    status: 'idle',
    coords: null,
  });

  const requestIdRef = useRef(0);

  const resolveLocation = useCallback(async () => {
    try {
      setGeoState({
        status: 'loading',
        coords: null,
      });

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setGeoState({
          status: 'denied',
          coords: null,
        });
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setGeoState({
        status: 'ready',
        coords: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
      });
    } catch (_error) {
      setGeoState({
        status: 'unavailable',
        coords: null,
      });
    }
  }, []);

  useEffect(() => {
    if (activeFeed !== 'nearby' || geoState.status !== 'idle') {
      return;
    }

    void resolveLocation();
  }, [activeFeed, geoState.status, resolveLocation]);

  const effectiveFeed = useMemo(() => {
    if (activeFeed !== 'nearby') {
      return activeFeed;
    }

    if (geoState.status === 'ready') {
      return 'nearby';
    }

    if (geoState.status === 'denied' || geoState.status === 'unavailable') {
      return 'latest';
    }

    return null;
  }, [activeFeed, geoState.status]);

  const nearbyMessage = useMemo(() => {
    if (activeFeed !== 'nearby') {
      return '';
    }

    if (geoState.status === 'idle' || geoState.status === 'loading') {
      return 'Finding reports near you...';
    }

    if (geoState.status === 'ready') {
      return `Showing reports within ${DEFAULT_RADIUS_KM} km of your location.`;
    }

    return 'Nearby feed is unavailable without location access, so the latest reports are shown instead.';
  }, [activeFeed, geoState.status]);

  const loadFeed = useCallback(async ({ offset = 0, append = false, refreshing = false } = {}) => {
    if (!effectiveFeed) {
      return;
    }

    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;

    if (append) {
      setIsLoadingMore(true);
      setLoadMoreError('');
    } else if (refreshing) {
      setIsRefreshing(true);
      setFeedError('');
    } else {
      setIsLoading(true);
      setFeedError('');
      setLoadMoreError('');
    }

    try {
      const response = await listReports({
        limit: PAGE_SIZE,
        offset,
        feed: effectiveFeed,
        sort: sortMode,
        lat: effectiveFeed === 'nearby' ? geoState.coords?.lat : undefined,
        lng: effectiveFeed === 'nearby' ? geoState.coords?.lng : undefined,
        radiusKm: effectiveFeed === 'nearby' ? DEFAULT_RADIUS_KM : undefined,
      });

      if (requestIdRef.current !== nextRequestId) {
        return;
      }

      setReports((previousReports) => (
        append
          ? mergeReports(previousReports, response.reports)
          : response.reports
      ));
      setPagination(response.pagination);
      setFeedMeta(response.meta);
    } catch (error) {
      if (requestIdRef.current !== nextRequestId) {
        return;
      }

      if (append) {
        setLoadMoreError(error.message || 'Failed to load more reports.');
        return;
      }

      setReports([]);
      setPagination({
        limit: PAGE_SIZE,
        offset: 0,
        hasMore: false,
        returned: 0,
      });
      setFeedMeta(null);
      setFeedError(error.message || 'Failed to load the reports feed.');
    } finally {
      if (requestIdRef.current !== nextRequestId) {
        return;
      }

      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  }, [effectiveFeed, geoState.coords?.lat, geoState.coords?.lng, sortMode]);

  useEffect(() => {
    if (!effectiveFeed) {
      return;
    }

    void loadFeed({ offset: 0 });
  }, [effectiveFeed, sortMode, loadFeed]);

  const refresh = useCallback(async () => {
    if (activeFeed === 'nearby' && geoState.status !== 'ready') {
      setGeoState({
        status: 'idle',
        coords: null,
      });
    }

    await loadFeed({ offset: 0, refreshing: true });
  }, [activeFeed, geoState.status, loadFeed]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !pagination.hasMore || !effectiveFeed) {
      return;
    }

    await loadFeed({
      offset: reports.length,
      append: true,
    });
  }, [effectiveFeed, isLoadingMore, loadFeed, pagination.hasMore, reports.length]);

  const setActiveFeed = useCallback((nextFeed) => {
    setActiveFeedState(nextFeed);

    if (nextFeed === 'nearby') {
      setGeoState({
        status: 'idle',
        coords: null,
      });
    }
  }, []);

  return {
    activeFeed,
    setActiveFeed,
    sortMode,
    setSortMode,
    reports,
    pagination,
    feedMeta,
    effectiveFeed,
    nearbyMessage,
    isLoading,
    isRefreshing,
    isLoadingMore,
    feedError,
    loadMoreError,
    refresh,
    loadMore,
  };
}
