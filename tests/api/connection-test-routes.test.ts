import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import {
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
  seedConfiguredSettings,
  seedTestUser,
} from '../helpers/auth';

import { POST as overseerrTestPost } from '@/app/api/overseerr/test/route';
import { POST as tautulliTestPost } from '@/app/api/tautulli/test/route';

describe.each([
  { name: 'overseerr', url: 'http://localhost/api/overseerr/test', post: () => overseerrTestPost },
  { name: 'tautulli', url: 'http://localhost/api/tautulli/test', post: () => tautulliTestPost },
])('POST /api/$name/test', ({ url, post }) => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
  });

  it('answers 401 without a session', async () => {
    const req = createJsonRequest(url, 'POST', { url: 'http://service.example', apiKey: 'a-key' });
    const res = await post()(req);
    expect(res.status).toBe(401);
  });

  it('answers 403 for a non-admin Friend', async () => {
    const friend = await seedTestUser({
      plexUserId: 'friend-1',
      plexUsername: 'friend',
      isAdmin: false,
      isApproved: true,
    });
    await authenticateTestSession({ user: friend });

    const req = createJsonRequest(url, 'POST', { url: 'http://service.example', apiKey: 'a-key' });
    const res = await post()(req);
    expect(res.status).toBe(403);
  });

  it('answers 400 when the url is missing', async () => {
    await authenticateTestSession();

    const req = createJsonRequest(url, 'POST', { apiKey: 'a-key' });
    const res = await post()(req);
    expect(res.status).toBe(400);
  });

  it('answers 400 when the apiKey is missing', async () => {
    await authenticateTestSession();

    const req = createJsonRequest(url, 'POST', { url: 'http://service.example' });
    const res = await post()(req);
    expect(res.status).toBe(400);
  });

  it('answers 400 for a disallowed service URL', async () => {
    await authenticateTestSession();

    const req = createJsonRequest(url, 'POST', { url: 'http://169.254.169.254', apiKey: 'a-key' });
    const res = await post()(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
