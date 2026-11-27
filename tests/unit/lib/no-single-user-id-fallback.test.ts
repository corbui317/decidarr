import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '../../../src');
const SINGLE_USER_ID_REFERENCE = /SINGLE_USER_ID|singleUserId|LEGACY_USER_ID|000000000000000000000001/;
const ALLOWED_FILE = join(SRC, 'lib/migrate.ts');

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Criterion: "No code path can resolve a request to the single-user id;
 * Legacy data is reachable only through migration." The one-time migration
 * in migrate.ts is the sole legitimate reader of a legacy single-user
 * install; no request-handling code should resolve a request to that id.
 */
describe('no request path falls back to the single-user id', () => {
  it('only migrate.ts references a single-user id or the legacy id it migrates', () => {
    const offenders = listTsFiles(SRC)
      .filter((file) => file !== ALLOWED_FILE)
      .filter((file) => SINGLE_USER_ID_REFERENCE.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
