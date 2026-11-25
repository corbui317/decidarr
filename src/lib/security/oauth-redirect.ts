import { createLogger } from '@/lib/logger';

const logger = createLogger('OAuthRedirect');

/**
 * The URL Plex sends the browser back to after sign-in, or undefined when it cannot be
 * trusted. Only the request's own origin is used, and only when it matches APP_URL
 * (or NEXTAUTH_URL); a spoofed Host header must never become a redirect target.
 */
export function resolveOAuthForwardUrl(request: Request): string | undefined {
  const allowedOrigin = configuredAppOrigin();
  if (!allowedOrigin) {
    return undefined;
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    if (requestOrigin !== allowedOrigin) {
      logger.warn('OAuth redirect origin mismatch', {
        requested: requestOrigin,
        allowed: allowedOrigin,
      });
      return undefined;
    }
    return `${requestOrigin}/`;
  } catch {
    return undefined;
  }
}

/** The canonical origin from APP_URL (or NEXTAUTH_URL), or undefined when unset or unparsable. */
export function configuredAppOrigin(): string | undefined {
  const appUrl = process.env.APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  if (!appUrl) return undefined;
  try {
    return new URL(appUrl).origin;
  } catch {
    return undefined;
  }
}
