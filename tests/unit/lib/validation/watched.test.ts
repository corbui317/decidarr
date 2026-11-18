import { describe, it, expect } from 'vitest';
import { parsePlexIdParam, parseWatchedCreateBody } from '@/lib/validation/watched';

describe('parsePlexIdParam', () => {
  it('accepts a non-empty plexId', () => {
    const result = parsePlexIdParam('plex-123');
    expect(result).toEqual({ ok: true, data: 'plex-123' });
  });

  it('rejects empty plexId', () => {
    const result = parsePlexIdParam('');
    expect(result).toEqual({ ok: false, error: 'plexId must be a non-empty string' });
  });
});

describe('parseWatchedCreateBody', () => {
  it('accepts a valid watched payload', () => {
    const result = parseWatchedCreateBody({
      mediaType: 'movie',
      title: 'Inception',
    });
    expect(result).toEqual({
      ok: true,
      data: { mediaType: 'movie', title: 'Inception' },
    });
  });

  it('rejects invalid mediaType', () => {
    const result = parseWatchedCreateBody({
      mediaType: 'invalid',
      title: 'Inception',
    });
    expect(result).toEqual({
      ok: false,
      error: "mediaType must be 'movie', 'show', or 'episode'",
    });
  });

  it('rejects empty title', () => {
    const result = parseWatchedCreateBody({
      mediaType: 'movie',
      title: '   ',
    });
    expect(result).toEqual({
      ok: false,
      error: 'title must be a non-empty string',
    });
  });

  it('accepts episode mediaType', () => {
    const result = parseWatchedCreateBody({
      mediaType: 'episode',
      title: 'Pilot',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.mediaType).toBe('episode');
    }
  });
});
