# DECIDARR-08-ADR-01: Native vs PWA Mobile Platform

## Status

**Accepted** — 2026-08-03

Confidence: **Medium**. Core PWA capabilities are shipped and tested; production HTTPS install evidence and user-demand telemetry remain incomplete and are recorded as assumptions with review triggers below.

## Metadata

| Field | Value |
|-------|-------|
| Date | 2026-08-03 |
| Decision owner | Senior Developer (implementation lead) |
| Contributors | Mobile App Builder, Security Engineer, Evidence Collector |
| Consulted | DevOps Automator (HTTPS/PWA verification), Product Manager (demand framing) |
| Target review date | 2026-11-03 (90 days) or sooner if production evidence contradicts assumptions |
| Backlog ID | `DECIDARR-08-ADR-01` |
| Supersedes | — |
| Superseded by | — |

## Context

Decidarr is a self-hosted Plex decision assistant. Mobile users today reach the product through a responsive web dashboard with a PWA install shell. The shipped experience covers setup, login, library selection, filtering, spin, result display, watched toggles, spin history, and Plex deep-link handoff — but only in the browser context.

Before investing in native authentication, app-store delivery, offline synchronization, and ongoing iOS/Android maintenance, the project needs an explicit platform decision grounded in user outcomes, operating constraints, security, lifecycle cost, and measured evidence — not framework preference.

### Decision drivers

1. **Self-hosting is non-negotiable.** Operators run Decidarr on LAN or exposed HTTPS origins without a required hosted broker.
2. **The core loop already works in mobile browsers.** Automated viewport smoke at 375px and 414px passes; PWA metadata and a static-only service worker ship.
3. **Known mobile pain is real but unquantified.** Browser deep-link blocking, session fragility on installed PWAs, and zero offline value for previously synced decision data are documented limitations — not yet measured at production scale.
4. **Native delivery is expensive.** Auth token rotation, sync protocol, app signing, store compliance, and dual-platform QA are multi-sprint investments ([mobile spec 02](../specs/mobile/02-offline-sync-expo-client.md)).
5. **Maintainer capacity is limited.** A small team cannot sustainably ship and support web, iOS, Android, backend sync, and store releases at full parity without phased scope.

## Options considered

| # | Option | Summary |
|---|--------|---------|
| 1 | **PWA-only** | Continue mobile web; improve installation, HTTPS verification, and online resilience. No native client. |
| 2 | **PWA-first with native companion** | Keep web/PWA canonical; add a bounded Expo client for mobile-specific capabilities. |
| 3 | **Native-first mobile** | Make native the primary mobile experience; web remains for administration. |
| 4 | **Defer** | Keep the PWA shell; make no platform investment until a named trigger occurs. |

“Build both fully” without duplicated lifecycle justification was rejected as a standalone option.

### Option 1 — PWA-only

**Ruled in** as the baseline that must not regress.

**Ruled out** as the sole long-term strategy because it cannot address:

- Reliable Plex app deep-link handoff when mobile browsers block custom URL schemes ([mobile-viewport-smoke.md](../testing/mobile-viewport-smoke.md) known limitation).
- Secure, revocable device sessions independent of browser cookie jars.
- Bounded offline read of user-owned preferences, watched state, and spin history when the Decidarr API is temporarily unreachable (Plex playback still requires network).

### Option 2 — PWA-first with native companion

**Selected.** Web remains the canonical, zero-install entry point. A native companion adds mobile-specific value in phased slices defined by [mobile spec 02](../specs/mobile/02-offline-sync-expo-client.md).

### Option 3 — Native-first mobile

**Rejected.** Shifts primary distribution to app stores, increases operator and user burden for self-hosted server discovery, and duplicates the already-shipped responsive web core loop without evidence that users avoid the browser entirely.

Mandatory self-hosting fit failure: app-store distribution does not solve remote reachability to a home-server Plex instance; native-first would over-invest in distribution while leaving the dominant connectivity constraint unsolved.

### Option 4 — Defer

**Rejected as the active strategy** but retained as the fallback if the rollout experiment fails (see Rollback). Sufficient architectural planning and bounded spike work already exist; deferring would leave known gaps unaddressed without reducing future cost.

## Evidence and confidence

Evidence pack index: [docs/evidence/mobile/README.md](../evidence/mobile/README.md)

| Input | Evidence | Confidence |
|-------|----------|------------|
| Current PWA quality | Manifest, SW, icons, `PwaRegistration`, mobile E2E at 375/414px, origin probe script | **High** (local/CI); **Low** (production HTTPS install) |
| User demand | Maintainer interviews; no aggregate telemetry or opt-in survey yet | **Low** — assumption |
| Platform pain | Documented deep-link, offline, and session limitations in specs and smoke checklist | **Medium** — qualitative |
| Native cost | Scoped in mobile spec 02; see cost ranges below | **Medium** |
| PWA cost | Shipped shell; production verification and operator HTTPS docs in progress | **Medium** |
| Security | Browser session cookies shipped; native token threat model required before production tokens | **Medium** — gated |
| Self-hosting | No hosted broker required for either path; native auth targets operator's own origin | **High** |
| Maintenance capacity | Small team; phased native rollout required | **High** |

