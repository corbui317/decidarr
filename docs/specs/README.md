# Decidarr Specifications

Implementation-ready specifications for Decidarr, reconciled against the current codebase.

## Start Here

1. **[Current Feature Inventory](./current-feature-inventory.md)** — cross-reference of every feature, file, route, model, test, and implementation status.
2. [00-beta-roadmap.md](./beta/00-beta-roadmap.md) — scope, sequencing, non-goals, implementation snapshot.
3. **[Security Remediation](./security/01-security-remediation.md)** — implementation spec for Code Reviewer findings (Plex token exposure, OAuth/setup hardening, SSRF, secrets, dependencies).
4. Use [spec-template.md](./spec-template.md) when authoring new specs.

## Reading Order

1. [00-beta-roadmap.md](./beta/00-beta-roadmap.md) — scope, sequencing, non-goals.
2. **P0:** [01 setup/auth](./beta/01-setup-auth-user-access.md), [02 library foundation](./beta/02-library-data-foundation.md), [03 selection](./beta/03-selection-filters-command-center.md).
3. **P1:** [04 watch history](./beta/04-watch-history-tautulli.md), [05 integrations/settings](./beta/05-integrations-settings-operations.md), [06 Overseerr](./beta/06-overseerr-request-flow.md), [09 spin history](./beta/09-spin-history-settings.md).
4. **P2:** [07 spin animations](./beta/07-spin-animation-experience.md).
5. **Deferred:** [08 mobile/PWA](./beta/08-mobile-pwa-later.md).

## Spec Rules

- Every spec uses the structure in [spec-template.md](./spec-template.md).
- Specs define behavior, contracts, acceptance criteria, dependencies, migration, verification, and agent activation.
- Each spec includes an **Implementation Snapshot** section: what is shipped, partial, or planned.
- Specs should not become task plans. Convert implementation slices into `docs/tasks/beta/beta-backlog.md`.
- If code disagrees with the spec, update one of them intentionally. Do not let both drift.

## Security

| Domain | Status | Spec |
|--------|--------|------|
| Security remediation (code review findings) | **Ready** | [01-security-remediation](./security/01-security-remediation.md) |

## Code Review Remediation (June 2026)

Cross-cutting fixes from the Code Reviewer pass. Start with the [remediation roadmap](./remediation/00-remediation-roadmap.md).

| Order | Domain | Status | Spec |
|-------|--------|--------|------|
| 1 | Correctness quick fixes | **Ready** | [01-correctness-quick-fixes](./remediation/01-correctness-quick-fixes.md) |
| 2 | API request validation | **Ready** | [02-api-validation](./remediation/02-api-validation.md) |
| 3 | Maintainability cleanup | **Ready** | [03-maintainability-cleanup](./remediation/03-maintainability-cleanup.md) |
| 4 | Test infrastructure | **Ready** | [04-test-infrastructure](./remediation/04-test-infrastructure.md) |
| 5 | Test coverage expansion | **Ready** | [05-test-coverage-expansion](./remediation/05-test-coverage-expansion.md) |
| 6 | Performance quick wins | **Ready** | [06-performance-quick-wins](./remediation/06-performance-quick-wins.md) |
| 7 | Library item normalization | **Planned** | [07-library-item-normalization](./remediation/07-library-item-normalization.md) |

## Current Decidarr Domains

| Domain | Status | Spec |
|--------|--------|------|
| Single-user Plex setup and session auth | **Shipped** | [01](./beta/01-setup-auth-user-access.md) |
| Plex library discovery, caching, refresh | **Shipped** (single-user cache) | [02](./beta/02-library-data-foundation.md) |
| Random selection, filters, pool count | **Shipped** | [03](./beta/03-selection-filters-command-center.md) |
| Watch tracking and Tautulli manual sync | **Shipped** | [04](./beta/04-watch-history-tautulli.md) |
| Settings, themes, integration tests | **Shipped** | [05](./beta/05-integrations-settings-operations.md) |
| Spin history and recent spins | **Shipped** | [09](./beta/09-spin-history-settings.md) |
| Slot machine spin animation | **Shipped** | [07](./beta/07-spin-animation-experience.md) |
| Plex OAuth, admin users, session refresh | **Planned** | [01](./beta/01-setup-auth-user-access.md) |
| Overseerr status and requests | **Planned** | [06](./beta/06-overseerr-request-flow.md) |
| Animation variants, reduced motion | **Planned** | [07](./beta/07-spin-animation-experience.md) |
| Mobile/PWA / native app | **Deferred** | [08](./beta/08-mobile-pwa-later.md) |

See [current-feature-inventory.md](./current-feature-inventory.md) for the full file/route/test map.
