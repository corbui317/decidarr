import { describe, it, expect } from 'vitest';
import { normalizeUrl, isAuthError } from '@/lib/auth';

describe('normalizeUrl', () => {
  it('adds http protocol when missing', () => {
    expect(normalizeUrl('192.168.1.10:32400')).toBe('http://192.168.1.10:32400');
  });

  it('preserves https and strips trailing slashes', () => {
    expect(normalizeUrl('https://plex.example.com/')).toBe('https://plex.example.com');
  });

  it('returns empty string unchanged', () => {
    expect(normalizeUrl('')).toBe('');
  });
});

describe('isAuthError', () => {
  it('identifies auth configuration errors', () => {
    expect(isAuthError(new Error('Unauthorized'))).toBe(true);
    expect(isAuthError(new Error('App not configured'))).toBe(true);
    expect(isAuthError(new Error('Something else'))).toBe(false);
  });
});
