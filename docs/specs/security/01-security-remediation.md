# Feature: Security Remediation (Code Review Findings)

## Status

`In Progress` — Phases 1–5 implemented; dependency major upgrade for Next.js deferred pending separate spike.

## What & Why

A security-focused code review of Decidarr found exploitable issues across Plex token handling, OAuth/setup bootstrap, SSRF-capable integration tests, test-only destructive routes, cookie defaults, secret wrapping, image optimizer configuration, and production dependency advisories. These issues can lead to credential theft, unauthorized admin takeover on fresh installs, internal network probing from the server, and weakened session protection in production.

This spec defines the target secure behavior, API contracts, migrations, and verification evidence required before the remediation is considered complete. It is cross-cutting and modifies auth, library cache, spin history, settings, and deployment configuration.

**Source review:** Code Reviewer agent pass (June 2026). Related specs: [01 setup/auth](../beta/01-setup-auth-user-access.md), [02 library foundation](../beta/02-library-data-foundation.md), [05 integrations/settings](../beta/05-integrations-settings-operations.md), [09 spin history](../beta/09-spin-history-settings.md).

## User Outcomes

- As a **Decidarr user**, I want Plex credentials to never appear in browser-visible URLs or persisted cache/history so that my media server cannot be hijacked via leaked tokens.
- As a **server owner**, I want first-run setup and OAuth login bound to my browser session so that a remote attacker cannot become admin on a fresh install or fixate my login.
- As a **server owner**, I want integration URL tests restricted to admins and protected against SSRF so that the app cannot be used to probe my internal network.
- As an **operator**, I want production deployments to use secure cookies, strong app secrets, and patched dependencies by default so that sessions and stored credentials resist common attacks.

## Non-Goals

- Full Next.js major-version migration beyond what is required to clear critical production advisories.
- Replacing CryptoJS across the entire codebase in one pass (only settings secret wrapping is in scope).
- Adding a full WAF, external rate-limiting service, or CSP overhaul.
- Per-user library cache scoping (tracked separately in spec 02; token leakage fix does not depend on it).
- HSTS or reverse-proxy TLS configuration (document operator responsibility only).

## Implementation Snapshot

### Current / Vulnerable

| Finding | Severity | Affected files / routes | Current behavior |
|---------|----------|-------------------------|------------------|
| Plex token in media URLs | Critical | `src/lib/services/plex.ts`, `src/app/api/library/[id]/items/route.ts`, `src/lib/models/LibraryCache.ts`, `src/app/api/spin-history/route.ts`, `src/components/MovieCard.tsx`, `src/components/RecentSpins.tsx` | `posterUrl`, `art`, `thumb` built with `?X-Plex-Token=...`; cached and returned to browser |
| Cross-user token leakage via shared cache | Critical | `LibraryCache` keyed by `plexMachineId + libraryId` only | User A refresh can store URLs containing User A's token; User B may receive cached URLs |
| Public first-run admin takeover | Critical | `src/lib/auth-login.ts`, `src/app/api/auth/plex/poll/route.ts` | Any remote Plex OAuth completion while `setupComplete === false` becomes admin |
| OAuth poll not state-bound | High | `src/app/api/auth/plex/start/route.ts`, `src/app/api/auth/plex/poll/route.ts` | Poll accepts `pinId`/`code` from query params; `state` cookie never validated |
| Shared-server bootstrap | High | `src/lib/auth-login.ts` | `ownedServers[0] \|\| servers[0]` allows non-owned Plex server for setup |
| Unauthenticated Plex SSRF test | High | `src/app/api/settings/test-plex/route.ts`, `validatePlexUrl()` in `src/lib/auth.ts` | Public endpoint fetches attacker-supplied URL; only loopback/link-local blocked |
| Under-authorized Tautulli test | High | `src/app/api/tautulli/test/route.ts` | Any valid session can POST arbitrary URL + API key |
| Overseerr/Tautulli URL storage without SSRF validation | High | `src/app/api/settings/route.ts`, service clients | `normalizeUrl()` only; no DNS/IP validation |
| Test reset drops database | High | `src/app/api/test/reset/route.ts` | Unauthenticated `POST` when `E2E_MOCK_PLEX=true` |
| Insecure cookie defaults | Medium | `src/lib/auth-login.ts`, `src/lib/services/plex-oauth.ts`, `docker-compose.yml` | `secure` only when `SECURE_COOKIES === 'true'` |
| Predictable master encryption key | Medium | `src/lib/models/Settings.ts` | Master key derived from `MONGODB_URI` |
| Wildcard `next/image` hosts | Medium | `next.config.js` | `hostname: '**'` for http and https |
| Vulnerable dependencies | Medium–Critical | `package.json` | `next@14.2.21`, `mongoose@^8.0.3` per `npm audit --omit=dev` |

