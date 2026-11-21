# Decidarr v2 - security hardening on a reusable core

Built from `docs/v2/analysis.md` and the grilling session of 2026-11-21.
Round 1 decisions and the ticket breakdown were approved on 2026-11-21.

## Problem Statement

Decidarr is a self-hosted Plex decision assistant that an Admin shares with Friends.
PR #17 hardened it, but a follow-up audit shows the hardening has holes and the people using it are exposed:

- A Friend who signs in on the mobile app can read and delete everyone's mobile spin history, plus the Legacy data.
- Every Friend's account-wide plex.tv token is stored and sent to whatever Plex URL the Admin configured, even over plain HTTP or through a redirect.
  One compromised Admin session hands over every Friend's whole Plex account.
- The library pool is cached once per library for everyone, filled with whichever user happened to load it first.
  That bypasses Plex's per-user label and content-rating restrictions: a restricted Friend can see titles they should not, or shrink the pool for everyone.
- Login rate limiting keys on a header the client controls.
  Rotating it bypasses the limit, and leaving it out puts everyone in one bucket, so five requests lock everyone out.
- Sync mutations from the mobile app skip every rule the web routes enforce: validation, sanitizing, history trimming, and the Admin-only rule for manual watched.
- A single failed decrypt of a legacy secret silently wipes every integration key and every user's Plex token.
- Signing out does not end the web session, and un-approving a Friend does not end their mobile sessions.
- The URL safety check runs only before the request, so DNS rebinding and redirects can still carry `X-Plex-Token` and `X-Api-Key` to internal hosts.
- The runtime (Node 20, Next 14) is end-of-life, and the boot-time `DECIDARR_SECRET` check never runs on it.
- The mobile app's spin is broken and it signs users out after 15 minutes, because the client and server have drifted apart.

These all share a root cause: every route handler re-implements authentication, validation, persistence, and outbound HTTP for itself.
REST and sync each have their own copy of the user-data rules, and web and mobile each have their own copy of the API types.
Each fix has to be made in many places, and a missed place becomes the next vulnerability.

## Solution

Rebuild the server around a small set of deep modules, then make each security fix once, inside the module that owns the behaviour:

- **Request handling.** Every API route declares who may call it and what input it accepts.
  One module turns cookie and bearer credentials into a single Session, validates input against shared contracts, enforces Origin checks and rate limits, and maps errors to status codes the same way everywhere.
- **User-data store.** Preferences, watched state, and spin history have one owner that validates, persists, trims, and emits sync changes.
  The web routes, the mobile sync API, and Tautulli import all go through it, so they cannot drift.
- **Shared API contracts.** One package defines each request and response once, with runtime validators.
  Web and mobile both get typed clients built from it.
- **Library item store.** It owns cached library items and decides which items each user may see, using that user's own Plex view.
- **Selection pool.** It loads the pool for a Session, picks from it, counts it, and records spin history on the server.
- **Integration client.** One outbound HTTP client enforces the URL policy at connect time, never follows redirects with credentials attached, and reports one error type.

On that core:

- Plex calls use per-server access tokens instead of account-wide plex.tv tokens.
- Friends' account tokens are never stored.
- Each install gets its own Plex client identifier.
- Sessions can be revoked.
- Secrets are hardened.
- The runtime moves to supported versions.

## User Stories

### Friend: privacy and isolation

1. As a Friend, I want my spin history to be visible only to me on every client, so that other Friends cannot read or delete it.
2. As a Friend using the mobile app, I want my spins recorded under my own account, so that my history follows me between web and mobile.
3. As a Friend, I want Decidarr to keep only a token that works for this one Plex server, so that a breach of this install cannot take over my whole Plex account.
4. As a Friend, I want my plex.tv account token thrown away after sign-in, so that it is never at rest on someone else's server.
5. As a Friend with Plex sharing restrictions (labels or content ratings), I want the pool to contain only titles Plex lets me see, so that Decidarr never shows me what the Admin restricted.
6. As a Friend, I want my library view to be unaffected by what other users can see, so that another user's refresh never changes my pool.
7. As a Friend, I want Tautulli import to bring in only my own plays, so that I never get someone else's watch history.
8. As a Friend, I want my mobile edits to follow the same rules as the web app, so that what I can do does not depend on the device.
9. As a Friend, I want manual watched changes refused from every client if the Admin-only rule applies, so that the rule is real rather than cosmetic.
10. As a Friend, I want my spin-history limit applied to mobile syncs too, so that history does not grow without bound.

