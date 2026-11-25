import jwt from 'jsonwebtoken';

/** Every session JWT (web cookie and mobile access token) is signed and verified with this one algorithm. */
const SESSION_JWT_ALGORITHM = 'HS256';

export function signSessionJwt(
  payload: object,
  secret: Buffer,
  options: Omit<jwt.SignOptions, 'algorithm'>
): string {
  return jwt.sign(payload, secret, { ...options, algorithm: SESSION_JWT_ALGORITHM });
}

/** Throws for a bad signature, an expired token, or any algorithm other than the pinned one. */
export function verifySessionJwt<T>(
  token: string,
  secret: Buffer,
  options: Omit<jwt.VerifyOptions, 'algorithms' | 'complete'> = {}
): T {
  return jwt.verify(token, secret, { ...options, algorithms: [SESSION_JWT_ALGORITHM] }) as T;
}
