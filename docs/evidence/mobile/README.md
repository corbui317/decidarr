# Mobile Platform Evidence Pack

Evidence attachments for [DECIDARR-08-ADR-01](../../adr/DECIDARR-08-ADR-01-native-vs-pwa.md) (native vs PWA architecture decision).

## Index

| ID | Artifact | Type | Date | Status | Location |
|----|----------|------|------|--------|----------|
| E-01 | Mobile viewport automated smoke | Automated test | 2026-08 | **Present** | `tests/e2e/mobile-viewport.spec.ts` |
| E-02 | Mobile viewport manual checklist | Manual checklist | 2026-08 | **Present** | [docs/testing/mobile-viewport-smoke.md](../../testing/mobile-viewport-smoke.md) |
| E-03 | PWA manifest metadata | Shipped artifact | 2026-08 | **Present** | `src/app/manifest.ts` |
| E-04 | Static-only service worker | Shipped artifact | 2026-08 | **Present** | `public/sw.js` |
| E-05 | PWA registration component | Shipped artifact | 2026-08 | **Present** | `src/components/PwaRegistration.tsx` |
| E-06 | Production origin probe | Automated script | 2026-08 | **Present** | `scripts/verify-pwa-origin.mjs`, `tests/unit/scripts/verify-pwa-origin.test.ts` |
| E-07 | HTTPS reverse-proxy deployment guide | Documentation | 2026-08 | **Present** | [docs/deployment/https-reverse-proxy.md](../../deployment/https-reverse-proxy.md) |
| E-08 | Plex deep-link generation | API behavior | 2026-08 | **Present** | Selection `playLinks` in `src/components/MovieCard.tsx` |
| E-09 | Production HTTPS install smoke | Manual/device | — | **Missing** | Blocked: no canonical operator HTTPS deploy target |
| E-10 | Lighthouse quality report (production) | Audit artifact | — | **Missing** | Blocked: requires deployed HTTPS origin |
| E-11 | iOS Safari Add to Home Screen evidence | Screenshot/device | — | **Missing** | Blocked: requires physical device + HTTPS origin |
| E-12 | Android Chrome install evidence | Screenshot/device | — | **Missing** | Blocked: requires physical device + HTTPS origin |
| E-13 | User-demand survey or aggregate telemetry | Research | — | **Missing** | Assumption documented in ADR; opt-in mechanism not implemented |
| E-14 | Maintainer interview summary | Qualitative research | 2026-08-03 | **Present** | See [interviews/maintainer-summary-2026-08.md](./interviews/maintainer-summary-2026-08.md) |
| E-15 | Native cost / scope estimate | Engineering estimate | 2026-08-03 | **Present** | ADR cost table + [mobile spec 02](../../specs/mobile/02-offline-sync-expo-client.md) |
| E-16 | ADR scoring worksheet | Decision worksheet | 2026-08-03 | **Present** | [scoring-worksheet.md](./scoring-worksheet.md) |
| E-17 | Security threat model (native auth) | Security review | — | **Missing** | Required before production native tokens (`DECIDARR-08-AUTH-NATIVE-01`) |

## Owners

| Evidence area | Owner | Next action |
|---------------|-------|-------------|
| PWA local/CI quality | Senior Developer | Maintain E2E on dashboard changes |
| Production HTTPS + install | DevOps Automator | Run `verify-pwa-origin.mjs` on operator deploy; capture E-09–E-12 |
| User demand | Product Manager | Optional opt-in survey or issue-label tracking by 2026-11-03 |
| Native security | Security Engineer | Complete threat model for E-17 |
| Physical-device smoke | Evidence Collector | Attach redacted screenshots when E-09 unblocks |

## Attachment rules

- Record commit SHA, tool version, and tested URL for all audit artifacts.
- Redact private hostnames in shared evidence; keep full URLs in operator-local copies only.
- Do not attach cookies, tokens, Plex credentials, or user-identifiable media choices.
- Lighthouse reports: pin major version in filename (e.g. `lighthouse-v12-2026-08-03.json`).

## Measurement plan (optional, not shipped)

If operators opt in, aggregate counters may use the event contract in [mobile spec 03](../../specs/mobile/03-native-vs-pwa-adr.md). Requirements before implementation:

1. Operator toggle to enable/disable collection.
2. Local or self-hosted storage only; no third-party analytics SaaS.
3. Documented retention and deletion behavior.
4. No movie titles, Plex IDs, filter values, usernames, tokens, or IP addresses.

Until then, demand evidence relies on interviews, support issues, and GitHub labels.
