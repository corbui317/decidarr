# Decidarr Current Feature Inventory

Cross-reference index for every implemented feature surface. Use this to find the canonical spec, source files, API routes, models, and tests for each capability.

**Last audited:** 2026-06-14 (code + tests on disk)

## Legend

| Status | Meaning |
|--------|---------|
| **Shipped** | Implemented in UI and/or API with observable behavior |
| **Partial** | Backend or UI exists but not fully wired end-to-end |
| **Planned** | Documented in beta specs but no route/UI on disk |
| **Deferred** | Explicitly out of current scope |

---

## App Shell and Routing

| Feature | Status | Spec | Frontend | API | Models | Tests |
|---------|--------|------|----------|-----|--------|-------|
| Root gate (setup / login / dashboard redirect) | Shipped | [01](./beta/01-setup-auth-user-access.md) | `src/app/page.tsx` | `GET /api/settings/status` | `Settings` | `tests/e2e/setup-and-spin.spec.ts` |
| Dashboard (authenticated roulette workspace) | Shipped | [03](./beta/03-selection-filters-command-center.md) | `src/app/dashboard/page.tsx` | — | — | `tests/e2e/setup-and-spin.spec.ts` |
| Global providers (auth, app, theme) | Shipped | [01](./beta/01-setup-auth-user-access.md), [05](./beta/05-integrations-settings-operations.md) | `src/context/*` | — | — | `tests/components/AuthContext.test.tsx` |
| Error boundary / client error logging | Shipped | — | `src/components/ErrorBoundary.tsx`, `ErrorLogger.tsx` | — | — | `tests/components/ErrorBoundary.test.tsx` |

---

## Setup, Auth, and Session

| Feature | Status | Spec | Frontend | API | Models | Tests |
|---------|--------|------|----------|-----|--------|-------|
| First-run setup wizard | Shipped | [01](./beta/01-setup-auth-user-access.md) | `src/components/SetupWizard.tsx` | `POST /api/settings/setup`, `GET /api/settings/status`, `POST /api/settings/test-plex`, `POST /api/settings/test-tmdb` | `Settings` | `tests/api/settings/setup.test.ts`, E2E setup |
| Returning-user login (stored Plex token) | Shipped | [01](./beta/01-setup-auth-user-access.md) | `src/components/LoginScreen.tsx` | `POST /api/auth/login` | `Settings` | `tests/api/auth/login.test.ts` |
| Session cookie (`decidarr_session` JWT) | Shipped | [01](./beta/01-setup-auth-user-access.md) | `src/context/AuthContext.tsx` | `GET /api/auth/me`, `DELETE /api/auth/logout` | `Settings` | `tests/unit/lib/auth.test.ts` |
| Reconfigure Plex account | Shipped | [01](./beta/01-setup-auth-user-access.md) | `src/app/page.tsx`, `LoginScreen` | `POST /api/settings/setup` | `Settings` | — |
| Plex PIN/OAuth multi-user login | Planned | [01](./beta/01-setup-auth-user-access.md) | — | — (no `auth/plex/*` routes on disk) | `User` (schema only) | — |
| Session refresh endpoint | Planned | [01](./beta/01-setup-auth-user-access.md) | — | — (no `auth/refresh` on disk) | — | — |
| Admin user management | Planned | [01](./beta/01-setup-auth-user-access.md) | — | — (no `admin/users` on disk) | `User` | — |

---

## Library Data and Cache

| Feature | Status | Spec | Frontend | API | Models | Tests |
|---------|--------|------|----------|-----|--------|-------|
| List Plex movie/show libraries | Shipped | [02](./beta/02-library-data-foundation.md) | `LibrarySelector.tsx` | `GET /api/library/sections` | — | E2E |
| Cache library items with TTL | Shipped | [02](./beta/02-library-data-foundation.md) | `LibrarySelector.tsx` | `GET /api/library/[id]/items` | `LibraryCache` | — |
| Force refresh from Plex (+ TMDb enrichment) | Shipped | [02](./beta/02-library-data-foundation.md) | `LibrarySelector.tsx` | `?forceRefresh=true` | `LibraryCache` | — |
| Genre / year / filter-option metadata | Shipped | [02](./beta/02-library-data-foundation.md) | `FilterPanel.tsx` | `GET /api/library/genres`, `years`, `filter-options` | `LibraryCache` | `tests/components/FilterPanel.test.tsx` |
| Plex collections for filters | Shipped | [02](./beta/02-library-data-foundation.md) | `FilterPanel.tsx` | `GET /api/library/collections` | `LibraryCache` | — |
| Static studio/network groups | Shipped | [02](./beta/02-library-data-foundation.md) | `FilterPanel.tsx` | `GET /api/library/studios` | — | — |
| Per-user library cache scoping | Partial | [02](./beta/02-library-data-foundation.md) | — | All cache routes use `SINGLE_USER_ID` | `LibraryCache` | — |