### Friend and Admin: sessions

11. As a user, I want signing out to actually end my web session, so that a stolen session cookie stops working.
12. As a user, I want web sessions to have an absolute maximum lifetime, so that a session cannot be refreshed forever.
13. As a mobile user, I want to stay signed in while I use the app, so that I am not signed out every 15 minutes.
14. As a mobile user, I want a refresh token that has already been used to be rejected, and its whole family revoked, so that a stolen refresh token is detected.
15. As an Admin, I want un-approving a Friend to end all of their sessions, web and mobile, immediately, so that access removal is real.
16. As a user, I want a clear "signed out" state when my session is revoked, so that I know to sign in again.

### Admin: install and secrets

17. As an Admin, I want Decidarr to refuse to start without a strong `DECIDARR_SECRET`, with a clear message, so that I never run it misconfigured.
18. As an Admin, I want a secret that fails to decrypt to be flagged and kept rather than wiped, so that a typo in `DECIDARR_SECRET` or `MONGODB_URI` never destroys my configuration.
19. As an Admin, I want to be told which credentials need re-entering after a decrypt failure, so that I can recover deliberately.
20. As an Admin, I want stored secrets bound to the record and field they belong to, so that an encrypted value cannot be copied onto another record.
21. As an Admin, I want older encrypted values upgraded to the current format automatically, so that I never re-enter credentials after an update.
22. As an Admin, I want secret migrations to run exactly once even when several requests arrive at startup, so that two migrations never race.
23. As an Admin, I want existing data (users, preferences, watched, history, integration keys) preserved through the v2 upgrade, so that updating does not cost me anything.
24. As an Admin, I want my install to use its own Plex client identifier, so that a phishing page cannot pose as my Decidarr in the Plex sign-in prompt.

### Admin: network safety

25. As an Admin, I want every outbound request to an integration checked against the URL policy at connect time, so that DNS rebinding cannot reach internal hosts.
26. As an Admin, I want redirects from integrations not followed while credentials are attached, so that tokens and API keys never leak to a third host.
27. As an Admin, I want the URL policy to block carrier-grade NAT, benchmarking, multicast, and reserved ranges, so that every non-public range is covered.
28. As an Admin running Plex on my LAN, I want the documented private-address opt-in to keep working, so that a home install still works.
29. As an Admin, I want integration failures reported with one consistent error shape, so that the settings screens can tell me what went wrong.
30. As an Admin, I want internal service URLs hidden from Friends, so that my network layout is not exposed.

### Admin: abuse resistance

31. As an Admin, I want login rate limits that a client cannot bypass by changing headers, so that brute force is actually slowed.
32. As an Admin, I want a missing client IP never to put every user in one bucket, so that one attacker cannot lock out my household.
33. As an Admin behind a reverse proxy, I want forwarded client IPs trusted only when I enable `TRUST_PROXY`, so that a direct request cannot spoof them.
34. As an Admin, I want the rate-limit store bounded, so that a flood of distinct keys cannot exhaust memory.
35. As an Admin, I want state-changing requests made with a cookie rejected when they come from another origin, so that a sibling subdomain cannot forge requests.
36. As an Admin, I want security headers (CSP, frame-ancestors, nosniff, HSTS when served over HTTPS) on every response, so that the browser protects my users.
37. As an Admin, I want the image proxy to serve only image content types, so that it cannot be used to serve script.
38. As an Admin, I want the TMDb key test available only to an authenticated Admin, so that it is not an open oracle.
39. As an Admin, I want collection keys validated before they go into Plex URLs, so that user input cannot reshape Plex requests.
40. As an Admin, I want a failed setup to leave no stale Admin flags behind, so that a half-finished setup cannot be hijacked.

### Admin: operations

