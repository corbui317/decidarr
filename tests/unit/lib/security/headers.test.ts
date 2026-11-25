import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { buildSecurityHeaders, isHttpsRequest } from '@/lib/security/headers';

function request(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, { headers });
}

describe('buildSecurityHeaders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets CSP, frame-ancestors, nosniff, and referrer policy on every response', () => {
    const headers = buildSecurityHeaders(request('http://localhost/'));

    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('omits Strict-Transport-Security for a plain HTTP request', () => {
    const headers = buildSecurityHeaders(request('http://localhost/'));

    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('sets Strict-Transport-Security for a direct HTTPS request', () => {
    const headers = buildSecurityHeaders(request('https://localhost/'));

    expect(headers['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
  });

  it('ignores X-Forwarded-Proto when TRUST_PROXY is not set', () => {
    const headers = buildSecurityHeaders(
      request('http://localhost/', { 'x-forwarded-proto': 'https' })
    );

    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('trusts X-Forwarded-Proto when TRUST_PROXY is set', () => {
    vi.stubEnv('TRUST_PROXY', 'true');

    expect(
      isHttpsRequest(request('http://localhost/', { 'x-forwarded-proto': 'https' }))
    ).toBe(true);
    expect(
      isHttpsRequest(request('http://localhost/', { 'x-forwarded-proto': 'http' }))
    ).toBe(false);
  });
});
