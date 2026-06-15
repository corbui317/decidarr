# Feature: Integrations, Settings, and Operations

## Status

**Shipped** — settings modal, secret masking, integration tests, themes, and operational preferences are implemented.

## Implementation Snapshot

### Shipped

| Capability | UI | API |
|------------|-----|-----|
| View/update settings | `SettingsModal.tsx` | `GET/PUT /api/settings` |
| Setup status (public) | `AppContext` | `GET /api/settings/status` |
| Plex test | `SetupWizard`, `SettingsModal` | `POST /api/settings/test-plex` |
| TMDb test | `SetupWizard`, `SettingsModal` | `POST /api/settings/test-tmdb` |
| Machine ID fetch | `SettingsModal` | `POST /api/settings/fetch-machine-id` |
| Tautulli test | `SettingsModal` | `POST /api/tautulli/test` |
| Theme selection | `ThemeContext`, `SettingsModal` | `PUT /api/settings` (`uiPreferences.theme`) |
| Sync frequency | `SettingsModal` (Sync tab) | `PUT /api/settings` (`syncFrequencyHours`) |
| UI preferences | `SettingsModal` (Prefs tab) | `PUT /api/settings` (`uiPreferences`) |
| Spin history prefs | `SettingsModal` (Prefs tab) | `GET/PATCH /api/users/me/preferences` |

**Settings tabs:** Plex, TMDb, Tautulli, Sync, Prefs.

**Themes:** `dark`, `light`, `vegas`, `macao`, `poker` — applied via `data-theme` on `<html>`; localStorage cache + server sync.

**Secret handling:**

- Plex token, TMDb key, Tautulli key encrypted with per-install `encryptionKey` (stored encrypted with MongoDB-derived master key).
- API returns masked values (`****` pattern); PUT preserves secrets when masked placeholder submitted.
- Plex server URL validated with SSRF protections (`validatePlexUrl` in `auth.ts`).

**Installation vs user prefs:**

- Installation-level: Plex, TMDb, Tautulli, sync, themes, default media type, TV mode, spin history prefs (on `Settings` for single-user).
- `User.preferences` used when multi-user spin-history resolution finds a real user.

### Partial

- `defaultMediaType` and `tvSelectionMode` persist but dashboard does not load them on mount.
- No Admin/Users settings tab (multi-user not shipped).
- Cache invalidation warning not shown when Plex server URL changes.

### Target / Future

- Admin tab for user management when spec 01 OAuth ships.
- Overseerr settings fields (spec 06).
- Operational troubleshooting section in README linked from settings.

## 1. Data Model Changes

### Current — `Settings` (singleton)

Operational fields:

| Field | Purpose |
|-------|---------|
| `plexToken`, `plexServerUrl`, `plexUsername`, `plexMachineId` | Plex connection |
| `tmdbApiKey` | Optional TMDb enrichment |
| `tautulliUrl`, `tautulliApiKey`, `tautulliEnabled`, `tautulliSyncIntervalMinutes`, `tautulliLastSync` | Tautulli |
| `syncFrequencyHours` | Library cache refresh cadence |
| `uiPreferences` | `theme`, `defaultMediaType`, `tvSelectionMode` |
| `spinHistoryPreferences` | `enabled`, `retentionLimit`, `storeFilterSnapshot` |
| `setupComplete` | Boot gate |
| `jwtSecret`, `encryptionKey` | Auto-generated, encrypted |

