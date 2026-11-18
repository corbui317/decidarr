# Feature: Selection, Filters, and Command Center

## Status

**Shipped** — dashboard roulette, filters, pool count, random selection, and result playback are implemented. TV episode mode and saved UI defaults are partial.

## Implementation Snapshot

### Shipped

| Capability | UI | API |
|------------|-----|-----|
| Library + media type selection | `dashboard/page.tsx`, `LibrarySelector` | — |
| Filter panel | `FilterPanel.tsx` | library metadata routes |
| Pool count + breakdown | dashboard empty-state copy | `POST /api/selection/pool-count` |
| Random selection | `SlotMachine.tsx` | `POST /api/selection/random` |
| Result display + play links | `MovieCard.tsx` | play links in random response |
| Spin history recording | dashboard post-spin hook | `POST /api/spin-history` |
| Recent spins sidebar | `RecentSpins.tsx` | `GET /api/spin-history` |

**Filter types** (`src/types/filters.ts`): collections, genres, year range, rating presets, custom rating range, content ratings, studios/networks, unwatched-only.

**Shared filter logic:** `src/lib/selection/filters.ts` — `getPoolCountWithBreakdown()` and `applyFilters()` used by both pool-count and random routes for parity.

**Spin timing:** minimum 2s animation before revealing result or error (`dashboard/page.tsx`).

### Partial

- `tvSelectionMode: 'episode'` is stored in settings and accepted by API but dashboard always passes `'show'` for TV spins; `PlexService.getShowEpisodes()` exists but random route selects show-level items.
- `defaultMediaType` and `tvSelectionMode` saved in settings; dashboard initializes `mediaType` to `'movie'` locally without reading server prefs.
- Award categories endpoint exists; filter UI integration depends on TMDb configuration.

### Target / Future

- Episode-level random selection when `tvSelectionMode === 'episode'`.
- Dashboard loads saved `defaultMediaType` on mount.
- Selection history beyond spin history (separate from spec 09).

## 1. Data Model Changes

No dedicated selection model. Uses:

- `LibraryCache.items` — candidate pool
- `WatchedItem` — exclusions when `unwatchedOnly`
- `SpinHistoryEntry` — outcome memory (spec 09)
- `Settings.uiPreferences` — default media type, TV mode (partially consumed)

## 2. API Contract

### POST `/api/selection/pool-count`

```typescript
interface PoolCountBody {
  libraryIds: string[]
  mediaType: 'movie' | 'show'
  filters: Filters
}
```

Response:

```typescript
interface PoolCountResult {
  totalItems: number
  matchingItems: number
  filterBreakdown: Array<{
    filterName: string
    label: string
    beforeCount: number
    afterCount: number
    itemsRemoved: number
    causedEmpty: boolean
  }>
  emptyReason: string | null
  dataStats: {
    itemsWithRating: number
    itemsWithContentRating: number
    itemsWithStudio: number
    itemsWithYear: number
    itemsWithGenres: number
  }
}
```

- Returns `200` with zero counts when no libraries selected (not `400`).
- `emptyReason` explains no libraries, empty cache, or restrictive filters.

### POST `/api/selection/random`

```typescript
interface RandomSelectionBody {
  libraryIds: string[]
  mediaType: 'movie' | 'show'
  filters: Filters
  tvSelectionMode?: 'show' | 'episode'
}
```

Response:

```typescript
interface RandomSelectionResponse {
  selection: Record<string, unknown>  // enriched Plex metadata
  playLinks?: {
    web: string
    app: string
    ios: string
    android: string
    machineId: string | null
  } | null
  stats: { totalMatches: number }
  tvSelectionMode?: string
}
```

- `404` when pool is empty after filtering.
- Collection filters may trigger live Plex collection item fetches; failures warn and continue when safe.
- `unwatchedOnly` uses `WatchedItem` with `SINGLE_USER_ID`.

### GET `/api/selection/awards/categories`

Returns TMDb award category metadata for filter UI when configured.

## 3. Frontend Changes

### Shipped

- **`dashboard/page.tsx`** — command center: libraries, filters, pool count debounce (300ms), spin handler, result/error states, history refresh.
- **`SlotMachine`** — spin button; disabled states: `no_library`, `empty_pool`, `loading`; shows pool count.
- **`MovieCard`** — poster, metadata, summary expansion, cast/crew, watched toggle, Plex play links.
- **`FilterPanel`** — collapsible filter UI; studio tabs: library, streaming, studios; unwatched toggle.
- **`RecentSpins`** — sidebar with reapply-filters and delete.

### Target / Future

- Inline TV show vs episode selector on dashboard (not only in settings).
- Load `defaultMediaType` from `GET /api/auth/me` preferences on mount.

## 4. Acceptance Criteria

### Shipped

- [x] User cannot spin until at least one library is selected.
- [x] Pool count updates when libraries, media type, or filters change.
- [x] Random selection uses same filtering rules as pool count.
- [x] Empty pool explains cause via `emptyReason` and disabled spin.
- [x] `unwatchedOnly` excludes watched Plex IDs.
- [x] Play links include Plex web/app deep links with machine ID when available.

### Partial / Target

- [ ] TV episode-level selection when mode is `episode`.
- [ ] Dashboard respects saved `defaultMediaType`.

## 5. Edge Cases

- Pool count positive but cache expires before spin → random may return empty.
- Selected item deleted from Plex after pick → metadata fetch may fail.
- Filters require metadata library lacks → filter breakdown shows which filter emptied pool.
- Collection fetch partial failure → items from successful collections only.
- Very small pool → same title may repeat across spins (expected).

## 6. Dependency Map

**Modify:**

- `src/app/dashboard/page.tsx`
- `src/components/SlotMachine.tsx`, `MovieCard.tsx`, `FilterPanel.tsx`, `RecentSpins.tsx`
- `src/lib/api.ts`, `src/lib/selection/filters.ts`
- `src/app/api/selection/random/route.ts`, `pool-count/route.ts`

**Depends on:**

- Spec 01 auth
- Spec 02 library cache
- Spec 04 watched state
- Spec 09 spin history recording

## 7. Migration Plan

1. ~~Centralize filter application.~~ Done in `filters.ts`.
2. Wire dashboard to load `uiPreferences.defaultMediaType`.
3. Implement episode-level selection in random route when `tvSelectionMode === 'episode'`.
4. Add E2E for filter parity and unwatched exclusion.

## 8. Verification

**Automated:**

- `tests/unit/lib/selection/filters.test.ts`
- `tests/api/selection/random.test.ts`
- `tests/components/SlotMachine.test.tsx`, `FilterPanel.test.tsx`
- `tests/e2e/setup-and-spin.spec.ts`, `filters-empty-pool.spec.ts`

**Manual:**

- Choose library → set filters → pool count changes → spin → result appears.
- Apply impossible filters → disabled spin + explanation.

## Agent Activation

- **Lead agent:** `Frontend Developer`
- **Pair agent:** `Backend Architect`
- **QA gate:** `Evidence Collector`; API changes add `API Tester`
- **Activation mode:** `paired`
- **When to activate pair:** filter logic, empty-state UX, TV episode mode, play links, watched exclusions
- **Context pack:** this spec, [current-feature-inventory.md](../current-feature-inventory.md), dashboard, filter/selection routes, `filters.ts`
- **Expected handoff:** dashboard screenshots, API samples, pool-count vs random parity evidence
- **Do not activate:** `AI Engineer` for selection changes