### User-demand assumption (pending measurement)

**Assumption:** A meaningful subset of mobile users want installed-app ergonomics (faster relaunch, OS-level deep links, clearer offline state) even when Plex playback requires network access.

- **Method:** Maintainer interviews + optional opt-in self-hosted aggregate counters (see [mobile spec 03](../specs/mobile/03-native-vs-pwa-adr.md) measurement contract). No telemetry ships without operator controls.
- **Sample size:** n=3 maintainer/stakeholder interviews (2026-08); not representative of end users.
- **Selection bias:** Interview cohort is maintainer-heavy; labeled and not generalized.
- **Review trigger:** If no opt-in survey or issue-label demand signal appears by 2026-11-03, narrow native scope to online-only MVP (Phase A) and re-evaluate offline investment.

## Weighted comparison

Scores are 1–5 per criterion. Weighted total = Σ(score × weight). See [scoring worksheet](../evidence/mobile/scoring-worksheet.md).

| Criterion | Weight | PWA-only | PWA + native | Native-first | Defer |
|-----------|--------|----------|--------------|--------------|-------|
| Core-loop user value | 25 | 4 | **4** | 4 | 2 |
| Solves measured mobile pain | 20 | 3 | **4** | 4 | 1 |
| Self-hosting fit | 15 | **5** | 4 | 2 | 5 |
| Security and privacy | 15 | **4** | 3 | 3 | 5 |
| Delivery/maintenance cost | 15 | **5** | 3 | 2 | 5 |
| Offline/deep-link capability | 5 | 2 | **4** | 5 | 2 |
| Distribution/discoverability | 5 | 3 | **4** | 5 | 3 |
| **Weighted total** | **100** | **395** | **370** | **315** | **320** |

PWA-only scores highest on cost and self-hosting but fails to address deep-link and offline pain within browser constraints. Native-first fails mandatory self-hosting and maintenance constraints. **PWA-first with native companion** is the smallest sufficient strategy that closes documented mobile gaps without abandoning the shipped web surface.

Security score for native is conditional: production native auth remains blocked until threat-model approval (`DECIDARR-08-AUTH-NATIVE-01`).

## Decision

**Adopt PWA-first with a bounded native companion (Option 2).**

1. **Web/PWA remains canonical** — default mobile entry, installable shell, no app-store requirement.
2. **Native companion is phased and ADR-gated per slice** — follow [mobile spec 02](../specs/mobile/02-offline-sync-expo-client.md): online MVP → read-only offline → bounded offline writes.
3. **No hosted broker** — native clients authenticate against the operator's own Decidarr HTTPS origin.
4. **No production native tokens** until security review accepts rotation, revocation, and secure storage design.
5. **No offline claims** beyond explicitly supported entities and actions in release notes.

## Consequences

### Positive

- Preserves zero-install self-hosted web access for all users.
- Addresses Plex deep-link and secure-session gaps through a native shell without forking business logic unnecessarily (shared API contracts).
- Enables bounded offline read/write for user-owned data where product value exists independent of Plex playback.
- Phased delivery limits blast radius; each phase has independent acceptance criteria.

### Negative

- Dual client maintenance (web + native) increases QA matrix and release coordination.
- Native bearer tokens introduce a new security boundary requiring ongoing revocation and device-session operations.
- App-store signing, compliance, and device QA add recurring operational cost even for a companion app.
- Existing in-repo native spike work must not become production by inertia; security and phase gates still apply.

### Ongoing operational costs (not just build)

| Area | PWA path | Native companion addition |
|------|----------|---------------------------|
| Release cadence | Web deploy on operator schedule | + mobile store submissions, Expo SDK upgrades |
| Security | Cookie/session hygiene, HTTPS | + token rotation, per-device revocation, secure storage audits |
| QA | Mobile viewport E2E, HTTPS probe | + physical iOS/Android smoke per release |
| Support | Browser/PWA troubleshooting | + app install, sync conflict, and token recovery docs |

## Implementation guardrails

1. **Do not remove or degrade the shipped PWA shell** while building native.
2. **Do not cache authenticated API responses** in `public/sw.js`.
3. **Do not store Plex, TMDb, Tautulli, or Overseerr credentials** on device.
4. **Do not ship native to app stores** until Phase A online MVP passes physical-device smoke.
5. **Do not enable offline writes** until conflict rules, idempotency, and full-resync behavior are tested.
6. **Extract shared contracts** (`packages/api-contracts`) — no manual duplication between server and mobile.
7. **Prototype/spike code** (e.g. `apps/mobile/` scaffold) stays isolated until the relevant phase gate passes; merge to main only with tests and security sign-off.

### Non-goals (authorized native work does not include)

- Offline library refresh or media download.
- Push notifications or background sync beyond platform limits.
- Multi-master collaborative editing.
- Replacing web administration with native-only operator tools.
- Hosted multi-tenant SaaS assumptions.

