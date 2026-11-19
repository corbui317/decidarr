export type AuthErrorCode =
  | 'NO_OWNED_SERVER'
  | 'NO_SERVER_ACCESS'
  | 'NOT_APPROVED'
  | 'SERVER_MISCONFIGURED'
  | 'AUTH_FAILED'
  | 'PLEX_UNAVAILABLE';

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
