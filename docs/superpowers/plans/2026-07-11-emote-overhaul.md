# Emote Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make in-match emotes rich (many free emoji + quick-chat phrases), fix the signup bug so new users start with a full emote loadout, unify the duplicated in-match chat into one shared component, and show the emote bar only in multiplayer modes.

**Architecture:** Server: expand the EMOTE seed with ~12 free items; add `equippedEmotes` to `publicUser()`; make `grantDefaults` populate `equippedEmotes` + wire it into the OAuth signup path; add a `MATCH_PHRASES` constant to `@dama/shared`; a one-off ownership+equip backfill script. Web: expose `priceGold` on the cosmetics catalog so the in-match bar can show all free emotes; build one shared `MatchChat` component (reactions row = all free emotes + equipped paid; phrases row = MATCH_PHRASES; optional text input); wire it into online/private-room/Damath-room; remove the stub emote UI from VS-AI/local/spectate.

**Tech Stack:** Fastify + Prisma + vitest (server), React 18 + Zustand + inline styles (web), pnpm workspace, TypeScript.

## Global Constraints

- **Verification gates:** `pnpm --filter server typecheck` (+ `pnpm --filter server test` where a test is added) for server; `pnpm --filter web typecheck && pnpm --filter web lint` for web; plus stated visual checks. Server HAS a vitest suite (`apps/server/test/*.test.ts`); web has NO test runner.
- **Emotes are emoji GLYPHS** stored in `previewKey` as `"emote:<glyph>"` — no art. `assetKey` is required but not rendered for EMOTE; a placeholder is fine.
- **In-match reactions row shows ALL FREE emotes** (`priceGold === 0`) from the catalog, plus any equipped paid emotes — NOT just the 6 equipped. Every user owns all free emotes by default (grantDefaults + backfill), so "free" ≈ "owned" without a per-user inventory fetch in the match path.
- **Equip limit stays 6** (`users.ts:188`) — governs the loadout concept elsewhere, not the in-match bar.
- **Backfill never clobbers a non-empty `equippedEmotes`** (even a single paid emote). Grants InventoryItem ownership + sets equipped only when empty.
- **Commit by EXPLICIT PATH** every task — the working tree has unrelated uncommitted changes AND another session is active; never `git add -A`.
- Branch: `feat/admin-fidelity-pass` (commit directly).

---

## File Structure

- `apps/server/prisma/seed.ts` — **modify.** Add ~12 free EMOTE items.
- `packages/shared/src/constants.ts` — **modify.** Add `MATCH_PHRASES`.
- `apps/server/src/auth/service.ts` — **modify.** Add `equippedEmotes` to `publicUser()`; make `grantDefaults` set `equippedEmotes` (+ `orderBy`); export `grantDefaults`.
- `apps/server/src/auth/oauth.ts` — **modify.** Call `grantDefaults` on fresh OAuth user create.
- `apps/server/test/emote-defaults.test.ts` — **create.** Assert grantDefaults populates equippedEmotes + inventory.
- `apps/server/scripts/backfill-emote-loadout.mjs` — **create.** Ownership + empty-loadout equip backfill.
- `apps/web/src/stores/cosmeticsStore.ts` — **modify.** Add `priceGold` to catalog items + a `freeEmoteGlyphs()` selector.
- `apps/web/src/features/play/MatchChat.tsx` — **create.** Shared in-match emote/chat component.
- `apps/web/src/features/play/OnlineMatchPage.tsx` — **modify.** Use MatchChat; gate off spectators.
- `apps/web/src/features/play/GamePage.tsx` — **modify.** Remove the emote/chat stub.
- `apps/web/src/features/rooms/PrivateRoomPage.tsx` — **modify.** Use MatchChat.
- `apps/web/src/features/damath/DamathRoomPage.tsx` — **modify.** Use MatchChat.

---

## Task 1: Add `MATCH_PHRASES` to shared constants

**Files:**
- Modify: `packages/shared/src/constants.ts`

**Interfaces:**
- Produces: `export const MATCH_PHRASES: readonly string[]`.

- [ ] **Step 1: Add the constant**

At the end of `packages/shared/src/constants.ts`, add:

```ts
/** Quick-chat phrases available to every player in a match (free, sent as text). */
export const MATCH_PHRASES = [
  "Good game!",
  "Nice move!",
  "Let's go!",
  "Well played",
  "Good luck",
  "Oops",
  "Close one",
  "Rematch?",
] as const;
```

