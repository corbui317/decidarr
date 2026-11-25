/**
 * Next.js instrumentation hook
 * Runs once at server startup before any requests are handled
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { enforceSecretAtBoot } = await import('./lib/boot-secret');
    enforceSecretAtBoot();
  }
}
