'use client';

import { useState, useEffect, useCallback } from 'react';
import { libraryApi, isAuthError } from '@/lib/api';
import LoadingSpinner from './LoadingSpinner';

interface Section {
  id: string;
  title: string;
  type: string;
}

interface LibrarySelectorProps {
  selectedLibraries: string[];
  onSelect: (libraries: string[]) => void;
  mediaType: string;
  onMediaTypeChange: (type: string) => void;
}

export default function LibrarySelector({
  selectedLibraries,
  onSelect,
  mediaType,
  onMediaTypeChange,
}: LibrarySelectorProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthErrorState, setIsAuthErrorState] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  const loadSections = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsAuthErrorState(false);
    
    try {
      console.log('[LibrarySelector] Loading library sections...');
      const data = await libraryApi.getSections();
      setSections(data.sections as Section[]);
      console.log('[LibrarySelector] Loaded sections:', data.sections.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load libraries';
      console.error('[LibrarySelector] Load error:', message);
      setError(message);
      
      // Check if this is an auth error
      if (isAuthError(err)) {
        setIsAuthErrorState(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  const handleReLogin = useCallback(() => {
    // Clear any stale state and redirect to home for re-authentication
    window.location.href = '/';
  }, []);

  const filteredSections = sections.filter((s) => s.type === mediaType);

  const handleToggle = (sectionId: string) => {
    const isSelected = selectedLibraries.includes(sectionId);
    if (isSelected) {
      onSelect(selectedLibraries.filter((id) => id !== sectionId));
    } else {
      onSelect([...selectedLibraries, sectionId]);
      syncLibrary(sectionId);
    }
  };

  const syncLibrary = async (sectionId: string, forceRefresh = false) => {
    setSyncing((prev) => ({ ...prev, [sectionId]: true }));
    try {
      await libraryApi.getItems(sectionId, forceRefresh);
    } finally {
      setSyncing((prev) => ({ ...prev, [sectionId]: false }));
    }
  };

  const handleRefresh = async (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    await syncLibrary(sectionId, true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-decidarr-secondary rounded-xl p-4">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-decidarr-error mb-4">{error}</p>
          
          {isAuthErrorState ? (
            <div className="space-y-2">
              <p className="text-gray-400 text-sm mb-3">
                Your session may have expired. Please log in again.
              </p>
              <button
                onClick={handleReLogin}
                className="px-4 py-2 bg-decidarr-primary text-decidarr-dark font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                Re-Login
              </button>
            </div>
          ) : (
            <button
              onClick={loadSections}
              className="px-4 py-2 bg-decidarr-surface text-decidarr-text font-medium rounded-lg border border-decidarr-border hover:border-decidarr-primary transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-decidarr-secondary rounded-xl p-4">
      <h3 className="text-lg font-semibold text-white mb-4">Select Libraries</h3>

      {/* Media Type Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => onMediaTypeChange('movie')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
            mediaType === 'movie'
              ? 'bg-decidarr-primary text-decidarr-dark'
              : 'bg-decidarr-dark text-gray-400 hover:text-white'
          }`}
        >
          Movies
        </button>
        <button
          onClick={() => onMediaTypeChange('show')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
            mediaType === 'show'
              ? 'bg-decidarr-primary text-decidarr-dark'
              : 'bg-decidarr-dark text-gray-400 hover:text-white'
          }`}
        >
          TV Shows
        </button>
      </div>

      {/* Library List */}
      <div className="space-y-2">
        {filteredSections.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No {mediaType === 'movie' ? 'movie' : 'TV show'} libraries found
          </p>
        ) : (
          filteredSections.map((section) => (
            <button
              key={section.id}
              onClick={() => handleToggle(section.id)}
              disabled={syncing[section.id]}
              className={`w-full flex items-center justify-between p-3 rounded-lg
                       transition-all ${
                         selectedLibraries.includes(section.id)
                           ? 'bg-decidarr-primary/20 border-2 border-decidarr-primary'
                           : 'bg-decidarr-dark border-2 border-transparent hover:border-gray-700'
                       }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{section.type === 'movie' ? '🎬' : '📺'}</span>
                <span className="font-medium text-white">{section.title}</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedLibraries.includes(section.id) && !syncing[section.id] && (
                  <button
                    onClick={(e) => handleRefresh(e, section.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-decidarr-primary hover:bg-decidarr-dark/50 transition-colors"
                    title="Refresh library"
                    aria-label={`Refresh ${section.title}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
                {syncing[section.id] ? (
                  <LoadingSpinner size="sm" />
                ) : selectedLibraries.includes(section.id) ? (
                  <span className="text-decidarr-primary">✓</span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
