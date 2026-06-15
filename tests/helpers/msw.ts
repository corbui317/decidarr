import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  PLEX_VALIDATE_SUCCESS,
  PLEX_SERVERS_SUCCESS,
  PLEX_SECTIONS_SUCCESS,
} from '../fixtures/library-items';

export const plexHandlers = [
  http.get('https://plex.tv/api/v2/user', () => {
    return HttpResponse.json(PLEX_VALIDATE_SUCCESS.user);
  }),
  http.get('https://plex.tv/api/resources', () => {
    return HttpResponse.json({ MediaContainer: { Device: PLEX_SERVERS_SUCCESS } });
  }),
  http.get('http://192.168.1.10:32400/library/sections', () => {
    return HttpResponse.json({
      MediaContainer: {
        Directory: PLEX_SECTIONS_SUCCESS.map((s) => ({
          key: s.key,
          title: s.title,
          type: s.type,
        })),
      },
    });
  }),
  http.get('http://192.168.1.10:32400/library/metadata/:id', ({ params }) => {
    return HttpResponse.json({
      MediaContainer: {
        Metadata: [
          {
            ratingKey: params.id,
            title: 'Test Movie',
            year: 2020,
            type: 'movie',
          },
        ],
      },
    });
  }),
];

export const tmdbHandlers = [
  http.get('https://api.themoviedb.org/3/search/movie', () => {
    return HttpResponse.json({
      results: [{ id: 1, title: 'Test Movie', release_date: '2020-01-01', vote_average: 8.0 }],
    });
  }),
  http.get('https://api.themoviedb.org/3/search/tv', () => {
    return HttpResponse.json({ results: [] });
  }),
  http.get('https://api.themoviedb.org/3/configuration', () => {
    return HttpResponse.json({ images: { secure_base_url: 'https://image.tmdb.org/t/p/' } });
  }),
];

export const tautulliHandlers = [
  http.get('http://192.168.1.20:8181/api/v2', () => {
    return HttpResponse.json({ response: { result: 'success', data: [] } });
  }),
];

export function createMswServer() {
  return setupServer(...plexHandlers, ...tmdbHandlers, ...tautulliHandlers);
}