41. As an Admin, I want Decidarr on supported Node and Next.js versions, so that I receive security patches.
42. As an Admin, I want the Docker image built without local secrets or dev files, so that the image leaks nothing.
43. As an Admin, I want the documented Docker Compose setup to publish the app only where I intend, so that it is not exposed on every interface by accident.
44. As an Admin, I want the README and security docs to describe v2 behaviour accurately, so that I can operate it safely.

### Mobile user

45. As a mobile user, I want Spin to return a result, so that the app's core loop works.
46. As a mobile user, I want the app and server to share one definition of every request and response, so that a server change cannot silently break the app.
47. As a mobile user, I want the same pool and the same exclusions on mobile as on web, so that a spin means the same thing everywhere.

### Contributor

48. As a contributor, I want a new API route to declare its access level and input contract in one place, so that I cannot forget authentication or validation.
49. As a contributor, I want one error-to-status mapping, so that 401, 403, and integration errors are consistent across routes.
50. As a contributor, I want all user-data writes to go through one module, so that a rule added there applies to REST, sync, and import alike.
51. As a contributor, I want one place that reads library items, so that a per-user visibility fix is a one-place change.
52. As a contributor, I want production code never to import test helpers, so that test fakes cannot ship.
53. As a contributor, I want outbound HTTP to accept an injected fetch, so that tests can fake integrations without monkey-patching.
54. As a contributor, I want the dead helpers, aliases, types, and dependencies listed in the analysis removed, so that the codebase holds only live code.
55. As a contributor, I want a REST-versus-sync parity suite, so that the two write paths cannot diverge again.
56. As a contributor, I want a pool-count-versus-spin parity suite, so that the count shown always matches what Spin can pick.

## Implementation Decisions

### Scope and sequencing

- One spec covers security and the reusable core.
  Security fixes land through the new modules wherever a module owns the behaviour.
- "Reusable core" means deep modules inside the server application, reused by web routes, the mobile sync API, and imports, plus a shared contracts package used by web and mobile.
  It is not a separately published package and has no host-independence goal.
- The runtime upgrade happens first, so that new modules are written once against the new framework APIs.
- Live bugs 1, 2, 4, and 7 are fixed here.
  Bugs 3, 5, and 6 are left to product work.

### Constraints

- Decidarr runs as one container with one Node process plus MongoDB.
  In-process state (rate-limit store, migration guard) is acceptable.
  Horizontal scaling is not supported.
  This deserves an ADR.
- Existing MongoDB data is preserved through non-destructive, idempotent migrations.
- The mobile API (auth and sync) carries no backward-compatibility promise.
  No released build exists, so it may change shape freely.

### Trust model

- The Admin is trusted with the server and the integration keys, but not with Friends' plex.tv account tokens.
- A Friend is trusted with their own data and their own Plex view only.
- Everyone else on the network is untrusted.
- Internet exposure behind a TLS reverse proxy is a supported deployment.

### Request-handling module

- Each route is declared with an access level (public, user, admin), an optional body contract, an optional query contract, and an optional rate-limit policy.
  The handler receives a validated Session and parsed input.
- Session seam: a cookie adapter and a bearer adapter both produce the same Session (user id, admin flag, Plex server access, origin of credential).
  Nothing downstream reads cookies or the legacy single-user id.
- One error table maps domain errors (unauthenticated, forbidden, validation, not found, conflict, rate limited, integration unavailable, integration rejected) to status codes and a stable error code in the body.
- Cookie-authenticated unsafe methods require a same-origin Origin header (or Referer fallback).
  Bearer requests are exempt.
- Session tokens are verified with a pinned algorithm.
- The database connection is established by the module, not by each handler.
- The deprecated auth helpers, the cookie-only user lookup, and the single-user fallback are deleted once all routes have moved over.

### Shared API contracts

- The contracts package owns every request and response shape used by web or mobile, defined once with runtime validators from which the static types are inferred.
  Recommended: zod.
- The web's duplicate shared types and the hand-written fetch wrappers are replaced by a client built from the contracts with a transport adapter (web: cookie fetch; mobile: bearer fetch with automatic refresh).
- The mobile access token is refreshed before expiry and on a 401, with one retry, and the user is signed out only when refresh fails.

### User-data store

