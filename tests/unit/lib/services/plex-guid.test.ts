import { describe, it, expect } from 'vitest';
import { parseTmdbIdFromPlexGuid } from '@/lib/services/plex';

describe('parseTmdbIdFromPlexGuid', () => {
  it('extracts ID from themoviedb query-style GUID strings', () => {
    expect(parseTmdbIdFromPlexGuid('themoviedb://movie?id=603')).toBe('603');
    expect(parseTmdbIdFromPlexGuid('themoviedb://show?lang=en&id=1396')).toBe('1396');
  });

  it('extracts ID from themoviedb path-style GUID strings', () => {
    expect(parseTmdbIdFromPlexGuid('themoviedb://movie/603')).toBe('603');
    expect(parseTmdbIdFromPlexGuid('themoviedb://tv/1396')).toBe('1396');
  });

  it('extracts ID from tmdb:// scheme variants', () => {
    expect(parseTmdbIdFromPlexGuid('tmdb://movie?id=550')).toBe('550');
    expect(parseTmdbIdFromPlexGuid('tmdb://show/1399')).toBe('1399');
  });

  it('extracts ID from Plex Guid array objects', () => {
    const guidArray = [
      { id: 'plex://movie/abc' },
      { id: 'themoviedb://movie?id=27205' },
    ];
    expect(parseTmdbIdFromPlexGuid(guidArray)).toBe('27205');
  });

  it('extracts ID from string entries in Guid arrays', () => {
    expect(parseTmdbIdFromPlexGuid(['plex://movie/abc', 'tmdb://movie/42'])).toBe('42');
  });

  it('returns undefined for unrecognized formats', () => {
    expect(parseTmdbIdFromPlexGuid('imdb://tt0137523')).toBeUndefined();
    expect(parseTmdbIdFromPlexGuid(null)).toBeUndefined();
    expect(parseTmdbIdFromPlexGuid([])).toBeUndefined();
  });
});
