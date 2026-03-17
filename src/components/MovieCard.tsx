'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
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
  app: string;
  web: string;
}

interface TMDbData {
  voteAverage?: number;
  runtime?: number;
  tagline?: string;
  overview?: string;
}

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

  const handlePlayNow = useCallback(() => {
    if (!playLinks) return;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = playLinks.app;
    document.body.appendChild(iframe);

    setTimeout(() => {
      document.body.removeChild(iframe);
      window.open(playLinks.web, '_blank', 'noopener,noreferrer');
    }, 1500);
  }, [playLinks]);

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
              <button
                onClick={handlePlayNow}
                className="w-12 h-12 rounded-full flex items-center justify-center
                          bg-decidarr-primary text-white hover:bg-decidarr-primary/80
                          transition-all shadow-lg"
                title="Play in Plex"
                aria-label="Play in Plex"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
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
