import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { runMigrations } from '@/lib/migrate';
import { createLogger } from '@/lib/logger';
import { isRateLimited, RateLimitPolicy as CoreRateLimitPolicy } from '@/lib/security/rate-limit';
import { configuredAppOrigin } from '@/lib/security/oauth-redirect';
import type { ApiErrorBody } from '@decidarr/api-contracts';
import { DomainError, errorResponse, parseContract } from './errors';
import { Reply, sendReply, type Json } from './reply';
import { resolveSession, Session } from './session';

const logger = createLogger('API');

/** Who may call a route: anyone, any Admin or Friend, or the Admin only. */
export type Access = 'public' | 'user' | 'admin';

export interface RateLimitPolicy extends CoreRateLimitPolicy {
  /** Names the bucket, so two routes never share counts. */
  scope: string;
  /**
   * Identifies what is being attacked, when that identifies one of many concurrent
   * instances (a PIN, a device code) rather than a single shared resource. Read from the
   * raw request, since this runs before body parsing.
   */
  target?: (request: Request) => string | undefined;
  /**
   * Skips this rate limit entirely for a request that already proves it is not an attacker,
   * such as one carrying the correct setup secret while setup is incomplete. Unlike `target`,
   * a bypassed request is never counted, so it cannot be used to spend down any bucket either.
   */
  bypass?: (request: Request) => boolean | Promise<boolean>;
}

type Contract = z.ZodType | undefined;
type Parsed<C extends Contract> = C extends z.ZodType ? z.output<C> : undefined;

/**
 * What a route replies with: a contract from `@decidarr/api-contracts` for a JSON reply,
 * or 'raw' for a route that builds its own non-JSON Response (an image).
 */
export type ResponseContract = z.ZodType | 'raw';

/** The body a route's contract declares, as the handler may build it before JSON serialization. */
type ReplyBody<R extends ResponseContract> = R extends z.ZodType ? Json<z.input<R>> : never;

/**
 * Builds a route's success reply (200 unless a 2xx status is given). Its parameter is the
 * contract's type, so a field the contract does not declare, or a renamed one, fails typecheck.
 */
export type ReplyTo<R extends ResponseContract> = (body: ReplyBody<R>, status?: number) => Reply<ReplyBody<R>>;

/**
 * What a handler may return: its input's `reply(...)` or an `errorReply(...)`. A 'raw'
 * route returns its own Response instead.
 */
export type HandlerResult<R extends ResponseContract> = R extends z.ZodType
  ? Reply<ReplyBody<R>> | Reply<ApiErrorBody>
  : Response | Reply<ApiErrorBody>;

export interface RouteSpec<
  A extends Access,
  B extends Contract,
  Q extends Contract,
  P extends Contract,
  R extends ResponseContract,
> {
  access: A;
  /** The reply contract. Every reply is checked against it and stripped to what it declares. */
  response: R;
  /** JSON body contract; omit for routes that take no body. */
  body?: B;
  /** Query-string contract, applied to the search params as a flat object of strings. */
  query?: Q;
  /** Dynamic route segment contract, for example `{ id }` in `[id]/route.ts`. */
  params?: P;
  rateLimit?: RateLimitPolicy;
}

export interface RouteInput<
  A extends Access,
  B extends Contract,
  Q extends Contract,
  P extends Contract,
  R extends ResponseContract = ResponseContract,
> {
  request: Request;
  /** Builds the success reply, typed by the route's response contract. */
  reply: ReplyTo<R>;
  session: A extends 'public' ? null : Session;
  body: Parsed<B>;
  query: Parsed<Q>;
  params: Parsed<P>;
}

type NextRouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

/** A route handler as Next calls it, carrying the reply contract it declared. */
export type RouteHandler<R extends ResponseContract> = ((
  request: Request,
  context?: NextRouteContext
) => Promise<Response>) & { readonly response: R };

/** A 'raw' route sends JSON only as an error reply, so a JSON success reply from one always mismatches. */
const NO_JSON_SUCCESS = z.never();

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * A cookie is sent on cross-site requests too, so a cookie-authenticated write must
 * prove it came from this app: its Origin (or, failing that, Referer) must be the
 * host the request was sent to, or the configured APP_URL.
 */