### Target / Future

| Capability | Key deliverable | Status |
|------------|-----------------|--------|
| Tokenless media URLs + proxy | `GET /api/plex/image` | Planned |
| OAuth state + cookie binding | Hardened poll route | Planned |
| Setup secret gate | `DECIDARR_SETUP_SECRET` env | Planned |
| Central SSRF validator | `src/lib/security/service-url.ts` | Planned |
| Admin-only integration tests | Route auth changes | Planned |
| Production-safe cookies | Default secure in production | Planned |
| App secret encryption | `DECIDARR_SECRET` env + migration | Planned |
| Dependency upgrades | Patched `mongoose`; controlled `next` upgrade | Planned |

### Known Gaps (post-remediation follow-ups)

- Operator must still terminate TLS at reverse proxy; HSTS is out of scope.
- Private-network Plex/Tautulli/Overseerr URLs require explicit admin allowlist for self-hosted LAN installs.

## 1. Data Model Changes

### 1.1 Library cache — tokenless poster references

Store Plex media paths instead of fully qualified tokenized URLs.

```typescript
interface ILibraryItem {
  plexId: string
  title: string
  year?: number
  /** @deprecated Remove after migration; never write new tokenized URLs */
  posterUrl?: string
  /** Plex-relative path, e.g. /library/metadata/12345/thumb/abc */
  thumbPath?: string
  artPath?: string
  // ...existing fields unchanged
}
```

**Migration:** Backfill `thumbPath`/`artPath` from existing `posterUrl` where possible; strip `X-Plex-Token` query param from all cached `posterUrl` values; prefer deleting `posterUrl` after backfill.

### 1.2 Spin history — server-derived poster reference

```typescript
interface ISpinHistoryEntry {
  // ...
  /** @deprecated — stop accepting from client */
  posterUrl?: string
  /** Safe app-local or path reference only */
  thumbPath?: string
}
```

**Migration:** Strip `X-Plex-Token` from existing `posterUrl` values; optionally move to `thumbPath`.

### 1.3 Settings — no schema change required

Encryption implementation changes only. Existing encrypted fields remain; re-encryption migration runs at startup via `src/lib/migrate.ts`.

### 1.4 New environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DECIDARR_SECRET` | Production: yes | High-entropy master key for JWT/encryption wrapping (≥ 32 random bytes, base64 or hex) |
| `DECIDARR_SETUP_SECRET` | Recommended for public installs | One-time gate for first-run OAuth/setup while `setupComplete === false` |
| `DECIDARR_ALLOW_PRIVATE_URLS` | Optional | Admin-only; when `true`, permits RFC1918/private IPs for Plex/Tautulli/Overseerr after DNS validation |
| `E2E_TEST_RESET_SECRET` | Test only | Required header/token for `POST /api/test/reset` |
| `SECURE_COOKIES` | Optional override | Explicit `false` for local HTTP dev; production defaults to secure |

## 2. API Contract

### 2.1 New route — Plex image proxy

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/plex/image` | Session (`requireUser`) | Stream Plex poster/art for authenticated user |

**Query parameters:**

```typescript
interface PlexImageQuery {
  /** Plex-relative path from thumbPath/artPath, must start with / */
  path: string
  /** Optional width hint for Plex transcode; bounded 40–1000 */
  width?: number
}
```

**Behavior:**

1. Validate `path` is a relative Plex media path; reject absolute URLs, `//`, `..`, and non-`/library/` prefixes.
2. Load current user's decrypted Plex token and installation `plexServerUrl` from `requireUser()`.
3. Fetch `${plexServerUrl}${path}` with `X-Plex-Token` header (not query string).
4. Stream response body with upstream `Content-Type`; set `Cache-Control: private, max-age=3600`.
5. Never log token or full upstream URL with token.
6. Return `400` for invalid path, `401`/`403` for auth failures, `502` for upstream Plex errors (generic message).

**Example client URL:**

