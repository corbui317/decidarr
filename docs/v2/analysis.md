# Decidarr v2 analysis

Input for the v2 grilling sessions (`/grill-with-docs`), then `/to-spec` and `/to-tickets`.
Baseline: branch `fm/dc-spec1-port` (open PR #17, spec #1 and tickets #2-#8 already implemented).
Produced 2026-11-21 by three read-only analysis passes (security, architecture, functionality).
Items marked **(verified)** were re-checked by hand against the code.

## Live bugs (fix regardless of v2 scope)

1. **Mobile spin is broken (verified).**
   `apps/mobile/src/api/client.ts:108` expects `{ item, poolSize }`, but `/api/selection/random` returns `{ selection, playLinks, stats }` (`src/types/api/selection.ts:40`).
2. **Mobile spin history goes to a shared bucket (verified).**
   The `spin-history` routes call `requireAuth()`, which accepts bearer tokens, then `getCurrentUserId()` (`src/lib/spin-history.ts:107`), which reads only the cookie and falls back to `SINGLE_USER_ID`.
   Any approved user with a mobile token can read and delete everyone's mobile history plus the legacy owner's history.
3. **Appearance changes never reach the dashboard (verified).**
   `src/app/dashboard/page.tsx:117` listens for `decidarr:preferences-updated`, and nothing dispatches it.
4. **Sync mutations bypass REST rules.**
   `applySingleMutation` (`src/lib/sync/service.ts:347-433`) skips validation, sanitizers, retention trim, and the admin-only rule for manual watched.
   The spin_history create mutation looks up its revision with the client id.
5. **First-run empty pool.**
   Selecting a library starts a sync, but the pool count is never re-fetched afterwards (`src/components/LibrarySelector.tsx:66-83`).
6. **"Pick an Episode" setting does nothing.**
   `AppearanceTab.tsx:219-237` offers it, and `selection/random/route.ts` only echoes `tvSelectionMode` back.
7. **Mobile access token never refreshes.**
   `apps/mobile/src/auth/AuthProvider.tsx:81-85` only refreshes when no token is stored, so users are signed out after 15 minutes.

## Security

### Claimed PR #17 fixes that are broken or weak

| Fix | Verdict | Problem |
|---|---|---|
| Login rate limiting | broken (verified) | Key is the client-supplied `X-Real-IP` header by default (`src/lib/security/rate-limit.ts:43`). Rotating it bypasses the limit; omitting it puts everyone in one `unknown` bucket, so 5 requests locks out all logins. |
| Admin-only manual watched | broken | Enforced in the REST route, not in sync mutations. |
| Central URL safety check | weak (verified) | Check-time only: no IP pinning (DNS rebinding) and fetches follow redirects with `X-Plex-Token` / `X-Api-Key` attached. Missing ranges include 100.64/10, 198.18/15, 224/4, 240/4. |
| `DECIDARR_SECRET` required at boot | weak (verified) | Next 14 needs `experimental.instrumentationHook`, so `src/instrumentation.ts` never runs. Fails per request instead of at boot. |
| One-time secret migration | weak | Any legacy decrypt failure auto-wipes every integration key and user Plex token (`src/lib/migrate.ts:158-166`). A typo or a `MONGODB_URI` change triggers it. `migrationRan` is a flag, not a lock. |
| AES-256-GCM | solid, hardening gaps | No `authTagLength: 16`, no AAD, master key is 128 bits of hex via SHA-256 with no KDF and no minimum secret length. |

Solid: image proxy path normalization, test-reset gating, OAuth redirect validation, mobile auth code encryption, Next 14.2.35 patch level, OAuth poll state binding.

### New findings

| ID | Severity | Finding | Where |
|---|---|---|---|
| H1 | High | Every user's account-wide plex.tv token is sent to the admin-set Plex URL (may be plain `http://`, rebindable, or redirect-following). An admin-session compromise harvests every friend's Plex account. Use per-server access tokens. | `src/lib/auth.ts:160`, `src/lib/services/plex.ts:110-113`, `src/app/api/plex/image/route.ts` |
| H2 | High | Spin history IDOR for bearer clients (live bug 2). | `src/lib/spin-history.ts:107-140` |
| H3 | High | One shared `LibraryCache` per (machineId, libraryId) bypasses Plex per-user label and rating restrictions; a restricted user's `forceRefresh` also overwrites the cache for everyone. | `src/app/api/library/[id]/items/route.ts` |
| H4 | High | Rate limit spoofing and global login DoS (see table above). | `src/lib/security/rate-limit.ts` |
| M1 | Medium | Sync mutations: no admin check, no payload validation (object `entityId` reaches Mongo), no sanitizers, unbounded growth. | `src/lib/sync/service.ts:227-434` |
| M2 | Medium | Destructive auto-recovery on decrypt failure. | `src/lib/migrate.ts` |
| M3 | Medium | Web sessions cannot be revoked: logout does not bump `sessionVersion` (verified); 7-day JWT refreshable forever. | `src/app/api/auth/logout/route.ts` |
| M4 | Medium | No security headers (CSP, frame-ancestors, nosniff, HSTS); image proxy passes upstream Content-Type through. | `next.config.js`, `src/app/api/plex/image/route.ts` |
| M5 | Medium | Plex PIN phishing aided by one hard-coded `PLEX_CLIENT_ID` shared by every install. | `src/lib/services/plex-oauth.ts:13` |
| M6 | Medium | Refresh token rotation not atomic; un-approving a user does not revoke their refresh tokens. | `src/lib/mobile-auth/tokens.ts` |
| M7 | Medium | End-of-life runtime: Node 20 (EOL 2026-04-30) and Next 14. | `Dockerfile`, `.github/workflows/test.yml` |
| M8 | Medium | Tautulli sync falls back to the admin username and matches on `friendly_name`, so a user can import someone else's history. | `src/app/api/tautulli/sync/route.ts:48`, `src/lib/services/tautulli.ts:214` |
| L1-L10 | Low | No Origin check on POST (CSRF via sibling subdomain), unbounded rate-limit map, stale admin flags after failed setup, unvalidated collection keys in Plex URLs, mobile exchange gaps, unauthenticated TMDb key oracle, JWT `algorithms` not pinned, no `.dockerignore` and app published on all interfaces, CI permissions and SHA pinning, internal URLs leaked to non-admins. | see full audit |

## Architecture: deepening candidates

Full visual report was generated as a temporary HTML file; this is the summary.
Vocabulary per `/codebase-design`.

| # | Candidate | Strength | Removes | Also fixes |
|---|---|---|---|---|
| 1 | **Request-handling module** `route({ auth, body, query }, fn)` with a session seam (cookie and bearer adapters) and one error-to-status table | Strong | Boilerplate in 50 handlers, 25 redundant `connectDB()`, `requireAuth`, `getCurrentUserId`, `requireMobileUser` | H2, 401/403 drift, inconsistent Plex error codes |
| 2 | **User-data store** `src/lib/user-data/` (preferences, watched, spinHistory): validate, persist, trim, emit sync change | Strong | Per-route `emitSyncChange`, sync applier field copying, 3 copies of spin-history preference logic | M1, Tautulli missing sync events, revision bug |
| 3 | **api-contracts as single source of truth** plus `createApiClient(transport)` with web and mobile adapters | Strong | `src/types/shared.ts`, `filters.ts`, `api/selection.ts`, ~300 lines of `src/lib/api.ts`, mobile `request`/`ApiError`, `AuthError`, `PlexLoginError` | Live bug 1 class of drift |
| 4 | **Selection pool** `loadPool(auth, params)` with `pick()` and `breakdown()` over one predicate list; server records spin history | Strong | Duplicated loading in random and pool-count, `applyFullFilters`, client-side history recording | Pool count vs spin parity, spec 07 parity suite |
| 5 | **Library item store** `itemsFor` / `facets` / `syncLibrary` with embedded and normalized adapters (spec 07 seam first) | Strong | 7 copies of `LibraryCache.find` + flatMap, 150-line inline sync, no-op loop | H3 becomes a one-place fix |
| 6 | **Integration HTTP client** `createIntegrationClient({ baseUrl, auth, timeoutMs, urlPolicy })`, injected fetch, one `IntegrationError` | Worth exploring | 5 fetch-with-timeout copies, production import of `tests/` mocks | URL check at fetch time, redirects, rebinding (H1 partial) |
| 7 | **Integration settings descriptor** table plus `useIntegrationForm(kind)` | Worth exploring | Duplicate masked view, 3 PUT blocks, 4 decrypt methods, most of 4 UI files | Settings PUT validation |
| 8 | **Web preferences store** `PreferencesProvider` / `usePreferences()` | Worth exploring | 3 `getCurrentUser` calls per load, dead listener | Live bug 3 |

Top recommendation: candidate 1 first, candidate 2 right behind it.

### Dead and redundant code

- `src/lib/auth.ts`: `getPlexCredentials`, `validateSession`, `filterLibrariesForUser`, `getSettings`, deprecated `requireAuth`.
- `src/lib/spin-history.ts`: `saveSpinHistoryPreferences`, `getSettingsForAuth`, `getCurrentUserId`.
- `src/lib/selection/filters.ts`: `applyFilters` alias. `src/lib/models/Settings.ts`: `isAppConfigured`. `src/components/animations/index.ts`: `createSpinAnimationFromRef`.
- Unused types `PlexFriend`, `TautulliWatchedItem`; mobile `DB_VERSION`, `enqueueMutation` (no callers, offline queue never fed), `coreApi.getPreferences`, `coreApi.markWatched`.
- No-op copy-back loop at `src/app/api/library/[id]/items/route.ts:181-209`; duplicate `DataStats`.
- Unused deps: `clsx`, `tailwind-merge`, `msw`, `vite-tsconfig-paths`; mobile devDependency `vitest`.

### Untested modules that matter

`sync/service.applyMutations` and the `v1/sync/*` routes, library facet routes, Overseerr routes, `useSpinFlow`, `usePoolCount`, the mobile client and `SyncProvider`, and any bearer-token call to `/spin-history`.

## Functionality

### Docs drift

PR #17 did not fully sync docs: `current-feature-inventory.md` contradicts itself, `beta/06-overseerr-request-flow.md` says nothing shipped, `mobile/02-offline-sync-expo-client.md` says no Expo workspace exists, and the README describes a token setup step and settings tabs that no longer exist.
Several shipped features are undocumented: Overseerr availability filter and badge, Plex OAuth multi-user with approvals, spin animations, play-on-device picker, Recent Spins, the Expo app and sync API, `DECIDARR_SETUP_SECRET`.

### Top user-facing rough edges

1. Mobile core loop broken (bugs 1, 7, plus an unbounded sync loop, build-time-only server URL, and a Rules of Hooks violation in the Spin screen).
2. First-run empty pool (bug 5); sync failures swallowed.
3. Friends never get "unwatched" data: they cannot mark watched, cannot trigger Tautulli sync, and there is no scheduler.
4. Large libraries stay mostly unenriched (50 TMDb items per refresh, refresh only on demand), so rating, age, and studio filters silently hide.
5. "Pick an Episode" does nothing (bug 6).
6. Integration forms require re-typing the API key to change any toggle.
7. Play has no fallback or feedback; results opened from history have no Play button.
8. Swallowed errors in pool count, filter options, history delete, preferences load.
9. Selected libraries and filters not remembered on web, although the schema fields exist.

### Candidate v2 themes

| Theme | Size | Open product decision |
|---|---|---|
| 0. Docs truth reset | S | No |
| 1. Background sync and data freshness (scheduler, uncapped enrichment, last-synced UI, first-run fix) | M-L | Scheduling model |
| 2. Real multi-user parity (per-user Tautulli, history scoping, device sessions) | M | May friends mark watched manually? |
| 3. TV episode mode | M | Random episode vs next unwatched; does one watched episode mark the show watched? |
| 4. Overseerr request handoff and discovery scope | M-L | Library picker only, or spin over titles you don't own? |
| 5. Mobile companion: finish Phase A properly | M | Stop at Phase A or continue to offline writes? Who signs off on the mobile threat model (ADR guardrail 4)? |
| 6. Decision support (why this pick, veto for tonight, Play from history, Plex Web fallback) | S-M | No |
| 7. Saved presets and remembered state | S-M | No |
| 8. Group decision rooms | L | Pursue at all? |