---

## Selection, Filters, and Command Center

| Feature | Status | Spec | Frontend | API | Models | Tests |
|---------|--------|------|----------|-----|--------|-------|
| Library + media type selection | Shipped | [03](./beta/03-selection-filters-command-center.md) | `dashboard/page.tsx`, `LibrarySelector.tsx` | — | — | E2E |
| Filter panel (genre, year, rating, studio, collections, unwatched) | Shipped | [03](./beta/03-selection-filters-command-center.md) | `FilterPanel.tsx` | filter metadata routes | `WatchedItem` (unwatched) | `tests/components/FilterPanel.test.tsx`, `tests/unit/lib/selection/filters.test.ts` |
| Pool count with filter breakdown | Shipped | [03](./beta/03-selection-filters-command-center.md) | `dashboard/page.tsx` | `POST /api/selection/pool-count` | `LibraryCache`, `WatchedItem` | `tests/unit/lib/selection/filters.test.ts` |
| Random selection | Shipped | [03](./beta/03-selection-filters-command-center.md) | `dashboard/page.tsx`, `SlotMachine.tsx` | `POST /api/selection/random` | `LibraryCache`, `WatchedItem` | `tests/api/selection/random.test.ts` |
| Result card + Plex play links | Shipped | [03](./beta/03-selection-filters-command-center.md) | `MovieCard.tsx` | play links from random route | — | — |
| Award category metadata (TMDb) | Shipped | [03](./beta/03-selection-filters-command-center.md) | `FilterPanel.tsx` | `GET /api/selection/awards/categories` | — | — |
| TV episode-level selection | Partial | [03](./beta/03-selection-filters-command-center.md) | Preference stored in settings; dashboard always passes `show` | `tvSelectionMode` accepted but show-level only | — | — |
| Dashboard consumes saved default media type | Partial | [03](./beta/03-selection-filters-command-center.md) | Dashboard initializes `movie` locally | `uiPreferences` on settings | `Settings` | — |
| Empty pool UX | Shipped | [03](./beta/03-selection-filters-command-center.md) | `SlotMachine.tsx`, dashboard | pool-count `emptyReason` | — | `tests/e2e/filters-empty-pool.spec.ts`, `tests/components/SlotMachine.test.tsx` |

---

## Watch History and Tautulli

| Feature | Status | Spec | Frontend | API | Models | Tests |
|---------|--------|------|----------|-----|--------|-------|
| Manual mark watched / unwatched | Shipped | [04](./beta/04-watch-history-tautulli.md) | `MovieCard.tsx` | `POST/DELETE /api/watched/[plexId]` | `WatchedItem` | `tests/api/watched.test.ts` |
| List watched items | Shipped | [04](./beta/04-watch-history-tautulli.md) | — (used by selection) | `GET /api/watched` | `WatchedItem` | `tests/api/watched.test.ts` |
| Unwatched-only filter | Shipped | [04](./beta/04-watch-history-tautulli.md) | `FilterPanel.tsx` | pool-count + random | `WatchedItem` | `tests/unit/lib/selection/filters.test.ts` |
| Tautulli connection test | Shipped | [04](./beta/04-watch-history-tautulli.md) | `SettingsModal.tsx` | `POST /api/tautulli/test` | `Settings` | — |
| Tautulli manual sync | Shipped | [04](./beta/04-watch-history-tautulli.md) | `SettingsModal.tsx` | `POST /api/tautulli/sync` | `WatchedItem` | — |
| Episode → show watched mapping | Shipped | [04](./beta/04-watch-history-tautulli.md) | — | sync route maps episodes to grandparent show | `WatchedItem` | — |
| Scheduled Tautulli sync | Partial | [04](./beta/04-watch-history-tautulli.md) | Interval stored in settings | No background job | `Settings.tautulliSyncIntervalMinutes` | — |
| Per-user watched scoping | Partial | [04](./beta/04-watch-history-tautulli.md) | — | Uses `SINGLE_USER_ID` | `WatchedItem` | — |

