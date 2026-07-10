# Analytics Deep-Dive (admin console) — Design

**Date:** 2026-07-10
**Status:** Draft (design) — pending review → user sign-off → plan
**Context:** FilipinoDama Royal, admin console. The Overview page already computes a small set of
100%-real KPIs from the DB (`apps/server/src/modules/admin.ts:44-79`). Analytics is a **deeper,
read-only** version of that same idea: more real cross-sections (new-player buckets, mode/outcome
distributions, faucet/sink over a selectable window, top items by ownership, rank-tier
distribution, active-players trend, guild counts) — still **every number backed by a real query**.
No new models, no writes, no mutations.

> **Anti-fabrication is the whole point of this page.** The approved mockup's `secAnalytics`
> (`handoffv2/FilipinoDama Admin.dc.html:160-280`) is a **fabricated** design — DAU/WAU funnels,
> retention curves, weekly cohort grids, revenue-by-category. We have **no event-tracking /
> analytics pipeline** and **real-money is disabled** (gold-only), so those panels cannot be
> honestly filled. This spec **reuses the mockup's visual scaffolding** (the 4-up KPI tile grid,
> the two-column bar-chart cards, the mode-popularity bar list, the distribution grid) but
> **repurposes every panel to a metric we can actually compute**, and the page carries an explicit
> "What this page does NOT show (and why)" footer. See **§Explicitly NOT included**.

## Goal

Give ECONOMY+ admins an honest, single-screen deep-dive over the data we already store: player
growth, activity, match volume/mode/outcome mix, the gold economy (faucet vs sink) over a chosen
window, cosmetic ownership, rank-tier spread, and community/guild size. One `GET` endpoint returns
all of it for a selectable time window. Read-only; nothing here mutates state, so **no audit rows
and no player-facing surface**.

## Scope

**In:**
- One server route `GET /api/admin/analytics?window=7d|30d|90d` (`requireAdmin("ECONOMY")`),
  returning a bundle of real, computed metrics (shapes in §API).
- One admin page `apps/admin/src/pages/Analytics.tsx` rendering those metrics with the **existing
  Overview chart style** (CSS-bar charts using `--sans`/`--mono`/`--ink-*`/`--dim` tokens and the
  gold gradient — `Overview.tsx:50-95`), plus the window switcher.
- Wire `App.tsx`: replace the `/analytics` Phase-2 stub with the real page and drop its `P2` flag
  (`App.tsx:32,185`).
- Server integration tests (metric shapes over seeded data + RBAC), via the existing harness.

**Out (deferred / impossible without new infra):**
- Any per-event metric: DAU/WAU/MAU, session counts, funnels, retention cohorts, churn — **no
  event pipeline exists** (there is no events/sessions table beyond `Session`, which is auth
  refresh tokens, not activity events). See §Explicitly NOT included.
- Revenue analytics — **real-money is disabled** (gold-only economy; `DIAMOND_TOPUP_ENABLED=false`).
  `Payment`/`Order` rows are near-empty and legally not a revenue story; excluded.
- Platform/device split — we do not record client platform.
- Any new model, column, migration, or write. **Zero schema change.**
- Export/CSV, scheduled reports, drill-through to player lists (possible later; not this build).

## Data model

**None.** No migration. Every metric is a read over existing models: `User`, `Match`,
`LedgerEntry`, `StoreItem`, `InventoryItem`, `Guild`, `GuildMember`. (Schema refs:
`apps/server/prisma/schema.prisma` — `User:11`, `LedgerEntry:117`, `StoreItem:148`,
`InventoryItem:172`, `Match:218`, `Guild:344`, `GuildMember:364`.)

## API route — `GET /admin/analytics`

**Module:** new `apps/server/src/modules/admin-analytics.ts`, a Fastify plugin registered in
`apps/server/src/index.ts` alongside the other `admin-*` modules (add
`await app.register(adminAnalyticsRoutes, { prefix: "/api" });` next to line 113, and the import
next to `index.ts:28`). Routes are prefixed `/admin/...` → client calls `/api/admin/...` (matches
`admin.ts` + all `admin-*` modules).

