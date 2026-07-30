# Feature: Offline Sync and Expo Mobile Client

## Status

**Planned, decision-gated** — implementation starts only after `DECIDARR-08-ADR-01` selects a native companion and the native authentication contract is approved.

## What & Why

Decidarr may provide a React Native/Expo companion that supports the core decision loop on mobile and remains understandable during temporary network loss. Because preferences, watched state, and spin history are user-owned mutable data, offline support must use explicit versioning, idempotency, and conflict rules rather than caching authenticated requests opportunistically.

## User Outcomes

- As an authenticated mobile user, I want to browse previously synchronized decision data when connectivity is interrupted.
- As a user, I want queued preference and watched-state changes to synchronize without duplication or silent data loss.
- As a user, I want the mobile app to explain whether data is current, pending, conflicted, or unavailable.
- As an operator, I want native sessions to be revocable without exposing long-lived Plex credentials.

## Non-Goals

- Starting native implementation before the platform ADR is accepted.
- Storing Plex, TMDb, Tautulli, or Overseerr credentials on the mobile device.
- Offline library refresh, offline Plex playback, or downloading media.
- Multi-master collaborative editing.
- Background synchronization that violates iOS/Android execution limits.
- Reusing browser cookies as the long-term native authentication architecture.
- Claiming full offline operation when the user has never completed an initial sync.

## Implementation Snapshot

### Current / Shipped

| Capability | UI | API / Logic | Status |
|------------|----|-------------|--------|
| Responsive mobile web core loop | `src/app/dashboard/page.tsx` | Existing REST routes | Shipped |
| Browser session auth | `AuthContext.tsx` | `decidarr_session` cookie | Shipped |
| Plex mobile deep links | `MovieCard.tsx` | Selection `playLinks` | Shipped |
| User preferences | `SettingsModal.tsx` | `/api/users/me/preferences` | Partial |
| Watched mutations | Dashboard components | `/api/watched/**` | Shipped |
| Spin history | `RecentSpins.tsx` | `/api/spin-history/**` | Shipped |

### Known Gaps

- No native-safe authorization-code/device flow, access token, refresh token, or revocation API.
- No canonical shared API contracts package.
- Mutable records do not expose a consistent revision/version contract for synchronization.
- No server change feed, idempotency-key ledger, mutation batch endpoint, or conflict response.
- No Expo workspace, secure storage, SQLite schema, network-state UI, or queue processor.
- Existing single-user/multi-user boundaries must be resolved before per-user sync can be trusted.

### Target / Future

- A versioned server sync protocol for an explicitly bounded set of entities.
- A shared TypeScript contracts package consumed by web/server and Expo.
- A native authentication flow with short-lived access tokens, rotating refresh tokens, secure storage, and revocation.
- An Expo Router client with SQLite-backed read models and an observable mutation queue.
- Incremental rollout: online-only native MVP first, then read-only offline, then bounded offline writes.

## 1. Data Model Changes

### Server records

Every syncable entity must have an immutable ID, owning user, update timestamp, monotonic revision, and tombstone behavior.

```typescript
type SyncEntityType = 'preference' | 'watched' | 'spin_history'

interface SyncMetadata {
  userId: string
  revision: number
  updatedAt: string
  deletedAt: string | null
}

interface SyncChange<T = unknown> {
  cursor: string
  entityType: SyncEntityType
  entityId: string
  operation: 'upsert' | 'delete'
  revision: number
  changedAt: string
  data: T | null
}

interface SyncMutation<T = unknown> {
  mutationId: string
  deviceId: string
  entityType: SyncEntityType
  entityId: string
  operation: 'upsert' | 'delete'
  baseRevision: number | null
  clientChangedAt: string
  payload: T
}
```

### New server collections

**`SyncChange`**

- Append-only change record scoped by `userId`.
- Compound index `{ userId: 1, cursor: 1 }`.
- Cursor is opaque and server-generated; clients must not parse it.
- Retention period must exceed the maximum supported offline duration.
- If a client cursor predates retention, API returns `full_resync_required`.

**`AppliedSyncMutation`**

- Unique compound index `{ userId: 1, mutationId: 1 }`.
- Stores result hash/status so retried batches are idempotent.
- TTL cleanup only after the maximum client retry window.

