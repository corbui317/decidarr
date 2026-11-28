import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '../../../src');
const STORE_DIR = 'lib/library/';
const MODEL_FILES = ['lib/models/LibraryCache.ts', 'lib/models/LibraryVisibility.ts'];

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** A value (not type-only) import of a library storage model, or a raw query on its collection. */
const DIRECT_ACCESS = [
  /import\s+(?!type\b)[^;]*from\s+['"][^'"]*models\/Library(Cache|Visibility)['"]/,
  /['"`](librarycaches|libraryvisibilities)['"`]/,
];

/** Criterion: no code outside the library item store reads the library cache directly. */
describe('library item store boundary', () => {
  it('lets only src/lib/library touch the library storage models and collections', () => {
    const offenders = listFiles(SRC)
      .map((file) => relative(SRC, file))
      .filter((file) => !file.startsWith(STORE_DIR) && !MODEL_FILES.includes(file))
      .filter((file) => {
        const content = readFileSync(join(SRC, file), 'utf8');
        return DIRECT_ACCESS.some((pattern) => pattern.test(content));
      });

    expect(offenders).toEqual([]);
  });
});
