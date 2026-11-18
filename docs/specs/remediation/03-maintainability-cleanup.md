# Feature: Maintainability Cleanup (Code Review)

## Status

`Ready`

## What & Why

The codebase has accumulated patterns that will confuse future maintainers: duplicate test files, nested interactive controls, oversized dashboard/modal components, loose type casts, and production `console.log` calls. This spec defines structural cleanup that does not change product behavior, except where a11y fixes correct invalid HTML.

## User Outcomes

- As a **developer**, I want shared API types between client and server so refactors do not rely on `as unknown as` casts.
- As a **developer**, I want components under ~300 lines with clear responsibilities so dashboard and settings are navigable in six months.
- As a **keyboard/screen-reader user**, I want library rows and modals to follow accessible control patterns.

## Non-Goals

- Full SettingsModal visual redesign.
- Removing all logging — structured logger on server; remove noisy client `console.log` only.
- Dashboard feature additions.

## Implementation Snapshot

### Current / Gaps

| Area | File | Issue |
|------|------|-------|
| Duplicate test | `tests/components/SpinControls.test 2.tsx` | Exact duplicate; not matched by vitest glob |
| Nested buttons | `src/components/LibrarySelector.tsx` | Refresh `<button>` inside row `<button>` |
| Large dashboard | `src/app/dashboard/page.tsx` | Pool count, spin, history orchestration in one file |
| Large settings | `src/components/SettingsModal.tsx` | Tab focus trap incomplete; monolithic component |
| Filter a11y | `src/components/FilterPanel.tsx` | Missing `aria-pressed`, `aria-expanded`, input labels |
| MovieCard state | `src/components/MovieCard.tsx` | `watched` state not reset on `item` change; dashboard passes `isWatched={false}` always |
| Client logging | `LibrarySelector.tsx`, others | `console.log` in production paths |
| Docs | — | No `TESTING.md` for contributors |

### Target

Cleanup items below shipped without behavior regression.

## 1. Data Model Changes

None.

## 2. API Contract

None directly. Shared types may live in `src/types/api/`:

```typescript
// src/types/api/selection.ts
export interface SelectionResultResponse {
  selection: SanitizedLibraryItem & { tmdb?: TmdbMatch | null };
  playLinks: PlayLinks | null;
  stats: { totalMatches: number };
  tvSelectionMode?: 'show' | 'episode';
}
```

Reuse in `src/lib/api.ts` and route handlers (with [02-api-validation](./02-api-validation.md)).

## 3. Frontend Changes

### LibrarySelector — sibling controls

Replace nested button pattern:

```
<div role="group" aria-label={section.title}>
  <button onClick={toggle}>...</button>
  <button onClick={refresh} aria-label={`Refresh ${section.title}`}>...</button>
</div>
```

Selection toggle and refresh are siblings; refresh uses `e.stopPropagation()` on its own handler (no parent button).

### Dashboard hooks (after [01](./01-correctness-quick-fixes.md) race fix)

Extract:

- `usePoolCount(selectedLibraries, mediaType, filters)` — debounce, abort, state
- `useSpinFlow(...)` — phase machine, pending result, history record

Keep `dashboard/page.tsx` as composition shell.

### SettingsModal tabs

Split into:

- `src/components/settings/GeneralTab.tsx`
- `src/components/settings/IntegrationsTab.tsx`
- `src/components/settings/AppearanceTab.tsx`
- `src/components/settings/AdminTab.tsx` (if applicable)

Each tab owns loading/saving state. Modal shell handles open/close and tab list.

**Focus trap (target):** Tab cycles within modal; `Escape` closes; initial focus on close button or first tab.

### FilterPanel a11y

- Toggle chips: `aria-pressed={isActive}`
- Accordion sections: `aria-expanded` on trigger
- Year/rating inputs: `htmlFor` + `id` or `aria-labelledby`

### MovieCard watched state

```typescript
useEffect(() => {
  setWatched(isWatched);
  setExpanded(false);
}, [item.plexId, isWatched]);
```

Dashboard: load watched status for result item (API call or pass from selection response if available).

### Remove duplicate test

Delete `tests/components/SpinControls.test 2.tsx`.

### TESTING.md (repo root or `docs/`)

Document:

- `npm run test`, `test:watch`, `test:coverage`, `test:e2e`
- E2E env vars (`E2E_MOCK_PLEX`, `E2E_MONGODB_URI`, `E2E_TEST_RESET_SECRET`)
- Generated artifacts (`.e2e-mongo-uri`, `.e2e-mongo-pid`) and gitignore expectation
- CI job order from `.github/workflows/test.yml`

## 4. Acceptance Criteria

### Target

- [ ] No file named `SpinControls.test 2.tsx` in repo.
- [ ] LibrarySelector passes HTML validator / axe check for nested interactive controls.
- [ ] SettingsModal focus remains inside dialog when tabbing.
- [ ] FilterPanel filter toggles expose `aria-pressed`.
- [ ] MovieCard resets watched UI when `item.plexId` changes.
- [ ] `dashboard/page.tsx` reduced by extracting at least pool-count hook.
- [ ] `TESTING.md` exists and matches actual npm scripts.
- [ ] No new `console.log` added; remove existing ones in touched client files.

## 5. Edge Cases

- LibrarySelector refresh while syncing → refresh button disabled independently of row selection.
- SettingsModal tab switch during save → prevent navigation or await in-flight save (document chosen behavior).
- MovieCard revisit from history without watched API → show unknown/unwatched until loaded.

## 6. Dependency Map

**Modify:**

- `src/components/LibrarySelector.tsx`
- `src/components/FilterPanel.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/MovieCard.tsx`
- `src/app/dashboard/page.tsx`
- `src/lib/api.ts`

**Create:**

- `src/hooks/usePoolCount.ts`
- `src/hooks/useSpinFlow.ts` (optional second slice)
- `src/components/settings/*.tsx`
- `src/types/api/*.ts`
- `TESTING.md` or `docs/TESTING.md`

**Delete:**

- `tests/components/SpinControls.test 2.tsx`

**Depends on:**

- [01-correctness-quick-fixes](./01-correctness-quick-fixes.md) — pool-count hook after race fix
- [04-test-infrastructure](./04-test-infrastructure.md) — TESTING.md references e2e setup

## 7. Rollout / Migration Plan

1. Delete duplicate test; add TESTING.md.
2. LibrarySelector a11y fix + component test update.
3. FilterPanel a11y attributes.
4. Extract `usePoolCount` from dashboard.
5. MovieCard state fix + watched status wiring.
6. SettingsModal tab split (largest PR — do last).

## 8. Verification

**Automated:**

- `npm run test -- tests/components/LibrarySelector`
- `npm run test -- tests/components/FilterPanel` (add if missing)
- `npm run lint`

**Manual:**

- Keyboard-only: tab through library list and settings modal.
- axe DevTools on dashboard with library selected.

## 9. Task Handoff

- **Backlog IDs:** `DECIDARR-REMED-03a` (hygiene), `03b` (a11y), `03c` (hooks), `03d` (settings split)
- **First safe task:** Remove duplicate test + TESTING.md
- **Review boundary:** Settings split is one PR; do not mix with library normalization

## Agent Activation

- **Lead agent:** Senior Developer
- **Pair agent:** UX Architect or accessibility-auditor for a11y PRs
- **Activation mode:** paired for SettingsModal focus trap