---

## Integrations, Settings, and Operations

| Feature | Status | Spec | Frontend | API | Models | Tests |
|---------|--------|------|----------|-----|--------|-------|
| Settings modal (Plex, TMDb, Tautulli, Sync, Prefs) | Shipped | [05](./beta/05-integrations-settings-operations.md) | `SettingsModal.tsx` | `GET/PUT /api/settings` | `Settings` | `tests/unit/models/Settings.test.ts` |
| Masked secrets in API responses | Shipped | [05](./beta/05-integrations-settings-operations.md) | `SettingsModal.tsx` | settings routes | `Settings` | `tests/api/settings/setup.test.ts` |
| Plex / TMDb test endpoints | Shipped | [05](./beta/05-integrations-settings-operations.md) | `SetupWizard`, `SettingsModal` | `test-plex`, `test-tmdb` | `Settings` | `tests/api/settings/setup.test.ts` |
| Plex machine ID fetch | Shipped | [05](./beta/05-integrations-settings-operations.md) | `SettingsModal.tsx` | `POST /api/settings/fetch-machine-id` | `Settings` | — |
| Theme preferences (5 themes) | Shipped | [05](./beta/05-integrations-settings-operations.md) | `ThemeContext`, `SettingsModal` | `PUT /api/settings` (`uiPreferences.theme`) | `Settings` | — |
| Default media type + TV mode prefs | Partial | [05](./beta/05-integrations-settings-operations.md) | Saved in settings; dashboard does not load defaults on mount | `PUT /api/settings` | `Settings` | — |
| E2E test reset | Shipped | — | — | `POST /api/test/reset` (non-production) | — | E2E helpers |

---

## Overseerr

| Feature | Status | Spec | Frontend | API | Models | Tests |
|---------|--------|------|----------|-----|--------|-------|
| Overseerr settings / test / status | Planned | [06](./beta/06-overseerr-request-flow.md) | No UI | No routes on disk | — | — |
| Request media in Overseerr | Planned | [06](./beta/06-overseerr-request-flow.md) | — | — | — | — |

---

## Spin Animation

| Feature | Status | Spec | Frontend | API | Models | Tests |
|---------|--------|------|----------|-----|--------|-------|
| Slot machine spin control | Shipped | [07](./beta/07-spin-animation-experience.md) | `SlotMachine.tsx` | — | — | `tests/components/SlotMachine.test.tsx` |
| Minimum 2s spin time before reveal | Shipped | [07](./beta/07-spin-animation-experience.md) | `dashboard/page.tsx` | — | — | — |
| Animation variants (roulette, wheel, plinko, slots) | Deferred | [07](./beta/07-spin-animation-experience.md) | Files exist under `src/components/animations/` but not imported | — | — | — |
| Reduced-motion support | Planned | [07](./beta/07-spin-animation-experience.md) | — | — | — | — |
| Persisted animation preference | Planned | [07](./beta/07-spin-animation-experience.md) | — | — | — | — |

---

## Spin History

| Feature | Status | Spec | Frontend | API | Models | Tests |
|---------|--------|------|----------|-----|--------|-------|
| Record spin after successful selection | Shipped | [09](./beta/09-spin-history-settings.md) | `dashboard/page.tsx` | `POST /api/spin-history` | `SpinHistoryEntry` | `tests/unit/lib/spin-history.test.ts` |
| Recent spins sidebar | Shipped | [09](./beta/09-spin-history-settings.md) | `RecentSpins.tsx` | `GET /api/spin-history` | `SpinHistoryEntry` | — |
| Reapply filters from history | Shipped | [09](./beta/09-spin-history-settings.md) | `RecentSpins.tsx`, dashboard | — | `SpinHistoryEntry` | — |
| Delete one / clear all history | Shipped | [09](./beta/09-spin-history-settings.md) | `RecentSpins.tsx`, `SettingsModal.tsx` | `DELETE /api/spin-history/[id]`, `DELETE /api/spin-history` | `SpinHistoryEntry` | `tests/unit/lib/spin-history.test.ts` |
| Spin history preferences | Shipped | [09](./beta/09-spin-history-settings.md) | `SettingsModal.tsx` | `GET/PATCH /api/users/me/preferences` | `Settings`, `User` | `tests/unit/lib/spin-history.test.ts` |
| Filter snapshot sanitization | Shipped | [09](./beta/09-spin-history-settings.md) | — | `src/lib/spin-history.ts` | — | `tests/unit/lib/spin-history.test.ts` |
| Retention limit trimming | Shipped | [09](./beta/09-spin-history-settings.md) | `SettingsModal.tsx` | preferences PATCH | `SpinHistoryEntry` | `tests/unit/lib/spin-history.test.ts` |

