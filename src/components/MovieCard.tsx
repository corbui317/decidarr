'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { watchedApi } from '@/lib/api';

interface Item {
  plexId: string;
  title: string;
  type: string;
  year?: number;
  rating?: number;
  duration?: number;
  contentRating?: string;
  seasonCount?: number;
  art?: string;
  posterUrl?: string;
  tagline?: string;
  genres?: string[];
  summary?: string;
  directors?: string[];
  actors?: string[];
  studio?: string;
  tmdbRating?: number;
  networks?: string[];
  studios?: string[];
}

interface PlayLinks {
  web: string;
  app: string;
  ios: string;
  android: string;
  machineId: string | null;
}

interface TMDbData {
  voteAverage?: number;
  runtime?: number;
  tagline?: string;
  overview?: string;
}

interface PlayDevice {
  id: 'web' | 'app' | 'ios' | 'android';
  name: string;
  icon: string;
  description: string;
}

const PLAY_DEVICES: PlayDevice[] = [
  { id: 'web', name: 'Plex Web', icon: '🌐', description: 'Open in browser' },
  { id: 'app', name: 'Desktop App', icon: '💻', description: 'macOS / Windows' },
  { id: 'ios', name: 'Apple TV / iOS', icon: '📱', description: 'iPhone, iPad, Apple TV' },
  { id: 'android', name: 'Android / Shield', icon: '📺', description: 'Android TV, NVIDIA Shield' },
];

interface MovieCardProps {
  item: Item;
  tmdb?: TMDbData;
  isWatched?: boolean;
  onWatchedChange?: (watched: boolean) => void;
  playLinks?: PlayLinks | null;
}

