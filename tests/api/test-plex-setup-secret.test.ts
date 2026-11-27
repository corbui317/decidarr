import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import { clearTestCookies } from '../helpers/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { clearRateLimitStore } from '@/lib/security/rate-limit';
import { setupSecretHeaderName } from '@/lib/security/setup-secret';

import { POST as testPlexPost } from '@/app/api/settings/test-plex/route';

function testPlexRequest(headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/settings/test-plex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ plexToken: 'some-plex-token' }),
  });
}

describe('POST /api/settings/test-plex setup secret gating', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    clearRateLimitStore();
    const settings = await getOrCreateSettings();
    settings.setupComplete = false;
    await settings.save();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearRateLimitStore();
  });

  it('rejects a configured setup secret shorter than 16 characters', async () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'too-short');

    const res = await testPlexPost(testPlexRequest({ [setupSecretHeaderName()]: 'too-short' }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe('SETUP_SECRET_TOO_SHORT');
  });

  it('rate limits wrong setup secret guesses with the shared rate-limited code', async () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'expected-setup-secret');

    const results: number[] = [];
    for (let i = 0; i < 60; i++) {
      const res = await testPlexPost(
        testPlexRequest({ [setupSecretHeaderName()]: `wrong-guess-${i}` })
      );
      results.push(res.status);
    }

    expect(results).toContain(429);

    const correct = await testPlexPost(
      testPlexRequest({ [setupSecretHeaderName()]: 'expected-setup-secret' })
    );
    expect(correct.status).not.toBe(429);
    expect(correct.status).not.toBe(503);
  });
});