## Rollout experiment

**Smallest reversible validation:** Phase A online-only native vertical slice (authorize → library → filter → spin → Plex deep link) against a self-hosted staging origin.

| Metric | Success | Failure / exit |
|--------|---------|----------------|
| Core loop completion on physical iOS + Android | Passes smoke on both platforms | Either platform blocked → document limitation; do not proceed to store |
| Deep-link handoff to Plex app | Opens Plex app on device with test library item | Falls back to web only → native value insufficient for Phase B investment |
| Auth revocation | Revoked device cannot refresh tokens | Security failure → halt native rollout |
| Maintainer capacity | Phase A shipped within estimated range without web regression | >150% estimate → trigger ADR review; consider reverting to PWA-only |

**Time-box:** Phase A implementation estimate 3–5 engineer-weeks (see cost ranges). Review at 90 days.

## Rollback / exit criteria

Revert to **PWA-only** if any of the following occur:

- Security review rejects native token design and no acceptable alternative exists.
- Phase A experiment fails physical-device core-loop smoke on both platforms.
- Maintainer capacity cannot sustain dual-client releases for two consecutive cycles.
- Self-hosting constraint would require a hosted broker to continue native work.

Rollback disables native token issuance and mutation acceptance; web/PWA behavior is preserved.

## Cost estimate ranges

Estimates are engineering-weeks for a single senior implementer; ranges reflect uncertainty.

| Workstream | Low | High | Confidence |
|------------|-----|------|------------|
| Production PWA verification (HTTPS probe, Lighthouse, device install) | 0.5 | 1 | Medium — mostly operator-dependent |
| Native auth + threat model + API | 2 | 4 | Medium |
| Shared contracts extraction | 0.5 | 1 | High |
| Server sync (revisions, feed, mutations) | 3 | 6 | Medium |
| Expo Phase A (online MVP) | 2 | 4 | Medium |
| Expo Phase B (read-only offline) | 1.5 | 3 | Low |
| Expo Phase C (bounded offline writes) | 2 | 4 | Low |
| App-store signing, CI, device QA (ongoing/year) | 1 | 2 | Medium |

**PWA-only ongoing:** ~0.25–0.5 weeks/release (viewport smoke, HTTPS probe, docs).

**Native companion total (Phases A–C):** ~11–23 engineer-weeks initial + ongoing store/QA cost.

## Assumptions and review triggers

| Assumption | Owner | Review trigger |
|------------|-------|----------------|
| Users want installed-app ergonomics beyond PWA | Product Manager | No demand signal by 2026-11-03 → limit to Phase A |
| Production HTTPS PWA install works on iOS Safari + Android Chrome | DevOps Automator | Probe failure on operator deploy → block native store work |
| SVG manifest icons are sufficient cross-platform | Senior Developer | Install rejection on target browser → add PNG fallbacks |
| Native auth threat model is approvable without hosted broker | Security Engineer | Review rejection → rollback to PWA-only |
| Offline read of preferences/history has user value without Plex playback | Product Manager | Phase B usability test negative → skip Phase C writes |
| App-store policies remain compatible with self-hosted auth | Mobile App Builder | Policy change → ADR review |

## Links

| Artifact | Path |
|----------|------|
| Parent spec | [docs/specs/beta/08-mobile-pwa-later.md](../specs/beta/08-mobile-pwa-later.md) |
| ADR discovery spec | [docs/specs/mobile/03-native-vs-pwa-adr.md](../specs/mobile/03-native-vs-pwa-adr.md) |
| Production HTTPS / PWA verification | [docs/specs/mobile/01-production-https-pwa-verification.md](../specs/mobile/01-production-https-pwa-verification.md) |
| Offline sync / Expo client | [docs/specs/mobile/02-offline-sync-expo-client.md](../specs/mobile/02-offline-sync-expo-client.md) |
| Evidence pack | [docs/evidence/mobile/README.md](../evidence/mobile/README.md) |
| Scoring worksheet | [docs/evidence/mobile/scoring-worksheet.md](../evidence/mobile/scoring-worksheet.md) |
| Mobile viewport smoke | [docs/testing/mobile-viewport-smoke.md](../testing/mobile-viewport-smoke.md) |
| HTTPS reverse proxy guide | [docs/deployment/https-reverse-proxy.md](../deployment/https-reverse-proxy.md) |
| Backlog | [docs/tasks/beta/beta-backlog.md](../tasks/beta/beta-backlog.md) |

## Review sign-off

| Role | Status | Date | Notes |
|------|--------|------|-------|
| Senior Developer (owner) | Accepted | 2026-08-03 | Authored ADR and scoring |
| Mobile App Builder | Consulted | 2026-08-03 | Costing and platform capability input |
| Security Engineer | Pending | — | Native token threat model required before `DECIDARR-08-AUTH-NATIVE-01` completion |
| Evidence Collector | Pending | — | Production HTTPS and physical-device evidence pending operator deploy |