```
/api/plex/image?path=%2Flibrary%2Fmetadata%2F12345%2Fthumb%2Fabc
```

### 2.2 Modified routes — Plex OAuth

| Method | Path | Change |
|--------|------|--------|
| POST | `/api/auth/plex/start` | Unchanged response; continues setting httpOnly OAuth cookies |
| GET | `/api/auth/plex/poll` | **Breaking:** reject query `pinId` and `code`; require cookie values only |

**Poll request rules (target):**

- Read `pinId` and `code` exclusively from `decidarr_oauth_pin` and `decidarr_oauth_pin_code` cookies.
- Require `state` query/body value to match `decidarr_oauth_state` cookie (constant-time compare).
- On any terminal outcome (success, denial, expiry), delete all OAuth cookies.
- Return `400` with `code: 'INVALID_OAUTH_STATE'` when state mismatch.
- Return `400` with `code: 'MISSING_OAUTH_COOKIES'` when cookies absent.

**First-run setup gate:**

- While `settings.setupComplete === false`, require `X-Decidarr-Setup-Secret` header (or `setupSecret` in POST body for start) matching `DECIDARR_SETUP_SECRET`.
- If env var unset in development, log warning and allow only when `NODE_ENV !== 'production'`.
- In production, missing `DECIDARR_SETUP_SECRET` → `503` with message to configure operator secret.

**`completePlexLogin` rules:**

- Initial admin setup requires `ownedServers.length > 0`; do not fall back to shared/non-owned servers.
- If no owned server, return `403` with `code: 'NO_OWNED_SERVER'`.

### 2.3 Modified routes — integration tests and settings

| Method | Path | Auth (target) | SSRF validation |
|--------|------|---------------|-----------------|
| POST | `/api/settings/test-plex` | Public only when setup incomplete **and** valid setup secret; otherwise `requireAdmin()` | `assertSafeServiceUrl()` |
| POST | `/api/tautulli/test` | `requireAdmin()` | `assertSafeServiceUrl()` |
| POST | `/api/overseerr/test` | `requireAdmin()` (already) | `assertSafeServiceUrl()` |
| PUT | `/api/settings` | `requireAdmin()` | Validate `plex.serverUrl`, `tautulli.url`, `overseerr.url` before save |

**`assertSafeServiceUrl(url, options)`** — new helper in `src/lib/security/service-url.ts`:

```typescript
interface SafeUrlOptions {
  allowPrivateNetworks?: boolean  // from DECIDARR_ALLOW_PRIVATE_URLS + admin context
  allowedHostnames?: string[]     // optional explicit allowlist
  requireHttps?: boolean          // default false for Plex LAN
}

interface SafeUrlResult {
  valid: boolean
  normalized?: string
  error?: string
  resolvedAddresses?: string[]    // internal only; never return to client
}
```

**Validation steps:**

1. Normalize via existing `normalizeUrl()`.
2. Allow only `http:` and `https:`.
3. Reject credentials in URL (`user:pass@`).
4. Resolve hostname via `dns.promises.lookup` (IPv4 + IPv6).
5. Reject loopback, link-local, metadata (`169.254.0.0/16`, `fe80::/10`, etc.), and private ranges unless `allowPrivateNetworks`.
6. For outbound `fetch`, use `redirect: 'manual'` or validate each redirect target with the same rules.
7. Return generic errors to clients: `"Invalid or disallowed service URL"`.

**Rate limiting (minimal):**

- In-memory per-IP counter for test endpoints: max 10 requests / 60s during setup; max 5 / 60s for admin tests. Return `429` when exceeded.

### 2.4 Modified route — spin history

| Method | Path | Change |
|--------|------|--------|
| POST | `/api/spin-history` | Ignore client `posterUrl`; accept optional `thumbPath` or derive from `plexId` server-side |

**POST body (target):**

```typescript
interface CreateSpinHistoryBody {
  plexId: string
  title: string
  mediaType: 'movie' | 'show' | 'episode'
  year?: number
  libraryIds?: string[]
  filtersSnapshot?: Record<string, unknown>
  tvSelectionMode?: 'show' | 'episode'
  poolSizeAtSpin?: number
  /** Optional Plex-relative thumb path; server sanitizes */
  thumbPath?: string
}
```

Server must reject `posterUrl` containing `X-Plex-Token` or absolute `http` URLs.

### 2.5 Modified route — test reset

