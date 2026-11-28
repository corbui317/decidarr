import { NextResponse } from 'next/server';
import type { z } from 'zod';
import type { ApiErrorBody } from '@decidarr/api-contracts';
import { isAuthError, PLEX_SIGN_IN_REQUIRED_MESSAGE } from '@/lib/auth-errors';
import { IntegrationError } from '@/lib/integrations/client';
import { isPlexSignInRequired } from '@/lib/services/plex';

/**
 * The one table from domain errors to HTTP status and a stable `code` in the body.
 * Clients switch on `code`; `error` is a human-readable message that may change.
 */
const ERROR_TABLE = {
  UNAUTHENTICATED: { status: 401, message: 'Unauthorized' },
  FORBIDDEN: { status: 403, message: 'Forbidden' },
  VALIDATION_FAILED: { status: 400, message: 'Invalid request' },
  NOT_FOUND: { status: 404, message: 'Not found' },
  CONFLICT: { status: 409, message: 'Conflict' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please try again later.' },
  /** The user's Plex server access token is missing or refused; only a new sign-in fixes it (ADR 0002). */
  PLEX_SIGN_IN_REQUIRED: { status: 401, message: PLEX_SIGN_IN_REQUIRED_MESSAGE },
  INTEGRATION_UNAVAILABLE: { status: 503, message: 'Integration unavailable' },
  INTEGRATION_REJECTED: { status: 502, message: 'Integration rejected the request' },
  INTERNAL: { status: 500, message: 'Internal server error' },
} as const;

export type DomainErrorCode = keyof typeof ERROR_TABLE;

export interface ValidationIssue {
  path: string;
  message: string;
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly issues?: ValidationIssue[];

  constructor(code: DomainErrorCode, message?: string, issues?: ValidationIssue[]) {
    super(message ?? ERROR_TABLE[code].message);
    this.name = 'DomainError';
    this.code = code;
    this.issues = issues;
  }
}

/** The value `contract` parses `value` to; throws VALIDATION_FAILED, listing each issue, when it does not. */
export function parseContract<C extends z.ZodType>(contract: C, value: unknown): z.output<C> {
  const result = contract.safeParse(value);
  if (!result.success) {
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    throw new DomainError('VALIDATION_FAILED', undefined, issues);
  }
  return result.data;
}

/** Maps any thrown value to the response the table defines; unknown errors become INTERNAL. */
export function errorResponse(error: unknown): NextResponse {
  let domainError: DomainError;
  if (error instanceof DomainError) {
    domainError = error;
  } else if (isAuthError(error)) {
    // The old auth helpers throw SessionError; keep their message, map their code.
    const code =
      error.code === 'FORBIDDEN' || error.code === 'PLEX_SIGN_IN_REQUIRED' ? error.code : 'UNAUTHENTICATED';
    domainError = new DomainError(code, error.message);
  } else if (isPlexSignInRequired(error)) {
    domainError = new DomainError('PLEX_SIGN_IN_REQUIRED');
  } else if (error instanceof IntegrationError) {
    // The table's message only: the integration's error can name internal hosts.
    domainError = new DomainError(error.unavailable ? 'INTEGRATION_UNAVAILABLE' : 'INTEGRATION_REJECTED');
  } else {
    domainError = new DomainError('INTERNAL');
  }

  const body: ApiErrorBody = {
    error: domainError.message,
    code: domainError.code,
  };
  if (domainError.issues) {
    body.issues = domainError.issues;
  }
  return NextResponse.json(body, { status: ERROR_TABLE[domainError.code].status });
}
