import { describe, it, expect, afterEach, vi } from 'vitest';
import { forgetConnectionForTests } from '@/lib/db';
import { resetMigrationStateForTests } from '@/lib/migrate';
import { clearRateLimitStore } from '@/lib/security/rate-limit';

const testOnlyResets = {
  forgetConnectionForTests,
  resetMigrationStateForTests,
  clearRateLimitStore,
};

describe('test-only state resets', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const [name, reset] of Object.entries(testOnlyResets)) {
    it(`${name} refuses to run in production`, () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(() => reset()).toThrow(/test-only/);
    });
  }
});