| Method | Path | Auth (target) |
|--------|------|---------------|
| POST | `/api/test/reset` | `NODE_ENV === 'test'` **and** `E2E_MOCK_PLEX === 'true'` **and** `X-E2E-Reset-Secret` matches `E2E_TEST_RESET_SECRET` |

Return `404` in production builds (preferred) or `403` when any guard fails. Never compile route into production standalone output if feasible via build-time exclusion; otherwise runtime guards are mandatory.

### 2.6 PlexService response shape changes

`PlexService.mapPlexItem()` and related mappers return:

```typescript
interface PlexItem {
  plexId: string
  title: string
  thumbPath?: string   // e.g. /library/metadata/{id}/thumb/{id}
  artPath?: string
  posterUrl?: string   // REMOVED from new responses; transient alias during migration only
  // ...
}
```

API layer converts `thumbPath` → `/api/plex/image?path=...` before sending to client if needed, or client builds proxy URL from `thumbPath`.

### 2.7 Cookie security

**Target `issueSessionCookie` and `getOAuthCookieOptions`:**

```typescript
const secure =
  process.env.SECURE_COOKIES === 'false'
    ? false
    : process.env.SECURE_COOKIES === 'true' || process.env.NODE_ENV === 'production'
```

Document in `.env.example` and `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - SECURE_COOKIES=true
  - DECIDARR_SECRET=${DECIDARR_SECRET}
  - DECIDARR_SETUP_SECRET=${DECIDARR_SETUP_SECRET}
```

## 3. Frontend Changes

### 3.1 Image rendering

**Modify:**

- `src/components/MovieCard.tsx` — use `thumbPath`/`artPath` via proxy URL helper
- `src/components/RecentSpins.tsx` — same
- `src/components/animations/utils.ts` — `getPosterUrl()` builds `/api/plex/image?path=...`
- `src/app/dashboard/page.tsx` — stop passing tokenized `posterUrl` to spin history POST

**New helper** — `src/lib/plex-image.ts`:

```typescript
export function plexImageUrl(thumbPath?: string | null, width?: number): string | null
export function stripTokenFromUrl(url: string): string
```

### 3.2 Setup wizard and login

**Modify:**

- `src/components/SetupWizard.tsx` — collect or inject setup secret (from env-injected public config or operator-pasted value on first run)
- `src/components/LoginScreen.tsx` — poll without `pinId`/`code` query params; pass `state` only
- `src/lib/api.ts` — update `authApi.pollPlexLogin()` to match hardened contract

**Setup secret UX (recommended):**

- On first visit while `setupComplete === false`, show optional "Setup key" field if server returns `setupSecretRequired: true` from `GET /api/settings/status`.
- Store setup secret in sessionStorage for OAuth start/poll sequence only; never localStorage.

### 3.3 Settings modal

- Tautulli test button remains admin-only (hide for non-admin users).
- No UI change for Overseerr test (already admin-gated).

## 4. Acceptance Criteria

### Target (all required for done)

#### SR-1 Plex token removal

- [ ] No API JSON response contains the substring `X-Plex-Token`.
- [ ] `LibraryCache` documents written after migration contain no token in any string field.
- [ ] `SpinHistoryEntry` documents written after change contain no token in any string field.
- [ ] Browser network tab shows image requests to `/api/plex/image`, not direct Plex host with token query param.
- [ ] Unauthenticated request to `/api/plex/image` returns `401`.

#### SR-2 OAuth and setup hardening

- [ ] `GET /api/auth/plex/poll?pinId=1&code=x` without cookies returns `400`.
- [ ] Poll with valid cookies but wrong `state` returns `400`.
- [ ] Fresh install in production without `DECIDARR_SETUP_SECRET` cannot complete setup.
- [ ] Plex account with only shared (non-owned) servers cannot complete initial setup.
- [ ] Successful poll clears OAuth cookies.

#### SR-3 SSRF and authorization

- [ ] `POST /api/settings/test-plex` with `http://10.0.0.1:32400` returns `400` when private URLs disallowed.
- [ ] Non-admin session receives `403` on `POST /api/tautulli/test`.
- [ ] `PUT /api/settings` with internal metadata URL rejected.
- [ ] Admin with `DECIDARR_ALLOW_PRIVATE_URLS=true` can save LAN Plex URL.

#### SR-4 Production footguns

