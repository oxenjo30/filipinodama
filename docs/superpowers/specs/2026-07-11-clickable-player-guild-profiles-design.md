# Clickable Player & Guild Profiles — Design

**Date:** 2026-07-11
**Status:** Approved (pending spec review)

## Summary

Make players and guilds clickable across the web app so a user can open another
player's **public profile page** (`/profile/:id`) or a **public guild page**
(`/guilds/:id`). On a player's public profile the viewer sees their public
details (identity, stats, bio, favorite faction, guild, achievements) and a
state-aware **Add Friend** button. On a guild page the viewer sees public guild
detail and a state-aware **Join** button. Today none of these names/avatars are
clickable (except Friends rows, which open a modal), and there is no public
profile route or any guild detail view for other guilds.

## Goals / scope

Clickable surfaces in THIS pass:
- **Leaderboard** — table rows, podium, Live Climbers rail → `/profile/:id`;
  Top Guilds rail + guild names → `/guilds/:id`.
- **Guild page** — roster members → `/profile/:id`; Discover-guild cards →
  `/guilds/:id`.
- **Friends page** — friend / incoming-request / suggested rows navigate to
  `/profile/:id` (replacing the existing in-page profile modal).

Explicitly OUT of scope this pass: in-match opponent panel, matchmaking VS
arena, in-game `PlayerPanel`, and Messages conversation header. (They can be
wired later using the same shared components.)

## Backend (apps/server)

### 1. `GET /api/users/:id` — add `relationship`
The endpoint (`apps/server/src/modules/users.ts:70`) is **already fully public**
(no `preHandler`) and already filters `deletedAt: null` (so deleted users
already return `USER_NOT_FOUND`). Its `publicProfile()` projection already
returns: `id, username, displayName, tag, bio, avatarUrl, frameId, countryCode,
trophies, rankTier, tier, equippedBoard, equippedSkin, equippedEmotes, wins,
losses, draws, streak, createdAt, guild: { id, name, tag, role } | null`
(`users.ts:10-56`). **Preserve every existing field** — this change is purely
ADDITIVE.

Add a **`relationship`** field describing the viewer's relation to `:id`:
- `"self"` — `:id` is the viewer.
- `"friends"` — an accepted `Friendship` row exists.
- `"request-sent"` — viewer has a pending outgoing `FriendRequest` to `:id`.
- `"request-received"` — `:id` has a pending request to the viewer; include
  `requestId` so the button can accept it.
- `"none"` — no relationship, OR the target is a **bot** (bots can't be
  friended — see below), OR the viewer is signed out.

Add the non-rejecting **`attachUser`** guard (`apps/server/src/auth/guards.ts`,
already used by `leaderboard.ts:59`) as this route's `preHandler` so the viewer
id is available when a cookie is present but anonymous callers are NOT 401'd.
`relationship` is computed with three indexed lookups against `Friendship` /
`FriendRequest` (keyed the way `friends.ts:53-95` does: sorted `aId/bId`, and
`fromId/toId/status:"pending"`). This is NEW code — `createFriendRequest` does
related but different lookups; do not assume a reusable helper.

**Bot guard:** if the target user `isBot`, force `relationship: "none"` **and**
add a boolean `isBot: true` to the response so the frontend hides the friend
button (bots have no accept path — `createFriendRequest` never checks `isBot`).

Response shape (existing projection + these additions):
```
{ ...existing publicProfile fields (unchanged)...,
  isBot: boolean,
  relationship: "self"|"friends"|"request-sent"|"request-received"|"none",
  requestId?: string   // present only when relationship === "request-received"
}
```

**No `favoriteFaction`.** It is a per-device **localStorage-only** cosmetic
preference (`EditProfileModal.tsx` documents it; there is no server column and
no PATCH path). It therefore CANNOT be shown for another user and is **cut from
the public profile** entirely. (The self view keeps reading it from
localStorage, unchanged.)

### 2. `GET /api/guilds/:id` — make public + add join eligibility
**This endpoint is currently `requireAuth` (hard 401 for signed-out callers)**
and does `const me = req.userId!` unconditionally (`guilds.ts:157-161`), then
computes `mine`/`myRole` from the member lookup. To serve the public guild page:
- **Swap `requireAuth` → `attachUser`** (already imported) so signed-out callers
  are not rejected.
- **Null-guard every `req.userId!`** in the handler: when there is no viewer,
  `myRole` is null and `joinState` is `"guest"`; the roster/detail still returns.

