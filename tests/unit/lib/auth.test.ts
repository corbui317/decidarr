import { describe, it, expect } from 'vitest';
import { normalizeUrl, isAuthError, authErrorStatus, SessionError } from '@/lib/auth';

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
  it('recognizes session errors by type, not by message text', () => {
    expect(isAuthError(new SessionError('UNAUTHORIZED'))).toBe(true);
    expect(isAuthError(new SessionError('APP_NOT_CONFIGURED'))).toBe(true);
    expect(isAuthError(new Error('Unauthorized'))).toBe(false);
    expect(isAuthError(new Error('Something else'))).toBe(false);
  });

  it('maps each session error code to its status', () => {
    expect(authErrorStatus(new SessionError('UNAUTHORIZED'))).toBe(401);
    expect(authErrorStatus(new SessionError('APP_NOT_CONFIGURED'))).toBe(401);
    expect(authErrorStatus(new SessionError('FORBIDDEN'))).toBe(403);
    expect(authErrorStatus(new Error('boom'))).toBe(500);
  });
});

