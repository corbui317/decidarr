# Feature: Shared API Request Validation

## Status

`Done`

## What & Why

Selection, pool-count, watched, and preference routes accept loosely typed JSON bodies. Invalid `mediaType`, malformed `filters.collections`, or bad watched payloads can produce 500 errors or silently empty results instead of actionable 400 responses. A shared validation layer improves correctness, API testability, and maintainability for client and server.

## User Outcomes

- As a **client developer**, I want invalid API payloads to return `400` with a clear error message so I can fix requests without debugging server logs.
- As a **user**, I want the app to never show a generic failure when my filter payload is malformed.

## Non-Goals

- Adding Zod as a dependency (prefer lightweight validators unless team decides otherwise).
- Validating every route in Decidarr in one pass — scope is selection, watched, and high-traffic write routes listed below.
- OpenAPI/Swagger generation.

## Implementation Snapshot

### Current

Routes parse `request.json()` and use partial checks:

- `src/app/api/selection/random/route.ts` — checks `libraryIds` length only
- `src/app/api/selection/pool-count/route.ts` — checks `libraryIds` length only
- `src/app/api/watched/[plexId]/route.ts` — minimal validation
- Settings/preferences routes — ad hoc checks

### Target

Central validators in `src/lib/validation/` used by routes and testable in isolation.

## 1. Data Model Changes

None.

## 2. API Contract

### Shared types (create `src/lib/validation/selection.ts`)

```typescript
export type MediaType = 'movie' | 'show';

export interface SelectionRequestBody {
  libraryIds: string[];
  mediaType: MediaType;
  filters?: Filters; // reuse from @/types/filters
  tvSelectionMode?: 'show' | 'episode';
}

export function parseSelectionRequestBody(
  body: unknown
): { ok: true; data: SelectionRequestBody } | { ok: false; error: string };
```

### Validation rules

| Field | Rule | Error example |
|-------|------|---------------|
| `libraryIds` | Required array of non-empty strings | `"libraryIds must be a non-empty array"` |
| `mediaType` | `'movie'` or `'show'` only | `"mediaType must be 'movie' or 'show'"` |
| `filters` | If present, must be object; known keys type-checked | `"filters.collections must be an array of strings"` |
| `filters.collections` | Array of strings | |
| `filters.unwatchedOnly` | Boolean if present | |
| `filters.yearMin` / `yearMax` | Numbers if present | |
| `tvSelectionMode` | `'show' \| 'episode'` when `mediaType === 'show'` | |

### Watched payload (`src/lib/validation/watched.ts`)

| Field | Rule |
|-------|------|
| `mediaType` | `'movie' \| 'show' \| 'episode'` |
| `title` | Non-empty string |
| `plexId` (path) | Non-empty string |

### Routes to update

| Method | Path | Validator |
|--------|------|-----------|
| POST | `/api/selection/random` | `parseSelectionRequestBody` |
| POST | `/api/selection/pool-count` | `parseSelectionRequestBody` |
| POST | `/api/watched` | `parseWatchedCreateBody` |
| DELETE | `/api/watched/[plexId]` | `plexId` param non-empty |
| PATCH | `/api/user/preferences` | `parsePreferencesBody` (if not already strict) |

### Error response shape

```typescript
// 400
{ "error": "mediaType must be 'movie' or 'show'" }
```

Never return stack traces or internal field names beyond the validation message.

## 3. Frontend Changes

### `src/lib/api.ts`

- Types for selection/watched requests should import from shared validation types.
- Client should not send invalid payloads; no UI change required unless error messages are surfaced.

### Optional

Map `400` validation errors to user-visible toast/message on spin failure (low priority).

## 4. Acceptance Criteria

### Target

- [x] Invalid `mediaType` on pool-count returns `400`, not `500`.
- [x] `filters.collections: "not-an-array"` returns `400`.
- [x] Empty `libraryIds` on random selection returns existing `400` (unchanged message).
- [x] Valid payloads behave identically to pre-validation behavior (regression tests).
- [x] Validators are pure functions with unit tests; routes only call parser and branch on `ok`.

## 5. Edge Cases

- `filters: null` → treat as `{}` or `400` (choose `{}` for backward compatibility; document).
- Unknown filter keys → ignore (forward compatible) unless they are wrong type.
- `libraryIds` with duplicates → allow; dedupe optional, not required.
- Very large `libraryIds` arrays → no special limit in this spec.

## 6. Dependency Map

**Modify:**

- `src/app/api/selection/random/route.ts`
- `src/app/api/selection/pool-count/route.ts`
- `src/app/api/watched/[plexId]/route.ts`
- `src/app/api/watched/route.ts` (if separate create route)
- `src/lib/api.ts`

**Create:**

- `src/lib/validation/selection.ts`
- `src/lib/validation/watched.ts`
- `src/lib/validation/preferences.ts` (if needed)
- `tests/unit/lib/validation/selection.test.ts`
- `tests/unit/lib/validation/watched.test.ts`
- `tests/api/selection-validation.test.ts`

**Depends on:**

- [01-correctness-quick-fixes](./01-correctness-quick-fixes.md) (can land in parallel)
- [beta/03-selection-filters-command-center.md](../beta/03-selection-filters-command-center.md)

## 7. Rollout / Migration Plan

1. Add validators + unit tests (no route changes).
2. Wire pool-count and random routes; add API tests for 400 cases.
3. Wire watched routes.
4. Align client types in `src/lib/api.ts`.

## 8. Verification

**Automated:**

- `npm run test -- tests/unit/lib/validation`
- `npm run test -- tests/api/selection`

**Manual:**

- `curl -X POST /api/selection/pool-count -d '{"libraryIds":["1"],"mediaType":"invalid"}'` → 400

## 9. Task Handoff

- **Backlog ID:** `DECIDARR-REMED-02`
- **First safe task:** `parseSelectionRequestBody` + unit tests only
- **Review boundary:** No new npm dependencies without ADR
- **Evidence:** API tests for each 400 case listed in acceptance criteria

## Agent Activation

- **Lead agent:** Senior Developer
- **Pair agent:** API Tester for negative-case matrix
- **Activation mode:** solo after validators exist