- [ ] **Step 2: Build shared + typecheck**

Run: `pnpm --filter @dama/shared build && pnpm --filter server typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants.ts
git commit -m "feat(shared): add MATCH_PHRASES quick-chat constant"
```

---

## Task 2: Expand the free EMOTE seed

**Files:**
- Modify: `apps/server/prisma/seed.ts`

**Interfaces:**
- Produces: 11 new free EMOTE store items (`priceGold: 0`) in the seed `items` array.

- [ ] **Step 1: Add the free emote items**

In `apps/server/prisma/seed.ts`, find the `// ── Emotes ──` section (just before the `victory` item, ~line 88). Immediately BEFORE the `victory` line, insert these 11 free emote items (the existing `emote-resolve` 💪 at ~line 26 stays; total free = 12):

```ts
  { id: "emote-wave", type: "EMOTE", name: "Wave", assetKey: "emote", previewKey: "emote:👋", priceGold: 0, sortOrder: 40 },
  { id: "emote-laugh", type: "EMOTE", name: "Laugh", assetKey: "emote", previewKey: "emote:😄", priceGold: 0, sortOrder: 41 },
  { id: "emote-wow", type: "EMOTE", name: "Wow", assetKey: "emote", previewKey: "emote:😮", priceGold: 0, sortOrder: 42 },
  { id: "emote-cry", type: "EMOTE", name: "Cry", assetKey: "emote", previewKey: "emote:😢", priceGold: 0, sortOrder: 43 },
  { id: "emote-thumbsup", type: "EMOTE", name: "Thumbs Up", assetKey: "emote", previewKey: "emote:👍", priceGold: 0, sortOrder: 44 },
  { id: "emote-fire", type: "EMOTE", name: "Fire", assetKey: "emote", previewKey: "emote:🔥", priceGold: 0, sortOrder: 45 },
  { id: "emote-cool", type: "EMOTE", name: "Cool", assetKey: "emote", previewKey: "emote:😎", priceGold: 0, sortOrder: 46 },
  { id: "emote-handshake", type: "EMOTE", name: "Good Game", assetKey: "emote", previewKey: "emote:🤝", priceGold: 0, sortOrder: 47 },
  { id: "emote-salute", type: "EMOTE", name: "Salute", assetKey: "emote", previewKey: "emote:🫡", priceGold: 0, sortOrder: 48 },
  { id: "emote-clap", type: "EMOTE", name: "Clap", assetKey: "emote", previewKey: "emote:👏", priceGold: 0, sortOrder: 49 },
  { id: "emote-pray", type: "EMOTE", name: "Respect", assetKey: "emote", previewKey: "emote:🙏", priceGold: 0, sortOrder: 50 },
```

