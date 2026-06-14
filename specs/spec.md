# Spec: Animation System

## What & Why
Refactor the existing slot machine animation into a shared `SpinAnimation` interface and add three new animation variants: Roulette Wheel, Wheel of Fortune, and Plinko. All animations are selectable in Settings including a "Random" mode. Users can configure animation speed and skip any animation mid-play. All animations reveal the result via the existing MovieCard.

---

## User Stories

### US-1: Refactor existing slot machine into shared interface
As a developer, I want the existing slot machine animation to implement a shared `SpinAnimation` interface so that all animation variants are interchangeable and maintainable.

**Acceptance criteria:**
- GIVEN the refactor is complete, WHEN a new animation is added, THEN it only needs to implement the `SpinAnimation` interface to be fully functional in Decidarr
- GIVEN the shared interface, WHEN the API result is ready, THEN any animation receives the result as input and plays to reveal it — the animation never fetches its own data
- GIVEN the refactored slot machine, WHEN it runs, THEN its behavior and appearance are identical to the current implementation
- GIVEN the interface, THEN it exposes at minimum: `play(result: PlexItem): Promise<void>`, `skip(): void`, `duration: AnimationSpeed`
- GIVEN the interface, THEN all animations live in `src/components/animations/` with one file per variant

### US-2: API call completes before animation starts
As a user, I want the result to be determined before the animation plays so that the animation always reveals a confirmed selection.

**Acceptance criteria:**
- GIVEN I click Spin, WHEN the button is pressed, THEN the API call to `/api/selection/random` fires immediately
- GIVEN the API call is in flight, WHEN I am waiting, THEN a loading state is shown (spinner or pulse) — no animation plays yet
- GIVEN the API call completes successfully, WHEN the result is received, THEN the selected animation plays using the confirmed result
- GIVEN the API call fails, WHEN an error is returned, THEN no animation plays and an error message is shown
- GIVEN the API call completes, WHEN the animation finishes or is skipped, THEN the MovieCard is revealed with the result

### US-3: Roulette Wheel animation
As a user, I want a European casino-style roulette wheel animation so that spinning feels like a real casino experience.

**Acceptance criteria:**
- GIVEN the roulette wheel animation is active, WHEN a spin result is received, THEN a circular European roulette wheel spins and decelerates to land on a pocket containing the selected item's poster
- GIVEN the wheel is spinning, WHEN it slows to a stop, THEN the winning pocket is visually highlighted
- GIVEN the wheel stops, WHEN the result is confirmed, THEN the MovieCard appears below with the full selection details
- GIVEN `prefers-reduced-motion` is active, WHEN the animation runs, THEN the wheel skips directly to the stopped result state

### US-4: Wheel of Fortune animation
As a user, I want a vertical Wheel of Fortune-style animation so that spinning feels like the TV show experience.

**Acceptance criteria:**
- GIVEN the Wheel of Fortune animation is active, WHEN a spin result is received, THEN a vertical wheel with segments showing movie/show titles spins and decelerates to land on the selected item's segment
- GIVEN the wheel is spinning, WHEN it slows to a stop, THEN the winning segment is centered and highlighted
- GIVEN the wheel stops, WHEN the result is confirmed, THEN the MovieCard appears below with the full selection details
- GIVEN `prefers-reduced-motion` is active, WHEN the animation runs, THEN the wheel skips directly to the stopped result state

### US-5: Plinko animation
As a user, I want a Plinko-style animation so that the selection feels fun and unpredictable.

**Acceptance criteria:**
- GIVEN the Plinko animation is active, WHEN a spin result is received, THEN a ball drops from the top through a peg board and lands in the slot corresponding to the selected item
- GIVEN the ball is dropping, WHEN it hits pegs, THEN it bounces realistically left and right before landing
- GIVEN the ball lands, WHEN the slot lights up, THEN the MovieCard appears below with the full selection details
- GIVEN `prefers-reduced-motion` is active, WHEN the animation runs, THEN the ball skips directly to the landed state

### US-6: Random animation mode
As a user, I want a "Random" animation option so that each spin surprises me with a different animation style.

**Acceptance criteria:**
- GIVEN I select "Random" in Settings, WHEN I spin, THEN one of the four animations (Slots, Roulette, Wheel of Fortune, Plinko) is selected at random at spin time
- GIVEN Random mode is active, WHEN the animation is selected, THEN it launches immediately without showing the user which animation was picked
- GIVEN Random mode is active, WHEN two consecutive spins happen, THEN the same animation CAN appear twice — it is truly random each time
- GIVEN Random mode is active, THEN the stored setting value is literally `"random"` — the random pick happens at runtime, not at save time

### US-7: Animation selection in Settings
As a user, I want to select my preferred animation style in Settings so that I always get the experience I want.

**Acceptance criteria:**
- GIVEN I open Settings and go to the Preferences tab, WHEN I look at animation options, THEN I see: Slots, Roulette Wheel, Wheel of Fortune, Plinko, Random
- GIVEN I select an animation, WHEN I save Settings, THEN all future spins use that animation until I change it
- GIVEN I am a Plex friend (non-admin), WHEN I open Settings, THEN I can still change my animation preference as it is a per-user preference stored on my user record

### US-8: User-configurable animation speed
As a user, I want to control how long animations run so that I can choose between a quick result or a dramatic reveal.

**Acceptance criteria:**
- GIVEN I open Settings Preferences tab, WHEN I look at speed options, THEN I see three options: Fast, Normal, Dramatic
- GIVEN I select Fast, WHEN any animation plays, THEN it completes noticeably quicker than Normal
- GIVEN I select Dramatic, WHEN any animation plays, THEN it runs longer with more build-up before revealing the result
- GIVEN speed is changed, WHEN I save Settings, THEN all future animations use the new speed

### US-9: Skip animation
As a user, I want to skip the animation and jump straight to the result so that I can move quickly when I already know I want to spin again.

**Acceptance criteria:**
- GIVEN an animation is playing, WHEN I click a visible Skip button or press Escape, THEN the animation stops immediately
- GIVEN the animation is skipped, WHEN it stops, THEN the MovieCard is revealed instantly with the result
- GIVEN the skip button, WHEN the animation is not playing, THEN the skip button is not visible

---

## Out of scope
- Custom user-uploaded animation themes
- Sound effects or audio for animations
- Animation preview in Settings before saving
- Per-animation speed overrides (one speed setting applies to all)
- The animation revealing the result mid-play before the MovieCard (all reveals via MovieCard only)

