import { describe, it, expect } from 'vitest';
import {
  isValidPlexImagePath,
  stripTokenFromUrl,
  extractThumbPathFromUrl,
  containsPlexToken,
  plexImageUrl,
} from '@/lib/plex-image';

describe('plex-image helpers', () => {
  it('strips Plex token from URLs', () => {
    const url =
      'http://192.168.1.10:32400/library/metadata/1/thumb/2?X-Plex-Token=secret';
    expect(stripTokenFromUrl(url)).not.toContain('X-Plex-Token');
    expect(extractThumbPathFromUrl(url)).toBe('/library/metadata/1/thumb/2');
  });

  it('rejects unsafe paths', () => {
    expect(isValidPlexImagePath('/library/metadata/1/thumb/2')).toBe(true);
    expect(isValidPlexImagePath('http://evil.com/x')).toBe(false);
    expect(isValidPlexImagePath('/library/../etc/passwd')).toBe(false);
  });

  it('builds proxy URLs', () => {
    expect(plexImageUrl('/library/metadata/1/thumb/2')).toBe(
      '/api/plex/image?path=%2Flibrary%2Fmetadata%2F1%2Fthumb%2F2'
    );
  });

  it('detects token leakage', () => {
    expect(containsPlexToken('?X-Plex-Token=abc')).toBe(true);
    expect(containsPlexToken('/library/metadata/1/thumb/2')).toBe(false);
  });
});
