# Feature: <Name>

## Status

Draft | Ready | In Progress | **Partial** | Complete | Planned | Deferred

Use **Partial** when core behavior ships but known gaps remain. Use **Planned** when spec'd but not on disk.

## Implementation Snapshot

Document what is shipped, partial, and target/future. Link to [current-feature-inventory.md](./current-feature-inventory.md) for file/route/test cross-references.

### Shipped

| Capability | UI | API |
|------------|-----|-----|
| ... | `src/...` | `/api/...` |

### Partial / Planned / Deferred

Brief bullets with explicit gaps vs target behavior.

## 1. Data Model Changes

Describe MongoDB/Mongoose model changes, indexes, persisted fields, TTL behavior, encryption requirements, and migration/backfill needs.

If no model changes are required, state that explicitly.

## 2. API Contract

Document routes, methods, auth requirements, request bodies, responses, errors, and idempotency.

Use TypeScript interfaces for payloads when useful.

## 3. Frontend Changes

Document pages, components, state transitions, copy, layout, accessibility requirements, loading states, and empty states.

## 4. Acceptance Criteria

- [ ] User-facing behavior is observable.
- [ ] API behavior is documented and implemented.
- [ ] Error states are handled.
- [ ] Accessibility and reduced-motion requirements are addressed when UI changes.
- [ ] Verification evidence is captured.

## 5. Edge Cases

List data, auth, integration, network, empty-state, and concurrency cases that must not be missed.

## 6. Dependency Map

**Modify:**

- `src/...`

**Create:**

- `src/...`

**Depends on:**

- Other specs, services, env vars, or product decisions.

## 7. Migration Plan

1. Smallest safe first step.
2. Backfill or compatibility step if needed.
3. UI/API rollout step.
4. Cleanup step.

## 8. Verification

List exact commands, API calls, screenshots, smoke checks, or blocker evidence.

## Agent Activation

- **Lead agent:** `<agent>`
- **Pair agent:** `<agent>`
- **QA gate:** `<agent or evidence>`
- **Activation mode:** `solo | paired | gated | discovery-only`
- **When to activate pair:** `<boundary or risk>`
- **Context pack:** this spec, linked tasks, affected files, env vars, logs/tests, `README.md`
- **Expected handoff:** changed files, evidence, blockers, and remaining risk
- **Do not activate:** `<agents or scopes intentionally out of bounds>`
