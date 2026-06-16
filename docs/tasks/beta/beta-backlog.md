# Decidarr Beta Backlog

Task backlog for the beta spec set. Keep tasks small enough for one branch and one focused review.

## Status Legend

- `TODO` - not started.
- `PLAN` - needs a plan/context pack.
- `DOING` - actively in implementation.
- `REVIEW` - waiting on QA/review evidence.
- `DONE` - accepted with evidence.
- `BLOCKED` - cannot proceed without a decision or dependency.

## P0 - Setup/Auth/User Access

| ID | Status | Spec | Task | Lead | Verification |
|----|--------|------|------|------|--------------|
| `DECIDARR-01-AUTH-01` | TODO | 01 | Document current setup/auth flow and confirm secret masking in auth/settings responses. | Backend Architect | API samples for `/api/auth/me`, `/api/settings`, logout. |
| `DECIDARR-01-AUTH-02` | TODO | 01 | Remove any remaining single-user assumptions from user-scoped preferences/cache/watched reads. | Backend Architect | Build plus user-scoping smoke. |
| `DECIDARR-01-AUTH-03` | TODO | 01 | Harden Plex OAuth start/poll edge cases and expired PIN messaging. | Security Engineer | OAuth success, expiry, and denial evidence. |
| `DECIDARR-01-ADMIN-01` | PLAN | 01 | Define admin access rules before expanding admin user endpoints. | Product Manager | Decision note in plan file. |

## P0 - Library Data Foundation

| ID | Status | Spec | Task | Lead | Verification |
|----|--------|------|------|------|--------------|
| `DECIDARR-02-CACHE-01` | TODO | 02 | Confirm cache keys, indexes, and user scope for `LibraryCache`. | Database Optimizer | Model review plus API cache smoke. |
| `DECIDARR-02-CACHE-02` | TODO | 02 | Centralize library refresh/enrichment behavior if route duplication appears. | Backend Architect | Build and refresh smoke. |
| `DECIDARR-02-FILTERDATA-01` | TODO | 02 | Verify genre/year/studio/content-rating endpoints only use selected libraries. | API Tester | Endpoint samples with two libraries. |
| `DECIDARR-02-TMDB-01` | TODO | 02 | Document partial TMDb enrichment behavior and rate-limit failure handling. | Backend Architect | Refresh logs with missing/invalid TMDb key. |

## P0 - Selection and Filters

| ID | Status | Spec | Task | Lead | Verification |
|----|--------|------|------|------|--------------|
| `DECIDARR-03-FILTERS-01` | TODO | 03 | Ensure pool count and random selection share the same filter logic. | Backend Architect | API comparison for representative filters. |
| `DECIDARR-03-EMPTY-01` | TODO | 03 | Improve empty-pool reasons for no library, empty cache, and restrictive filters. | Frontend Developer | Dashboard screenshots for each state. |
| `DECIDARR-03-TV-01` | PLAN | 03 | Define exact show vs episode selection behavior before expanding TV mode. | Product Manager | Decision plan with examples. |
| `DECIDARR-03-PLAY-01` | TODO | 03 | Verify Plex app/web play-link fallback behavior. | API Tester | Response samples and manual click smoke. |

## P1 - Watch History and Tautulli

| ID | Status | Spec | Task | Lead | Verification |
|----|--------|------|------|------|--------------|
| `DECIDARR-04-WATCHED-01` | TODO | 04 | Confirm manual watched/unwatched routes are user scoped. | Backend Architect | API smoke for mark/list/delete. |
| `DECIDARR-04-TAUTULLI-01` | TODO | 04 | Make Tautulli sync result counts explicit: fetched, imported, skipped, errors. | API Tester | Sync response sample. |
| `DECIDARR-04-TAUTULLI-02` | PLAN | 04 | Decide episode-to-show watched mapping rule. | Product Manager | Decision in plan file. |
| `DECIDARR-04-UI-01` | TODO | 04 | Surface watched state and sync failures in result/settings UI. | Frontend Developer | Screenshot evidence. |

## P1 - Settings and Operations

| ID | Status | Spec | Task | Lead | Verification |
|----|--------|------|------|------|--------------|
| `DECIDARR-05-SECRETS-01` | TODO | 05 | Verify settings responses never include raw Plex/TMDb/Tautulli secrets. | Security Engineer | Response samples. |
| `DECIDARR-05-URL-01` | TODO | 05 | Validate URL normalization and SSRF protection for Plex/Tautulli/Overseerr URLs. | Security Engineer | Invalid URL API samples. |
| `DECIDARR-05-SETTINGS-01` | TODO | 05 | Confirm settings updates preserve omitted secrets. | Backend Architect | Before/after settings smoke. |
| `DECIDARR-05-OPS-01` | PLAN | 05 | Add troubleshooting notes for common setup and sync failures. | Technical Writer | Docs PR with examples. |

