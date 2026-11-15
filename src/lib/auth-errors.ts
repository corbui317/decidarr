export type AuthErrorCode =
  | 'NO_OWNED_SERVER'
  | 'NO_SERVER_ACCESS'
  | 'NOT_APPROVED'
  | 'SERVER_MISCONFIGURED'
  | 'AUTH_FAILED'
  | 'PLEX_UNAVAILABLE';

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  detailedReason?: string;
}

export function createAuthError(code: AuthErrorCode, detailedReason: string): AuthError {
  return {
    code,
    message: 'Authentication failed',
    detailedReason,
  };
}