- One module owns preferences, watched state, and spin history.
  Each write validates, applies sanitizers, enforces rules (Admin-only manual watched, history retention limit), persists, and emits a sync change atomically from the caller's point of view.
- The REST routes, the sync mutation applier, and Tautulli import all call this module.
  The sync applier keeps only mutation bookkeeping (idempotency by mutation id, base-revision conflict detection) and delegates the write.
- The spin-history revision lookup uses the server-assigned id.
- The three copies of spin-history preference logic collapse into this module.

### Library item store

- Item metadata and enrichment stay shared per server and library, so enrichment work is not repeated.
- Visibility is per user: each user's set of visible item keys is fetched with that user's own Plex server access token and stored separately.
  Every read intersects shared items with the requesting user's visible set.
- A refresh triggered by one user updates only that user's visible set and the shared metadata, never another user's visibility.
- All existing direct cache reads (seven call sites, including facets and filter options) go through this module.
- The no-op copy-back loop is removed.
- The seam is shaped so a normalized storage adapter can be added later.
  Only the existing embedded storage is implemented in this spec.

### Selection pool

- The pool is loaded for a Session and request parameters, and it exposes `pick` and `breakdown` over one predicate list.
  Spin and pool count both use it.
- The server records spin history when it picks, through the user-data store.
  Clients stop recording history themselves.
- The duplicate filter helpers and aliases are removed.

### Integration client

- One client per integration is created from a base URL, an auth strategy, a timeout, and a URL policy, with an injectable fetch.
- At connect time, the client resolves the host and checks every resolved address against the policy.
  It then connects to the checked address (pinning), so a second DNS answer cannot redirect it.
- Redirects are never followed automatically.
  A redirect is surfaced as an integration error, and credentials are never sent to a redirect target.
- Blocked ranges add 100.64.0.0/10, 198.18.0.0/15, 224.0.0.0/4, and 240.0.0.0/4 to the existing list.
  IPv4-mapped IPv6 is normalized first.
  The private-address opt-in still covers RFC 1918 and loopback only.
- All integrations (Plex server, plex.tv, Tautulli, Overseerr, TMDb) use it, and the five fetch-with-timeout copies are removed.
- The production import of test mocks is removed.

### Plex identity and tokens

- At sign-in, Decidarr uses the plex.tv account token once to fetch the user's resources and keeps only the access token for the configured server (matched by machine identifier), encrypted.
- A Friend's account token is discarded after sign-in.
  The Admin's account token is kept because listing Friends needs it.
- All Plex server calls, including the image proxy, use the requesting user's server access token.
- An existing install upgrades by exchanging each stored account token for a server access token, then discarding Friends' account tokens.
  A user whose exchange fails is asked to sign in again.
  Their data is not touched.
- Each install generates its own Plex client identifier at first start and uses it in every plex.tv call.
- The legacy settings-level Plex token is migrated away and removed.

### Sessions and tokens

- Web logout increments the user's session version.
- Web sessions keep sliding refresh, but have an absolute lifetime of 30 days from sign-in.
- Mobile refresh-token rotation is a single atomic swap.
  Presenting an already-rotated token revokes that token family.
- Un-approving a Friend revokes all of their refresh tokens and increments their session version.

### Secrets

- `DECIDARR_SECRET` must be present and at least 32 characters, and this is checked at boot.
- Keys are derived with HKDF from the secret, with separate keys per purpose.
- AES-256-GCM uses an explicit 16-byte auth tag and AAD that binds each ciphertext to its record type, record id, and field.
  Ciphertext is versioned, and values in an older version are re-encrypted on successful read.
- A value that fails to decrypt is marked as needing re-entry and reported to the Admin.
  Nothing is ever wiped automatically.
- The migration guard is a single in-process promise shared by concurrent callers.

### Rate limiting

- Client identity comes from the forwarded header only when `TRUST_PROXY` is enabled.
  Otherwise client-supplied headers are ignored.
- Limits are keyed on what is being attacked (the PIN or session being polled, the setup secret) as well as on client identity when it is known.
  There is no shared "unknown" bucket.
- A global ceiling per endpoint is set well above household usage.
- The store has a size bound with oldest-first eviction.

