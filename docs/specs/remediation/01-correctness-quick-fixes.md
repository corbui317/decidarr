# Feature: Correctness Quick Fixes (Code Review)

## Status

`Ready`

## What & Why

Several shipped features produce silently wrong results: Overseerr availability indexing misses pages after the first 100 records, library sync drops TMDB/Overseerr enrichment for items beyond the first 50, dashboard pool counts can show stale values after rapid filter changes, setup can save an invalid TMDB key, Tautulli sync truncates watch history, and startup migrations can be skipped after a transient failure. These are user-visible correctness bugs that undermine filter accuracy, spin eligibility, and watch-history sync without obvious error messages.

## User Outcomes

- As a **user**, I want Overseerr "exclude available" filtering to reflect my full Overseerr library so spins do not surface already-available titles incorrectly.
- As a **user**, I want filters (rating, certification, studio) to work for my entire Plex library, not only the first 50 synced items.
- As a **user**, I want the pool count and spin button state to match my current library and filter selections at all times.
- As a **server owner**, I want setup to reject invalid TMDB keys before completing configuration.
- As a **user**, I want Tautulli sync to import my full watch history, not only the most recent 1000 mixed records.

## Non-Goals

- Normalizing library storage (see [07-library-item-normalization](./07-library-item-normalization.md)).
- Adding Zod or a full validation framework (see [02-api-validation](./02-api-validation.md)).
- Rewriting Overseerr or Tautulli integration architecture.

## Implementation Snapshot

### Current / Broken

| Issue | File(s) | Current behavior |
|-------|---------|------------------|
| Overseerr pagination | `src/lib/services/overseerr.ts` | `skip=${page}` uses page index, not offset; pages 2+ overlap page 1 |
| TMDB enrichment cap | `src/app/api/library/[id]/items/route.ts` | Only first 50 items enriched per sync; rest lose prior enrichment on refresh |
| Pool count race | `src/app/dashboard/page.tsx` | Debounced fetch has no abort/sequence guard; stale response wins |
| TMDB setup bypass | `src/components/SetupWizard.tsx` | After failed validation (`tmdbValid === false`), UI shows "Complete Setup" |
| Setup poll leak | `src/components/SetupWizard.tsx` | No `useEffect` cleanup on unmount (unlike `LoginScreen.tsx`) |
| Tautulli truncation | `src/app/api/tautulli/sync/route.ts`, `src/lib/services/tautulli.ts` | Single `length: 1000` fetch; show history filtered client-side from mixed media |
| Migration poison | `src/lib/migrate.ts` | `migrationRan = true` set before migrations complete |
| Plex GUID gaps | `src/lib/services/plex.ts` | `parseTmdbIdFromPlexGuid` misses `Guid` arrays and `tmdb://` schemes |

### Target

All rows above fixed with unit/API tests proving the corrected behavior.

## 1. Data Model Changes

No schema changes required for this spec.

**Enrichment merge rule (in-memory during sync):** When refreshing items from Plex, merge these fields from `existingCache.items` by `plexId` when the fresh Plex item lacks them:

- `tmdbId`, `contentRating`, `rating`, `tmdbRating`, `studio`, `networks`, `studios`, `enrichedAt`, `overseerrStatus`, `overseerrSyncedAt`

## 2. API Contract

No new routes. Behavior changes on existing routes:

| Route | Change |
|-------|--------|
| `GET /api/library/[id]/items` | Preserve prior enrichment; continue batch-enriching up to 50 *new* unenriched items per sync |
| `POST /api/tautulli/sync` | Paginate history; fetch movies and episodes explicitly |

### Overseerr service (internal)

```typescript
// Correct pagination
`/media?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}&filter=all&sort=added`
```

### Tautulli service (internal)

Add paging helper:

```typescript
async getWatchHistoryPaged(
  userId: number,
  mediaType: 'movie' | 'episode',
  pageSize?: number
): Promise<TautulliHistoryItem[]>
```

- Loop until a page returns fewer than `pageSize` records or API reports no more data.
- Deduplicate by `rating_key` (movies) or `grandparent_rating_key` (shows), keeping latest `stopped`.

## 3. Frontend Changes

### SetupWizard (`src/components/SetupWizard.tsx`)

**TMDB step button logic (target):**

| Condition | Primary action |
|-----------|----------------|
| Empty TMDB key | "Skip & Complete" |
| Key entered, not validated | "Validate" |
| Key entered, `tmdbValid === false` | "Validate" (disabled "Complete" until valid) |
| Key entered, `tmdbValid === true` | "Complete Setup" |

**Polling cleanup:** Mirror `LoginScreen.tsx`:

