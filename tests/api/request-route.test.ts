import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { okResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';
import { createIntegrationClient } from '@/lib/integrations/client';
import { fakeIntegrations, redirectTo } from '../helpers/fake-integrations';
import type { Session } from '@/lib/request/session';
import { issueTokenPair } from '@/lib/mobile-auth/tokens';
import { deriveKey } from '@/lib/secrets';
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
      const handler = route({ access: 'user', response: okResponseSchema }, async ({ session, reply }) => {
        seen.push(session);
        return reply({ ok: true });
      });

      await authenticateTestSession({ user: friend });
      expect((await handler(request('GET', {}))).status).toBe(200);
      clearTestCookies();
      const bearer = await bearerFor(friend);
      expect((await handler(request('GET', { Authorization: `Bearer ${bearer}` }))).status).toBe(200);

      const [cookieSession, bearerSession] = seen;
      expect(cookieSession.credential).toBe('cookie');
      expect(bearerSession.credential).toBe('bearer');
      // expiresAt is excluded: web sessions and mobile access tokens have different lifetimes.
      expect({ ...cookieSession, credential: null, expiresAt: null }).toEqual({
        ...bearerSession,
        credential: null,
        expiresAt: null,
      });
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
      const adminOnly = route({ access: 'admin', response: okResponseSchema }, async ({ reply }) => reply({ ok: true }));
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
      const broken = route({ access: 'public', response: okResponseSchema }, async () => {
        throw new Error('database password is hunter2');
      });
      const res = await broken(request('GET', {}));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal server error', code: 'INTERNAL' });
    });

    it('maps integration errors to 503 INTEGRATION_UNAVAILABLE or 502 INTEGRATION_REJECTED without leaking details', async () => {
      const callsTautulli = route({ access: 'public', response: okResponseSchema }, async ({ reply }) => {
        const tautulli = createIntegrationClient({
          integration: 'Tautulli',
          baseUrl: 'http://tautulli.internal.example:8181',
          timeoutMs: 1_000,
        });
        await tautulli.json('/api/v2');
        return reply({ ok: true });
      });
      const answers = [new Response('down', { status: 503 }), redirectTo('http://elsewhere.example/')];
      fakeIntegrations(() => answers.shift()!);

      const unavailable = await callsTautulli(request('GET', {}));
      expect(unavailable.status).toBe(503);
      expect(await unavailable.json()).toEqual({ error: 'Integration unavailable', code: 'INTEGRATION_UNAVAILABLE' });

      const rejected = await callsTautulli(request('GET', {}));
      expect(rejected.status).toBe(502);
      expect(await rejected.json()).toEqual({
        error: 'Integration rejected the request',
        code: 'INTEGRATION_REJECTED',
      });
    });

    it('answers 429 RATE_LIMITED once a route policy is exhausted', async () => {
      const limited = route(
        { access: 'public', response: okResponseSchema, rateLimit: { scope: 'test', windowMs: 60_000, maxAttempts: 1 } },
        async ({ reply }) => reply({ ok: true })
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
          response: z.object({
            params: z.object({ id: z.string() }),
            query: z.object({ n: z.number() }),
            body: z.object({ name: z.string() }),
          }),
        },
        async ({ params, query, body, reply }) => reply({ params, query, body })
      );
      const res = await echo(
        new Request('http://localhost/api/x?n=3', { method: 'POST', body: '{"name":"a","extra":1}' }),
        { params: Promise.resolve({ id: 'abc' }) }
      );
      expect(await res.json()).toEqual({ params: { id: 'abc' }, query: { n: 3 }, body: { name: 'a' } });
    });
  });

  describe('reply contracts', () => {
    const entry = z.object({ id: z.string(), title: z.string(), when: z.string() });
    const listReply = z.object({ items: z.array(entry), owner: z.object({ name: z.string() }) });
    const leaky = {
      items: [{ id: '1', title: 'A', when: new Date('2026-01-02T03:04:05.000Z'), plexToken: 'secret-token-1' }],
      owner: { name: 'friend', passwordHash: 'secret-hash' },
      internalNote: 'secret-note',
    };

    function leakyRoute() {
      // The cast stands in for a handler whose types drifted from its contract.
      return route({ access: 'public', response: listReply }, async () => leaky as never);
    }

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('types reply() by the contract, so undeclared or renamed fields fail typecheck', () => {
      route({ access: 'public', response: listReply }, async ({ reply }) =>
        reply({
          items: [{ id: '1', title: 'A', when: 'x' }],
          // @ts-expect-error -- `nmae` is not a field of the contract's owner
          owner: { nmae: 'friend' },
        })
      );
      route({ access: 'public', response: listReply }, async ({ reply }) =>
        reply({
          // @ts-expect-error -- `secret` is not declared on an entry
          items: [{ id: '1', title: 'A', when: 'x', secret: 's' }],
          owner: { name: 'friend' },
        })
      );
    });

    it('carries the declared contract on the handler', () => {
      expect(leakyRoute().response).toBe(listReply);
    });

    it('fails a reply with undeclared fields under test, so a test that reaches it fails', async () => {
      const res = await leakyRoute()(request('GET', {}));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal server error', code: 'INTERNAL' });
    });

    it('in a running install, strips undeclared fields at every depth, logs, and still sends the reply', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const res = await leakyRoute()(request('GET', {}));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        items: [{ id: '1', title: 'A', when: '2026-01-02T03:04:05.000Z' }],
        owner: { name: 'friend' },
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = String(warn.mock.calls[0][0]);
      expect(logged).toContain('Reply does not match its contract');
      expect(logged).toContain('items[].plexToken');
      expect(logged).toContain('owner.passwordHash');
      expect(logged).toContain('internalNote');
      expect(logged).not.toMatch(/secret-/);
    });

    it('in a running install, still sends a reply whose declared fields are missing or of the wrong type', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const wrong = route(
        { access: 'public', response: listReply },
        async () => ({ items: [{ id: 7, title: 'secret-title', extra: 'secret-extra' }] }) as never
      );

      const res = await wrong(request('GET', {}));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ items: [{ id: 7, title: 'secret-title' }] });
      const logged = String(warn.mock.calls[0][0]);
      expect(logged).toContain('items.0.id (invalid_type)');
      expect(logged).toContain('items.0.when (invalid_type)');
      expect(logged).toContain('owner (invalid_type)');
      expect(logged).not.toMatch(/secret-/);
    });

    it('checks error replies against the shared error contract, with the same stripping', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const failing = route({ access: 'public', response: listReply }, async () =>
        errorReply(409, { error: 'Taken', code: 'TAKEN', serverUrl: 'http://10.0.0.2:32400' } as never)
      );

      const res = await failing(request('GET', {}));

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'Taken', code: 'TAKEN' });
    });

    it('fails an error reply with undeclared fields under test too', async () => {
      const failing = route({ access: 'public', response: listReply }, async () =>
        errorReply(409, { error: 'Taken', serverUrl: 'http://10.0.0.2:32400' } as never)
      );
      expect((await failing(request('GET', {}))).status).toBe(500);
    });

    it('sends a matching reply with the status the handler chose', async () => {
      const created = route({ access: 'public', response: listReply }, async ({ reply }) =>
        reply({ items: [{ id: '1', title: 'A', when: new Date(0) }], owner: { name: 'friend' } }, 201)
      );
      const res = await created(request('GET', {}));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        items: [{ id: '1', title: 'A', when: '1970-01-01T00:00:00.000Z' }],
        owner: { name: 'friend' },
      });
    });

    it('passes a raw route its own Response, but never a JSON success body', async () => {
      const image = route({ access: 'public', response: 'raw' }, async () =>
        new Response('bytes', { headers: { 'Content-Type': 'image/png' } })
      );
      const res = await image(request('GET', {}));
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(await res.text()).toBe('bytes');

      const jsonFromRaw = route({ access: 'public', response: 'raw' }, async ({ reply }) =>
        reply({ secret: 'x' } as never)
      );
      expect((await jsonFromRaw(request('GET', {}))).status).toBe(500);
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
      const token = jwt.sign(
        { sub: friend._id.toString(), plexUserId: friend.plexUserId, isAdmin: false, sessionVersion: 0 },
        deriveKey('web-session'),
        { algorithm: 'HS384', expiresIn: '1h' }
      );
      setTestCookie('decidarr_session', token);
      expect((await spinHistoryGet(request('GET', {}))).status).toBe(401);
    });

    it('rejects a bearer token signed with another algorithm', async () => {
      const token = jwt.sign(
        {
          sub: friend._id.toString(),
          plexUserId: friend.plexUserId,
          isAdmin: false,
          sessionVersion: 0,
          deviceId: 'device-1',
          aud: 'decidarr-mobile',
        },
        deriveKey('mobile-access-token'),
        { algorithm: 'HS384', expiresIn: 900 }
      );
      const res = await spinHistoryGet(request('GET', { Authorization: `Bearer ${token}` }));
      expect(res.status).toBe(401);
    });
  });
});
