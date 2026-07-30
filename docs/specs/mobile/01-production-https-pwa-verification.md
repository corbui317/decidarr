# Feature: Production HTTPS and PWA Verification

## Status

**Planned** — the PWA shell exists, but a production HTTPS target and production evidence do not.

## What & Why

Decidarr needs a repeatable, deployment-neutral way for self-hosted operators to expose the app over HTTPS and verify that its installed web experience works in production. This closes the gap between local PWA tests and the secure, proxied environment users actually run.

Lighthouse removed its dedicated PWA category in version 12. Verification must use current Lighthouse quality categories together with the Chrome DevTools Application panel and physical-device installation checks. Do not define success as a “Lighthouse PWA score.”

## User Outcomes

- As an operator, I want a documented HTTPS deployment contract so that sessions and installation work securely behind my reverse proxy.
- As a maintainer, I want reproducible audit evidence so that PWA regressions are detected before release.
- As a mobile web user, I want Decidarr to install and launch in standalone mode from a trusted origin.

## Non-Goals

- Provisioning a domain, DNS account, cloud host, or certificate vendor for the operator.
- Caching authenticated API responses or claiming offline support.
- Building the native Expo client.
- Replacing operator-selected reverse proxies with a Decidarr-managed ingress service.

## Implementation Snapshot

### Current / Shipped

| Capability | UI / File | API / Logic | Status |
|------------|-----------|-------------|--------|
| Web app manifest | `src/app/manifest.ts` | `/manifest.webmanifest` | Shipped |
| Service worker registration | `src/components/PwaRegistration.tsx` | `/sw.js` | Shipped |
| Static-only cache | `public/sw.js` | Icons, manifest, `/_next/static/` | Shipped |
| Install icons | `public/icons/*.svg` | Static assets | Shipped |
| Secure production cookies | — | `src/lib/security/cookie-options.ts` | Shipped |
| Mobile smoke tests | — | `tests/e2e/mobile-viewport.spec.ts` | Shipped |

### Known Gaps

- No canonical reverse-proxy/TLS deployment guide.
- No automated production-origin probe for HTTPS redirects, manifest, service worker, and icons.
- No versioned Lighthouse report or Chrome installability evidence from a deployed origin.
- SVG icons may not provide identical install behavior across all target browsers; production verification must determine whether PNG fallbacks are required.
- The manifest has no stable `id`; adding one should be evaluated before changing `start_url`.

### Target / Future

- Document the production ingress contract for Caddy, nginx, or Traefik without coupling Decidarr to one proxy.
- Add a script that probes a supplied HTTPS origin and fails on insecure or missing PWA resources.
- Capture current Lighthouse performance/accessibility/best-practices/SEO output as quality evidence.
- Capture Chrome/Edge installability and iOS Add to Home Screen evidence separately.

## 1. Data Model Changes

No MongoDB or Mongoose changes are required.

Audit reports are build/release artifacts, not application records. Store checked-in summaries under `docs/evidence/pwa/` only when the repository’s evidence-retention policy is defined; otherwise attach full reports to CI or a release.

## 2. Deployment and Verification Contract

### Production origin requirements

| Requirement | Expected behavior |
|-------------|-------------------|
| Canonical origin | One operator-supplied `https://` origin |
| TLS | Valid, unexpired certificate with complete chain |
| HTTP handling | Redirect HTTP to the canonical HTTPS origin with `301` or `308` |
| Proxy forwarding | Preserve host and protocol through standard forwarded headers |
| App port | Next.js remains private or LAN-bound; reverse proxy owns public ingress |
| Cookies | `NODE_ENV=production`; `SECURE_COOKIES=true` or production default |
| Manifest | `GET /manifest.webmanifest` returns `200` and manifest JSON |
| Service worker | `GET /sw.js` returns `200`, JavaScript content type, and no HTML fallback |
| Icons | Every declared manifest icon returns `200` with the declared media type |
| Scope | Manifest `start_url` and service-worker scope resolve under the canonical origin |

### Proposed production probe

Create `scripts/verify-pwa-origin.mjs`:

```text
node scripts/verify-pwa-origin.mjs https://decidarr.example.com
```

The probe must:

1. Reject non-HTTPS target URLs except explicit `localhost` development use.
2. Request the root document, manifest, service worker, and every manifest icon.
3. Validate the manifest’s `name`/`short_name`, `start_url`, `display`, icon sizes, and same-origin scope.
4. Verify the root document links the manifest and advertises a theme color.
5. Report TLS/redirect/resource failures without printing cookies or response secrets.
6. Exit nonzero on a failed required check.

The probe must not authenticate, modify application data, or follow a redirect to a different registrable domain silently.

### Lighthouse command

Use a pinned Lighthouse major version in CI or record the exact version in evidence:

```bash
npx lighthouse@<pinned-major> "$DECIDARR_PRODUCTION_URL" \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=html --output=json --output-path=./artifacts/decidarr-lighthouse
```

Lighthouse is quality evidence only. Installability is verified with browser tooling and device smoke because the PWA category no longer exists.

## 3. Operator Documentation Changes

### Target

- Add `docs/deployment/https-reverse-proxy.md` with:
  - prerequisites and threat boundary;
  - Caddy reference configuration;
  - nginx and Traefik header requirements;
  - `SECURE_COOKIES` behavior;
  - certificate renewal and HTTP-to-HTTPS checks;
  - LAN-only deployment notes;
  - rollback instructions.
