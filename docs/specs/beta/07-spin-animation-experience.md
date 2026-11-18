# Feature: Spin Animation Experience

## Status

**Partial** — slot machine animation is shipped; alternate variants, reduced-motion, and persisted preference are planned.

## Implementation Snapshot

### Shipped

| Capability | File | Behavior |
|------------|------|----------|
| Slot machine UI | `src/components/SlotMachine.tsx` | Three-reel emoji animation during spin |
| Spin trigger | `SlotMachine` → `dashboard/page.tsx` `handleSpin` | Button calls `onSpin`; disabled when no library, empty pool, or loading |
| Minimum spin duration | `dashboard/page.tsx` | 2000ms minimum before showing result or error |
| Disabled reason copy | `SlotMachine.tsx` | Explains no library, empty pool, loading |
| Pool count display | `SlotMachine.tsx` | Shows matching count when available |

**Animation tech:** Framer Motion + `setInterval` icon cycling on three reels. Icons: 🏆 📺 🍿 🎬 🎭.

**Accessibility (current):** Spin is a button; disabled state has text explanation. No `prefers-reduced-motion` handling yet.

### Deferred (files exist, not wired)

Components under `src/components/animations/` — **not imported anywhere** in the app:

| File | Variant |
|------|---------|
| `animations/slots.tsx` | Alternate slots implementation |
| `animations/roulette.tsx` | Roulette wheel |
| `animations/wheel.tsx` | Prize wheel |
| `animations/plinko.tsx` | Plinko board |

These are candidate implementations for spec 07 target work, not active product surfaces.

### Planned

- `SpinAnimationPlayer` wrapper to switch variants behind one interface.
- `SpinControls` for animation type selection.
- `usePrefersReducedMotion` hook.
- Persisted `animationType` preference on settings/user prefs.
- Keyboard-accessible spin with non-motion completion feedback.

## 1. Data Model Changes

### Current

No animation preference persisted.

### Target

```typescript
type SpinAnimationType = 'slots' | 'roulette' | 'wheel' | 'plinko'

interface SpinPreferences {
  animationType: SpinAnimationType
  reducedMotion?: boolean  // or respect OS preference only
}
```

Add to `Settings.uiPreferences` or `User.preferences` when persistence is implemented.

## 2. API Contract

### Current

No animation-specific API.

### Target (if preference persisted)

| Method | Path | Purpose |
|--------|------|---------|
| GET/PATCH | `/api/users/me/preferences` or `PUT /api/settings` | Read/update `animationType` |

## 3. Frontend Changes

### Shipped UX rules

- Spin action is a clear button.
- Disabled when: no library (`no_library`), empty pool (`empty_pool`), loading (`loading`).
- Result reveal waits minimum spin time; API errors shown after minimum time elapses.
- Pool count visible during eligible spin state.

### Target UX rules

- Respect `prefers-reduced-motion`: skip intense animation; keep text/status feedback.
- Do not use motion as the only signal that spin started/finished.
- Mobile layout must not overflow (audit current dashboard at 375px width).
- All variants share props: `{ onSpin, spinning, disabled, disabledReason, poolCount }`.

### Target components

- `SpinAnimationPlayer.tsx` — selects variant from preference or default `SlotMachine`.
- `SpinControls.tsx` — animation picker (settings or inline).
- Wire existing `animations/*` behind player interface.

## 4. Acceptance Criteria

### Shipped

- [x] Slot machine behavior works on dashboard.
- [x] Spin button disabled for no-library, empty-pool, loading states.
- [x] Minimum spin time before result/error reveal.

### Target

- [ ] Animation variants share one external interface.
- [ ] Reduced-motion mode avoids intense animation but preserves feedback.
- [ ] Keyboard user can trigger spin and reach result actions.
- [ ] Mobile layout does not overflow.
- [ ] Optional: persisted animation preference.

## 5. Edge Cases

- API returns quickly → still wait `minSpinTime`.
- API fails after animation started → show error after minimum time.
- User changes filters during spin → spin in flight uses snapshot at start (current behavior).
- `prefers-reduced-motion: reduce` → skip reel intervals (target).
- Pool goes to zero while controls visible → disable spin on next pool-count update.
- Component unmount during timers → `SlotMachine` clears intervals on cleanup (shipped).

## 6. Dependency Map

**Shipped:**

- `src/components/SlotMachine.tsx`
- `src/app/dashboard/page.tsx`

**Create (target):**

- `src/components/SpinAnimationPlayer.tsx`
- `src/components/SpinControls.tsx`
- `src/components/animations/usePrefersReducedMotion.ts`

**Modify (target):**

- `src/components/animations/*` — align props interface
- `src/components/SettingsModal.tsx` — animation preference
- `Settings.uiPreferences` or preferences API

**Depends on:**

- Spec 03 selection state (`spinning`, `disabled`, `poolCount`)
- Spec 05 preferences if persistence added

## 7. Migration Plan

1. ~~Ship `SlotMachine` with minimum spin time.~~ Done.
2. Extract shared `SpinAnimationProps` interface from `SlotMachine`.
3. Add `usePrefersReducedMotion`; short-circuit `startSpinning` when reduce preferred.
4. Implement `SpinAnimationPlayer` defaulting to `SlotMachine`.
5. Wire one alternate variant (e.g. `roulette.tsx`) behind feature flag or preference.
6. Add settings control for `animationType`.

## 8. Verification

**Automated:**

- `tests/components/SlotMachine.test.tsx` — disabled states, spin callback

**Gaps:** reduced-motion, variant switching, mobile overflow.

**Manual:**

- Dashboard spin smoke on desktop and 375px viewport.
- Emulate `prefers-reduced-motion` when implemented.
- Screen recording per variant when wired.

## Agent Activation

- **Lead agent:** `Frontend Developer`
- **Pair agent:** `UX Architect`
- **QA gate:** `Evidence Collector`; accessibility changes add `Accessibility Auditor`
- **Activation mode:** `paired`
- **When to activate pair:** new variants, reduced-motion, preference persistence, mobile layout
- **Context pack:** this spec, [current-feature-inventory.md](../current-feature-inventory.md), `SlotMachine`, `animations/*`, dashboard
- **Expected handoff:** screenshots/video, reduced-motion notes, keyboard accessibility notes
- **Do not activate:** `Backend Architect` unless preference API is in scope
