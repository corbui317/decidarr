import type { NextRequest } from 'next/server';

/**
 * Next's App Router inlines the hydration payload as <script> tags on every
 * response (static or dynamic), so script-src needs 'unsafe-inline' without a
 * nonce; a nonce would require every page to opt out of static rendering,
 * which is a larger change than this header policy. next dev (Turbopack) also
 * hydrates with eval'd chunks and keeps a dev-time websocket open for Fast
 * Refresh; neither exists in a production build.
 */
function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https://image.tmdb.org",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    `connect-src 'self'${isDev ? ' ws:' : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; ');
}

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
    'Content-Security-Policy': buildContentSecurityPolicy(),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  if (isHttpsRequest(request)) {
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  }

  return headers;
}