(`StoreItem` has no unique constraint on name/sortOrder — only `id` — so these are safe. `assetKey: "emote"` is a non-rendered placeholder, consistent with `emote-resolve`'s pattern.)

- [ ] **Step 2: Typecheck the seed**

Run: `pnpm --filter server typecheck`
Expected: PASS (the `items` array is typed; a shape mismatch would error here).

- [ ] **Step 3: Commit**

```bash
git add apps/server/prisma/seed.ts
git commit -m "feat(seed): add 11 free starter emotes"
```

---

## Task 3: Fix `publicUser` + `grantDefaults` + OAuth defaults

This is the correctness core. Three edits across two files: (a) `publicUser()` returns `equippedEmotes`; (b) `grantDefaults` populates `equippedEmotes` (capped at 6, ordered) and is exported; (c) OAuth signup calls it.

**Files:**
- Modify: `apps/server/src/auth/service.ts`
- Modify: `apps/server/src/auth/oauth.ts`

**Interfaces:**
- Produces: `publicUser()` result includes `equippedEmotes: string[]`; `export async function grantDefaults(...)`; OAuth-created users get defaults.

- [ ] **Step 1: Add `equippedEmotes` to `publicUser()`**

In `apps/server/src/auth/service.ts`, in the `publicUser(u: User)` return object (~lines 11-36), add after the `equippedSkin` line:

```ts
    equippedEmotes: u.equippedEmotes,
```

- [ ] **Step 2: `grantDefaults` — order the query + collect & write equipped emotes + export**

In `apps/server/src/auth/service.ts`, change the function signature line from `async function grantDefaults(` to `export async function grantDefaults(`.

Change the `defaults` query (~lines 56-58) to add ordering:

```ts
  const defaults = await prisma.storeItem.findMany({
    where: { active: true, priceGold: 0, priceDiamonds: null },
    orderBy: { sortOrder: "asc" },
  });
```

Add an emote-id accumulator. After the existing `let equippedAvatar: string | undefined;` line, add:

```ts
  const freeEmoteIds: string[] = [];
```

Inside the `for (const item of defaults)` loop, after the existing `if (isDefaultAvatar) equippedAvatar = item.id;` line, add:

```ts
    if (item.type === "EMOTE") freeEmoteIds.push(item.id);
```

Then change the final persist block. Replace:

```ts
  if (equippedBoard || equippedSkin || equippedAvatar) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(equippedBoard ? { equippedBoard } : {}),
        ...(equippedSkin ? { equippedSkin } : {}),
        // avatarUrl stores the bare avatar key (see AvatarPickerModal.avatarValue).
        ...(equippedAvatar ? { avatarUrl: equippedAvatar } : {}),
      },
    });
  }
```

with:

```ts
  const equippedEmotes = freeEmoteIds.slice(0, 6); // default loadout, respects the 6-slot cap
  if (equippedBoard || equippedSkin || equippedAvatar || equippedEmotes.length) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(equippedBoard ? { equippedBoard } : {}),
        ...(equippedSkin ? { equippedSkin } : {}),
        // avatarUrl stores the bare avatar key (see AvatarPickerModal.avatarValue).
        ...(equippedAvatar ? { avatarUrl: equippedAvatar } : {}),
        ...(equippedEmotes.length ? { equippedEmotes } : {}),
      },
    });
  }
```

- [ ] **Step 3: Call `grantDefaults` on OAuth fresh-user create**

In `apps/server/src/auth/oauth.ts`, `findOrCreateOAuthUser` — the branch-3 create (~lines 151-162) ends with `return user;`. Change:

```ts
  const user = await prisma.user.create({
    data: {
      email: profile.email?.toLowerCase() ?? null,
      emailVerified: profile.email ? new Date() : null, // OAuth email is provider-verified
      username,
      displayName: profile.name ?? username,
      tag: await uniqueTag(),
      avatarUrl: profile.avatar ?? null,
      oauthAccounts: { create: { provider: p, providerId: profile.providerId } },
    },
  });
  return user;
```

to:

```ts
  const user = await prisma.user.create({
    data: {
      email: profile.email?.toLowerCase() ?? null,
      emailVerified: profile.email ? new Date() : null, // OAuth email is provider-verified
      username,
      displayName: profile.name ?? username,
      tag: await uniqueTag(),
      avatarUrl: profile.avatar ?? null,
      oauthAccounts: { create: { provider: p, providerId: profile.providerId } },
    },
  });
  // Grant free starter cosmetics (board/skin/avatars/emotes) — email signup does
  // this via register(); OAuth fresh signups must too, or they get nothing.
  await grantDefaults(prisma, user.id);
  return user;
```

Add the import at the top of `oauth.ts` (check the existing import from `./service.js` and add `grantDefaults`; if there's no such import, add one):

```ts
import { grantDefaults } from "./service.js";
```

(Note: if `avatarUrl: profile.avatar` is set from OAuth, `grantDefaults` may also set `avatarUrl` to the default avatar key — that's fine/pre-existing behavior; grantDefaults only overwrites when it has a default avatar and the earlier explicit set is a URL. Do not special-case this; match register()'s behavior.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter server typecheck`
Expected: PASS. (If `grantDefaults` import path differs, fix to match how `oauth.ts` imports other `service` helpers.)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/auth/service.ts apps/server/src/auth/oauth.ts
git commit -m "fix(auth): expose equippedEmotes + grant default emote loadout (incl OAuth)"
```

---

## Task 4: Test — grantDefaults populates the emote loadout

**Files:**
- Create: `apps/server/test/emote-defaults.test.ts`

**Interfaces:**
- Consumes: `grantDefaults` (Task 3), the test DB harness the other server tests use.

- [ ] **Step 1: Read an existing server test to copy the harness**

Run: `sed -n '1,40p' apps/server/test/admin-config.test.ts`
Expected: shows how tests import the app/prisma, set up a user, and the vitest structure (`describe`/`it`/`expect`, `beforeAll`/`afterAll`). MIRROR this exact setup (DB client import, cleanup) in the new test.

- [ ] **Step 2: Write the test**

Create `apps/server/test/emote-defaults.test.ts`. Adapt the imports/harness to match Step 1's file (the exact prisma import path and any test bootstrap). The assertion body:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "../src/db/client.js";
import { grantDefaults } from "../src/auth/service.js";

describe("grantDefaults emote loadout", () => {
  it("equips up to 6 free emotes and grants EMOTE inventory rows", async () => {
    // Arrange: a bare user with no cosmetics.
    const user = await prisma.user.create({
      data: { username: `t_${Date.now()}`, tag: `#T${Date.now() % 9000}`, displayName: "T" },
    });

    // Act
    await grantDefaults(prisma, user.id);

    // Assert: equippedEmotes populated, capped at 6, all free EMOTE ids.
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.equippedEmotes.length).toBeGreaterThan(0);
    expect(after.equippedEmotes.length).toBeLessThanOrEqual(6);

    const freeEmotes = await prisma.storeItem.findMany({
      where: { type: "EMOTE", priceGold: 0, priceDiamonds: null, active: true },
      select: { id: true },
    });
    const freeIds = new Set(freeEmotes.map((e) => e.id));
    for (const id of after.equippedEmotes) expect(freeIds.has(id)).toBe(true);

    // Inventory ownership for every free emote.
    const owned = await prisma.inventoryItem.findMany({
      where: { userId: user.id, itemId: { in: [...freeIds] } },
      select: { itemId: true },
    });
    expect(owned.length).toBe(freeIds.size);

    // Cleanup
    await prisma.inventoryItem.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter server test -- emote-defaults`
Expected: PASS. (Requires the test DB the other server tests use — the harness in Step 1 handles it. If the test DB needs seeding of store items, seed it the way the existing tests do, or assert against whatever free emotes exist.)

- [ ] **Step 4: Commit**

```bash
git add apps/server/test/emote-defaults.test.ts
git commit -m "test(auth): grantDefaults populates emote loadout + ownership"
```

---

## Task 5: Backfill script (ownership + empty-loadout equip)

**Files:**
- Create: `apps/server/scripts/backfill-emote-loadout.mjs`

**Interfaces:**
- Standalone script; run against prod via the Railway public DB URL, dry-run first.

- [ ] **Step 1: Write the script**

Create `apps/server/scripts/backfill-emote-loadout.mjs` (mirror the safety pattern of the existing `apps/server/scripts/backfill-bot-ranked-trophies.mjs` — dry-run default, `--confirm` to apply, prints DB host):

```js
/**
 * backfill-emote-loadout.mjs — give existing users the free emote set.
 *
 * For each non-bot, non-deleted user:
 *   • upsert an InventoryItem for every free EMOTE they don't own (so store shows OWNED)
 *   • if their equippedEmotes is EMPTY, set it to the first 6 free emote ids (by sortOrder)
 *   • NEVER touch a non-empty equippedEmotes (don't clobber an intentional loadout)
 *
 * SAFE: dry-run by default; pass --confirm to apply. Idempotent.
 * Run against prod:  railway-public DATABASE_URL in env, from apps/server:
 *   node scripts/backfill-emote-loadout.mjs            # dry run
 *   node scripts/backfill-emote-loadout.mjs --confirm  # apply
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  console.log(`DB host: ${(process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] ?? "unknown"} | ${CONFIRM ? "APPLY" : "DRY RUN"}`);
  const freeEmotes = await prisma.storeItem.findMany({
    where: { type: "EMOTE", priceGold: 0, priceDiamonds: null, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const freeIds = freeEmotes.map((e) => e.id);
  const defaultLoadout = freeIds.slice(0, 6);
  console.log(`Free emotes: ${freeIds.length}; default loadout: ${defaultLoadout.length}`);

  const users = await prisma.user.findMany({
    where: { isBot: false, deletedAt: null },
    select: { id: true, username: true, equippedEmotes: true },
  });

  let grantedOwnership = 0, equipped = 0, skippedLoadout = 0;
  for (const u of users) {
    const owned = await prisma.inventoryItem.findMany({
      where: { userId: u.id, itemId: { in: freeIds } },
      select: { itemId: true },
    });
    const ownedSet = new Set(owned.map((o) => o.itemId));
    const missing = freeIds.filter((id) => !ownedSet.has(id));
    if (missing.length) {
      grantedOwnership++;
      if (CONFIRM) {
        for (const itemId of missing) {
          await prisma.inventoryItem.upsert({
            where: { userId_itemId: { userId: u.id, itemId } },
            update: {},
            create: { userId: u.id, itemId, equipped: false },
          });
        }
      }
    }
    if (u.equippedEmotes.length === 0) {
      equipped++;
      if (CONFIRM) {
        await prisma.user.update({ where: { id: u.id }, data: { equippedEmotes: defaultLoadout } });
      }
    } else {
      skippedLoadout++;
    }
  }
  console.log(`Users: ${users.length}`);
  console.log(`  would grant ownership to: ${grantedOwnership}`);
  console.log(`  would set default loadout on (empty): ${equipped}`);
  console.log(`  left untouched (non-empty loadout): ${skippedLoadout}`);
  if (!CONFIRM) console.log("DRY RUN — re-run with --confirm to apply.");
  else console.log("DONE.");
}
main().catch((e) => { console.error("ERR", e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Dry-run locally (safe — local DB has bots only, proves it runs)**

Run: `cd apps/server && node -r dotenv/config scripts/backfill-emote-loadout.mjs`
Expected: prints DB host + counts, "DRY RUN". No error. (Do NOT apply here — the controller runs the prod apply separately after seeding prod with the new emotes.)

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/backfill-emote-loadout.mjs
git commit -m "feat(scripts): backfill free emote ownership + default loadout"
```

---

## Task 6: Cosmetics catalog exposes `priceGold` + a free-emote selector

The in-match bar must show ALL free emotes without a per-user inventory fetch. The client catalog currently omits `priceGold`. Add it, plus a selector returning free emote glyphs.

**Files:**
- Modify: `apps/web/src/stores/cosmeticsStore.ts`

**Interfaces:**
- Produces: `CatalogItem.priceGold?: number | null`; `useCosmeticsStore().freeEmoteGlyphs(): string[]` returning glyphs of all free (`priceGold === 0`) EMOTE items.

- [ ] **Step 1: Confirm the store loads priceGold from the API**

Run: `git grep -nE "priceGold|/api/store/items|CatalogItem|byId\[" apps/web/src/stores/cosmeticsStore.ts`
Expected: shows the `load()` fetch of `/api/store/items` and how items map into `byId`. Confirm the API response includes `priceGold` (it does — store items carry it). If the load maps only specific fields, include `priceGold` and `type` in the mapped `CatalogItem`.

- [ ] **Step 2: Add `priceGold` to `CatalogItem` and a `freeEmoteGlyphs` selector**

In `apps/web/src/stores/cosmeticsStore.ts`:

Change the `CatalogItem` type to include price + ensure type is present:

```ts
type CatalogItem = {
  id: string;
  type: string;
  assetKey: string;
  previewKey: string | null;
  priceGold: number | null;
};
```

In `load()`, where items are mapped into `byId`, make sure `priceGold` is carried through (the `/api/store/items` payload includes it). If `byId[it.id] = it` stores the raw item, confirm the raw item has `priceGold`; otherwise map it explicitly.

Add to the `CosmeticsState` interface:

```ts
  /** glyphs of ALL free (priceGold 0) EMOTE items — the in-match reactions row. */
  freeEmoteGlyphs: () => string[];
```

Add the implementation in the store object (next to `emoteGlyph`):

```ts
  freeEmoteGlyphs: () => {
    const items = Object.values(get().byId);
    return items
      .filter((it) => it.type === "EMOTE" && it.priceGold === 0 && it.previewKey?.startsWith("emote:"))
      .map((it) => it.previewKey!.slice("emote:".length));
  },
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/stores/cosmeticsStore.ts
git commit -m "feat(web): cosmetics catalog exposes priceGold + freeEmoteGlyphs"
```

---

## Task 7: Shared `MatchChat` component

**Files:**
- Create: `apps/web/src/features/play/MatchChat.tsx`

**Interfaces:**
- Consumes: `MATCH_PHRASES` (`@dama/shared`), `freeEmoteGlyphs` (Task 6).
- Produces: `export type MatchChatMsg`; `export function MatchChat(props)`.

- [ ] **Step 1: Create the component**

Create `apps/web/src/features/play/MatchChat.tsx`:

```tsx
import { useRef, useEffect, useState } from "react";
import { MATCH_PHRASES } from "@dama/shared";
import { useCosmeticsStore } from "../../stores/cosmeticsStore";

/** Normalized in-match message the shared display renders. Each caller maps its
 *  own store's message type to this before passing it in. */
export type MatchChatMsg = {
  id: string;
  mine: boolean;
  emote: string | null;
  body: string | null;
  at: number;
};

const FALLBACK_EMOTES = ["👋", "😄", "😮", "😢", "👍", "🔥"];

/**
 * MatchChat — the shared in-match emote + quick-chat surface, used by online
 * matches and private/Damath rooms. Two tap rows (all free emotes + phrases) and
 * an optional free-text input. Transport is injected via `send`; the caller owns
 * the socket and maps its message feed to MatchChatMsg[].
 */
export function MatchChat({
  send,
  messages,
  showTextInput = false,
  disabled = false,
}: {
  send: (p: { emote?: string; body?: string }) => void;
  messages: MatchChatMsg[];
  showTextInput?: boolean;
  disabled?: boolean;
}) {
  const freeEmoteGlyphs = useCosmeticsStore((s) => s.freeEmoteGlyphs);
  const emotes = (() => {
    const free = freeEmoteGlyphs();
    return free.length ? free : FALLBACK_EMOTES;
  })();

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const tap: React.CSSProperties = {
    padding: "6px 9px",
    borderRadius: 8,
    border: "1px solid rgba(232,184,75,.25)",
    background: "rgba(15,8,32,.6)",
    cursor: disabled ? "default" : "pointer",
    fontSize: 18,
    lineHeight: 1,
    opacity: disabled ? 0.5 : 1,
  };
  const phraseTap: React.CSSProperties = { ...tap, fontSize: 12, font: "700 12px Inter", color: "var(--ink)" };

  function sendText() {
    const t = draft.trim();
    if (!t || disabled) return;
    send({ body: t });
    setDraft("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* message feed */}
      <div ref={scrollRef} style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "80%", padding: "6px 10px", borderRadius: 10, background: m.mine ? "rgba(232,184,75,.16)" : "rgba(255,255,255,.06)" }}>
            {m.emote ? <span style={{ fontSize: 22 }}>{m.emote}</span> : <span style={{ font: "500 13px Inter", color: "#fff" }}>{m.body}</span>}
          </div>
        ))}
      </div>

      {/* reactions row — all free emotes */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {emotes.map((g) => (
          <button key={g} type="button" style={tap} disabled={disabled} onClick={() => !disabled && send({ emote: g })}>{g}</button>
        ))}
      </div>

      {/* phrases row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {MATCH_PHRASES.map((p) => (
          <button key={p} type="button" style={phraseTap} disabled={disabled} onClick={() => !disabled && send({ body: p })}>{p}</button>
        ))}
      </div>

      {showTextInput && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendText(); }}
            maxLength={200}
            placeholder="Say something…"
            disabled={disabled}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "#fff", font: "500 13px Inter" }}
          />
          <button type="button" className="btn btn-gold" style={{ padding: "8px 14px" }} disabled={disabled} onClick={sendText}>Send</button>
        </div>
      )}
    </div>
  );
}

export default MatchChat;
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/play/MatchChat.tsx
git commit -m "feat(web): shared in-match MatchChat (emotes + phrases + text)"
```

---

## Task 8: Wire MatchChat into OnlineMatchPage (+ spectator gate)

**Files:**
- Modify: `apps/web/src/features/play/OnlineMatchPage.tsx`

**Interfaces:**
- Consumes: `MatchChat`, `MatchChatMsg` (Task 7); the online store's `chat` (`ChatMsg[]`), `sendChat`/`sendEmote`, `myColor`.

- [ ] **Step 1: Read the current chat panel + surrounding state**

Run: `sed -n '200,260p;540,632p' apps/web/src/features/play/OnlineMatchPage.tsx`
Expected: shows `sendChat()` local fn, `chatDraft` state, `GAME_EMOTES`, `emoteTray`, and the Quick-Chat JSX (~545-629) with the emote tray + text box, plus how `chat`/`sendMatchChat`/`sendEmote`/`myColor` are destructured (~84-88).

- [ ] **Step 2: Replace the Quick-Chat panel with MatchChat**

Add imports at the top:

```tsx
import { MatchChat, type MatchChatMsg } from "./MatchChat";
```

Remove the now-unused `GAME_EMOTES` const (line 17), the `emoteGlyph`/`equippedEmotes`/`emoteTray` derivation (~78-80), the local `sendChat()` function (~222) and `chatDraft` state (~212) — anything only the old panel used. (Typecheck will flag stragglers.)

Map the store `chat` (`ChatMsg[]`) to `MatchChatMsg[]` and render MatchChat in place of the old Quick-Chat JSX block. Where the old panel was:

```tsx
{myColor !== null && (
  <MatchChat
    showTextInput
    messages={chat.map((m): MatchChatMsg => ({ id: m.id, mine: m.mine, emote: m.emote, body: m.body, at: m.at }))}
    send={(p) => { if (p.emote) sendEmote(p.emote); else if (p.body) sendMatchChat(p.body); }}
  />
)}
```

(The `myColor !== null` guard hides the bar for spectators — they can't send anyway per `match.ts:585`. `sendMatchChat` is the destructured store `sendChat` alias at ~88; `sendEmote` is already destructured.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS (fix any stranded reference the removal surfaced).

- [ ] **Step 4: Visual check**

Run `pnpm --filter web dev`, note the port. Confirm the file compiles/serves (curl the port). (Full click-through is the controller's Task 12 sweep.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/play/OnlineMatchPage.tsx
git commit -m "feat(web): OnlineMatchPage uses shared MatchChat; hide for spectators"
```

---

## Task 9: Remove the emote/chat stub from GamePage (VS-AI + local)

**Files:**
- Modify: `apps/web/src/features/play/GamePage.tsx`

**Interfaces:**
- None produced. Removes dead UI.

- [ ] **Step 1: Read the chat stub**

Run: `sed -n '28,34p;80,84p;146,158p;535,585p' apps/web/src/features/play/GamePage.tsx`
Expected: shows `GAME_EMOTES` (~32), the `emoteTray` derivation (~82-83), the `sendChat` toast stub (~150-155), and the Quick-Chat JSX panel (~539-581).

- [ ] **Step 2: Delete the Quick-Chat panel + its stubs**

Remove: the Quick-Chat JSX panel (the whole `<div>` block ~539-581), the `sendChat` stub function (~150-155), the `GAME_EMOTES` const (~32), and the `emoteTray`/`emoteGlyph`/`equippedEmotes` derivation (~82-83) — everything only that panel used. Do NOT remove `showToast` if it's used elsewhere in the file (grep first).

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS (typecheck surfaces any stranded reference — remove it).

- [ ] **Step 4: Confirm no stray refs**

Run: `git grep -nE "GAME_EMOTES|emoteTray|sendChat" apps/web/src/features/play/GamePage.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/play/GamePage.tsx
git commit -m "refactor(web): remove non-functional emote/chat stub from VS-AI/local"
```

---

## Task 10: Wire MatchChat into PrivateRoomPage

**Files:**
- Modify: `apps/web/src/features/rooms/PrivateRoomPage.tsx`

**Interfaces:**
- Consumes: `MatchChat`, `MatchChatMsg` (Task 7); room store `chat` (`RoomChatMsg[]`), `sendChat`.

- [ ] **Step 1: Read the RoomChat panel + EMOTES**

Run: `sed -n '70,74p;944,960p;1016,1130p' apps/web/src/features/rooms/PrivateRoomPage.tsx`
Expected: shows the hardcoded `EMOTES` (line 72), the `RoomChat` component, its `sendChat` usage, `onEmote`, and how it renders the incoming `chat` feed (`RoomChatMsg[]`).

- [ ] **Step 2: Replace RoomChat's emote list + feed with MatchChat**

Add import:

```tsx
import { MatchChat, type MatchChatMsg } from "../play/MatchChat";
```

Remove the hardcoded `const EMOTES = [...]` (line 72). In the `RoomChat` panel, replace the emote-tray + message-list markup with MatchChat. The room channel is text-only (`sendChat(text)`), so map every pick to a single text send, and map the room feed (`RoomChatMsg[]`, `body`-only, needs a `mine` derivation from `from` vs the current user id) to `MatchChatMsg[]`:

```tsx
<MatchChat
  showTextInput
  messages={chat.map((m): MatchChatMsg => ({ id: m.id, mine: m.from.userId === me, emote: null, body: m.body, at: m.at }))}
  send={(p) => sendChat(p.emote ?? p.body ?? "")}
/>
```

(VERIFIED: the page marks own lines with `m.from.userId === me` where `me = useAuthStore((s) => s.me)` is the user id — see `PrivateRoomPage.tsx:1078`. Use that exact expression. Room messages are always `body`, so `emote: null` — emoji arrive as text, matching current behavior.)

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/rooms/PrivateRoomPage.tsx
git commit -m "feat(web): PrivateRoom uses shared MatchChat"
```

---

## Task 11: Wire MatchChat into DamathRoomPage

**Files:**
- Modify: `apps/web/src/features/damath/DamathRoomPage.tsx`

**Interfaces:**
- Consumes: `MatchChat`, `MatchChatMsg` (Task 7); the Damath room's chat feed + send.

- [ ] **Step 1: Read the Damath room chat + EMOTES**

Run: `git grep -nE "EMOTES|sendChat|chat|RoomChat|onEmote|meId|from\.id" apps/web/src/features/damath/DamathRoomPage.tsx | head -20`
Expected: shows the hardcoded `EMOTES` (line 20) and the room chat panel — confirm whether it reuses the same room store/`sendChat` shape as PrivateRoomPage (it should, being the Damath variant).

- [ ] **Step 2: Replace with MatchChat**

Mirror Task 10 exactly for this file: add the `MatchChat` import (`from "../play/MatchChat"`), remove the hardcoded `EMOTES` (line 20), and replace the emote tray + feed with `<MatchChat showTextInput messages={...} send={(p) => sendChat(p.emote ?? p.body ?? "")} />`, mapping the Damath room's chat feed to `MatchChatMsg[]` with the same `mine` derivation. Use the ACTUAL variable names in this file (its chat feed / send fn / me-id may be named slightly differently — read them in Step 1).

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/damath/DamathRoomPage.tsx
git commit -m "feat(web): DamathRoom uses shared MatchChat"
```

---

## Task 12: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full gates**

Run: `pnpm --filter @dama/shared build && pnpm --filter server typecheck && pnpm --filter server test && pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build`
Expected: all PASS (server test includes the new emote-defaults test).

- [ ] **Step 2: Confirm no stray old emote lists remain**

Run: `git grep -nE "GAME_EMOTES|const EMOTES = \[" apps/web/src`
Expected: no output (all four duplicates removed).

- [ ] **Step 3: Visual sweep**

Run `pnpm --filter web dev`. Verify against the spec Testing section:
- Emote bar appears + sends in online match (as a player), private room, Damath room.
- Emote bar ABSENT in VS-AI, local pass-and-play, and for online spectators.
- Reactions row shows the full free-emote set (not just 6); phrases row present; text input on online.

- [ ] **Step 4: Final commit (only if a fix was needed)**

If a step surfaced a fix, commit by explicit path. Otherwise nothing to do.

---

## Deferred to controller (post-implementation, not a task)

- **Seed prod + run the backfill:** after merge/deploy, the controller re-seeds prod (so the 12 free emotes exist) and runs `backfill-emote-loadout.mjs --confirm` against the prod public DB URL (dry-run first), so existing users get ownership + a default loadout. This is a prod data op, done by the controller like the earlier trophy backfill — NOT an implementer task.

## Self-Review Notes

- **Spec coverage:** §1 catalog → Tasks 1,2; §2 publicUser/grantDefaults/OAuth/backfill → Tasks 3,4,5; §3 MatchChat (+priceGold selector) → Tasks 6,7; §4 per-mode wiring (online+spectator gate, VS-AI removal, private+Damath rooms) → Tasks 8,9,10,11; testing → Task 12. "Show all owned free emotes" resolved via the `freeEmoteGlyphs` selector (Task 6) since free≈owned by default.
- **No web tests:** web gates are typecheck/lint/build/visual; server gets one real vitest.
- **Type consistency:** `MatchChatMsg` defined in Task 7, consumed identically in Tasks 8/10/11; `freeEmoteGlyphs` defined Task 6, used Task 7; `MATCH_PHRASES` Task 1 → Task 7.
- **Adaptation points flagged** (Step-1 greps): grantDefaults import path (Task 3), test harness (Task 4), catalog load mapping (Task 6), each page's chat var names + me-id derivation (Tasks 8/10/11). These require reading real code, not guessing — the plan says exactly what to look for.
- **Git hygiene:** every task commits by explicit path (dirty tree + concurrent session).
