# Decidarr Spec-Driven Development

Spec-driven development for Decidarr. This documentation set adapts the Homeify beta workflow to Decidarr's product shape: Plex library discovery, random movie and TV selection, filtering, watch history, integrations, settings, and spin animation UX.

## Operating Model

1. Spec first - every meaningful feature links to `docs/specs/beta/*` and `docs/tasks/beta/beta-backlog.md`.
2. Context pack before code - read the spec, task, dependencies, affected files, expected tests, and agent guidance before implementation.
3. One task at a time - implement a single `DECIDARR-*` task ID unless the user explicitly expands scope.
4. Agent pairing by boundary - add a pair only for UI/API, schema/performance, security/privacy, external integrations, mobile, or AI work.
5. Verification as evidence - tests, screenshots, API output, logs, or a documented blocker must back completion.
6. No fantasy completion - do not claim done when acceptance criteria or verification evidence is missing.

## Preferred Lifecycle

1. Plan - assemble the context pack, confirm task scope, dependencies, agents, and verification.
2. Implement - make the smallest scoped change for the task ID.
3. Review - run relevant QA gate, code review, API checks, security checks, or evidence checks.
4. Fix issues found - address review/QA findings, rerun verification, then mark complete.

## Directory Map

| Directory | Purpose |
|-----------|---------|
| `docs/specs/` | Product and technical specs. Specs define behavior, contracts, acceptance criteria, dependencies, and migration plans. |
| `docs/tasks/` | Task backlog and implementation plans. Tasks convert specs into small reviewable work units. |
| `docs/agents/` | Agent activation matrix, workflow, pairing rules, and handoff prompts. |

## Reading Order

1. `docs/specs/beta/00-beta-roadmap.md` - scope, sequencing, non-goals.
2. `docs/specs/beta/01-setup-auth-user-access.md` and `02-library-data-foundation.md` - foundations.
3. `docs/specs/beta/03-selection-filters-command-center.md` - core roulette experience.
4. `docs/specs/beta/04-watch-history-tautulli.md`, `05-integrations-settings-operations.md`, and `06-overseerr-request-flow.md` - integrations.
5. `docs/specs/beta/07-spin-animation-experience.md` - UX polish with accessibility constraints.
6. `docs/specs/beta/09-spin-history-settings.md` - spin history and user-adjustable retention settings.
7. `docs/specs/beta/08-mobile-pwa-later.md` - deferred mobile/PWA direction.
8. `docs/tasks/beta/beta-backlog.md` - task IDs and implementation order.
9. `docs/agents/decidarr-agent-workflows.md` - agent activation and handoff rules.

## Spec Template

Use `docs/specs/spec-template.md` for every new spec. Keep specs product-focused and implementation-ready, not a running chat log.