**Route:** `GET /admin/analytics` · `preHandler: requireAdmin("ECONOMY")` · **read-only, no
`audit()`** (audit is for mutations with before/after; there is no state change here — noted
explicitly so a reviewer doesn't flag a "missing" audit call). SUPPORT/MODERATOR get 403 from
`requireAdmin`.

**Query:** `z.object({ window: z.enum(["7d","30d","90d"]).default("30d") }).parse(req.query)`.
Let `days = { "7d":7, "30d":30, "90d":90 }[window]`, `since = new Date(now - days*86_400_000)`.

**Response envelope:** `ok({...})` (the standard `ok()` from `lib/errors.js`). Fields:

### 1. `window` / `days`
Echo back `{ window, days }` so the client labels charts ("last 30 days") from the response, not a
guess.

### 2. KPI tiles — `kpis` (fills the mockup's 4-up tile grid, `secAnalytics:168-179`)
Object of real scalars, each computed for the selected window unless marked all-time:

| KPI | Value | Exact query |
|---|---|---|
| `totalPlayers` | all-time real accounts | `prisma.user.count({ where: { isBot:false, isGuest:false, deletedAt:null } })` (same predicate as `admin.ts:50`) |
| `newPlayers` | signups in window | `prisma.user.count({ where: { isBot:false, isGuest:false, deletedAt:null, createdAt:{ gte:since } } })` |
| `activePlayers` | seen in window | `prisma.user.count({ where: { isBot:false, deletedAt:null, lastSeenAt:{ gte:since } } })` (mirrors `admin.ts:51`) |
| `matchesInWindow` | matches started in window | `prisma.match.count({ where: { startedAt:{ gte:since } } })` |
| `matchesTotal` | all-time | `prisma.match.count()` |
| `goldFaucet` | GOLD credited in window | sum of positive `amount` (see §5) |
| `goldSink` | GOLD debited in window | sum of negative `amount` (see §5) |
| `guildsTotal` | all-time | `prisma.guild.count()` |

The client renders these into the 8-tile grid the mockup already has (`hint-placeholder-count="8"`).
No `trend`/`delta` fields are fabricated — the tile's `trend` slot is either omitted or shows the
window label (e.g. "in 30d"), NOT an invented ±%.

### 3. New players over time — `newPlayersPerDay: { day: string; count: number }[]`
Real signup buckets by UTC day across the window (the honest replacement for the mockup's
retention curve). Query the raw rows, bucket in JS exactly like `admin.ts:66-76`:
```ts
const rows = await prisma.user.findMany({
  where: { isBot:false, isGuest:false, deletedAt:null, createdAt:{ gte:since } },
  select: { createdAt: true },
});
// bucket by `${y}-${m}-${d}` UTC over `days` buckets, oldest→newest; label = short weekday for 7d,
// "M/D" for 30d/90d (client decides label format from `days`).
```
Returns one entry per day in the window (length === `days`), so the bar chart is dense.
> Perf note: for `90d`, this pulls up to N user rows (id-less, `select:{createdAt}` only). At this
> app's scale that's fine and matches the established `admin.ts` findMany-then-bucket pattern. If
> row counts ever grow large, swap to a `$queryRaw` `date_trunc('day', "createdAt")` GROUP BY — the
> response shape is unchanged. Documented so the reviewer sees the tradeoff was chosen, not missed.

### 4. Active-players trend — `activePerDay: { day: string; count: number }[]`
Honest proxy for "activity over time" using `lastSeenAt` (the only activity signal we store).
**This is a point-in-time snapshot, not a per-day-unique count** — labeled as such. For each day
`d` in the window, count players whose `lastSeenAt` falls in that UTC day:
```ts
const seen = await prisma.user.findMany({
  where: { isBot:false, deletedAt:null, lastSeenAt:{ gte:since } },
  select: { lastSeenAt: true },
});
// bucket by UTC day of lastSeenAt, same bucketing as §3.
```
> **Honesty caveat (documented in the payload as `activePerDayNote`):** `lastSeenAt` holds only the
> *latest* seen time per user, so a player active on many days lands in **one** bucket (their most
> recent). This under-counts earlier days and is NOT a DAU series. We surface it as "last-seen
> distribution" with that caveat in the card subtitle, rather than mislabel it "daily active
> users". This is the honest ceiling of what a single `lastSeenAt` column can answer.

### 5. Gold faucet vs sink — `gold: { faucet, sink, faucetPct, byReason: {...} }`
Straight from the ledger over the window (same technique as `admin.ts:57-63`, extended):
```ts
const goldRows = await prisma.ledgerEntry.findMany({
  where: { currency: "GOLD", createdAt: { gte: since } },
  select: { amount: true, reason: true },
});
let faucet = 0, sink = 0;
const byReason: Record<string, { faucet: number; sink: number }> = {};
for (const r of goldRows) {
  if (r.amount > 0) faucet += r.amount; else sink += -r.amount;
  const b = (byReason[r.reason] ??= { faucet: 0, sink: 0 });
  if (r.amount > 0) b.faucet += r.amount; else b.sink += -r.amount;
}
const faucetPct = faucet + sink > 0 ? Math.round((faucet / (faucet + sink)) * 100) : 50;
```
`byReason` is the honest replacement for the mockup's "revenue by category" panel: **gold flow
grouped by ledger `reason`** (e.g. `admin_grant`, `match_reward`, `quest_reward`, `daily_login`,
store-purchase reasons). The client renders the top reasons as horizontal bars (mockup's
`revCats` layout, `secAnalytics:239-254`) with faucet(green)/sink(red) amounts. To keep the payload
bounded, the server sorts `byReason` entries by `(faucet+sink)` desc and returns the **top 8**
plus an aggregated `{ reason: "other", ... }` remainder.

### 6. Matches by mode — `matchesByMode: { mode: MatchMode; count: number; pct: number }[]`
Real mode distribution over the window (mockup's "Matches by mode", `secAnalytics:257-268`):
```ts
const grp = await prisma.match.groupBy({
  by: ["mode"], where: { startedAt: { gte: since } }, _count: { _all: true },
});
```
Map each `MatchMode` (`AI|CASUAL|RANKED|PRIVATE|LOCAL`, `schema.prisma:210`) to a count; `pct` =
count / total-in-window (server computes pct so the client just renders). Modes with 0 in the
window are included with `count:0` so the list is stable.

### 7. Match outcomes — `matchOutcomes: { redWins, blueWins, draws, unfinished, total }`
Real outcome mix over the window from `Match.winner`/`endedAt` (`schema.prisma:227,233`). One
`groupBy` won't cleanly express "draw vs unfinished", so compute with counts:
```ts
const [total, redWins, blueWins, draws] = await Promise.all([
  prisma.match.count({ where: { startedAt: { gte: since } } }),
  prisma.match.count({ where: { startedAt: { gte: since }, winner: "red" } }),
  prisma.match.count({ where: { startedAt: { gte: since }, winner: "blue" } }),
  prisma.match.count({ where: { startedAt: { gte: since }, winner: "draw" } }),
]);
const unfinished = total - redWins - blueWins - draws; // no/other winner (abandoned/in-progress)
```
> `winner` is a free string (`"red"|"blue"|"draw"|null`), so `unfinished` is the honest catch-all
> (null or anything non-canonical). Rendered as a compact stat row (mockup's platform-split block,
> `secAnalytics:269-278`, repurposed to outcomes).

### 8. Rank-tier distribution — `rankTiers: { key, label, count, pct }[]`
Real spread of players across the 7 rank tiers (`packages/shared/src/ranks.ts:6-14`):
```ts
const grp = await prisma.user.groupBy({
  by: ["rankTier"], where: { isBot:false, isGuest:false, deletedAt:null }, _count: { _all: true },
});
```
Join against `RANK_TIERS` (import from `@filipinodama/shared` / `packages/shared`) to emit tiers in
canonical order (squire→alamat) with `label` and `accent`; tiers with 0 players show `count:0`.
All-time (rank tier is a durable player attribute, not windowed). Rendered as the mockup's
mode-bar layout (label + bar + count), one row per tier, using each tier's `accent` color.

### 9. Top store items by ownership — `topItems: { itemId, name, type, owners, pct }[]`
Real cosmetic-ownership leaderboard (honest replacement for anything "monetization"):
```ts
const grp = await prisma.inventoryItem.groupBy({
  by: ["itemId"], _count: { _all: true }, orderBy: { _count: { itemId: "desc" } }, take: 10,
});
// then fetch names/types: prisma.storeItem.findMany({ where: { id: { in: ids } },
//   select: { id:true, name:true, type:true } })
```
`owners` = distinct inventory rows per item (`InventoryItem` is `@@unique([userId,itemId])`
(`schema.prisma:181`), so one row === one owner). `pct` is computed server-side as
`owners / kpis.totalPlayers` — the same all-time `{ isBot:false, isGuest:false, deletedAt:null }`
player count already computed for the KPI tile (§2, around line 85), not a new field or query.
Falls under the same divide-by-zero guard as every other `pct` (§Error handling: return 0 when
`totalPlayers === 0`). All-time (ownership is durable). Rendered as a small table or bar list.

**Full response shape:**
```ts
ok({
  window, days,
  kpis: { totalPlayers, newPlayers, activePlayers, matchesInWindow, matchesTotal, goldFaucet, goldSink, guildsTotal },
  newPlayersPerDay: [{ day, count }],
  activePerDay: [{ day, count }], activePerDayNote: "last-seen snapshot, not DAU",
  gold: { faucet, sink, faucetPct, byReason: [{ reason, faucet, sink }] },
  matchesByMode: [{ mode, count, pct }],
  matchOutcomes: { redWins, blueWins, draws, unfinished, total },
  rankTiers: [{ key, label, accent, count, pct }],
  topItems: [{ itemId, name, type, owners, pct }],
})
```
All heavy queries run under one `Promise.all` where independent (KPIs, groupBys, ledger scan), as
`admin.ts:49-54` does, to keep the endpoint a single round-trip's worth of latency.

## Admin page — `apps/admin/src/pages/Analytics.tsx`

Matches the approved `secAnalytics` **fidelity** (the layout/spacing/card chrome) while every panel
shows a real metric. Uses **only** the approved admin tokens/classes already used by `Overview.tsx`
and `Economy.tsx` (`.acard`, `.card`, `.kpi`, `.panel`, `.tbl`, `--sans`, `--mono`, `--ink-2/3`,
`--dim`, `--green`, `--red`, `--amber`, the gold gradient `linear-gradient(180deg,#f0cf72,#c99a2e)`).

**Structure (top→bottom):**
1. **Window switcher** — three chips `7d / 30d / 90d` (top-right, mockup's `anRanges` row,
   `secAnalytics:162-166`). Selecting one refetches `GET /api/admin/analytics?window=`. Default
   `30d`. Reuse the `.abtn`/chip styling; active chip gets the gold accent.
2. **KPI grid** — `<div className="kpi" style={{gridTemplateColumns:"repeat(4,1fr)"}}>` with the 8
   `kpis` tiles (reusing the `Card` component pattern from `Overview.tsx:101-109`): Total players,
   New (window), Active (window), Matches (window), Matches (all-time), Gold faucet, Gold sink,
   Guilds. Subtitles carry the honest window label; **no fake trend arrows**.
3. **Two-column row** (`gridTemplateColumns:"1.6fr 1fr"`, matching `Overview.tsx:43`):
   - **New players per day** — gold-gradient bar chart, identical markup to Overview's "Matches per
     day" (`Overview.tsx:45-59`), fed by `newPlayersPerDay`. Subtitle = "last {days} days".
   - **Last-seen activity** — cyan-gradient bars (`linear-gradient(180deg,#5fd0e0,#2E8B9E)`, the
     mockup's retention color) fed by `activePerDay`, **subtitled with the caveat**: "players by
     last-seen day · snapshot, not unique DAU".
4. **Gold economy** card — reuse Overview's faucet/sink bar (`Overview.tsx:74-96`) driven by
   `gold.faucet/sink/faucetPct`, **plus** a `byReason` breakdown bar list below it (mockup's
   `revCats` layout) showing top reasons with green(faucet)/red(sink) amounts.
5. **Two-column row:**
   - **Matches by mode** — horizontal bar list (mockup's `modePop`, `secAnalytics:257-268`) from
     `matchesByMode`, each row `label · bar · pct`.
   - **Match outcomes** — compact stat block (Red wins / Blue wins / Draws / Unfinished) from
     `matchOutcomes`, mockup's platform-split layout repurposed.
6. **Rank-tier distribution** card — one bar per tier from `rankTiers`, colored by each tier's
   `accent`, label + count + pct.
7. **Top cosmetics by ownership** card — small `.tbl` (Item · Type · Owners · % of players) from
   `topItems`.
8. **Footer disclosure** — a `.dim` note block: *"This page shows only metrics computed directly
   from stored data. It intentionally omits DAU/WAU/MAU, acquisition funnels, retention cohorts,
   and revenue — those require an event-tracking pipeline we don't run, and real-money purchases are
   disabled (gold-only)."* (Mirrors the honest labeling already in `Overview.tsx:40` and the
   existing Phase-2 stub note at `App.tsx:185`.)

**Loading/empty/error:** same conventions as `Overview.tsx:28-29` — `err` → "Couldn't load
analytics."; `!data` → "Loading…"; a metric with 0 rows renders an empty bar/row (never a fake
value). Fetch via `api.get<AnalyticsData>("/api/admin/analytics?window="+window)`.

**Nav wiring (`App.tsx`):**
- Import `Analytics` (`import { Analytics } from "./pages/Analytics";`).
- Route: replace `<Route path="/analytics" element={<Phase2 .../>} />` (`App.tsx:185`) with
  `<Route path="/analytics" element={<Analytics />} />`.
- Drop the `P2` flag on the analytics NAV entry (`App.tsx:32`: remove the trailing `true`). Role
  gate stays `ECONOMY` (`NAV` already gates it; the server also enforces `requireAdmin("ECONOMY")`).
- Leave the eyebrow/title (`"Insights" / "Analytics deep-dive"`, `App.tsx:54`) as-is.

## Player-facing pieces

**None.** Analytics is admin-only and read-only.

## Explicitly NOT included (and why) — the honesty contract

| Excluded metric | Why it's excluded |
|---|---|
| DAU / WAU / MAU, daily-unique-active series | No event/activity log. `lastSeenAt` stores only the *latest* seen time per user — it cannot reconstruct per-day uniques. We ship the honest proxy (`activePerDay`, "last-seen snapshot") with a caveat, and the windowed `activePlayers` scalar. |
| Acquisition funnels (visit→signup→first-match→purchase) | No funnel/event instrumentation; page views and step transitions are not recorded anywhere. |
| Retention curves & weekly cohort grids | Require per-user per-day activity events over time; `lastSeenAt` (single timestamp) can't produce cohort retention. Fabricating them would violate the no-fabrication rule. |
| Churn / resurrection | Same — needs an activity-event history. |
| Revenue (₱), ARPU, ARPPU, revenue-by-category | Real-money top-up is **disabled** for legal compliance (gold-only economy). `Payment`/`Order` are dormant; there is no honest revenue story to show. |
| Platform / device / geo split | Client platform/device is not recorded; `countryCode` is optional self-reported profile, not analytics-grade. (Could add a country breakdown later if desired — flagged, not built.) |
| Session length / concurrency | No session-activity events (the `Session` model is auth refresh tokens, not activity sessions). |

The page's footer states this in plain language so admins understand the boundary — the same
posture Overview already takes (`Overview.tsx:40` "Revenue — needs analytics pipeline").

## Error handling

- Non-ECONOMY admin → 403 via `requireAdmin("ECONOMY")` (SUPPORT/MODERATOR blocked; unauth → 401).
- Bad `window` → zod default kicks in (`.default("30d")`); an out-of-enum value that's *present*
  fails zod → 400 via the app's standard error envelope (same as every other zod route).
- Empty DB / no rows → every metric returns zeros / empty arrays (never null-crashes): `faucetPct`
  defaults to 50 when faucet+sink === 0 (as `admin.ts:63`); `pct` computations guard divide-by-zero
  (return 0 when denominator is 0).
- No mutations → no transactional/rollback concerns; no `audit()` (documented above).

## Testing — server integration tests (via the existing harness)

New file `apps/server/test/admin-analytics.test.ts`, using `buildTestApp`/`seedUser`/`authFor`/
`truncateAll` (`apps/server/test/helpers.ts`) exactly like `admin-config.test.ts`. `afterEach`
truncates; `afterAll` disconnects. (Note: `helpers.ts:53-59` `truncateAll` currently truncates
`Report/AuditLog/Message/ChannelMember/Channel` + deletes `t_user_` users. This suite also creates
`Match`, `LedgerEntry`, and `InventoryItem` rows.

> **`LedgerEntry` cleanup must be unconditional, not cascade-dependent.** `LedgerEntry.userId` is a
> plain `@relation` with **no `onDelete: Cascade`** (`schema.prisma:119-120` → defaults to
> Restrict), so deleting a `t_user_` test user does **not** clear their ledger rows — and this
> suite's gold faucet/sink assertions (§ below) are **exact** numbers, so any leftover in-window
> `GOLD` row from another test breaks them. This suite's own `afterEach` therefore clears
> `LedgerEntry` (and any `Match` rows it seeds) **unconditionally**, not "only if survivors." This
> is coordinated across specs: the shared `truncateAll` in `helpers.ts` is being extended (by the
> reports-queue / economy specs) to include `LedgerEntry` and `Match` in its `TRUNCATE` list —
> Analytics relies on that shared truncate covering both tables, on top of its own explicit
> `afterEach` clear, so test isolation holds regardless of run order. `InventoryItem` does cascade
> from `User` (`schema.prisma:181` FK — confirm during impl) and needs no special handling.)

**RBAC:**
- SUPPORT token → `GET /api/admin/analytics` → **403**.
- MODERATOR token → **403**.
- ECONOMY token → **200** with the full envelope.
- Unauthenticated → **401**.
- The hardened `requireAdmin` (from the reports build) means a now-demoted admin whose token still
  claims ECONOMY is rejected — assert one such case (stale token via `authFor({adminRole:"ECONOMY"})`
  against a DB row seeded with `adminRole:"SUPPORT"`) → **403**.

**Metric shapes / correctness over seeded data:**
- **KPIs:** seed 3 real users (2 created inside the window, 1 older via a back-dated `createdAt`),
  1 bot, 1 guest → assert `kpis.totalPlayers === 3`, `kpis.newPlayers === 2` (window excludes the
  old one and the bot/guest).
- **newPlayersPerDay:** length === `days`; the two in-window signups land in the correct UTC-day
  buckets; sum of counts === `newPlayers`.
- **activePerDay / activePlayers:** seed users with `lastSeenAt` in/out of window → windowed
  `activePlayers` matches; `activePerDayNote` present.
- **gold faucet/sink + byReason:** insert `LedgerEntry` GOLD rows (e.g. `+100 admin_grant`,
  `+50 match_reward`, `-30 store_purchase`) within the window and one **outside** it → assert
  `gold.faucet === 150`, `gold.sink === 30`, `faucetPct === 83`, `byReason` groups correctly and
  excludes the out-of-window row. Insert a DIAMONDS row → assert it's **not** counted (GOLD-only).
- **matchesByMode:** seed matches across `AI/CASUAL/RANKED` (some in, one out of window) → counts +
  pct correct; a 0-count mode still appears.
- **matchOutcomes:** seed matches with `winner: "red"|"blue"|"draw"|null` → assert the four buckets
  + `unfinished` (the null) + `total` add up.
- **rankTiers:** seed users across ≥2 tiers → all 7 tiers present in canonical order; counts
  correct; 0-count tiers included; `accent` present.
- **topItems:** seed `InventoryItem` rows for 2 items with differing owner counts → ordered by
  `owners` desc; `owners` correct; `pct` = owners / `kpis.totalPlayers`; names/types resolved from
  `StoreItem`.
- **window param:** `?window=7d` vs `?window=90d` return different `days` and different bucket
  lengths; default (no param) === `30d`.
- **empty DB:** with only seed rows truncated away, the endpoint returns 200 with zeros/empty arrays
  and does not throw (divide-by-zero guards hold; `faucetPct === 50`).

Admin page has no test harness (no `"test"` script in `apps/admin`) → verified manually
(render each panel against seeded prod-like data; window switch refetches; footer disclosure shows).

## Files touched

**Server:**
- `apps/server/src/modules/admin-analytics.ts` — NEW: `GET /admin/analytics` (ECONOMY, read-only).
- `apps/server/src/index.ts` — import + `app.register(adminAnalyticsRoutes, { prefix: "/api" })`
  (next to `index.ts:113`).
- `apps/server/test/admin-analytics.test.ts` — NEW integration tests; `afterEach` unconditionally
  clears `LedgerEntry` and `Match` rows it seeded (no `onDelete: Cascade` from `User` on
  `LedgerEntry.userId` — see §Testing).
- `apps/server/test/helpers.ts` — extend shared `truncateAll` to include `"Match","LedgerEntry"` in
  the `TRUNCATE` list (coordinated across specs; Analytics' exact faucet/sink assertions depend on
  this).

**Admin:**
- `apps/admin/src/pages/Analytics.tsx` — NEW page.
- `apps/admin/src/App.tsx` — import `Analytics`; swap the `/analytics` Phase-2 route for the real
  page (`App.tsx:185`); drop the `P2` flag on the NAV entry (`App.tsx:32`).

**No** schema/migration, **no** web app, **no** player-facing changes.

## Migration & rollout

- **No migration** (read-only over existing tables; zero schema change → zero risk to live data).
- Ships as a normal server + admin deploy (Railway `prisma migrate deploy` runs but has nothing new
  to apply). No rollout coordination, no flags. The Overview page is unchanged.
- Deploy verification: `GET /api/admin/analytics` returns **401** unauthenticated (exists +
  guarded), **403** for SUPPORT, **200** with the metric bundle for an ECONOMY admin; the admin
  `/analytics` nav item loses its `P2` badge and renders the real page with real numbers.
