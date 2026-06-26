import { timingSafeEqual } from 'crypto';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { createLogger } from '@/lib/logger';

const logger = createLogger('SetupSecret');

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

  const provided = extractSetupSecret(request);
  if (!validateSetupSecret(provided)) {
    return {
      ok: false,
      status: 403,
      error: 'Invalid setup secret',
      code: 'INVALID_SETUP_SECRET',
    };
  }

  return { ok: true };
}
