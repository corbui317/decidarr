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