```typescript
useEffect(() => stopPolling, [stopPolling]);
```

### Dashboard (`src/app/dashboard/page.tsx`)

**Pool count fetch (target):** Use `AbortController` or monotonic request id:

```typescript
let requestId = 0;
// inside effect:
const id = ++requestId;
const controller = new AbortController();
// pass signal to selectionApi.getPoolCount if supported, or:
const data = await selectionApi.getPoolCount(...);
if (id !== requestId) return; // stale
```

Extend `selectionApi.getPoolCount` to accept optional `AbortSignal` if fetch-based.

## 4. Acceptance Criteria

### Target

- [ ] Overseerr `fetchAllMediaStatus` indexes items on page 2+ when total records > 100 (unit test with mocked multi-page response).
- [ ] `parseTmdbIdFromPlexGuid` extracts IDs from string GUIDs, `Guid[]` arrays, and `tmdb://` variants (unit tests).
- [ ] Library resync preserves enrichment for items beyond batch limit when `existingCache` has data (API test).
- [ ] Dashboard pool count does not revert to stale values when filters change faster than network latency (component test or manual evidence).
- [ ] Setup wizard cannot complete with non-empty TMDB key unless `tmdbValid === true`.
- [ ] Setup wizard clears OAuth polling interval on unmount (no interval after navigate away).
- [ ] Tautulli sync paginates and imports movies + shows beyond 1000-record cap (API test with mocked pages).
- [ ] `runMigrations` retries on next call if a prior invocation threw before completion.

## 5. Edge Cases

- Overseerr returns empty `pageInfo.pages` → fall back to `results.length < PAGE_SIZE` termination (keep existing fallback).
- Library shrink (Plex deletes items) → merged enrichment for removed `plexId` values is dropped naturally.
- TMDB enrichment batch fails mid-sync → log error; preserve existing enrichment via merge; do not wipe cache.
- Tautulli user has no episode history → sync succeeds with movies only.
- Migration throws on second step → next `requireUser()` call re-runs migrations.
- Rapid filter changes with abort → aborted requests must not surface errors in UI.

## 6. Dependency Map

**Modify:**

- `src/lib/services/overseerr.ts`
- `src/lib/services/plex.ts`
- `src/lib/services/tautulli.ts`
- `src/app/api/library/[id]/items/route.ts`
- `src/app/api/tautulli/sync/route.ts`
- `src/lib/migrate.ts`
- `src/app/dashboard/page.tsx`
- `src/components/SetupWizard.tsx`
- `src/lib/api.ts` (optional `AbortSignal` on pool count)

**Create:**

- `tests/unit/lib/services/overseerr.test.ts` (or extend existing)
- `tests/unit/lib/services/plex-guid.test.ts`
- `tests/api/tautulli-sync.test.ts` (extend if exists)
- `tests/api/library-items-enrichment.test.ts`

**Depends on:**

- [beta/02-library-data-foundation.md](../beta/02-library-data-foundation.md)
- [beta/04-watch-history-tautulli.md](../beta/04-watch-history-tautulli.md)
- [beta/06-overseerr-request-flow.md](../beta/06-overseerr-request-flow.md)

## 7. Rollout / Migration Plan

1. Fix Overseerr pagination + test (isolated PR).
2. Fix Plex GUID parsing + test.
3. Enrichment preservation in library items route + API test.
4. Dashboard pool-count race + SetupWizard fixes (can share PR).
5. Tautulli paging + migration flag fix.
6. No database migration required.

## 8. Verification

**Automated:**

- `npm run test -- tests/unit/lib/services/overseerr`
- `npm run test -- tests/unit/lib/services/plex`
- `npm run test -- tests/api/library`
- `npm run test -- tests/api/tautulli`

**Manual:**

- Large Overseerr library (>100): enable exclude-available filter; confirm pool shrinks vs single-page bug.
- Large Plex library (>50): force refresh; confirm items 51+ retain ratings/certifications after second refresh.
- Setup: enter invalid TMDB key → Validate fails → confirm Complete is not offered until re-validated.

## 9. Task Handoff

- **Backlog IDs:** `DECIDARR-REMED-01` through `DECIDARR-REMED-01g` (one per bullet in rollout)
- **First safe task:** Overseerr `skip` offset fix + unit test
- **Review boundary:** Do not include library normalization or validation framework in this PR
- **Evidence required:** Green unit/API tests per fix; screenshot or test for setup TMDB gate

## Agent Activation

- **Lead agent:** Senior Developer
- **Pair agent:** Code Reviewer on Overseerr/Tautulli pagination PRs
- **Activation mode:** gated — each fix needs its test before merge
