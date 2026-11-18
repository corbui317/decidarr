export interface PlayLinks {
  web: string;
  app: string;
  ios: string;
  android: string;
  machineId: string | null;
}

export interface TmdbMatch {
  voteAverage?: number;
  runtime?: number;
  tagline?: string;
  overview?: string;
}

export interface SanitizedLibraryItem {
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
  thumbPath?: string;
  artPath?: string;
  tagline?: string;
  genres?: string[];
  summary?: string;
  directors?: string[];
  actors?: string[];
  studio?: string;
  networks?: string[];
  studios?: string[];
  overseerrStatus?: 'available' | 'partially_available' | null;
}

export interface SelectionResultResponse {
  selection: SanitizedLibraryItem & { tmdb?: TmdbMatch | null };
  playLinks: PlayLinks | null;
  stats: { totalMatches: number };
  tvSelectionMode?: 'show' | 'episode';
}