**Privacy note (explicit decision):** making this public exposes the full roster
(each member's `lastSeenAt`, `trophies`, `rankTier`) to anonymous callers. This
is accepted for the public guild page (the same presence-adjacent data is
already public on the leaderboard). If any field is deemed too sensitive for
anonymous view, drop it from the roster projection for non-members — but the
default is: expose the roster as-is.

Add a viewer-relative **`joinState`**:
- `"member"` — viewer is already in this guild.
- `"in-other-guild"` — viewer is in a different guild (can't join).
- `"requested"` — viewer has a pending join request. **Requires a new query
  against the join-request table** (the current handler never reads it) — not
  derivable from existing data.
- `"joinable"` — viewer may join or request. Must mirror the EXACT eligibility
  logic in `POST /api/guilds/:id/join` (`guilds.ts:288-299`), including the
  invite-policy trophy-floor quirk, so the button never lies.
- `"guest"` — signed-out (button routes to `/login?next=...`).

### 3. No achievements endpoint needed
Achievements are computed **client-side** from `wins`/`streak`/`trophies`
(`apps/web/src/features/profile/AchievementsGrid.tsx:31-56`) — all already in
the `/users/:id` response. No server change for achievements.

## Frontend (apps/web)

### 4. Shared link components (new)
- **`PlayerLink`** — `apps/web/src/components/PlayerLink.tsx`: renders the
  existing `Avatar` (already supports `onClick`) + the player name, navigating to
  `/profile/:id`. Props: `{ id, name, avatar, frame?, size?, subtitle?, ... }`.
  **Note the `Avatar` prop is `frame`, NOT `frameId`** — call sites currently map
  `frame={x.frameId ?? undefined}` (`LeaderboardPage.tsx:387,410`; `FriendsPage.tsx:160`).
  `PlayerLink` must pass `frame` through to `Avatar`, or equipped frames silently
  vanish. One choke point so every list is wired the same way.
- **`GuildLink`** — `apps/web/src/components/GuildLink.tsx`: crest + guild name,
  navigates to `/guilds/:id`. Props: `{ id, name, tag?, crestKey?, ... }`.

Both exported from `apps/web/src/components/index.ts`.

### 5. Public player profile — NEW `PublicProfilePage` (not a fork of ProfilePage)
Forking `ProfilePage` into dual-mode is too invasive: its signed-out guard runs
first (`ProfilePage.tsx:249-263`), and its trophy-history/match-history sections
call `/api/users/me/...` and dereference `me.id` directly (`:172-226`, `:687`),
which crash for a null `me` on a public/signed-out visit. So:

- **New `apps/web/src/features/profile/PublicProfilePage.tsx`** — a dedicated
  read-only page. `/profile/:id` routes here; `/profile` (no id) stays the
  existing self `ProfilePage`, UNCHANGED.
- **New route** `/profile/:id` → `PublicProfilePage`, inside the `AppLayout`
  route block, alongside `/profile`. (react-router v6 matches the static
  `/profile` and dynamic `/profile/:id` by specificity — no ordering conflict;
  `?edit=1` is a query, not a path segment.)
- `PublicProfilePage` reads `useParams().id`, and:
  - If `me` is loaded and `id === me.id` → `navigate("/profile", {replace:true})`
    so "your own" link lands on the editable self page. (No dual-mode fork.)
  - Otherwise fetch `GET /api/users/:id` and render read-only: identity + stats
    (avatar with `frame`, name, tag, tier, trophies, wins/losses/win-rate), bio,
    guild membership (as a `GuildLink` to `/guilds/:id`), achievements, and the
    action row: **FriendButton** (§6) + **Report button** (§6a).
  - No favorite-faction (localStorage-only; see §1).
  - Works signed-out (public); the friend/report buttons handle the no-`me` case.
  - `404 USER_NOT_FOUND` → friendly "Player not found" panel (distinguish 404
    from transient/network errors, which show a retry state).
- **`AchievementsGrid`** (`AchievementsGrid.tsx`): change it to accept a stats
  prop `{ wins, streak, trophies }` instead of reading `useAuthStore().me`. Its
  4 achievement entries are typed `(me: Me) => boolean` (`:22,31-56`) — retype
  all four to the narrowed stats object, not just swap the read. Its ONLY
  consumer is `ProfilePage.tsx:616` (verified), which passes `me`;
  `PublicProfilePage` passes the fetched user's stats.

### 6. FriendButton (new) — state-aware
`apps/web/src/features/profile/FriendButton.tsx`, driven by the `relationship`
field:
- `self` → render nothing.
- `none` → **Add Friend** → `POST /api/friends/request { toUserId: id }`; on
  success → `request-sent`.
- `request-sent` → **Request Sent** (disabled).
- `request-received` → **Accept Request** → `POST
  /api/friends/request/:requestId/accept`; on success → `friends`.
- `friends` → **Friends ✓** (disabled/neutral).
- **Target is a bot** (`isBot` in the response) → render nothing (bots have no
  accept path; `createFriendRequest` doesn't guard `isBot`, so a request would be
  unacceptable).
- **Signed-out viewer** → **Add Friend** that routes to
  `/login?next=/profile/:id` on click (the app's existing `?next=` return-url
  convention, already used on `LeaderboardPage`), so the user returns to the
  profile after signing in.

### 6a. Report button (must survive the FriendsPage-modal removal)
Removing the FriendsPage profile modal (§8) deletes the ONLY stranger-facing
entry point to `ReportPlayerModal` (`FriendsPage.tsx:1154` mounts it at `:1178`;
the component is already reusable — also used by MessagesPage). So the new
`PublicProfilePage` action row MUST include a **Report player** button that opens
`ReportPlayerModal` for the viewed user. Hidden on your own profile and for bots.
Signed-out → route to `/login?next=...` like the friend button. This keeps report
parity — it is NOT out of scope.

### 7. Public guild page — new `GuildProfilePage`
- **New route** `/guilds/:id` → `apps/web/src/features/guilds/GuildProfilePage.tsx`.
- Fetches `GET /api/guilds/:id` and renders public detail: crest, name, tag,
  level, description, minTrophies, memberCount, weeklyPoints, roster (each
  member a `PlayerLink` to `/profile/:id`), and a **Join button** whose label
  follows `joinState` (`joinable`→**Join**/**Request** / `requested`→**Requested**
  disabled / `in-other-guild`→disabled / `member`→**View** or open managed view /
  `guest`→**Sign in to join** routing to `/login?next=/guilds/:id`). Joining
  reuses `POST /api/guilds/:id/join` (which `GuildsPage` already calls).
- `/guilds` (no id) stays the current page: your own guild's managed view +
  Discover browse. Unknown/deleted id → "Guild not found".

### 8. Wire the scoped surfaces
Replace bespoke avatar+name markup with `PlayerLink` / `GuildLink` in:
- `apps/web/src/features/leaderboard/LeaderboardPage.tsx` — table rows, podium,
  Live Climbers (players); Top Guilds rail + guild names (guilds).
- `apps/web/src/features/guilds/GuildsPage.tsx` — roster members (players);
  Discover-guild cards (guilds).
- `apps/web/src/features/friends/FriendsPage.tsx` — friend / incoming-request /
  suggested rows navigate to `/profile/:id`; **remove the now-redundant
  in-page profile modal** (`FriendsPage.tsx:936-1176`) and its `profileId`
  state/handlers. **The Report action that lived in that modal is not lost — it
  moves to `PublicProfilePage` (§6a).** Verify nothing else references the
  removed `profileId` state / modal handlers before deleting.

## Data flow

- Click a player anywhere in scope → `navigate("/profile/" + id)` →
  `PublicProfilePage` fetches `/users/:id` → renders read-only view +
  FriendButton + Report (from `relationship`/`isBot`).
- Click a guild → `navigate("/guilds/" + id)` → `GuildProfilePage` fetches
  `/guilds/:id` → renders public detail + Join (from `joinState`).
- Clicking your OWN name → `/profile/<me.id>` → `PublicProfilePage` sees
  `id === me.id` and redirects to `/profile` (the editable self page).

## Error handling / edge cases

- Signed-out: profile and guild pages render (public); friend/join/report buttons
  route to `/login?next=<current path>` so the user returns after signing in.
- `404` user/guild → friendly not-found panel; transient/network errors → retry
  state (distinct from 404).
- Deleted users already 404 (`/users/:id` filters `deletedAt: null`); guests/bots
  can be viewed read-only but the friend button is hidden for bots.
- Own profile via `/profile/:id`: `PublicProfilePage` detects `id === me.id` and
  `navigate("/profile", {replace:true})` to the editable self page.
- Bots: leaderboard already excludes them; a bot linked from a guild roster opens
  a read-only profile with NO friend button (`isBot` / `relationship:"none"`).
- Duplicate friend request: server already guards; the button's `relationship`
  state prevents most double-sends up front.

## Testing

- No web test harness; gates are `pnpm --filter web typecheck` + `pnpm --filter
  web lint`, `pnpm --filter server typecheck`, plus manual/visual checks.
- Manual: clicking a player on leaderboard/guild/friends opens `/profile/:id`
  with correct public data; clicking a guild opens `/guilds/:id`.
- FriendButton shows the right label for each relationship (none / sent /
  received / friends / self) and the transitions work (add → sent, accept →
  friends).
- Guild Join button reflects joinState; joining works; own guild unaffected;
  guild page loads signed-out.
- FriendButton hidden for bots; **Report button present on PublicProfilePage**
  and opens ReportPlayerModal (report parity vs the removed FriendsPage modal).
- Visiting `/profile/<me.id>` redirects to `/profile` (self page unchanged).
- Signed-out: friend/join/report route to `/login?next=…` and return correctly.
- `pnpm --filter server typecheck` passes with the new `relationship`/`isBot`/
  `joinState` fields; `/api/guilds/:id` loads without a session (guard swap).

## Out of scope

- In-match opponent, matchmaking arena, in-game PlayerPanel, Messages header
  (wire later with the same `PlayerLink`).
- Any new achievements backend (stays client-computed).
- Blocking/unfriend (not added here). **Report is IN scope** — it moves from the
  removed FriendsPage modal to `PublicProfilePage` (§6a) to preserve parity.
- `favoriteFaction` on public profiles (localStorage-only; can't be shown for
  another user — see §1).
