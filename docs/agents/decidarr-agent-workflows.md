# Decidarr Agent Workflows

Agent activation reference for Decidarr delivery. Uses context engineering plus spec-driven development with Decidarr-native agents and tasks.

## Operating Model

1. Spec first - work links to `docs/specs/beta/*` and `docs/tasks/beta/beta-backlog.md`.
2. Context pack before code - read the spec, task, dependencies, affected files, expected tests, `README.md`, and relevant prior plans.
3. One task at a time - implement a single `DECIDARR-*` ID unless scope is explicitly expanded.
4. Agent pairing by boundary - add a pair only for UI/API, schema/perf, security/privacy, external integration, mobile, AI, or product sequencing.
5. Verification as evidence - tests, API output, screenshots, logs, or documented blockers.
6. No fantasy completion - do not claim done without acceptance criteria met or blockers recorded.

## Preferred Lifecycle

1. Plan - assemble context pack, confirm scope, dependencies, agents, and verification.
2. Implement - make the smallest scoped change for the task ID.
3. Review - run relevant QA gate, code review, API check, security check, or evidence check.
4. Fix issues found - address findings, rerun verification, then mark complete.

## Default Flow

### 1. Select Task

Pick one row from `docs/tasks/beta/beta-backlog.md`.

Confirm:

- Task ID and status.
- Owning spec.
- In-scope files.
- Out-of-scope files.
- Expected verification.

### 2. Assemble Context Pack

Read:

- Owning spec.
- Linked tasks/backlog row.
- Existing plan in `docs/tasks/beta/plans/` if present.
- `README.md`, `package.json`, and relevant source files.
- Adjacent specs if dependencies are listed.

Write down:

- Current behavior.
- Desired behavior.
- API/data contracts.
- Edge cases.
- Verification plan.

### 3. Choose Agents

Use one lead. Add pairs only when needed.

| Task Type | Lead | Pair | QA Gate |
|-----------|------|------|---------|
| Auth/session/OAuth | Backend Architect | Security Engineer | API Tester |
| Settings/secrets/URL validation | Security Engineer | Backend Architect | API Tester |
| Library cache/TMDb enrichment | Backend Architect | Database Optimizer | API Tester |
| Selection/filter parity | Backend Architect | Frontend Developer | API Tester |
| Dashboard/result UI | Frontend Developer | UX Architect | Evidence Collector |
| Tautulli sync | Backend Architect | API Tester | Test Results Analyzer |
| Overseerr | Backend Architect | API Tester | Security Engineer |
| Spin animations | Frontend Developer | UX Architect | Accessibility Auditor |
| Mobile/PWA | Mobile App Builder | UX Architect | Evidence Collector |
| Roadmap/scope | Product Manager | Software Architect | Reality Checker |
| Documentation | Technical Writer | Product Manager | Code Reviewer |

### 4. Implement

Implementation rules:

- Keep branch and commit scope aligned to the selected task.
- Prefer local patterns already present in `src/app/api`, `src/lib/models`, `src/lib/services`, and components.
- Avoid new abstractions until two or more call sites prove the need.
- Do not commit secrets, `.env`, local database dumps, or throwaway test files.
- If unrelated local files exist, exclude them.

### 5. Verify

Minimum verification by boundary:

| Boundary | Evidence |
|----------|----------|
| Docs only | Review generated docs for links, task IDs, and consistency. |
| TypeScript/React | `npm run build` when feasible; screenshots for UI. |
| API routes | Success and failure response samples. |
| Auth/security | Token/secret masking proof and negative auth checks. |
| External APIs | Valid and invalid connection tests; no raw keys in logs/output. |
| Animation/UI | Desktop/mobile screenshot or short recording; reduced-motion notes. |

If verification cannot run:

- State why.
- Record the risk.
- Provide substitute evidence.

## Plan Mode Prompt

Use this when starting a task:

```text
Task: DECIDARR-XX-AREA-##
Spec: docs/specs/beta/<spec>.md

Assemble a context pack before implementation:
- Read the owning spec and backlog row.
- Inspect affected files.
- Identify dependencies and edge cases.
- Define verification evidence.
- Produce a short implementation plan with in-scope and out-of-scope items.
Do not edit code until the plan is complete.
```

## Build Prompt

Use this after a plan is approved:

```text
Implement DECIDARR-XX-AREA-## only.
Follow the plan in docs/tasks/beta/plans/<plan>.md.
Keep changes scoped to the task.
Run or document verification.
Do not include unrelated files.
```

## Review Prompt

Use this before marking a task complete:

```text
Review DECIDARR-XX-AREA-## against:
- Owning spec acceptance criteria.
- Edge cases.
- Verification plan.
- Secret/auth/privacy requirements if applicable.
Return findings first, then residual risk, then evidence.
```

## Handoff Format

Every completed task should report:

- Task ID.
- Spec link.
- Changed files.
- Verification evidence.
- Known gaps or deferred work.
- Whether backlog status should move to `DONE`, `REVIEW`, or `BLOCKED`.

## Blocker Rules

Stop and ask for user/product decision when:

- A spec requires behavior that conflicts with current architecture.
- A task needs credentials or live services that are unavailable.
- User-scoped behavior cannot be determined safely.
- A destructive migration or cache invalidation is required.
- External API behavior is unknown and guessing would create bad UX or security risk.

## Decidarr-Specific Cautions

- Plex, TMDb, Tautulli, and Overseerr keys must remain encrypted or masked.
- Local/private server URLs are normal for Plex/Tautulli/Overseerr, but URL validation must still block unsafe loopback/link-local cases where server-side fetches create SSRF risk.
- Pool count and random selection must not drift.
- Watch history is user-scoped.
- Missing TMDb data should degrade filters/status gracefully.
- Motion-heavy spin UX must respect reduced-motion preferences.
