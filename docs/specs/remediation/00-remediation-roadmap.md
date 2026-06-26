# Code Review Remediation Roadmap

## Status

`Ready` — specs derived from Code Reviewer pass (June 2026).

## What & Why

A cross-cutting code review identified correctness bugs, maintainability debt, performance bottlenecks, and testing gaps across Decidarr's Plex library sync, selection flow, setup UI, integrations, and CI/e2e infrastructure. This folder contains implementation-ready specs that turn the remediation plan into discrete, reviewable work units.

**Source:** Code Reviewer agent pass. **Related:** [security/01-security-remediation.md](../security/01-security-remediation.md), [beta/02-library-data-foundation.md](../beta/02-library-data-foundation.md), [beta/03-selection-filters-command-center.md](../beta/03-selection-filters-command-center.md), [beta/04-watch-history-tautulli.md](../beta/04-watch-history-tautulli.md).

## Spec Index

| Order | Spec | Scope | Priority |
|-------|------|-------|----------|
| 1 | [01-correctness-quick-fixes](./01-correctness-quick-fixes.md) | Overseerr pagination, Plex GUID parsing, enrichment preservation, dashboard race, setup wizard, Tautulli sync, migration flag | P0 |
| 2 | [02-api-validation](./02-api-validation.md) | Shared request validation for selection, watched, setup/settings | P0 |
| 3 | [03-maintainability-cleanup](./03-maintainability-cleanup.md) | Shared types, component splits, a11y fixes, test hygiene, TESTING.md | P1 |
| 4 | [04-test-infrastructure](./04-test-infrastructure.md) | typecheck CI, e2e Mongo lifecycle, reset secret alignment | P0 |
| 5 | [05-test-coverage-expansion](./05-test-coverage-expansion.md) | Auth, admin, integrations, e2e flows, coverage thresholds | P1 |
| 6 | [06-performance-quick-wins](./06-performance-quick-wins.md) | Indexes, projections, Plex section cache, animation cleanup, images | P1 |
| 7 | [07-library-item-normalization](./07-library-item-normalization.md) | Normalize `LibraryItem` collection; query-backed selection | P2 |

## Execution Order

1. **01** + tests for each fix (smallest PRs, one concern per branch where possible).
2. **04** — unblock reliable e2e before expanding coverage.
3. **02** — validation layer before adding more API tests.
4. **05** — fill coverage gaps using stable infra.
5. **06** — low-risk perf wins after behavior is locked by tests.
6. **03** — UI/maintainability refactors after correctness is green.
7. **07** — separate migration-focused epic after selection behavior is fully tested.

## Non-Goals (this remediation batch)

- Next.js major upgrade.
- Full SettingsModal redesign beyond tab extraction.
- Mobile/PWA work (see [beta/08](../beta/08-mobile-pwa-later.md)).
- Replacing CryptoJS or re-architecting auth.

## Agent Activation

- **Lead agent:** Senior Developer / minimal-change engineer for implementation slices.
- **Pair agent:** Code Reviewer for P0 correctness PRs; Security Review for auth/OAuth/reset routes.
- **QA gate:** `npm run test`, `npm run test:e2e`, targeted API tests per spec.
- **Context pack:** spec file, [current-feature-inventory.md](../current-feature-inventory.md), affected routes/models/components.
