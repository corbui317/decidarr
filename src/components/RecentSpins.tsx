'use client';

import { useCallback, useEffect, useState } from 'react';
import { spinHistoryApi, SpinHistoryEntry } from '@/lib/api';
import { Filters } from '@/types/filters';

interface RecentSpinsProps {
  refreshKey?: number;
  onReapply?: (entry: SpinHistoryEntry) => void;
  onRevisit?: (entry: SpinHistoryEntry) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function RecentSpins({ refreshKey = 0, onReapply, onRevisit }: RecentSpinsProps) {
  const [items, setItems] = useState<SpinHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await spinHistoryApi.list(1, 10);
      setItems(data.items);
    } catch (err) {
      console.error('Failed to load spin history:', err);
      setError('Could not load recent spins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshKey]);

  const handleDelete = async (id: string) => {
    try {
      await spinHistoryApi.delete(id);
      setItems((prev) => prev.filter((item) => item._id !== id));
    } catch (err) {
      console.error('Failed to delete spin history entry:', err);
    }
  };

  if (loading) {
    return (
      <div className="bg-decidarr-secondary rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Recent Spins</h3>
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-decidarr-secondary rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Recent Spins</h3>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-decidarr-secondary rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Recent Spins</h3>
        <p className="text-gray-500 text-sm">No spins recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-decidarr-secondary rounded-xl p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Spins</h3>
      <ul className="space-y-2">
        {items.map((entry) => (
          <li
            key={entry._id}
            className="flex items-center gap-3 p-2 rounded-lg bg-decidarr-dark/50 hover:bg-decidarr-dark transition-colors"
          >
            <div className="w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-decidarr-dark flex items-center justify-center">
              {entry.posterUrl ? (
                <img src={entry.posterUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg">{entry.mediaType === 'show' ? '📺' : '🎬'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{entry.title}</p>
              <p className="text-gray-500 text-xs">
                {entry.year ? `${entry.year} · ` : ''}
                {formatRelativeTime(entry.spunAt)}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {entry.filtersSnapshot && onReapply && (
                <button
                  type="button"
                  onClick={() => onReapply(entry)}
                  className="px-2 py-1 text-xs text-decidarr-primary hover:text-decidarr-accent transition-colors"
                  title="Reapply filters"
                >
                  Filters
                </button>
              )}
              {onRevisit && (
                <button
                  type="button"
                  onClick={() => onRevisit(entry)}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
                  title="View result"
                >
                  View
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(entry._id)}
                className="px-2 py-1 text-xs text-gray-500 hover:text-red-400 transition-colors"
                title="Remove from history"
                aria-label={`Remove ${entry.title} from history`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function historyFiltersToFilters(snapshot?: Filters | Record<string, unknown>): Filters | null {
  if (!snapshot) return null;
  if ('genres' in snapshot && Array.isArray(snapshot.genres)) {
    return snapshot as Filters;
  }
  return {
    genres: Array.isArray(snapshot.genres) ? (snapshot.genres as string[]) : [],
    yearRange: (snapshot.yearRange as Filters['yearRange']) ?? null,
    contentRatings: Array.isArray(snapshot.contentRatings)
      ? (snapshot.contentRatings as string[])
      : [],
    studios: Array.isArray(snapshot.studios) ? (snapshot.studios as string[]) : [],
    ratingRange: (snapshot.ratingRange as Filters['ratingRange']) ?? null,
    ratingFilter: typeof snapshot.ratingFilter === 'string' ? snapshot.ratingFilter : null,
    unwatchedOnly: Boolean(snapshot.unwatchedOnly),
    collections: Array.isArray(snapshot.collections) ? (snapshot.collections as string[]) : [],
  };
}
