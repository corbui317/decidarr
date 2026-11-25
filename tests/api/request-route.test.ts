import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  seedTestUser,
  authenticateTestSession,
  createJsonRequest,
  clearTestCookies,
} from '../helpers/auth';
import { setTestCookie } from '../helpers/cookies';
import { route } from '@/lib/request/route';
import type { Session } from '@/lib/request/session';
import { issueTokenPair } from '@/lib/mobile-auth/tokens';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User, IUser } from '@/lib/models/User';
import { clearRateLimitStore } from '@/lib/security/rate-limit';
import { GET as spinHistoryGet, POST as spinHistoryPost } from '@/app/api/spin-history/route';

const URL_BASE = 'http://localhost/api/spin-history';
const SPIN = { plexId: '1', title: 'A Spin', mediaType: 'movie' };

function request(method: string, headers: Record<string, string>, body?: unknown) {
  return new Request(URL_BASE, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function bearerFor(user: IUser): Promise<string> {
  return (await issueTokenPair(user, `device-${user.plexUserId}`)).accessToken;
}

describe('request-handling module', () => {
  let friend: IUser;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    clearRateLimitStore();
    await seedConfiguredSettings();
    friend = await seedTestUser({ plexUserId: 'plex-friend', plexUsername: 'friend', isAdmin: false });
  });

  afterEach(() => {
    delete process.env.APP_URL;
  });

  describe('Session seam', () => {
    it('gives cookie and bearer requests the same Session for the same user', async () => {
      const seen: Session[] = [];
      const handler = route({ access: 'user' }, async ({ session }) => {
        seen.push(session);
        return NextResponse.json({ ok: true });
      });

      await authenticateTestSession({ user: friend });
      expect((await handler(request('GET', {}))).status).toBe(200);
      clearTestCookies();
      const bearer = await bearerFor(friend);
      expect((await handler(request('GET', { Authorization: `Bearer ${bearer}` }))).status).toBe(200);

      const [cookieSession, bearerSession] = seen;
      expect(cookieSession.credential).toBe('cookie');
      expect(bearerSession.credential).toBe('bearer');
      expect({ ...cookieSession, credential: null }).toEqual({ ...bearerSession, credential: null });
      expect(cookieSession.userId.toString()).toBe(friend._id.toString());
      expect(cookieSession.isAdmin).toBe(false);
    });

    it('never falls back to the cookie when the bearer token is invalid', async () => {
      await authenticateTestSession({ user: friend });
      const res = await spinHistoryGet(request('GET', { Authorization: 'Bearer not-a-token' }));
      expect(res.status).toBe(401);
    });

    it('rejects a revoked session from either credential', async () => {
      await authenticateTestSession({ user: friend });
      const bearer = await bearerFor(friend);
      await User.updateOne({ _id: friend._id }, { $inc: { sessionVersion: 1 } });

      expect((await spinHistoryGet(request('GET', {}))).status).toBe(401);
      const res = await spinHistoryGet(request('GET', { Authorization: `Bearer ${bearer}` }));
      expect(res.status).toBe(401);
    });
  });

  describe('error table', () => {
    it('answers 401 UNAUTHENTICATED without a session', async () => {
      const res = await spinHistoryGet(request('GET', {}));
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe('UNAUTHENTICATED');
    });

    it('answers 403 FORBIDDEN when a Friend calls an Admin route', async () => {
      const adminOnly = route({ access: 'admin' }, async () => NextResponse.json({ ok: true }));
      await authenticateTestSession({ user: friend });
      const res = await adminOnly(request('GET', {}));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('FORBIDDEN');

      const admin = await seedTestUser({ plexUserId: 'plex-admin', isAdmin: true });
      await authenticateTestSession({ user: admin });
      expect((await adminOnly(request('GET', {}))).status).toBe(200);
    });

    it('answers 400 VALIDATION_FAILED with the failing fields for an invalid body', async () => {
      await authenticateTestSession({ user: friend });
      const res = await spinHistoryPost(
        createJsonRequest(URL_BASE, 'POST', { plexId: '1', title: 'A Spin', mediaType: 'album' })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.issues.map((issue: { path: string }) => issue.path)).toEqual(['mediaType']);
    });

    it('answers 400 VALIDATION_FAILED for a body that is not JSON', async () => {
      await authenticateTestSession({ user: friend });
      const res = await spinHistoryPost(
        new Request(URL_BASE, { method: 'POST', headers: { Origin: 'http://localhost' }, body: '{' })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('VALIDATION_FAILED');
    });

    it('answers 400 VALIDATION_FAILED for an invalid query', async () => {
      await authenticateTestSession({ user: friend });
      const res = await spinHistoryGet(new Request(`${URL_BASE}?limit=500`));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('VALIDATION_FAILED');
    });

    it('answers 500 INTERNAL without leaking the error message', async () => {
      const broken = route({ access: 'public' }, async () => {
        throw new Error('database password is hunter2');
      });
      const res = await broken(request('GET', {}));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal server error', code: 'INTERNAL' });
    });

    it('answers 429 RATE_LIMITED once a route policy is exhausted', async () => {
      const limited = route(
        { access: 'public', rateLimit: { scope: 'test', windowMs: 60_000, maxAttempts: 1 } },
        async () => NextResponse.json({ ok: true })
      );
      expect((await limited(request('GET', {}))).status).toBe(200);
      const res = await limited(request('GET', {}));
      expect(res.status).toBe(429);
      expect((await res.json()).code).toBe('RATE_LIMITED');
    });
  });

  describe('input contracts', () => {
    it('passes parsed params, query, and body to the handler', async () => {
      const echo = route(
        {
          access: 'public',
          params: z.object({ id: z.string() }),
          query: z.object({ n: z.coerce.number() }),
          body: z.object({ name: z.string() }),
        },
        async ({ params, query, body }) => NextResponse.json({ params, query, body })
      );
      const res = await echo(
        new Request('http://localhost/api/x?n=3', { method: 'POST', body: '{"name":"a","extra":1}' }),
        { params: Promise.resolve({ id: 'abc' }) }
      );
      expect(await res.json()).toEqual({ params: { id: 'abc' }, query: { n: 3 }, body: { name: 'a' } });
    });
  });

  describe('Origin check for cookie writes', () => {
    beforeEach(async () => {
      await authenticateTestSession({ user: friend });
    });

    it('rejects a cookie write from another origin', async () => {
      const res = await spinHistoryPost(request('POST', { Origin: 'https://evil.example' }, SPIN));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('FORBIDDEN');
    });

    it('rejects a cookie write that names no origin at all', async () => {
      expect((await spinHistoryPost(request('POST', {}, SPIN))).status).toBe(403);
      expect((await spinHistoryPost(request('POST', { Origin: 'null' }, SPIN))).status).toBe(403);
    });

    it('accepts a cookie write from the same host, by Origin or Referer', async () => {
      expect((await spinHistoryPost(request('POST', { Origin: 'http://localhost' }, SPIN))).status).toBe(201);
      const viaReferer = request('POST', { Referer: 'http://localhost/dashboard' }, SPIN);
      expect((await spinHistoryPost(viaReferer)).status).toBe(201);
    });

    it('compares against the Host header the request was sent to', async () => {
      const res = await spinHistoryPost(
        request('POST', { Host: '192.168.1.5:3100', Origin: 'http://192.168.1.5:3100' }, SPIN)
      );
      expect(res.status).toBe(201);
    });

    it('accepts a cookie write from the configured APP_URL', async () => {
      process.env.APP_URL = 'https://decidarr.example.com';
      const res = await spinHistoryPost(request('POST', { Origin: 'https://decidarr.example.com' }, SPIN));
      expect(res.status).toBe(201);
    });

    it('leaves cookie reads alone', async () => {
      const res = await spinHistoryGet(request('GET', { Origin: 'https://evil.example' }));
      expect(res.status).toBe(200);
    });

    it('exempts bearer requests', async () => {
      clearTestCookies();
      const bearer = await bearerFor(friend);
      const res = await spinHistoryPost(
        request('POST', { Authorization: `Bearer ${bearer}`, Origin: 'https://evil.example' }, SPIN)
      );
      expect(res.status).toBe(201);
    });
  });

  describe('pinned JWT algorithm', () => {
    it('rejects a session cookie signed with another algorithm', async () => {
      const settings = await getOrCreateSettings();
      const token = jwt.sign(
        { sub: friend._id.toString(), plexUserId: friend.plexUserId, isAdmin: false, sessionVersion: 0 },
        settings.getJwtSecret(),
        { algorithm: 'HS384', expiresIn: '1h' }
      );
      setTestCookie('decidarr_session', token);
      expect((await spinHistoryGet(request('GET', {}))).status).toBe(401);
    });

    it('rejects a bearer token signed with another algorithm', async () => {
      const settings = await getOrCreateSettings();
      const token = jwt.sign(
        {
          sub: friend._id.toString(),
          plexUserId: friend.plexUserId,
          isAdmin: false,
          sessionVersion: 0,
          deviceId: 'device-1',
          aud: 'decidarr-mobile',
        },
        settings.getJwtSecret(),
        { algorithm: 'HS384', expiresIn: 900 }
      );
      const res = await spinHistoryGet(request('GET', { Authorization: `Bearer ${token}` }));
      expect(res.status).toBe(401);
    });
  });
});
