# Clickable Player & Guild Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make players and guilds clickable everywhere in scope, opening a public player profile page (`/profile/:id`) with a state-aware Add Friend + Report, and a public guild page (`/guilds/:id`) with a state-aware Join.

**Architecture:** Two additive backend changes (`relationship`+`isBot` on `GET /api/users/:id`; make `GET /api/guilds/:id` public + add `joinState`). Two shared frontend link components (`PlayerLink`, `GuildLink`) centralize click-to-navigate. A dedicated `PublicProfilePage` (NOT a fork of the self `ProfilePage`) renders the read-only view. A new `GuildProfilePage` renders the public guild view. The scoped listing surfaces (leaderboard, guild, friends) swap bespoke avatar+name markup for the link components; the redundant FriendsPage profile modal is removed (its Report action moves to `PublicProfilePage`).

**Tech Stack:** Fastify + Prisma (server), React 18 + react-router-dom ^6.26 + Zustand + inline styles (web), pnpm workspace, TypeScript.

## Global Constraints

- **No test harness in web or (for these modules) server.** Verification gate per task: `pnpm --filter web typecheck` and `pnpm --filter web lint` for web changes; `pnpm --filter server typecheck` for server changes; plus the stated visual/manual check. Do NOT invent a test runner. "Failing test" steps below are replaced by typecheck/lint/visual verification.
- **`GET /api/users/:id` is ALREADY public** (no preHandler) and filters `deletedAt: null`. Changes are ADDITIVE — preserve every existing field in `publicProfile()`.
- **`Avatar`'s frame prop is `frame`, NOT `frameId`.** Call sites map `frame={x.frameId ?? undefined}`. `PlayerLink` must pass `frame` through or equipped frames vanish.
- **No `favoriteFaction`** anywhere public — it is localStorage-only, cannot be shown for another user.
- **Bots** (`isBot`) get no friend button and no report button.
- **Signed-out** friend/join/report route to `/login?next=<current path>` (existing convention).
- **react-router-dom is ^6.26** — v6 element API; `useParams`, `useNavigate`, `<Navigate>`.
- **Commit after every task**, staging files by EXPLICIT PATH (the working tree may hold unrelated uncommitted changes — never `git add -A`).
- Branch: `feat/admin-fidelity-pass` (a feature branch — commit directly).

---

## File Structure

- `apps/server/src/modules/users.ts` — **modify.** Add `attachUser` preHandler + `relationship`/`isBot` to `GET /api/users/:id`.
- `apps/server/src/modules/guilds.ts` — **modify.** Swap `GET /api/guilds/:id` to `attachUser`, null-guard, add `joinState`.
- `apps/web/src/components/PlayerLink.tsx` — **create.** Avatar+name → `/profile/:id`.
- `apps/web/src/components/GuildLink.tsx` — **create.** Crest+name → `/guilds/:id`.
- `apps/web/src/components/index.ts` — **modify.** Export the two.
- `apps/web/src/features/profile/AchievementsGrid.tsx` — **modify.** Accept a stats prop instead of reading `me`.
- `apps/web/src/features/profile/FriendButton.tsx` — **create.** State-aware friend action.
- `apps/web/src/features/profile/PublicProfilePage.tsx` — **create.** Read-only public profile.
- `apps/web/src/features/guilds/GuildProfilePage.tsx` — **create.** Public guild page.
- `apps/web/src/App.tsx` — **modify.** Add `/profile/:id` and `/guilds/:id` routes.
- `apps/web/src/features/leaderboard/LeaderboardPage.tsx` — **modify.** Wire player/guild links.
- `apps/web/src/features/guilds/GuildsPage.tsx` — **modify.** Wire roster/discover links.
- `apps/web/src/features/friends/FriendsPage.tsx` — **modify.** Rows navigate to `/profile/:id`; remove profile modal (Report moves to PublicProfilePage).

---

## Task 1: Backend — add `relationship` + `isBot` to `GET /api/users/:id`

**Files:**
- Modify: `apps/server/src/modules/users.ts`

**Interfaces:**
- Produces: `GET /api/users/:id` response gains `isBot: boolean` and
  `relationship: "self"|"friends"|"request-sent"|"request-received"|"none"`,
  plus `requestId?: string` when `relationship === "request-received"`.

- [ ] **Step 1: Import `attachUser` and add it as the route preHandler**

In `apps/server/src/modules/users.ts`, confirm the imports include the guard. At the top, the file imports from `../auth/guards.js` (it already imports `requireAuth`). Change that import to also bring in `attachUser`:

```ts
import { requireAuth, attachUser } from "../auth/guards.js";
```

Then change the route declaration (currently `app.get<{ Params: { id: string } }>("/users/:id", async (req) => {`) to add the preHandler:

```ts
  app.get<{ Params: { id: string } }>("/users/:id", { preHandler: attachUser }, async (req) => {
```

- [ ] **Step 2: Fetch `isBot` and compute `relationship`, return them**

Replace the body of the `GET /api/users/:id` handler (the block from `const user = await prisma.user.findFirst({` through `return ok({ user: publicProfile(user) });`) with:

