import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as contracts from '@decidarr/api-contracts';

const REPO = join(__dirname, '../../..');
const API_ROOT = join(REPO, 'src/app/api');
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * Routes that answer with something other than JSON, so they declare `response: 'raw'`.
 * Adding one here is a decision: everything else must reply with a shared contract.
 */
const RAW_ROUTES = new Set(['src/app/api/plex/image/route.ts GET']);

const CONTRACT_SCHEMAS = new Set<unknown>(Object.values(contracts));

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listRouteFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

/** Each exported handler that does not declare a reply contract from `@decidarr/api-contracts`. */
export function findMissingContracts(file: string, routeModule: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const method of HTTP_METHODS) {
    const handler = routeModule[method];
    if (handler === undefined) continue;
    const response = (handler as { response?: unknown }).response;
    const key = `${file} ${method}`;
    if (response === 'raw') {
      if (!RAW_ROUTES.has(key)) problems.push(`${key} replies raw but is not a known non-JSON route`);
    } else if (!CONTRACT_SCHEMAS.has(response)) {
      problems.push(`${key} declares no response contract from @decidarr/api-contracts`);
    }
  }
  return problems;
}

describe('findMissingContracts', () => {
  const declared = Object.assign(async () => new Response(), { response: contracts.okResponseSchema });

  it('accepts a handler whose contract comes from the contracts package', () => {
    expect(findMissingContracts('src/app/api/x/route.ts', { GET: declared })).toEqual([]);
  });

  it('flags a handler with no contract', () => {
    expect(findMissingContracts('src/app/api/x/route.ts', { POST: async () => new Response() })).toEqual([
      'src/app/api/x/route.ts POST declares no response contract from @decidarr/api-contracts',
    ]);
  });

  it('flags a contract defined outside the contracts package', () => {
    const local = Object.assign(async () => new Response(), { response: { parse: () => ({}) } });
    expect(findMissingContracts('src/app/api/x/route.ts', { PUT: local })).toEqual([
      'src/app/api/x/route.ts PUT declares no response contract from @decidarr/api-contracts',
    ]);
  });

  it('flags a raw reply on a route not listed as non-JSON', () => {
    const raw = Object.assign(async () => new Response(), { response: 'raw' });
    expect(findMissingContracts('src/app/api/x/route.ts', { GET: raw })).toEqual([
      'src/app/api/x/route.ts GET replies raw but is not a known non-JSON route',
    ]);
  });
});

describe('every API route declares its reply contract', () => {
  it('has a contract from @decidarr/api-contracts, or is a listed non-JSON route', async () => {
    const problems: string[] = [];
    let handlers = 0;
    for (const full of listRouteFiles(API_ROOT)) {
      const file = relative(REPO, full);
      const routeModule = (await import(full)) as Record<string, unknown>;
      handlers += HTTP_METHODS.filter((method) => routeModule[method] !== undefined).length;
      problems.push(...findMissingContracts(file, routeModule));
    }

    expect(problems).toEqual([]);
    expect(handlers).toBeGreaterThan(40);
  });
});