---

## Mobile and PWA

| Feature | Status | Spec | Frontend | API | Models | Tests |
|---------|--------|------|----------|-----|--------|-------|
| Responsive dashboard layout | Partial | [08](./beta/08-mobile-pwa-later.md) | Tailwind responsive classes | — | — | — |
| PWA manifest / service worker | Deferred | [08](./beta/08-mobile-pwa-later.md) | — | — | — | — |
| Native mobile app | Deferred | [08](./beta/08-mobile-pwa-later.md) | — | — | — | — |

---

## Data Models Summary

| Model | File | Purpose |
|-------|------|---------|
| `Settings` | `src/lib/models/Settings.ts` | Singleton install config, encrypted secrets, UI + spin history prefs |
| `User` | `src/lib/models/User.ts` | Multi-user schema (used by spin-history user resolution; not primary auth path) |
| `LibraryCache` | `src/lib/models/LibraryCache.ts` | Per-library Plex item cache with TTL |
| `WatchedItem` | `src/lib/models/WatchedItem.ts` | Watched state per Plex ID |
| `SpinHistoryEntry` | `src/lib/models/SpinHistoryEntry.ts` | Spin outcome history |

---

## External Integrations

| Service | Client | Config source | Used by |
|---------|--------|---------------|---------|
| Plex.tv + Plex Media Server | `src/lib/services/plex.ts` | `Settings` (encrypted token, server URL, machine ID) | Setup, library, selection, play links |
| TMDb | `src/lib/services/tmdb.ts` | `Settings.tmdbApiKey` (optional) | Cache enrichment, award categories, filter metadata |
| Tautulli | `src/lib/services/tautulli.ts` | `Settings` (URL, encrypted API key) | Watch history sync |
| MongoDB | `src/lib/db.ts` | `MONGODB_URI` env | All persistence |

---

## Known Implementation Gaps (docs ↔ code)

1. **Single-user ObjectId** (`000000000000000000000001`) is hard-coded in library, watched, and selection routes; `User` model and spin-history helpers support multi-user but auth is singleton-settings based.
2. **Plex OAuth, admin users, auth refresh, Overseerr** are described in beta specs but have no route files on disk.
3. **`defaultMediaType` / `tvSelectionMode`** persist in settings but dashboard does not read them on mount.
4. **`tvSelectionMode: episode`** is stored and accepted by API but random selection returns show-level items only.
5. **`tautulliSyncIntervalMinutes`** is stored but no scheduler/background job exists.
6. **Animation variants** exist as components but are not wired into the dashboard.

---

## Test Coverage Map

| Area | Key test files |
|------|----------------|
| Auth / setup | `tests/api/auth/login.test.ts`, `tests/api/settings/setup.test.ts`, `tests/unit/lib/auth.test.ts` |
| Selection / filters | `tests/unit/lib/selection/filters.test.ts`, `tests/api/selection/random.test.ts` |
| Watched | `tests/api/watched.test.ts` |
| Spin history | `tests/unit/lib/spin-history.test.ts` |
| Components | `tests/components/SlotMachine.test.tsx`, `FilterPanel.test.tsx`, `AuthContext.test.tsx`, `ErrorBoundary.test.tsx` |
| E2E | `tests/e2e/setup-and-spin.spec.ts`, `tests/e2e/filters-empty-pool.spec.ts` |
| Settings model | `tests/unit/models/Settings.test.ts` |

**Gaps:** Tautulli sync route, TMDb enrichment, library refresh edge cases, settings UI interactions, recent spins UI, Overseerr, OAuth.
