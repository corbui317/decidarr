# Decidarr Beta Roadmap

## Status

Ready

## Product Thesis

Decidarr helps Plex users decide what to watch by turning a large media library into a fast, fun, filterable roulette experience. The beta should prioritize trustworthy selection results, clear integration setup, and a polished spin flow over broad social or mobile expansion.

## Implementation Snapshot (2026-06-14)

### Shipped (P0 core loop)

- Single-user setup wizard with Plex token validation and optional TMDb key.
- Session auth via `decidarr_session` JWT cookie; login revalidates stored Plex token.
- Library discovery, MongoDB cache with TTL, manual refresh, TMDb enrichment when configured.
- Dashboard roulette: library selection, filters, pool count, random selection, result card, Plex play links.
- Manual watched/unwatched, Tautulli test + manual sync, unwatched-only filter.
- Settings modal: Plex, TMDb, Tautulli, sync cadence, themes, preferences, spin history controls.
- Spin history: record, list, delete, clear, retention, filter snapshots, recent spins sidebar.
- Slot machine animation with minimum 2s spin time.

### Partial

- `User` model and spin-history user resolution exist; most routes still use hard-coded `SINGLE_USER_ID`.
- `defaultMediaType`, `tvSelectionMode`, `tautulliSyncIntervalMinutes` stored but not fully consumed (no scheduler, dashboard ignores saved defaults).
- TV `episode` selection mode accepted by API but selection returns show-level items only.
- Responsive layout exists; no PWA manifest or service worker.

### Planned (spec'd, not on disk)

- Plex PIN/OAuth (`/api/auth/plex/start`, `/api/auth/plex/poll`).
- Session refresh (`/api/auth/refresh`).
- Admin user routes (`/api/admin/users`).
- Overseerr integration (`/api/overseerr/*`).
- Animation variants wired to dashboard; reduced-motion support.

### Deferred

- Native mobile app, offline sync, social/multiplayer features.

Full inventory: [current-feature-inventory.md](../current-feature-inventory.md).

## Scope

### P0 - Core Decision Loop

- Setup and authentication for a Plex-connected installation. **Shipped** (single-user token flow).
- Library discovery, cache refresh, and media metadata storage. **Shipped**.
- Random selection across chosen libraries with filters and empty-pool explanations. **Shipped**.
- Play links that open Plex app/web when possible. **Shipped**.

### P1 - Personalization and Integrations

- Watch tracking and Tautulli sync so "unwatched only" reflects real viewing behavior. **Shipped** (manual sync; no scheduler).
- TMDb enrichment for ratings, content ratings, studios, networks, and awards-style filters. **Shipped** (when TMDb key configured).
- Settings flows for Plex, TMDb, Tautulli, sync cadence, themes, and preferences. **Shipped**.
- Spin history with user-adjustable retention, filter snapshot storage, and clear-history controls. **Shipped**.
- Overseerr status and request handoff for unavailable media. **Planned**.

### P2 - Experience Polish

- Spin animation variants with reduced-motion support. **Partial** (slot machine only; variant components exist unwired).
- Better result storytelling: why this was eligible, what filters applied, and what to do next.
- Recent spins module and revisit/re-spin affordances from history. **Shipped**.
- Operational docs for troubleshooting setup, sync, and integrations.

### Deferred

- Native mobile app.
- Social watch parties or multiplayer decision rooms.
- Autonomous AI watch concierge.
- Full hosted multi-tenant SaaS assumptions unless explicitly planned.

Each deferred item requires a future spec and ADR before implementation. Track discovery tasks in `docs/tasks/beta/beta-backlog.md` under **Deferred - Future Product Lines**.

## Non-Goals

- Do not replace Plex, Tautulli, Overseerr, or TMDb.
- Do not store raw Plex credentials outside encrypted settings/user records.
- Do not make random selection opaque when filters remove all candidates.
- Do not add payment, subscriptions, or Pro gates during beta docs.

## Milestones

| Milestone | Specs | Outcome | Status |
|-----------|-------|---------|--------|
| Foundation | 01, 02 | A configured user can authenticate, discover libraries, and keep cache data fresh. | **Shipped** |
| Decision Loop | 03 | A user can select libraries, filter, spin, understand the pool, and play the result. | **Shipped** |
| Integration Ops | 05 | Settings and external integrations are testable, explainable, and recoverable. | **Shipped** |
| Viewing Memory | 04, 09 | Watched state and spin history are user-scoped and configurable. | **Shipped** (single-user scope) |
| Overseerr | 06 | Request handoff for unavailable media. | **Planned** |
| Multi-user / OAuth | 01 | Plex OAuth and per-user data scoping. | **Planned** |
| UX Polish | 07 | Roulette experience feels intentional and accessible. | **Partial** |
| Later Platforms | 08 | Mobile/PWA direction documented without blocking beta. | **Deferred** |

## Verification Strategy

- `npm run lint` before documentation/code PRs that touch TypeScript or React.
- `npm run build` for route, model, or component changes.
- `npm run test` for unit/API/component coverage.
- `npm run test:e2e` for setup and dashboard flows (requires Mongo memory server).
- API route smoke tests with representative success and failure responses.
- Manual browser evidence for setup, dashboard spin, filters, settings, and integration tests.

## Agent Activation

- **Lead agent:** `Product Manager`
- **Pair agent:** `Software Architect`
- **QA gate:** `Reality Checker`
- **Activation mode:** `discovery-only`
- **When to activate pair:** roadmap sequencing, scope disputes, or major domain boundary changes
- **Context pack:** this roadmap, [current-feature-inventory.md](../current-feature-inventory.md), all beta specs, `README.md`, `package.json`, `src/app/api/**`, `src/lib/models/**`, `src/lib/services/**`
- **Expected handoff:** updated sequencing, explicit non-goals, and backlog changes
- **Do not activate:** implementation agents until a concrete `DECIDARR-*` task is selected
