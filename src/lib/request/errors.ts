import { NextResponse } from 'next/server';
import { isAuthError } from '@/lib/auth-errors';

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

/** Maps any thrown value to the response the table defines; unknown errors become INTERNAL. */
export function errorResponse(error: unknown): NextResponse {
  let domainError: DomainError;
  if (error instanceof DomainError) {
    domainError = error;
  } else if (isAuthError(error)) {
    // The old auth helpers throw SessionError; keep their message, map their code.
    domainError = new DomainError(
      error.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTHENTICATED',
      error.message
    );
  } else {
    domainError = new DomainError('INTERNAL');
  }

  const body: { error: string; code: DomainErrorCode; issues?: ValidationIssue[] } = {
    error: domainError.message,
    code: domainError.code,
  };
  if (domainError.issues) {
    body.issues = domainError.issues;
  }
  return NextResponse.json(body, { status: ERROR_TABLE[domainError.code].status });
}
