# Feature: Watch History and Tautulli Sync

## Status

**Shipped** — manual watched state, unwatched filter integration, and Tautulli manual sync are implemented. Scheduled sync and per-user scoping are partial.

## Implementation Snapshot

### Shipped

| Capability | UI | API |
|------------|-----|-----|
| Mark watched / unwatched on result | `MovieCard.tsx` | `POST/DELETE /api/watched/[plexId]` |
| List watched items | — (selection internal) | `GET /api/watched?mediaType=&page=&limit=` |
| Unwatched-only filter | `FilterPanel.tsx` | pool-count + random routes |
| Tautulli connection test | `SettingsModal.tsx` (Tautulli tab) | `POST /api/tautulli/test` |
| Tautulli manual sync | `SettingsModal.tsx` | `POST /api/tautulli/sync` |

**Tautulli sync behavior** (`src/app/api/tautulli/sync/route.ts`):

- Requires `tautulliEnabled`, URL, and decrypted API key.
- Maps Plex username to Tautulli user ID when possible.
- Imports movies directly by `rating_key`.
- Maps episode history to parent show via `grandparent_rating_key` (latest episode watch date wins).
- Upserts `WatchedItem` with `source: 'tautulli'`, idempotent by `{ userId, plexId }`.
- Updates `settings.tautulliLastSync` on success.
- Returns sync counts.

**Watched model** (`WatchedItem`): `userId`, `plexId` (unique per user), `mediaType`, `title`, `watchedAt`, `source` (`manual` | `tautulli`), `plexUserId`, `plexUsername`, `markedManually`.

### Partial

- All watched routes use `SINGLE_USER_ID` (`000000000000000000000001`).
- `tautulliSyncIntervalMinutes` stored on settings (default 30) but **no background scheduler** — sync is manual only via settings UI.

### Target / Future

- Scheduled Tautulli sync job respecting `tautulliSyncIntervalMinutes`.
- Per-user watched scoping when multi-user auth ships.
- Explicit product rule for re-import after manual unwatched.

## 1. Data Model Changes

### Current — `WatchedItem`

```typescript
interface WatchedItem {
  userId: ObjectId
  plexId: string
  mediaType: 'movie' | 'show' | 'episode'
  title: string
  watchedAt: Date
  source: 'manual' | 'tautulli'
  plexUserId?: number
  plexUsername?: string
  markedManually?: boolean
}
```

Indexes: `{ userId: 1, plexId: 1 }` unique; `{ userId: 1 }`; `{ plexUserId: 1, plexId: 1 }`.

## 2. API Contract

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/watched` | Session | Paginated list; optional `mediaType` filter |
| POST | `/api/watched/[plexId]` | Session | Mark watched; body: `{ mediaType, title }` |
| DELETE | `/api/watched/[plexId]` | Session | Mark unwatched |
| POST | `/api/tautulli/test` | Session | Validate URL + API key from settings |
| POST | `/api/tautulli/sync` | Session | Import watch history; returns counts |

### Sync response (shipped)

```typescript
{
  synced: number
  movies: number
  shows: number
  message: string
}
```

### Rules

- Tautulli credentials from encrypted `Settings`; never returned raw.
- Sync disabled or misconfigured → `400` with actionable message.
- Tautulli unreachable → `502`.
- Manual watched actions independent of sync failures.

## 3. Frontend Changes

### Shipped

- **`MovieCard`** — watched toggle on selection result.
- **`FilterPanel`** — "Only show unwatched" checkbox.
- **`SettingsModal`** — Tautulli tab: URL, API key (masked), enable toggle, test connection, sync now, last sync display.

### Target / Future

- Show last sync timestamp and sync result counts in settings after manual sync.
- Background sync status indicator when scheduler is added.

## 4. Acceptance Criteria

### Shipped

- [x] User can manually mark selected item watched.
- [x] User can undo watched state.
- [x] `unwatchedOnly` excludes watched items from selection.
- [x] Tautulli sync imports movies and episode-derived shows.
- [x] Tautulli sync is idempotent (upsert).
- [x] Tautulli credentials never returned raw.
- [x] Sync failures do not break manual watched state.

### Target / Future

- [ ] Scheduled sync at configured interval.
- [ ] Per-user watched isolation in multi-user mode.

## 5. Edge Cases

- Tautulli configured but disabled → sync returns `400`.
- Plex username not found in Tautulli → syncs all users' history (no user filter).
- Episode-only history → parent show marked watched.
- Duplicate Plex IDs in history → upsert overwrites with latest `watchedAt`.
- Manual unwatched then re-sync → Tautulli re-import may mark watched again.
- LAN-only Tautulli → connection test/sync fails with reachable error message.

## 6. Dependency Map

**Modify:**

- `src/lib/models/WatchedItem.ts`
- `src/lib/services/tautulli.ts`
- `src/app/api/watched/**`, `src/app/api/tautulli/**`
- `src/app/api/selection/**` (unwatched filter)
- `src/components/MovieCard.tsx`, `SettingsModal.tsx`

**Depends on:**

- Spec 01 auth
- Spec 03 selection exclusions
- Spec 05 Tautulli settings storage

## 7. Migration Plan

1. ~~Confirm watched model uniqueness.~~ Done.
2. Replace `SINGLE_USER_ID` with authenticated user context.
3. Add background job for `tautulliSyncIntervalMinutes` (cron or interval worker).
4. Document episode→show mapping as canonical product rule.
5. Add API tests for sync route.

## 8. Verification

**Automated:**

- `tests/api/watched.test.ts`
- `tests/unit/lib/selection/filters.test.ts` (unwatched filter)

**Gaps:** `tests/api/tautulli/sync` — no dedicated test file.

**Manual:**

- Mark watched → unwatched-only → item excluded.
- Tautulli test + sync with valid config.

## Agent Activation

- **Lead agent:** `Backend Architect`
- **Pair agent:** `API Tester`
- **QA gate:** `Test Results Analyzer`
- **Activation mode:** `paired`
- **When to activate pair:** sync idempotency, episode/show mapping, user-scoped watched behavior
- **Context pack:** this spec, [current-feature-inventory.md](../current-feature-inventory.md), `WatchedItem`, Tautulli service, watched/tautulli routes
- **Expected handoff:** sync counts, watched API samples, mapping decisions
- **Do not activate:** `Growth Hacker` for watched-state copy
