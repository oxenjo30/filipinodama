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
The endpoint (`apps/server/src/modules/users.ts:70`) already returns the public
profile: `bio`, rank tier, stats (`wins`, `losses`, `draws`, `streak`,
`trophies`), and `guild: { id, name, tag } | null`. Add a **`relationship`**
field describing the requesting viewer's relation to `:id`:

- `"self"` — `:id` is the viewer.
- `"friends"` — an accepted friendship exists.
- `"request-sent"` — viewer has a pending outgoing request to `:id`.
- `"request-received"` — `:id` has a pending request to the viewer; include
  `requestId` so the profile's button can accept it.
- `"none"` — no relationship (also the value for signed-out viewers).

Attach the viewer via the existing non-rejecting auth guard (like the
leaderboard's `attachUser`) so the endpoint stays PUBLIC (works signed-out).
Relationship is computed from the `Friendship` / friend-request tables that
`apps/server/src/modules/friends.ts` already uses.

Response shape (superset of today's):
```
{ id, username, displayName, tag, avatarUrl, frameId, countryCode, bio,
  favoriteFaction, rankTier, trophies, wins, losses, draws, streak,
  guild: { id, name, tag } | null,
  relationship: "self"|"friends"|"request-sent"|"request-received"|"none",
  requestId?: string   // present only when relationship === "request-received"
}
```
(If `favoriteFaction` is not already selected in the public projection, add it.)

### 2. `GET /api/guilds/:id` — ensure public + join eligibility
The guild detail endpoint exists (used by `GuildsPage` for the viewer's own
guild). Confirm/adjust so a NON-member can read a guild's public detail
(crest, name, tag, level, description, minTrophies, joinPolicy, weeklyPoints,
memberCount, roster). Add a viewer-relative **`joinState`** so the Join button
is correct:
- `"member"` — viewer is already in this guild.
- `"in-other-guild"` — viewer is in a different guild (can't join).
- `"requested"` — viewer has a pending join request to this guild.
- `"joinable"` — open to join / request (respects `joinPolicy` + `minTrophies`).
- `"guest"` — signed-out (button prompts sign-in).

### 3. No achievements endpoint needed
Achievements are computed **client-side** from `wins`/`streak`/`trophies`
(`apps/web/src/features/profile/AchievementsGrid.tsx:31-56`) — all already in
the `/users/:id` response. No server change for achievements.

## Frontend (apps/web)

### 4. Shared link components (new)
- **`PlayerLink`** — `apps/web/src/components/PlayerLink.tsx`: renders the
  existing `Avatar` (which already supports `onClick`) + the player name, and
  navigates to `/profile/:id` on click. Props: `{ id, name, avatar, frameId?,
  size?, subtitle?, ... }`. One choke point so every list is wired the same way.
- **`GuildLink`** — `apps/web/src/components/GuildLink.tsx`: crest + guild name,
  navigates to `/guilds/:id`. Props: `{ id, name, tag?, crestKey?, ... }`.

Both exported from `apps/web/src/components/index.ts`.

### 5. Public player profile — extend `ProfilePage` for `/profile/:id`
- **New route** `/profile/:id` in `apps/web/src/App.tsx` (inside the `AppLayout`
  route block), alongside the existing `/profile`.
- `ProfilePage` reads `useParams().id`. Behavior:
  - **No `:id`, or `:id === me.id`** → current SELF view, unchanged (editable,
    with Edit/Inventory/Settings, trophy history, match history).
  - **`:id` present and ≠ me** → PUBLIC read-only view: fetch `GET
    /api/users/:id`; render identity + stats, bio + favorite faction, guild
    membership (as a `GuildLink` to `/guilds/:id`), and achievements. Hide the
    self-only controls (Edit/Inventory/Settings, trophy-history and
    match-history tabs that require `me`). Show the **FriendButton** (below).
  - Unknown/deleted id → friendly "Player not found" state.
- **`AchievementsGrid`** (`apps/web/src/features/profile/AchievementsGrid.tsx`):
  change it to accept a stats object prop `{ wins, streak, trophies }` instead
  of reading `useAuthStore().me` directly, so it renders for any user. The self
  view passes `me`; the public view passes the fetched user's stats.

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
- Signed-out viewer → **Add Friend** that routes to `/login` when clicked.

### 7. Public guild page — new `GuildProfilePage`
- **New route** `/guilds/:id` → `apps/web/src/features/guilds/GuildProfilePage.tsx`.
- Fetches `GET /api/guilds/:id` and renders public detail: crest, name, tag,
  level, description, minTrophies, memberCount, weeklyPoints, roster (each
  member a `PlayerLink` to `/profile/:id`), and a **Join button** whose label
  follows `joinState` (`Join` / `Requested` / `Members only` /
  in-other-guild disabled / `Sign in to join`). Joining reuses the existing
  guild join/request API that `GuildsPage` already calls.
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
  state/handlers.

## Data flow

- Click a player anywhere in scope → `navigate("/profile/" + id)` →
  `ProfilePage` (public mode) fetches `/users/:id` → renders public view +
  `FriendButton` (from `relationship`).
- Click a guild → `navigate("/guilds/" + id)` → `GuildProfilePage` fetches
  `/guilds/:id` → renders public detail + Join (from `joinState`).
- Clicking your OWN name → `/profile/<me.id>` → self view (id === me → editable,
  no friend button).

## Error handling / edge cases

- Signed-out: profile and guild pages render (public); friend/join buttons route
  to `/login`.
- Deleted/nonexistent user or guild → friendly not-found panel, not a crash.
- Own profile via `/profile/:id`: detected by `id === me.id`, renders the self
  (editable) view; FriendButton renders nothing (`relationship: "self"`).
- Bots: leaderboard already excludes them; if a bot name is linked elsewhere its
  profile is read-only like any other.
- Duplicate/again friend request: server already guards; the button's
  `relationship` state prevents most double-sends up front.

## Testing

- No web test harness; gates are `pnpm --filter web typecheck` + `pnpm --filter
  web lint`, `pnpm --filter server typecheck`, plus manual/visual checks.
- Manual: clicking a player on leaderboard/guild/friends opens `/profile/:id`
  with correct public data; clicking a guild opens `/guilds/:id`.
- FriendButton shows the right label for each relationship (none / sent /
  received / friends / self) and the transitions work (add → sent, accept →
  friends).
- Guild Join button reflects joinState; joining works; own guild unaffected.
- Self view unchanged when visiting `/profile` and `/profile/<me.id>`.
- Signed-out viewing works; friend/join route to login.
- `pnpm --filter server typecheck` passes with the new `relationship`/`joinState`.

## Out of scope

- In-match opponent, matchmaking arena, in-game PlayerPanel, Messages header
  (wire later with the same `PlayerLink`).
- Any new achievements backend (stays client-computed).
- Blocking/unfriend/report changes (report already exists; not touched here).
