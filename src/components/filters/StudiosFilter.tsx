'use client';

import { useState } from 'react';

interface Studios {
  streaming: string[];
  anime: string[];
  traditional: string[];
}

interface StudiosFilterProps {
  popularStudios: Studios;
  libraryStudios: string[];
  selectedStudios: string[];
  dataAvailability: number;
  onToggleStudio: (studio: string) => void;
}

export default function StudiosFilter({
  popularStudios,
  libraryStudios,
  selectedStudios,
  dataAvailability,
  onToggleStudio,
}: StudiosFilterProps) {
  const [studioTab, setStudioTab] = useState<'streaming' | 'anime' | 'traditional' | 'library'>('library');

  // Get current studio list based on tab
  const getCurrentStudios = () => {
    if (studioTab === 'library') return libraryStudios;
    return popularStudios[studioTab] || [];
  };

  const currentStudios = getCurrentStudios();
  const hasLibraryStudios = libraryStudios.length > 0;
  const hasAnyStudios = hasLibraryStudios || popularStudios.streaming.length > 0;

  if (!hasAnyStudios) return null;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-2">
        Studios / Networks
        {selectedStudios.length > 0 && (
          <span className="ml-2 text-decidarr-primary">({selectedStudios.length})</span>
        )}
        {dataAvailability < 80 && (
          <span className="ml-2 text-yellow-500 text-xs" title="Percentage of items with studio/network data">
            ({dataAvailability}% have data)
          </span>
        )}
      </label>

      {/* Studio Tabs - only show tabs if we have library studios */}
      {hasLibraryStudios && (
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setStudioTab('library')}
            className={`flex-1 py-1.5 px-2 text-xs rounded-lg transition ${
              studioTab === 'library'
                ? 'bg-decidarr-primary text-decidarr-dark'
                : 'bg-decidarr-dark text-gray-400 hover:text-white'
            }`}
          >
            In Library
          </button>
          <button
            onClick={() => setStudioTab('streaming')}
            className={`flex-1 py-1.5 px-2 text-xs rounded-lg transition ${
              studioTab === 'streaming'
                ? 'bg-decidarr-primary text-decidarr-dark'
                : 'bg-decidarr-dark text-gray-400 hover:text-white'
            }`}
          >
            Streaming
          </button>
          <button
            onClick={() => setStudioTab('traditional')}
            className={`flex-1 py-1.5 px-2 text-xs rounded-lg transition ${
              studioTab === 'traditional'
                ? 'bg-decidarr-primary text-decidarr-dark'
                : 'bg-decidarr-dark text-gray-400 hover:text-white'
            }`}
          >
            Studios
          </button>
        </div>
      )}

      {/* Studio List */}
      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
        {currentStudios.length > 0 ? (
          currentStudios.map((studio) => (
            <button
              key={studio}
              type="button"
              onClick={() => onToggleStudio(studio)}
              aria-pressed={selectedStudios.includes(studio)}
              className={`px-3 py-1 rounded-full text-xs transition ${
                selectedStudios.includes(studio)
                  ? 'bg-decidarr-primary text-decidarr-dark'
                  : 'bg-decidarr-dark text-gray-300 hover:text-white'
              }`}
            >
              {studio}
            </button>
          ))
        ) : (
          <p className="text-gray-500 text-xs py-2">
            {studioTab === 'library' ? 'No studios found in selected libraries' : 'No studios available'}
          </p>
        )}
      </div>
    </div>
  );
}
