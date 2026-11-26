import type { z } from 'zod';
import { connectDB } from '@/lib/db';
import { runMigrations } from '@/lib/migrate';
import { createLogger } from '@/lib/logger';
import { isRateLimited, RateLimitPolicy as CoreRateLimitPolicy } from '@/lib/security/rate-limit';
import { configuredAppOrigin } from '@/lib/security/oauth-redirect';
import { DomainError, errorResponse, ValidationIssue } from './errors';
import { resolveSession, Session } from './session';

const logger = createLogger('API');

/** Who may call a route: anyone, any Admin or Friend, or the Admin only. */
export type Access = 'public' | 'user' | 'admin';

export interface RateLimitPolicy extends CoreRateLimitPolicy {
  /** Names the bucket, so two routes never share counts. */
  scope: string;
}

type Contract = z.ZodType | undefined;
type Parsed<C extends Contract> = C extends z.ZodType ? z.output<C> : undefined;

export interface RouteSpec<A extends Access, B extends Contract, Q extends Contract, P extends Contract> {
  access: A;
  /** JSON body contract; omit for routes that take no body. */
  body?: B;
  /** Query-string contract, applied to the search params as a flat object of strings. */
  query?: Q;
  /** Dynamic route segment contract, for example `{ id }` in `[id]/route.ts`. */
  params?: P;
  rateLimit?: RateLimitPolicy;
}

export interface RouteInput<A extends Access, B extends Contract, Q extends Contract, P extends Contract> {
  request: Request;
  session: A extends 'public' ? null : Session;
  body: Parsed<B>;
  query: Parsed<Q>;
  params: Parsed<P>;
}

type NextRouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

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
function assertSameOrigin(request: Request): void {
  const source = originOf(request.headers.get('origin')) ?? originOf(request.headers.get('referer'));
  const host = request.headers.get('host') ?? new URL(request.url).host;
  const sameHost = source !== null && new URL(source).host === host;
  if (!sameHost && (source === null || source !== configuredAppOrigin())) {
    throw new DomainError('FORBIDDEN', 'Cross-origin request rejected');
  }
}

function parseWith<C extends Contract>(contract: C, value: unknown): Parsed<C> {
  if (!contract) return undefined as Parsed<C>;
  const result = contract.safeParse(value);
  if (!result.success) {
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    throw new DomainError('VALIDATION_FAILED', undefined, issues);
  }
  return result.data as Parsed<C>;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DomainError('VALIDATION_FAILED', 'Request body must be JSON');
  }
}

/**
 * Declares an API route handler. The module connects to the database, applies the
 * rate limit, resolves and authorizes the Session (cookie or bearer), rejects
 * cross-origin cookie writes, and validates params, query, and body before the
 * handler runs. Anything thrown is mapped through the one error table.
 */
export function route<
  A extends Access,
  B extends Contract = undefined,
  Q extends Contract = undefined,
  P extends Contract = undefined,
>(
  spec: RouteSpec<A, B, Q, P>,
  handler: (input: RouteInput<A, B, Q, P>) => Promise<Response>
): (request: Request, context?: NextRouteContext) => Promise<Response> {
  return async (request, context) => {
    try {
      await connectDB();
      await runMigrations();

      if (spec.rateLimit) {
        const { scope, ...policy } = spec.rateLimit;
        if (isRateLimited(request, scope, policy)) {
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

      return await handler({
        request,
        session: session as RouteInput<A, B, Q, P>['session'],
        body,
        query,
        params,
      });
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
}
