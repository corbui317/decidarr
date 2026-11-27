import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOTS = [join(__dirname, '../../../src/app/api'), join(__dirname, '../../../src/lib/routes')];

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listFiles(full));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Criterion: "Request-handling module uses the contract schemas for body and query
 * validation." A route or route helper that imports 'zod' directly is declaring its
 * own inline contract instead of importing one from packages/api-contracts, which is
 * meant to be the single source of truth. This guards against that regressing.
 */
describe('route handlers do not declare inline zod contracts', () => {
  it('imports zod only from @decidarr/api-contracts, never directly, in route files', () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of listFiles(root)) {
        const content = readFileSync(file, 'utf8');
        if (/from\s+['"]zod['"]/.test(content)) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
