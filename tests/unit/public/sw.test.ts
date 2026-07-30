import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const swSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

describe('service worker (public/sw.js)', () => {
  it('caches static assets only and skips API routes', () => {
    expect(swSource).toContain("url.pathname.startsWith('/api/')");
    expect(swSource).toContain("url.pathname.startsWith('/_next/static/')");
    expect(swSource).toContain("url.pathname.startsWith('/icons/')");
    expect(swSource).toContain('/manifest.webmanifest');
  });

  it('precaches icon assets on install', () => {
    expect(swSource).toContain('/icons/icon-192.svg');
    expect(swSource).toContain('/icons/icon-512.svg');
    expect(swSource).toContain('skipWaiting');
  });
});
