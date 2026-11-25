import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '@/app/api/test/reset/route';
import { checkRateLimit } from '@/lib/security/rate-limit';

function createResetRequest(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret !== undefined) {
    headers['X-E2E-Reset-Secret'] = secret;
  }

  return new Request('http://localhost/api/test/reset', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/test/reset', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_MOCK_PLEX', 'true');
  });

  it('returns 403 when E2E_TEST_RESET_SECRET is set but header is missing', async () => {
    vi.stubEnv('E2E_TEST_RESET_SECRET', 'test-secret');

    const res = await POST(createResetRequest());
    expect(res.status).toBe(403);
  });

  it('returns 403 when header does not match secret', async () => {
    vi.stubEnv('E2E_TEST_RESET_SECRET', 'test-secret');

    const res = await POST(createResetRequest('wrong-secret'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when E2E_MOCK_PLEX is not true', async () => {
    vi.stubEnv('E2E_MOCK_PLEX', 'false');

    const res = await POST(createResetRequest('any-secret'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when E2E_TEST_RESET_SECRET is not set', async () => {
    vi.stubEnv('E2E_TEST_RESET_SECRET', '');

    const res = await POST(createResetRequest('any-secret'));
    expect(res.status).toBe(403);
  });

  it('returns 404 in production even with correct secret', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_TEST_RESET_SECRET', 'test-secret');

    const res = await POST(createResetRequest('test-secret'));
    expect(res.status).toBe(404);
  });

  it('forgets rate-limit buckets so the next run starts like a fresh process', async () => {
    vi.stubEnv('E2E_TEST_RESET_SECRET', 'test-secret');
    const config = { windowMs: 60_000, maxAttempts: 1 };
    checkRateLimit('auth:start:unknown', config);
    expect(checkRateLimit('auth:start:unknown', config).allowed).toBe(false);

    const res = await POST(createResetRequest('test-secret'));
    expect(res.status).toBe(200);
    expect(checkRateLimit('auth:start:unknown', config).allowed).toBe(true);
  });
});