```ts
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: guildInclude,
    });
    if (!user) throw err.notFound("USER_NOT_FOUND", "User not found");

    const me = req.userId ?? null;
    let relationship: "self" | "friends" | "request-sent" | "request-received" | "none" = "none";
    let requestId: string | undefined;

    if (me && !user.isBot) {
      if (me === user.id) {
        relationship = "self";
      } else {
        const [aId, bId] = me < user.id ? [me, user.id] : [user.id, me];
        const friendship = await prisma.friendship.findUnique({ where: { aId_bId: { aId, bId } } });
        if (friendship) {
          relationship = "friends";
        } else {
          const outgoing = await prisma.friendRequest.findUnique({
            where: { fromId_toId: { fromId: me, toId: user.id } },
          });
          if (outgoing && outgoing.status === "pending") {
            relationship = "request-sent";
          } else {
            const incoming = await prisma.friendRequest.findUnique({
              where: { fromId_toId: { fromId: user.id, toId: me } },
            });
            if (incoming && incoming.status === "pending") {
              relationship = "request-received";
              requestId = incoming.id;
            }
          }
        }
      }
    }

    return ok({ user: { ...publicProfile(user), isBot: user.isBot, relationship, requestId } });
```

(Note: `publicProfile()` selects via `include: guildInclude` on a full user row, so `user.isBot` is available on the fetched row. The `Friendship` unique key is `aId_bId` and `FriendRequest` is `fromId_toId` — confirmed against `friends.ts:63-70`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter server typecheck`
Expected: PASS. (If `attachUser` isn't exported from `../auth/guards.js`, verify the export name there — it is used by `leaderboard.ts:59` as `attachUser`.)

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/users.ts
git commit -m "feat(api): add relationship + isBot to GET /users/:id"
```

---

## Task 2: Backend — make `GET /api/guilds/:id` public + add `joinState`

**Files:**
- Modify: `apps/server/src/modules/guilds.ts`

**Interfaces:**
- Produces: `GET /api/guilds/:id` works signed-out (no 401) and returns
  `joinState: "member"|"in-other-guild"|"requested"|"joinable"|"guest"` alongside
  the existing `{ guild, roster, myRole }`.

- [ ] **Step 1: Ensure `attachUser` is imported**

In `apps/server/src/modules/guilds.ts`, the file imports guards from `../auth/guards.js`. Ensure `attachUser` is among them (add it to the existing import if missing):

```ts
import { requireAuth, attachUser } from "../auth/guards.js";
```

(Keep `requireAuth` — other routes in this file still use it. Also keep any existing named imports like `requireGuildRole` unchanged; only add `attachUser`.)

- [ ] **Step 2: Swap the `GET /api/guilds/:id` preHandler and compute joinState**

Replace the entire `GET /api/guilds/:id` handler (from `app.get<{ Params: { id: string } }>(\n    "/guilds/:id",\n    { preHandler: requireAuth },` through its closing `);` at the `myRole: mine?.role ?? null,` block) with:

```ts
  // GET /api/guilds/:id — public detail + roster + viewer joinState
  app.get<{ Params: { id: string } }>(
    "/guilds/:id",
    { preHandler: attachUser },
    async (req) => {
      const me = req.userId ?? null;
      const guild = await prisma.guild.findUnique({
        where: { id: req.params.id },
        include: {
          members: {
            include: { user: { select: memberUserSelect } },
            orderBy: [{ role: "asc" }, { weeklyContribution: "desc" }],
          },
        },
      });
      if (!guild) throw err.notFound("GUILD_NOT_FOUND", "Guild not found");

      const mine = me ? guild.members.find((m) => m.userId === me) : undefined;

      // joinState mirrors POST /guilds/:id/join eligibility (guilds.ts join route):
      //  - guest: signed out
      //  - member: already in THIS guild
      //  - in-other-guild: in a DIFFERENT guild
      //  - requested: has a pending join request to this guild
      //  - joinable: everything else (open/request policy, or below-floor request path)
      let joinState: "member" | "in-other-guild" | "requested" | "joinable" | "guest";
      if (!me) {
        joinState = "guest";
      } else if (mine) {
        joinState = "member";
      } else {
        const otherMembership = await prisma.guildMember.findUnique({ where: { userId: me } });
        if (otherMembership) {
          joinState = "in-other-guild";
        } else {
          const pending = await prisma.guildJoinRequest.findUnique({
            where: { guildId_userId: { guildId: guild.id, userId: me } },
          });
          joinState = pending && pending.status === "pending" ? "requested" : "joinable";
        }
      }

      return ok({
        guild: {
          id: guild.id,
          name: guild.name,
          tag: guild.tag,
          description: guild.description,
          crestKey: guild.crestKey,
          minTrophies: guild.minTrophies,
          joinPolicy: guild.joinPolicy,
          weeklyPoints: guild.weeklyPoints,
          createdAt: guild.createdAt,
          memberCount: guild.members.length,
        },
        roster: guild.members.map(memberRow),
        myRole: mine?.role ?? null,
        joinState,
      });
    },
  );
```

(`guildJoinRequest` unique key is `guildId_userId` — confirmed against the join route at `guilds.ts:301-305`. `memberUserSelect`, `memberRow`, `err`, `prisma` are already in scope in this file.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter server typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/guilds.ts
git commit -m "feat(api): make GET /guilds/:id public + add joinState"
```

---

## Task 3: Shared `PlayerLink` and `GuildLink` components

**Files:**
- Create: `apps/web/src/components/PlayerLink.tsx`
- Create: `apps/web/src/components/GuildLink.tsx`
- Modify: `apps/web/src/components/index.ts`

**Interfaces:**
- Produces:
  - `PlayerLink(props: { id: string; name: string; avatar: string; frame?: string; size?: number; subtitle?: React.ReactNode; nameStyle?: React.CSSProperties })` → renders Avatar + name, navigates to `/profile/{id}`.
  - `GuildLink(props: { id: string; name: string; tag?: string; crestKey?: string | null; size?: number })` → navigates to `/guilds/{id}`.

- [ ] **Step 1: Create `PlayerLink.tsx`**

Create `apps/web/src/components/PlayerLink.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "./Avatar";

/**
 * PlayerLink — avatar + name that navigates to a player's public profile
 * (/profile/:id). The single choke point for making players clickable across
 * lists. Passes `frame` (NOT frameId) through to Avatar.
 */
export function PlayerLink({
  id,
  name,
  avatar,
  frame,
  size = 40,
  subtitle,
  nameStyle,
}: {
  id: string;
  name: string;
  avatar: string;
  frame?: string;
  size?: number;
  subtitle?: ReactNode;
  nameStyle?: CSSProperties;
}) {
  const navigate = useNavigate();
  const go = () => navigate(`/profile/${id}`);
  return (
    <div
      onClick={go}
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minWidth: 0 }}
    >
      <Avatar src={avatar} size={size} frame={frame} onClick={go} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            font: "700 14px Inter",
            color: "#fff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            ...nameStyle,
          }}
        >
          {name}
        </div>
        {subtitle != null && <div style={{ marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

export default PlayerLink;
```

- [ ] **Step 2: Create `GuildLink.tsx`**

First check how a guild crest is rendered elsewhere (the guild list uses an `Emblem`/crest). Run:

Run: `git grep -nE "Emblem|crest|crestKey" apps/web/src/features/guilds/GuildsPage.tsx | head`
Expected: shows the crest rendering component/import used by GuildsPage (e.g. an `Emblem` component or an `<img>` from a crest asset resolver).

Create `apps/web/src/components/GuildLink.tsx`. Use the SAME crest rendering the guild list uses — if GuildsPage imports an `Emblem` component, import it here; otherwise render the crest via the same asset helper GuildsPage uses. Baseline version using a text-fallback crest box (replace the crest block with the project's `Emblem` if one exists, matching GuildsPage):

```tsx
import { useNavigate } from "react-router-dom";

/**
 * GuildLink — crest + guild name that navigates to a guild's public page
 * (/guilds/:id). Mirrors the crest rendering used in GuildsPage.
 */
export function GuildLink({
  id,
  name,
  tag,
  size = 36,
}: {
  id: string;
  name: string;
  tag?: string;
  crestKey?: string | null;
  size?: number;
}) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/guilds/${id}`)}
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minWidth: 0 }}
    >
      <div
        style={{
          width: size,
          height: size,
          flex: "none",
          borderRadius: 8,
          border: "1px solid rgba(232,184,75,.35)",
          background: "rgba(15,8,32,.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "800 13px Cinzel,serif",
          color: "var(--gold-lt)",
        }}
      >
        {(tag ?? name).slice(0, 2).toUpperCase()}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "700 14px Inter", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </div>
        {tag != null && <div style={{ font: "600 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{tag}</div>}
      </div>
    </div>
  );
}

export default GuildLink;
```

> Implementer note: if GuildsPage renders crests via a shared `Emblem` component or a `crestArt(crestKey)` helper, use THAT for the crest box instead of the initials fallback, and add `crestKey` to the rendered crest — keep the `crestKey?` prop in the signature either way so callers can pass it.

- [ ] **Step 3: Export both from the barrel**

In `apps/web/src/components/index.ts`, add:

```ts
export { PlayerLink } from "./PlayerLink";
export { GuildLink } from "./GuildLink";
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/PlayerLink.tsx apps/web/src/components/GuildLink.tsx apps/web/src/components/index.ts
git commit -m "feat(web): add shared PlayerLink + GuildLink components"
```

---

## Task 4: `AchievementsGrid` accepts a stats prop

**Files:**
- Modify: `apps/web/src/features/profile/AchievementsGrid.tsx`
- Modify: `apps/web/src/features/profile/ProfilePage.tsx` (pass `me` to the grid)

**Interfaces:**
- Produces: `AchievementsGrid(props: { stats: { wins: number; streak: number; trophies: number } })`.
- Consumes: nothing new.

- [ ] **Step 1: Change the grid to take a `stats` prop**

In `apps/web/src/features/profile/AchievementsGrid.tsx`:
1. Remove the `useAuthStore` import and the `const me = useAuthStore((s) => s.me);` line.
2. Change the achievement predicate type and the 4 entries from `(me) => me.X` to `(s) => s.X` where the parameter type is `{ wins: number; streak: number; trophies: number }`. Concretely, change the `Achievement` type's `unlocked` field to `unlocked: (s: { wins: number; streak: number; trophies: number }) => boolean;` and update the 4 entries to reference `s.wins`/`s.streak`/`s.trophies` (same thresholds: `s.wins >= 1`, `s.streak >= 5`, `s.trophies >= 1800`, `s.wins >= 50`).
3. Change the component signature and the guard/usage:

```tsx
export default function AchievementsGrid({ stats }: { stats: { wins: number; streak: number; trophies: number } }) {
  return (
    // ...unchanged wrapper...
    // and in the map: const unlocked = a.unlocked(stats);
  );
}
```

Remove the old `if (!me) return null;` guard (the parent only renders the grid when it has data).

- [ ] **Step 2: Pass `me` at the existing self call site**

In `apps/web/src/features/profile/ProfilePage.tsx`, find `<AchievementsGrid />` (line ~616) and change it to pass the self stats:

```tsx
<AchievementsGrid stats={{ wins: me.wins, streak: me.streak, trophies: me.trophies }} />
```

(`me` is guaranteed non-null in the self ProfilePage render path — it's already dereferenced throughout that component.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/profile/AchievementsGrid.tsx apps/web/src/features/profile/ProfilePage.tsx
git commit -m "refactor(web): AchievementsGrid takes a stats prop (reusable)"
```

---

## Task 5: `FriendButton` (state-aware)

**Files:**
- Create: `apps/web/src/features/profile/FriendButton.tsx`

**Interfaces:**
- Consumes: the `/api/users/:id` `relationship`/`requestId`/`isBot` fields (Task 1).
- Produces: `FriendButton(props: { userId: string; relationship: Relationship; requestId?: string; isBot: boolean; signedIn: boolean })` where `Relationship = "self"|"friends"|"request-sent"|"request-received"|"none"`.

- [ ] **Step 1: Create `FriendButton.tsx`**

Create `apps/web/src/features/profile/FriendButton.tsx`:

```tsx
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../../lib/api";

export type Relationship = "self" | "friends" | "request-sent" | "request-received" | "none";

/**
 * FriendButton — state-aware friend action on a public profile.
 *  self       → render nothing
 *  bot        → render nothing (bots have no accept path)
 *  friends    → "Friends ✓" (disabled)
 *  request-sent     → "Request Sent" (disabled)
 *  request-received → "Accept Request" → POST /friends/request/:requestId/accept
 *  none       → "Add Friend" → POST /friends/request { toUserId }
 *  signed out → "Add Friend" that routes to /login?next=<current path>
 */
export function FriendButton({
  userId,
  relationship,
  requestId,
  isBot,
  signedIn,
}: {
  userId: string;
  relationship: Relationship;
  requestId?: string;
  isBot: boolean;
  signedIn: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [rel, setRel] = useState<Relationship>(relationship);
  const [busy, setBusy] = useState(false);

  if (rel === "self" || isBot) return null;

  const base: React.CSSProperties = {
    padding: "10px 18px",
    borderRadius: 10,
    font: "700 13px Inter",
    cursor: "pointer",
    border: "1px solid var(--gold)",
  };

  if (!signedIn) {
    return (
      <button
        type="button"
        className="btn btn-gold"
        style={base}
        onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname)}`)}
      >
        Add Friend
      </button>
    );
  }

  if (rel === "friends") {
    return <button type="button" disabled style={{ ...base, opacity: 0.7, cursor: "default", background: "rgba(63,191,111,.15)", color: "#8ce0ad", borderColor: "rgba(63,191,111,.5)" }}>Friends ✓</button>;
  }
  if (rel === "request-sent") {
    return <button type="button" disabled style={{ ...base, opacity: 0.6, cursor: "default", background: "rgba(0,0,0,.3)", color: "var(--ink2)" }}>Request Sent</button>;
  }

  async function send() {
    setBusy(true);
    try {
      if (rel === "request-received" && requestId) {
        await api.post(`/api/friends/request/${requestId}/accept`, {});
        setRel("friends");
      } else {
        const res = await api.post<{ status: string }>("/api/friends/request", { toUserId: userId });
        setRel(res.status === "accepted" ? "friends" : "request-sent");
      }
    } catch {
      // leave state unchanged; the server enforces the real guards
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-gold" style={base} disabled={busy} onClick={send}>
      {rel === "request-received" ? "Accept Request" : "Add Friend"}
    </button>
  );
}

export default FriendButton;
```

(Verify `api.post`'s signature by glancing at `apps/web/src/lib/api.ts:57` — it is `api.post<T>(path, body)`; the accept call passes `{}` as the body.)

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/profile/FriendButton.tsx
git commit -m "feat(web): state-aware FriendButton for public profiles"
```

---

## Task 6: `PublicProfilePage` + `/profile/:id` route

**Files:**
- Create: `apps/web/src/features/profile/PublicProfilePage.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/users/:id` (Task 1 shape), `FriendButton` (Task 5), `AchievementsGrid` (Task 4), `GuildLink` (Task 3), and the existing `ReportPlayerModal`.

- [ ] **Step 1: Find ReportPlayerModal's import path + props**

Run: `git grep -nE "ReportPlayerModal" apps/web/src/features/friends/FriendsPage.tsx apps/web/src/features/messages/MessagesPage.tsx`
Expected: shows the import path and how it's mounted (e.g. `<ReportPlayerModal userId={...} open={...} onClose={...} />`). Use the SAME props shape in Step 2.

- [ ] **Step 2: Create `PublicProfilePage.tsx`**

Create `apps/web/src/features/profile/PublicProfilePage.tsx`. Fetch the user, redirect to `/profile` if it's you, render read-only sections + action row. Adjust the `ReportPlayerModal` import/props to match Step 1's finding.

```tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";
import { Avatar, GuildLink } from "../../components";
import AchievementsGrid from "./AchievementsGrid";
import { FriendButton, type Relationship } from "./FriendButton";

type PublicUser = {
  id: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  frameId: string | null;
  bio: string | null;
  trophies: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  tier: { key: string; label: string; sub: string; accent: string; img: string };
  guild: { id: string; name: string; tag: string } | null;
  isBot: boolean;
  relationship: Relationship;
  requestId?: string;
};

export function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setUser(null); setNotFound(false); setError(false);
    if (!id) return;
    api
      .get<{ user: PublicUser }>(`/api/users/${id}`)
      .then((res) => { if (alive) setUser(res.user); })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(true);
      });
    return () => { alive = false; };
  }, [id]);

  // Your own link → go to the editable self profile.
  if (me && id && me.id === id) return <Navigate to="/profile" replace />;

  const wrap: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: 26 };

  if (notFound) {
    return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center" }}>
      <h1 style={{ font: "800 22px Cinzel,serif", color: "var(--gold-lt)" }}>Player not found</h1>
      <p style={{ color: "var(--ink2)", marginTop: 8 }}>This player doesn't exist or has left the realm.</p>
      <button className="btn btn-gold" style={{ marginTop: 16, padding: "10px 18px" }} onClick={() => navigate("/leaderboard")}>Back to Leaderboard</button>
    </div></div>;
  }
  if (error) {
    return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center" }}>
      <p style={{ color: "var(--ink2)" }}>Couldn't load this profile.</p>
      <button className="btn btn-gold" style={{ marginTop: 12, padding: "10px 18px" }} onClick={() => { setError(false); setUser(null); navigate(0); }}>Retry</button>
    </div></div>;
  }
  if (!user) return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center", color: "var(--ink2)" }}>Loading…</div></div>;

  const total = user.wins + user.losses + user.draws;
  const winRate = total > 0 ? Math.round((user.wins / total) * 100) : 0;
  const stat = (label: string, value: string | number) => (
    <div className="frame" style={{ padding: 16, textAlign: "center" }}>
      <div style={{ font: "800 22px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{value}</div>
      <div style={{ font: "600 11px Inter", color: "var(--ink2)", marginTop: 3 }}>{label}</div>
    </div>
  );

  return (
    <div style={wrap}>
      {/* identity header */}
      <div className="frame" style={{ padding: 24, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Avatar src={user.avatarUrl ?? "champion"} size={84} frame={user.frameId ?? undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 26px Cinzel,serif", color: "#fff" }}>{user.displayName}</div>
          <div style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{user.tag}</div>
          <div style={{ font: "700 12px Inter", color: "var(--gold)", marginTop: 4 }}>{user.tier.label}</div>
          {user.guild && (
            <div style={{ marginTop: 8 }}>
              <GuildLink id={user.guild.id} name={user.guild.name} tag={user.guild.tag} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <FriendButton userId={user.id} relationship={user.relationship} requestId={user.requestId} isBot={user.isBot} signedIn={!!me && !me.isGuest} />
          {!user.isBot && me && !me.isGuest && me.id !== user.id && (
            <ReportButton userId={user.id} name={user.displayName} />
          )}
        </div>
      </div>

      {user.bio && (
        <div className="frame" style={{ padding: 20, marginTop: 16 }}>
          <div className="ptitle" style={{ textAlign: "left" }}>Bio</div>
          <p style={{ font: "400 14px/1.6 Inter", color: "var(--ink)", margin: 0 }}>{user.bio}</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 16 }}>
        {stat("Trophies", user.trophies.toLocaleString())}
        {stat("Wins", user.wins)}
        {stat("Losses", user.losses)}
        {stat("Win Rate", `${winRate}%`)}
      </div>

      <div style={{ marginTop: 16 }}>
        <AchievementsGrid stats={{ wins: user.wins, streak: user.streak, trophies: user.trophies }} />
      </div>
    </div>
  );
}

export default PublicProfilePage;
```

Add the `ReportButton` inline helper (below the component, same file). The modal's EXACT contract (verified): `import { ReportPlayerModal } from "../moderation/ReportPlayerModal";` with props `{ open: boolean; accusedId: string; context: string; onClose: () => void }` (from `FriendsPage.tsx:1179`). Add the import at the top of the file alongside the others, and write:

```tsx
function ReportButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(224,85,95,.5)", background: "rgba(224,85,95,.12)", color: "#ff9aa8", font: "700 13px Inter", cursor: "pointer" }} onClick={() => setOpen(true)}>
        Report
      </button>
      <ReportPlayerModal open={open} accusedId={userId} context="profile" onClose={() => setOpen(false)} />
    </>
  );
}
```

Update the header's `<ReportButton userId={user.id} name={user.displayName} />` usage to `<ReportButton userId={user.id} />` (name is unused). Step 1's git grep is now just a confirmation that this contract still holds.

- [ ] **Step 3: Add the `/profile/:id` route**

In `apps/web/src/App.tsx`:
1. Add the import near the other feature imports: `import { PublicProfilePage } from "./features/profile/PublicProfilePage";`
2. Inside the `<Route element={<AppLayout />}>` block, right after the existing `<Route path="/profile" element={<ProfilePage />} />`, add:

```tsx
          <Route path="/profile/:id" element={<PublicProfilePage />} />
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 5: Visual check**

Run `pnpm --filter web dev`. Navigate to `/profile/<some-user-id>` (grab a real id from `/leaderboard` network or DB). Confirm: read-only profile renders (identity, stats, bio if any, guild link, achievements), FriendButton shows the right label, Report opens the modal, `/profile/<your-own-id>` redirects to `/profile`, an unknown id shows "Player not found".

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/profile/PublicProfilePage.tsx apps/web/src/App.tsx
git commit -m "feat(web): public profile page at /profile/:id"
```

---

## Task 7: `GuildProfilePage` + `/guilds/:id` route

**Files:**
- Create: `apps/web/src/features/guilds/GuildProfilePage.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/guilds/:id` (Task 2 shape with `joinState`), `PlayerLink` (Task 3), `POST /api/guilds/:id/join`.

- [ ] **Step 1: Confirm the guild-detail response type + join call in GuildsPage**

Run: `git grep -nE "api\.(get|post)<|/api/guilds/|joinState|ApiGuildDetail|roster" apps/web/src/features/guilds/GuildsPage.tsx | head -20`
Expected: shows GuildsPage's existing `ApiGuildDetail` type, its `GET /api/guilds/:id` call, and its `POST /api/guilds/:id/join` call. Reuse the same request shape/response type names where practical.

- [ ] **Step 2: Create `GuildProfilePage.tsx`**

Create `apps/web/src/features/guilds/GuildProfilePage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";
import { PlayerLink } from "../../components";

type RosterMember = {
  role: string;
  weeklyContribution: number;
  user: { id: string; displayName: string; tag: string; avatarUrl: string | null; frameId: string | null; trophies: number; rankTier: string };
};
type GuildDetail = {
  guild: { id: string; name: string; tag: string; description: string | null; crestKey: string | null; minTrophies: number; joinPolicy: string; weeklyPoints: number; createdAt: string; memberCount: number };
  roster: RosterMember[];
  myRole: string | null;
  joinState: "member" | "in-other-guild" | "requested" | "joinable" | "guest";
};

export function GuildProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useAuthStore((s) => s.me);
  const [data, setData] = useState<GuildDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [joinState, setJoinState] = useState<GuildDetail["joinState"] | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null); setNotFound(false); setError(false); setJoinState(null);
    if (!id) return;
    api.get<GuildDetail>(`/api/guilds/${id}`)
      .then((res) => { if (alive) { setData(res); setJoinState(res.joinState); } })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(true);
      });
    return () => { alive = false; };
  }, [id]);

  const wrap: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: 26 };

  if (notFound) return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center" }}><h1 style={{ font: "800 22px Cinzel,serif", color: "var(--gold-lt)" }}>Guild not found</h1><button className="btn btn-gold" style={{ marginTop: 16, padding: "10px 18px" }} onClick={() => navigate("/guilds")}>Browse Guilds</button></div></div>;
  if (error) return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center", color: "var(--ink2)" }}>Couldn't load this guild. <button className="btn btn-gold" style={{ marginLeft: 10, padding: "8px 14px" }} onClick={() => navigate(0)}>Retry</button></div></div>;
  if (!data || !joinState) return <div style={wrap}><div className="frame" style={{ padding: 40, textAlign: "center", color: "var(--ink2)" }}>Loading…</div></div>;

  const g = data.guild;

  async function onJoin() {
    if (joinState === "guest") { navigate(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
    try {
      const res = await api.post<{ status: string }>(`/api/guilds/${g.id}/join`, {});
      setJoinState(res.status === "joined" ? "member" : "requested");
    } catch { /* server enforces the real guards; leave state */ }
  }

  const joinBtn = () => {
    switch (joinState) {
      case "guest": return <button className="btn btn-gold" style={jbtn} onClick={onJoin}>Sign in to Join</button>;
      case "member": return <button style={{ ...jbtn, opacity: 0.7, cursor: "default", background: "rgba(63,191,111,.15)", color: "#8ce0ad", border: "1px solid rgba(63,191,111,.5)" }} disabled>Member</button>;
      case "in-other-guild": return <button style={{ ...jbtn, opacity: 0.5, cursor: "default", background: "rgba(0,0,0,.3)", color: "var(--ink2)", border: "1px solid rgba(232,184,75,.2)" }} disabled>In another guild</button>;
      case "requested": return <button style={{ ...jbtn, opacity: 0.6, cursor: "default", background: "rgba(0,0,0,.3)", color: "var(--ink2)", border: "1px solid rgba(232,184,75,.2)" }} disabled>Requested</button>;
      case "joinable": return <button className="btn btn-gold" style={jbtn} onClick={onJoin}>{g.joinPolicy === "open" ? "Join Guild" : "Request to Join"}</button>;
    }
  };

  return (
    <div style={wrap}>
      <div className="frame" style={{ padding: 24, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ width: 72, height: 72, flex: "none", borderRadius: 12, border: "1px solid rgba(232,184,75,.35)", background: "rgba(15,8,32,.6)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 22px Cinzel,serif", color: "var(--gold-lt)" }}>{g.tag.slice(0, 2).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 26px Cinzel,serif", color: "#fff" }}>{g.name}</div>
          <div style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{g.tag}</div>
          <div style={{ font: "600 12px Inter", color: "var(--ink2)", marginTop: 4 }}>{g.memberCount} members · {g.weeklyPoints.toLocaleString()} weekly pts · min {g.minTrophies} 🏆</div>
        </div>
        <div>{joinBtn()}</div>
      </div>

      {g.description && (
        <div className="frame" style={{ padding: 20, marginTop: 16 }}>
          <div className="ptitle" style={{ textAlign: "left" }}>About</div>
          <p style={{ font: "400 14px/1.6 Inter", color: "var(--ink)", margin: 0 }}>{g.description}</p>
        </div>
      )}

      <div className="frame" style={{ padding: 20, marginTop: 16 }}>
        <div className="ptitle" style={{ textAlign: "left" }}>Roster ({data.roster.length})</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.roster.map((m) => (
            <div key={m.user.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <PlayerLink id={m.user.id} name={m.user.displayName} avatar={m.user.avatarUrl ?? "champion"} frame={m.user.frameId ?? undefined} subtitle={<span style={{ font: "600 11px Inter", color: "var(--ink2)" }}>{m.role}</span>} />
              <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>🏆 {m.user.trophies.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const jbtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, font: "700 13px Inter", cursor: "pointer", border: "1px solid var(--gold)" };

export default GuildProfilePage;
```

- [ ] **Step 3: Add the `/guilds/:id` route**

In `apps/web/src/App.tsx`:
1. Add import: `import { GuildProfilePage } from "./features/guilds/GuildProfilePage";`
2. Inside the `<Route element={<AppLayout />}>` block, right after `<Route path="/guilds" element={<GuildsPage />} />`, add:

```tsx
          <Route path="/guilds/:id" element={<GuildProfilePage />} />
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 5: Visual check**

Run `pnpm --filter web dev`. Navigate to `/guilds/<some-guild-id>`. Confirm: public guild renders (header, about, roster with clickable members), Join button reflects state (signed-out → "Sign in to Join"; not in a guild → Join/Request; already member → "Member"), unknown id → "Guild not found". Clicking a roster member navigates to that player's `/profile/:id`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/guilds/GuildProfilePage.tsx apps/web/src/App.tsx
git commit -m "feat(web): public guild page at /guilds/:id"
```

---

## Task 8: Wire the Leaderboard surfaces

**Files:**
- Modify: `apps/web/src/features/leaderboard/LeaderboardPage.tsx`

**Interfaces:**
- Consumes: `PlayerLink`, `GuildLink` (Task 3).

- [ ] **Step 1: Read the current avatar+name markup**

Run: `git grep -nE "Avatar|displayName|userId|Top Guilds|guild" apps/web/src/features/leaderboard/LeaderboardPage.tsx | head -30`
Expected: shows the podium (top 3), table rows, Live Climbers rail (players — each has `userId`), and Top Guilds rail (guilds — each has a guild `id`).

- [ ] **Step 2: Replace player avatar+name with `PlayerLink` in the table rows, podium, and Live Climbers**

Import at the top: `import { PlayerLink, GuildLink } from "../../components";`

For each player-rendering block (table row, podium entry, Live Climbers entry), replace the bespoke `<Avatar .../>` + name span pair with:

```tsx
<PlayerLink id={row.userId} name={row.displayName} avatar={row.avatarUrl ?? "champion"} frame={row.frameId ?? undefined} />
```

(Use the actual variable names in each block — `row`/`p`/`c` etc. Keep surrounding layout cells like rank number, rating, win-rate, streak unchanged; only the avatar+name cell becomes a `PlayerLink`. Do NOT make the whole `<tr>`/row a link — just the identity cell, so the rest of the row stays non-navigational.)

For the **Top Guilds** rail, replace each guild's crest+name with:

```tsx
<GuildLink id={guild.id} name={guild.name} tag={guild.tag} />
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 4: Visual check**

Run `pnpm --filter web dev`, open `/leaderboard`. Click a player in the table, podium, and Live Climbers → each opens `/profile/:id`. Click a Top Guild → opens `/guilds/:id`. Confirm frames/avatars still render.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/leaderboard/LeaderboardPage.tsx
git commit -m "feat(web): clickable players + guilds on the leaderboard"
```

---

## Task 9: Wire the Guild page surfaces

**Files:**
- Modify: `apps/web/src/features/guilds/GuildsPage.tsx`

**Interfaces:**
- Consumes: `PlayerLink`, `GuildLink` (Task 3).

- [ ] **Step 1: Read the roster + discover markup**

Run: `git grep -nE "Avatar|displayName|Discover|roster|guild\.|crest" apps/web/src/features/guilds/GuildsPage.tsx | head -30`
Expected: shows the roster member rows (each `m.user` has `id`, `displayName`, `avatarUrl`, `frameId`) and the Discover-guild cards (each card has the guild `id`).

- [ ] **Step 2: Wire roster members → `PlayerLink`, Discover cards → `GuildLink`**

Import: `import { PlayerLink, GuildLink } from "../../components";`

- In the roster member row, replace the member avatar+name with:
```tsx
<PlayerLink id={m.user.id} name={m.user.displayName} avatar={m.user.avatarUrl ?? "champion"} frame={m.user.frameId ?? undefined} />
```
Keep the officer "⋯ manage member" button as-is (separate control).

- In each Discover-guild card, wrap the crest+name (NOT the Join button) so it navigates. Either replace the crest+name with `<GuildLink id={card.id} name={card.name} tag={card.tag} />`, or add an `onClick={() => navigate(\`/guilds/${card.id}\`)}` to the crest+name element. Keep the existing Join/Request button working as its own action (stopPropagation if needed so clicking Join doesn't also navigate).

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 4: Visual check**

Run `pnpm --filter web dev`, open `/guilds`. In your guild roster, click a member → `/profile/:id`. In Discover, click a guild card (not the Join button) → `/guilds/:id`; clicking Join still requests/joins without navigating.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/guilds/GuildsPage.tsx
git commit -m "feat(web): clickable roster members + discover guild cards"
```

---

## Task 10: Friends page → real profile pages; remove the modal

**Files:**
- Modify: `apps/web/src/features/friends/FriendsPage.tsx`

**Interfaces:**
- Consumes: `/profile/:id` route (Task 6).

- [ ] **Step 1: Point row clicks at the route**

Add `import { useNavigate } from "react-router-dom";` (if not already imported) and `const navigate = useNavigate();` in the component. The friend / incoming-request / suggested rows currently call `setProfileId(f.id)` (open modal). Change those `onClick`/`onOpen` handlers to `() => navigate(\`/profile/${f.id}\`)` (use the correct id variable per row: friend `f.id`, incoming request `r.user.id`, suggested `u.id`).

- [ ] **Step 2: Remove the profile modal and its state**

Delete the in-page profile modal JSX block (`FriendsPage.tsx:936-1176`), the `profileId` state (`const [profileId, setProfileId] = useState<string | null>(null);`), the effect that fetches `GET /api/users/:id` for the modal (`:323` region), and any now-unused `PublicProfile` type / helpers used ONLY by that modal. The **Report** action that lived in this modal is intentionally NOT re-added here — it now lives on `PublicProfilePage` (Task 6). Verify no remaining reference to `profileId` / `setProfileId` / the deleted modal remains.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS (this will surface any stranded reference to the removed state — fix by deleting the dead code).

- [ ] **Step 4: Visual check**

Run `pnpm --filter web dev`, open `/friends`. Click a friend, an incoming request, and a suggested player → each navigates to `/profile/:id` (no modal). Accept/decline and Add-by-tag still work.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/friends/FriendsPage.tsx
git commit -m "feat(web): friends rows open /profile/:id; remove redundant modal"
```

---

## Task 11: Full-feature verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + lint everything touched**

Run: `pnpm --filter server typecheck && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: all PASS.

- [ ] **Step 2: End-to-end manual sweep**

Run `pnpm --filter web dev` and verify against the spec's Testing section:
- Clicking a player on leaderboard / guild roster / friends opens `/profile/:id` with correct public data.
- FriendButton: correct label per relationship (none/sent/received/friends), hidden for self and bots; Add → Request Sent; Accept → Friends ✓.
- Report button present on a stranger's profile and opens ReportPlayerModal; hidden on self/bot.
- `/profile/<your-id>` redirects to `/profile`; unknown id → "Player not found".
- Guild: clicking a guild opens `/guilds/:id`; Join reflects joinState; own guild unaffected; roster members clickable; unknown id → "Guild not found".
- Signed-out: profile + guild pages load; friend/join route to `/login?next=…`.

- [ ] **Step 3: Confirm no stray references to the removed modal**

Run: `git grep -nE "setProfileId|profileId" apps/web/src/features/friends/FriendsPage.tsx`
Expected: no output (all removed).

- [ ] **Step 4: Final commit (only if verification produced fixes)**

If any step surfaced a fix, commit it by explicit path. Otherwise nothing to do.

---

## Self-Review Notes

- **Spec coverage:** §1 relationship/isBot → Task 1; §2 guild public+joinState → Task 2; §4 PlayerLink/GuildLink → Task 3; §5 PublicProfilePage + AchievementsGrid prop → Tasks 4,6; §6 FriendButton → Task 5; §6a Report → Task 6; §7 GuildProfilePage → Task 7; §8 wiring → Tasks 8,9,10. No favoriteFaction (cut, per spec). Testing → Task 11.
- **No test harness:** gates are typecheck/lint/visual, stated per task.
- **Type consistency:** `Relationship` union defined in Task 5 (`FriendButton`) and reused in Task 6 (`PublicProfilePage`); `joinState` union identical in Task 2 (server) and Task 7 (client); `PlayerLink`/`GuildLink` prop names consistent across Tasks 3,6,7,8,9.
- **Adaptation points flagged for implementer** (Step where "run git grep … then adapt"): crest rendering in GuildLink (Task 3), ReportPlayerModal import/props (Task 6), GuildsPage crest/Join markup (Task 9). These require reading the real markup rather than a guess — the plan tells the implementer exactly what to look for.