**`MobileRefreshToken`**

- Store a one-way hash, never plaintext.
- Bind to `userId`, `deviceId`, token family, issued/expiry/revoked timestamps.
- Detect refresh-token reuse and revoke the token family.
- Index token hash unique; index user/device for revocation.

### Existing model changes

- Add `revision` and tombstone support where needed, or introduce sync projection records if modifying domain collections would destabilize web behavior.
- Writes from existing web APIs must emit the same `SyncChange` records as native writes.
- Backfill existing syncable records with revision `1` before enabling incremental sync.
- No hard delete of a syncable record until its tombstone retention window has elapsed.

### Client SQLite

Create versioned tables for:

- `preferences`
- `watched_items`
- `spin_history`
- `sync_state`
- `mutation_queue`
- `auth_session_metadata` (non-secret metadata only)

Refresh/access tokens must use Expo SecureStore or platform keychain/keystore, never SQLite or AsyncStorage.

## 2. API Contract

All native routes use versioned paths and bearer access tokens. Browser session routes remain compatible.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/mobile/auth/start` | Public + rate limit | Begin Plex/device authorization |
| POST | `/api/mobile/auth/exchange` | One-time code | Exchange approved code for native token pair |
| POST | `/api/mobile/auth/refresh` | Refresh token | Rotate token pair |
| POST | `/api/mobile/auth/logout` | Bearer/refresh | Revoke current device session |
| GET | `/api/v1/sync/bootstrap` | Bearer | Initial bounded snapshot and cursor |
| GET | `/api/v1/sync/changes?cursor=...&limit=...` | Bearer | Incremental user-scoped changes |
| POST | `/api/v1/sync/mutations` | Bearer | Apply an idempotent mutation batch |

### Authentication rules

- Access tokens are short-lived and audience-bound to Decidarr’s mobile API.
- Refresh tokens rotate on every successful refresh and are stored only in platform secure storage.
- Native tokens grant access to Decidarr data, never expose the underlying Plex token.
- Device registration is visible and revocable from web settings.
- Authorization start/exchange endpoints are rate-limited and one-time codes expire quickly.
- Logs redact authorization codes, access tokens, refresh tokens, cookies, and Plex credentials.

### Bootstrap response

```typescript
interface SyncBootstrapResponse {
  schemaVersion: number
  cursor: string
  serverTime: string
  entities: {
    preferences: PreferenceContract
    watched: WatchedContract[]
    spinHistory: SpinHistoryContract[]
  }
}
```

### Incremental response

```typescript
interface SyncChangesResponse {
  schemaVersion: number
  changes: SyncChange[]
  nextCursor: string
  hasMore: boolean
  serverTime: string
}
```

### Mutation response

```typescript
type MutationResult =
  | { mutationId: string; status: 'applied'; revision: number }
  | { mutationId: string; status: 'duplicate'; revision: number }
  | {
      mutationId: string
      status: 'conflict'
      reason: 'revision_mismatch' | 'deleted' | 'validation'
      serverRevision: number | null
      serverValue: unknown
    }

interface SyncMutationBatchResponse {
  results: MutationResult[]
  nextCursor: string
}
```

### Conflict rules

| Entity | Rule |
|--------|------|
| Preferences | Field-level merge only for independent fields; same-field conflict uses server value and tells the user |
| Watched state | Highest authoritative Plex/Tautulli event time wins; manual local update may remain pending until reconciliation |
| Spin history create | Append-only and idempotent by `mutationId`; duplicates collapse |
| Spin history delete | Tombstone wins over an older local copy |

Client clocks are advisory only. Server revision and authoritative integration timestamps decide conflicts.

### Request / response rules

- Mutation batches have bounded item count and body size.
- A repeated `mutationId` returns the original result without reapplying side effects.
- Invalid mutations fail individually where safe; an invalid envelope fails the whole request with `400`.
- `401` triggers one refresh attempt; failed refresh returns the client to signed-out state without deleting local read-only data automatically.
- `409` is represented per mutation and must not be converted into a generic success.
- `410 full_resync_required` tells the client to preserve pending mutations, obtain a new snapshot, rebase, and retry safely.
- Sync responses never include integration credentials or unrestricted Plex payloads.

## 3. Frontend and Native Changes

### Repository target

```text
apps/mobile/
  app/
  src/auth/
  src/db/
  src/sync/
  src/api/
  src/features/
