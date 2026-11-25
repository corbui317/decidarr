import type { NextRequest } from 'next/server';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: https://image.tmdb.org",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ');

/**
 * Whether this request reached us over HTTPS.
 * Behind a reverse proxy (TRUST_PROXY=true) that terminates TLS, the connection to
 * Next itself is plain HTTP, so X-Forwarded-Proto from the proxy is the only signal.
 */
export function isHttpsRequest(request: NextRequest): boolean {
  const trustProxy = process.env.TRUST_PROXY?.trim().toLowerCase() === 'true';
  if (trustProxy) {
    return request.headers.get('x-forwarded-proto')?.trim().toLowerCase() === 'https';
  }
  return request.nextUrl.protocol === 'https:';
}

/** Security headers applied to every page and API response. */
export function buildSecurityHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  if (isHttpsRequest(request)) {
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  }

  return headers;
}
