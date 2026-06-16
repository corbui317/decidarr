# Feature: <Name>

## Status

`Draft | Ready | In Progress | Shipped | Partial | Planned | Deferred`

Use **Shipped** when the behavior is implemented and observable. Use **Partial** when core behavior exists but known gaps remain. Use **Planned** when the behavior is spec'd but not on disk. Use **Deferred** when the idea is intentionally out of current scope.

## What & Why

One short paragraph explaining the user problem, the product outcome, and why this belongs in Decidarr now. Keep this about behavior and value, not implementation tasks.

## User Outcomes

- As a `<user/admin/system>`, I want `<capability>` so that `<outcome>`.
- As a `<user/admin/system>`, I want `<capability>` so that `<outcome>`.

## Non-Goals

- `<Explicitly excluded behavior, platform, integration, or workflow>`
- `<Future idea that needs a separate spec or ADR>`

## Implementation Snapshot

Document what is shipped, partial, planned, or deferred. Link to `current-feature-inventory.md` for file, route, model, and test cross-references. For beta specs in `docs/specs/beta/`, use `../current-feature-inventory.md`.

### Current / Shipped

| Capability | UI | API / Logic | Status |
|------------|----|-------------|--------|
| `<capability>` | `src/...` | `/api/...` or `src/lib/...` | `Shipped/Partial/Planned` |

### Known Gaps

- `<Gap between current behavior and target behavior>`
- `<Important docs/code mismatch, if any>`

### Target / Future

- `<Target behavior after this spec is complete>`
- `<Follow-up behavior intentionally left for a later task>`

## 1. Data Model Changes

Describe MongoDB/Mongoose model changes, indexes, persisted fields, TTL behavior, encryption requirements, privacy rules, and migration/backfill needs.

If no model changes are required, state that explicitly.

```typescript
interface ExampleModelOrPayload {
  id: string
}
```

## 2. API Contract

Document routes, methods, auth requirements, request bodies, responses, errors, and idempotency. Use TypeScript interfaces for payloads when useful.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/...` | `Public/Session/Admin` | `<purpose>` |

### Request / Response Rules

- `<Validation rule>`
- `<Error status and message behavior>`
- `<Secret/token/logging rule>`
- `<Idempotency rule, if writes are involved>`

## 3. Frontend Changes

Document pages, components, state transitions, copy, layout, accessibility requirements, loading states, empty states, and mobile/responsive expectations.

### Current / Shipped

- `<Existing screen/component/behavior>`

### Target

- `<New or changed screen/component/behavior>`
- `<Accessibility, reduced-motion, keyboard, focus, or touch requirement>`

## 4. Acceptance Criteria

Write criteria as observable outcomes. Split shipped and target criteria when a spec covers both current state and planned work.

### Shipped / Current

- [ ] `<Already implemented behavior, if this is an audit/update spec>`

### Target

- [ ] User-facing behavior is observable in the UI or API response.
- [ ] API behavior is documented, implemented, and handles expected errors.
- [ ] Empty, loading, unauthenticated, unauthorized, and integration-failure states are handled where relevant.
- [ ] Secrets are encrypted at rest and never returned raw when the feature touches credentials.
- [ ] Accessibility and reduced-motion requirements are addressed when UI changes.
- [ ] Verification evidence is captured before marking complete.

## 5. Edge Cases

List data, auth, integration, network, empty-state, privacy, concurrency, and rollback cases that must not be missed.

- `<Edge case>` -> `<expected behavior>`
- `<Edge case>` -> `<expected behavior>`

## 6. Dependency Map

**Modify:**

- `src/...`

**Create:**

- `src/...`

**Depends on:**

- `<Other specs, services, env vars, product decisions, or ADRs>`

**Blocked by:**

- `<Decision, credential, external service, or implementation dependency>`

## 7. Rollout / Migration Plan

Keep this as sequencing, not a task backlog. Move implementation slices into `docs/tasks/beta/beta-backlog.md` or a task plan when work starts.

1. `<Smallest safe first step>`
2. `<Backfill, migration, or compatibility step if needed>`
3. `<UI/API rollout step>`
4. `<Cleanup, docs, or follow-up step>`

## 8. Verification

List exact commands, API calls, screenshots, smoke checks, or blocker evidence. If a check cannot run locally, say why and name substitute evidence.

**Automated:**

- `npm run lint`
- `npm run build`
- `<specific unit/API/component/e2e test>`

**Manual / Evidence:**

- `<Browser flow, screenshot, API sample, log excerpt, or failure proof>`

**Known test gaps:**

- `<Gap that remains after this feature ships>`

## 9. Task Handoff

Use this section to turn the spec into small implementation work without embedding a full plan.

- **Backlog IDs:** `DECIDARR-<area>-<number>` or `TBD`
- **First safe task:** `<one-branch implementation slice>`
- **Review boundary:** `<what must stay out of the first PR>`
- **Evidence required for done:** `<tests, screenshots, API samples, logs>`

## Agent Activation

- **Lead agent:** `<agent>`
- **Pair agent:** `<agent>`
- **QA gate:** `<agent or evidence>`
- **Activation mode:** `solo | paired | gated | discovery-only`
- **When to activate pair:** `<boundary or risk>`
- **Context pack:** this spec, linked tasks, affected files, env vars, logs/tests, `README.md`
- **Expected handoff:** changed files, evidence, blockers, and remaining risk
- **Do not activate:** `<agents or scopes intentionally out of bounds>`