- [ ] `POST /api/test/reset` returns `403`/`404` when `NODE_ENV=production`.
- [ ] Session cookie issued with `Secure` flag when `NODE_ENV=production` and `SECURE_COOKIES` unset.
- [ ] `next.config.js` no longer allows `hostname: '**'` for http/https.

#### SR-5 Secret storage

- [ ] Production boot without `DECIDARR_SECRET` fails closed with clear operator error.
- [ ] Existing installs migrate: JWT secret and encryption key decryptable after setting `DECIDARR_SECRET` once migration runs.
- [ ] `getMasterKey()` no longer uses `MONGODB_URI` as sole entropy source for new writes.

#### SR-6 Dependencies

- [ ] `mongoose` upgraded beyond vulnerable range (`>8.22.0` or audit-clean).
- [ ] `next` upgraded to a patched version per advisory; breaking changes documented if major bump required.
- [ ] `npm audit --omit=dev` shows no critical production vulnerabilities (or documented accepted risk with compensating controls).

## 5. Edge Cases

| Edge case | Expected behavior |
|-----------|-------------------|
| Cached items have only legacy `posterUrl` with token | Migration strips token; UI falls back to `thumbPath` or placeholder |
| Plex thumb 404 | Proxy returns `404`; UI shows placeholder poster |
| User session valid but Plex token revoked | Proxy returns `502`; UI shows placeholder; user prompted to re-auth on next Plex API failure |
| Setup secret rotated mid-wizard | OAuth start fails until user enters new secret |
| E2E tests use mock Plex | `E2E_MOCK_PLEX=true` bypasses real Plex image fetch; test reset still requires test secret |
| LAN Plex server (192.168.x.x) | Blocked by default; admin enables `DECIDARR_ALLOW_PRIVATE_URLS` |
| DNS rebinding (hostname resolves to 127.0.0.1) | Blocked after DNS resolution step |
| HTTP redirect to internal IP | Rejected when redirect target fails validation |
| Multi-user cache still shared by machineId | Token no longer in cache; cross-user token leak via URL eliminated even if cache shared |
| Operator runs HTTP-only production without TLS | Document that `SECURE_COOKIES=false` is required but discouraged |
| `DECIDARR_SECRET` changed without migration | Old secrets unreadable; operator must re-enter integration credentials (document recovery) |

## 6. Dependency Map

### Modify

| File | Remediation area |
|------|------------------|
| `src/lib/services/plex.ts` | Tokenless paths; header-based token for server fetches |
| `src/app/api/library/[id]/items/route.ts` | Persist `thumbPath`; sanitize responses |
| `src/app/api/selection/random/route.ts` | Return proxy-safe image refs |
| `src/app/api/spin-history/route.ts` | Reject client token URLs |
| `src/lib/models/LibraryCache.ts` | Add `thumbPath`/`artPath` to schema |
| `src/lib/models/SpinHistoryEntry.ts` | Add `thumbPath`; deprecate unsafe `posterUrl` |
| `src/lib/auth-login.ts` | Owned-server requirement; setup gate hook |
| `src/app/api/auth/plex/poll/route.ts` | State/cookie binding |
| `src/app/api/auth/plex/start/route.ts` | Setup secret validation |
| `src/app/api/settings/test-plex/route.ts` | Auth + SSRF |
| `src/app/api/tautulli/test/route.ts` | `requireAdmin()` + SSRF |
| `src/app/api/settings/route.ts` | URL validation on save |
| `src/app/api/test/reset/route.ts` | Multi-guard |
| `src/lib/auth-login.ts`, `src/lib/services/plex-oauth.ts` | Secure cookie defaults |
| `src/lib/models/Settings.ts` | `DECIDARR_SECRET` encryption |
| `src/lib/migrate.ts` | Token strip + secret re-encryption |
| `next.config.js` | Restrict `remotePatterns` |
| `docker-compose.yml`, `.env.example` | New env vars |
| `package.json` | Dependency upgrades |
| UI: `MovieCard`, `RecentSpins`, `dashboard/page`, `SetupWizard`, `LoginScreen`, `api.ts` | Proxy URLs, OAuth, setup secret |

### Create

