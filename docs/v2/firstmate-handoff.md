# Firstmate handoff: decidarr v2 (spec #18, tickets #19-#35)

Paste everything below the line into firstmate (run `claude` in `~/firstmate`), or tell it: "read and execute `docs/v2/firstmate-handoff.md` on branch `v2-planning` of corbui317/decidarr".

---

Ahoy. Here is a body of work for the crew: decidarr v2 security hardening on a reusable core.

## Project

- Repo: `https://github.com/corbui317/decidarr`. Register it if it is not registered yet.
- Mode: `direct-PR`, with ship branches under `fm/`.
- Planning branch: `v2-planning`. It contains PR #17 (`fm/dc-spec1-port`, still open) plus the v2 planning docs.
  `main` is stale, so do not branch from it.
- Integration branch: create `fm/spec-18-integration` from `origin/v2-planning`.
  Every ticket PR targets `fm/spec-18-integration`, never `main`.
  This is the same pattern as spec #1 (`fm/spec-1-integration`).
- Ticket branch names: `fm/dc-v2-<issue>-<slug>`, for example `fm/dc-v2-19-runtime`.

## Identity (hard rule)

Every git and GitHub action is done as `corbui317 <corbui317@gmail.com>`, never as `Corey Bui <haibui1@meta.com>`.
That covers commits, merges, pushes, PRs, issue comments, reviews, and issue closes.

- I authorize setting repo-local identity in the decidarr clone (and so in every worktree made from it): `git config user.name corbui317` and `git config user.email corbui317@gmail.com`.
- Before the first push, confirm that `gh auth status` shows `corbui317` as the active account.
  If it does not, stop and ask me.
- Check `git log -1 --format='%an <%ae> %cn <%ce>'` on each ticket branch before opening its PR.
- No AI attribution anywhere: no `Co-Authored-By` trailers, no "Generated with" lines in commits or PR bodies.
- No em dashes or en dashes in any commit message, PR body, comment, code comment, or doc. Use a plain hyphen.

## What every crewmate must read first

- Spec issue #18 (the source of truth), and its own ticket issue.
- In the repo, on the integration branch:
  - `GLOSSARY.md`: use its terms (Admin, Friend, Pending Friend, Legacy data, Session, Pool, Spin).
  - `docs/adr/0001-single-process.md` and `docs/adr/0002-per-server-plex-tokens.md`.
  - `docs/v2/analysis.md`: the audit behind the tickets, with file and line pointers.
  - `AGENTS.md`: the repo rules.

## Rules for every ticket

- If the ticket fixes a bug, first reproduce it with a failing test at the highest seam available (end to end where practical, otherwise the API route test), and only then fix it.
- The test seams are fixed by the spec:
  - Primary: API route handlers called in-process against the real test MongoDB, as in the existing API test suite.
  - The fake at that seam is the injected fetch (and DNS lookup) on the integration client, once #26 lands.
  - Mobile: the API client with a fake transport, in the mobile workspace.
- Test external behaviour, not implementation details.
- Each ticket updates the docs it touches and deletes the dead code it replaces.
  There is no separate docs ticket.
- Lint, typecheck, unit, API, and build must be green, plus Playwright where the ticket touches user flows.
  Fix flaky or failing tests you run into, even when another ticket caused them.
- When a PR is ready, tick the acceptance-criteria checkboxes in the issue that are actually met and link the PR.
  After the PR merges into `fm/spec-18-integration`, comment with the merge SHA and close the issue.
  Native GitHub blocked-by links then unblock the next tickets.
- A criterion that cannot be met as written is a decision for me.
  Escalate it rather than changing scope.
  The same goes for anything that would contradict spec #18 or an ADR.

## Tickets and dependencies

The blocked-by links are already set natively on GitHub.
This table is for planning waves.

| Issue | Title | Blocked by |
|---|---|---|
| #19 | Upgrade to Node 24 and the current Next.js major; enforce DECIDARR_SECRET at boot | - |
| #20 | Request-handling module and Session seam, starting with spin history | #19 |
| #21 | Move user-facing routes onto the request-handling module | #20 |
| #22 | Move admin, settings, auth, mobile, and sync routes onto the request-handling module | #20 |
| #23 | Remove the old auth helpers and the single-user fallback | #21, #22 |
| #24 | Shared API contracts with runtime validation and a typed client for web and mobile | #20 |
| #25 | User-data store shared by REST, sync, and import, with a REST-vs-sync parity suite | #24 |
| #26 | Integration HTTP client with connect-time URL policy and no credentialed redirects | #19 |
| #27 | Per-server Plex access tokens, discarded Friend account tokens, and a per-install Plex client id | #26 |
| #28 | Library item store with per-user visibility | #21, #27 |
| #29 | Selection pool with server-recorded spin history and a count-vs-spin parity suite | #25, #28 |
| #30 | Login rate limiting that cannot be spoofed, with a bounded store | #20 |
| #31 | Revocable sessions: logout, absolute lifetime, atomic refresh rotation, un-approve revokes all | #22 |
| #32 | Secrets hardening: never wipe on decrypt failure, HKDF, AAD, versioned ciphertext | #19 |
| #33 | Security headers, image content-type allowlist, Docker and CI hardening | #19 |
| #34 | Tautulli import matches only on Plex user id and goes through the user-data store | #25, #26 |
| #35 | Close the remaining low-severity findings | #22 |

Waves (each wave can run in parallel once the one before it has merged):

1. #19 alone. Everything else depends on the runtime upgrade.
2. #20, #26, #32, #33.
3. #21, #22, #24, #27, #30.
4. #23, #25, #28, #31, #35.
5. #29, #34.

Notes on overlap:

- #21 and #22 are the two migrate batches of an expand-contract refactor.
  #20 is the expand step and #23 is the contract step.
  #21 and #22 touch different routes, so run them in parallel.
- #27 and #32 both touch encrypted fields on the user record.
  They don't block each other, but whichever lands second must rebase onto the other's ciphertext format.
- #25 and #34 both touch the Tautulli import path.
  #34 is already blocked by #25.

## Finish

1. When #19-#35 are all closed, run one whole-branch review of `fm/spec-18-integration` against spec #18.
   Fix the findings in a single review-fix PR into the integration branch.
2. Then open one PR from `fm/spec-18-integration` to `main`, linking spec #18 and every ticket.
   It can only merge after PR #17 merges.
   If #17 is still open, open the v2 PR as a draft, say so in its body, and tell me.
3. Do not merge anything into `main` without my explicit approval.
   Merges into `fm/spec-18-integration` are fine once CI is green and the ticket's criteria are met.

## Report back

For each wave, tell me which PRs are ready, what risk each carries, and the CI status.
Stop and ask me about any product or security decision the spec does not settle.