export function assertSameOrigin(request: Request): void {
  const source = originOf(request.headers.get('origin')) ?? originOf(request.headers.get('referer'));
  const host = request.headers.get('host') ?? new URL(request.url).host;
  const sameHost = source !== null && new URL(source).host === host;
  if (!sameHost && (source === null || source !== configuredAppOrigin())) {
    throw new DomainError('FORBIDDEN', 'Cross-origin request rejected');
  }
}

function parseWith<C extends Contract>(contract: C, value: unknown): Parsed<C> {
  return (contract ? parseContract(contract, value) : undefined) as Parsed<C>;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DomainError('VALIDATION_FAILED', 'Request body must be JSON');
  }
}

/**
 * For routes whose access level depends on runtime state (public until setup
 * completes, then admin): declared `access: 'public'`, the handler calls this once
 * it knows setup is complete, to apply the same Session resolution, same-origin
 * check, and admin gate that `access: 'admin'` would have applied up front.
 */
export async function requireAdminSession(request: Request): Promise<Session> {
  const session = await resolveSession(request);
  if (session.credential === 'cookie' && UNSAFE_METHODS.has(request.method)) {
    assertSameOrigin(request);
  }
  if (!session.isAdmin) {
    throw new DomainError('FORBIDDEN');
  }
  return session;
}

/**
 * Declares an API route handler. The module connects to the database, applies the
 * rate limit, resolves and authorizes the Session (cookie or bearer), rejects
 * cross-origin cookie writes, and validates params, query, and body before the
 * handler runs. It checks the reply against the route's response contract and sends
 * only the fields that contract declares. Anything thrown is mapped through the one
 * error table.
 */
export function route<
  A extends Access,
  R extends ResponseContract,
  B extends Contract = undefined,
  Q extends Contract = undefined,
  P extends Contract = undefined,
>(
  spec: RouteSpec<A, B, Q, P, R>,
  handler: (input: RouteInput<A, B, Q, P, R>) => Promise<HandlerResult<R>>
): RouteHandler<R> {
  const handle = async (request: Request, context?: NextRouteContext): Promise<Response> => {
    try {
      await connectDB();
      await runMigrations();

      if (spec.rateLimit) {
        const { scope, target, bypass, ...policy } = spec.rateLimit;
        const bypassed = bypass ? await bypass(request) : false;
        if (!bypassed && isRateLimited(request, scope, policy, target?.(request))) {
          throw new DomainError('RATE_LIMITED');
        }
      }

      let session: Session | null = null;
      if (spec.access !== 'public') {
        session = await resolveSession(request);
        if (session.credential === 'cookie' && UNSAFE_METHODS.has(request.method)) {
          assertSameOrigin(request);
        }
        if (spec.access === 'admin' && !session.isAdmin) {
          throw new DomainError('FORBIDDEN');
        }
      }

      const params = parseWith(spec.params as P, context ? await context.params : {});
      const query = parseWith(
        spec.query as Q,
        Object.fromEntries(new URL(request.url).searchParams)
      );
      const body = parseWith(spec.body as B, spec.body ? await readJson(request) : undefined);

      const result = await handler({
        request,
        session: session as RouteInput<A, B, Q, P, R>['session'],
        body,
        query,
        params,
        reply: (replyBody, status = 200) => new Reply(status, replyBody),
      });

      if (spec.response === 'raw' && result instanceof Response) {
        return result;
      }
      const source = { method: request.method, path: new URL(request.url).pathname };
      const contract: z.ZodType = spec.response === 'raw' ? NO_JSON_SUCCESS : (spec.response as z.ZodType);
      // A bare body can only arrive through a cast; it is checked like any other reply.
      return result instanceof Reply
        ? sendReply(contract, result.body, result.status, source)
        : sendReply(contract, result, 200, source);
    } catch (error) {
      const response = errorResponse(error);
      if (response.status >= 500) {
        logger.error('Request failed', {
          method: request.method,
          path: new URL(request.url).pathname,
          error: (error as Error)?.message,
        });
      }
      return response;
    }
  };
  return Object.assign(handle, { response: spec.response });
}
