'use client';

import { useState, useEffect } from 'react';
import { selectionApi } from '@/lib/api';
import { Filters, PoolCountResult } from '@/types/filters';

export interface UsePoolCountResult {
  poolCount: number | null;
  totalItems: number;
  emptyReason: string | null;
  dataStats: PoolCountResult['dataStats'] | null;
  overseerrWarning: string | null;
  loadingPoolCount: boolean;
}

export function usePoolCount(
  selectedLibraries: string[],
  mediaType: string,
  filters: Filters
): UsePoolCountResult {
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [dataStats, setDataStats] = useState<PoolCountResult['dataStats'] | null>(null);
  const [overseerrWarning, setOverseerrWarning] = useState<string | null>(null);
  const [loadingPoolCount, setLoadingPoolCount] = useState(false);

  useEffect(() => {
    if (selectedLibraries.length === 0) {
      setPoolCount(null);
      setTotalItems(0);
      setEmptyReason(null);
      setDataStats(null);
      setOverseerrWarning(null);
      return;
    }

    const controller = new AbortController();
    let requestId = 0;

    const fetchPoolCount = async () => {
      const id = ++requestId;
      setLoadingPoolCount(true);
      try {
        const data = await selectionApi.getPoolCount(
          selectedLibraries,
          mediaType as 'movie' | 'show',
          filters,
          controller.signal
        );
        if (id !== requestId) return;
        setPoolCount(data.matchingItems);
        setTotalItems(data.totalItems);
        setEmptyReason(data.emptyReason);
        setDataStats(data.dataStats);
        setOverseerrWarning(data.overseerrWarning ?? null);
      } catch (err) {
        if (id !== requestId) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Failed to fetch pool count:', err);
        setPoolCount(null);
      } finally {
        if (id === requestId) {
          setLoadingPoolCount(false);
        }
      }
    };

    const timeoutId = setTimeout(fetchPoolCount, 300);
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [selectedLibraries, mediaType, filters]);

  return {
    poolCount,
    totalItems,
    emptyReason,
    dataStats,
    overseerrWarning,
    loadingPoolCount,
  };
}