export default function MovieCard({ item, tmdb, isWatched = false, onWatchedChange, playLinks }: MovieCardProps) {
  const [watched, setWatched] = useState(isWatched);
  const [updating, setUpdating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<PlayDevice['id']>('web');
  const devicePickerRef = useRef<HTMLDivElement>(null);

  // Close device picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (devicePickerRef.current && !devicePickerRef.current.contains(event.target as Node)) {
        setShowDevicePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePlayOnDevice = useCallback((deviceId: PlayDevice['id']) => {
    if (!playLinks) return;

    const link = playLinks[deviceId];
    setSelectedDevice(deviceId);
    setShowDevicePicker(false);

    if (deviceId === 'web') {
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      // For native apps, try the deep link
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = link;
      document.body.appendChild(iframe);

      // Fallback to web after a delay if app doesn't open
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    }
  }, [playLinks]);

  const handlePlayButtonClick = useCallback(() => {
    if (!playLinks) return;
    handlePlayOnDevice(selectedDevice);
  }, [playLinks, selectedDevice, handlePlayOnDevice]);

  const handleWatchedToggle = async () => {
    setUpdating(true);
    try {
      if (watched) {
        await watchedApi.markUnwatched(item.plexId);
        setWatched(false);
      } else {
        await watchedApi.markWatched(item.plexId, item.type, item.title);
        setWatched(true);
      }
      onWatchedChange?.(!watched);
    } catch (err) {
      console.error('Failed to update watched status:', err);
    } finally {
      setUpdating(false);
    }
  };

  const rating = tmdb?.voteAverage || item.rating;
  const runtime = tmdb?.runtime || (item.duration ? Math.round(item.duration / 60000) : null);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-decidarr-secondary rounded-2xl overflow-hidden shadow-2xl max-w-2xl mx-auto"
    >
      {/* Backdrop/Poster */}
      <div className="relative aspect-video bg-decidarr-dark">
        {item.art ? (
          <img src={item.art} alt={item.title} className="w-full h-full object-cover" />
        ) : item.posterUrl ? (
          <div className="flex items-center justify-center h-full">
            <img src={item.posterUrl} alt={item.title} className="h-full object-contain" />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-6xl">
            {item.type === 'show' ? '📺' : '🎬'}
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-decidarr-secondary via-transparent to-transparent" />

        {/* Rating badge */}
        {rating && (
          <div
            className="absolute top-4 right-4 bg-decidarr-dark/80 backdrop-blur
                        px-3 py-1 rounded-full flex items-center gap-1"
          >
            <span className="text-yellow-400">★</span>
            <span className="text-white font-semibold">{rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Title and year */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{item.title}</h2>
            <div className="flex items-center gap-3 mt-1 text-gray-400 text-sm">
              {item.year && <span>{item.year}</span>}
              {runtime && <span>{runtime} min</span>}
              {item.contentRating && (
                <span className="px-2 py-0.5 border border-gray-600 rounded text-xs">
                  {item.contentRating}
                </span>
              )}
              {item.type === 'show' && item.seasonCount && (
                <span>{item.seasonCount} seasons</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {playLinks && (
              <div className="relative" ref={devicePickerRef}>
                {/* Play button with dropdown */}
                <div className="flex">
                  <button
                    onClick={handlePlayButtonClick}
                    className="w-12 h-12 rounded-l-full flex items-center justify-center
                              bg-decidarr-primary text-white hover:bg-decidarr-primary/80
                              transition-all shadow-lg"
                    title={`Play on ${PLAY_DEVICES.find(d => d.id === selectedDevice)?.name}`}
                    aria-label="Play"
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setShowDevicePicker(!showDevicePicker)}
                    className="w-8 h-12 rounded-r-full flex items-center justify-center
                              bg-decidarr-primary/80 text-white hover:bg-decidarr-primary/60
                              transition-all shadow-lg border-l border-white/20"
                    title="Choose device"
                    aria-label="Choose playback device"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Device picker dropdown */}
                <AnimatePresence>
                  {showDevicePicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-14 z-50 w-56 bg-decidarr-dark
                                rounded-xl shadow-2xl border border-gray-700 overflow-hidden"
                    >
                      <div className="p-2">
                        <p className="text-xs text-gray-500 uppercase tracking-wide px-2 py-1 mb-1">
                          Play on device
                        </p>
                        {PLAY_DEVICES.map((device) => (
                          <button
                            key={device.id}
                            onClick={() => handlePlayOnDevice(device.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg
                                      text-left transition-colors ${
                                        selectedDevice === device.id
                                          ? 'bg-decidarr-primary/20 text-decidarr-primary'
                                          : 'text-white hover:bg-gray-700'
                                      }`}
                          >
                            <span className="text-xl">{device.icon}</span>
                            <div>
                              <p className="font-medium text-sm">{device.name}</p>
                              <p className="text-xs text-gray-400">{device.description}</p>
                            </div>
                            {selectedDevice === device.id && (
                              <span className="ml-auto text-decidarr-primary">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                      {!playLinks.machineId && (
                        <div className="px-3 py-2 bg-yellow-900/30 border-t border-yellow-800/50">
                          <p className="text-xs text-yellow-400">
                            ⚠️ Server ID not found. Some links may not work correctly.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            <button
              onClick={handleWatchedToggle}
              disabled={updating}
              className={`w-12 h-12 rounded-full flex items-center justify-center
                        transition-all ${
                          watched
                            ? 'bg-decidarr-success text-white'
                            : 'bg-decidarr-dark text-gray-400 hover:text-white'
                        } ${updating ? 'opacity-50' : ''}`}
              title={watched ? 'Mark as unwatched' : 'Mark as watched'}
              aria-label={watched ? 'Mark as unwatched' : 'Mark as watched'}
            >
              {updating ? <span className="animate-spin">⏳</span> : watched ? '✓' : '👁'}
            </button>
          </div>
        </div>

        {/* Tagline */}
        {(tmdb?.tagline || item.tagline) && (
          <p className="text-decidarr-primary italic mb-3">
            &quot;{tmdb?.tagline || item.tagline}&quot;
          </p>
        )}

        {/* Genres */}
        {item.genres && item.genres.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {item.genres.map((genre) => (
              <span
                key={genre}
                className="px-3 py-1 bg-decidarr-dark rounded-full text-xs text-gray-300"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* Summary */}
        <div className="relative">
          <p
            className={`text-gray-300 text-sm leading-relaxed ${!expanded && 'line-clamp-3'}`}
          >
            {item.summary || tmdb?.overview || 'No description available.'}
          </p>
          {((item.summary?.length || 0) > 200 || (tmdb?.overview?.length || 0) > 200) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-decidarr-primary text-sm mt-1 hover:underline"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Cast and crew */}
        {((item.directors?.length || 0) > 0 || (item.actors?.length || 0) > 0) && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            {item.directors && item.directors.length > 0 && (
              <p className="text-sm text-gray-400">
                <span className="text-gray-500">Director:</span> {item.directors.join(', ')}
              </p>
            )}
            {item.actors && item.actors.length > 0 && (
              <p className="text-sm text-gray-400 mt-1">
                <span className="text-gray-500">Starring:</span> {item.actors.slice(0, 5).join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Studio */}
        {item.studio && <p className="text-xs text-gray-500 mt-3">{item.studio}</p>}
      </div>
    </motion.div>
  );
}
