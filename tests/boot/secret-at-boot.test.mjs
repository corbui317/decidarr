/**
 * Boots the real production server and checks the DECIDARR_SECRET rule at startup.
 * Needs a finished `npm run build`; run with `npm run test:boot`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const standaloneServer = path.join(root, '.next', 'standalone', 'server.js');

const SERVERS = [
  { name: 'next start', args: [nextBin, 'start'] },
  // What the Docker image runs.
  { name: 'standalone server.js', args: [standaloneServer] },
];

const BOOT_TIMEOUT_MS = 30_000;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Starts a server and resolves once it exits or answers HTTP, whichever comes first. */
async function boot(args, secret) {
  const port = await freePort();
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1' };
  delete env.DECIDARR_SECRET;
  if (secret !== undefined) env.DECIDARR_SECRET = secret;

  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  const exited = new Promise((resolve) => child.once('exit', (code) => resolve({ exited: true, code })));
  const serving = (async () => {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2_000) });
        return { exited: false };
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    return { exited: false, timedOut: true };
  })();

  const result = await Promise.race([exited, serving]);
  if (!result.exited) {
    child.kill('SIGKILL');
    await exited;
  }
  return { ...result, output };
}

for (const server of SERVERS) {
  test(`${server.name}: refuses to start without DECIDARR_SECRET`, async () => {
    assert.ok(existsSync(server.args[0]), `${server.args[0]} is missing; run npm run build first`);
    const result = await boot(server.args, undefined);
    assert.equal(result.exited, true, `server kept running:\n${result.output}`);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /DECIDARR_SECRET/);
  });

  test(`${server.name}: refuses to start with a DECIDARR_SECRET shorter than 32 characters`, async () => {
    const result = await boot(server.args, 'x'.repeat(31));
    assert.equal(result.exited, true, `server kept running:\n${result.output}`);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /DECIDARR_SECRET/);
    assert.match(result.output, /32 characters/);
  });

  test(`${server.name}: starts with a DECIDARR_SECRET of 32 characters`, async () => {
    const result = await boot(server.args, 'x'.repeat(32));
    assert.equal(result.exited, false, `server exited with ${result.code}:\n${result.output}`);
    assert.notEqual(result.timedOut, true, `server never answered:\n${result.output}`);
  });
}
