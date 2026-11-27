import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../../../src/app/api');
const HANDLER_EXPORT = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/;
const USES_MODULE = /from\s+['"]@\/lib\/request\/route['"]|from\s+['"]@\/lib\/routes\/connection-test['"]/;

function listRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listRouteFiles(full));
    } else if (entry === 'route.ts') {
      files.push(full);
    }
  }
  return files;
}

/**
 * Criterion: "A lint rule or test fails if a route handler is exported without
 * going through the module." Every exported HTTP method handler must be built
 * with route() (src/lib/request/route.ts) or a builder on top of it, such as
 * connectionTestRoute, rather than a hand-written Next.js route export.
 */
describe('route handlers go through the request-handling module', () => {
  it('declares every exported HTTP handler via route() or a builder on top of it', () => {
    const offenders: string[] = [];

    for (const file of listRouteFiles(ROOT)) {
      const content = readFileSync(file, 'utf8');
      if (!HANDLER_EXPORT.test(content)) continue;
      if (!USES_MODULE.test(content)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
