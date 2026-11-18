# Maintainer Interview Summary — Mobile Platform

**Date:** 2026-08-03  
**Method:** Structured maintainer interviews (n=3 stakeholders)  
**Limitation:** Maintainer-heavy sample; not representative of end-user demand. Labeled as assumption in ADR.

## Prompts used

1. How do users currently reach Decidarr on mobile?
2. Where does the browser/PWA flow fail or feel costly?
3. Is offline access valuable if Plex playback still requires network/server access?
4. Would users install from an app store, and what trust expectations change?
5. Which actions must work when away from the home network?
6. Are push notifications, background work, or OS integrations actually required?

## Summary findings

### Current access patterns

- Users primarily open the self-hosted URL in mobile Safari or Chrome.
- Some operators add to Home Screen after HTTPS setup; adoption is anecdotal, not measured.
- LAN-only deployments dominate; remote access varies by operator networking skill.

### Documented pain points (qualitative)

| Pain | Severity (interview consensus) | Native plausibly helps? |
|------|-------------------------------|-------------------------|
| Plex deep links blocked in mobile browser | High | Yes — native URL scheme handling |
| Re-authentication after PWA backgrounding | Medium | Yes — secure token refresh |
| No offline view of spin history/preferences | Medium | Yes — bounded SQLite cache |
| Home server unreachable off LAN | High | **No** — network topology, not platform |
| iOS PWA install discoverability | Medium | Partially — app store optional |
| Push notifications for spin reminders | Low | Not required for MVP |

### Offline value

- Consensus: offline **read** of preferences, watched state, and spin history has value for "what did I pick last time?" even when Plex is unreachable.
- Consensus: offline **spin** requires live library pool data; cache-only spin is misleading and out of scope.
- Playback offline is explicitly out of scope (Plex dependency).

### App store trust

- Self-hosted users expect to configure server URL manually; store distribution is convenience, not discovery for this product category.
- No interviewee identified push notifications or background sync as MVP requirements.

## Implications for ADR

- Supports **PWA-first with native companion** over native-first or defer.
- Does **not** justify full native-first or "build both fully" without phased gates.
- User-demand evidence remains **low confidence** until opt-in telemetry or broader survey.

## Review trigger

Re-run broader user survey or enable opt-in aggregate counters by **2026-11-03**. If no demand signal, narrow native scope to Phase A online MVP only.
