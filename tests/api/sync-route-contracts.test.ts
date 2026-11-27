import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import {
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
  seedConfiguredSettings,
  seedTestUser,
} from '../helpers/auth';
import { syncMutation } from '../helpers/sync';
import { issueTokenPair } from '@/lib/mobile-auth/tokens';
import { clearRateLimitStore } from '@/lib/security/rate-limit';
import { IUser } from '@/lib/models/User';

import { GET as bootstrapGet } from '@/app/api/v1/sync/bootstrap/route';
import { GET as changesGet } from '@/app/api/v1/sync/changes/route';
import { POST as mutationsPost } from '@/app/api/v1/sync/mutations/route';

async function bearerFor(user: IUser): Promise<string> {
  return (await issueTokenPair(user, `device-${user.plexUserId}`)).accessToken;
}

describe('v1 sync routes: auth and input rejection', () => {
  let user: IUser;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    clearRateLimitStore();
    await seedConfiguredSettings();
    user = await seedTestUser({ plexUserId: 'sync-user', plexUsername: 'syncuser', isAdmin: false });
  });

  describe('bearer-only access', () => {
    it('GET /api/v1/sync/bootstrap rejects a request with no credential', async () => {
      const res = await bootstrapGet(createJsonRequest('http://localhost/api/v1/sync/bootstrap', 'GET'));
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/sync/bootstrap rejects a cookie-authenticated session', async () => {
      await authenticateTestSession({ user });
      const res = await bootstrapGet(createJsonRequest('http://localhost/api/v1/sync/bootstrap', 'GET'));
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/sync/bootstrap accepts a bearer session', async () => {
      const bearer = await bearerFor(user);
      const res = await bootstrapGet(
        new Request('http://localhost/api/v1/sync/bootstrap', {
          headers: { Authorization: `Bearer ${bearer}` },
        })
      );
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/sync/changes rejects a cookie-authenticated session', async () => {
      await authenticateTestSession({ user });
      const res = await changesGet(createJsonRequest('http://localhost/api/v1/sync/changes', 'GET'));
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/sync/changes accepts a bearer session', async () => {
      const bearer = await bearerFor(user);
      const res = await changesGet(
        new Request('http://localhost/api/v1/sync/changes', {
          headers: { Authorization: `Bearer ${bearer}` },
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.changes).toEqual([]);
      expect(body.hasMore).toBe(false);
    });

    it('POST /api/v1/sync/mutations rejects a cookie-authenticated session', async () => {
      await authenticateTestSession({ user });
      const req = createJsonRequest('http://localhost/api/v1/sync/mutations', 'POST', {
        mutations: [syncMutation({ entityId: user._id.toString(), payload: { theme: 'dark' } })],
      });
      const res = await mutationsPost(req);
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/sync/mutations accepts a bearer session with a valid mutation', async () => {
      const bearer = await bearerFor(user);
      const req = new Request('http://localhost/api/v1/sync/mutations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({
          mutations: [
            {
              mutationId: 'mutation-1',
              deviceId: 'device-1',
              entityType: 'preference',
              entityId: user._id.toString(),
              operation: 'upsert',
              baseRevision: null,
              clientChangedAt: new Date().toISOString(),
              payload: { theme: 'dark' },
            },
          ],
        }),
      });
      const res = await mutationsPost(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toEqual([{ mutationId: 'mutation-1', status: 'applied', revision: 1 }]);
    });
  });

  describe('input rejection', () => {
    it('POST /api/v1/sync/mutations rejects a body whose mutations field is not an array', async () => {
      const bearer = await bearerFor(user);
      const req = new Request('http://localhost/api/v1/sync/mutations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ mutations: 'not-an-array' }),
      });
      const res = await mutationsPost(req);
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/sync/mutations rejects a body with no mutations field', async () => {
      const bearer = await bearerFor(user);
      const req = new Request('http://localhost/api/v1/sync/mutations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({}),
      });
      const res = await mutationsPost(req);
      expect(res.status).toBe(400);
    });

    it('POST /api/v1/sync/mutations rejects an empty mutations array', async () => {
      const bearer = await bearerFor(user);
      const req = new Request('http://localhost/api/v1/sync/mutations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ mutations: [] }),
      });
      const res = await mutationsPost(req);
      expect(res.status).toBe(400);
    });

    it('GET /api/v1/sync/changes clamps an out-of-range limit', async () => {
      const bearer = await bearerFor(user);
      const res = await changesGet(
        new Request('http://localhost/api/v1/sync/changes?limit=99999', {
          headers: { Authorization: `Bearer ${bearer}` },
        })
      );
      expect(res.status).toBe(200);
    });
  });
});
