import { timingSafeEqual } from 'crypto';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { createLogger } from '@/lib/logger';
import { isRateLimited } from '@/lib/security/rate-limit';

const logger = createLogger('SetupSecret');

/** DECIDARR_SETUP_SECRET must be at least this long while setup is incomplete. */
export const MIN_SETUP_SECRET_LENGTH = 16;

/**
 * Wrong guesses against the setup secret, per client when TRUST_PROXY makes a client
 * identifiable, plus a server-wide ceiling well above household use as a backstop when it
 * does not. The correct secret is never checked against this limit.
 */
const SETUP_SECRET_RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
  globalMaxAttempts: 50,
};

export function isSetupSecretRequired(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function isSetupIncomplete(): Promise<boolean> {
  const settings = await getOrCreateSettings();
  return !settings.setupComplete;
}

export function getConfiguredSetupSecret(): string | undefined {
  const secret = process.env.DECIDARR_SETUP_SECRET?.trim();
  return secret || undefined;
}

export function validateSetupSecret(provided: string | null | undefined): boolean {
  const expected = getConfiguredSetupSecret();
  if (!expected) {
    if (isSetupSecretRequired()) {
      return false;
    }
    if (provided) {
      logger.warn('Setup secret provided but DECIDARR_SETUP_SECRET is not configured');
    }
    return true;
  }
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function setupSecretHeaderName(): string {
  return 'X-Decidarr-Setup-Secret';
}

export function extractSetupSecret(request: Request): string | null {
  const header = request.headers.get(setupSecretHeaderName());
  return header?.trim() || null;
}

export async function assertSetupSecretAllowed(
  request: Request
): Promise<{ ok: true } | { ok: false; status: number; error: string; code: string }> {
  if (!(await isSetupIncomplete())) {
    return { ok: true };
  }

  const expected = getConfiguredSetupSecret();
  if (!expected) {
    if (isSetupSecretRequired()) {
      return {
        ok: false,
        status: 503,
        error: 'Server setup is not configured. Set DECIDARR_SETUP_SECRET before first-run setup.',
        code: 'SETUP_SECRET_REQUIRED',
      };
    }
    logger.warn('DECIDARR_SETUP_SECRET not set; allowing setup in non-production');
    return { ok: true };
  }

  if (expected.length < MIN_SETUP_SECRET_LENGTH) {
    logger.error('DECIDARR_SETUP_SECRET is shorter than the minimum length', {
      minLength: MIN_SETUP_SECRET_LENGTH,
    });
    return {
      ok: false,
      status: 503,
      error: `DECIDARR_SETUP_SECRET must be at least ${MIN_SETUP_SECRET_LENGTH} characters.`,
      code: 'SETUP_SECRET_TOO_SHORT',
    };
  }

  const provided = extractSetupSecret(request);
  if (validateSetupSecret(provided)) {
    return { ok: true };
  }

  // The correct secret is never rate limited; only wrong guesses count against the limit.
  if (isRateLimited(request, 'setup-secret', SETUP_SECRET_RATE_LIMIT_CONFIG)) {
    return {
      ok: false,
      status: 429,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    };
  }

  return {
    ok: false,
    status: 403,
    error: 'Invalid setup secret',
    code: 'INVALID_SETUP_SECRET',
  };
}
