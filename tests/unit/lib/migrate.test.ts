import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import { seedConfiguredSettings } from '../../helpers/auth';
import { LibraryCache } from '@/lib/models/LibraryCache';

describe('runMigrations', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.resetModules();
  });

  it('retries on next call when a prior invocation threw before completion', async () => {
    await seedConfiguredSettings();

    const findMock = vi.fn()
      .mockRejectedValueOnce(new Error('transient db error'))
      .mockResolvedValueOnce([]);

    vi.doMock('@/lib/models/LibraryCache', () => ({
      LibraryCache: {
        find: findMock,
        findOneAndUpdate: vi.fn(),
      },
    }));

    const { runMigrations, resetMigrationStateForTests } = await import('@/lib/migrate');
    resetMigrationStateForTests();

    await expect(runMigrations()).rejects.toThrow('transient db error');

    vi.resetModules();
    vi.doMock('@/lib/models/LibraryCache', () => ({
      LibraryCache: {
        find: findMock,
        findOneAndUpdate: vi.fn(),
      },
    }));

    const { runMigrations: runMigrationsAgain, resetMigrationStateForTests: resetAgain } =
      await import('@/lib/migrate');
    resetAgain();

    await expect(runMigrationsAgain()).resolves.toBeUndefined();
    expect(findMock).toHaveBeenCalledTimes(2);
  });
});