packages/api-contracts/
```

Choose npm workspaces or another monorepo mechanism in the ADR/implementation plan; do not duplicate contracts manually.

### Expo client phases

**Phase A — online-only vertical slice**

- Expo Router navigation.
- Plex/device sign-in and secure token storage.
- Library selection, filter, spin, result, and Plex deep-link handoff.
- Explicit online requirement and session-expired handling.

**Phase B — read-only offline**

- Bootstrap into SQLite.
- Show last successful sync time and offline banner.
- Browse cached preferences, watched state, and spin history.
- Disable server-required actions with actionable copy.

**Phase C — bounded offline writes**

- Queue supported mutations with visible pending state.
- Retry with exponential backoff and jitter when app is foregrounded or platform background execution is available.
- Conflict center or inline resolution for mutations requiring user attention.
- Manual “Sync now” and diagnostics that reveal IDs/statuses but not secrets.

### State machine

```text
signed_out
  -> authorizing
  -> bootstrapping
  -> ready_online
  -> ready_offline
  -> syncing
  -> conflict
  -> reauth_required
```

Every state needs loading, empty, retry, and destructive-action behavior. Queue processing must be single-flight per device.

### Accessibility and UX

- Meet WCAG 2.1 AA where React Native supports equivalent semantics.
- Touch targets are at least 44×44 points.
- Support Dynamic Type/font scaling without clipped controls.
- Honor reduced motion and system light/dark mode.
- Do not use color alone for online, pending, conflict, or failed states.
- Announce sync and auth errors to assistive technologies without repeatedly interrupting users.

## 4. Acceptance Criteria

### Foundation

- [ ] `DECIDARR-08-ADR-01` approves a native companion and defines the supported platforms.
- [ ] Shared contracts compile for Next.js and Expo without Node-only dependencies.
- [ ] Native auth can be revoked per device and never exposes the Plex token.
- [ ] Web writes and native writes generate one consistent change feed.

### Online native MVP

- [ ] A user can authorize, select a library, configure supported filters, spin, view a result, and open Plex.
- [ ] Session expiry rotates tokens or returns to a recoverable signed-out state.
- [ ] No secret is stored in AsyncStorage, SQLite, logs, crash reports, or analytics.

### Offline read

- [ ] After one successful bootstrap, supported cached data remains readable without network.
- [ ] The UI shows last sync time and does not present stale data as current.
- [ ] A missing initial snapshot produces a clear “Connect to finish setup” state.

### Offline writes

- [ ] Supported writes survive process termination and device restart.
- [ ] Retrying a mutation cannot duplicate history or toggle watched state twice.
- [ ] Conflicts follow the documented entity-specific rules and are visible to the user.
- [ ] A cursor-retention miss completes a safe full resync without dropping queued changes.
- [ ] Signing out offers a clear choice to remove local cached data and always deletes secure tokens.

### Quality

- [ ] Unit, API, contract, migration, and mobile E2E tests cover success, retry, conflict, revocation, and full-resync paths.
- [ ] Physical iOS and Android smoke evidence is captured.
- [ ] Offline claims in release notes match the exact entities and actions supported.

## 5. Edge Cases

- App terminated after server applies a mutation but before response -> retry returns `duplicate` with original outcome.
- Two devices edit the same preference -> revision conflict follows field-level rule; no silent last-client-write wins.
- Tautulli changes watched state while device is offline -> authoritative event timestamp and server revision resolve on reconnect.
- Refresh token is copied/reused -> revoke token family and require authorization.
- Device clock is wrong -> server time and revisions govern ordering.
- Sync schema version is newer than client -> stop writes, preserve queue, require app update.
- Cursor is older than server retention -> bootstrap, rebase queued mutations, then resume.
- SQLite migration fails -> preserve previous database backup where feasible and do not clear secure tokens silently.
- User is removed or loses access -> API returns authorization failure; local data becomes locked until explicit removal.
- Plex server unavailable but Decidarr API reachable -> cached Decidarr data may load; Plex-dependent actions explain the integration outage.
- Background execution is denied -> foreground/manual sync remains correct.

## 6. Dependency Map

**Modify:**

- Existing domain models for revision/tombstone metadata or sync projections
- Existing web mutation routes to emit change records
- `src/lib/api.ts` consumers after shared-contract extraction
- Web settings for device-session management

**Create:**

- `packages/api-contracts/`
- `apps/mobile/`
- `src/lib/models/SyncChange.ts`
- `src/lib/models/AppliedSyncMutation.ts`
- `src/lib/models/MobileRefreshToken.ts`
- `src/lib/sync/`
- `src/app/api/mobile/auth/**`
- `src/app/api/v1/sync/**`
- Server, contract, migration, and mobile test suites

**Depends on:**

- Accepted [native vs PWA ADR specification](./03-native-vs-pwa-adr.md)
- Explicit multi-user identity and authorization boundaries from [setup/auth spec](../beta/01-setup-auth-user-access.md)
- Stable preference, watched, and spin-history ownership
- Secure production HTTPS from [production PWA verification](./01-production-https-pwa-verification.md)

**Blocked by:**

- Undefined native authentication flow
- Unaccepted platform ADR
- Ambiguous user scoping in any syncable route
- No conflict and retention policy approval

## 7. Rollout / Migration Plan

1. Accept the ADR and threat model; freeze v1 sync scope.
2. Extract shared contracts without behavior changes.
3. Add revisions/change emission and backfill existing records behind a disabled feature flag.
4. Implement native auth, per-device revocation, and security tests.
5. Implement bootstrap/changes APIs and a read-only reference client.
6. Ship online-only native internal beta.
7. Enable read-only offline cache after consistency soak tests.
8. Enable one mutation type at a time: preferences, watched state, then spin history.
9. Expand beta only after conflict, revocation, and full-resync telemetry is healthy.

Rollback disables native token issuance and mutation acceptance while preserving browser behavior. Never roll back by accepting stale schemas or skipping revision checks.

## 8. Verification

**Automated:**

- Existing web lint, typecheck, unit, API, build, and E2E suites
- Contract compatibility tests across server/web/mobile
- Migration/backfill tests
- Auth rotation, replay, revocation, and rate-limit tests
- Property or scenario tests for idempotency and conflict handling
- Expo unit tests for SQLite queue persistence and state transitions
- Detox or Maestro physical/emulator flows selected during implementation planning

**Manual / Evidence:**

- iOS and Android: authorize, spin, kill/relaunch, go offline/online, sync, revoke.
- Two-device conflict scenario for each mutable entity.
- Network proxy simulation: timeout, duplicate response, out-of-order response, and captive portal.
- Storage inspection proving tokens are absent from SQLite/AsyncStorage.
- Redacted API samples for bootstrap, changes, duplicate mutation, conflict, and full resync.

**Known test gaps:**

- Mobile OS background scheduling cannot be made deterministic.
- Real Plex app deep-link behavior requires physical devices and installed Plex clients.

## 9. Task Handoff

- **Backlog IDs:** `DECIDARR-08-AUTH-NATIVE-01`, `DECIDARR-08-CONTRACTS-01`, `DECIDARR-08-SYNC-SERVER-01`, `DECIDARR-08-EXPO-01`, `DECIDARR-08-OFFLINE-01`
- **First safe task:** Produce the native auth threat model and API contract; no app scaffold or persistence changes.
- **Review boundary:** First implementation PR must not combine auth, sync models, and Expo UI.
- **Evidence required for done:** Security review, contract tests, migration proof, idempotency/conflict scenarios, and physical-device smoke.

## Agent Activation

- **Lead agent:** `Senior Developer`
- **Pair agent:** `Mobile App Builder`
- **QA gate:** `Security Engineer` plus `Evidence Collector`
- **Activation mode:** `gated`
- **When to activate pair:** Native auth, Expo architecture, SQLite migrations, platform behavior
- **Context pack:** this spec, accepted ADR, auth spec, model ownership, API contracts, threat model, mobile platform versions
- **Expected handoff:** versioned contracts, migrations, server/client code, test evidence, security findings, remaining platform risks
- **Do not activate:** Expo implementation before ADR acceptance and native auth approval
