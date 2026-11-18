# Feature: Test Coverage Expansion (Code Review)

## Status

`Ready`

## What & Why

Vitest and Playwright provide a solid base for selection and settings, but high-risk paths remain untested: Plex OAuth start/poll hardening, setup-secret production behavior, admin user routes, Tautulli/Overseerr sync, image proxy auth, and expanded e2e user journeys. Coverage is generated in CI but not enforced. This spec defines the minimum test matrix to lock remediation behavior and prevent regressions.

## User Outcomes

- As a **maintainer**, I want failing tests when auth or integration routes regress so releases are safer.
- As a **contributor**, I want coverage thresholds on critical modules so untested security paths cannot silently ship.

## Non-Goals

- 100% line coverage across the repo.
- Visual regression testing.
- Load/performance testing.

## Implementation Snapshot

### Current coverage strengths

- `tests/api/selection-*` — pool count, random, filters
- `tests/components/SpinControls.test.tsx`
- `tests/e2e/setup-and-spin.spec.ts`, `filters-empty-pool.spec.ts`

### Gaps (priority order)

| Area | Routes / modules | Risk |
|------|------------------|------|
| Plex OAuth | `auth/plex/start`, `auth/plex/poll` | Session fixation, setup takeover |
| Setup secret | `lib/security/setup-secret.ts`, setup routes | Public install bootstrap |
| Admin users | `admin/users`, `admin/users/[plexUserId]` | Approval, session invalidation |
| Image proxy | `api/plex/image` | Token leakage, auth bypass |
| Tautulli sync | `api/tautulli/sync` | Incorrect watched data |
| Overseerr status | `api/overseerr/status`, `lib/services/overseerr.ts` | Filter accuracy |
| E2E journeys | dashboard spin, watched exclusion, settings save | User regressions |

## 1. Data Model Changes

None.

## 2. API Contract

Tests assert documented contracts from existing beta/security specs. No new routes.

### Required test scenarios (API)

#### Plex OAuth (`tests/api/auth-plex-oauth.test.ts`)

- [ ] `POST /api/auth/plex/start` sets state cookie
- [ ] `POST /api/auth/plex/poll` rejects missing/invalid state
- [ ] Poll rejects pin not bound to cookie session
- [ ] Expired pin returns appropriate error
- [ ] Setup requires `DECIDARR_SETUP_SECRET` when configured

#### Admin (`tests/api/admin-users.test.ts`)

- [ ] Non-admin receives `403`
- [ ] Admin can list pending users
- [ ] Approve user increments visibility
- [ ] Reject/delete invalidates or blocks session (per current product rules)

#### Image proxy (`tests/api/plex-image.test.ts`)

- [ ] Unauthenticated → `401`
- [ ] Valid session + allowed path → `200` image stream
- [ ] Path traversal / external URL → `400` or `403`

#### Tautulli sync (`tests/api/tautulli-sync.test.ts`)

- [ ] Disabled → `400`
- [ ] Mock service paginates; dedupes episodes to shows
- [ ] Bulk write upserts `WatchedItem` documents

#### Overseerr (`tests/unit/lib/services/overseerr.test.ts`)

- [ ] Multi-page fetch indexes all records (ties to [01](./01-correctness-quick-fixes.md))

#### Test reset (`tests/api/test-reset.test.ts`)

- [ ] Secret required when env set (ties to [04](./04-test-infrastructure.md))

### E2E scenarios (`tests/e2e/`)

| Spec file | Flow |
|-----------|------|
| `setup-and-spin.spec.ts` | (extend) assert pool count visible, spin reaches result |
| `filters-empty-pool.spec.ts` | (existing) empty pool message |
| `watched-exclusion.spec.ts` | Mark watched → unwatchedOnly filter → pool decreases |
| `settings-integrations.spec.ts` | Save Tautulli/Overseerr URL fields; test connection mock |

## 3. Frontend Changes

None required for coverage; component tests optional for `SetupWizard` TMDB gate after [01](./01-correctness-quick-fixes.md).

## 4. Acceptance Criteria

### Target

- [ ] `vitest.config.ts` defines `coverage.thresholds` for:
  - `src/lib/auth.ts`
  - `src/lib/auth-login.ts`
  - `src/lib/security/**`
  - `src/app/api/auth/**`
  - `src/lib/services/overseerr.ts`
  - Minimum: 70% lines (adjust per baseline after first run)
- [ ] All API test files listed above exist and pass in CI.
- [ ] At least one new e2e spec for watched exclusion or settings integrations.
- [ ] Coverage step in CI fails when thresholds not met.

### Coverage threshold example

```typescript
// vitest.config.ts
coverage: {
  thresholds: {
    'src/lib/auth.ts': { lines: 70 },
    'src/lib/security/setup-secret.ts': { lines: 80 },
    // ...
  },
}
```

Run `npm run test:coverage` once to set realistic baselines before enforcing.

## 5. Edge Cases

- E2E mock Plex mode vs real Plex — all new e2e tests must run with `E2E_MOCK_PLEX=true`.
- MSW vs in-memory Mongo — API tests use `tests/setup-db.ts` pattern consistently.
- Flaky OAuth poll tests — use deterministic mock pin responses, not real Plex.

## 6. Dependency Map

**Modify:**

- `vitest.config.ts`
- `.github/workflows/test.yml` (fail on threshold breach — default with vitest thresholds)
- `tests/e2e/setup-and-spin.spec.ts`

**Create:**

- `tests/api/auth-plex-oauth.test.ts`
- `tests/api/admin-users.test.ts`
- `tests/api/plex-image.test.ts`
- `tests/api/tautulli-sync.test.ts`
- `tests/unit/lib/services/overseerr.test.ts`
- `tests/e2e/watched-exclusion.spec.ts`
- `tests/e2e/settings-integrations.spec.ts`
- `tests/fixtures/overseerr-multi-page.json` (mock data)

**Depends on:**

- [01-correctness-quick-fixes](./01-correctness-quick-fixes.md)
- [02-api-validation](./02-api-validation.md)
- [04-test-infrastructure](./04-test-infrastructure.md)
- [security/01-security-remediation.md](../security/01-security-remediation.md)

## 7. Rollout / Migration Plan

1. Baseline coverage report; set thresholds slightly below current.
2. Add unit tests for Overseerr + validation (quick wins).
3. Add auth/admin/image API tests.
4. Add Tautulli sync API test after paging fix.
5. Expand e2e specs.
6. Raise thresholds incrementally.

## 8. Verification

**Automated:**

- `npm run test:coverage`
- `npm run test:e2e`
- Full CI workflow on PR

## 9. Task Handoff

- **Backlog IDs:** `DECIDARR-REMED-05a` (thresholds), `05b` (API matrix), `05c` (e2e)
- **First safe task:** Overseerr unit test + threshold baseline PR
- **Review boundary:** One test file per PR where possible for easier review

## Agent Activation

- **Lead agent:** Senior Developer
- **Pair agent:** test-results-analyzer for threshold baselines
- **QA gate:** CI coverage + e2e green
