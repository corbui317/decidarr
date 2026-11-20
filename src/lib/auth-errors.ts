export type AuthErrorCode =
  | 'NO_OWNED_SERVER'
  | 'NO_SERVER_ACCESS'
  | 'NOT_APPROVED'
  | 'SERVER_MISCONFIGURED'
  | 'AUTH_FAILED'
  | 'PLEX_UNAVAILABLE';

/** Every code a sign-in request (OAuth start or poll) can fail with. */
export type LoginErrorCode =
  | AuthErrorCode
  | 'PLEX_PIN_EXPIRED'
  | 'RATE_LIMITED'
  | 'MISSING_OAUTH_COOKIES'
  | 'INVALID_OAUTH_PIN'
  | 'INVALID_OAUTH_STATE'
  | 'SETUP_SECRET_REQUIRED'
  | 'INVALID_SETUP_SECRET'
  | 'LOGIN_FAILED';

export interface LoginFailure {
  code: AuthErrorCode;
  message: string;
  detailedReason?: string;
}

export function createAuthError(code: AuthErrorCode, detailedReason: string): LoginFailure {
  return {
    code,
    message: 'Authentication failed',
    detailedReason,
  };
}

export type SessionErrorCode = 'APP_NOT_CONFIGURED' | 'UNAUTHORIZED' | 'FORBIDDEN';

const SESSION_ERRORS: Record<SessionErrorCode, { message: string; status: number }> = {
  APP_NOT_CONFIGURED: { message: 'App not configured', status: 401 },
  UNAUTHORIZED: { message: 'Unauthorized', status: 401 },
  FORBIDDEN: { message: 'Forbidden', status: 403 },
};

/** Why a request has no usable session. Routes switch on `code`, never on the message. */
export class SessionError extends Error {
  readonly code: SessionErrorCode;
  readonly status: number;

  constructor(code: SessionErrorCode) {
    super(SESSION_ERRORS[code].message);
    this.name = 'SessionError';
    this.code = code;
    this.status = SESSION_ERRORS[code].status;
  }
}

export function isAuthError(error: unknown): error is SessionError {
  return error instanceof SessionError;
}

export function authErrorStatus(error: unknown): number {
  return isAuthError(error) ? error.status : 500;
}
