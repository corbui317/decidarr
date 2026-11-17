/**
 * Test mode detection for E2E testing.
 * Guards test-only code paths from production builds.
 *
 * This helper ensures test mocks and test-only endpoints are never
 * accessible in production, even if E2E_MOCK_PLEX is set.
 *
 * The __E2E_COMPILE_TIME_CHECK__ is replaced with 'false' at build time
 * in production, allowing webpack to fully eliminate the dead code branches.
 * Next.js also inlines NODE_ENV at build time for additional safety.
 */
export function isE2eMockMode(): boolean {
  // Build-time constant in production builds (webpack DefinePlugin replaces this)
  if (process.env.__E2E_COMPILE_TIME_CHECK__ === 'false') {
    return false;
  }

  // Runtime check in development
  return process.env.NODE_ENV !== 'production' && process.env.E2E_MOCK_PLEX === 'true';
}
