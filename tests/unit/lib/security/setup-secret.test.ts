import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearDatabase } from '../../../helpers/mongo';
import { getOrCreateSettings } from '@/lib/models/Settings';
import {
  assertSetupSecretAllowed,
  extractSetupSecret,
  setupSecretHeaderName,
  validateSetupSecret,
} from '@/lib/security/setup-secret';

describe('setup secret guard', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'expected-secret');

    const denied = await assertSetupSecretAllowed(new Request('http://localhost/setup'));
    const allowed = await assertSetupSecretAllowed(
      new Request('http://localhost/setup', {
        headers: { [setupSecretHeaderName()]: 'expected-secret' },
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
});
