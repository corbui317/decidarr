import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '../../../../src');
const USER_DATA = join(SRC, 'lib/user-data');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const outsideStore = listFiles(SRC).filter((file) => !file.startsWith(USER_DATA));
const offenders = (pattern: RegExp) =>
  outsideStore.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => relative(SRC, file));

describe('the user-data store is the only write path', () => {
  it('nothing outside the store emits sync changes', () => {
    expect(offenders(/emitSyncChange|user-data\/sync-changes/)).toEqual([]);
  });

  it('nothing outside the store keeps its own spin history preference logic', () => {
    expect(offenders(/spinHistoryPreferences|function normalizeSpinHistoryPreferences|retentionLimit\s*\?\?/)).toEqual([
      // The one-time upgrade reads the single-user copy that v1 kept on the settings document.
      'lib/migrate.ts',
    ]);
  });
});
