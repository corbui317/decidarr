'use client';

import { useState, useEffect } from 'react';
import { libraryApi } from '@/lib/api';
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
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSections();
  }, []);

  const loadSections = async () => {
    try {
      const data = await libraryApi.getSections();
      setSections(data.sections as Section[]);
    } catch {
      setError('Failed to load libraries');
    } finally {
      setLoading(false);
    }
  };

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

  const syncLibrary = async (sectionId: string) => {
    setSyncing((prev) => ({ ...prev, [sectionId]: true }));
    try {
      await libraryApi.getItems(sectionId);
    } finally {
      setSyncing((prev) => ({ ...prev, [sectionId]: false }));
    }
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
      <div className="text-center p-4">
        <p className="text-decidarr-error">{error}</p>
        <button onClick={loadSections} className="mt-2 text-decidarr-primary hover:underline">
          Retry
        </button>
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
              {syncing[section.id] ? (
                <LoadingSpinner size="sm" />
              ) : selectedLibraries.includes(section.id) ? (
                <span className="text-decidarr-primary">✓</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
