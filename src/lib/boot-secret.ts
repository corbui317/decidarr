const MIN_SECRET_LENGTH = 32;

/** Stops a production server at boot when DECIDARR_SECRET is missing or too short. */
export function enforceSecretAtBoot() {
  if (process.env.NODE_ENV !== 'production') return;

  const secret = process.env.DECIDARR_SECRET?.trim() ?? '';
  if (secret.length >= MIN_SECRET_LENGTH) return;

  const problem = secret ? `is only ${secret.length} characters` : 'is not set';
  console.error(
    `DECIDARR_SECRET ${problem}. It must be at least ${MIN_SECRET_LENGTH} characters in production. ` +
      'Generate one with `openssl rand -hex 32` and restart the server.'
  );
  // Next.js logs an error thrown from register() and keeps serving, so exit explicitly.
  process.exit(1);
}