### Tautulli import

- Tautulli history is matched only on the Plex user id.
  The friendly-name match and the fallback to the Admin's username are removed.
- Imported plays go through the user-data store, so they emit sync changes.

### Hardening and operations

- Security headers are set for every response: CSP, frame-ancestors none, nosniff, referrer policy, and HSTS when served over HTTPS.
- The image proxy only passes allowlisted image content types.
- Add a docker ignore file.
  Compose publishes on a configurable bind address.
- CI uses least-privilege permissions and SHA-pinned actions.
- Internal URLs are stripped from Friend-facing responses.
- The TMDb key test requires the Admin.
- Collection keys are validated.
- Admin flags from a failed setup are rolled back.
- Mobile code-exchange gaps from the audit are closed.
- Unused dependencies, types, and dead helpers listed in the analysis are removed alongside the module that replaces them.

## Testing Decisions

- A good test drives the system from its public surface and asserts observable outcomes: status codes, response bodies, persisted state, and outbound requests.
  It does not assert which internal function was called.
- **Primary seam: the API route handlers.** Each handler is invoked in-process with a Request against a real test MongoDB.
  This is the existing pattern in the API test suite, which uses route imports, seeded settings and users, and session helpers.
  All security behaviour is proven here: isolation, revocation, rate limiting, parity, and per-user visibility.
- **The fake at that seam is the injected fetch on the integration client.** Tests script Plex, plex.tv, Tautulli, Overseerr, and TMDb responses and assert what was sent:
  - which token was used;
  - that no redirect was followed;
  - that blocked addresses were refused at connect time, with DNS resolution injectable.
  This replaces the current Plex mock service that production imports.
- **Second seam: the mobile API client**, tested in the mobile workspace with a fake transport against the shared contracts.
  It covers the spin response shape, refresh before expiry, refresh on 401, and sign-out on refresh failure.
- **Parity suites:**
  - Every user-data operation through REST and through a sync mutation must give identical persisted state, sync changes, and rejections.
  - Pool count must equal the number of items Spin can pick for the same parameters and Session.
- **Migration tests** use the existing legacy-install seed: v1 data upgrades without loss, account tokens are exchanged, a decrypt failure flags the value instead of wiping it, and the migration runs once under concurrency.
- **End-to-end:** the existing Playwright setup-and-spin flow stays green after the runtime upgrade, plus a check that security headers are present.
- Modules covered: request handling, user-data store, library item store, selection pool, integration client, Plex identity and tokens, sessions and tokens, secrets, rate limiting, Tautulli import, and the mobile client.
  The sync routes, facet routes, and bearer spin-history calls, which are untested today, get coverage through the primary seam.

## Out of Scope

- Product themes 0-8 from the analysis:
  - background sync and scheduling;
  - multi-user parity features such as Friends marking watched manually or triggering their own Tautulli sync;
  - TV episode mode;
  - Overseerr discovery;
  - mobile Phase A polish beyond bugs 1 and 7, including the unbounded sync loop, the runtime server URL, and the Spin screen hooks bug;
  - decision support, presets, and group rooms.
- Live bugs 3, 5, and 6.
- Deepening candidates 7 (integration settings descriptor) and 8 (web preferences store).
- A normalized library storage adapter (only its seam is prepared).
- Horizontal scaling and shared stores (Redis).
- Backward compatibility for the mobile API.
- A docs truth reset beyond the docs touched by this spec.

## Further Notes

- Round 1 decisions (scope, trust model, data and client compatibility, runtime-first, single process, people terms) were approved on 2026-11-21.
- Also approved with the breakdown: per-user visibility sets in the library item store, discarding Friends' account tokens, a 30-day absolute session lifetime, rate limiting keyed on the target when `TRUST_PROXY` is off, and zod for contracts.
- Recorded decisions: ADR 0001 (single process) and ADR 0002 (per-server Plex tokens).
- Domain vocabulary (Admin, Friend, Pending Friend, Legacy data, Session, Pool, Spin) is defined in `GLOSSARY.md`.
- The baseline is PR #17 (`fm/dc-spec1-port`).
  Issues #1-#8 are the spec #1 tracking issues.
