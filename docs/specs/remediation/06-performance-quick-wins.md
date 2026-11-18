# Feature: Performance Quick Wins (Code Review)

## Status

`Ready`

## What & Why

Selection and pool-count endpoints load entire embedded library arrays from MongoDB and call Plex for library sections on every request. Watched queries lack a history-sort index. Animation components leak `requestAnimationFrame` loops after unmount. These issues cause unnecessary latency and memory use without requiring the larger library normalization project.

## User Outcomes

- As a **user**, I want pool count updates and spins to feel responsive even with large libraries.
- As a **user**, I want animations to stop cleanly when I navigate away.
- As a **operator**, I want fewer redundant Plex API calls per dashboard interaction.

## Non-Goals

- Full `LibraryItem` collection normalization (see [07-library-item-normalization](./07-library-item-normalization.md)).
- CDN or edge caching.
- Rewriting filter engine logic.

## Implementation Snapshot

### Current bottlenecks

| Issue | Location | Impact |
|-------|----------|--------|
| Full cache load | `selection/random`, `selection/pool-count` | `LibraryCache.find().lean()` + `flatMap(items)` |
| Plex sections every request | `getAccessibleLibraryIds()` in `src/lib/auth.ts` | External HTTP on hot path |
| Watched query | `WatchedItem.find({ userId })` | Full documents; no `watchedAt` sort index |
| RAF leak | `animations/roulette.tsx`, `animations/wheel.tsx` | State updates after unmount |
| Raw images | `MovieCard`, `RecentSpins`, `plinko` | No lazy loading |

### Target (this spec)

Short-term wins only; measurable reduction in redundant work.

## 1. Data Model Changes

### WatchedItem index

Add to `src/lib/models/WatchedItem.ts`:

```typescript
watchedItemSchema.index({ userId: 1, watchedAt: -1 });
```

Existing `{ userId: 1, plexId: 1 }` unique index remains.

### No LibraryCache schema change in this spec

Use projections on existing embedded arrays where possible.

## 2. API Contract

No public API changes.

### Internal optimizations

#### Watched projection (pool-count + random when `unwatchedOnly`)

```typescript
const watchedItems = await WatchedItem
  .find({ userId: user._id })
  .select('plexId')
  .lean();
```

#### Library cache projection (interim)

If routes only need filter fields, consider selecting subset of item fields in a future helper — **limited value while items are embedded arrays**. Document as optional; primary win is Plex section cache.

#### Accessible library TTL cache

```typescript
// src/lib/auth.ts
const sectionsCache = new Map<string, { ids: string[]; expiresAt: number }>();
const SECTIONS_TTL_MS = 60_000;

export async function getAccessibleLibraryIds(auth, requestedIds?) {
  const cacheKey = `${auth.user._id}:${auth.settings.plexMachineId}`;
  const cached = sectionsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return filterRequested(cached.ids, requestedIds);
  }
  // ... existing Plex call ...
  sectionsCache.set(cacheKey, { ids: allowedIds, expiresAt: Date.now() + SECTIONS_TTL_MS });
}
```

Invalidate on logout or settings Plex URL change (document invalidation triggers).

## 3. Frontend Changes

### Animation cleanup

**roulette.tsx / wheel.tsx** — mirror `plinko.tsx`:

```typescript
const rafRef = useRef<number | null>(null);

useEffect(() => {
  return () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
}, []);

// inside tick:
rafRef.current = requestAnimationFrame(tick);
```

### Images

Add to poster/backdrop `<img>` elements:

```html
<img loading="lazy" decoding="async" ... />
```

Evaluate `next/image` only if compatible with `/api/plex/image` proxy URLs and `next.config.js` remote patterns — if not, lazy `img` is sufficient for this spec.

### Animation arrays

Memoize pocket/segment arrays with `useMemo` keyed on item list length/ids in roulette/wheel if rebuild happens every render (profile first).

## 4. Acceptance Criteria

### Target

- [ ] `{ userId: 1, watchedAt: -1 }` index exists on `WatchedItem`.
- [ ] Watched queries for unwatched filter use `.select('plexId')`.
- [ ] `getAccessibleLibraryIds` does not call Plex more than once per user per 60s during rapid pool-count debounces (unit test with mocked PlexService).
- [ ] Roulette and wheel cancel RAF on unmount (component test or manual React strict mode check).
- [ ] Poster images in `MovieCard` and `RecentSpins` use `loading="lazy"`.
- [ ] No measurable regression in existing selection API tests.

## 5. Edge Cases

- Plex sections change (library added/removed) within TTL → user may see stale access list for up to 60s; acceptable for this spec; force refresh via library selector reload.
- Multi-instance deployment → in-memory section cache is per process (document; Redis out of scope).
- `unwatchedOnly: false` → skip watched query entirely (verify already true).

## 6. Dependency Map

**Modify:**

- `src/lib/models/WatchedItem.ts`
- `src/lib/auth.ts`
- `src/app/api/selection/random/route.ts`
- `src/app/api/selection/pool-count/route.ts`
- `src/components/animations/roulette.tsx`
- `src/components/animations/wheel.tsx`
- `src/components/MovieCard.tsx`
- `src/components/RecentSpins.tsx`

**Create:**

- `tests/unit/lib/auth-sections-cache.test.ts`

**Depends on:**

- [01-correctness-quick-fixes](./01-correctness-quick-fixes.md) — stable selection behavior before perf changes
- [07-library-item-normalization](./07-library-item-normalization.md) — supersedes embedded-array approach long term

## 7. Rollout / Migration Plan

1. Watched index + projection (safe, online index build).
2. Plex sections TTL cache + unit test.
3. Animation RAF cleanup.
4. Image lazy loading.
5. Optional `useMemo` for animation geometry.

## 8. Verification

**Automated:**

- `npm run test`
- `npm run test -- tests/api/selection`

**Manual:**

- React DevTools: mount/unmount roulette animation; confirm no console warnings about state on unmounted component.
- Network tab: change filters rapidly; count Plex `/library/sections` calls (should drop).

## 9. Task Handoff

- **Backlog ID:** `DECIDARR-REMED-06`
- **First safe task:** Watched index + projection
- **Review boundary:** No LibraryCache schema changes
- **Evidence:** Unit test for section cache; before/after Plex call count note in PR

## Agent Activation

- **Lead agent:** Senior Developer
- **Pair agent:** performance-benchmarker if pool-count latency disputed
- **Activation mode:** solo
