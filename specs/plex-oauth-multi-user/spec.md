# Spec: Plex OAuth Multi-User

## What & Why
Replace Decidarr's local JWT auth system with Plex OAuth for all users including the admin. Allow Plex friends who share the server owner's libraries to log into Decidarr using their own Plex credentials, with access controlled by the admin via a user management panel. Each user sees only their own data and the libraries they already have access to on Plex.

---

## User Stories

### US-1: Admin login via Plex OAuth
As the server owner, I want to log into Decidarr using my Plex account so that I don't need to manage a separate local password.

**Acceptance criteria:**
- GIVEN I visit Decidarr, WHEN I click "Login with Plex", THEN I am redirected to plex.tv to authorize
- GIVEN I complete Plex OAuth, WHEN Decidarr receives the callback, THEN it identifies me as the server owner by matching my Plex `machineIdentifier` and grants admin access
- GIVEN my session expires, WHEN I return to Decidarr, THEN a silent OAuth token refresh is attempted before showing the login screen
- GIVEN plex.tv is unreachable, WHEN I try to log in, THEN I see a clear error message that Plex.tv is unavailable and login is blocked

### US-2: Plex friend login
As a Plex friend with access to the server owner's libraries, I want to log into Decidarr using my own Plex account so that I can use the roulette without needing a separate password.

**Acceptance criteria:**
- GIVEN I visit Decidarr, WHEN I click "Login with Plex", THEN I am redirected to plex.tv to authorize
- GIVEN I complete Plex OAuth, WHEN Decidarr checks my account, THEN it verifies I am on the admin's approved user list before granting access
- GIVEN I am not on the approved list, WHEN I complete OAuth, THEN I see a message that I do not have access and am not logged in
- GIVEN plex.tv is unreachable, WHEN I try to log in, THEN I see a clear error that login is unavailable

### US-3: Persistent session with refresh
As any logged-in user, I want my session to persist across visits so that I don't have to re-authorize with Plex every time I open Decidarr.

**Acceptance criteria:**
- GIVEN I am logged in, WHEN I close and reopen Decidarr before my session timeout, THEN I am still logged in without re-authorizing
- GIVEN my session token is near expiry, WHEN I make any request, THEN a silent OAuth token refresh is triggered automatically
- GIVEN my refresh token is also expired, WHEN I return to Decidarr, THEN I am redirected to the login screen

### US-4: Admin user management
As the admin, I want to manage which Plex friends can access Decidarr so that I control who uses the app.

**Acceptance criteria:**
- GIVEN I am logged in as admin, WHEN I open Settings, THEN I see a Users tab with a list of my Plex friends who have server access
- GIVEN the user list is shown, WHEN I toggle access for a user, THEN that user is immediately added or removed from the approved list
- GIVEN a user's access is revoked, WHEN they next make a request, THEN their session is invalidated and they are redirected to the login screen
- GIVEN I add a new user, WHEN they next visit Decidarr and log in with Plex, THEN they are granted access

### US-5: Library access scoped to Plex permissions
As a Plex friend, I want to only see libraries I already have access to on Plex so that I cannot browse content I am not permitted to see.

**Acceptance criteria:**
- GIVEN I am logged in as a Plex friend, WHEN Decidarr loads my library list, THEN it only shows libraries my Plex account has access to on the server
- GIVEN the admin has restricted my Plex access to specific libraries, WHEN I spin, THEN only items from my accessible libraries are in the selection pool
- GIVEN my Plex library permissions change, WHEN I next load Decidarr, THEN my available libraries reflect the updated permissions

### US-6: User data isolation
As a Plex friend, I want to only see my own watch history and preferences so that my data is private from other users.

**Acceptance criteria:**
- GIVEN I am logged in, WHEN I view watched items, THEN I only see items I have watched, sourced from Tautulli for my Plex username
- GIVEN another user has marked items as watched, WHEN I spin, THEN their watched status does not affect my selection pool
- GIVEN I change my theme preference, WHEN another user logs in, THEN their theme is unaffected
- GIVEN I am a Plex friend, WHEN I open Settings, THEN I only see the Preferences tab (theme only) — not Plex, TMDb, Tautulli, Overseerr, or Sync tabs

---

## Out of scope
- Per-user library overrides inside Decidarr (permissions come from Plex only)
- Admin impersonating another user
- Guest/anonymous access without Plex login
- Manual watch history entry for friends (Tautulli only)
- Email notifications or invitations
- Local admin fallback password

