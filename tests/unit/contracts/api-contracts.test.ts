import { describe, it, expect } from 'vitest';
import {
  SYNC_SCHEMA_VERSION,
  MAX_MUTATION_BATCH_SIZE,
  ACCESS_TOKEN_TTL_SECONDS,
} from '@decidarr/api-contracts';

describe('api-contracts', () => {
  it('exports stable sync schema version', () => {
    expect(SYNC_SCHEMA_VERSION).toBe(1);
  });

  it('defines bounded mutation batch size', () => {
    expect(MAX_MUTATION_BATCH_SIZE).toBeGreaterThan(0);
    expect(MAX_MUTATION_BATCH_SIZE).toBeLessThanOrEqual(100);
  });

  it('uses short-lived access tokens', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(3600);
  });
});
