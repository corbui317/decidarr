import type { ILibraryItem } from '@/lib/models/LibraryCache';
import { DEFAULT_FILTERS } from '@/types/filters';

export const SAMPLE_LIBRARY_ITEMS: ILibraryItem[] = [
  {
    plexId: '1',
    title: 'Inception',
    year: 2010,
    genres: ['Sci-Fi', 'Action'],
    contentRating: 'PG-13',
    studio: 'Warner Bros',
    rating: 8.8,
  },
  {
    plexId: '2',
    title: 'The Room',
    year: 2003,
    genres: ['Drama'],
    contentRating: 'R',
    studio: 'TPW Films',
    rating: 3.7,
  },
  {
    plexId: '3',
    title: 'Parasite',
    year: 2019,
    genres: ['Thriller', 'Drama'],
    contentRating: 'R',
    studio: 'CJ Entertainment',
    rating: 8.5,
  },
  {
    plexId: '4',
    title: 'Hidden Gem Film',
    year: 2015,
    genres: ['Drama'],
    contentRating: 'PG-13',
    studio: 'Indie Studio',
    rating: 7.2,
  },
  {
    plexId: '5',
    title: 'Old Classic',
    year: 1985,
    genres: ['Adventure'],
    contentRating: 'PG',
    studio: 'Universal Pictures',
    rating: 7.0,
  },
  {
    plexId: '6',
    title: 'No Rating Movie',
    year: 2020,
    genres: ['Documentary'],
    studio: 'Netflix',
  },
];

export const DEFAULT_FILTER_FIXTURE = { ...DEFAULT_FILTERS };

export const PLEX_VALIDATE_SUCCESS = {
  valid: true,
  user: { username: 'testuser', email: 'test@example.com', thumb: '' },
};

export const PLEX_SERVERS_SUCCESS = [
  {
    name: 'Home Server',
    clientIdentifier: 'machine-abc',
    connections: [{ uri: 'http://192.168.1.10:32400', local: true }],
  },
];

export const PLEX_SECTIONS_SUCCESS = [
  { key: '1', title: 'Movies', type: 'movie' },
  { key: '2', title: 'TV Shows', type: 'show' },
];