## 2. API Contract

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/settings` | Session | Masked settings + preferences |
| PUT | `/api/settings` | Session | Update integrations and UI prefs |
| GET | `/api/settings/status` | Public | Setup completion status |
| POST | `/api/settings/setup` | Public | Initial setup / reconfigure |
| POST | `/api/settings/test-plex` | Public/setup | Validate Plex |
| POST | `/api/settings/test-tmdb` | Public/setup | Validate TMDb |
| POST | `/api/settings/fetch-machine-id` | Session | Fetch Plex machine ID from server |
| POST | `/api/tautulli/test` | Session | Validate Tautulli |
| GET/PATCH | `/api/users/me/preferences` | Session | Spin history preferences |

### PUT `/api/settings` body (partial)

```typescript
{
  plex?: { token?: string; serverUrl?: string }
  tmdb?: { apiKey?: string }
  tautulli?: { url?: string; apiKey?: string; enabled?: boolean; syncIntervalMinutes?: number }
  syncFrequencyHours?: number
  uiPreferences?: { theme?: AppTheme; defaultMediaType?: 'movie'|'show'; tvSelectionMode?: 'show'|'episode' }
}
```

### Response rules

- Masked credentials only in GET responses.
- Normalize URLs; reject SSRF-vulnerable Plex URLs.
- Omit or mask token fields → preserve existing encrypted values.

## 3. Frontend Changes

### Shipped

- **`SettingsModal`** — tabbed modal from header; loading timeout + auth error recovery; test buttons; masked secret fields; theme picker; spin history controls including clear-all with confirmation.
- **`SetupWizard`** — first-run equivalent of Plex/TMDb configuration.
- **`ThemeContext`** — applies theme, syncs from server on mount.

### Target / Future

- Overseerr tab when spec 06 ships.
- Admin/Users tab when spec 01 multi-user ships.
- Cache invalidation prompt on Plex server change.

## 4. Acceptance Criteria

### Shipped

- [x] Settings displays masked secrets only.
- [x] Updating one integration does not clear other secrets.
- [x] Plex test validates token and server selection.
- [x] TMDb test validates API key.
- [x] Tautulli test validates URL/API key.
- [x] Machine ID fetch persists to settings.
- [x] Sync frequency and UI preferences persist after reload.

### Target / Future

- [ ] Warning when Plex server change may invalidate cache.

## 5. Edge Cases

- Trailing slash on server URL → normalized.
- localhost/link-local URL → SSRF rejection where applicable.
- TMDb key missing → app works; enrichment skipped.
- Tautulli enabled with bad key → test fails; sync blocked.
- Settings save succeeds but later Plex refresh fails → user sees library errors separately.
- Reconfigure changes Plex account → may need manual library re-sync.

## 6. Dependency Map

**Modify:**

- `src/components/SettingsModal.tsx`, `SetupWizard.tsx`
- `src/context/ThemeContext.tsx`
- `src/lib/models/Settings.ts`, `src/lib/auth.ts`, `src/lib/api.ts`
- `src/app/api/settings/**`, `src/app/api/tautulli/test/route.ts`
- `src/app/api/users/me/preferences/route.ts`

**Depends on:**

- Spec 01 auth
- Spec 02 cache invalidation on server change
- Spec 04 Tautulli sync
- Spec 09 spin history preferences

## 7. Migration Plan

1. ~~Document settings ownership and masking.~~ Done.
2. Wire dashboard to consume `uiPreferences.defaultMediaType`.
3. Add Overseerr fields when spec 06 implements.
4. Add cache invalidation on Plex server URL change.

## 8. Verification

**Automated:**

- `tests/unit/models/Settings.test.ts`
- `tests/api/settings/setup.test.ts` (SSRF, masking)

**Manual:**

- Update theme, sync cadence, TMDb, Tautulli; reload and verify persistence.
- Inspect GET responses for absence of raw secrets.

## Agent Activation

- **Lead agent:** `Backend Architect`
- **Pair agent:** `Security Engineer`
- **QA gate:** `API Tester`
- **Activation mode:** `gated`
- **When to activate pair:** secret storage, URL validation, settings persistence
- **Context pack:** this spec, [current-feature-inventory.md](../current-feature-inventory.md), `SettingsModal`, `Settings` model, settings routes
- **Expected handoff:** settings API samples, masking proof, UX screenshots
- **Do not activate:** `Mobile App Builder` unless mobile settings task exists
