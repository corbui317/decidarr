# Feature: Overseerr Request Flow

## Status

**Planned** — no Overseerr routes, services, types, or UI exist on disk. This spec defines the target integration.

## Implementation Snapshot

### Current (on disk)

**Nothing shipped.** Verified absent:

- No `src/app/api/overseerr/**` route files
- No `src/lib/services/overseerr.ts`
- No Overseerr fields on `Settings` model
- No Overseerr tab in `SettingsModal`
- No request/status UI on `MovieCard`
- No `overseerrApi` in `src/lib/api.ts`

### Target / Future

Full read/test/request handoff for media not in Plex library, using TMDb IDs from enrichment.

## 1. Data Model Changes

### Current

No Overseerr fields on `Settings`.

### Target — optional persisted fields

```typescript
interface OverseerrSettings {
  overseerrUrl?: string
  overseerrApiKey?: string   // encrypted
  overseerrEnabled: boolean
}
```

Optional future cache model (only if API latency requires it):

```typescript
interface OverseerrRequestCache {
  userId: string
  plexId?: string
  tmdbId?: number
  mediaType: 'movie' | 'show'
  status: 'available' | 'pending' | 'requested' | 'unavailable'
  checkedAt: Date
}
```

Store API keys encrypted using same pattern as TMDb/Tautulli keys on `Settings`.

## 2. API Contract

### Target routes (not implemented)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/overseerr/status` | Integration status; optional per-media lookup by TMDb ID |
| POST | `/api/overseerr/test` | Validate URL/API key |
| POST | `/api/overseerr/request` | Request selected media in Overseerr |

### Target status response

```typescript
interface OverseerrStatusResponse {
  enabled: boolean
  reachable: boolean
  configured: boolean
  media?: {
    tmdbId?: number
    mediaType: 'movie' | 'show'
    status: 'available' | 'pending' | 'requested' | 'unavailable' | 'unknown'
  }
  error?: string
}
```

### Rules

- Do not send Plex tokens to Overseerr.
- Prefer TMDb IDs from `LibraryCache` / selection enrichment.
- No TMDb ID → hide request CTA; do not guess.
- API failures must not block core spin behavior.
- Never return raw Overseerr API key.

## 3. Frontend Changes

### Current

None.

### Target

- **`SettingsModal`** — Overseerr tab: URL, API key (masked), enable toggle, test connection.
- **`MovieCard`** — status badge and "Request in Overseerr" CTA when media is requestable and has TMDb ID.
- Hide request action when media already exists in Plex (spin result implies in-library; status lookup is for enrichment gaps or future search flows).

## 4. Acceptance Criteria

### Target (all unchecked — not implemented)

- [ ] User can test Overseerr connection from settings.
- [ ] Selected result can show Overseerr status when TMDb ID exists.
- [ ] Missing Overseerr config never breaks random selection.
- [ ] Request action hidden/disabled without TMDb ID.
- [ ] Overseerr errors are user-readable; API keys not logged.
- [ ] Request route is idempotent when media already requested.

## 5. Edge Cases

- Overseerr URL with subpath or trailing slash.
- Private/LAN-only Overseerr instance.
- TMDb movie/show ID mismatch.
- Media in Plex but Overseerr says unavailable.
- Revoked API key.
- Request pending under another Overseerr user.

## 6. Dependency Map

**Create:**

- `src/lib/services/overseerr.ts`
- `src/types/overseerr.ts`
- `src/app/api/overseerr/status/route.ts`
- `src/app/api/overseerr/test/route.ts`
- `src/app/api/overseerr/request/route.ts` (phase 2)
- Overseerr fields on `Settings` model
- `overseerrApi` client methods in `src/lib/api.ts`

**Modify (when implementing):**

- `src/components/SettingsModal.tsx`
- `src/components/MovieCard.tsx`
- `src/lib/models/Settings.ts`
- `src/app/api/settings/route.ts` (GET/PUT Overseerr fields)

**Depends on:**

- Spec 02/05 TMDb enrichment for `tmdbId` on selections
- Spec 05 secret storage and URL validation patterns

## 7. Migration Plan

1. Add `overseerrUrl`, `overseerrApiKey`, `overseerrEnabled` to `Settings` with encryption.
2. Implement `POST /api/overseerr/test` and settings UI tab.
3. Implement `GET /api/overseerr/status` for integration health.
4. Add per-media status lookup on result card using selection `tmdbId`.
5. Implement `POST /api/overseerr/request` with idempotency checks.
6. Add status caching only if latency is visible in UX.

## 8. Verification

**Current:** N/A — no implementation.

**Target:**

- `npm run build`
- API smoke: unconfigured status, invalid test, valid test.
- Manual: settings test; result card states (available, requestable, unavailable).
- Security: GET settings returns masked Overseerr key only.

## Agent Activation

- **Lead agent:** `Backend Architect`
- **Pair agent:** `API Tester`
- **QA gate:** `Security Engineer`
- **Activation mode:** `discovery-only` until implementation task is selected
- **When to activate pair:** external API requests, key storage, TMDb mapping, status caching
- **Context pack:** this spec, [current-feature-inventory.md](../current-feature-inventory.md), `Settings` model, `MovieCard`, TMDb enrichment paths
- **Expected handoff:** test endpoint output, status samples, idempotency notes
- **Do not activate:** `AI Engineer`