| File | Purpose |
|------|---------|
| `src/app/api/plex/image/route.ts` | Authenticated Plex image proxy |
| `src/lib/security/service-url.ts` | Central SSRF-safe URL validation |
| `src/lib/plex-image.ts` | Client/server URL helpers |
| `tests/api/security/plex-image.test.ts` | Proxy auth + path validation |
| `tests/api/security/oauth-poll.test.ts` | State/cookie binding |
| `tests/api/security/service-url.test.ts` | SSRF validator unit tests |
| `tests/api/security/setup-secret.test.ts` | Setup gate |
| `tests/unit/lib/settings-encryption.test.ts` | Secret migration |

### Depends on

- Existing `requireUser()` / `requireAdmin()` in `src/lib/auth.ts`
- Existing migration runner `runMigrations()` in `src/lib/migrate.ts`
- E2E harness in `tests/e2e/` (update for setup secret and poll contract)

### Blocked by

- Operator must provision `DECIDARR_SECRET` and `DECIDARR_SETUP_SECRET` before production deploy.
- Next.js major upgrade may require separate spike if `14.x` → `16.x` breaking changes are large.

## 7. Rollout / Migration Plan

Implement in six PR-sized slices. Do not merge dependency major upgrades with behavioral security fixes in the same PR unless unavoidable.

### Phase 1 — Plex token removal (highest priority)

1. Add `thumbPath`/`artPath` to `PlexService` mappers; stop emitting `X-Plex-Token` in new code paths.
2. Implement `GET /api/plex/image` and `plexImageUrl()` helper.
3. Update UI components to use proxy URLs.
4. Add migration to strip tokens from `LibraryCache` and `SpinHistoryEntry`.
5. Change spin-history POST to reject/sanitize client poster URLs.

**Rollback:** Revert proxy route; cached data still usable if migration only stripped tokens (posters break until refresh).

### Phase 2 — OAuth and setup hardening

1. Enforce cookie-only pin/code and state validation on poll route.
2. Add `DECIDARR_SETUP_SECRET` gate to start/poll/setup while `!setupComplete`.
3. Require owned Plex server in `completePlexLogin`.
4. Update `SetupWizard`, `LoginScreen`, and API client.
5. Update E2E global setup to pass setup secret.

### Phase 3 — SSRF validator and route authorization

1. Create `src/lib/security/service-url.ts`.
2. Apply to test-plex, tautulli test, overseerr test, and settings PUT.
3. Switch tautulli test to `requireAdmin()`.
4. Add rate limiting helper for test endpoints.

### Phase 4 — Production footguns

1. Harden `test/reset` route.
2. Default secure cookies in production.
3. Tighten `next.config.js` image patterns to `image.tmdb.org` and same-origin only (or disable remote optimizer).

### Phase 5 — Secret storage

1. Introduce `DECIDARR_SECRET`; fail production boot if missing.
2. Implement AES-256-GCM (or equivalent) via Node `crypto` for new master wrapping.
3. Migration: decrypt with legacy `MONGODB_URI`-derived key, re-encrypt with `DECIDARR_SECRET`.
4. Update docs and docker-compose.

### Phase 6 — Dependencies

1. `npm update mongoose` to patched version; run tests.
2. Evaluate `next` upgrade path: prefer latest patched `14.x` if available; otherwise plan `15.x`/`16.x` spike.
3. Run full `npm audit --omit=dev`, lint, build, unit, API, e2e.

## 8. Verification

### Automated

```bash
npm run lint
npm run build
npm test
npm run test:e2e   # after updating e2e for setup secret
npm audit --omit=dev
```

**New tests (minimum):**

| Test file | Covers |
|-----------|--------|
| `tests/api/security/plex-image.test.ts` | 401 without session; 400 on `../` path; no token in response headers |
| `tests/api/security/oauth-poll.test.ts` | Query param pin rejected; state mismatch rejected |
| `tests/api/security/service-url.test.ts` | Blocks 127.0.0.1, 10.0.0.0/8, metadata; allows when private flag set |
| `tests/api/security/setup-secret.test.ts` | Setup blocked without secret in production mode |
| `tests/api/security/spin-history-poster.test.ts` | POST with tokenized posterUrl rejected |
| `tests/unit/lib/settings-encryption.test.ts` | Round-trip with `DECIDARR_SECRET`; legacy migration |

### Manual / Evidence

1. **Token leak check:** Complete a library refresh and spin; inspect Network tab and MongoDB `librarycaches` — no `X-Plex-Token` anywhere.
2. **OAuth binding:** Attempt poll URL with another browser's pin — must fail.
3. **SSRF:** From admin settings, test Plex URL `http://127.0.0.1:32400` — must reject.
4. **Cookies:** In production mode, inspect `decidarr_session` — must have `Secure` flag.
5. **Screenshot evidence:** Setup wizard with setup key field; movie card with `/api/plex/image` requests.

