import { describe, it, expect } from 'vitest';
import { normalizeUrl, validatePlexUrl, isAuthError } from '@/lib/auth';

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

describe('validatePlexUrl', () => {
  it('allows RFC1918 private LAN addresses', () => {
    const result = validatePlexUrl('http://192.168.1.10:32400');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('http://192.168.1.10:32400');
  });

  it('blocks loopback localhost', () => {
    const result = validatePlexUrl('http://localhost:32400');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/loopback/i);
  });

  it('blocks 127.x.x.x addresses', () => {
    expect(validatePlexUrl('http://127.0.0.1:32400').valid).toBe(false);
  });

  it('blocks link-local metadata addresses', () => {
    const result = validatePlexUrl('http://169.254.169.254');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/link-local/i);
  });

  it('allows https private LAN URLs', () => {
    const result = validatePlexUrl('https://192.168.1.10:32400');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('https://192.168.1.10:32400');
  });

  it('rejects malformed URLs', () => {
    expect(validatePlexUrl('not a url').valid).toBe(false);
  });
});

describe('isAuthError', () => {
  it('identifies auth configuration errors', () => {
    expect(isAuthError(new Error('Unauthorized'))).toBe(true);
    expect(isAuthError(new Error('App not configured'))).toBe(true);
    expect(isAuthError(new Error('Something else'))).toBe(false);
  });
});
