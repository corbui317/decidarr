# Feature: Spin History and Settings

## Status

**Complete** — model, API, preferences, dashboard recording, recent spins UI, and retention are implemented.

## Implementation Snapshot

### Shipped

| Capability | UI | API / Logic |
|------------|-----|-------------|
| Record spin after selection | `dashboard/page.tsx` (post-spin) | `POST /api/spin-history` |
| List recent spins | `RecentSpins.tsx` | `GET /api/spin-history?page=&limit=` |
| Delete one entry | `RecentSpins.tsx` | `DELETE /api/spin-history/[id]` |
| Clear all history | `SettingsModal.tsx` | `DELETE /api/spin-history` |
| Enable/disable history | `SettingsModal.tsx` | `PATCH /api/users/me/preferences` |
| Retention limit | `SettingsModal.tsx` | preferences + `trimSpinHistoryToRetention()` |
| Filter snapshot storage | dashboard passes `filtersSnapshot` | `sanitizeFilterSnapshot()` strips secrets, caps 8KB |
| Reapply filters from history | `RecentSpins.tsx` → dashboard | client-side `historyFiltersToFilters()` |
| Reopen previous result | `RecentSpins.tsx` | client state only |

**Model** (`SpinHistoryEntry`): `userId`, `plexId`, `title`, `mediaType`, `posterUrl`, `year`, `libraryIds`, `filtersSnapshot`, `tvSelectionMode`, `poolSizeAtSpin`, `spunAt`.

**User resolution:** `getCurrentUserId()` in `src/lib/spin-history.ts` — JWT username → `User` lookup, else `SINGLE_USER_ID`.

**Preferences storage:** `Settings.spinHistoryPreferences` for single-user; `User.preferences.spinHistory` when real user found.

**Defaults:** enabled `true`, retention `50` (min 1, max 500), `storeFilterSnapshot` `true`.

**Disabled behavior:** `POST /api/spin-history` returns `{ skipped: true, reason: 'disabled' }`; spin flow unaffected.

## 1. Data Model Changes

### Current — `SpinHistoryEntry`

```typescript
interface SpinHistoryEntry {
  userId: ObjectId
  plexId: string
  title: string
  mediaType: 'movie' | 'show' | 'episode'
  posterUrl?: string
  year?: number
  libraryIds: string[]
  filtersSnapshot?: Record<string, unknown>
  tvSelectionMode?: 'show' | 'episode'
  poolSizeAtSpin?: number
  spunAt: Date
}
```

Index: `{ userId: 1, spunAt: -1 }`.

### Preferences

```typescript
interface SpinHistoryPreferences {
  enabled: boolean
  retentionLimit: number      // 1–500, default 50
  storeFilterSnapshot: boolean
}
```

## 2. API Contract

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/spin-history` | Session | Paginated list, newest first |
| POST | `/api/spin-history` | Session | Record spin; skipped if disabled |
| DELETE | `/api/spin-history/[id]` | Session | Delete one entry (owner only) |
| DELETE | `/api/spin-history` | Session | Clear all for current user |
| GET/PATCH | `/api/users/me/preferences` | Session | Read/update spin history prefs |

### POST body

```typescript
interface CreateSpinHistoryBody {
  plexId: string
  title: string
  mediaType: 'movie' | 'show' | 'episode'
  posterUrl?: string
  year?: number
  libraryIds: string[]
  filtersSnapshot?: Record<string, unknown>
  tvSelectionMode?: 'show' | 'episode'
  poolSizeAtSpin?: number
}
```

- **201:** created entry when enabled.
- **200 `{ skipped: true }`:** when disabled; random selection must not fail.
- **400:** missing `plexId`, `title`, or `mediaType`.

### GET response

```typescript
{ items: SpinHistoryEntry[]; total: number; page: number; pageSize: number }
```

### Retention

- On create: trim oldest entries beyond `retentionLimit`.
- On PATCH lowering limit: immediate trim via `trimSpinHistoryToRetention()`.

## 3. Frontend Changes

### Shipped

- **Dashboard** — calls `spinHistoryApi.create()` after successful spin; refreshes `RecentSpins` via `historyRefreshKey`.
- **`RecentSpins`** — sidebar showing latest 10; relative time; reapply filters; delete; empty state.
- **`SettingsModal` (Prefs)** — enable toggle, retention input, snapshot toggle, clear-all with confirmation.

### Optional later

- Full history page/drawer beyond recent 10 module.

## 4. Acceptance Criteria

### Shipped

- [x] Successful spin creates history entry when enabled.
- [x] Disabled history does not block spin or result.
- [x] History scoped to current user ID resolution path.
- [x] Delete one and clear all work.
- [x] Retention limit trims oldest entries.
- [x] Settings persist after reload.
- [x] Filter snapshots omitted when `storeFilterSnapshot` is false.
- [x] Spin history distinct from watched state and Tautulli.
- [x] No secrets in stored snapshots (sanitized).

## 5. Edge Cases

- Plex item deleted after spin → history row remains; play may fail.
- User switches Plex account → different `userId` path should isolate history (partial until full multi-user).
- Retention lowered → oldest rows removed immediately.
- Duplicate spins → separate entries (no dedupe).
- History write fails after spin → result still shown; error logged only.
- Oversized filter snapshot → dropped (returns `undefined` from sanitizer).
- Concurrent spins → retention cleanup per user document.

## 6. Dependency Map

**Shipped files:**

- `src/lib/models/SpinHistoryEntry.ts`
- `src/lib/spin-history.ts`
- `src/app/api/spin-history/route.ts`, `[id]/route.ts`
- `src/app/api/users/me/preferences/route.ts`
- `src/app/dashboard/page.tsx`
- `src/components/RecentSpins.tsx`, `SettingsModal.tsx`
- `src/lib/api.ts` (`spinHistoryApi`, `userPreferencesApi`)

**Depends on:**

- Spec 01 auth / user ID resolution
- Spec 03 selection flow and filter shape
- Spec 05 preferences persistence

## 7. Migration Plan

1. ~~Model, API, UI.~~ Done.
2. Align all routes on `getCurrentUserId()` when multi-user auth ships.
3. Tune retention defaults based on usage feedback.

## 8. Verification

**Automated:**

- `tests/unit/lib/spin-history.test.ts` (sanitization, retention, preferences)

**Gaps:** API route integration tests for spin-history CRUD; RecentSpins component tests.

**Manual:**

- Enable → spin → recent module updates.
- Disable → spin → no new rows.
- Clear all confirmation flow.

## Agent Activation

- **Lead agent:** `Backend Architect`
- **Pair agent:** `Frontend Developer`
- **QA gate:** `Security Engineer`, `API Tester`
- **Activation mode:** `paired`
- **When to activate pair:** user scoping, retention, settings UI, privacy/clear flows
- **Context pack:** this spec, [current-feature-inventory.md](../current-feature-inventory.md), spin-history routes, `spin-history.ts`, dashboard, `RecentSpins`
- **Expected handoff:** API samples, settings screenshots, retention behavior notes
- **Do not activate:** `AI Engineer`