## P1 - Overseerr

| ID | Status | Spec | Task | Lead | Verification |
|----|--------|------|------|------|--------------|
| `DECIDARR-06-TEST-01` | TODO | 06 | Implement or verify Overseerr connection test endpoint and settings UI. | Backend Architect | Valid/invalid test samples. |
| `DECIDARR-06-STATUS-01` | TODO | 06 | Show selected-result Overseerr status when TMDb ID exists. | Frontend Developer | MovieCard screenshots. |
| `DECIDARR-06-REQUEST-01` | PLAN | 06 | Design request idempotency before adding request creation. | Product Manager | Request flow plan. |

## P2 - Spin Animation Experience

| ID | Status | Spec | Task | Lead | Verification |
|----|--------|------|------|------|--------------|
| `DECIDARR-07-ANIM-01` | TODO | 07 | Extract current slot behavior behind a shared animation interface. | Frontend Developer | Build and no-regression spin smoke. |
| `DECIDARR-07-ANIM-02` | TODO | 07 | Add roulette/wheel/plinko/slots variants with shared props. | Frontend Developer | Screenshots/video for each variant. |
| `DECIDARR-07-A11Y-01` | TODO | 07 | Add reduced-motion behavior and keyboard accessibility checks. | Accessibility Auditor | Reduced-motion and keyboard evidence. |
| `DECIDARR-07-PREFS-01` | PLAN | 07 | Decide whether animation choice persists per user. | Product Manager | Preference decision note. |

## P1 - Spin History and Settings

| ID | Status | Spec | Task | Lead | Verification |
|----|--------|------|------|------|--------------|
| `DECIDARR-09-DATA-01` | DONE | 09 | Define `SpinHistoryEntry` model, indexes, retention rules, and user scope. | Database Optimizer | Model review and retention trim smoke. |
| `DECIDARR-09-API-01` | DONE | 09 | Add list/create/delete/clear spin history endpoints. | Backend Architect | API samples for CRUD and clear-all. |
| `DECIDARR-09-SETTINGS-01` | DONE | 09 | Add enablement, retention limit, and filter snapshot preference controls. | Frontend Developer | Settings screenshots and preference persistence. |
| `DECIDARR-09-UI-01` | DONE | 09 | Add recent spins module and result-card history feedback. | Frontend Developer | Dashboard screenshots and re-spin smoke. |
| `DECIDARR-09-PRIVACY-01` | DONE | 09 | Verify user isolation, clear history, and no secret leakage in stored payloads. | Security Engineer | Cross-user negative test and payload review. |

## Deferred - Mobile/PWA

| ID | Status | Spec | Task | Lead | Verification |
|----|--------|------|------|------|--------------|
| `DECIDARR-08-PWA-01` | PLAN | 08 | Audit mobile web dashboard before adding PWA metadata. | UX Architect | Mobile screenshots and gap list. |
| `DECIDARR-08-ADR-01` | PLAN | 08 | Write native vs PWA ADR when mobile becomes active. | Mobile App Builder | ADR in `docs/adr/`. |

## Deferred - Future Product Lines

Discovery-only backlog rows. Do not implement without a new spec and ADR.

| ID | Status | Spec | Task | Lead | Verification |
|----|--------|------|------|------|--------------|
| `DECIDARR-DEFER-01` | PLAN | 08 | Native mobile app discovery: validate demand and platform choice before scaffold. | Mobile App Builder | Decision memo linked to spec 08. |
| `DECIDARR-DEFER-02` | PLAN | backlog | Social watch parties / multiplayer decision rooms: define problem, sync model, and non-goals. | Product Manager | Discovery spec draft or ADR outline. |
| `DECIDARR-DEFER-03` | PLAN | backlog | Autonomous AI watch concierge: define bounded MVP vs chat-only recommendations. | AI Engineer | Discovery spec with guardrails and no-autonomous-write rule. |
| `DECIDARR-DEFER-04` | PLAN | backlog | Hosted multi-tenant SaaS assumptions: document tenancy, billing, and ops boundaries only if pursued. | Software Architect | ADR with explicit non-goals for self-hosted beta. |

## Backlog Hygiene

- If a task touches multiple specs, link each spec in the implementation plan.
- If a task grows beyond one branch, split it before coding.
- If verification cannot run locally, write the blocker and the substitute evidence.
