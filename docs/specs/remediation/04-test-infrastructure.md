# Feature: Test Infrastructure Hardening

## Status

`Ready`

## What & Why

CI runs lint, unit tests, coverage, and build, but lacks an explicit typecheck step. E2E Mongo memory server instances are started in global setup and never stopped, leaving orphaned processes and stale `.e2e-mongo-*` marker files. The e2e database reset route supports `E2E_TEST_RESET_SECRET` but Playwright and helpers do not send it, creating a gap between documented security and actual test behavior.

Reliable test infrastructure is a prerequisite for expanding coverage in [05-test-coverage-expansion](./05-test-coverage-expansion.md).

## User Outcomes

- As a **contributor**, I want `npm run typecheck` to catch TypeScript errors before a slow Next build.
- As a **CI operator**, I want e2e runs to start and stop Mongo cleanly without leaking processes.
- As a **security reviewer**, I want the e2e reset endpoint to require the reset secret whenever it is configured.

## Non-Goals

- Adding Playwright browsers beyond Chromium.
- Parallel e2e workers (keep `workers: 1` until flakiness is resolved).
- Docker-based e2e Mongo.

## Implementation Snapshot

### Current

| Component | File | Issue |
|-----------|------|-------|
| No typecheck script | `package.json` | Only `next build` implies typecheck |
| CI | `.github/workflows/test.yml` | No `tsc --noEmit` step |
| E2E setup | `tests/e2e/global-setup.ts` | Creates `MongoMemoryServer`, writes URI, does not retain instance |
| E2E teardown | `tests/e2e/global-teardown.ts` | Deletes marker files only; no `mongo.stop()` |
| Reset helper | `tests/e2e/helpers/plex-mocks.ts` | `POST /api/test/reset` without `X-E2E-Reset-Secret` header |
| Playwright env | `playwright.config.ts` | Does not set `E2E_TEST_RESET_SECRET` |

### Target

Typecheck in CI; Mongo lifecycle managed; reset secret aligned across config, route, and helpers.

## 1. Data Model Changes

None.

## 2. API Contract

### Existing: `POST /api/test/reset`

Behavior unchanged; tests must comply:

| Condition | Requirement |
|-----------|-------------|
| `NODE_ENV === 'production'` | `404` |
| `E2E_MOCK_PLEX !== 'true'` | `403` |
| `E2E_TEST_RESET_SECRET` set | Header `X-E2E-Reset-Secret` must match |

### Playwright / helper contract

```typescript
// tests/e2e/helpers/plex-mocks.ts
export async function resetE2eDatabase(request: APIRequestContext) {
  const headers: Record<string, string> = {};
  const secret = process.env.E2E_TEST_RESET_SECRET;
  if (secret) headers['X-E2E-Reset-Secret'] = secret;

  const res = await request.post('/api/test/reset', { headers });
  // ...
}
```

## 3. Frontend Changes

None.

## 4. Acceptance Criteria

### Target

- [ ] `package.json` includes `"typecheck": "tsc --noEmit"`.
- [ ] `.github/workflows/test.yml` runs `npm run typecheck` after lint, before build.
- [ ] E2E global teardown stops the Mongo memory server instance started in setup.
- [ ] No orphaned `mongod` processes after `npm run test:e2e` (local verification).
- [ ] `.e2e-mongo-uri` and `.e2e-mongo-pid` are in `.gitignore` (verify).
- [ ] When `E2E_TEST_RESET_SECRET` is set in Playwright `webServer.env`, reset helper sends header and e2e passes.
- [ ] When secret is set but header missing, reset returns `403` (API test).

### E2E Mongo lifecycle pattern

**Option A (recommended):** Persist server handle for teardown.

```typescript
// global-setup.ts
import { writeFileSync } from 'fs';
const mongo = await MongoMemoryServer.create();
writeFileSync(PID_FILE, JSON.stringify({ uri: mongo.getUri(), stop: true }), 'utf-8');
// Store instance on globalThis for same-process teardown if Playwright supports it
```

```typescript
// global-teardown.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
// Read PID_FILE; if mongodb-memory-server exposes stop via MongoInstanceManagement, use it
// OR use globalSetup export pattern documented by @playwright/test
```

**Option B:** Use `mongodb-memory-server`'s `MongoMemoryReplSet` with explicit `stop()` stored in a module singleton imported by teardown.

Document chosen approach in `TESTING.md`.

## 5. Edge Cases

- `reuseExistingServer: true` locally → teardown must not kill developer's real Mongo.
- CI always sets `CI=true` → no reuse; full stop expected.
- Missing `E2E_TEST_RESET_SECRET` in dev → reset remains unauthenticated (current behavior); document as dev-only.
- Typecheck fails on generated `.next` types → ensure `tsc` uses `tsconfig.json` exclude rules.

## 6. Dependency Map

**Modify:**

- `package.json`
- `.github/workflows/test.yml`
- `tests/e2e/global-setup.ts`
- `tests/e2e/global-teardown.ts`
- `tests/e2e/helpers/plex-mocks.ts`
- `playwright.config.ts`
- `.env.example` (document `E2E_TEST_RESET_SECRET`)
- `.gitignore` (e2e artifacts)

**Create:**

- `tests/api/test-reset.test.ts` (secret header behavior)

**Depends on:**

- [security/01-security-remediation.md](../security/01-security-remediation.md) — reset route auth
- [03-maintainability-cleanup](./03-maintainability-cleanup.md) — TESTING.md

## 7. Rollout / Migration Plan

1. Add `typecheck` script + CI step (low risk).
2. Fix Mongo teardown; verify locally with `npm run test:e2e`.
3. Align reset secret in playwright config + helper + `.env.example`.
4. Add API test for reset secret enforcement.
5. Clean stale `.e2e-mongo-pid 2` files from workspace (not committed).

## 8. Verification

**Automated:**

- `npm run typecheck`
- `npm run test:e2e`
- `npm run test -- tests/api/test-reset`

**Manual:**

- Before/after `ps aux | grep mongo` around e2e run (no stray memory-server processes).

## 9. Task Handoff

- **Backlog ID:** `DECIDARR-REMED-04`
- **First safe task:** typecheck script + CI
- **Review boundary:** Do not expand e2e scenario coverage in same PR
- **Evidence:** CI green; local e2e with secret env

## Agent Activation

- **Lead agent:** Senior Developer
- **Pair agent:** DevOps automator for CI workflow
- **Activation mode:** gated — e2e must pass locally before merge
