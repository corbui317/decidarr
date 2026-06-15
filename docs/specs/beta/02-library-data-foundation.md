# Feature: Library Data Foundation

## Status

**Shipped** (single-user cache scope) — library discovery, caching, refresh, and filter metadata endpoints are implemented.

## Implementation Snapshot

### Shipped

| Capability | API | Key logic |
|------------|-----|-----------|
| List Plex libraries | `GET /api/library/sections` | `PlexService.getLibrarySections()` |
| Get/refresh cached items | `GET /api/library/[id]/items?forceRefresh=` | Mongo `LibraryCache`; Plex fetch + optional TMDb enrichment |
| Genres in selected libraries | `GET /api/library/genres?libraryIds=` | Aggregated from cache |
| Year range | `GET /api/library/years?libraryIds=` | Min/max from cache |
| Filter options | `GET /api/library/filter-options?libraryIds=` | Content ratings, rating availability, studios |
| Collections | `GET /api/library/collections?libraryIds=` | Plex collections API |
| Static studio groups | `GET /api/library/studios` | Hard-coded streaming/anime/traditional lists |

**Cache key:** `{ userId: SINGLE_USER_ID, libraryId }` where `SINGLE_USER_ID = ObjectId('000000000000000000000001')`.

**TTL:** `expiresAt` defaults to 24h; `syncFrequencyHours` on settings controls refresh cadence in items route.

**Cached item fields:** `plexId`, `title`, `year`, `posterUrl`, `genres`, `summary`, `rating`, `duration`, `tmdbId`, `contentRating`, `studio`, `addedAt`, `type`, plus TMDb fields (`tmdbRating`, `networks`, `studios`, `enrichedAt`).

### Partial

- Cache is not scoped to authenticated Plex user; all installs share one logical user ID.
- TMDb enrichment is best-effort when key is configured; cache works with Plex-only metadata.

### Target / Future

- Per-user cache keyed by `User._id` from session.
- Stale-cache fallback policy documented and consistent across routes.

## 1. Data Model Changes

### Current — `LibraryCache`

```typescript
interface LibraryCache {
  userId: ObjectId          // currently SINGLE_USER_ID
  libraryId: string
  libraryName: string
  mediaType: 'movie' | 'show'
  items: LibraryItem[]
  lastSyncedAt: Date
  expiresAt: Date           // TTL index
}
```

Index: `{ userId: 1, libraryId: 1 }` unique.

### Target / Future

- Unique cache key `userId + libraryId` per real user.
- Safe metadata update when Plex section name or media type changes.

## 2. API Contract

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/library/sections` | Session | Accessible Plex movie/show libraries |
| GET | `/api/library/[id]/items?forceRefresh=true\|false` | Session | Cached items; refresh contacts Plex (+ TMDb) |
| GET | `/api/library/genres?libraryIds=a,b` | Session | Distinct genres from selected caches |
| GET | `/api/library/years?libraryIds=a,b` | Session | `{ min, max }` year range |
| GET | `/api/library/filter-options?libraryIds=a,b` | Session | Content ratings, `hasRatings`, `ratingRange`, studios |
| GET | `/api/library/collections?libraryIds=a,b` | Session | Plex collections for sections |
| GET | `/api/library/studios` | Session | `{ streaming, anime, traditional }` static groups |

### Response rules

- All library endpoints require `requireAuth()`.
- `forceRefresh=true` contacts Plex and optionally TMDb.
- Filter metadata endpoints read from cache only (no Plex round-trip).
- Empty `libraryIds` on metadata routes returns empty defaults or `400` where applicable.
- Plex failures return recoverable errors; tokens never leaked.

## 3. Frontend Changes

### Shipped

- **`LibrarySelector`** — loads sections, selects libraries by media type, triggers cache sync on selection, manual refresh per library, auth-error re-login affordance.
- **`FilterPanel`** — loads genres, years, filter options, collections, studios after library selection; hides filters when metadata threshold not met.
- **Dashboard** — depends on selected libraries for pool count and spin.

### Empty-state copy

Distinguish: no library selected, cache empty (sync needed), Plex unavailable, filters removed everything (handled in spec 03).

## 4. Acceptance Criteria

### Shipped

- [x] Authenticated user can list Plex movie and show libraries.
- [x] Library item refresh writes `LibraryCache` documents.
- [x] Cached items include title, Plex ID, type, year, rating, content rating, studio, genres, poster where available.
- [x] Filter option endpoints read from selected libraries only.
- [x] `forceRefresh=true` refreshes one library without corrupting others.
- [x] Plex failures return actionable errors without leaking tokens.

### Target / Future

- [ ] Cache records scoped to authenticated user, not `SINGLE_USER_ID`.

## 5. Edge Cases

- Plex section deleted → refresh returns error; stale cache may remain until TTL.
- Empty library → cache stores zero items; pool count shows sync message.
- TMDb key missing → Plex-only cache; rating/studio filters may have reduced coverage.
- TMDb rate limits → partial enrichment per item; `enrichedAt` may be absent.
- TTL expiry mid-session → next spin may see empty pool until refresh.
- Reconfigure changes Plex server → old cache entries may reference wrong server items.

## 6. Dependency Map

**Modify:**

- `src/lib/models/LibraryCache.ts`
- `src/lib/services/plex.ts`, `src/lib/services/tmdb.ts`
- `src/app/api/library/**`
- `src/components/LibrarySelector.tsx`, `FilterPanel.tsx`

**Depends on:**

- Spec 01 session auth
- Plex settings (token, server URL)
- Optional TMDb key from settings

## 7. Migration Plan

1. ~~Confirm cache key and indexes.~~ Done.
2. Replace `SINGLE_USER_ID` with `getCurrentUserId()` from spin-history helper pattern.
3. Invalidate or partition cache on Plex server URL change.
4. Add cache refresh integration tests.

## 8. Verification

**Automated:**

- `tests/components/FilterPanel.test.tsx` (filter UI with mocked API)
- E2E: library selection in `tests/e2e/setup-and-spin.spec.ts`

**Gaps:** dedicated API tests for items refresh, TTL, TMDb enrichment failures.

**Manual:**

- Select library → refresh → reload dashboard → filters populate.
- API smoke: sections, items, genres, years, filter-options, collections.

## Agent Activation

- **Lead agent:** `Backend Architect`
- **Pair agent:** `Database Optimizer`
- **QA gate:** `API Tester`
- **Activation mode:** `paired`
- **When to activate pair:** cache key/index changes, refresh performance, TMDb concurrency, large-library behavior
- **Context pack:** this spec, [current-feature-inventory.md](../current-feature-inventory.md), `LibraryCache`, `plex.ts`, `tmdb.ts`, `src/app/api/library/**`
- **Expected handoff:** cache behavior summary, API samples, partial enrichment notes
- **Do not activate:** `Frontend Developer` unless library/filter UI changes
