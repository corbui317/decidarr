# Spec: Overseerr Integration

## What & Why
Integrate Overseerr into Decidarr so that the admin can globally enable filtering of already-available content from the spin pool. Availability status is pre-fetched and cached alongside the existing library cache. Partially available content remains in the pool but is clearly labeled so users understand they may not get the full experience.

---

## User Stories

### US-1: Admin configures Overseerr connection
As the admin, I want to connect Decidarr to my Overseerr instance so that availability data can be synced.

**Acceptance criteria:**
- GIVEN I am logged in as admin, WHEN I open Settings, THEN I see an Overseerr tab alongside Plex, TMDb, and Tautulli
- GIVEN I am on the Overseerr tab, WHEN I enter my Overseerr URL and API key and click Test, THEN Decidarr verifies the connection and shows a success or failure message
- GIVEN the connection is successful, WHEN I save, THEN the Overseerr URL and API key are encrypted and stored in MongoDB using the existing encryption pattern
- GIVEN the Overseerr tab, WHEN I toggle the global enable/disable switch, THEN the filter is activated or deactivated for all users immediately

### US-2: Availability status pre-fetched and cached
As the system, I want Overseerr availability data to be cached alongside the library cache so that spin requests are never delayed by real-time Overseerr API calls.

**Acceptance criteria:**
- GIVEN Overseerr is configured and enabled, WHEN the library cache syncs, THEN Overseerr availability status is fetched for all cached items and stored alongside them
- GIVEN an item is in the cache, WHEN its Overseerr status is `available`, THEN it is marked as fully available in the cache
- GIVEN an item is in the cache, WHEN its Overseerr status is `partially_available`, THEN it is marked as partially available in the cache with a flag
- GIVEN an item has no Overseerr record, THEN it is treated as unavailable (not filtered out)
- GIVEN the library cache is manually refreshed, WHEN the refresh runs, THEN Overseerr availability is also re-fetched
- GIVEN Overseerr is unreachable during a cache sync, THEN the sync completes using the last known availability data and logs a warning — it does not fail the entire sync

### US-3: Global filter toggle excludes available content
As the admin, I want to globally toggle filtering of fully available content from the spin pool so that all users only spin on content worth requesting or watching fresh.

**Acceptance criteria:**
- GIVEN the Overseerr filter is enabled globally, WHEN any user spins, THEN items with status `available` are excluded from the selection pool
- GIVEN the Overseerr filter is enabled globally, WHEN any user spins, THEN items with status `partially_available` remain in the pool and are not excluded
- GIVEN the Overseerr filter is disabled globally, WHEN any user spins, THEN all items are in the pool regardless of Overseerr status
- GIVEN the admin toggles the filter on or off, THEN the change takes effect immediately for all active sessions without requiring a page reload

### US-4: Partially available content is clearly labeled
As a user, I want to know when a selected item is only partially available in Overseerr so that I can decide whether to watch what's there or wait.

**Acceptance criteria:**
- GIVEN a spin lands on an item with status `partially_available`, WHEN the MovieCard is displayed, THEN a visible badge reads "Partially Available on Overseerr" or similar
- GIVEN a spin lands on an item with status `available`, WHEN the MovieCard is displayed, THEN no Overseerr badge is shown (it would have been filtered out if the filter is on)
- GIVEN a spin lands on an item with no Overseerr record, THEN no Overseerr badge is shown
- GIVEN the badge is shown, WHEN the user hovers or taps it, THEN a tooltip explains what partially available means (e.g. "Some seasons or parts of this title are available")

### US-5: Filter panel warns when Overseerr is unavailable
As a user, I want to know when Overseerr is unavailable so that I understand why the filter may not be working as expected.

**Acceptance criteria:**
- GIVEN Overseerr is configured but currently unreachable, WHEN I open the filter panel, THEN a warning message is shown stating Overseerr is unavailable and the last cached data is being used
- GIVEN Overseerr is not configured at all, WHEN I open the filter panel, THEN no Overseerr warning or filter option is shown
- GIVEN Overseerr becomes reachable again, WHEN the next cache sync runs, THEN the warning is cleared automatically

---

## Out of scope
- Per-user Overseerr filter toggle (global only)
- "Request this item" button from MovieCard
- Filtering by `requested` or `processing` status
- Real-time availability check at spin time
- Overseerr user account mapping
- Notifications when requested items become available

