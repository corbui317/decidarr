import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '@/app/api/test/reset/route';

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

  it('returns 403 when E2E_MOCK_PLEX is not true', async () => {
    vi.stubEnv('E2E_MOCK_PLEX', 'false');

    const res = await POST(createResetRequest('any-secret'));
    expect(res.status).toBe(403);
  });
});