- Update `.env.example` so production HTTPS and local HTTP examples cannot be confused.
- Document that disabling secure cookies on a public origin is unsupported.
- Add a release checklist linking the automated probe and manual installation checks.

### Accessibility and performance budgets

- Lighthouse accessibility target: `>= 90`, with no critical issue waived without documentation.
- Best practices target: `>= 90`.
- Performance is recorded and trended; the initial production run establishes the baseline rather than inventing an unmeasured pass threshold.
- Test both a fresh service-worker install and an update from the previous cache version.

## 4. Acceptance Criteria

### Current

- [x] Manifest, service worker, icons, registration, and mobile viewport tests exist.
- [x] Authenticated API routes are excluded from service-worker caching.

### Target

- [ ] A production or production-equivalent Decidarr instance is reachable at a canonical HTTPS origin.
- [ ] HTTP redirects to HTTPS and the certificate validates without browser warnings.
- [ ] Session cookies observed after login include `Secure`, `HttpOnly`, and the intended `SameSite` value.
- [ ] The production probe passes for the root document, manifest, service worker, and all icons.
- [ ] Current Lighthouse quality reports are captured with tool version, timestamp, commit SHA, and tested URL.
- [ ] Chrome/Edge offers or permits installation and launches Decidarr in standalone display mode.
- [ ] iOS Safari Add to Home Screen launches with the expected name, icon, theme, and safe-area behavior.
- [ ] Service-worker cache updates do not strand clients on deleted static assets.
- [ ] Documentation states clearly that authenticated data remains network-required.

## 5. Edge Cases

- TLS certificate expired or hostname mismatch -> fail verification; never advise bypassing the warning.
- Reverse proxy terminates TLS but app sees HTTP -> cookies must still remain secure; document required forwarding headers.
- Operator accesses by raw LAN IP and domain -> choose one canonical origin to avoid separate cookies and service-worker registrations.
- App is installed before a cache-name change -> activation removes only Decidarr-owned stale caches.
- Manifest or service worker returns the Next.js HTML error page with `200` -> content-type and payload validation fail.
- Browser does not promote install despite valid metadata -> verify browser/version engagement behavior and use menu installation; do not weaken security.
- SVG install icon rejected by a target platform -> add generated PNG 192/512/maskable fallbacks and update manifest tests.
- Plex server is unreachable outside the LAN -> installed shell loads, but UI presents the existing actionable integration error; no offline success claim.

## 6. Dependency Map

**Modify:**

- `README.md`
- `.env.example`
- `src/app/manifest.ts` if verification identifies metadata gaps
- `public/sw.js` only for confirmed cache lifecycle defects
- `package.json` only if a pinned verification command is added

**Create:**

- `docs/deployment/https-reverse-proxy.md`
- `scripts/verify-pwa-origin.mjs`
- `tests/unit/scripts/verify-pwa-origin.test.ts`
- CI/release artifact configuration

**Depends on:**

- Operator-selected domain or private trusted hostname
- TLS-capable reverse proxy and certificate
- A deployed production build
- [Mobile/PWA parent spec](../beta/08-mobile-pwa-later.md)

**Blocked by:**

- No reachable HTTPS deployment target
- No operator decision on canonical origin and reverse proxy

## 7. Rollout / Migration Plan

1. Implement and unit-test the origin probe against local fixtures.
2. Write deployment-neutral HTTPS requirements and one complete Caddy example.
3. Deploy a tagged build to an operator-selected HTTPS origin.
4. Verify redirects, cookies, PWA resources, service-worker update behavior, and install flows.
5. Capture Lighthouse quality and physical-device evidence.
6. Add the probe to release validation after the first successful baseline.

Rollback is DNS/proxy rollback to the previous working build. Do not roll back by disabling TLS or secure cookies.

## 8. Verification

**Automated:**

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e -- tests/e2e/mobile-viewport.spec.ts`
- `node scripts/verify-pwa-origin.mjs "$DECIDARR_PRODUCTION_URL"`
- Pinned Lighthouse command from this spec

**Manual / Evidence:**

- Chrome DevTools Application panel: manifest has no errors; service worker is activated and controlling the page.
- Chrome/Edge desktop or Android installation and standalone launch.
- iOS Safari Add to Home Screen and standalone launch.
- Cookie inspection after authenticated login through the reverse proxy.
- Evidence records tested URL, redacted where private, commit SHA, browser/tool versions, and date.

**Known test gaps:**

- Automated Chromium emulation is not evidence for real iOS Safari behavior.
- Private home-server URLs may prevent hosted CI from running the origin probe.

## 9. Task Handoff

- **Backlog IDs:** `DECIDARR-08-PWA-PROD-01`, `DECIDARR-08-PWA-VERIFY-01`
- **First safe task:** Add the read-only origin probe and fixture tests.
- **Review boundary:** Do not add offline API caching, analytics, native code, or provision operator infrastructure.
- **Evidence required for done:** Probe output, Lighthouse quality reports, install screenshots, cookie attributes, and service-worker update smoke.

## Agent Activation

- **Lead agent:** `Senior Developer`
- **Pair agent:** `DevOps Automator`
- **QA gate:** `Evidence Collector`
- **Activation mode:** `gated`
- **When to activate pair:** Reverse-proxy examples, CI artifacts, TLS/cookie behavior
- **Context pack:** this spec, parent spec 08, `docker-compose.yml`, `.env.example`, PWA files, mobile E2E test
- **Expected handoff:** deployment docs, verification script/tests, audit artifacts, browser/device evidence, blockers
- **Do not activate:** Native mobile implementation or offline sync
