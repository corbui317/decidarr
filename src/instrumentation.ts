/**
 * Next.js instrumentation hook
 * Runs once at server startup before any requests are handled
 */

export function register() {
  if (process.env.NODE_ENV === 'production' && !process.env.DECIDARR_SECRET?.trim()) {
    throw new Error(
      'DECIDARR_SECRET is required in production. ' +
      'Set this environment variable to a secure random value before starting the server.'
    );
  }
}
