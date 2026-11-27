import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearDatabase } from '../../../helpers/mongo';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { clearRateLimitStore } from '@/lib/security/rate-limit';
import {
  assertSetupSecretAllowed,
  extractSetupSecret,
  setupSecretHeaderName,
  validateSetupSecret,
} from '@/lib/security/setup-secret';

function setupRequest(secret?: string): Request {
  return new Request('http://localhost/setup', {
    headers: secret !== undefined ? { [setupSecretHeaderName()]: secret } : undefined,
  });
}

describe('setup secret guard', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearRateLimitStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearRateLimitStore();
  });

  it('extracts setup secret from the documented header', () => {
    const request = new Request('http://localhost/setup', {
      headers: { [setupSecretHeaderName()]: '  secret-value  ' },
    });

    expect(extractSetupSecret(request)).toBe('secret-value');
  });

  it('validates configured setup secret with length-safe comparison', () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'expected-secret');

    expect(validateSetupSecret('expected-secret')).toBe(true);
    expect(validateSetupSecret('wrong-secret')).toBe(false);
    expect(validateSetupSecret('short')).toBe(false);
    expect(validateSetupSecret(undefined)).toBe(false);
  });

  it('blocks first-run setup in production when no setup secret is configured', async () => {
    await getOrCreateSettings();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DECIDARR_SETUP_SECRET', '');

    const result = await assertSetupSecretAllowed(new Request('http://localhost/setup'));

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: 'Server setup is not configured. Set DECIDARR_SETUP_SECRET before first-run setup.',
      code: 'SETUP_SECRET_REQUIRED',
    });
  });

  it('requires a matching configured secret while setup is incomplete', async () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'expected-setup-secret');

    const denied = await assertSetupSecretAllowed(new Request('http://localhost/setup'));
    const allowed = await assertSetupSecretAllowed(
      new Request('http://localhost/setup', {
        headers: { [setupSecretHeaderName()]: 'expected-setup-secret' },
      })
    );

    expect(denied).toMatchObject({ ok: false, status: 403, code: 'INVALID_SETUP_SECRET' });
    expect(allowed).toEqual({ ok: true });
  });

  it('bypasses setup secret checks after setup is complete', async () => {
    const settings = await getOrCreateSettings();
    settings.setupComplete = true;
    await settings.save();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DECIDARR_SETUP_SECRET', '');

    await expect(assertSetupSecretAllowed(new Request('http://localhost/setup'))).resolves.toEqual({
      ok: true,
    });
  });

  it('rejects a configured setup secret shorter than 16 characters while setup is incomplete', async () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'short-secret');

    const result = await assertSetupSecretAllowed(setupRequest('short-secret'));

    expect(result).toMatchObject({ ok: false, status: 503, code: 'SETUP_SECRET_TOO_SHORT' });
  });

  it('does not enforce the minimum length once setup is complete', async () => {
    const settings = await getOrCreateSettings();
    settings.setupComplete = true;
    await settings.save();
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'short-secret');

    await expect(assertSetupSecretAllowed(setupRequest('anything'))).resolves.toEqual({ ok: true });
  });

  it('never rate limits a correct setup secret', async () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'expected-setup-secret');

    for (let i = 0; i < 20; i++) {
      const result = await assertSetupSecretAllowed(setupRequest('expected-setup-secret'));
      expect(result).toEqual({ ok: true });
    }
  });

  it('rate limits wrong setup secret guesses under the shared ceiling, with the shared rate-limited code', async () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'expected-setup-secret');

    const results: Array<{ ok: boolean; status?: number; code?: string }> = [];
    for (let i = 0; i < 60; i++) {
      results.push(await assertSetupSecretAllowed(setupRequest(`wrong-guess-${i}`)));
    }

    const limited = results.filter((r) => r.code === 'RATE_LIMITED');
    expect(limited.length).toBeGreaterThan(0);
    expect(limited.every((r) => r.ok === false && r.status === 429)).toBe(true);

    const correctAfterFlood = await assertSetupSecretAllowed(setupRequest('expected-setup-secret'));
    expect(correctAfterFlood).toEqual({ ok: true });
  });
});