### Known test gaps (acceptable if documented)

- DNS rebinding with live malicious resolver (unit-test IP mapping only).
- Full Next major upgrade regression (run e2e after upgrade).

## 9. Task Handoff

Convert slices into `docs/tasks/beta/beta-backlog.md` or a dedicated `docs/tasks/security/` backlog when work starts.

| ID | Title | First safe task | Review boundary |
|----|-------|-----------------|-----------------|
| `SEC-001` | Plex image proxy + tokenless paths | Add `thumbPath` to `PlexService` only; no UI yet | Do not change OAuth in same PR |
| `SEC-002` | UI + cache migration for proxy URLs | Switch `MovieCard` + migration | Do not upgrade Next.js |
| `SEC-003` | OAuth poll hardening | Cookie-only poll + state check | Do not add setup secret yet |
| `SEC-004` | Setup secret + owned server | Env var + `completePlexLogin` rule | E2E updates required before merge |
| `SEC-005` | SSRF validator | New `service-url.ts` + unit tests | Do not change encryption |
| `SEC-006` | Route auth tightening | Admin-only tautulli test | Apply validator from SEC-005 |
| `SEC-007` | Cookies + test reset + next.config | Secure cookie default | No schema changes |
| `SEC-008` | DECIDARR_SECRET migration | Settings encryption migration | Requires operator docs |
| `SEC-009` | Dependency upgrades | Mongoose bump | Next major in separate PR |

**Evidence required for done:** All SR-1–SR-6 acceptance criteria checked; CI green; `npm audit --omit=dev` output attached; manual token-leak checklist signed off.

## Agent Activation

- **Lead agent:** Senior Developer (`senior-developer.mdc`)
- **Pair agent:** Code Reviewer (`code-reviewer.mdc`) for PR review; Security Review skill for final pass
- **QA gate:** Evidence Collector or manual checklist in section 8
- **Activation mode:** `gated` — do not mark shipped until SR acceptance criteria pass
- **When to activate pair:** Before merging Phase 1 and Phase 3 (credential and SSRF surfaces)
- **Context pack:** this spec, `docs/specs/current-feature-inventory.md`, affected routes in section 6, `.env.example`, `docker-compose.yml`, `npm audit --omit=dev` output
- **Expected handoff:** PR per phase, migration notes for operators, updated env documentation
- **Do not activate:** UX-only agents, mobile/PWA scope, unrelated beta features

## Appendix A — Vulnerable code references

OAuth poll accepts query parameters today:

```21:33:src/app/api/auth/plex/poll/route.ts
    const pinIdParam = request.nextUrl.searchParams.get('pinId');
    const pinId = pinIdParam
      ? parseInt(pinIdParam, 10)
      : parseInt(cookieStore.get(OAUTH_PIN_COOKIE)?.value || '', 10);

    const pinCode =
      cookieStore.get(OAUTH_PIN_CODE_COOKIE)?.value ||
      request.nextUrl.searchParams.get('code') ||
      '';
```

Plex token embedded in poster URLs:

```347:347:src/lib/services/plex.ts
      posterUrl: item.thumb ? `${this.serverUrl}${item.thumb}?X-Plex-Token=${this.token}` : undefined,
```

Predictable master key:

```88:92:src/lib/models/Settings.ts
const getMasterKey = (): string => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/decidarr';
  return CryptoJS.SHA256('decidarr-master-' + mongoUri).toString().substring(0, 32);
};
```

Insecure cookie default:

```218:221:src/lib/auth-login.ts
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === 'true',
```

## Appendix B — Operator runbook (post-implementation)

1. Generate secrets:
   ```bash
   openssl rand -hex 32   # DECIDARR_SECRET
   openssl rand -hex 16   # DECIDARR_SETUP_SECRET
   ```
2. Set env vars in compose or hosting platform before first public exposure.
3. For LAN-only Plex, set `DECIDARR_ALLOW_PRIVATE_URLS=true` after confirming admin access controls.
4. After deploy, run library refresh once to repopulate cache without legacy token URLs.
5. Rotate `DECIDARR_SETUP_SECRET` after successful setup (optional; no longer consulted once `setupComplete`).
