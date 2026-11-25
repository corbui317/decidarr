import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import {
  authenticateTestSession,
  clearTestCookies,
  seedConfiguredSettings,
} from '../helpers/auth';
import { fakeIntegrations, type SentRequest } from '../helpers/fake-integrations';

import { GET as plexImageGet } from '@/app/api/plex/image/route';

function imageRequest(path: string, width?: number): NextRequest {
  const params = new URLSearchParams({ path });
  if (width !== undefined) params.set('width', String(width));
  return new NextRequest(`http://localhost/api/plex/image?${params.toString()}`);
}

describe('GET /api/plex/image', () => {
  let sent: SentRequest[];

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    ({ sent } = fakeIntegrations(
      () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } })
    ));
  });

  it('returns 401 without an authenticated session', async () => {
    await seedConfiguredSettings();

    const res = await plexImageGet(imageRequest('/library/metadata/1/thumb/2'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(sent).toEqual([]);
  });

  it('streams an allowed Plex image path for a valid session', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();
    const res = await plexImageGet(imageRequest('/library/metadata/1/thumb/2', 300));
    const body = new Uint8Array(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('private');
    expect(Array.from(body)).toEqual([1, 2, 3]);
    expect(sent.map(({ url }) => url.toString())).toEqual([
      'http://192.168.1.10:32400/library/metadata/1/thumb/2?width=300',
    ]);
    expect(sent[0].headers.get('X-Plex-Token')).toBe('test-plex-token-abcdefghijklmnop');
    expect(sent[0].headers.get('Accept')).toBe('image/*,*/*');
  });

  it('rejects path traversal without fetching upstream', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();

    const res = await plexImageGet(imageRequest('/library/../metadata/1/thumb/2'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid image path/i);
    expect(sent).toEqual([]);
  });

  it('rejects external URLs without fetching upstream', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();

    const res = await plexImageGet(imageRequest('https://evil.example/image.jpg'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid image path/i);
    expect(sent).toEqual([]);
  });

  it('rejects percent-encoded traversal without fetching upstream', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();

    const res = await plexImageGet(imageRequest('/library/%2e%2e/identity'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid image path/i);
    expect(sent).toEqual([]);
  });

  it('rejects path that normalizes outside /library/ without fetching upstream', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();

    const res = await plexImageGet(imageRequest('/library/foo/../../identity'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid image path/i);
    expect(sent).toEqual([]);
  });
});
